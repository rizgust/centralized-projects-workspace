// Package dashboard serves the local Projects-Centralized dashboard: the
// embedded React UI, a JSON API over the workspace files, headless agent runs,
// token usage analytics from Claude Code transcripts, and system load.
// It listens on 127.0.0.1 only.
package dashboard

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rizgust/centralized-projects-workspace/internal/workspace"
	"github.com/rizgust/centralized-projects-workspace/web"
)

// errHandled tells the route wrapper the handler already wrote its response.
var errHandled = errors.New("handled")

type Options struct {
	Port int
	Dev  bool // allow the Vite dev server (localhost:5173) and expose /api/dev-token
}

type server struct {
	root  string
	opt   Options
	token string
	hub   *hub
	runs  *runner
	usage *usageIndex
	sys   *sysmon
	qs    *questionStore
	ds    *discussionStore

	mu         sync.Mutex
	lastOffice []byte
}

func (s *server) cfg() workspace.Config {
	c, err := workspace.Load(s.root)
	if err != nil {
		return workspace.Config{Projects: map[string]workspace.Project{}}
	}
	if c.Projects == nil {
		c.Projects = map[string]workspace.Project{}
	}
	return c
}

// Serve starts the dashboard and blocks until interrupted.
func Serve(root string, opt Options) error {
	tok := make([]byte, 24)
	if _, err := rand.Read(tok); err != nil {
		return err
	}
	s := &server{root: root, opt: opt, token: hex.EncodeToString(tok), hub: newHub()}
	s.runs = newRunner(root, s.runsChanged, func(id string, ev RunEvent) {
		s.hub.publish("run-event", map[string]any{"runId": id, "event": ev})
	})
	s.qs = newQuestionStore(root)
	s.ds = &discussionStore{root: root}
	s.runs.onFinish = func(run Run, final string) {
		if run.DiscussionID != nil {
			s.discussionReply(run, final)
			return
		}
		s.qs.autoQuestion(run, final)
		s.hub.publish("questions", s.qs.list())
	}
	s.usage = newUsageIndex(root, projectOfCwd(root, s.cfg), s.runs.runOfSession)
	s.sys = newSysmon(s.runs.pidRun)

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", opt.Port))
	if err != nil {
		return fmt.Errorf("listen on 127.0.0.1:%d: %w", opt.Port, err)
	}
	srv := &http.Server{Handler: s.guard(s.routes()), ReadHeaderTimeout: 10 * time.Second}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	go s.loops(ctx)
	go func() {
		<-ctx.Done()
		sctx, c := context.WithTimeout(context.Background(), 3*time.Second)
		defer c()
		_ = srv.Shutdown(sctx)
	}()

	fmt.Printf("dashboard: http://127.0.0.1:%d  (local only; Ctrl+C to stop)\n", opt.Port)
	if opt.Dev {
		fmt.Println("dev mode: Vite on http://localhost:5173 may proxy /api here")
	}
	go s.usage.scan()
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func (s *server) loops(ctx context.Context) {
	sysT := time.NewTicker(2 * time.Second)
	usageT := time.NewTicker(30 * time.Second)
	watchT := time.NewTicker(2 * time.Second)
	defer sysT.Stop()
	defer usageT.Stop()
	defer watchT.Stop()
	tick, sig := 0, s.workspaceSig()
	prayerT := time.NewTicker(10 * time.Second)
	defer prayerT.Stop()
	lastPrayer := ""
	s.sys.sample(true)
	for {
		select {
		case <-ctx.Done():
			return
		case <-sysT.C:
			tick++
			s.hub.publish("system", s.sys.sample(tick%3 == 0))
		case <-usageT.C:
			s.usage.scan()
			s.hub.publish("usage", map[string]any{"today": s.usage.report(1).Today})
			s.publishOffice() // interactive session count may change
		case <-prayerT.C:
			st := prayerStatus(loadPrayerConfig(s.root), time.Now())
			key := ""
			if st.Active != nil {
				key = st.Active.Name + st.Active.StartedAt
			}
			if key != lastPrayer {
				lastPrayer = key
				s.hub.publish("prayer", st)
			}
		case <-watchT.C:
			if ns := s.workspaceSig(); ns != sig {
				sig = ns
				s.hub.publish("workspace", map[string]any{"changed": []string{"projects", "tasks", "active", "questions"}})
				s.hub.publish("questions", s.qs.list())
				s.publishOffice()
			}
		}
	}
}

// workspaceSig fingerprints workspace files by path, size and mtime.
func (s *server) workspaceSig() string {
	var b strings.Builder
	add := func(p string) {
		if st, err := os.Stat(p); err == nil {
			fmt.Fprintf(&b, "%s|%d|%d;", p, st.Size(), st.ModTime().UnixNano())
		}
	}
	add(filepath.Join(s.root, "workspace.yaml"))
	add(filepath.Join(s.root, "active-project.yaml"))
	if df, err := filepath.Glob(filepath.Join(s.root, "discussions", "*.md")); err == nil {
		for _, f := range df {
			add(f)
		}
	}
	if qf, err := filepath.Glob(filepath.Join(s.qs.dir, "*.yaml")); err == nil {
		for _, f := range qf {
			add(f)
		}
	}
	_ = filepath.WalkDir(filepath.Join(s.root, "projects"), func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			add(p)
		}
		return nil
	})
	return b.String()
}

