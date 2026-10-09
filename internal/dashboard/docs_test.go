package dashboard

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDocPathStaysInProject(t *testing.T) {
	root := t.TempDir()
	ws := "version: 1\n\nprojects:\n  p:\n    name: P\n    kind: general\n    project_path: projects/p\n    repo: none\n"
	if err := os.WriteFile(filepath.Join(root, "workspace.yaml"), []byte(ws), 0o644); err != nil {
		t.Fatal(err)
	}
	s := &server{root: root}
	for _, ok := range []string{"brief.md", "requirements/product.md", "notes/2026/a.MD"} {
		if _, err := s.docPath("p", ok); err != nil {
			t.Errorf("%s should be allowed: %v", ok, err)
		}
	}
	for _, bad := range []string{"../../workspace.yaml", "../q/brief.md", "project.yaml", "tasks/ready/TASK-001.yaml",
		"/etc/passwd.md", "C:/x.md", "..\\..\\AGENTS.md", "a/../../b.md"} {
		if _, err := s.docPath("p", bad); err == nil {
			t.Errorf("%s must be rejected", bad)
		}
	}
	if _, err := s.docPath("nope", "brief.md"); err == nil {
		t.Error("unknown project must be rejected")
	}
}
