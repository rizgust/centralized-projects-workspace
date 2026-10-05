package dashboard

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Owner questions: an agent that needs the Owner's decision writes
// runtime/agent-messages/owner/<id>.yaml and ends its turn. The dashboard shows
// the worker waiting in the Owner's room; answering can resume the run's
// Claude session with the answer as the next prompt.

type Question struct {
	ID         string   `yaml:"id" json:"id"`
	From       string   `yaml:"from" json:"from"` // role id
	Project    string   `yaml:"project" json:"project"`
	Task       *string  `yaml:"task" json:"task"`
	RunID      *string  `yaml:"run_id" json:"runId"`
	SessionID  *string  `yaml:"session_id" json:"sessionId"`
	Question   string   `yaml:"question" json:"question"`
	Context    string   `yaml:"context,omitempty" json:"context"`
	Options    []string `yaml:"options,omitempty" json:"options"`
	Status     string   `yaml:"status" json:"status"` // open | answered | dismissed
	Answer     *string  `yaml:"answer" json:"answer"`
	AskedAt    string   `yaml:"asked_at" json:"askedAt"`
	AnsweredAt *string  `yaml:"answered_at" json:"answeredAt"`
	ResumedRun *string  `yaml:"resumed_run,omitempty" json:"resumedRun"`
	Source     string   `yaml:"source" json:"source"` // agent | auto
}

type questionStore struct {
	dir string
	mu  sync.Mutex
}

func newQuestionStore(root string) *questionStore {
	dir := filepath.Join(root, "runtime", "agent-messages", "owner")
	_ = os.MkdirAll(dir, 0o755)
	return &questionStore{dir: dir}
}

func newID(prefix string) string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return prefix + time.Now().Format("20060102-150405") + "-" + hex.EncodeToString(b)
}

func (q *questionStore) list() []Question {
	q.mu.Lock()
	defer q.mu.Unlock()
	files, _ := filepath.Glob(filepath.Join(q.dir, "*.yaml"))
	out := []Question{}
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var qu Question
		if yaml.Unmarshal(b, &qu) != nil || strings.TrimSpace(qu.Question) == "" {
			continue
		}
		if qu.ID == "" {
			qu.ID = strings.TrimSuffix(filepath.Base(f), ".yaml")
		}
		if qu.Status == "" {
			qu.Status = "open"
		}
		if qu.AskedAt == "" {
			if st, err := os.Stat(f); err == nil {
				qu.AskedAt = st.ModTime().Format(time.RFC3339)
			}
		}
		if qu.Options == nil {
			qu.Options = []string{}
		}
		out = append(out, qu)
	}
	sort.Slice(out, func(i, j int) bool {
		if (out[i].Status == "open") != (out[j].Status == "open") {
			return out[i].Status == "open"
		}
		return out[i].AskedAt > out[j].AskedAt
	})
	return out
}

func (q *questionStore) open() []Question {
	var out []Question
	for _, qu := range q.list() {
		if qu.Status == "open" {
			out = append(out, qu)
		}
	}
	return out
}

func (q *questionStore) get(id string) (Question, error) {
	for _, qu := range q.list() {
		if qu.ID == id {
			return qu, nil
		}
	}
	return Question{}, fmt.Errorf("question %s not found", id)
}

func (q *questionStore) save(qu Question) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if strings.ContainsAny(qu.ID, `/\.`) {
		return fmt.Errorf("invalid question id")
	}
	b, err := yaml.Marshal(qu)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(q.dir, qu.ID+".yaml"), b, 0o644)
}

// hasFor reports whether a run already filed a question (so the auto fallback is skipped).
func (q *questionStore) hasFor(runID string) bool {
	for _, qu := range q.list() {
		if qu.RunID != nil && *qu.RunID == runID {
			return true
		}
	}
	return false
}

// autoQuestion turns a run that ended on a question into an owner question.
func (q *questionStore) autoQuestion(run Run, finalText string) {
	text := strings.TrimSpace(finalText)
	if text == "" || run.Status != "succeeded" || q.hasFor(run.ID) {
		return
	}
	paras := strings.Split(text, "\n\n")
	last := strings.TrimSpace(paras[len(paras)-1])
	if !strings.HasSuffix(strings.TrimRight(last, " *_`)"), "?") {
		return
	}
	runID, sess := run.ID, run.SessionID
	_ = q.save(Question{
		ID: newID("Q-"), From: run.Role, Project: run.Project, Task: run.TaskID,
		RunID: &runID, SessionID: &sess, Question: truncate(last, 2000),
		Context: truncate(text, 4000), Status: "open", Options: []string{},
		AskedAt: time.Now().Format(time.RFC3339), Source: "auto",
	})
}

// ownerQuestionPrompt is appended to every dashboard run's system prompt.
func ownerQuestionPrompt(dir, project, role, runID, sessionID, task string) string {
	return fmt.Sprintf(`If you need a decision or information from the Owner before you can continue, do not guess. Write ONE file %s/<id>.yaml (id: Q-<yyyymmdd-hhmmss>-<role>) with exactly these keys:
id, from: %s, project: %s, task: %s, run_id: %s, session_id: %s, question: (one clear question), context: (2-5 lines: what you found and why you need this), options: (a list of 2-4 concrete choices, or []), status: open, answer: null, asked_at: (RFC3339 now), answered_at: null, source: agent
Then stop and end your turn with that same question. The Owner's answer will arrive as your next prompt in this same session.`,
		filepath.ToSlash(dir), role, project, task, runID, sessionID)
}