func (s *server) runsChanged() {
	s.hub.publish("runs", s.runs.list())
	s.publishOffice()
}

func (s *server) office() Office {
	o := buildOffice(s.root, s.cfg(), s.runs.list(), s.qs.open(), s.usage.liveInteractive())
	for _, d := range s.ds.list(s.discussionRunning) {
		updated, _ := time.Parse(time.RFC3339, d.UpdatedAt)
		if d.Status == "open" && (d.Running != nil || time.Since(updated) < 20*time.Minute) {
			o.Discussions = append(o.Discussions, ActiveDiscussion{ID: d.ID, Role: d.Role, Project: d.Project, Topic: d.Topic, Running: d.Running != nil})
		}
	}
	return o
}

// discussionRunning returns the run id of a discussion turn in progress.
func (s *server) discussionRunning(id string) *string {
	for _, r := range s.runs.list() {
		if r.Status == "running" && r.DiscussionID != nil && *r.DiscussionID == id {
			rid := r.ID
			return &rid
		}
	}
	return nil
}

// discussionTurn records the Owner's message and starts the role's reply as a
// plan-mode run on the discussion's Claude session.
func (s *server) discussionTurn(w http.ResponseWriter, id, text string, wrapup, override bool) (any, error) {
	if strings.TrimSpace(text) == "" {
		return nil, errors.New("message is required")
	}
	disc, err := s.ds.get(id)
	if err != nil {
		return nil, err
	}
	if disc.Status != "open" {
		return nil, errors.New("this discussion is closed; reopen it to continue")
	}
	if r := s.discussionRunning(id); r != nil {
		return nil, fmt.Errorf("%s is still answering (run %s)", roleName(disc.Role), *r)
	}
	pc := loadPrayerConfig(s.root)
	if st := prayerStatus(pc, time.Now()); st.Active != nil && pc.HoldLaunches && !override {
		end, _ := time.Parse(time.RFC3339, st.Active.EndsAt)
		writeErr(w, http.StatusLocked, fmt.Errorf("agents are at sholat %s until %s; retry with override", st.Active.Name, end.Format("15:04")))
		return nil, errHandled
	}
	req := RunRequest{
		Role: disc.Role, Prompt: text, PermissionMode: "plan", BudgetUSD: disc.BudgetUSD,
		discussionID: disc.ID, discussionTopic: disc.Topic, Model: disc.Model,
	}
	if disc.Project != nil {
		req.Project = *disc.Project
	}
	if disc.SessionID != nil {
		req.resumeSession = *disc.SessionID
	}
	run, err := s.runs.start(s.cfg(), req)
	if err != nil {
		return nil, err
	}
	updated, err := s.ds.update(id, func(d *Discussion) error {
		if d.SessionID == nil {
			sid := run.SessionID
			d.SessionID = &sid
		}
		rid := run.ID
		d.Turns = append(d.Turns, DiscussionTurn{Who: "owner", Role: "owner", At: time.Now().Format(time.RFC3339), Text: text, RunID: &rid, Wrapup: wrapup})
		return nil
	})
	if err != nil {
		return nil, err
	}
	updated.Running = &run.ID
	s.hub.publish("discussions", s.ds.list(s.discussionRunning))
	s.publishOffice()
	return map[string]any{"discussion": updated, "run": run}, nil
}

