package dashboard

import (
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
