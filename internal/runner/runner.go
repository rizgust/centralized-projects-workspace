// Package runner spawns and tracks headless `claude -p` child processes,
// one OS process per agent invocation, so stop/crash isolation is real
// (kill the PID) rather than a soft in-process flag.
package runner

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type ProjectRef struct {
	Host, Org, Repo, CWD string
}

type Options struct {
	PermissionMode  string // acceptEdits | bypassPermissions | plan | default | dontAsk | auto
	AllowedTools    []string
	MaxBudgetUSD    float64
	ResumeSessionID string // set only when resuming an existing conversation
}

const (
	StatusRunning     = "running"
	StatusCompleted   = "completed"
	StatusError       = "error"
	StatusStopped     = "stopped"
	StatusInterrupted = "interrupted"
)

type Run struct {
	ID              string
	ParentID        string
	Host, Org, Repo string
	CWD             string
	Prompt          string
	SessionID       string
	PID             int
	PermissionMode  string
	Status          string
	StartedAt       string
	EndedAt         string
	LogPath         string
	Summary         string
	CostUSD         float64
}

type Manager struct {
	db      *sql.DB
	logsDir string
	onEvent func(Run)

	mu       sync.Mutex
	stopping map[string]bool
}

// SetEventHandler (re)sets the callback invoked when a run finishes. Safe to
// call once at startup before any runs are started.
func (m *Manager) SetEventHandler(fn func(Run)) {
	m.mu.Lock()
	m.onEvent = fn
	m.mu.Unlock()
}

func Open(dbPath, logsDir string, onEvent func(Run)) (*Manager, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS runs (
			id TEXT PRIMARY KEY,
			parent_id TEXT,
			host TEXT NOT NULL,
			org TEXT NOT NULL,
			repo TEXT NOT NULL,
			cwd TEXT NOT NULL,
			prompt TEXT NOT NULL,
			session_id TEXT NOT NULL,
			pid INTEGER,
			permission_mode TEXT,
			status TEXT NOT NULL,
			started_at TEXT NOT NULL,
			ended_at TEXT,
			log_path TEXT,
			summary TEXT,
			cost_usd REAL
		)
	`); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(logsDir, 0o755); err != nil {
		return nil, err
	}
	return &Manager{db: db, logsDir: logsDir, onEvent: onEvent, stopping: map[string]bool{}}, nil
}

// ReconcileOnBoot marks any run left 'running' from a previous process
// lifetime as interrupted — its child process could not have survived.
func (m *Manager) ReconcileOnBoot() (int, error) {
	res, err := m.db.Exec(
		`UPDATE runs SET status = ?, ended_at = ? WHERE status = ?`,
		StatusInterrupted, time.Now().Format(time.RFC3339), StatusRunning,
	)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

type claudeResult struct {
	SessionID   string  `json:"session_id"`
	Result      string  `json:"result"`
	IsError     bool    `json:"is_error"`
	TotalCostUS float64 `json:"total_cost_usd"`
}

func (m *Manager) Start(ref ProjectRef, prompt string, opts Options) (*Run, error) {
	return m.start(ref, prompt, opts, "")
}

func (m *Manager) Resume(runID, prompt string, opts Options) (*Run, error) {
	prev, err := m.Get(runID)
	if err != nil {
		return nil, err
	}
	opts.ResumeSessionID = prev.SessionID
	return m.start(ProjectRef{Host: prev.Host, Org: prev.Org, Repo: prev.Repo, CWD: prev.CWD}, prompt, opts, prev.ID)
}

func (m *Manager) start(ref ProjectRef, prompt string, opts Options, parentID string) (*Run, error) {
	if ref.CWD == "" {
		return nil, fmt.Errorf("project has no local_path set — onboard or relocate it first")
	}
	if _, err := os.Stat(ref.CWD); err != nil {
		return nil, fmt.Errorf("project path does not exist: %s", ref.CWD)
	}

	invocationID := uuid.NewString()
	sessionID := opts.ResumeSessionID
	if sessionID == "" {
		sessionID = uuid.NewString()
	}

	args := []string{"-p", prompt, "--output-format", "json", "--permission-mode", opts.PermissionMode}
	if len(opts.AllowedTools) > 0 {
		args = append(args, "--allowedTools")
		args = append(args, opts.AllowedTools...)
	}
	if opts.MaxBudgetUSD > 0 {
		args = append(args, "--max-budget-usd", strconv.FormatFloat(opts.MaxBudgetUSD, 'f', 2, 64))
	}
	if opts.ResumeSessionID != "" {
		args = append(args, "--resume", opts.ResumeSessionID)
	} else {
		args = append(args, "--session-id", sessionID)
	}

	logPath := filepath.Join(m.logsDir, invocationID+".log")
	logFile, err := os.Create(logPath)
	if err != nil {
		return nil, err
	}

	cmd := exec.Command("claude", args...)
	cmd.Dir = ref.CWD
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("starting claude: %w", err)
	}

	run := &Run{
		ID: invocationID, ParentID: parentID,
		Host: ref.Host, Org: ref.Org, Repo: ref.Repo, CWD: ref.CWD,
		Prompt: prompt, SessionID: sessionID, PID: cmd.Process.Pid,
		PermissionMode: opts.PermissionMode, Status: StatusRunning,
		StartedAt: time.Now().Format(time.RFC3339), LogPath: logPath,
	}

	if _, err := m.db.Exec(
		`INSERT INTO runs (id, parent_id, host, org, repo, cwd, prompt, session_id, pid, permission_mode, status, started_at, log_path)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		run.ID, nullable(run.ParentID), run.Host, run.Org, run.Repo, run.CWD, run.Prompt,
		run.SessionID, run.PID, run.PermissionMode, run.Status, run.StartedAt, run.LogPath,
	); err != nil {
		logFile.Close()
		return nil, err
	}

	go m.watch(cmd, logFile, run.ID, logPath)

	return run, nil
}

