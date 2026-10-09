package dashboard

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/rizgust/centralized-projects-workspace/internal/workspace"
)

func TestAutoQuestion(t *testing.T) {
	qs := newQuestionStore(t.TempDir())
	run := Run{ID: "r1", Role: "backend", Project: "p", SessionID: "s1", Status: "succeeded"}

	qs.autoQuestion(run, "Done. Tests pass.")
	if len(qs.open()) != 0 {
		t.Fatal("a plain report must not create a question")
	}
	qs.autoQuestion(run, "I found two schemas.\n\nShould sessions expire after 7 or 30 days?")
	open := qs.open()
	if len(open) != 1 || open[0].Question != "Should sessions expire after 7 or 30 days?" || open[0].Source != "auto" {
		t.Fatalf("expected one auto question, got %+v", open)
	}
	qs.autoQuestion(run, "Another question?")
	if len(qs.open()) != 1 {
		t.Fatal("a run that already asked must not get a second auto question")
	}
	failed := Run{ID: "r2", Role: "backend", Project: "p", Status: "failed"}
	qs.autoQuestion(failed, "Should I retry?")
	if len(qs.open()) != 1 {
		t.Fatal("failed runs must not create questions")
	}
}

func TestAskingWorker(t *testing.T) {
	q := Question{ID: "Q1", From: "uiux", Project: "p", Question: "Dark or light?", Status: "open"}
	w := workerFor(rolesForTest()[0], "p", nil, nil, []Question{q})
	if w.State != "asking" || w.Bubble != "?" || w.QuestionID == nil || *w.QuestionID != "Q1" {
		t.Fatalf("expected asking worker, got %+v", w)
	}
	running := []Run{{ID: "r", Project: "p", Role: "uiux", Status: "running", LastText: "Edit"}}
	if w := workerFor(rolesForTest()[0], "p", nil, running, []Question{q}); w.State != "working" {
		t.Fatalf("a running agent outranks asking, got %s", w.State)
	}
}

func rolesForTest() []workspace.RoleInfo {
	return []workspace.RoleInfo{{ID: "uiux", Name: "UI/UX Designer"}}
}

func TestSharedAnalyst(t *testing.T) {
	root := t.TempDir()
	ws := "version: 1\n\nprojects:\n  a:\n    kind: general\n    project_path: projects/a\n    repo: none\n  b:\n    kind: general\n    project_path: projects/b\n    repo: none\n"
	if err := os.WriteFile(filepath.Join(root, "workspace.yaml"), []byte(ws), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "agents"), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg, err := workspace.Load(root)
	if err != nil {
		t.Fatal(err)
	}
	runs := []Run{{ID: "r1", Project: "b", Role: "analyst", Status: "running", LastText: "Write"}}
	qs := []Question{{ID: "Q1", From: "analyst", Project: "a", Question: "Scope?", Status: "open"}}
	o := buildOffice(root, cfg, runs, qs, 0)
	for _, room := range o.Rooms {
		for _, w := range room.Workers {
			if w.Role == "analyst" {
				t.Fatalf("project room %s still has an analyst", room.Project)
			}
		}
	}
	for _, w := range o.HQ {
		if w.Role == "analyst" {
			t.Fatal("HQ still has an analyst")
		}
	}
	if o.Analyst.State != "working" || o.Analyst.Project == nil || *o.Analyst.Project != "b" || len(o.Analyst.Busy) != 2 {
		t.Fatalf("shared analyst should be working on b with 2 busy entries: %+v", o.Analyst)
	}
}
