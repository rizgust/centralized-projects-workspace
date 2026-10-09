package dashboard

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscussionRoundTrip(t *testing.T) {
	root := t.TempDir()
	ds := &discussionStore{root: root}
	disc, err := ds.create("Integration ideas: CRM + billing", "", "analyst", 1, "")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(disc.Path) != filepath.Join(root, "discussions") || disc.Project != nil {
		t.Fatalf("workspace discussion stored at %s", disc.Path)
	}
	run := "run-1"
	reply := "## Options\n\n### A. Webhooks\nCheap.\n\n<!-- not a marker -->\n\nWhich matters more: cost or latency?"
	if _, err := ds.update(disc.ID, func(d *Discussion) error {
		d.Turns = append(d.Turns,
			DiscussionTurn{Who: "owner", Role: "owner", At: "2026-10-08T10:00:00+07:00", Text: "How could they talk?", RunID: &run},
			DiscussionTurn{Who: "agent", Role: "analyst", At: "2026-10-08T10:01:00+07:00", Text: reply, RunID: &run},
			DiscussionTurn{Who: "owner", Role: "owner", At: "2026-10-08T10:05:00+07:00", Text: wrapupPrompt, Wrapup: true},
		)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	got, err := ds.get(disc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Turns) != 3 || got.Turns[1].Text != reply || got.Turns[1].Role != "analyst" || *got.Turns[0].RunID != "run-1" || !got.Turns[2].Wrapup {
		t.Fatalf("round trip lost data: %+v", got.Turns)
	}
	b, _ := os.ReadFile(got.Path)
	if len(b) == 0 || string(b[:4]) != "---\n" {
		t.Fatal("transcript is not a front-matter markdown file")
	}

	proj, err := ds.create("Pricing", "atlas", "analyst", 1, "")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(proj.Path) != filepath.Join(root, "projects", "atlas", "discussions") {
		t.Fatalf("project discussion stored at %s", proj.Path)
	}
	if n := len(ds.list(func(string) *string { return nil })); n != 2 {
		t.Fatalf("expected 2 discussions, got %d", n)
	}
}