func (m *Manager) watch(cmd *exec.Cmd, logFile *os.File, runID, logPath string) {
	waitErr := cmd.Wait()
	logFile.Close()

	m.mu.Lock()
	wasStopping := m.stopping[runID]
	delete(m.stopping, runID)
	m.mu.Unlock()

	status := StatusCompleted
	if wasStopping {
		status = StatusStopped
	} else if waitErr != nil {
		status = StatusError
	}

	summary, sessionID, cost := "", "", 0.0
	if raw, err := os.ReadFile(logPath); err == nil {
		var res claudeResult
		if jsonErr := json.Unmarshal(raw, &res); jsonErr == nil {
			summary = res.Result
			cost = res.TotalCostUS
			if res.SessionID != "" {
				sessionID = res.SessionID
			}
			if res.IsError && status == StatusCompleted {
				status = StatusError
			}
		} else if len(raw) > 0 {
			summary = string(raw)
			if len(summary) > 2000 {
				summary = summary[:2000] + "…"
			}
		}
	}

	q := `UPDATE runs SET status = ?, ended_at = ?, summary = ?, cost_usd = ?`
	args := []any{status, time.Now().Format(time.RFC3339), summary, cost}
	if sessionID != "" {
		q += `, session_id = ?`
		args = append(args, sessionID)
	}
	q += ` WHERE id = ?`
	args = append(args, runID)
	m.db.Exec(q, args...)

	m.mu.Lock()
	onEvent := m.onEvent
	m.mu.Unlock()
	if run, err := m.Get(runID); err == nil && onEvent != nil {
		onEvent(*run)
	}
}

func (m *Manager) Stop(runID string) error {
	run, err := m.Get(runID)
	if err != nil {
		return err
	}
	if run.Status != StatusRunning {
		return fmt.Errorf("run %s is not running (status: %s)", runID, run.Status)
	}

	m.mu.Lock()
	m.stopping[runID] = true
	m.mu.Unlock()

	if runtime.GOOS == "windows" {
		return exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(run.PID)).Run()
	}
	proc, err := os.FindProcess(run.PID)
	if err != nil {
		return err
	}
	return proc.Kill()
}

func (m *Manager) Get(id string) (*Run, error) {
	row := m.db.QueryRow(
		`SELECT id, COALESCE(parent_id,''), host, org, repo, cwd, prompt, session_id, pid,
		        permission_mode, status, started_at, COALESCE(ended_at,''), COALESCE(log_path,''),
		        COALESCE(summary,''), COALESCE(cost_usd,0)
		 FROM runs WHERE id = ?`, id)
	var r Run
	if err := row.Scan(&r.ID, &r.ParentID, &r.Host, &r.Org, &r.Repo, &r.CWD, &r.Prompt, &r.SessionID,
		&r.PID, &r.PermissionMode, &r.Status, &r.StartedAt, &r.EndedAt, &r.LogPath, &r.Summary, &r.CostUSD); err != nil {
		return nil, err
	}
	return &r, nil
}

func (m *Manager) List(limit int) ([]Run, error) {
	rows, err := m.db.Query(
		`SELECT id, COALESCE(parent_id,''), host, org, repo, cwd, prompt, session_id, pid,
		        permission_mode, status, started_at, COALESCE(ended_at,''), COALESCE(log_path,''),
		        COALESCE(summary,''), COALESCE(cost_usd,0)
		 FROM runs ORDER BY started_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Run
	for rows.Next() {
		var r Run
		if err := rows.Scan(&r.ID, &r.ParentID, &r.Host, &r.Org, &r.Repo, &r.CWD, &r.Prompt, &r.SessionID,
			&r.PID, &r.PermissionMode, &r.Status, &r.StartedAt, &r.EndedAt, &r.LogPath, &r.Summary, &r.CostUSD); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// FindByPrefix resolves a short id prefix (as shown to a Telegram user) to a
// full run. Errors if zero or more than one run matches.
func (m *Manager) FindByPrefix(prefix string) (*Run, error) {
	rows, err := m.db.Query(`SELECT id FROM runs WHERE id LIKE ? LIMIT 2`, prefix+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("no run matching %q", prefix)
	}
	if len(ids) > 1 {
		return nil, fmt.Errorf("ambiguous run id %q, be more specific", prefix)
	}
	return m.Get(ids[0])
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
