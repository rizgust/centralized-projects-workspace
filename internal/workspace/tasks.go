package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// TaskStates lists the task lifecycle states in board order.
var TaskStates = []string{"backlog", "ready", "active", "review", "blocked", "completed", "cancelled"}

type TaskGit struct {
	Branch *string `yaml:"branch" json:"branch"`
	Commit *string `yaml:"commit" json:"commit"`
}

type TaskWorktree struct {
	Required bool    `yaml:"required" json:"required"`
	Path     *string `yaml:"path" json:"path"`
}

// Task mirrors templates/task.yaml.
type Task struct {
	ID                 string       `yaml:"id" json:"id"`
	Project            string       `yaml:"-" json:"project"`
	Title              string       `yaml:"title" json:"title"`
	Feature            *string      `yaml:"feature" json:"feature"`
	Status             string       `yaml:"status" json:"status"`
	Owner              string       `yaml:"owner" json:"owner"`
	Weight             *int         `yaml:"weight" json:"weight"`
	ProposedWeight     *int         `yaml:"proposed_weight,omitempty" json:"proposedWeight"` // the Analyst's weight before Owner review
	Priority           string       `yaml:"priority" json:"priority"`
	Risk               string       `yaml:"risk" json:"risk"`
	Description        string       `yaml:"description" json:"description"`
	Requirements       []string     `yaml:"requirements" json:"requirements"`
	AcceptanceCriteria []string     `yaml:"acceptance_criteria" json:"acceptance_criteria"`
	Dependencies       []string     `yaml:"dependencies" json:"dependencies"`
	Blocks             []string     `yaml:"blocks" json:"blocks"`
	Collaborators      []string     `yaml:"collaborators" json:"collaborators"`
	Reviewers          []string     `yaml:"reviewers" json:"reviewers"`
	Notes              []string     `yaml:"notes" json:"notes"`
	Git                TaskGit      `yaml:"git" json:"git"`
	Worktree           TaskWorktree `yaml:"worktree" json:"worktree"`

	path string
}

// Path is the task file's location on disk.
func (t Task) Path() string { return t.path }

// TaskPatch is a partial update; nil fields are left unchanged.
type TaskPatch struct {
	Title              *string   `json:"title"`
	Feature            *string   `json:"feature"`
	Status             *string   `json:"status"`
	Owner              *string   `json:"owner"`
	Weight             *int      `json:"weight"`
	Priority           *string   `json:"priority"`
	Risk               *string   `json:"risk"`
	Description        *string   `json:"description"`
	Requirements       *[]string `json:"requirements"`
	AcceptanceCriteria *[]string `json:"acceptance_criteria"`
	Dependencies       *[]string `json:"dependencies"`
	Blocks             *[]string `json:"blocks"`
	Collaborators      *[]string `json:"collaborators"`
	Reviewers          *[]string `json:"reviewers"`
	AddNote            *string   `json:"addNote"`

	// OwnerReview is set by the dashboard during the review phase: a weight change
	// keeps the Analyst's original as proposed_weight and adds a review note.
	OwnerReview bool `json:"-"`
}

var validWeights = map[int]bool{1: true, 2: true, 3: true, 5: true, 8: true, 13: true}

func validState(s string) bool {
	for _, st := range TaskStates {
		if st == s {
			return true
		}
	}
	return false
}

func (c Config) projectDir(root, id string) (string, error) {
	p, ok := c.Projects[id]
	if !ok {
		return "", fmt.Errorf("unknown project %q", id)
	}
	return filepath.Join(root, filepath.FromSlash(p.ProjectPath)), nil
}

// LoadTasks reads every task file of a project, sorted by id.
func (c Config) LoadTasks(root, project string) ([]Task, error) {
	dir, err := c.projectDir(root, project)
	if err != nil {
		return nil, err
	}
	var tasks []Task
	for _, state := range TaskStates {
		files, _ := filepath.Glob(filepath.Join(dir, "tasks", state, "*.yaml"))
		for _, f := range files {
			t, err := readTask(f)
			if err != nil {
				return nil, err
			}
			t.Project = project
			tasks = append(tasks, t)
		}
	}
	sort.Slice(tasks, func(i, j int) bool { return taskNum(tasks[i].ID) < taskNum(tasks[j].ID) })
	return tasks, nil
}

func readTask(path string) (Task, error) {
	var t Task
	b, err := os.ReadFile(path)
	if err != nil {
		return t, err
	}
	if err := yaml.Unmarshal(b, &t); err != nil {
		return t, fmt.Errorf("%s: %w", path, err)
	}
	t.path = path
	for _, l := range []*[]string{&t.Requirements, &t.AcceptanceCriteria, &t.Dependencies, &t.Blocks, &t.Collaborators, &t.Reviewers, &t.Notes} {
		if *l == nil {
			*l = []string{}
		}
	}
	return t, nil
}

var taskNumRe = regexp.MustCompile(`(\d+)$`)

