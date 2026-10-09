# Prompt: register a project (Analyst discovery + migration)

Use this when a project is added to `workspace.yaml`, or when an existing project's
knowledge must be rebuilt. Give it to an `analyst` subagent, replacing `<id>`. Spawn one
agent per project: each agent works on exactly one project.

---

You are the **Analyst** of the Projects-Centralized workspace, doing the first-registration
pass for ONE project: `<id>`. Read and follow `agents/analyst.md`.

Paths are relative to the repo root. The spec is `BOOTSTRAP.md` (§5, §7, §19–§23, §28–§30,
§42, §50). Rules: `AGENTS.md`, `shared/policies/*.md`. Use `templates/*` exactly.

Read the project's `kind` in `workspace.yaml` and `templates/kinds/<kind>/kind.yaml`
first. The deliverables below are for `software`; for other kinds, fill in the files
that kind scaffolded instead (`prototype`: brief, requirements, sketch;
`investigation`: brief, sub-questions, sources; `design`: brief, design system, flows;
`general`: brief). Never invent architecture docs for a project without code.

Sources (read only):
- the repo at `workspace.yaml` → `projects.<id>.repo_path`, plus its in-repo docs
- any earlier records for this project the Owner points to. Treat them as a
  **checkpoint**: migrate their content. Don't just link to it.

Hard rules:
- Write only inside `projects/<id>/`.
- Repo is read-only: no installs, builds, tests, servers or git writes.
- Never read `.env*` files or copy secret values.
- Cite the source of every migrated fact (file + section, or commit hash).
- Don't invent requirements; unknowns go to `requirements/open-questions.md`.

Deliverables (full spec §5 structure):
1. `PROJECT.md`, `project.yaml` (repository.path `../../repos/<id>`), `STATUS.md`.
2. `requirements/{product,technical,constraints,open-questions}.md`, fully migrated.
3. `architecture/{system,frontend,backend,infrastructure,data-flow,integrations}.md` from a
   real discovery pass of the code.
4. `uiux/design-system.md`, `uiux/screens/*`, `uiux/flows/*` for what exists.
5. `features/<feature-id>/` per workstream: feature.yaml, requirements.md, design.md,
   task-map.yaml, and completion.md once the feature is complete.
6. `tasks/<state>/TASK-NNN.yaml` for every known task, done and open, numbered in order.
   Each task gets one owner, a weight from {1,2,3,5,8,13}, acceptance criteria and a note
   citing its source.
7. `decisions/ADR-NNN-*.md` for every decision found.
8. `reports/sessions/` checkpoint reports, `reports/releases/` for deploys,
   `reports/current.md` (§12's nine questions).
9. `archive/README.md`: a table mapping each old source to its new location.

Finish: run `pcctl check`, then report counts, open questions, discrepancies between the
records and the repo, and anything you could not migrate.