// discussionReply appends the role's answer when its run finishes.
func (s *server) discussionReply(run Run, final string) {
	text, isErr := strings.TrimSpace(final), false
	if text == "" || run.Status != "succeeded" {
		isErr = true
		reason := run.Status
		if run.Error != nil {
			reason = *run.Error
		}
		if text == "" {
			text = "(no reply: " + reason + ")"
		}
	}
	_, _ = s.ds.update(*run.DiscussionID, func(d *Discussion) error {
		wrapup := false
		for _, t := range d.Turns {
			if t.Who == "owner" && t.RunID != nil && *t.RunID == run.ID && t.Wrapup {
				wrapup = true
			}
		}
		rid := run.ID
		d.Turns = append(d.Turns, DiscussionTurn{Who: "agent", Role: run.Role, At: time.Now().Format(time.RFC3339), Text: text, RunID: &rid, Wrapup: wrapup, Error: isErr})
		if run.CostUSD != nil {
			d.CostUSD += *run.CostUSD
		}
		if wrapup && !isErr {
			d.WrappedUp = true
		}
		return nil
	})
	s.hub.publish("discussions", s.ds.list(s.discussionRunning))
	s.publishOffice()
}

func (s *server) publishOffice() {
	o := s.office()
	b, _ := json.Marshal(o)
	s.mu.Lock()
	changed := !bytes.Equal(b, s.lastOffice)
	s.lastOffice = b
	s.mu.Unlock()
	if changed {
		s.hub.publish("office", o)
	}
}

