package dashboard

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Discussions are conversations between the Owner and one role (the Analyst by
// default): brainstorming, exploring options, finding integration possibilities.
// They are not tasks: every turn is a plan-mode (read-only) agent run that resumes
// one Claude session. The transcript is versioned project knowledge:
//   projects/<id>/discussions/<discussion-id>.md   (project discussion)
//   discussions/<discussion-id>.md                 (workspace-wide discussion)

type DiscussionMeta struct {
	ID        string  `yaml:"id" json:"id"`
	Topic     string  `yaml:"topic" json:"topic"`
	Project   *string `yaml:"project" json:"project"` // null = workspace-wide
	Role      string  `yaml:"role" json:"role"`
	SessionID *string `yaml:"session_id" json:"sessionId"`
	Status    string  `yaml:"status" json:"status"` // open | closed
	BudgetUSD float64 `yaml:"budget_usd" json:"budgetUsd"`
	Model     *string `yaml:"model,omitempty" json:"model"`
	CreatedAt string  `yaml:"created_at" json:"createdAt"`
	UpdatedAt string  `yaml:"updated_at" json:"updatedAt"`
	CostUSD   float64 `yaml:"cost_usd" json:"costUsd"`
	WrappedUp bool    `yaml:"wrapped_up" json:"wrappedUp"`
}

type DiscussionTurn struct {
	Who    string  `json:"who"` // owner | agent
	Role   string  `json:"role"`
	At     string  `json:"at"`
	Text   string  `json:"text"`
	RunID  *string `json:"runId"`
	Wrapup bool    `json:"wrapup"`
	Error  bool    `json:"error"`
}

type Discussion struct {
	DiscussionMeta
	Path    string           `json:"path"`
	Turns   []DiscussionTurn `json:"turns"`
	Running *string          `json:"running"` // run id of the turn in progress
}

type DiscussionSummary struct {
	DiscussionMeta
	Path        string  `json:"path"`
	Turns       int     `json:"turns"`
	LastMessage string  `json:"lastMessage"`
	Running     *string `json:"running"`
}

type discussionStore struct {
	root string
	mu   sync.Mutex
}

var (
	turnMarker = regexp.MustCompile(`(?m)^<!-- turn: (owner|agent) ([a-z-]+) (\S+)( run=\S+)?( wrapup)?( error)? -->\n`)
	slugRe     = regexp.MustCompile(`[^a-z0-9]+`)
)

func slug(s string) string {
	s = strings.Trim(slugRe.ReplaceAllString(strings.ToLower(s), "-"), "-")
	if len(s) > 40 {
		s = strings.Trim(s[:40], "-")
	}
	if s == "" {
		s = "discussion"
	}
	return s
}

func (d *discussionStore) files() []string {
	var out []string
	for _, pat := range []string{
		filepath.Join(d.root, "discussions", "*.md"),
		filepath.Join(d.root, "projects", "*", "discussions", "*.md"),
	} {
		m, _ := filepath.Glob(pat)
		out = append(out, m...)
	}
	return out
}

func (d *discussionStore) pathFor(meta DiscussionMeta) string {
	if meta.Project != nil && *meta.Project != "" {
		return filepath.Join(d.root, "projects", *meta.Project, "discussions", meta.ID+".md")
	}
	return filepath.Join(d.root, "discussions", meta.ID+".md")
}

func parseDiscussion(path string, b []byte) (Discussion, error) {
	s := strings.ReplaceAll(string(b), "\r\n", "\n")
	if !strings.HasPrefix(s, "---\n") {
		return Discussion{}, fmt.Errorf("%s: missing front matter", path)
	}
	end := strings.Index(s[4:], "\n---\n")
	if end < 0 {
		return Discussion{}, fmt.Errorf("%s: unterminated front matter", path)
	}
	var meta DiscussionMeta
	if err := yaml.Unmarshal([]byte(s[4:4+end]), &meta); err != nil {
		return Discussion{}, fmt.Errorf("%s: %w", path, err)
	}
	body := s[4+end+5:]
	disc := Discussion{DiscussionMeta: meta, Path: path, Turns: []DiscussionTurn{}}
	locs := turnMarker.FindAllStringSubmatchIndex(body, -1)
	for i, loc := range locs {
		m := turnMarker.FindStringSubmatch(body[loc[0]:loc[1]])
		textEnd := len(body)
		if i+1 < len(locs) {
			textEnd = locs[i+1][0]
		}
		text := strings.TrimSpace(body[loc[1]:textEnd])
		// drop the visible header line written under each marker
		if nl := strings.Index(text, "\n"); nl >= 0 && strings.HasPrefix(text, "**") {
			text = strings.TrimSpace(text[nl+1:])
		} else if strings.HasPrefix(text, "**") {
			text = ""
		}
		t := DiscussionTurn{Who: m[1], Role: m[2], At: m[3], Text: text, Wrapup: m[5] != "", Error: m[6] != ""}
		if m[4] != "" {
			id := strings.TrimPrefix(strings.TrimSpace(m[4]), "run=")
			t.RunID = &id
		}
		disc.Turns = append(disc.Turns, t)
	}
	return disc, nil
}

func (d *discussionStore) write(disc Discussion) error {
	var buf bytes.Buffer
	head, err := yaml.Marshal(disc.DiscussionMeta)
	if err != nil {
		return err
	}
	buf.WriteString("---\n")
	buf.Write(head)
	buf.WriteString("---\n\n# " + disc.Topic + "\n")
	for _, t := range disc.Turns {
		marker := fmt.Sprintf("<!-- turn: %s %s %s", t.Who, t.Role, t.At)
		if t.RunID != nil {
			marker += " run=" + *t.RunID
		}
		if t.Wrapup {
			marker += " wrapup"
		}
		if t.Error {
			marker += " error"
		}
		who := "Owner"
		if t.Who == "agent" {
			who = roleName(t.Role)
		}
		label := ""
		if t.Wrapup {
			label = " (wrap-up)"
		}
		at, _ := time.Parse(time.RFC3339, t.At)
		fmt.Fprintf(&buf, "\n%s -->\n**%s%s** · %s\n\n%s\n", marker, who, label, at.Format("2006-01-02 15:04"), strings.TrimSpace(t.Text))
	}
	if err := os.MkdirAll(filepath.Dir(disc.Path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(disc.Path, buf.Bytes(), 0o644)
}

func roleName(id string) string {
	names := map[string]string{"analyst": "Analyst", "project-manager": "Project Manager", "uiux": "UI/UX Designer",
		"frontend": "Frontend Engineer", "backend": "Backend Engineer", "infra": "Infrastructure Engineer"}
	if n, ok := names[id]; ok {
		return n
	}
	return id
}

func (d *discussionStore) get(id string) (Discussion, error) {
	for _, f := range d.files() {
		if strings.TrimSuffix(filepath.Base(f), ".md") != id {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			return Discussion{}, err
		}
		return parseDiscussion(f, b)
	}
	return Discussion{}, fmt.Errorf("discussion %s not found", id)
}

func (d *discussionStore) list(running func(id string) *string) []DiscussionSummary {
	d.mu.Lock()
	defer d.mu.Unlock()
	out := []DiscussionSummary{}
	for _, f := range d.files() {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		disc, err := parseDiscussion(f, b)
		if err != nil {
			continue
		}
		sum := DiscussionSummary{DiscussionMeta: disc.DiscussionMeta, Path: f, Turns: len(disc.Turns), Running: running(disc.ID)}
		if n := len(disc.Turns); n > 0 {
			sum.LastMessage = truncate(disc.Turns[n-1].Text, 160)
		}
		out = append(out, sum)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out
}

func (d *discussionStore) create(topic, project, role string, budget float64, model string) (Discussion, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if strings.TrimSpace(topic) == "" {
		return Discussion{}, fmt.Errorf("topic is required")
	}
	now := time.Now().Format(time.RFC3339)
	meta := DiscussionMeta{
		ID:    "D-" + time.Now().Format("20060102-1504") + "-" + slug(topic),
		Topic: strings.TrimSpace(topic), Role: role, Status: "open", BudgetUSD: budget,
		CreatedAt: now, UpdatedAt: now,
	}
	if project != "" {
		meta.Project = &project
	}
	if model != "" {
		meta.Model = &model
	}
	disc := Discussion{DiscussionMeta: meta, Turns: []DiscussionTurn{}}
	disc.Path = d.pathFor(meta)
	if _, err := os.Stat(disc.Path); err == nil {
		return Discussion{}, fmt.Errorf("discussion %s already exists", meta.ID)
	}
	return disc, d.write(disc)
}

// update applies fn to a discussion under the lock and writes it back.
func (d *discussionStore) update(id string, fn func(*Discussion) error) (Discussion, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	disc, err := d.get(id)
	if err != nil {
		return Discussion{}, err
	}
	if err := fn(&disc); err != nil {
		return Discussion{}, err
	}
	disc.UpdatedAt = time.Now().Format(time.RFC3339)
	return disc, d.write(disc)
}

const wrapupPrompt = "Please wrap up this discussion now, using the sections from your instructions: Summary, Ideas, Decisions, Next steps and Open questions. Keep it tight and concrete."
