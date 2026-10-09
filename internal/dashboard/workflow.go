package dashboard

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rizgust/centralized-projects-workspace/internal/workspace"
	"gopkg.in/yaml.v3"
)

// The Owner's workflow engine (see AGENTS.md → "Owner workflow"):
//   - starts the Analyst's planning / revision runs and the PM's kickoff, delegation
//     proposal, report and briefing runs from prompts/workflow/*.md;
//   - records Owner approvals (plan, delegation proposals) as project files;
//   - dispatches approved delegations within the project's limits;
//   - triggers PM reports on milestones, daily, every few hours, and on demand.

type DelegationItem struct {
	Task           string  `yaml:"task" json:"task"`
	Role           string  `yaml:"role" json:"role"`
	BudgetUSD      float64 `yaml:"budget_usd" json:"budgetUsd"`
	PermissionMode string  `yaml:"permission_mode" json:"permissionMode"`
	Note           string  `yaml:"note" json:"note"`
	// proposed | queued (approved, waiting for a slot) | launched | done | failed | skipped
	Status string  `yaml:"status" json:"status"`
	RunID  *string `yaml:"run_id,omitempty" json:"runId"`
	Detail string  `yaml:"detail,omitempty" json:"detail"`
}

type Delegation struct {
	ID         string           `yaml:"id" json:"id"`
	CreatedAt  string           `yaml:"created_at" json:"createdAt"`
	Status     string           `yaml:"status" json:"status"` // proposed | approved | rejected | launched
	Reason     string           `yaml:"reason" json:"reason"`
	Items      []DelegationItem `yaml:"items" json:"items"`
	DecidedAt  *string          `yaml:"decided_at,omitempty" json:"decidedAt"`
	Comment    string           `yaml:"comment,omitempty" json:"comment"`
	Path       string           `yaml:"-" json:"path"`
	ProposedBy string           `yaml:"proposed_by,omitempty" json:"proposedBy"`
}

type wfState struct {
	LastDelegateAt   time.Time `json:"lastDelegateAt"`
	LastReportAt     time.Time `json:"lastReportAt"`
	LastDailyDate    string    `json:"lastDailyDate"`
	LastActivityAt   time.Time `json:"lastActivityAt"`
	MilestoneReasons []string  `json:"milestoneReasons"`
	MilestoneSince   time.Time `json:"milestoneSince"`
}

type arrangement struct{ project, role, topic string }

type workflowEngine struct {
	s        *server
	mu       sync.Mutex
	states   map[string]*wfState
	arranges map[string]arrangement // PM briefing run id -> discussion to open
}

func newWorkflowEngine(s *server) *workflowEngine {
	return &workflowEngine{s: s, states: map[string]*wfState{}, arranges: map[string]arrangement{}}
}

func (e *workflowEngine) statePath(project string) string {
	return filepath.Join(e.s.root, "runtime", "workflow", project+".json")
}

func (e *workflowEngine) state(project string) *wfState {
	if st, ok := e.states[project]; ok {
		return st
	}
	st := &wfState{}
	if b, err := os.ReadFile(e.statePath(project)); err == nil {
		_ = json.Unmarshal(b, st)
	}
	e.states[project] = st
	return st
}

func (e *workflowEngine) save(project string) {
	st := e.states[project]
	if st == nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(e.statePath(project)), 0o755)
	b, _ := json.MarshalIndent(st, "", "  ")
	_ = os.WriteFile(e.statePath(project), b, 0o644)
}

// ---- delegations ------------------------------------------------------------

func (s *server) delegationDir(project string) string {
	p := s.cfg().Projects[project]
	return filepath.Join(s.root, filepath.FromSlash(p.ProjectPath), "delegations")
}

func (s *server) delegations(project string) []Delegation {
	files, _ := filepath.Glob(filepath.Join(s.delegationDir(project), "*.yaml"))
	out := []Delegation{}
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var d Delegation
		if yaml.Unmarshal(b, &d) != nil || len(d.Items) == 0 {
			continue
		}
		if d.ID == "" {
			d.ID = strings.TrimSuffix(filepath.Base(f), ".yaml")
		}
		if d.Status == "" {
			d.Status = "proposed"
		}
		for i := range d.Items {
			if d.Items[i].Status == "" {
				d.Items[i].Status = d.Status
				if d.Status == "approved" {
					d.Items[i].Status = "queued"
				}
			}
			if d.Items[i].PermissionMode == "" {
				d.Items[i].PermissionMode = "acceptEdits"
			}
		}
		d.Path = f
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out
}

func saveDelegation(d Delegation) error {
	b, err := yaml.Marshal(d)
	if err != nil {
		return err
	}
	return os.WriteFile(d.Path, b, 0o644)
}

// ---- helpers ----------------------------------------------------------------

