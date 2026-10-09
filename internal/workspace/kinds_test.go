package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The real templates/kinds tree must scaffold every kind, and repo-less kinds must
// pass Check without a repository.
func TestRegisterEveryKind(t *testing.T) {
	src, _ := filepath.Abs(filepath.Join("..", ".."))
	root := t.TempDir()
	copyDir(t, filepath.Join(src, "templates"), filepath.Join(root, "templates"))
	ws := "version: 1\n\nprojects: {}\n\npolicies:\n  require_active_project: true\n"
	for f, body := range map[string]string{"workspace.yaml": ws, "WORKSPACE.md": "x", "AGENTS.md": "x", "CLAUDE.md": "x",
		"active-project.yaml": "active_project: null\n"} {
		if err := os.WriteFile(filepath.Join(root, f), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	kinds := Kinds(root)
	if len(kinds) < 5 || kinds[0].Name != "software" {
		t.Fatalf("expected the five built-in kinds, software first: %+v", kinds)
	}
	for _, k := range kinds {
		np := NewProject{ID: "p-" + k.Name, Name: "P " + k.Name, Kind: k.Name}
		if k.Repo == RepoClone {
			np.Remote = "git@example.com:o/r.git"
		}
		if err := Register(root, np); err != nil {
			t.Fatalf("register %s: %v", k.Name, err)
		}
		dir := filepath.Join(root, "projects", np.ID)
		b, err := os.ReadFile(filepath.Join(dir, "PROJECT.md"))
		if err != nil || !strings.Contains(string(b), "P "+k.Name) || strings.Contains(string(b), "{{") {
			t.Fatalf("%s: PROJECT.md not rendered: %s", k.Name, b)
		}
		for _, d := range []string{"tasks/backlog", "decisions", "reports/sessions"} {
			if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(d))); err != nil {
				t.Fatalf("%s: missing %s", k.Name, d)
			}
		}
		if _, err := os.Stat(filepath.Join(dir, "kind.yaml")); err == nil {
			t.Fatalf("%s: kind.yaml must not be copied", k.Name)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "projects", "p-investigation", "report.md")); err != nil {
		t.Fatal("investigation should have report.md")
	}
	c, err := Load(root)
	if err != nil {
		t.Fatal(err)
	}
	if c.Projects["p-investigation"].RepoMode() != RepoNone || c.Projects["p-prototype"].RepoMode() != RepoLocal {
		t.Fatalf("repo modes: %+v", c.Projects)
	}
	// only the repo-backed kinds complain about a missing repo
	for _, p := range Check(root, c) {
		if strings.Contains(p, "p-investigation") || strings.Contains(p, "p-design") || strings.Contains(p, "p-general") {
			t.Fatalf("repo-less project failed check: %s", p)
		}
	}
	if err := Register(root, NewProject{ID: "bad", Kind: "software"}); err == nil {
		t.Fatal("software without a remote must be rejected")
	}
	if err := Register(root, NewProject{ID: "bad2", Kind: "nope"}); err == nil {
		t.Fatal("unknown kind must be rejected")
	}
}

func copyDir(t *testing.T, src, dst string) {
	t.Helper()
	err := filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(target, b, 0o644)
	})
	if err != nil {
		t.Fatal(err)
	}
}
