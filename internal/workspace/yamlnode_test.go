package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSpaceTopLevel(t *testing.T) {
	in := "a: 1\nb:\n  c: 2\n# note\n# more\nd: 3\n- x\ne: 4\n"
	want := "a: 1\n\nb:\n  c: 2\n\n# note\n# more\nd: 3\n- x\n\ne: 4\n"
	if got := string(spaceTopLevel([]byte(in))); got != want {
		t.Fatalf("got\n%q\nwant\n%q", got, want)
	}
}

// A task created from the template, then moved, keeps comments and lives in
// the directory matching its status.
func TestCreateAndMoveTask(t *testing.T) {
	root := t.TempDir()
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.MkdirAll(filepath.Join(root, "templates"), 0o755))
	tpl := "id: TASK-000\n\ntitle: null\n\nstatus: backlog          # lifecycle\n\nowner: null\n\nweight: null\n\nnotes: []\n\ngit:\n  branch: agent/TASK-000\n  commit: null\n"
	must(os.WriteFile(filepath.Join(root, "templates", "task.yaml"), []byte(tpl), 0o644))
	cfg := Config{Projects: map[string]Project{"p": {ProjectPath: "projects/p"}}}
	title, owner, w := "Do it", "backend", 5
	task, err := cfg.CreateTask(root, "p", TaskPatch{Title: &title, Owner: &owner, Weight: &w})
	must(err)
	if task.ID != "TASK-001" || task.Status != "backlog" {
		t.Fatalf("unexpected task %+v", task)
	}
	status, note := "review", "ready for review"
	moved, err := cfg.UpdateTask(root, "p", "TASK-001", TaskPatch{Status: &status, AddNote: &note})
	must(err)
	if !strings.HasSuffix(filepath.ToSlash(moved.Path()), "tasks/review/TASK-001.yaml") || len(moved.Notes) != 1 {
		t.Fatalf("unexpected move %+v", moved)
	}
	if _, err := os.Stat(filepath.Join(root, "projects", "p", "tasks", "backlog", "TASK-001.yaml")); !os.IsNotExist(err) {
		t.Fatal("old file still present")
	}
	b, _ := os.ReadFile(moved.Path())
	if !strings.Contains(string(b), "# lifecycle") || !strings.Contains(string(b), "branch: agent/TASK-001") || !strings.Contains(string(b), "\n\nowner:") {
		t.Fatalf("formatting lost:\n%s", b)
	}
	second, err := cfg.CreateTask(root, "p", TaskPatch{Title: &title, Owner: &owner})
	must(err)
	if second.ID != "TASK-002" {
		t.Fatalf("expected TASK-002, got %s", second.ID)
	}
}