func (s *server) projectRuns(project string) []Run {
	var out []Run
	for _, r := range s.runs.list() {
		if r.Project == project {
			out = append(out, r)
		}
	}
	return out
}

// spentToday is the project's API cost today plus the budgets reserved by running runs.
func (s *server) spentToday(project string) float64 {
	today := time.Now().Format("2006-01-02")
	total := 0.0
	for _, r := range s.projectRuns(project) {
		started, _ := time.Parse(time.RFC3339, r.StartedAt)
		if started.Format("2006-01-02") != today {
			continue
		}
		if r.Status == "running" {
			total += r.BudgetUSD
		} else if r.CostUSD != nil {
			total += *r.CostUSD
		}
	}
	return total
}

func (s *server) runningWork(project string) int {
	n := 0
	for _, r := range s.projectRuns(project) {
		if r.Status == "running" && r.Purpose == "work" {
			n++
		}
	}
	return n
}

func (s *server) pmBusy(project string) bool {
	for _, r := range s.projectRuns(project) {
		if r.Status == "running" && (r.Role == "project-manager" || r.Purpose == "plan" || r.Purpose == "revise") {
			return true
		}
	}
	return false
}

func (s *server) sholatActive() bool {
	pc := loadPrayerConfig(s.root)
	return prayerStatus(pc, time.Now()).Active != nil && pc.HoldLaunches
}

func (s *server) holdResponse(w http.ResponseWriter, override bool) bool {
	pc := loadPrayerConfig(s.root)
	if st := prayerStatus(pc, time.Now()); st.Active != nil && pc.HoldLaunches && !override {
		end, _ := time.Parse(time.RFC3339, st.Active.EndsAt)
		writeErr(w, http.StatusLocked, fmt.Errorf("agents are at sholat %s until %s; retry with override", st.Active.Name, end.Format("15:04")))
		return true
	}
	return false
}

var placeholderRe = regexp.MustCompile(`\{\{[a-z_]+\}\}`)

// startWorkflowRun renders prompts/workflow/<file> and starts the role's run.
func (s *server) startWorkflowRun(project, role, purpose, file, mode string, budget float64, extra map[string]string) (Run, error) {
	cfg := s.cfg()
	p, ok := cfg.Projects[project]
	if !ok {
		return Run{}, fmt.Errorf("unknown project %q", project)
	}
	b, err := os.ReadFile(filepath.Join(s.root, "prompts", "workflow", file))
	if err != nil {
		return Run{}, fmt.Errorf("missing prompts/workflow/%s", file)
	}
	kind, _ := workspace.LoadKind(s.root, p.KindOf())
	name := p.Name
	if name == "" {
		name = project
	}
	vars := map[string]string{
		"project": project, "name": name, "kind": p.KindOf(),
		"project_dir":    filepath.Join(s.root, filepath.FromSlash(p.ProjectPath)),
		"roles":          strings.Join(kind.Roles, ", "),
		"deliverable":    kind.Deliverable,
		"now":            time.Now().Format("2006-01-02-1504"),
		"delegation_dir": s.delegationDir(project),
	}
	for k, v := range extra {
		vars[k] = v
	}
	prompt := string(b)
	for k, v := range vars {
		prompt = strings.ReplaceAll(prompt, "{{"+k+"}}", v)
	}
	prompt = placeholderRe.ReplaceAllString(prompt, "(n/a)")
	req := RunRequest{Project: project, Role: role, Prompt: prompt, PermissionMode: mode, BudgetUSD: budget, purpose: purpose}
	if wf, err := cfg.LoadWorkflow(s.root, project); err == nil && wf.Limits.Model != "" {
		m := wf.Limits.Model
		req.Model = &m
	}
	return s.runs.start(cfg, req)
}

func (s *server) startReport(project, reportType string, reasons []string, wf workspace.Workflow) (Run, error) {
	st := s.wf.state(project)
	since := "the start of the project"
	if !st.LastReportAt.IsZero() {
		since = st.LastReportAt.Format("2006-01-02 15:04")
	}
	if len(reasons) == 0 {
		reasons = []string{reportType + " report"}
	}
	run, err := s.startWorkflowRun(project, "project-manager", "report", "pm-report.md", "acceptEdits", wf.Limits.PMBudgetUSD,
		map[string]string{"report_type": reportType, "reasons": strings.Join(reasons, "; "), "since": since})
	if err == nil {
		st.LastReportAt = time.Now()
		s.wf.save(project)
	}
	return run, err
}

