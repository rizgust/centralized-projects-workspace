package dashboard

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Usage analytics come from Claude Code's own transcripts in
// ~/.claude/projects/<slug>/*.jsonl. Each assistant line carries the message's
// usage, model, session id and working directory. Only messages whose cwd is
// inside the workspace root are counted.

type Tokens struct {
	Input      int64 `json:"input"`
	Output     int64 `json:"output"`
	CacheRead  int64 `json:"cacheRead"`
	CacheWrite int64 `json:"cacheWrite"`
}

type UsageRow struct {
	Input      int64   `json:"input"`
	Output     int64   `json:"output"`
	CacheRead  int64   `json:"cacheRead"`
	CacheWrite int64   `json:"cacheWrite"`
	CostUSD    float64 `json:"costUsd"`
	Messages   int     `json:"messages"`
}

func (r *UsageRow) add(m *usageMsg) {
	r.Input += m.input
	r.Output += m.output
	r.CacheRead += m.cacheRead
	r.CacheWrite += m.cacheWrite5m + m.cacheWrite1h
	r.CostUSD += m.cost
	r.Messages++
}

type DayRow struct {
	Date string `json:"date"`
	UsageRow
}
type ModelRow struct {
	Model string `json:"model"`
	UsageRow
}
type ProjectRow struct {
	Project string `json:"project"`
	UsageRow
}

type SessionInfo struct {
	ID           string  `json:"id"`
	Project      string  `json:"project"`
	Cwd          string  `json:"cwd"`
	Source       string  `json:"source"`
	RunID        *string `json:"runId"`
	StartedAt    string  `json:"startedAt"`
	LastActivity string  `json:"lastActivity"`
	Live         bool    `json:"live"`
	Model        string  `json:"model"`
	Messages     int     `json:"messages"`
	Tokens       Tokens  `json:"tokens"`
	CostUSD      float64 `json:"costUsd"`
}

type Usage struct {
	From             string        `json:"from"`
	To               string        `json:"to"`
	PricingCheckedAt string        `json:"pricingCheckedAt"`
	Totals           UsageRow      `json:"totals"`
	Today            UsageRow      `json:"today"`
	ByDay            []DayRow      `json:"byDay"`
	ByModel          []ModelRow    `json:"byModel"`
	ByProject        []ProjectRow  `json:"byProject"`
	TopSessions      []SessionInfo `json:"topSessions"`
}

type usageMsg struct {
	session, model, cwd, project string
	ts                           time.Time
	input, output, cacheRead     int64
	cacheWrite5m, cacheWrite1h   int64
	cost                         float64
}

type price struct {
	Input     float64  `yaml:"input"`
	Output    float64  `yaml:"output"`
	CacheRead *float64 `yaml:"cache_read"`
}

type pricing struct {
	CheckedAt string           `yaml:"checked_at"`
	Models    map[string]price `yaml:"models"`
}

func loadPricing(root string) pricing {
	var p pricing
	b, err := os.ReadFile(filepath.Join(root, "shared", "knowledge", "model-pricing.yaml"))
	if err == nil {
		_ = yaml.Unmarshal(b, &p)
	}
	if p.Models == nil {
		p.Models = map[string]price{}
	}
	return p
}

// priceFor matches a model id, ignoring date suffixes like -20251101.
func (p pricing) priceFor(model string) (price, bool) {
	best, bestLen := price{}, 0
	for id, pr := range p.Models {
		if (model == id || strings.HasPrefix(model, id+"-")) && len(id) > bestLen {
			best, bestLen = pr, len(id)
		}
	}
	return best, bestLen > 0
}

func (p pricing) cost(m *usageMsg) float64 {
	pr, ok := p.priceFor(m.model)
	if !ok {
		return 0
	}
	read := pr.Input * 0.1
	if pr.CacheRead != nil {
		read = *pr.CacheRead
	}
	return (float64(m.input)*pr.Input + float64(m.output)*pr.Output +
		float64(m.cacheWrite5m)*pr.Input*1.25 + float64(m.cacheWrite1h)*pr.Input*2 +
		float64(m.cacheRead)*read) / 1e6
}

type fileState struct {
	offset int64
	size   int64
}

// usageIndex incrementally tails transcript files and keeps one entry per
// message id (streamed responses repeat the id; the last line wins).
type usageIndex struct {
	root, claudeDir string
	projectOf       func(cwd string) string
	runOfSession    func(session string) *string

	mu      sync.Mutex
	pricing pricing
	files   map[string]*fileState
	msgs    map[string]*usageMsg
}

