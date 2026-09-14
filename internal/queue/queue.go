// Package queue is the "common ground" shared task board that the five
// agent roles (analyst, golang-dev, frontend-dev, godot-dev, qa-tester) use
// to exchange work across projects: any role can list, claim, complete, or
// hand off a task regardless of which project it's about. Backed by SQLite
// as the live source of truth (unlike control/meta, this is a
// concurrently-written operational store, not a human-edited document).
package queue

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

const (
	StatusOpen      = "open"
	StatusDone      = "done"
	StatusBlocked   = "blocked"
	StatusCancelled = "cancelled"
)

type Task struct {
	ID              string
	Host, Org, Repo string
	Role            string
	Title           string
	Body            string
	Status          string
	CreatedBy       string
	ParentTaskID    string
	Notes           string
	CreatedAt       string
	DoneAt          string
}

func (t Task) Project() string {
	return fmt.Sprintf("%s/%s/%s", t.Host, t.Org, t.Repo)
}

type Queue struct {
	db *sql.DB
}

func Open(dbPath string) (*Queue, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			host TEXT NOT NULL,
			org TEXT NOT NULL,
			repo TEXT NOT NULL,
			role TEXT NOT NULL,
			title TEXT NOT NULL,
			body TEXT,
			status TEXT NOT NULL,
			created_by TEXT,
			parent_task_id TEXT,
			notes TEXT,
			created_at TEXT NOT NULL,
			done_at TEXT
		)
	`); err != nil {
		return nil, err
	}
	return &Queue{db: db}, nil
}

func newID() string {
	buf := make([]byte, 3)
	rand.Read(buf)
	// time-sortable prefix + a few random bytes to avoid collisions between
	// tasks created in the same second.
	return fmt.Sprintf("%06x%02x%02x%02x", time.Now().Unix()&0xffffff, buf[0], buf[1], buf[2])
}

func (q *Queue) Add(host, org, repo, role, title, body, createdBy, parentTaskID string) (Task, error) {
	t := Task{
		ID: newID(), Host: host, Org: org, Repo: repo, Role: role,
		Title: title, Body: body, Status: StatusOpen, CreatedBy: createdBy,
		ParentTaskID: parentTaskID, CreatedAt: time.Now().Format(time.RFC3339),
	}
	_, err := q.db.Exec(
		`INSERT INTO tasks (id, host, org, repo, role, title, body, status, created_by, parent_task_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.Host, t.Org, t.Repo, t.Role, t.Title, nullable(t.Body), t.Status, nullable(t.CreatedBy), nullable(t.ParentTaskID), t.CreatedAt,
	)
	return t, err
}

type Filter struct {
	Role, Host, Org, Repo, Status string
}

func (q *Queue) List(f Filter, limit int) ([]Task, error) {
	query := `SELECT id, host, org, repo, role, title, COALESCE(body,''), status, COALESCE(created_by,''),
	                 COALESCE(parent_task_id,''), COALESCE(notes,''), created_at, COALESCE(done_at,'')
	          FROM tasks WHERE 1=1`
	var args []any
	if f.Role != "" {
		query += " AND role = ?"
		args = append(args, f.Role)
	}
	if f.Host != "" {
		query += " AND host = ?"
		args = append(args, f.Host)
	}
	if f.Org != "" {
		query += " AND org = ?"
		args = append(args, f.Org)
	}
	if f.Repo != "" {
		query += " AND repo = ?"
		args = append(args, f.Repo)
	}
	if f.Status != "" {
		query += " AND status = ?"
		args = append(args, f.Status)
	}
	query += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := q.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.Host, &t.Org, &t.Repo, &t.Role, &t.Title, &t.Body, &t.Status,
			&t.CreatedBy, &t.ParentTaskID, &t.Notes, &t.CreatedAt, &t.DoneAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (q *Queue) Get(id string) (Task, error) {
	row := q.db.QueryRow(
		`SELECT id, host, org, repo, role, title, COALESCE(body,''), status, COALESCE(created_by,''),
		        COALESCE(parent_task_id,''), COALESCE(notes,''), created_at, COALESCE(done_at,'')
		 FROM tasks WHERE id = ?`, id)
	var t Task
	err := row.Scan(&t.ID, &t.Host, &t.Org, &t.Repo, &t.Role, &t.Title, &t.Body, &t.Status,
		&t.CreatedBy, &t.ParentTaskID, &t.Notes, &t.CreatedAt, &t.DoneAt)
	return t, err
}

// FindByPrefix resolves a short id prefix to a full task. Errors if zero or
// more than one task matches.
func (q *Queue) FindByPrefix(prefix string) (Task, error) {
	rows, err := q.db.Query(`SELECT id FROM tasks WHERE id LIKE ? LIMIT 2`, prefix+"%")
	if err != nil {
		return Task{}, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return Task{}, err
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return Task{}, fmt.Errorf("no task matching %q", prefix)
	}
	if len(ids) > 1 {
		return Task{}, fmt.Errorf("ambiguous task id %q, be more specific", prefix)
	}
	return q.Get(ids[0])
}

func (q *Queue) SetStatus(id, status, notes string) error {
	doneAt := any(nil)
	if status == StatusDone {
		doneAt = time.Now().Format(time.RFC3339)
	}
	_, err := q.db.Exec(`UPDATE tasks SET status = ?, notes = ?, done_at = COALESCE(done_at, ?) WHERE id = ?`,
		status, nullable(notes), doneAt, id)
	return err
}

// HandOff marks a task done and creates a fresh task for another role,
// linked back via ParentTaskID — the actual mechanism behind "exchanging a
// task" between agent roles.
func (q *Queue) HandOff(id, toRole, title, body, notes string) (Task, error) {
	t, err := q.Get(id)
	if err != nil {
		return Task{}, err
	}
	if err := q.SetStatus(id, StatusDone, notes); err != nil {
		return Task{}, err
	}
	return q.Add(t.Host, t.Org, t.Repo, toRole, title, body, t.Role, t.ID)
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
