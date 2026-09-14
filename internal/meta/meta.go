// Package meta reads and writes the control/meta/<host>/<org>/<repo>/{status.md,tasks.md}
// files that are the source of truth for project state.
package meta

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Status struct {
	Org        string `yaml:"org"`
	Repo       string `yaml:"repo"`
	Host       string `yaml:"host"`
	Remote     string `yaml:"remote"`
	LocalPath  string `yaml:"local_path"`
	Relocated  bool   `yaml:"relocated"`
	LastSynced string `yaml:"last_synced"`
	Health     string `yaml:"health"`
	Body       string `yaml:"-"`
}

type Task struct {
	Done bool
	Text string
}

type ProjectDir struct {
	Host, Org, Repo string
	Dir             string
}

var frontmatterRe = regexp.MustCompile(`(?s)^---\r?\n(.*?)\r?\n---\r?\n?(.*)$`)

func splitFrontmatter(raw []byte) (yamlPart, body string) {
	m := frontmatterRe.FindSubmatch(raw)
	if m == nil {
		return "", strings.TrimSpace(string(raw))
	}
	return string(m[1]), strings.TrimSpace(string(m[2]))
}

func ParseStatus(raw []byte) (Status, error) {
	yamlPart, body := splitFrontmatter(raw)
	var s Status
	if yamlPart != "" {
		if err := yaml.Unmarshal([]byte(yamlPart), &s); err != nil {
			return Status{}, fmt.Errorf("parse status frontmatter: %w", err)
		}
	}
	s.Body = body
	return s, nil
}

func (s Status) Render() string {
	var b strings.Builder
	b.WriteString("---\n")
	fmt.Fprintf(&b, "org: %s\n", s.Org)
	fmt.Fprintf(&b, "repo: %s\n", s.Repo)
	fmt.Fprintf(&b, "host: %s\n", s.Host)
	fmt.Fprintf(&b, "remote: %s\n", s.Remote)
	if s.LocalPath == "" {
		b.WriteString("local_path: null\n")
	} else {
		fmt.Fprintf(&b, "local_path: %s\n", s.LocalPath)
	}
	fmt.Fprintf(&b, "relocated: %t\n", s.Relocated)
	fmt.Fprintf(&b, "last_synced: %s\n", s.LastSynced)
	fmt.Fprintf(&b, "health: %s\n", s.Health)
	b.WriteString("---\n\n")
	b.WriteString(s.Body)
	b.WriteString("\n")
	return b.String()
}

var taskLineRe = regexp.MustCompile(`^\s*-\s*\[( |x|X)\]\s*(?:\([A-Za-z0-9_]+\)\s*)?(.+)$`)

func ParseTasks(raw []byte) []Task {
	_, body := splitFrontmatter(raw)
	var tasks []Task
	for _, line := range strings.Split(body, "\n") {
		m := taskLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		done := strings.EqualFold(m[1], "x")
		tasks = append(tasks, Task{Done: done, Text: strings.TrimSpace(m[2])})
	}
	return tasks
}

func RenderTasks(org, repo string, tasks []Task) string {
	var b strings.Builder
	fmt.Fprintf(&b, "---\norg: %s\nrepo: %s\n---\n\n", org, repo)
	for _, t := range tasks {
		mark := " "
		tag := "open"
		if t.Done {
			mark = "x"
			tag = "done"
		}
		fmt.Fprintf(&b, "- [%s] (%s) %s\n", mark, tag, t.Text)
	}
	return b.String()
}

// Walk finds every project directory under metaRoot (control/meta) that
// contains a status.md, returning host/org/repo derived from its path.
func Walk(metaRoot string) ([]ProjectDir, error) {
	var out []ProjectDir
	err := filepath.WalkDir(metaRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || d.Name() != "status.md" {
			return nil
		}
		dir := filepath.Dir(path)
		rel, err := filepath.Rel(metaRoot, dir)
		if err != nil {
			return err
		}
		parts := strings.Split(filepath.ToSlash(rel), "/")
		if len(parts) != 3 {
			return nil
		}
		out = append(out, ProjectDir{Host: parts[0], Org: parts[1], Repo: parts[2], Dir: dir})
		return nil
	})
	if os.IsNotExist(err) {
		return nil, nil
	}
	return out, err
}

func StatusPath(metaRoot, host, org, repo string) string {
	return filepath.Join(metaRoot, host, org, repo, "status.md")
}

func TasksPath(metaRoot, host, org, repo string) string {
	return filepath.Join(metaRoot, host, org, repo, "tasks.md")
}

func JournalPath(metaRoot, host, org, repo string) string {
	return filepath.Join(metaRoot, host, org, repo, "journal.md")
}

const journalHeader = "# Journal\n\nAppend-only history of completed work on this project — \"tasks memory\"," +
	" distinct from tasks.md's live open/done checklist. Each agent role appends an entry here" +
	" when it finishes a task.\n"

// AppendJournalInDir adds a dated, role-attributed entry to journal.md
// inside a project's meta directory (e.g. control/meta/<host>/<org>/<repo>),
// creating the file with its header on first use.
func AppendJournalInDir(metaDir, role, entry string) error {
	path := filepath.Join(metaDir, "journal.md")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := os.WriteFile(path, []byte(journalHeader), 0o644); err != nil {
			return err
		}
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = fmt.Fprintf(f, "\n## %s — %s\n\n%s\n", time.Now().Format("2006-01-02 15:04"), role, strings.TrimSpace(entry))
	return err
}