func newUsageIndex(root string, projectOf func(string) string, runOfSession func(string) *string) *usageIndex {
	home, _ := os.UserHomeDir()
	return &usageIndex{
		root: root, claudeDir: filepath.Join(home, ".claude", "projects"),
		projectOf: projectOf, runOfSession: runOfSession,
		files: map[string]*fileState{}, msgs: map[string]*usageMsg{},
	}
}

func normPath(p string) string {
	return strings.ToLower(strings.TrimRight(filepath.ToSlash(filepath.Clean(p)), "/"))
}

func (u *usageIndex) inWorkspace(cwd string) bool {
	r, c := normPath(u.root), normPath(cwd)
	return c == r || strings.HasPrefix(c, r+"/")
}

// scan reads new bytes from every transcript; cheap when nothing changed.
func (u *usageIndex) scan() {
	pr := loadPricing(u.root)
	var files []string
	_ = filepath.WalkDir(u.claudeDir, func(path string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(path, ".jsonl") {
			files = append(files, path)
		}
		return nil
	})
	u.mu.Lock()
	defer u.mu.Unlock()
	if pr.CheckedAt != u.pricing.CheckedAt || len(pr.Models) != len(u.pricing.Models) {
		u.pricing = pr
		for _, m := range u.msgs {
			m.cost = pr.cost(m)
		}
	}
	for _, f := range files {
		st, err := os.Stat(f)
		if err != nil {
			continue
		}
		fs := u.files[f]
		if fs == nil {
			fs = &fileState{}
			u.files[f] = fs
		}
		if st.Size() < fs.offset { // rewritten
			fs.offset = 0
		}
		if st.Size() == fs.offset {
			continue
		}
		fs.offset = u.readFrom(f, fs.offset)
		fs.size = st.Size()
	}
}

type transcriptLine struct {
	Type      string    `json:"type"`
	SessionID string    `json:"sessionId"`
	Cwd       string    `json:"cwd"`
	Timestamp time.Time `json:"timestamp"`
	RequestID string    `json:"requestId"`
	Message   struct {
		ID    string `json:"id"`
		Model string `json:"model"`
		Usage *struct {
			InputTokens              int64 `json:"input_tokens"`
			OutputTokens             int64 `json:"output_tokens"`
			CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
			CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
			CacheCreation            *struct {
				Ephemeral5m int64 `json:"ephemeral_5m_input_tokens"`
				Ephemeral1h int64 `json:"ephemeral_1h_input_tokens"`
			} `json:"cache_creation"`
		} `json:"usage"`
	} `json:"message"`
}

// readFrom parses complete lines after offset and returns the new offset.
func (u *usageIndex) readFrom(path string, offset int64) int64 {
	f, err := os.Open(path)
	if err != nil {
		return offset
	}
	defer f.Close()
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return offset
	}
	r := bufio.NewReaderSize(f, 1<<20)
	pos := offset
	for {
		line, err := r.ReadBytes('\n')
		if err != nil { // partial last line: re-read next scan
			return pos
		}
		pos += int64(len(line))
		if !bytes.Contains(line, []byte(`"usage"`)) {
			continue
		}
		var tl transcriptLine
		if json.Unmarshal(line, &tl) != nil || tl.Type != "assistant" || tl.Message.Usage == nil {
			continue
		}
		if tl.Message.Model == "<synthetic>" || !u.inWorkspace(tl.Cwd) {
			continue
		}
		us := tl.Message.Usage
		m := &usageMsg{
			session: tl.SessionID, model: tl.Message.Model, cwd: tl.Cwd,
			project: u.projectOf(tl.Cwd), ts: tl.Timestamp,
			input: us.InputTokens, output: us.OutputTokens, cacheRead: us.CacheReadInputTokens,
		}
		if us.CacheCreation != nil {
			m.cacheWrite5m, m.cacheWrite1h = us.CacheCreation.Ephemeral5m, us.CacheCreation.Ephemeral1h
		} else {
			m.cacheWrite5m = us.CacheCreationInputTokens
		}
		m.cost = u.pricing.cost(m)
		key := tl.Message.ID
		if key == "" {
			key = tl.RequestID + "|" + tl.Timestamp.String()
		}
		u.msgs[tl.SessionID+"|"+key] = m
	}
}

