# Project kinds

A project's `kind` decides what the dashboard or an agent scaffolds into
`projects/<id>/`, and whether the project has a code repository. Not every project
is software.

| Kind | Use for | Repo (default) |
|---|---|---|
| `software` | an existing product codebase | `clone` a remote into `repos/<id>` |
| `prototype` | a mockup, spike or full-stack prototype | `local`: a fresh git repo in `repos/<id>` (add a remote later) |
| `investigation` | research, analysis, a question to answer | `none`: the deliverable is `report.md` |
| `design` | UI/UX or visual design without code | `none` |
| `general` | anything else | `none` |

Repo modes: `clone` clones `remote`; `local` runs `git init` in `repos/<id>`; `none`
means no repository, and agents work in `projects/<id>/`.

Each kind directory holds:

- `kind.yaml`: description, default repo mode, the roles involved, the deliverable,
  and a hint added to every agent run's system prompt.
- the starting files, copied into `projects/<id>/` with `{{id}}`, `{{name}}`,
  `{{kind}}` and `{{date}}` replaced.

`_common/` is copied first for every kind. Every project also gets `tasks/<state>/`,
`decisions/`, `reports/sessions/` and `archive/`.

To add a kind, create `templates/kinds/<name>/` with a `kind.yaml` and its starting
files. No code change is needed.