func taskNum(id string) int {
	m := taskNumRe.FindStringSubmatch(id)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// FindTask returns one task by id.
func (c Config) FindTask(root, project, id string) (Task, error) {
	tasks, err := c.LoadTasks(root, project)
	if err != nil {
		return Task{}, err
	}
	for _, t := range tasks {
		if t.ID == id {
			return t, nil
		}
	}
	return Task{}, fmt.Errorf("task %s not found in %s", id, project)
}

// CreateTask writes a new task from templates/task.yaml with the next id.
func (c Config) CreateTask(root, project string, p TaskPatch) (Task, error) {
	dir, err := c.projectDir(root, project)
	if err != nil {
		return Task{}, err
	}
	if p.Title == nil || strings.TrimSpace(*p.Title) == "" {
		return Task{}, fmt.Errorf("title is required")
	}
	if p.Owner == nil || *p.Owner == "" {
		return Task{}, fmt.Errorf("owner is required")
	}
	status := "backlog"
	if p.Status != nil {
		status = *p.Status
	}
	if !validState(status) {
		return Task{}, fmt.Errorf("invalid status %q", status)
	}
	tasks, err := c.LoadTasks(root, project)
	if err != nil {
		return Task{}, err
	}
	next := 1
	for _, t := range tasks {
		if n := taskNum(t.ID); n >= next {
			next = n + 1
		}
	}
	id := fmt.Sprintf("TASK-%03d", next)

	doc, err := readNode(filepath.Join(root, "templates", "task.yaml"))
	if err != nil {
		return Task{}, err
	}
	m := doc.Content[0]
	mapSet(m, "id", strNode(id))
	mapSet(m, "status", strNode(status))
	mapSet(m, "created_by", strNode("owner"))
	mapSet(m, "description", strNode(""))
	if g := mapGet(m, "git"); g != nil && g.Kind == yaml.MappingNode {
		mapSet(g, "branch", strNode("agent/"+id))
	}
	mapSet(m, "notes", listNode(nil))
	if err := applyPatch(m, p); err != nil {
		return Task{}, err
	}
	path := filepath.Join(dir, "tasks", status, id+".yaml")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return Task{}, err
	}
	if err := writeNode(path, doc); err != nil {
		return Task{}, err
	}
	removeGitkeep(filepath.Dir(path))
	t, err := readTask(path)
	t.Project = project
	return t, err
}

// UpdateTask applies a patch; a status change moves the file to tasks/<status>/.
func (c Config) UpdateTask(root, project, id string, p TaskPatch) (Task, error) {
	cur, err := c.FindTask(root, project, id)
	if err != nil {
		return Task{}, err
	}
	doc, err := readNode(cur.path)
	if err != nil {
		return Task{}, err
	}
	if p.OwnerReview && p.Weight != nil && (cur.Weight == nil || *cur.Weight != *p.Weight) {
		old := "none"
		if cur.Weight != nil {
			old = fmt.Sprint(*cur.Weight)
			if mapGet(doc.Content[0], "proposed_weight") == nil {
				mapSet(doc.Content[0], "proposed_weight", intNode(*cur.Weight))
			}
		}
		note := fmt.Sprintf("%s Owner review: weight %s → %d", time.Now().Format("2006-01-02 15:04"), old, *p.Weight)
		if p.AddNote != nil && strings.TrimSpace(*p.AddNote) != "" {
			note += " (" + strings.TrimSpace(*p.AddNote) + ")"
		}
		p.AddNote = &note
	}
	if err := applyPatch(doc.Content[0], p); err != nil {
		return Task{}, err
	}
	target := cur.path
	if p.Status != nil && *p.Status != cur.Status {
		dir, _ := c.projectDir(root, project)
		target = filepath.Join(dir, "tasks", *p.Status, filepath.Base(cur.path))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return Task{}, err
		}
	}
	if err := writeNode(target, doc); err != nil {
		return Task{}, err
	}
	if target != cur.path {
		if err := os.Remove(cur.path); err != nil {
			return Task{}, err
		}
		removeGitkeep(filepath.Dir(target))
	}
	t, err := readTask(target)
	t.Project = project
	return t, err
}

func applyPatch(m *yaml.Node, p TaskPatch) error {
	if p.Status != nil && !validState(*p.Status) {
		return fmt.Errorf("invalid status %q", *p.Status)
	}
	if p.Weight != nil && !validWeights[*p.Weight] {
		return fmt.Errorf("weight must be one of 1, 2, 3, 5, 8, 13")
	}
	set := func(key string, v *string) {
		if v != nil {
			mapSet(m, key, strNode(*v))
		}
	}
	set("title", p.Title)
	set("status", p.Status)
	set("owner", p.Owner)
	set("priority", p.Priority)
	set("risk", p.Risk)
	set("description", p.Description)
	if p.Feature != nil {
		mapSet(m, "feature", optStrNode(p.Feature))
	}
	if p.Weight != nil {
		mapSet(m, "weight", intNode(*p.Weight))
	}
	lists := map[string]*[]string{
		"requirements": p.Requirements, "acceptance_criteria": p.AcceptanceCriteria,
		"dependencies": p.Dependencies, "blocks": p.Blocks,
		"collaborators": p.Collaborators, "reviewers": p.Reviewers,
	}
	for key, v := range lists {
		if v != nil {
			mapSet(m, key, listNode(*v))
		}
	}
	if p.AddNote != nil && strings.TrimSpace(*p.AddNote) != "" {
		notes := mapGet(m, "notes")
		if notes == nil || notes.Kind != yaml.SequenceNode {
			notes = listNode(nil)
			mapSet(m, "notes", notes)
		}
		notes.Style = 0
		notes.Content = append(notes.Content, strNode(*p.AddNote))
	}
	return nil
}

// Unready lists what a task still lacks for the Definition of Ready.
func (t Task) Unready() []string {
	var missing []string
	if strings.TrimSpace(t.Title) == "" {
		missing = append(missing, "title")
	}
	if t.Owner == "" || t.Owner == "null" {
		missing = append(missing, "owner")
	}
	if t.Weight == nil {
		missing = append(missing, "weight")
	}
	if len(t.AcceptanceCriteria) == 0 {
		missing = append(missing, "acceptance criteria")
	}
	if t.Risk == "" {
		missing = append(missing, "risk")
	}
	return missing
}

func removeGitkeep(dir string) {
	entries, _ := os.ReadDir(dir)
	if len(entries) > 1 {
		os.Remove(filepath.Join(dir, ".gitkeep"))
	}
}