func (s *server) startDelegate(project string, wf workspace.Workflow) (Run, error) {
	busy := []string{}
	for _, r := range s.projectRuns(project) {
		if r.Status == "running" && r.TaskID != nil {
			busy = append(busy, *r.TaskID+" (running)")
		}
	}
	for _, d := range s.delegations(project) {
		for _, it := range d.Items {
			if it.Status == "proposed" || it.Status == "queued" {
				busy = append(busy, it.Task+" ("+it.Status+")")
			}
		}
	}
	free := wf.Limits.MaxParallel - s.runningWork(project)
	if free < 1 {
		free = 1
	}
	run, err := s.startWorkflowRun(project, "project-manager", "delegate", "pm-delegate.md", "acceptEdits", wf.Limits.PMBudgetUSD,
		map[string]string{
			"free_slots": strconv.Itoa(free), "busy": strings.Join(busy, ", "),
			"per_weight": fmt.Sprintf("%.2f", wf.Limits.BudgetPerWeight), "max_task": fmt.Sprintf("%.2f", wf.Limits.MaxTaskBudget),
			"daily_budget": fmt.Sprintf("%.2f", wf.Limits.DailyBudgetUSD), "spent_today": fmt.Sprintf("%.2f", s.spentToday(project)),
		})
	if err == nil {
		s.wf.state(project).LastDelegateAt = time.Now()
		s.wf.save(project)
	}
	return run, err
}

// ---- scheduler ----------------------------------------------------------------

// tick runs every 20 s: dispatch approved delegations, then trigger PM proposals and reports.
func (e *workflowEngine) tick() {
	e.mu.Lock()
	defer e.mu.Unlock()
	s := e.s
	cfg := s.cfg()
	sholat := s.sholatActive()
	for _, id := range cfg.IDs() {
		wf, err := cfg.LoadWorkflow(s.root, id)
		if err != nil || wf.Phase != "execution" {
			continue
		}
		if !sholat {
			e.dispatch(id, wf)
		}
		if sholat || s.pmBusy(id) {
			continue
		}
		st := e.state(id)
		now := time.Now()
		// milestone reports, coalesced over 2 minutes
		if wf.Reports.Milestones && len(st.MilestoneReasons) > 0 && now.Sub(st.MilestoneSince) >= 2*time.Minute {
			typ := "milestone"
			for _, r := range st.MilestoneReasons {
				if strings.HasPrefix(r, "all tasks") {
					typ = "final"
				}
			}
			reasons := st.MilestoneReasons
			st.MilestoneReasons = nil
			e.save(id)
			_, _ = s.startReport(id, typ, reasons, wf)
			continue
		}
		// daily summary
		if hm := wf.Reports.DailyAt; hm != "" && st.LastDailyDate != now.Format("2006-01-02") {
			if t, err := time.ParseInLocation("15:04", hm, now.Location()); err == nil {
				due := time.Date(now.Year(), now.Month(), now.Day(), t.Hour(), t.Minute(), 0, 0, now.Location())
				if !now.Before(due) {
					st.LastDailyDate = now.Format("2006-01-02")
					e.save(id)
					_, _ = s.startReport(id, "daily", []string{"daily summary"}, wf)
					continue
				}
			}
		}
		// progress note every N hours, only when something happened
		if wf.Reports.EveryHours > 0 && st.LastActivityAt.After(st.LastReportAt) &&
			now.Sub(st.LastReportAt) >= time.Duration(wf.Reports.EveryHours)*time.Hour {
			_, _ = s.startReport(id, "progress", []string{fmt.Sprintf("%d-hour progress note", wf.Reports.EveryHours)}, wf)
			continue
		}
		// next delegation proposal
		if e.wantsProposal(id, wf, st) {
			_, _ = s.startDelegate(id, wf)
		}
	}
}

func (e *workflowEngine) wantsProposal(id string, wf workspace.Workflow, st *wfState) bool {
	s := e.s
	if wf.Limits.MaxParallel-s.runningWork(id) < 1 || s.spentToday(id) >= wf.Limits.DailyBudgetUSD {
		return false
	}
	busy := map[string]bool{}
	for _, d := range s.delegations(id) {
		for _, it := range d.Items {
			if it.Status == "proposed" {
				return false // waiting for the Owner
			}
			if it.Status == "queued" || it.Status == "launched" {
				busy[it.Task] = true
			}
		}
	}
	for _, r := range s.projectRuns(id) {
		if r.Status == "running" && r.TaskID != nil {
			busy[*r.TaskID] = true
		}
	}
	tasks, _ := s.cfg().LoadTasks(s.root, id)
	ready := false
	for _, t := range tasks {
		if (t.Status == "ready" || t.Status == "backlog") && !busy[t.ID] {
			ready = true
			break
		}
	}
	if !ready {
		return false
	}
	return time.Since(st.LastDelegateAt) >= 10*time.Minute || st.LastActivityAt.After(st.LastDelegateAt)
}