// report aggregates the last `days` days in local time.
func (u *usageIndex) report(days int) Usage {
	u.mu.Lock()
	defer u.mu.Unlock()
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -(days - 1))
	todayKey := now.Format("2006-01-02")
	rep := Usage{From: start.Format(time.RFC3339), To: now.Format(time.RFC3339), PricingCheckedAt: u.pricing.CheckedAt}
	byDay := map[string]*UsageRow{}
	byModel := map[string]*UsageRow{}
	byProject := map[string]*UsageRow{}
	for _, m := range u.msgs {
		if m.ts.Before(start) {
			continue
		}
		d := m.ts.In(now.Location()).Format("2006-01-02")
		rep.Totals.add(m)
		if d == todayKey {
			rep.Today.add(m)
		}
		for _, kv := range []struct {
			mp  map[string]*UsageRow
			key string
		}{{byDay, d}, {byModel, m.model}, {byProject, m.project}} {
			row := kv.mp[kv.key]
			if row == nil {
				row = &UsageRow{}
				kv.mp[kv.key] = row
			}
			row.add(m)
		}
	}
	for d := start; !d.After(now); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		row := DayRow{Date: key}
		if r := byDay[key]; r != nil {
			row.UsageRow = *r
		}
		rep.ByDay = append(rep.ByDay, row)
	}
	for k, v := range byModel {
		rep.ByModel = append(rep.ByModel, ModelRow{Model: k, UsageRow: *v})
	}
	sort.Slice(rep.ByModel, func(i, j int) bool { return rep.ByModel[i].CostUSD > rep.ByModel[j].CostUSD })
	for k, v := range byProject {
		rep.ByProject = append(rep.ByProject, ProjectRow{Project: k, UsageRow: *v})
	}
	sort.Slice(rep.ByProject, func(i, j int) bool { return rep.ByProject[i].CostUSD > rep.ByProject[j].CostUSD })
	sessions := u.sessionsLocked(start)
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].CostUSD > sessions[j].CostUSD })
	if len(sessions) > 20 {
		sessions = sessions[:20]
	}
	rep.TopSessions = sessions
	if rep.ByModel == nil {
		rep.ByModel = []ModelRow{}
	}
	if rep.ByProject == nil {
		rep.ByProject = []ProjectRow{}
	}
	return rep
}

// sessions lists sessions active since `since`, newest activity first.
func (u *usageIndex) sessions(since time.Time) []SessionInfo {
	u.mu.Lock()
	defer u.mu.Unlock()
	s := u.sessionsLocked(since)
	sort.Slice(s, func(i, j int) bool { return s[i].LastActivity > s[j].LastActivity })
	return s
}

func (u *usageIndex) sessionsLocked(since time.Time) []SessionInfo {
	type agg struct {
		info        SessionInfo
		first, last time.Time
		models      map[string]int
	}
	all := map[string]*agg{}
	for _, m := range u.msgs {
		a := all[m.session]
		if a == nil {
			a = &agg{info: SessionInfo{ID: m.session, Project: m.project, Cwd: m.cwd}, first: m.ts, last: m.ts, models: map[string]int{}}
			all[m.session] = a
		}
		if m.ts.Before(a.first) {
			a.first = m.ts
		}
		if m.ts.After(a.last) {
			a.last = m.ts
		}
		a.models[m.model]++
		a.info.Messages++
		a.info.Tokens.Input += m.input
		a.info.Tokens.Output += m.output
		a.info.Tokens.CacheRead += m.cacheRead
		a.info.Tokens.CacheWrite += m.cacheWrite5m + m.cacheWrite1h
		a.info.CostUSD += m.cost
	}
	out := []SessionInfo{}
	for _, a := range all {
		if a.last.Before(since) {
			continue
		}
		best := 0
		for model, n := range a.models {
			if n > best {
				a.info.Model, best = model, n
			}
		}
		a.info.StartedAt = a.first.Format(time.RFC3339)
		a.info.LastActivity = a.last.Format(time.RFC3339)
		a.info.Live = time.Since(a.last) < 2*time.Minute
		a.info.Source = "interactive"
		if run := u.runOfSession(a.info.ID); run != nil {
			a.info.Source, a.info.RunID = "run", run
		}
		out = append(out, a.info)
	}
	return out
}

// liveInteractive counts interactive sessions with activity in the last 2 minutes.
func (u *usageIndex) liveInteractive() int {
	n := 0
	for _, s := range u.sessions(time.Now().Add(-2 * time.Minute)) {
		if s.Live && s.Source == "interactive" {
			n++
		}
	}
	return n
}
