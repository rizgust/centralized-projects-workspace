package workspace

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Project kinds live in templates/kinds/<name>/: a kind.yaml plus the starting files
// copied into projects/<id>/. Not every project is software, so the kind also decides
// whether the project has a repository (clone | local | none).

const (
	RepoClone = "clone" // clone `remote` into repos/<id>
	RepoLocal = "local" // git init a fresh repo in repos/<id>; a remote can be added later
	RepoNone  = "none"  // no repository; agents work in projects/<id>/
)

type KindInfo struct {
	Name        string   `yaml:"-" json:"name"`
	Description string   `yaml:"description" json:"description"`
	Repo        string   `yaml:"repo" json:"repo"`
	Roles       []string `yaml:"roles" json:"roles"`
	Deliverable string   `yaml:"deliverable" json:"deliverable"`
	AgentHint   string   `yaml:"agent_hint" json:"agentHint"`
}

func kindsDir(root string) string { return filepath.Join(root, "templates", "kinds") }

// LoadKind reads templates/kinds/<name>/kind.yaml.
func LoadKind(root, name string) (KindInfo, error) {
	if name == "" || strings.HasPrefix(name, "_") || strings.ContainsAny(name, `/\.`) {
		return KindInfo{}, fmt.Errorf("unknown project kind %q", name)
	}
	b, err := os.ReadFile(filepath.Join(kindsDir(root), name, "kind.yaml"))
	if err != nil {
		return KindInfo{}, fmt.Errorf("unknown project kind %q (no templates/kinds/%s/kind.yaml)", name, name)
	}
	k := KindInfo{Name: name}
	if err := yaml.Unmarshal(b, &k); err != nil {
		return KindInfo{}, fmt.Errorf("templates/kinds/%s/kind.yaml: %w", name, err)
	}
	switch k.Repo {
	case RepoClone, RepoLocal, RepoNone:
	case "":
		k.Repo = RepoNone
	default:
		return KindInfo{}, fmt.Errorf("templates/kinds/%s/kind.yaml: repo must be clone, local or none", name)
	}
	if k.Roles == nil {
		k.Roles = []string{}
	}
	return k, nil
}

// Kinds lists every kind under templates/kinds/, software first.
func Kinds(root string) []KindInfo {
	entries, _ := os.ReadDir(kindsDir(root))
	var out []KindInfo
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), "_") {
			continue
		}
		if k, err := LoadKind(root, e.Name()); err == nil {
			out = append(out, k)
		}
	}
	order := map[string]int{"software": 0, "prototype": 1, "investigation": 2, "design": 3, "general": 4}
	sort.Slice(out, func(i, j int) bool {
		oi, ok := order[out[i].Name]
		if !ok {
			oi = 99
		}
		oj, ok := order[out[j].Name]
		if !ok {
			oj = 99
		}
		if oi != oj {
			return oi < oj
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// KindOf returns the project's kind (default software, for entries written before kinds).
func (p Project) KindOf() string {
	if p.Kind == "" {
		return "software"
	}
	return p.Kind
}

// RepoMode returns clone, local or none, inferring it for older entries.
func (p Project) RepoMode() string {
	switch {
	case p.Repo != "":
		return p.Repo
	case p.RepoPath == "":
		return RepoNone
	case p.Remote != "":
		return RepoClone
	default:
		return RepoLocal
	}
}

// coreDirs exist in every project regardless of kind.
var coreDirs = []string{
	"tasks/backlog", "tasks/ready", "tasks/active", "tasks/review", "tasks/blocked",
	"tasks/completed", "tasks/cancelled", "decisions", "reports/sessions", "archive",
}

// copyKindTemplate copies templates/kinds/_common and templates/kinds/<kind> into dir,
// replacing {{id}}, {{name}}, {{kind}} and {{date}}. kind.yaml is not copied.
func copyKindTemplate(root, kind, dir string, vars map[string]string) error {
	for _, src := range []string{"_common", kind} {
		base := filepath.Join(kindsDir(root), src)
		if _, err := os.Stat(base); err != nil {
			continue
		}
		err := filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(base, path)
			if d.IsDir() || rel == "kind.yaml" {
				return nil
			}
			b, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			s := string(b)
			for k, v := range vars {
				s = strings.ReplaceAll(s, "{{"+k+"}}", v)
			}
			target := filepath.Join(dir, rel)
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			return os.WriteFile(target, []byte(s), 0o644)
		})
		if err != nil {
			return err
		}
	}
	for _, d := range coreDirs {
		p := filepath.Join(dir, filepath.FromSlash(d))
		if err := os.MkdirAll(p, 0o755); err != nil {
			return err
		}
		if entries, _ := os.ReadDir(p); len(entries) == 0 {
			if err := os.WriteFile(filepath.Join(p, ".gitkeep"), nil, 0o644); err != nil {
				return err
			}
		}
	}
	// a .gitkeep is only needed in otherwise empty directories
	return filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() {
			removeGitkeep(path)
		}
		return nil
	})
}