// guard enforces loopback-only access, a strict Host header (DNS rebinding),
// and the per-process token on every API call.
func (s *server) guard(next http.Handler) http.Handler {
	allowed := map[string]bool{
		fmt.Sprintf("127.0.0.1:%d", s.opt.Port): true,
		fmt.Sprintf("localhost:%d", s.opt.Port): true,
	}
	if s.opt.Dev {
		allowed["localhost:5173"], allowed["127.0.0.1:5173"] = true, true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if !allowed[strings.ToLower(r.Host)] {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if strings.HasPrefix(r.URL.Path, "/api/") && !(s.opt.Dev && r.URL.Path == "/api/dev-token") {
			got := r.Header.Get("X-PC-Token")
			if got == "" {
				got = r.URL.Query().Get("token")
			}
			if subtle.ConstantTimeCompare([]byte(got), []byte(s.token)) != 1 {
				writeErr(w, http.StatusUnauthorized, errors.New("missing or invalid token"))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func readJSON(r *http.Request, v any) error {
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		return errors.New("Content-Type must be application/json")
	}
	return json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v)
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	h := func(pattern string, fn func(w http.ResponseWriter, r *http.Request) (any, error)) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			v, err := fn(w, r)
			if errors.Is(err, errHandled) {
				return
			}
			if err != nil {
				code := http.StatusBadRequest
				if strings.Contains(err.Error(), "not found") || strings.HasPrefix(err.Error(), "unknown") {
					code = http.StatusNotFound
				}
				writeErr(w, code, err)
				return
			}
			writeJSON(w, v)
		})
	}

	h("GET /api/dev-token", func(w http.ResponseWriter, r *http.Request) (any, error) {
		if !s.opt.Dev {
			return nil, errors.New("not found")
		}
		return map[string]string{"token": s.token}, nil
	})
	h("GET /api/overview", func(w http.ResponseWriter, r *http.Request) (any, error) {
		cfg := s.cfg()
		projects := []workspace.ProjectSummary{}
		for _, id := range cfg.IDs() {
			if ps, err := cfg.Summary(s.root, id, false); err == nil {
				projects = append(projects, ps)
			}
		}
		var active *string
		if a := workspace.ActiveProject(s.root); a != "" {
			active = &a
		}
		return map[string]any{
			"workspace":     map[string]string{"name": "project-centralized", "root": s.root},
			"activeProject": active, "projects": projects,
			"runsActive": s.runs.activeCount(), "usageToday": s.usage.report(1).Today,
			"system": s.sys.snapshot(),
		}, nil
	})
	h("GET /api/projects", func(w http.ResponseWriter, r *http.Request) (any, error) {
		cfg := s.cfg()
		out := []workspace.ProjectSummary{}
		for _, id := range cfg.IDs() {
			ps, err := cfg.Summary(s.root, id, true)
			if err != nil {
				return nil, err
			}
			out = append(out, ps)
		}
		return out, nil
	})
	h("POST /api/projects", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var req struct {
			workspace.NewProject
			Clone bool `json:"clone"`
		}
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		if err := workspace.Register(s.root, req.NewProject); err != nil {
			return nil, err
		}
		cfg := s.cfg()
		if req.Clone && req.Remote != "" {
			one := workspace.Config{Projects: map[string]workspace.Project{req.ID: cfg.Projects[req.ID]}}
			var log bytes.Buffer
			if err := workspace.Init(s.root, one, workspace.InitOptions{}, &log); err != nil {
				return nil, fmt.Errorf("registered, but clone failed: %v: %s", err, truncate(log.String(), 500))
			}
		}
		s.publishOffice()
		return cfg.Summary(s.root, req.ID, true)
	})
	h("GET /api/projects/{id}", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.cfg().Detail(s.root, r.PathValue("id"))
	})
	h("POST /api/projects/{id}/activate", func(w http.ResponseWriter, r *http.Request) (any, error) {
		cfg := s.cfg()
		if err := cfg.SetActiveProject(s.root, r.PathValue("id")); err != nil {
			return nil, err
		}
		s.publishOffice()
		return cfg.Summary(s.root, r.PathValue("id"), true)
	})
	h("POST /api/projects/deactivate", func(w http.ResponseWriter, r *http.Request) (any, error) {
		if err := s.cfg().SetActiveProject(s.root, ""); err != nil {
			return nil, err
		}
		s.publishOffice()
		return map[string]bool{"ok": true}, nil
	})
	h("GET /api/projects/{id}/tasks", func(w http.ResponseWriter, r *http.Request) (any, error) {
		tasks, err := s.cfg().LoadTasks(s.root, r.PathValue("id"))
		if tasks == nil {
			tasks = []workspace.Task{}
		}
		return tasks, err
	})
	h("POST /api/projects/{id}/tasks", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var p workspace.TaskPatch
		if err := readJSON(r, &p); err != nil {
			return nil, err
		}
		t, err := s.cfg().CreateTask(s.root, r.PathValue("id"), p)
		if err == nil {
			s.publishOffice()
		}
		return t, err
	})
	h("PATCH /api/projects/{id}/tasks/{taskId}", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var p workspace.TaskPatch
		if err := readJSON(r, &p); err != nil {
			return nil, err
		}
		t, err := s.cfg().UpdateTask(s.root, r.PathValue("id"), r.PathValue("taskId"), p)
		if err == nil {
			s.publishOffice()
		}
		return t, err
	})
	h("GET /api/roles", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return workspace.Roles(s.root), nil
	})
	h("GET /api/office", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.office(), nil
	})
	h("GET /api/runs", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.runs.list(), nil
	})
	h("POST /api/runs", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var req RunRequest
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		pc := loadPrayerConfig(s.root)
		if st := prayerStatus(pc, time.Now()); st.Active != nil && pc.HoldLaunches && !req.Override {
			end, _ := time.Parse(time.RFC3339, st.Active.EndsAt)
			writeErr(w, http.StatusLocked, fmt.Errorf("launches are held for sholat %s until %s; retry with override to launch anyway",
				st.Active.Name, end.Format("15:04")))
			return nil, errHandled
		}
		return s.runs.start(s.cfg(), req)
	})
	h("GET /api/kinds", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return workspace.Kinds(s.root), nil
	})
	h("GET /api/discussions", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.ds.list(s.discussionRunning), nil
	})
	h("POST /api/discussions", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var req struct {
			Topic     string  `json:"topic"`
			Project   string  `json:"project"`
			Role      string  `json:"role"`
			BudgetUSD float64 `json:"budgetUsd"`
			Model     string  `json:"model"`
			Message   string  `json:"message"` // optional opening message
			Override  bool    `json:"override"`
		}
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		if req.Role == "" {
			req.Role = "analyst"
		}
		if !workspace.IsRole(req.Role) {
			return nil, fmt.Errorf("unknown role %q", req.Role)
		}
		if req.Project != "" {
			if _, ok := s.cfg().Projects[req.Project]; !ok {
				return nil, fmt.Errorf("unknown project %q", req.Project)
			}
		}
		if req.BudgetUSD == 0 {
			req.BudgetUSD = 1
		}
		if req.BudgetUSD < 0 || req.BudgetUSD > 20 {
			return nil, errors.New("budgetUsd per message must be between 0 and 20")
		}
		disc, err := s.ds.create(req.Topic, req.Project, req.Role, req.BudgetUSD, req.Model)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.Message) != "" {
			return s.discussionTurn(w, disc.ID, req.Message, false, req.Override)
		}
		s.hub.publish("discussions", s.ds.list(s.discussionRunning))
		return map[string]any{"discussion": disc, "run": nil}, nil
	})
	h("GET /api/discussions/{id}", func(w http.ResponseWriter, r *http.Request) (any, error) {
		disc, err := s.ds.get(r.PathValue("id"))
		if err != nil {
			return nil, err
		}
		disc.Running = s.discussionRunning(disc.ID)
		return disc, nil
	})
	h("POST /api/discussions/{id}/messages", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var req struct {
			Text     string `json:"text"`
			Override bool   `json:"override"`
		}
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		return s.discussionTurn(w, r.PathValue("id"), req.Text, false, req.Override)
	})
	h("POST /api/discussions/{id}/wrapup", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var req struct {
			Override bool `json:"override"`
		}
		_ = readJSON(r, &req)
		return s.discussionTurn(w, r.PathValue("id"), wrapupPrompt, true, req.Override)
	})
	for _, action := range []string{"close", "reopen"} {
		action := action
		h("POST /api/discussions/{id}/"+action, func(w http.ResponseWriter, r *http.Request) (any, error) {
			disc, err := s.ds.update(r.PathValue("id"), func(d *Discussion) error {
				if action == "close" {
					d.Status = "closed"
				} else {
					d.Status = "open"
				}
				return nil
			})
			if err == nil {
				s.hub.publish("discussions", s.ds.list(s.discussionRunning))
				s.publishOffice()
			}
			return disc, err
		})
	}
	h("GET /api/questions", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.qs.list(), nil
	})
	h("POST /api/questions/{id}/answer", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var req struct {
			Answer   string `json:"answer"`
			Resume   bool   `json:"resume"`
			Override bool   `json:"override"`
		}
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.Answer) == "" {
			return nil, errors.New("answer is required")
		}
		qu, err := s.qs.get(r.PathValue("id"))
		if err != nil {
			return nil, err
		}
		if qu.Status != "open" {
			return nil, fmt.Errorf("question %s is already %s", qu.ID, qu.Status)
		}
		now := time.Now().Format(time.RFC3339)
		qu.Status, qu.Answer, qu.AnsweredAt = "answered", &req.Answer, &now
		var resumed *Run
		if req.Resume {
			if qu.SessionID == nil || *qu.SessionID == "" {
				return nil, errors.New("this question has no session to resume; answer without resume")
			}
			pc := loadPrayerConfig(s.root)
			if st := prayerStatus(pc, time.Now()); st.Active != nil && pc.HoldLaunches && !req.Override {
				end, _ := time.Parse(time.RFC3339, st.Active.EndsAt)
				writeErr(w, http.StatusLocked, fmt.Errorf("launches are held for sholat %s until %s; retry with override", st.Active.Name, end.Format("15:04")))
				return nil, errHandled
			}
			mode, budget := "acceptEdits", 2.0
			var model *string
			parent := ""
			if qu.RunID != nil {
				if prev, ok := s.runs.get(*qu.RunID); ok {
					mode, budget, model, parent = prev.PermissionMode, prev.BudgetUSD, prev.Model, prev.ID
				}
			}
			run, err := s.runs.start(s.cfg(), RunRequest{
				Project: qu.Project, Role: qu.From, TaskID: qu.Task, PermissionMode: mode, BudgetUSD: budget, Model: model,
				Prompt:        "The Owner answered your question.\n\nQuestion: " + qu.Question + "\n\nAnswer: " + req.Answer + "\n\nContinue your work with this decision.",
				resumeSession: *qu.SessionID, parentRun: parent, questionID: qu.ID,
			})
			if err != nil {
				return nil, fmt.Errorf("answer not saved: could not resume the run: %w", err)
			}
			qu.ResumedRun = &run.ID
			resumed = &run
		}
		if err := s.qs.save(qu); err != nil {
			return nil, err
		}
		s.hub.publish("questions", s.qs.list())
		s.publishOffice()
		return map[string]any{"question": qu, "run": resumed}, nil
	})
	h("POST /api/questions/{id}/dismiss", func(w http.ResponseWriter, r *http.Request) (any, error) {
		qu, err := s.qs.get(r.PathValue("id"))
		if err != nil {
			return nil, err
		}
		qu.Status = "dismissed"
		if err := s.qs.save(qu); err != nil {
			return nil, err
		}
		s.hub.publish("questions", s.qs.list())
		s.publishOffice()
		return qu, nil
	})
	h("GET /api/prayer", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return prayerStatus(loadPrayerConfig(s.root), time.Now()), nil
	})
	h("POST /api/runs/{id}/stop", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.runs.stop(r.PathValue("id"))
	})
	h("GET /api/runs/{id}/events", func(w http.ResponseWriter, r *http.Request) (any, error) {
		after, _ := strconv.Atoi(r.URL.Query().Get("after"))
		evs, ok := s.runs.eventsAfter(r.PathValue("id"), after)
		if !ok {
			return nil, errors.New("run not found")
		}
		return evs, nil
	})
	h("GET /api/sessions", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.usage.sessions(time.Now().AddDate(0, 0, -7)), nil
	})
	h("GET /api/usage", func(w http.ResponseWriter, r *http.Request) (any, error) {
		days, _ := strconv.Atoi(r.URL.Query().Get("days"))
		if days < 1 || days > 365 {
			days = 30
		}
		return s.usage.report(days), nil
	})
	h("GET /api/system", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.sys.snapshot(), nil
	})
	h("GET /api/system/history", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return map[string]any{"points": s.sys.historyPoints()}, nil
	})
	mux.HandleFunc("GET /api/events", s.events)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, http.StatusNotFound, errors.New("not found"))
	})
	mux.Handle("/", s.static())
	return mux
}

