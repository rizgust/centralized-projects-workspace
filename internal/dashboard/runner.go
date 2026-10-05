package dashboard

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rizgust/centralized-projects-workspace/internal/workspace"
)

type Run struct {
	ID             string   `json:"id"`
	Project        string   `json:"project"`
	Role           string   `json:"role"`
	TaskID         *string  `json:"taskId"`
	Prompt         string   `json:"prompt"`
	Status         string   `json:"status"`
	PermissionMode string   `json:"permissionMode"`
	BudgetUSD      float64  `json:"budgetUsd"`
	Model          *string  `json:"model"`
	StartedAt      string   `json:"startedAt"`
	EndedAt        *string  `json:"endedAt"`
	SessionID      string   `json:"sessionId"`
	PID            *int     `json:"pid"`
	CostUSD        *float64 `json:"costUsd"`
	Tokens         Tokens   `json:"tokens"`
	NumTurns       int      `json:"numTurns"`
	LastActivity   string   `json:"lastActivity"`
	LastText       string   `json:"lastText"`
	Error          *string  `json:"error"`
	Cwd            string   `json:"cwd"`
}

type RunEvent struct {
	Seq  int    `json:"seq"`
	TS   string `json:"ts"`
	Kind string `json:"kind"`
	Text string `json:"text"`
	Tool string `json:"tool,omitempty"`
}

type RunRequest struct {
	Project        string  `json:"project"`
	Role           string  `json:"role"`
	Prompt         string  `json:"prompt"`
	TaskID         *string `json:"taskId"`
	PermissionMode string  `json:"permissionMode"`
	BudgetUSD      float64 `json:"budgetUsd"`
	Model          *string `json:"model"`
}

const maxEventsInMemory = 3000

type runState struct {
	run    Run
	events []RunEvent
	cmd    *exec.Cmd
	seen   map[string]bool // assistant message ids already counted
}

type runner struct {
	root     string
	dir      string
	onChange func()
	onEvent  func(runID string, ev RunEvent)

	mu   sync.Mutex
	runs map[string]*runState
}

func newRunner(root string, onChange func(), onEvent func(string, RunEvent)) *runner {
	r := &runner{root: root, dir: filepath.Join(root, "runtime", "runs"), onChange: onChange, onEvent: onEvent, runs: map[string]*runState{}}
	_ = os.MkdirAll(r.dir, 0o755)
	r.load()
	return r
}

// load restores run history; runs still marked running did not survive the restart.
func (r *runner) load() {
	files, _ := filepath.Glob(filepath.Join(r.dir, "*.json"))
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var run Run
		if json.Unmarshal(b, &run) != nil || run.ID == "" {
			continue
		}
		st := &runState{run: run, seen: map[string]bool{}}
		if run.Status == "running" {
			if run.PID != nil {
				killTree(*run.PID)
			}
			now := time.Now().Format(time.RFC3339)
			msg := "interrupted: the dashboard was restarted while this run was active"
			st.run.Status, st.run.EndedAt, st.run.Error, st.run.PID = "stopped", &now, &msg, nil
			r.save(st)
		}
		if eb, err := os.ReadFile(filepath.Join(r.dir, run.ID+".events.jsonl")); err == nil {
			for _, line := range strings.Split(string(eb), "\n") {
				var ev RunEvent
				if json.Unmarshal([]byte(line), &ev) == nil {
					st.events = append(st.events, ev)
				}
			}
			if len(st.events) > maxEventsInMemory {
				st.events = st.events[len(st.events)-maxEventsInMemory:]
			}
		}
		r.runs[run.ID] = st
	}
}

func (r *runner) save(st *runState) {
	b, _ := json.MarshalIndent(st.run, "", "  ")
	_ = os.WriteFile(filepath.Join(r.dir, st.run.ID+".json"), b, 0o644)
}

func (r *runner) list() []Run {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Run, 0, len(r.runs))
	for _, st := range r.runs {
		out = append(out, st.run)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt > out[j].StartedAt })
	return out
}

func (r *runner) get(id string) (Run, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	st, ok := r.runs[id]
	if !ok {
		return Run{}, false
	}
	return st.run, true
}

func (r *runner) eventsAfter(id string, after int) ([]RunEvent, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	st, ok := r.runs[id]
	if !ok {
		return nil, false
	}
	out := []RunEvent{}
	for _, ev := range st.events {
		if ev.Seq > after {
			out = append(out, ev)
		}
	}
	return out, true
}