// dispatch launches approved (queued) delegation items within the limits.
func (e *workflowEngine) dispatch(id string, wf workspace.Workflow) {
	s := e.s
	for _, d := range s.delegations(id) {
		if d.Status != "approved" {
			continue
		}
		changed := false
		for i := range d.Items {
			it := &d.Items[i]
			if it.Status != "queued" {
				continue
			}
			if s.runningWork(id) >= wf.Limits.MaxParallel || s.spentToday(id)+it.BudgetUSD > wf.Limits.DailyBudgetUSD {
				break
			}
			task, err := s.cfg().FindTask(s.root, id, it.Task)
			if err != nil || task.Status == "completed" || task.Status == "cancelled" {
				it.Status, it.Detail, changed = "skipped", "task not found or already finished", true
				continue
			}
			taskID := it.Task
			req := RunRequest{Project: id, Role: it.Role, TaskID: &taskID,
				Prompt: "Work on your task: " + task.Title + ". " + it.Note, PermissionMode: it.PermissionMode, BudgetUSD: it.BudgetUSD}
			if wf.Limits.Model != "" {
				m := wf.Limits.Model
				req.Model = &m
			}
			run, err := s.runs.start(s.cfg(), req)
			if err != nil {
				it.Status, it.Detail = "failed", err.Error()
			} else {
				it.Status, it.RunID = "launched", &run.ID
			}
			changed = true
		}
		done := true
		for _, it := range d.Items {
			if it.Status == "queued" {
				done = false
			}
		}
		if done {
			d.Status, changed = "launched", true
		}
		if changed {
			_ = saveDelegation(d)
			s.hub.publish("workflow", map[string]string{"project": id})
		}
	}
}

// runFinished updates delegations, milestones and phases when any project run ends.
func (e *workflowEngine) runFinished(run Run, final string) {
	if run.Project == "" {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	s := e.s
	st := e.state(run.Project)
	st.LastActivityAt = time.Now()
	cfg := s.cfg()
	addReason := func(r string) {
		if len(st.MilestoneReasons) == 0 {
			st.MilestoneSince = time.Now()
		}
		st.MilestoneReasons = append(st.MilestoneReasons, r)
	}
	switch run.Purpose {
	case "work":
		for _, d := range s.delegations(run.Project) {
			for i := range d.Items {
				if d.Items[i].RunID != nil && *d.Items[i].RunID == run.ID {
					d.Items[i].Status = "done"
					if run.Status != "succeeded" {
						d.Items[i].Status = "failed"
					}
					_ = saveDelegation(d)
				}
			}
		}
		if run.Status == "failed" && run.TaskID != nil {
			reason := run.Status
			if run.Error != nil {
				reason = truncate(*run.Error, 120)
			}
			addReason("run failed on " + *run.TaskID + ": " + reason)
		}
		tasks, _ := cfg.LoadTasks(s.root, run.Project)
		if run.TaskID != nil {
			for _, t := range tasks {
				if t.ID == *run.TaskID && t.Status == "blocked" {
					addReason(t.ID + " is blocked")
				}
				if t.ID == *run.TaskID && t.Status == "completed" && t.Feature != nil {
					all := true
					for _, o := range tasks {
						if o.Feature != nil && *o.Feature == *t.Feature && o.Status != "completed" && o.Status != "cancelled" {
							all = false
						}
					}
					if all {
						addReason("feature " + *t.Feature + " completed")
					}
				}
			}
		}
		allDone := len(tasks) > 0
		for _, t := range tasks {
			if t.Status != "completed" && t.Status != "cancelled" {
				allDone = false
			}
		}
		if allDone {
			addReason("all tasks completed or cancelled")
		}
	case "plan", "revise":
		if run.Status == "succeeded" {
			if wf, _ := cfg.LoadWorkflow(s.root, run.Project); wf.Phase == "planning" {
				_, _ = cfg.SetPhase(s.root, run.Project, "review", "analyst", "development package ready for Owner review")
			}
		}
	case "arrange":
		if a, ok := e.arranges[run.ID]; ok {
			delete(e.arranges, run.ID)
			briefing := strings.TrimSpace(final)
			if run.Status == "succeeded" && briefing != "" {
				go s.openArrangedDiscussion(a, briefing)
			}
		}
	}
	e.save(run.Project)
	s.hub.publish("workflow", map[string]string{"project": run.Project})
}

// openArrangedDiscussion opens the discussion the PM prepared and sends the briefing
// as the role's first prompt.
func (s *server) openArrangedDiscussion(a arrangement, briefing string) {
	disc, err := s.ds.create(a.topic, a.project, a.role, 1, "")
	if err != nil {
		return
	}
	text := "Briefing from the Project Manager:\n\n" + briefing + "\n\nThe Owner wants to discuss: " + a.topic +
		". Greet the Owner briefly, summarise what you understand, and ask what they want to focus on."
	req := RunRequest{Project: a.project, Role: a.role, Prompt: text, PermissionMode: "plan", BudgetUSD: 1,
		discussionID: disc.ID, discussionTopic: disc.Topic}
	run, err := s.runs.start(s.cfg(), req)
	if err != nil {
		return
	}
	_, _ = s.ds.update(disc.ID, func(d *Discussion) error {
		sid, rid := run.SessionID, run.ID
		d.SessionID = &sid
		d.Turns = append(d.Turns, DiscussionTurn{Who: "agent", Role: "project-manager", At: time.Now().Format(time.RFC3339),
			Text: "**Briefing for the " + roleName(a.role) + "**\n\n" + briefing, RunID: &rid})
		return nil
	})
	s.hub.publish("discussions", s.ds.list(s.discussionRunning))
	s.publishOffice()
}

// ---- views and endpoints ----------------------------------------------------------

type ReportFile struct {
	File  string `json:"file"`
	Type  string `json:"type"`
	At    string `json:"at"`
	Title string `json:"title"`
	Body  string `json:"body,omitempty"`
}

func (s *server) reports(project string, withBody bool) []ReportFile {
	p := s.cfg().Projects[project]
	files, _ := filepath.Glob(filepath.Join(s.root, filepath.FromSlash(p.ProjectPath), "reports", "sessions", "*.md"))
	out := []ReportFile{}
	for _, f := range files {
		st, err := os.Stat(f)
		if err != nil {
			continue
		}
		b, _ := os.ReadFile(f)
		base := strings.TrimSuffix(filepath.Base(f), ".md")
		typ := "report"
		for _, t := range []string{"on-demand", "milestone", "progress", "kickoff", "daily", "final"} {
			if strings.HasSuffix(base, "-"+t) {
				typ = t
				break
			}
		}
		title := base
		for _, l := range strings.Split(string(b), "\n") {
			if strings.HasPrefix(l, "# ") {
				title = strings.TrimPrefix(l, "# ")
				break
			}
		}
		rf := ReportFile{File: filepath.Base(f), Type: typ, At: st.ModTime().Format(time.RFC3339), Title: title}
		if withBody {
			rf.Body = string(b)
		}
		out = append(out, rf)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At > out[j].At })
	return out
}

