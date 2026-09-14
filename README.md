# control

Source of truth for `Projects-Centralized`: per-project status/tasks,
global memory, and the scripts that keep a queryable SQLite index in sync
with the markdown. This folder is its own git repo, separate from
`../repos/*` (which are plain clones of your actual projects).

## Layout

```
control/
├── meta/<host>/<org>/<repo>/{status.md,tasks.md}   # authoritative, edit directly
├── global/memory.md                                 # cross-project notes
├── db/index.sqlite3                                 # generated, gitignored — rebuild any time
└── scripts/
    ├── sync-index.mjs        # rebuild db/index.sqlite3 from meta/**/*.md
    ├── onboard-project.mjs   # fresh git clone into ../repos/<host>/<org>/<repo> + scaffold meta
    └── relocate-project.mjs  # move an existing local working copy in (needs --yes)
```

Run scripts with `bun` (this machine has `bun` on PATH, no standalone
node/npm): `bun control/scripts/sync-index.mjs`.

## status.md schema

```yaml
---
org: Nuanu-com
repo: satudata
host: github.com
remote: git@github.com:Nuanu-com/satudata.git
local_path: null      # null until onboarded/relocated here
relocated: false      # true only if this repo's sole working copy now lives under repos/
last_synced: 2026-09-14
health: unknown       # unknown | ok | attention | blocked
---

Free-form current-state notes.
```

## tasks.md schema

```markdown
---
org: Nuanu-com
repo: satudata
---

- [ ] (open) short task description
- [x] (done) completed task description
```

Both files are meant to be edited directly — by you, or by a Claude Code
agent working in that project — as part of normal work. The sync script
never writes back to markdown; markdown is always upstream of the SQLite
index.

## Onboarding vs. relocating

- **Onboard** (`onboard-project.mjs <remote-url>`) is the default way to
  bring a project in: a fresh clone, `../repos/<host>/<org>/<repo>`. Your
  existing `~/Projects/<repo>` copy is left completely alone.
- **Relocate** (`relocate-project.mjs <path> --yes`) is a separate, explicit,
  per-repo action for when you actually want to retire a `~/Projects` copy
  in favor of the centralized one. Without `--yes` it only prints the plan.

## Contract for a future control interface (e.g. a Telegram bot)

This repo intentionally doesn't include a bot — build that as its own
project and have it read/write against this contract:

- **Read/query state** via `db/index.sqlite3` (`projects`, `tasks` tables),
  rebuilt by `sync-index.mjs`. Treat it as a cache: rebuild before trusting
  a stale read, never hand-edit it.
- **Write state** only by editing the markdown files under `meta/`, the same
  way a human or agent would, then re-running sync. There is exactly one
  write path — don't add a second one that writes SQLite directly.
- **Running agents against a project**: resolve the project's `local_path`
  from its `status.md`, and run/spawn a Claude Code / Claude Agent SDK
  session with that as `cwd`. Recommended shape from design research: spawn
  each run as its own child OS process (real PID to kill, crash isolation),
  track `session_id`/run status in your own store, use Telegram long polling
  (this machine has no public URL), gate to a single hardcoded user ID, keep
  no raw-shell command surface exposed from chat text, confine any run's
  `cwd` to under `../repos/`, and require explicit confirmation before any
  run flagged as touching destructive git/file operations.
- Projects onboarded via the default fresh-clone path give an interactive
  Claude Code session (working in `~/Projects/<repo>`) and a bot-triggered
  run (working in `repos/.../<repo>`) separate working copies by
  construction — no concurrent-edit collision to worry about. Only
  `relocated: true` projects share a single working copy and should be
  treated as higher-risk for unattended runs.