// runOfSession maps a Claude session id to the run that owns it.
func (r *runner) runOfSession(session string) *string {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, st := range r.runs {
		if st.run.SessionID == session {
			id := id
			return &id
		}
	}
	return nil
}

func (r *runner) pidRun(pid int) *string {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, st := range r.runs {
		if st.run.PID != nil && *st.run.PID == pid {
			id := id
			return &id
		}
	}
	return nil
}

func roleAgentPrompt(root, role string) (string, string, error) {
	b, err := os.ReadFile(filepath.Join(root, ".claude", "agents", role+".md"))
	if err != nil {
		return "", "", fmt.Errorf("no subagent wrapper for role %q: %w", role, err)
	}
	s := string(b)
	desc := role
	if strings.HasPrefix(s, "---") {
		if end := strings.Index(s[3:], "\n---"); end >= 0 {
			for _, l := range strings.Split(s[3:3+end], "\n") {
				if strings.HasPrefix(l, "description:") {
					desc = strings.Trim(strings.TrimSpace(strings.TrimPrefix(l, "description:")), `"`)
				}
			}
			s = strings.TrimLeft(s[3+end+4:], "\n")
		}
	}
	return desc, s, nil
}

func (r *runner) start(cfg workspace.Config, req RunRequest) (Run, error) {
	p, ok := cfg.Projects[req.Project]
	if !ok {
		return Run{}, fmt.Errorf("unknown project %q", req.Project)
	}
	if !workspace.IsRole(req.Role) {
		return Run{}, fmt.Errorf("unknown role %q", req.Role)
	}
	if strings.TrimSpace(req.Prompt) == "" && req.TaskID == nil {
		return Run{}, fmt.Errorf("a prompt or a task is required")
	}
	if req.PermissionMode != "acceptEdits" && req.PermissionMode != "bypassPermissions" {
		return Run{}, fmt.Errorf("permissionMode must be acceptEdits or bypassPermissions")
	}
	if req.BudgetUSD <= 0 || req.BudgetUSD > 100 {
		return Run{}, fmt.Errorf("budgetUsd must be between 0 and 100")
	}
	claudeBin, err := exec.LookPath("claude")
	if err != nil {
		return Run{}, fmt.Errorf("claude CLI not found on PATH")
	}
	desc, agentPrompt, err := roleAgentPrompt(r.root, req.Role)
	if err != nil {
		return Run{}, err
	}

	cwd := filepath.Join(r.root, filepath.FromSlash(p.RepoPath))
	if _, err := os.Stat(cwd); err != nil {
		cwd = filepath.Join(r.root, filepath.FromSlash(p.ProjectPath))
	}
	taskLine := ""
	if req.TaskID != nil && *req.TaskID != "" {
		t, err := cfg.FindTask(r.root, req.Project, *req.TaskID)
		if err != nil {
			return Run{}, err
		}
		if t.Worktree.Path != nil && *t.Worktree.Path != "" {
			wt := filepath.Join(r.root, filepath.FromSlash(*t.Worktree.Path))
			if _, err := os.Stat(wt); err == nil {
				cwd = wt
			}
		}
		taskLine = fmt.Sprintf("Your task: %s (%s), file %s.", t.ID, t.Title, t.Path())
		if t.Status == "backlog" || t.Status == "ready" {
			active := "active"
			note := fmt.Sprintf("%s: started by the dashboard as a %s run", time.Now().Format("2006-01-02 15:04"), req.Role)
			_, _ = cfg.UpdateTask(r.root, req.Project, t.ID, workspace.TaskPatch{Status: &active, AddNote: &note})
		}
	}

	agents, _ := json.Marshal(map[string]map[string]string{req.Role: {"description": desc, "prompt": agentPrompt}})
	system := strings.Join([]string{
		"Workspace root (all role/policy paths are relative to it): " + r.root,
		"Active project for this run: " + req.Project + ". Project knowledge: " + filepath.Join(r.root, filepath.FromSlash(p.ProjectPath)) + ". Repository: " + filepath.Join(r.root, filepath.FromSlash(p.RepoPath)) + ".",
		taskLine,
		"You were launched headless from the Projects-Centralized dashboard. Follow AGENTS.md. Never commit or push. When you finish, update the task file's notes and status as your role definition says, and end with a short report of what changed and what you verified.",
	}, "\n")
	prompt := req.Prompt
	if strings.TrimSpace(prompt) == "" {
		prompt = "Work on the task described in your instructions."
	}

	sessionID := uuid.NewString()
	args := []string{"-p", "--output-format", "stream-json", "--verbose",
		"--agents", string(agents), "--agent", req.Role,
		"--permission-mode", req.PermissionMode,
		"--max-budget-usd", strconv.FormatFloat(req.BudgetUSD, 'f', 2, 64),
		"--session-id", sessionID,
		"--add-dir", r.root,
		"--append-system-prompt", system,
	}
	if req.Model != nil && *req.Model != "" {
		args = append(args, "--model", *req.Model)
	}
	cmd := exec.Command(claudeBin, args...)
	cmd.Dir = cwd
	cmd.Stdin = strings.NewReader(prompt)
	hideWindow(cmd)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return Run{}, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return Run{}, err
	}
	if err := cmd.Start(); err != nil {
		return Run{}, fmt.Errorf("start claude: %w", err)
	}

	now := time.Now().Format(time.RFC3339)
	pid := cmd.Process.Pid
	st := &runState{cmd: cmd, seen: map[string]bool{}, run: Run{
		ID: time.Now().Format("20060102-150405") + "-" + req.Role, Project: req.Project, Role: req.Role,
		TaskID: req.TaskID, Prompt: prompt, Status: "running", PermissionMode: req.PermissionMode,
		BudgetUSD: req.BudgetUSD, Model: req.Model, StartedAt: now, SessionID: sessionID,
		PID: &pid, LastActivity: now, LastText: "starting", Cwd: cwd,
	}}
	r.mu.Lock()
	r.runs[st.run.ID] = st
	r.save(st)
	r.mu.Unlock()
	r.onChange()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); r.readStdout(st, stdout) }()
	go func() {
		defer wg.Done()
		sc := bufio.NewScanner(stderr)
		sc.Buffer(make([]byte, 64*1024), 1<<20)
		for sc.Scan() {
			if t := strings.TrimSpace(sc.Text()); t != "" {
				r.addEvent(st, "stderr", t, "")
			}
		}
	}()
	go func() {
		wg.Wait()
		err := cmd.Wait()
		r.finish(st, err)
	}()
	return st.run, nil
}

