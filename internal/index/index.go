// Package index maintains control/db/index.sqlite3, a disposable, rebuildable
// cache of control/meta/**/*.md for fast querying. Markdown is always
// upstream; this package never writes back to it.
package index

import (
	"database/sql"
	"fmt"
	"os"

	_ "modernc.org/sqlite"

	"github.com/rizgust/centralized-projects-workspace/internal/meta"
)

func Open(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS projects (
			host TEXT NOT NULL,
			org TEXT NOT NULL,
			repo TEXT NOT NULL,
			remote TEXT,
			local_path TEXT,
			relocated INTEGER,
			last_synced TEXT,
			health TEXT,
			status_body TEXT,
			PRIMARY KEY (host, org, repo)
		)
	`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS tasks (
			host TEXT NOT NULL,
			org TEXT NOT NULL,
			repo TEXT NOT NULL,
			done INTEGER NOT NULL,
			text TEXT NOT NULL,
			PRIMARY KEY (host, org, repo, text)
		)
	`); err != nil {
		return nil, err
	}
	return db, nil
}

type Counts struct {
	Projects int
	Tasks    int
}

// Rebuild wipes and repopulates projects/tasks from control/meta/**/*.md.
func Rebuild(db *sql.DB, metaRoot string) (Counts, error) {
	dirs, err := meta.Walk(metaRoot)
	if err != nil {
		return Counts{}, err
	}

	tx, err := db.Begin()
	if err != nil {
		return Counts{}, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM projects"); err != nil {
		return Counts{}, err
	}
	if _, err := tx.Exec("DELETE FROM tasks"); err != nil {
		return Counts{}, err
	}

	var counts Counts
	for _, d := range dirs {
		raw, err := os.ReadFile(meta.StatusPath(metaRoot, d.Host, d.Org, d.Repo))
		if err != nil {
			return Counts{}, err
		}
		s, err := meta.ParseStatus(raw)
		if err != nil {
			return Counts{}, fmt.Errorf("%s/%s/%s: %w", d.Host, d.Org, d.Repo, err)
		}
		relocated := 0
		if s.Relocated {
			relocated = 1
		}
		if _, err := tx.Exec(
			`INSERT INTO projects (host, org, repo, remote, local_path, relocated, last_synced, health, status_body)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			d.Host, d.Org, d.Repo, s.Remote, s.LocalPath, relocated, s.LastSynced, s.Health, s.Body,
		); err != nil {
			return Counts{}, err
		}
		counts.Projects++

		if tasksRaw, err := os.ReadFile(meta.TasksPath(metaRoot, d.Host, d.Org, d.Repo)); err == nil {
			for _, t := range meta.ParseTasks(tasksRaw) {
				done := 0
				if t.Done {
					done = 1
				}
				if _, err := tx.Exec(
					`INSERT OR IGNORE INTO tasks (host, org, repo, done, text) VALUES (?, ?, ?, ?, ?)`,
					d.Host, d.Org, d.Repo, done, t.Text,
				); err != nil {
					return Counts{}, err
				}
				counts.Tasks++
			}
		}
	}

	return counts, tx.Commit()
}
