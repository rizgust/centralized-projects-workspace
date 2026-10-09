package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

// The Owner's project lifecycle:
//
//	intake → brainstorm → planning → review → execution → done
//
// intake:     the Owner gives the Analyst scope and requirements (brief).
// brainstorm: the Owner discusses with the Analyst.
// planning:   the Analyst prepares the development package and weighted tasks.
// review:     the Owner reviews, adjusts task weights, and approves (or requests changes).
// execution:  the Analyst has handed over to the PM; the PM proposes delegations that
//             the Owner approves, monitors progress, and reports.
// done:       closed by the Owner.

var Phases = []string{"intake", "brainstorm", "planning", "review", "execution", "done"}

type PhaseEvent struct {
	Phase string `yaml:"phase" json:"phase"`
	At    string `yaml:"at" json:"at"`
	By    string `yaml:"by" json:"by"`
	Note  string `yaml:"note,omitempty" json:"note,omitempty"`
}

type WorkflowLimits struct {
	MaxParallel     int     `yaml:"max_parallel" json:"maxParallel"`
	DailyBudgetUSD  float64 `yaml:"daily_budget_usd" json:"dailyBudgetUsd"`
	BudgetPerWeight float64 `yaml:"budget_per_weight" json:"budgetPerWeight"`
	MaxTaskBudget   float64 `yaml:"max_task_budget_usd" json:"maxTaskBudgetUsd"`
	PermissionMode  string  `yaml:"permission_mode" json:"permissionMode"`
	PMBudgetUSD     float64 `yaml:"pm_budget_usd" json:"pmBudgetUsd"`
	AnalystBudget   float64 `yaml:"analyst_budget_usd" json:"analystBudgetUsd"`
	Model           string  `yaml:"model" json:"model"` // "" = Claude Code default; applies to every workflow-started run
}

type WorkflowReports struct {
	Milestones bool   `yaml:"milestones" json:"milestones"`
	DailyAt    string `yaml:"daily_at" json:"dailyAt"` // HH:MM local, "" = off
	EveryHours int    `yaml:"every_hours" json:"everyHours"`
	OnDemand   bool   `yaml:"on_demand" json:"onDemand"`
}

type Workflow struct {
	Phase          string          `yaml:"phase" json:"phase"`
	Delegation     string          `yaml:"delegation" json:"delegation"` // propose (PM proposes, Owner approves)
	Limits         WorkflowLimits  `yaml:"limits" json:"limits"`
	Reports        WorkflowReports `yaml:"reports" json:"reports"`
	PlanApprovedAt *string         `yaml:"plan_approved_at" json:"planApprovedAt"`
	History        []PhaseEvent    `yaml:"history" json:"history"`
}

func DefaultWorkflow() Workflow {
	return Workflow{
		Phase:      "intake",
		Delegation: "propose",
		Limits: WorkflowLimits{MaxParallel: 2, DailyBudgetUSD: 20, BudgetPerWeight: 0.75, MaxTaskBudget: 10,
			PermissionMode: "acceptEdits", PMBudgetUSD: 1, AnalystBudget: 5},
		Reports: WorkflowReports{Milestones: true, DailyAt: "17:00", EveryHours: 3, OnDemand: true},
		History: []PhaseEvent{},
	}
}

// TaskBudget is the per-run budget for a task of the given weight.
func (l WorkflowLimits) TaskBudget(weight *int) float64 {
	w := 3
	if weight != nil && *weight > 0 {
		w = *weight
	}
	b := l.BudgetPerWeight * float64(w)
	if l.MaxTaskBudget > 0 && b > l.MaxTaskBudget {
		b = l.MaxTaskBudget
	}
	if b < 0.25 {
		b = 0.25
	}
	return b
}

func validPhase(p string) bool {
	for _, x := range Phases {
		if x == p {
			return true
		}
	}
	return false
}

func (c Config) projectYAML(root, id string) (string, error) {
	dir, err := c.projectDir(root, id)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "project.yaml"), nil
}

// LoadWorkflow reads project.yaml → workflow, filling defaults.
func (c Config) LoadWorkflow(root, id string) (Workflow, error) {
	path, err := c.projectYAML(root, id)
	if err != nil {
		return Workflow{}, err
	}
	wf := DefaultWorkflow()
	b, err := os.ReadFile(path)
	if err != nil {
		return wf, nil
	}
	var doc struct {
		Workflow *Workflow `yaml:"workflow"`
	}
	doc.Workflow = &wf
	if err := yaml.Unmarshal(b, &doc); err != nil {
		return wf, fmt.Errorf("%s: %w", path, err)
	}
	if !validPhase(wf.Phase) {
		wf.Phase = "intake"
	}
	if wf.History == nil {
		wf.History = []PhaseEvent{}
	}
	return wf, nil
}

// SaveWorkflow writes the workflow block back into project.yaml, keeping the rest.
func (c Config) SaveWorkflow(root, id string, wf Workflow) error {
	path, err := c.projectYAML(root, id)
	if err != nil {
		return err
	}
	doc, err := readNode(path)
	if err != nil {
		return err
	}
	var n yaml.Node
	if err := n.Encode(wf); err != nil {
		return err
	}
	mapSet(doc.Content[0], "workflow", &n)
	return writeNode(path, doc)
}

// SetPhase moves a project to a phase and records who moved it.
func (c Config) SetPhase(root, id, phase, by, note string) (Workflow, error) {
	if !validPhase(phase) {
		return Workflow{}, fmt.Errorf("unknown phase %q", phase)
	}
	wf, err := c.LoadWorkflow(root, id)
	if err != nil {
		return wf, err
	}
	if wf.Phase == phase {
		return wf, nil
	}
	wf.Phase = phase
	wf.History = append(wf.History, PhaseEvent{Phase: phase, At: time.Now().Format(time.RFC3339), By: by, Note: note})
	return wf, c.SaveWorkflow(root, id, wf)
}
