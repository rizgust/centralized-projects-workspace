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
		case <-watchT.C:
			if ns := s.workspaceSig(); ns != sig {
				sig = ns
				s.hub.publish("workspace", map[string]any{"changed": []string{"projects", "tasks", "active"}})
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
	return buildOffice(s.root, s.cfg(), s.runs.list(), s.usage.liveInteractive())
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
		return s.runs.start(s.cfg(), req)
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
	}{{"system", s.sys.snapshot()}, {"runs", s.runs.list()}, {"office", s.office()}} {
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