type WorkflowView struct {
	Project      string             `json:"project"`
	Workflow     workspace.Workflow `json:"workflow"`
	Plan         *string            `json:"plan"`     // plan.md contents
	Handover     *string            `json:"handover"` // handover.md contents
	Tasks        int                `json:"tasks"`
	TotalWeight  int                `json:"totalWeight"`
	WeightByRole map[string]int     `json:"weightByRole"`
	Adjusted     []map[string]any   `json:"adjusted"` // tasks whose weight the Owner changed
	NotReady     []map[string]any   `json:"notReady"` // backlog tasks failing the Definition of Ready
	Delegations  []Delegation       `json:"delegations"`
	SpentToday   float64            `json:"spentToday"`
	RunningWork  int                `json:"runningWork"`
	PMBusy       bool               `json:"pmBusy"`
	LastReportAt *string            `json:"lastReportAt"`
	Reports      []ReportFile       `json:"reports"`
}

func (s *server) workflowView(project string) (WorkflowView, error) {
	cfg := s.cfg()
	p, ok := cfg.Projects[project]
	if !ok {
		return WorkflowView{}, fmt.Errorf("unknown project %q", project)
	}
	wf, err := cfg.LoadWorkflow(s.root, project)
	if err != nil {
		return WorkflowView{}, err
	}
	dir := filepath.Join(s.root, filepath.FromSlash(p.ProjectPath))
	v := WorkflowView{Project: project, Workflow: wf, WeightByRole: map[string]int{}, Adjusted: []map[string]any{}, NotReady: []map[string]any{},
		Delegations: s.delegations(project), SpentToday: s.spentToday(project), RunningWork: s.runningWork(project), PMBusy: s.pmBusy(project),
		Reports: s.reports(project, false)}
	for name, dst := range map[string]**string{"plan.md": &v.Plan, "handover.md": &v.Handover} {
		if b, err := os.ReadFile(filepath.Join(dir, name)); err == nil {
			str := string(b)
			*dst = &str
		}
	}
	tasks, _ := cfg.LoadTasks(s.root, project)
	for _, t := range tasks {
		if t.Status == "cancelled" {
			continue
		}
		v.Tasks++
		if t.Weight != nil {
			v.TotalWeight += *t.Weight
			v.WeightByRole[t.Owner] += *t.Weight
		}
		if t.ProposedWeight != nil && t.Weight != nil && *t.ProposedWeight != *t.Weight {
			v.Adjusted = append(v.Adjusted, map[string]any{"task": t.ID, "title": t.Title, "from": *t.ProposedWeight, "to": *t.Weight})
		}
		if t.Status == "backlog" {
			if miss := t.Unready(); len(miss) > 0 {
				v.NotReady = append(v.NotReady, map[string]any{"task": t.ID, "title": t.Title, "missing": miss})
			}
		}
	}
	if st := s.wf.state(project); !st.LastReportAt.IsZero() {
		at := st.LastReportAt.Format(time.RFC3339)
		v.LastReportAt = &at
	}
	return v, nil
}

