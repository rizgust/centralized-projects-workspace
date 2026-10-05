package workspace

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type GitInfo struct {
	Branch string `json:"branch"`
	Dirty  int    `json:"dirty"`
	Ahead  int    `json:"ahead"`
	Behind int    `json:"behind"`
}

type ProjectSummary struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Type           string         `json:"type"`
	Classification string         `json:"classification"`
	RepoPath       string         `json:"repoPath"`
	RepoExists     bool           `json:"repoExists"`
	Remote         string         `json:"remote"`
	DefaultBranch  string         `json:"defaultBranch"`
	WorkingBranch  string         `json:"workingBranch"`
	Active         bool           `json:"active"`
	Health         string         `json:"health"`
	TaskCounts     map[string]int `json:"taskCounts"`
	WeightDone     int            `json:"weightDone"`
	WeightTotal    int            `json:"weightTotal"`
	Git            *GitInfo       `json:"git"`
}

type FeatureInfo struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

type DecisionInfo struct {
	File   string `json:"file"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

type ProjectDetail struct {
	ProjectSummary
	ProjectMd       string         `json:"projectMd"`
	StatusMd        string         `json:"statusMd"`
	CurrentReportMd string         `json:"currentReportMd"`
	Features        []FeatureInfo  `json:"features"`
	Decisions       []DecisionInfo `json:"decisions"`
}

// ActiveProject reads active-project.yaml; "" when none is active.
func ActiveProject(root string) string {
	var a struct {
		ActiveProject *string `yaml:"active_project"`
	}
	b, err := os.ReadFile(filepath.Join(root, "active-project.yaml"))
	if err != nil || yaml.Unmarshal(b, &a) != nil || a.ActiveProject == nil {
		return ""
	}
	return *a.ActiveProject
}

const activeProjectFmt = `active_project: %s
project_path: %s
repo_path: %s

session_policy:
  allow_other_projects: false
  exceptions: []
`

// SetActiveProject writes active-project.yaml; id "" deactivates.
func (c Config) SetActiveProject(root, id string) error {
	if id == "" {
		return os.WriteFile(filepath.Join(root, "active-project.yaml"), []byte(fmt.Sprintf(activeProjectFmt, "null", "null", "null")), 0o644)
	}
	p, ok := c.Projects[id]
	if !ok {
		return fmt.Errorf("unknown project %q", id)
	}
	return os.WriteFile(filepath.Join(root, "active-project.yaml"), []byte(fmt.Sprintf(activeProjectFmt, id, p.ProjectPath, p.RepoPath)), 0o644)
}

var healthRe = regexp.MustCompile(`(?im)^\s*health:\s*\**\s*([a-z-]+)`)

// Summary builds the dashboard summary of one project. withGit runs git.
func (c Config) Summary(root, id string, withGit bool) (ProjectSummary, error) {
	p, ok := c.Projects[id]
	if !ok {
		return ProjectSummary{}, fmt.Errorf("unknown project %q", id)
	}
	repo := filepath.Join(root, filepath.FromSlash(p.RepoPath))
	s := ProjectSummary{
		ID: id, Name: p.Name, Type: p.Type, Classification: p.Classification,
		RepoPath: p.RepoPath, Remote: p.Remote, DefaultBranch: p.DefaultBranch,
		WorkingBranch: p.WorkingBranch, Active: ActiveProject(root) == id,
		Health: "unknown", TaskCounts: map[string]int{},
	}
	if s.Name == "" {
		s.Name = id
	}
	for _, st := range TaskStates {
		s.TaskCounts[st] = 0
	}
	if _, err := os.Stat(filepath.Join(repo, ".git")); err == nil {
		s.RepoExists = true
	}
	dir := filepath.Join(root, filepath.FromSlash(p.ProjectPath))
	if b, err := os.ReadFile(filepath.Join(dir, "STATUS.md")); err == nil {
		if m := healthRe.FindSubmatch(b); m != nil {
			s.Health = strings.ToLower(string(m[1]))
		}
	}
	tasks, err := c.LoadTasks(root, id)
	if err != nil {
		return s, err
	}
	for _, t := range tasks {
		s.TaskCounts[t.Status]++
		if t.Status == "cancelled" || t.Weight == nil {
			continue
		}
		s.WeightTotal += *t.Weight
		if t.Status == "completed" {
			s.WeightDone += *t.Weight
		}
	}
	if withGit && s.RepoExists {
		s.Git = gitInfo(repo)
	}
	return s, nil
}

func gitInfo(repo string) *GitInfo {
	out, err := exec.Command("git", "-C", repo, "status", "--porcelain=v1", "-b").Output()
	if err != nil {
		return nil
	}
	g := &GitInfo{}
	lines := strings.Split(strings.TrimRight(string(out), "\n"), "\n")
	for i, l := range lines {
		if i == 0 && strings.HasPrefix(l, "## ") {
			head := strings.TrimPrefix(l, "## ")
			g.Branch = strings.SplitN(strings.SplitN(head, "...", 2)[0], " ", 2)[0]
			if m := regexp.MustCompile(`ahead (\d+)`).FindStringSubmatch(head); m != nil {
				g.Ahead, _ = strconv.Atoi(m[1])
			}
			if m := regexp.MustCompile(`behind (\d+)`).FindStringSubmatch(head); m != nil {
				g.Behind, _ = strconv.Atoi(m[1])
			}
			continue
		}
		if l != "" {
			g.Dirty++
		}
	}
	return g
}

// Detail adds the project's documents, features and decisions.
func (c Config) Detail(root, id string) (ProjectDetail, error) {
	s, err := c.Summary(root, id, true)
	if err != nil {
		return ProjectDetail{}, err
	}
	dir := filepath.Join(root, filepath.FromSlash(c.Projects[id].ProjectPath))
	read := func(rel string) string {
		b, _ := os.ReadFile(filepath.Join(dir, filepath.FromSlash(rel)))
		return string(b)
	}
	d := ProjectDetail{
		ProjectSummary: s, ProjectMd: read("PROJECT.md"), StatusMd: read("STATUS.md"),
		CurrentReportMd: read("reports/current.md"),
		Features:        []FeatureInfo{}, Decisions: []DecisionInfo{},
	}
	featDirs, _ := os.ReadDir(filepath.Join(dir, "features"))
	for _, fd := range featDirs {
		if !fd.IsDir() {
			continue
		}
		f := FeatureInfo{ID: fd.Name(), Title: fd.Name(), Status: "unknown"}
		var fy struct {
			Title  *string `yaml:"title"`
			Status *string `yaml:"status"`
		}
		if b, err := os.ReadFile(filepath.Join(dir, "features", fd.Name(), "feature.yaml")); err == nil && yaml.Unmarshal(b, &fy) == nil {
			if fy.Title != nil {
				f.Title = *fy.Title
			}
			if fy.Status != nil {
				f.Status = *fy.Status
			}
		}
		d.Features = append(d.Features, f)
	}
	adrs, _ := filepath.Glob(filepath.Join(dir, "decisions", "*.md"))
	for _, a := range adrs {
		b, _ := os.ReadFile(a)
		d.Decisions = append(d.Decisions, parseDecision(filepath.Base(a), string(b)))
	}
	return d, nil
}

func parseDecision(file, body string) DecisionInfo {
	d := DecisionInfo{File: file, Title: strings.TrimSuffix(file, ".md"), Status: "unknown"}
	lines := strings.Split(body, "\n")
	for i, l := range lines {
		t := strings.TrimSpace(l)
		if strings.HasPrefix(t, "# ") && d.Title == strings.TrimSuffix(file, ".md") {
			d.Title = strings.TrimPrefix(t, "# ")
		}
		if strings.HasPrefix(strings.ToLower(t), "status:") {
			v := strings.TrimSpace(t[len("status:"):])
			for j := i + 1; v == "" && j < len(lines); j++ {
				v = strings.TrimSpace(lines[j])
			}
			d.Status = v
			break
		}
	}
	return d
}

// NewProject is the registration request.
type NewProject struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Type           string `json:"type"`
	Classification string `json:"classification"`
	Remote         string `json:"remote"`
	DefaultBranch  string `json:"defaultBranch"`
	WorkingBranch  string `json:"workingBranch"`
}

var projectIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)

// projectDirs is the per-project structure from BOOTSTRAP.md §5.
var projectDirs = []string{
	"requirements", "architecture", "uiux/flows", "uiux/screens", "uiux/components",
	"uiux/specifications", "features", "decisions", "reports/sessions", "reports/releases",
	"reports/incidents", "research", "archive",
	"tasks/backlog", "tasks/ready", "tasks/active", "tasks/review", "tasks/blocked",
	"tasks/completed", "tasks/cancelled",
}

// Register adds a project to workspace.yaml and scaffolds projects/<id>/.
func Register(root string, np NewProject) error {
	if !projectIDRe.MatchString(np.ID) {
		return fmt.Errorf("project id must be lowercase letters, digits and dashes")
	}
	if np.DefaultBranch == "" {
		np.DefaultBranch = "main"
	}
	if np.Classification == "" {
		np.Classification = "personal"
	}
	if np.Name == "" {
		np.Name = np.ID
	}
	wsPath := filepath.Join(root, "workspace.yaml")
	doc, err := readNode(wsPath)
	if err != nil {
		return err
	}
	projects := mapGet(doc.Content[0], "projects")
	if projects == nil || projects.Kind != yaml.MappingNode {
		projects = &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
		mapSet(doc.Content[0], "projects", projects)
	}
	if mapGet(projects, np.ID) != nil {
		return fmt.Errorf("project %q is already registered", np.ID)
	}
	projects.Style = 0 // `projects: {}` becomes a block mapping
	entry := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
	mapSet(entry, "name", strNode(np.Name))
	mapSet(entry, "classification", strNode(np.Classification))
	mapSet(entry, "type", strNode(np.Type))
	mapSet(entry, "project_path", strNode("projects/"+np.ID))
	mapSet(entry, "repo_path", strNode("repos/"+np.ID))
	mapSet(entry, "remote", strNode(np.Remote))
	mapSet(entry, "default_branch", strNode(np.DefaultBranch))
	mapSet(entry, "working_branch", optStrNode(&np.WorkingBranch))
	projects.Content = append(projects.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: np.ID}, entry)

	dir := filepath.Join(root, "projects", np.ID)
	if _, err := os.Stat(dir); err == nil {
		return fmt.Errorf("%s already exists", dir)
	}
	if err := scaffold(root, dir, np); err != nil {
		return err
	}
	if err := writeNode(wsPath, doc); err != nil {
		return err
	}
	os.Remove(filepath.Join(root, "projects", ".gitkeep"))
	return nil
}

func scaffold(root, dir string, np NewProject) error {
	for _, d := range projectDirs {
		if err := os.MkdirAll(filepath.Join(dir, filepath.FromSlash(d)), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(d), ".gitkeep"), nil, 0o644); err != nil {
			return err
		}
	}
	doc, err := readNode(filepath.Join(root, "templates", "project.yaml"))
	if err != nil {
		return err
	}
	m := doc.Content[0]
	mapSet(m, "id", strNode(np.ID))
	mapSet(m, "name", strNode(np.Name))
	mapSet(m, "classification", strNode(np.Classification))
	mapSet(m, "type", strNode(np.Type))
	if r := mapGet(m, "repository"); r != nil && r.Kind == yaml.MappingNode {
		mapSet(r, "path", strNode("../../repos/"+np.ID))
		mapSet(r, "remote", strNode(np.Remote))
		mapSet(r, "default_branch", strNode(np.DefaultBranch))
		mapSet(r, "working_branch", optStrNode(&np.WorkingBranch))
	}
	if err := writeNode(filepath.Join(dir, "project.yaml"), doc); err != nil {
		return err
	}
	files := map[string]string{
		"PROJECT.md":                     fmt.Sprintf("# %s\n\nRegistered %s. Run the Analyst discovery pass (`prompts/register-project.md`) to fill this in.\n", np.Name, today()),
		"STATUS.md":                      fmt.Sprintf("# Status — %s\n\nUpdated: %s\nHealth: unknown\n\nNot yet discovered.\n", np.ID, today()),
		"requirements/product.md":        "# Product requirements\n",
		"requirements/technical.md":      "# Technical requirements\n",
		"requirements/constraints.md":    "# Constraints\n",
		"requirements/open-questions.md": "# Open questions\n",
		"architecture/system.md":         "# System architecture\n",
		"architecture/frontend.md":       "# Frontend\n",
		"architecture/backend.md":        "# Backend\n",
		"architecture/infrastructure.md": "# Infrastructure\n",
		"architecture/data-flow.md":      "# Data flow\n",
		"architecture/integrations.md":   "# Integrations\n",
		"uiux/design-system.md":          "# Design system\n",
		"reports/current.md":             fmt.Sprintf("# Project Report — %s — %s\n\nRegistered; discovery pending.\n", np.ID, today()),
	}
	for rel, body := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			return err
		}
		os.Remove(filepath.Join(filepath.Dir(p), ".gitkeep"))
	}
	return nil
}

// RoleInfo describes one of the six workspace roles.
type RoleInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	File        string `json:"file"`
	Description string `json:"description"`
}

// Roles lists the six roles in display order; descriptions come from agents/*.md.
func Roles(root string) []RoleInfo {
	roles := []RoleInfo{
		{ID: "project-manager", Name: "Project Manager", File: "agents/project-manager.md"},
		{ID: "analyst", Name: "Analyst", File: "agents/analyst.md"},
		{ID: "uiux", Name: "UI/UX Designer", File: "agents/uiux-designer.md"},
		{ID: "frontend", Name: "Frontend Engineer", File: "agents/frontend-engineer.md"},
		{ID: "backend", Name: "Backend Engineer", File: "agents/backend-engineer.md"},
		{ID: "infra", Name: "Infrastructure Engineer", File: "agents/infrastructure-engineer.md"},
	}
	for i := range roles {
		b, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(roles[i].File)))
		if err != nil {
			continue
		}
		s := string(b)
		if strings.HasPrefix(s, "---") {
			if end := strings.Index(s[3:], "\n---"); end >= 0 {
				var fm struct {
					Description string `yaml:"description"`
				}
				if yaml.Unmarshal([]byte(s[3:3+end]), &fm) == nil {
					roles[i].Description = fm.Description
				}
			}
		}
	}
	return roles
}

// IsRole reports whether id is one of the six roles.
func IsRole(id string) bool {
	for _, r := range []string{"project-manager", "analyst", "uiux", "frontend", "backend", "infra"} {
		if r == id {
			return true
		}
	}
	return false
}

func today() string { return time.Now().Format("2006-01-02") }