func (s *server) events(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")
	ch := s.hub.subscribe()
	defer s.hub.unsubscribe(ch)
	// Initial state so a fresh tab renders immediately.
	for _, ev := range []struct {
		name string
		data any
	}{{"system", s.sys.snapshot()}, {"runs", s.runs.list()}, {"office", s.office()},
		{"prayer", prayerStatus(loadPrayerConfig(s.root), time.Now())}, {"questions", s.qs.list()},
		{"discussions", s.ds.list(s.discussionRunning)}} {
		b, _ := json.Marshal(ev.data)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.name, b)
	}
	fl.Flush()
	keep := time.NewTicker(20 * time.Second)
	defer keep.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case frame := <-ch:
			if _, err := w.Write(frame); err != nil {
				return
			}
			fl.Flush()
		case <-keep.C:
			fmt.Fprint(w, ": keep-alive\n\n")
			fl.Flush()
		}
	}
}

var tokenMetaRe = regexp.MustCompile(`<meta name="pc-token" content="[^"]*"\s*/?>`)

const notBuilt = `<!doctype html><meta charset="utf-8"><title>Dashboard</title>
<body style="font:16px system-ui;background:#111;color:#eee;padding:40px">
<h1>Dashboard UI is not built</h1>
<p>Run <code>bun install</code> and <code>bun run build</code> in <code>web/</code>, then rebuild pcctl.</p>`

func (s *server) static() http.Handler {
	dist, _ := fs.Sub(web.Dist, "dist")
	files := http.FileServer(http.FS(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p != "" && p != "index.html" {
			if st, err := fs.Stat(dist, p); err == nil && !st.IsDir() {
				if strings.HasPrefix(p, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				files.ServeHTTP(w, r)
				return
			}
		}
		// SPA fallback: index.html with the session token injected.
		b, err := fs.ReadFile(dist, "index.html")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
		w.Header().Set("X-Frame-Options", "DENY")
		if err != nil {
			_, _ = io.WriteString(w, notBuilt)
			return
		}
		// Fill the placeholder the UI ships with; add one if it is missing.
		filled := tokenMetaRe.ReplaceAll(b, []byte(`<meta name="pc-token" content="`+s.token+`" />`))
		if bytes.Equal(filled, b) {
			filled = bytes.Replace(b, []byte("</head>"), []byte(`<meta name="pc-token" content="`+s.token+`" /></head>`), 1)
		}
		_, _ = w.Write(filled)
	})
}