var adrNumRe = regexp.MustCompile(`ADR-(\d+)`)

func (s *server) writePlanApprovalADR(project, comment string, v WorkflowView, readied int) error {
	dir := filepath.Join(s.root, filepath.FromSlash(s.cfg().Projects[project].ProjectPath), "decisions")
	files, _ := filepath.Glob(filepath.Join(dir, "ADR-*.md"))
	next := 1
	for _, f := range files {
		if m := adrNumRe.FindStringSubmatch(filepath.Base(f)); m != nil {
			if n, _ := strconv.Atoi(m[1]); n >= next {
				next = n + 1
			}
		}
	}
	var adj strings.Builder
	for _, a := range v.Adjusted {
		fmt.Fprintf(&adj, "- %v %v: weight %v → %v\n", a["task"], a["title"], a["from"], a["to"])
	}
	if adj.Len() == 0 {
		adj.WriteString("- none\n")
	}
	today := time.Now().Format("2006-01-02")
	body := fmt.Sprintf(`# ADR-%03d: Development plan approved

Status:
Accepted

Date:
%s

## Context

The Analyst prepared the development package (plan.md, handover.md, features and tasks)
after the brainstorm. The Owner reviewed it.

## Decision

Approve the plan and hand it over to the Project Manager for execution.

- Tasks: %d, total weight %d
- Moved to ready: %d (the others stay in backlog until they meet the Definition of Ready)

Owner weight adjustments:
%s
## Owner Approval

Required:
yes

Decision:
Approved by the Owner on %s.%s
`, next, today, v.Tasks, v.TotalWeight, readied, adj.String(), today, func() string {
		if strings.TrimSpace(comment) == "" {
			return ""
		}
		return " Comment: " + strings.TrimSpace(comment)
	}())
	_ = os.MkdirAll(dir, 0o755)
	removeGitkeepDir(dir)
	return os.WriteFile(filepath.Join(dir, fmt.Sprintf("ADR-%03d-plan-approval.md", next)), []byte(body), 0o644)
}

func removeGitkeepDir(dir string) {
	entries, _ := os.ReadDir(dir)
	if len(entries) > 0 {
		os.Remove(filepath.Join(dir, ".gitkeep"))
	}
}

