// Package workspace reads workspace.yaml and materializes the parts of the
// workspace that are not in git: repos/<id> clones, worktrees/ and runtime/.
// The repo root is the workspace, so cloning it and running `pcctl init` is
// enough to rebuild a workspace on a new machine.
package workspace

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

type Project struct {
	Name           string `yaml:"name"`
	Kind           string `yaml:"kind"` // templates/kinds/<kind>; default software
	Classification string `yaml:"classification"`
	Type           string `yaml:"type"`
	Repo           string `yaml:"repo"` // clone | local | none (inferred when empty)
	ProjectPath    string `yaml:"project_path"`
	RepoPath       string `yaml:"repo_path"`
	Remote         string `yaml:"remote"`
	DefaultBranch  string `yaml:"default_branch"`
	WorkingBranch  string `yaml:"working_branch"`
}

type Config struct {
	Projects map[string]Project `yaml:"projects"`
}

func Load(root string) (Config, error) {
	var c Config
	b, err := os.ReadFile(filepath.Join(root, "workspace.yaml"))
	if err != nil {
		return c, err
	}
	if err := yaml.Unmarshal(b, &c); err != nil {
		return c, fmt.Errorf("workspace.yaml: %w", err)
	}
	return c, nil
}

// IDs returns project ids in a stable order.
func (c Config) IDs() []string {
	ids := make([]string, 0, len(c.Projects))
	for id := range c.Projects {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

type InitOptions struct {
	DryRun  bool
	NoClone bool
}

// Init creates the gitignored directories and clones missing project repos.
// It never deletes anything and never touches an existing repo.
func Init(root string, c Config, opt InitOptions, log io.Writer) error {
	act := func(format string, a ...any) { fmt.Fprintf(log, format+"\n", a...) }

	for _, d := range []string{
		"repos", "worktrees",
		filepath.Join("runtime", "locks"),
		filepath.Join("runtime", "logs"),
		filepath.Join("runtime", "agent-messages"),
	} {
		d = filepath.Join(root, d)
		if _, err := os.Stat(d); os.IsNotExist(err) {
			act("mkdir  %s", d)
			if !opt.DryRun {
				if err := os.MkdirAll(d, 0o755); err != nil {
					return err
				}
			}
		}
	}

	for _, id := range c.IDs() {
		p := c.Projects[id]
		mode := p.RepoMode()
		if mode == RepoNone {
			act("ok     %s (no repository)", id)
			continue
		}
		repo := filepath.Join(root, filepath.FromSlash(p.RepoPath))
		if _, err := os.Stat(repo); err == nil {
			act("ok     %s -> %s", id, repo)
			continue
		}
		if mode == RepoLocal {
			branch := p.DefaultBranch
			if branch == "" {
				branch = "main"
			}
			act("init   %s: git init -b %s %s", id, branch, repo)
			if opt.DryRun {
				continue
			}
			cmd := exec.Command("git", "init", "-b", branch, repo)
			cmd.Stdout, cmd.Stderr = log, log
			if err := cmd.Run(); err != nil {
				return fmt.Errorf("git init %s: %w", id, err)
			}
			continue
		}
		if opt.NoClone || p.Remote == "" {
			act("skip   %s: %s missing (no clone)", id, repo)
			continue
		}
		args := []string{"clone", p.Remote, repo}
		if p.WorkingBranch != "" {
			args = []string{"clone", "--branch", p.WorkingBranch, p.Remote, repo}
		}
		act("clone  %s: git %s", id, strings.Join(args, " "))
		if opt.DryRun {
			continue
		}
		cmd := exec.Command("git", args...)
		cmd.Stdout, cmd.Stderr = log, log
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("clone %s: %w", id, err)
		}
	}
	return nil
}

var taskStates = []string{"backlog", "ready", "active", "review", "blocked", "completed", "cancelled"}

// skipDirs are never scanned for YAML: product repos, references, dependency trees.
var skipDirs = map[string]bool{".git": true, "__ref": true, "repos": true, "worktrees": true, "node_modules": true}

// Check validates the workspace: required files, YAML parse, repo paths,
// and that every task file's status matches its directory.
func Check(root string, c Config) []string {
	var problems []string
	bad := func(format string, a ...any) { problems = append(problems, fmt.Sprintf(format, a...)) }

	for _, f := range []string{"WORKSPACE.md", "AGENTS.md", "CLAUDE.md", "workspace.yaml", "active-project.yaml"} {
		if _, err := os.Stat(filepath.Join(root, f)); err != nil {
			bad("missing %s", f)
		}
	}
	for _, id := range c.IDs() {
		p := c.Projects[id]
		proj := filepath.Join(root, filepath.FromSlash(p.ProjectPath))
		for _, f := range []string{"PROJECT.md", "project.yaml", "STATUS.md"} {
			if _, err := os.Stat(filepath.Join(proj, f)); err != nil {
				bad("%s: missing %s", id, f)
			}
		}
		if _, err := LoadKind(root, p.KindOf()); err != nil {
			bad("%s: %v", id, err)
		}
		if p.RepoMode() != RepoNone {
			if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(p.RepoPath), ".git")); err != nil {
				bad("%s: repo not found at %s (run pcctl init)", id, p.RepoPath)
			}
		}
		for _, state := range taskStates {
			files, _ := filepath.Glob(filepath.Join(proj, "tasks", state, "*.yaml"))
			for _, f := range files {
				var t struct {
					Status string `yaml:"status"`
				}
				b, _ := os.ReadFile(f)
				if err := yaml.Unmarshal(b, &t); err != nil {
					bad("%s: %v", f, err)
					continue
				}
				if t.Status != state {
					bad("%s: status %q but in tasks/%s", f, t.Status, state)
				}
			}
		}
	}
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && skipDirs[d.Name()] {
			return filepath.SkipDir
		}
		if !d.IsDir() && (strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml")) {
			var v any
			b, _ := os.ReadFile(path)
			if err := yaml.Unmarshal(b, &v); err != nil {
				bad("%s: %v", path, err)
			}
		}
		return nil
	})
	return problems
}
