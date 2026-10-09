# Workflow prompts

The dashboard starts these runs at each step of the Owner's workflow (AGENTS.md →
"Owner workflow"). Edit them to change how the Analyst and PM work; no code change is
needed. Placeholders are filled in per run:

| Placeholder | Value |
|---|---|
| `{{project}}`, `{{name}}`, `{{kind}}` | project id, name, kind |
| `{{project_dir}}` | absolute path of `projects/<id>/` |
| `{{roles}}` | roles involved in this kind of project |
| `{{deliverable}}` | the kind's deliverable |
| `{{comments}}` | the Owner's comments (revision, approval) |
| `{{report_type}}` | milestone, daily, progress, on-demand, kickoff or final |
| `{{reasons}}` | what triggered a milestone report |
| `{{since}}` | time of the previous report |
| `{{now}}` | current time, `YYYY-MM-DD-HHMM` |
| `{{delegation_dir}}` | where delegation proposals go |
| `{{free_slots}}`, `{{busy}}` | how many runs may start now; tasks already queued or running |
| `{{per_weight}}`, `{{max_task}}`, `{{daily_budget}}`, `{{spent_today}}` | budget limits |
| `{{role}}`, `{{topic}}` | for arranged discussions |

| File | Step | Run |
|---|---|---|
| `analyst-plan.md` | brainstorm → planning | Analyst prepares the development package |
| `analyst-revise.md` | review → planning | Analyst applies the Owner's requested changes |
| `pm-kickoff.md` | plan approved → execution | PM takes the handover |
| `pm-delegate.md` | execution | PM proposes which tasks to delegate next |
| `pm-report.md` | execution | PM reports to the Owner |
| `pm-arrange.md` | any phase | PM briefs another role before an Owner discussion |