func (s *server) workflowRoutes(h func(string, func(http.ResponseWriter, *http.Request) (any, error))) {
	h("GET /api/projects/{id}/workflow", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.workflowView(r.PathValue("id"))
	})
	h("PATCH /api/projects/{id}/workflow/settings", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id := r.PathValue("id")
		cfg := s.cfg()
		wf, err := cfg.LoadWorkflow(s.root, id)
		if err != nil {
			return nil, err
		}
		var req struct {
			Limits  *workspace.WorkflowLimits  `json:"limits"`
			Reports *workspace.WorkflowReports `json:"reports"`
		}
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		if req.Limits != nil {
			l := *req.Limits
			if l.MaxParallel < 1 || l.MaxParallel > 6 || l.DailyBudgetUSD <= 0 || l.BudgetPerWeight <= 0 || l.MaxTaskBudget <= 0 {
				return nil, errors.New("limits: max parallel 1-6 and positive budgets required")
			}
			if l.PermissionMode != "acceptEdits" && l.PermissionMode != "bypassPermissions" {
				return nil, errors.New("limits: permission mode must be acceptEdits or bypassPermissions")
			}
			wf.Limits = l
		}
		if req.Reports != nil {
			wf.Reports = *req.Reports
		}
		if err := cfg.SaveWorkflow(s.root, id, wf); err != nil {
			return nil, err
		}
		return s.workflowView(id)
	})
	h("POST /api/projects/{id}/workflow/phase", func(w http.ResponseWriter, r *http.Request) (any, error) {
		var req struct{ Phase, Note string }
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		if _, err := s.cfg().SetPhase(s.root, r.PathValue("id"), req.Phase, "owner", req.Note); err != nil {
			return nil, err
		}
		s.publishOffice()
		return s.workflowView(r.PathValue("id"))
	})
	h("POST /api/projects/{id}/workflow/plan", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id := r.PathValue("id")
		var req struct {
			Comments string `json:"comments"`
			Override bool   `json:"override"`
		}
		_ = readJSON(r, &req)
		cfg := s.cfg()
		wf, err := cfg.LoadWorkflow(s.root, id)
		if err != nil {
			return nil, err
		}
		if wf.Phase != "intake" && wf.Phase != "brainstorm" {
			return nil, fmt.Errorf("the plan is prepared from intake or brainstorm (project is in %s)", wf.Phase)
		}
		if s.holdResponse(w, req.Override) {
			return nil, errHandled
		}
		run, err := s.startWorkflowRun(id, "analyst", "plan", "analyst-plan.md", "acceptEdits", wf.Limits.AnalystBudget, map[string]string{"comments": req.Comments})
		if err != nil {
			return nil, err
		}
		_, _ = cfg.SetPhase(s.root, id, "planning", "owner", "Analyst asked to prepare the development package")
		s.publishOffice()
		return map[string]any{"run": run}, nil
	})
	h("POST /api/projects/{id}/workflow/request-changes", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id := r.PathValue("id")
		var req struct {
			Comments string `json:"comments"`
			Override bool   `json:"override"`
		}
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		if strings.TrimSpace(req.Comments) == "" {
			return nil, errors.New("tell the Analyst what to change")
		}
		cfg := s.cfg()
		wf, err := cfg.LoadWorkflow(s.root, id)
		if err != nil {
			return nil, err
		}
		if wf.Phase != "review" {
			return nil, fmt.Errorf("changes are requested during review (project is in %s)", wf.Phase)
		}
		if s.holdResponse(w, req.Override) {
			return nil, errHandled
		}
		run, err := s.startWorkflowRun(id, "analyst", "revise", "analyst-revise.md", "acceptEdits", wf.Limits.AnalystBudget, map[string]string{"comments": req.Comments})
		if err != nil {
			return nil, err
		}
		_, _ = cfg.SetPhase(s.root, id, "planning", "owner", "changes requested: "+truncate(req.Comments, 200))
		s.publishOffice()
		return map[string]any{"run": run}, nil
	})
	h("POST /api/projects/{id}/workflow/approve", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id := r.PathValue("id")
		var req struct {
			Comment  string `json:"comment"`
			Override bool   `json:"override"`
		}
		_ = readJSON(r, &req)
		cfg := s.cfg()
		wf, err := cfg.LoadWorkflow(s.root, id)
		if err != nil {
			return nil, err
		}
		if wf.Phase != "review" {
			return nil, fmt.Errorf("the plan is approved during review (project is in %s)", wf.Phase)
		}
		if s.holdResponse(w, req.Override) {
			return nil, errHandled
		}
		tasks, _ := cfg.LoadTasks(s.root, id)
		readied := 0
		ready := "ready"
		for _, t := range tasks {
			if t.Status == "backlog" && len(t.Unready()) == 0 {
				note := time.Now().Format("2006-01-02 15:04") + " plan approved by the Owner"
				if _, err := cfg.UpdateTask(s.root, id, t.ID, workspace.TaskPatch{Status: &ready, AddNote: &note}); err == nil {
					readied++
				}
			}
		}
		v, _ := s.workflowView(id)
		if err := s.writePlanApprovalADR(id, req.Comment, v, readied); err != nil {
			return nil, err
		}
		now := time.Now().Format(time.RFC3339)
		wf, _ = cfg.SetPhase(s.root, id, "execution", "owner", "plan approved; handed over to the Project Manager")
		wf.PlanApprovedAt = &now
		_ = cfg.SaveWorkflow(s.root, id, wf)
		run, err := s.startWorkflowRun(id, "project-manager", "kickoff", "pm-kickoff.md", "acceptEdits", wf.Limits.PMBudgetUSD, map[string]string{"comments": req.Comment})
		st := s.wf.state(id)
		st.LastDelegateAt, st.LastReportAt = time.Now(), time.Now()
		s.wf.save(id)
		s.publishOffice()
		if err != nil {
			return map[string]any{"readied": readied, "run": nil, "warning": "plan approved, but the PM kickoff could not start: " + err.Error()}, nil
		}
		return map[string]any{"readied": readied, "run": run}, nil
	})
	h("GET /api/projects/{id}/delegations", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.delegations(r.PathValue("id")), nil
	})
	h("POST /api/projects/{id}/delegations/{did}/approve", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id, did := r.PathValue("id"), r.PathValue("did")
		var req struct {
			Tasks   []string           `json:"tasks"`   // subset to approve; empty = all
			Budgets map[string]float64 `json:"budgets"` // per-task budget overrides
			Comment string             `json:"comment"`
		}
		_ = readJSON(r, &req)
		wf, err := s.cfg().LoadWorkflow(s.root, id)
		if err != nil {
			return nil, err
		}
		for _, d := range s.delegations(id) {
			if d.ID != did {
				continue
			}
			if d.Status != "proposed" {
				return nil, fmt.Errorf("delegation %s is already %s", did, d.Status)
			}
			keep := map[string]bool{}
			for _, t := range req.Tasks {
				keep[t] = true
			}
			for i := range d.Items {
				it := &d.Items[i]
				if len(keep) > 0 && !keep[it.Task] {
					it.Status = "skipped"
					it.Detail = "not approved by the Owner"
					continue
				}
				if b, ok := req.Budgets[it.Task]; ok && b > 0 {
					it.BudgetUSD = b
				}
				if it.BudgetUSD <= 0 || it.BudgetUSD > wf.Limits.MaxTaskBudget {
					it.BudgetUSD = wf.Limits.MaxTaskBudget
				}
				if it.PermissionMode != "bypassPermissions" {
					it.PermissionMode = wf.Limits.PermissionMode
				}
				it.Status = "queued"
			}
			now := time.Now().Format(time.RFC3339)
			d.Status, d.DecidedAt, d.Comment = "approved", &now, req.Comment
			if err := saveDelegation(d); err != nil {
				return nil, err
			}
			go func() { s.wf.mu.Lock(); s.wf.dispatch(id, wf); s.wf.mu.Unlock(); s.publishOffice() }()
			s.hub.publish("workflow", map[string]string{"project": id})
			return d, nil
		}
		return nil, fmt.Errorf("delegation %s not found", did)
	})
	h("POST /api/projects/{id}/delegations/{did}/reject", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id, did := r.PathValue("id"), r.PathValue("did")
		var req struct {
			Comment string `json:"comment"`
		}
		_ = readJSON(r, &req)
		for _, d := range s.delegations(id) {
			if d.ID != did {
				continue
			}
			if d.Status != "proposed" {
				return nil, fmt.Errorf("delegation %s is already %s", did, d.Status)
			}
			now := time.Now().Format(time.RFC3339)
			d.Status, d.DecidedAt, d.Comment = "rejected", &now, req.Comment
			for i := range d.Items {
				d.Items[i].Status = "skipped"
			}
			if err := saveDelegation(d); err != nil {
				return nil, err
			}
			// tell the PM next time: rejection comments go into the next proposal's context
			st := s.wf.state(id)
			st.LastActivityAt = time.Now()
			s.wf.save(id)
			s.hub.publish("workflow", map[string]string{"project": id})
			s.publishOffice()
			return d, nil
		}
		return nil, fmt.Errorf("delegation %s not found", did)
	})
	h("POST /api/projects/{id}/delegations/propose", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id := r.PathValue("id")
		var req struct {
			Override bool `json:"override"`
		}
		_ = readJSON(r, &req)
		wf, err := s.cfg().LoadWorkflow(s.root, id)
		if err != nil {
			return nil, err
		}
		if s.pmBusy(id) {
			return nil, errors.New("the Project Manager is busy; try again when the current run ends")
		}
		if s.holdResponse(w, req.Override) {
			return nil, errHandled
		}
		return s.startDelegate(id, wf)
	})
	h("GET /api/projects/{id}/reports", func(w http.ResponseWriter, r *http.Request) (any, error) {
		return s.reports(r.PathValue("id"), r.URL.Query().Get("body") == "1"), nil
	})
	h("POST /api/projects/{id}/report", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id := r.PathValue("id")
		var req struct {
			Note     string `json:"note"`
			Override bool   `json:"override"`
		}
		_ = readJSON(r, &req)
		wf, err := s.cfg().LoadWorkflow(s.root, id)
		if err != nil {
			return nil, err
		}
		if s.pmBusy(id) {
			return nil, errors.New("the Project Manager is busy; the report will follow when the current run ends")
		}
		if s.holdResponse(w, req.Override) {
			return nil, errHandled
		}
		reasons := []string{"the Owner asked for a report"}
		if strings.TrimSpace(req.Note) != "" {
			reasons = append(reasons, "Owner's note: "+req.Note)
		}
		return s.startReport(id, "on-demand", reasons, wf)
	})
	h("POST /api/projects/{id}/arrange", func(w http.ResponseWriter, r *http.Request) (any, error) {
		id := r.PathValue("id")
		var req struct {
			Role     string `json:"role"`
			Topic    string `json:"topic"`
			Override bool   `json:"override"`
		}
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		if !workspace.IsRole(req.Role) || strings.TrimSpace(req.Topic) == "" {
			return nil, errors.New("role and topic are required")
		}
		wf, err := s.cfg().LoadWorkflow(s.root, id)
		if err != nil {
			return nil, err
		}
		if s.holdResponse(w, req.Override) {
			return nil, errHandled
		}
		run, err := s.startWorkflowRun(id, "project-manager", "arrange", "pm-arrange.md", "plan", wf.Limits.PMBudgetUSD,
			map[string]string{"role": roleName(req.Role), "topic": req.Topic})
		if err != nil {
			return nil, err
		}
		s.wf.mu.Lock()
		s.wf.arranges[run.ID] = arrangement{project: id, role: req.Role, topic: req.Topic}
		s.wf.mu.Unlock()
		return map[string]any{"run": run}, nil
	})
}