type streamLine struct {
	Type      string  `json:"type"`
	Subtype   string  `json:"subtype"`
	SessionID string  `json:"session_id"`
	Model     string  `json:"model"`
	Result    string  `json:"result"`
	IsError   bool    `json:"is_error"`
	TotalCost float64 `json:"total_cost_usd"`
	NumTurns  int     `json:"num_turns"`
	Message   struct {
		ID      string `json:"id"`
		Content []struct {
			Type    string          `json:"type"`
			Text    string          `json:"text"`
			Name    string          `json:"name"`
			Input   json.RawMessage `json:"input"`
			Content json.RawMessage `json:"content"`
			IsError bool            `json:"is_error"`
		} `json:"content"`
		Usage *struct {
			InputTokens              int64 `json:"input_tokens"`
			OutputTokens             int64 `json:"output_tokens"`
			CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
			CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
		} `json:"usage"`
	} `json:"message"`
}

func (r *runner) readStdout(st *runState, rd interface{ Read([]byte) (int, error) }) {
	sc := bufio.NewScanner(rd)
	sc.Buffer(make([]byte, 256*1024), 16<<20)
	for sc.Scan() {
		var l streamLine
		if json.Unmarshal(sc.Bytes(), &l) != nil {
			continue
		}
		switch l.Type {
		case "system":
			if l.Subtype == "init" {
				r.addEvent(st, "system", "session started · model "+l.Model, "")
			}
		case "assistant":
			r.mu.Lock()
			if u := l.Message.Usage; u != nil && !st.seen[l.Message.ID] {
				st.seen[l.Message.ID] = true
				st.run.Tokens.Input += u.InputTokens
				st.run.Tokens.Output += u.OutputTokens
				st.run.Tokens.CacheRead += u.CacheReadInputTokens
				st.run.Tokens.CacheWrite += u.CacheCreationInputTokens
			}
			r.mu.Unlock()
			for _, c := range l.Message.Content {
				switch c.Type {
				case "text":
					if strings.TrimSpace(c.Text) != "" {
						r.addEvent(st, "assistant_text", c.Text, "")
					}
				case "tool_use":
					r.addEvent(st, "tool_use", summarizeInput(c.Input), c.Name)
				}
			}
		case "user":
			for _, c := range l.Message.Content {
				if c.Type == "tool_result" {
					r.addEvent(st, "tool_result", truncate(rawText(c.Content), 2000), "")
				}
			}
		case "result":
			r.mu.Lock()
			cost := l.TotalCost
			st.run.CostUSD = &cost
			st.run.NumTurns = l.NumTurns
			if l.IsError || (l.Subtype != "" && l.Subtype != "success") {
				msg := l.Subtype
				if l.Result != "" {
					msg += ": " + truncate(l.Result, 500)
				}
				st.run.Error = &msg
			}
			r.mu.Unlock()
			text := l.Result
			if text == "" {
				text = l.Subtype
			}
			r.addEvent(st, "result", text, "")
		}
	}
}

