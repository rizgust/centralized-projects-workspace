package dashboard

import (
	"path/filepath"
	"strings"

	"github.com/rizgust/centralized-projects-workspace/internal/workspace"
)

type Worker struct {
	Role      string  `json:"role"`
	Name      string  `json:"name"`
	State     string  `json:"state"`
	RunID     *string `json:"runId"`
	TaskID    *string `json:"taskId"`
	TaskTitle *string `json:"taskTitle"`
	Bubble    string  `json:"bubble"`
	Queued    int     `json:"queued"`
}

type Room struct {
	Project string   `json:"project"`
	Name    string   `json:"name"`
	Active  bool     `json:"active"`
	Workers []Worker `json:"workers"`
}

type Office struct {
	Project             *string  `json:"project"`
	Rooms               []Room   `json:"rooms"`
	HQ                  []Worker `json:"hq"`
	InteractiveSessions int      `json:"interactiveSessions"`
}

func strp(s string) *string { return &s }

// buildOffice derives each virtual worker's state, in priority order:
// running agent run > blocked task > task in review > ready tasks queued > idle.
func buildOffice(root string, cfg workspace.Config, runs []Run, interactive int) Office {
	roles := workspace.Roles(root)
	active := workspace.ActiveProject(root)
	o := Office{Rooms: []Room{}, HQ: []Worker{}, InteractiveSessions: interactive}
	if active != "" {
		o.Project = strp(active)
	}
	for _, id := range cfg.IDs() {
		tasks, _ := cfg.LoadTasks(root, id)
		name := cfg.Projects[id].Name
		if name == "" {
			name = id
		}
		room := Room{Project: id, Name: name, Active: id == active}
		for _, r := range roles {
			room.Workers = append(room.Workers, workerFor(r, id, tasks, runs))
		}
		o.Rooms = append(o.Rooms, room)
	}
	for _, r := range roles {
		o.HQ = append(o.HQ, Worker{Role: r.ID, Name: r.Name, State: "idle", Bubble: "zz"})
	}
	return o
}

func workerFor(r workspace.RoleInfo, project string, tasks []workspace.Task, runs []Run) Worker {
	w := Worker{Role: r.ID, Name: r.Name, State: "idle", Bubble: "zz"}
	titleOf := func(id string) *string {
		for _, t := range tasks {
			if t.ID == id {
				return strp(t.Title)
			}
		}
		return nil
	}
	for _, t := range tasks {
		if t.Owner == r.ID && t.Status == "ready" {
			w.Queued++
		}
	}
	for _, run := range runs {
		if run.Status == "running" && run.Project == project && run.Role == r.ID {
			w.State, w.RunID, w.TaskID = "working", strp(run.ID), run.TaskID
			if run.TaskID != nil {
				w.TaskTitle = titleOf(*run.TaskID)
			}
			w.Bubble = run.LastText
			if w.Bubble == "" {
				w.Bubble = "working"
			}
			return w
		}
	}
	find := func(match func(workspace.Task) bool) *workspace.Task {
		for i := range tasks {
			if match(tasks[i]) {
				return &tasks[i]
			}
		}
		return nil
	}
	if t := find(func(t workspace.Task) bool { return t.Owner == r.ID && t.Status == "blocked" }); t != nil {
		w.State, w.TaskID, w.TaskTitle, w.Bubble = "blocked", strp(t.ID), strp(t.Title), "!"
		return w
	}
	if t := find(func(t workspace.Task) bool {
		if t.Status != "review" {
			return false
		}
		if t.Owner == r.ID {
			return true
		}
		for _, rv := range t.Reviewers {
			if rv == r.ID {
				return true
			}
		}
		return false
	}); t != nil {
		w.State, w.TaskID, w.TaskTitle, w.Bubble = "review", strp(t.ID), strp(t.Title), "?"
		return w
	}
	if w.Queued > 0 {
		t := find(func(t workspace.Task) bool { return t.Owner == r.ID && t.Status == "ready" })
		w.State, w.TaskID, w.TaskTitle, w.Bubble = "waiting", strp(t.ID), strp(t.Title), t.ID
	}
	return w
}

// projectOfCwd maps a working directory to a registered project id.
func projectOfCwd(root string, cfg func() workspace.Config) func(string) string {
	return func(cwd string) string {
		c := normPath(cwd)
		for id, p := range cfg().Projects {
			for _, rel := range []string{p.RepoPath, p.ProjectPath, "worktrees/" + id} {
				base := normPath(filepath.Join(root, filepath.FromSlash(rel)))
				if c == base || strings.HasPrefix(c, base+"/") {
					return id
				}
			}
		}
		return "workspace"
	}
}
