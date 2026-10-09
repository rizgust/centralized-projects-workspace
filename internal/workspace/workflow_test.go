package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkflowPhasesAndReviewWeights(t *testing.T) {
	src, _ := filepath.Abs(filepath.Join("..", ".."))
	root := t.TempDir()
	copyDir(t, filepath.Join(src, "templates"), filepath.Join(root, "templates"))
	if err := os.WriteFile(filepath.Join(root, "workspace.yaml"), []byte("version: 1\n\nprojects: {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Register(root, NewProject{ID: "wf", Name: "WF", Kind: "general"}); err != nil {
		t.Fatal(err)
	}
	c, _ := Load(root)

	wf, err := c.LoadWorkflow(root, "wf")
	if err != nil || wf.Phase != "intake" || wf.Limits.MaxParallel != 2 || wf.Limits.DailyBudgetUSD != 20 {
		t.Fatalf("defaults: %+v %v", wf, err)
	}
	if b := wf.Limits.TaskBudget(intp(5)); b != 3.75 {
		t.Fatalf("budget for weight 5 = %v", b)
	}
	if b := wf.Limits.TaskBudget(intp(13)); b != 9.75 {
		t.Fatalf("budget for weight 13 = %v", b)
	}
	for _, ph := range []string{"brainstorm", "planning", "review"} {
		if _, err := c.SetPhase(root, "wf", ph, "owner", ""); err != nil {
			t.Fatal(err)
		}
	}
	wf, _ = c.LoadWorkflow(root, "wf")
	if wf.Phase != "review" || len(wf.History) != 3 || wf.History[2].By != "owner" {
		t.Fatalf("phase history: %+v", wf.History)
	}
	if _, err := c.SetPhase(root, "wf", "nope", "owner", ""); err == nil {
		t.Fatal("unknown phase accepted")
	}
	b, _ := os.ReadFile(filepath.Join(root, "projects", "wf", "project.yaml"))
	if !strings.Contains(string(b), "kind: general") || !strings.Contains(string(b), "phase: review") {
		t.Fatalf("project.yaml lost data:\n%s", b)
	}

	title, owner, risk := "Do it", "analyst", "low"
	task, err := c.CreateTask(root, "wf", TaskPatch{Title: &title, Owner: &owner, Weight: intp(5), Risk: &risk,
		AcceptanceCriteria: &[]string{"done"}})
	if err != nil {
		t.Fatal(err)
	}
	if miss := task.Unready(); len(miss) != 0 {
		t.Fatalf("task should be ready: %v", miss)
	}
	got, err := c.UpdateTask(root, "wf", task.ID, TaskPatch{Weight: intp(8), OwnerReview: true})
	if err != nil {
		t.Fatal(err)
	}
	if got.ProposedWeight == nil || *got.ProposedWeight != 5 || *got.Weight != 8 || !strings.Contains(strings.Join(got.Notes, "|"), "weight 5 → 8") {
		t.Fatalf("review adjustment not recorded: %+v", got)
	}
	got, _ = c.UpdateTask(root, "wf", task.ID, TaskPatch{Weight: intp(3), OwnerReview: true})
	if *got.ProposedWeight != 5 || *got.Weight != 3 || len(got.Notes) != 2 {
		t.Fatalf("second adjustment must keep the Analyst's original: %+v", got)
	}
	got, _ = c.UpdateTask(root, "wf", task.ID, TaskPatch{Weight: intp(2)})
	if len(got.Notes) != 2 {
		t.Fatal("outside review, weight changes must not add review notes")
	}
}

func intp(i int) *int { return &i }