func (r *runner) addEvent(st *runState, kind, text, tool string) {
	r.mu.Lock()
	seq := 1
	if n := len(st.events); n > 0 {
		seq = st.events[n-1].Seq + 1
	}
	ev := RunEvent{Seq: seq, TS: time.Now().Format(time.RFC3339), Kind: kind, Text: text, Tool: tool}
	st.events = append(st.events, ev)
	if len(st.events) > maxEventsInMemory {
		st.events = st.events[len(st.events)-maxEventsInMemory:]
	}
	st.run.LastActivity = ev.TS
	switch kind {
	case "tool_use":
		st.run.LastText = tool
	case "assistant_text":
		st.run.LastText = truncate(strings.TrimSpace(text), 80)
	}
	if f, err := os.OpenFile(filepath.Join(r.dir, st.run.ID+".events.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
		b, _ := json.Marshal(ev)
		_, _ = f.Write(append(b, '\n'))
		f.Close()
	}
	r.save(st)
	runID := st.run.ID
	r.mu.Unlock()
	r.onEvent(runID, ev)
	if kind == "tool_use" || kind == "result" {
		r.onChange()
	}
}

func (r *runner) finish(st *runState, err error) {
	r.mu.Lock()
	now := time.Now().Format(time.RFC3339)
	st.run.EndedAt, st.run.PID, st.cmd = &now, nil, nil
	switch {
	case st.run.Status == "stopped":
	case err == nil && st.run.Error == nil:
		st.run.Status = "succeeded"
	default:
		st.run.Status = "failed"
		if st.run.Error == nil {
			msg := err.Error()
			st.run.Error = &msg
		}
	}
	st.run.LastText = st.run.Status
	r.save(st)
	r.mu.Unlock()
	r.onChange()
}

func (r *runner) stop(id string) (Run, error) {
	r.mu.Lock()
	st, ok := r.runs[id]
	if !ok {
		r.mu.Unlock()
		return Run{}, fmt.Errorf("unknown run %q", id)
	}
	if st.run.Status != "running" || st.run.PID == nil {
		run := st.run
		r.mu.Unlock()
		return run, nil
	}
	st.run.Status = "stopped"
	pid := *st.run.PID
	r.save(st)
	r.mu.Unlock()
	killTree(pid)
	r.onChange()
	return r.mustGet(id), nil
}

func (r *runner) mustGet(id string) Run { run, _ := r.get(id); return run }

func (r *runner) activeCount() int {
	n := 0
	for _, run := range r.list() {
		if run.Status == "running" {
			n++
		}
	}
	return n
}

func killTree(pid int) {
	if runtime.GOOS == "windows" {
		c := exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F")
		hideWindow(c)
		_ = c.Run()
		return
	}
	if p, err := os.FindProcess(pid); err == nil {
		_ = p.Kill()
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func rawText(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(raw, &parts) == nil {
		var b strings.Builder
		for _, p := range parts {
			b.WriteString(p.Text)
		}
		return b.String()
	}
	return string(raw)
}

// summarizeInput keeps the most telling field of a tool call's input.
func summarizeInput(raw json.RawMessage) string {
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return truncate(string(raw), 300)
	}
	for _, k := range []string{"command", "file_path", "pattern", "path", "url", "description", "prompt"} {
		if v, ok := m[k].(string); ok && v != "" {
			return truncate(v, 300)
		}
	}
	return truncate(string(raw), 300)
}
