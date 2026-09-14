# control

Source of truth for `Projects-Centralized`: per-project status/tasks,
global memory, a queryable SQLite index synced from the markdown, and the
`pcctl` Go CLI (including the Telegram bot) that operates on all of it. This
folder is its own git repo, separate from `../repos/*` (which are plain
clones of your actual projects).

## Layout

```
control/
├── meta/<host>/<org>/<repo>/{status.md,tasks.md}   # authoritative, edit directly
├── global/memory.md                                 # cross-project notes
├── db/
│   ├── index.sqlite3                                # generated, gitignored — rebuilt from meta/
│   └── runs.sqlite3                                  # generated, gitignored — agent run history, persists across index rebuilds
├── go.mod / go.sum
├── cmd/pcctl/main.go                                 # CLI entrypoint (sync | onboard | relocate | bot)
├── internal/
│   ├── meta/       # status.md/tasks.md parsing + rendering
│   ├── remote/     # git remote URL -> host/org/repo
│   ├── index/      # markdown -> index.sqlite3 sync
│   ├── resolve/    # look up a project by short name against meta/
│   ├── onboard/    # fresh-clone onboarding
│   ├── relocate/   # explicit move-in of an existing local working copy
│   ├── runner/     # spawns/tracks `claude -p` child processes, runs.sqlite3
│   ├── bot/        # gotgbot long-polling bot wired to resolve/runner/index
│   └── config/     # control/.env loader
├── .env             # gitignored — TELEGRAM_BOT_TOKEN, TELEGRAM_MASTER_USER_ID
└── .gitignore
```

Build/run with Go (this machine has Go 1.24+, no C compiler — that's why
the SQLite driver is the pure-Go `modernc.org/sqlite`, not `mattn/go-sqlite3`):

```
go build -o pcctl.exe ./cmd/pcctl
./pcctl.exe sync
./pcctl.exe onboard git@github.com:Nuanu-com/satudata.git
./pcctl.exe relocate "C:\Users\rizgust\Projects\personal-fintrack" --yes
./pcctl.exe bot
```

`pcctl` assumes it's run with `control/` as the working directory — every
path (`meta/`, `db/`, `../repos/`, `../logs/`) is resolved relative to that.

## status.md / tasks.md schema

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

```markdown
---
org: Nuanu-com
repo: satudata
---

- [ ] (open) short task description
- [x] (done) completed task description
```

Both files are meant to be edited directly — by you, or by a Claude Code
agent working in that project — as part of normal work. `pcctl sync` never
writes back to markdown; markdown is always upstream of `index.sqlite3`.

## Onboarding vs. relocating

- **Onboard** (`pcctl onboard <remote-url>`) is the default way to bring a
  project in: a fresh clone into `../repos/<host>/<org>/<repo>`. Your
  existing `~/Projects/<repo>` copy is left completely alone.
- **Relocate** (`pcctl relocate <path> --yes`) is a separate, explicit,
  per-repo action for when you actually want to retire a `~/Projects` copy
  in favor of the centralized one. Without `--yes` it only prints the plan.

## The Telegram bot (`pcctl bot`)

Gotgbot v2, long polling (this machine has no public URL for webhooks),
gated to a single master user. Bootstrap: send `/whoami` to get your
Telegram user id, put it in `control/.env` as `TELEGRAM_MASTER_USER_ID`,
restart the bot — every other command is refused until that's set.

Commands: `/list [org]`, `/status <name>`, `/tasks <name>`, `/sync`,
`/run <name> <prompt>` (constrained: `acceptEdits` + a safe read/edit/git-read
tool allowlist, capped at `PCCTL_MAX_BUDGET_SAFE` USD, default $2),
`/full <name> <prompt>` → `/confirm <token>` (unrestricted `bypassPermissions`,
capped at `PCCTL_MAX_BUDGET_FULL`, default $10 — requires the two-step
confirmation so a full-permission run is never one accidental message away),
`/runs`, `/stop <run-id>`, `/resume <run-id> <prompt>`.

Each `/run` or `/full` spawns `claude -p` as its own OS child process
(`internal/runner`), so `/stop` is a real `taskkill`, a crash in one run
can't take down the bot, and every invocation is tracked in
`db/runs.sqlite3` with its `session_id` so `/resume` can continue the same
conversation. On `pcctl bot` startup, any run still marked `running` from
before that boot (the process couldn't have survived) is flipped to
`interrupted`.

Because onboarding defaults to fresh clones, an interactive Claude Code
session working in `~/Projects/<repo>` and a bot-triggered run working in
`repos/.../<repo>` are different working copies by construction — no
concurrent-edit collision for the common case. Only `relocated: true`
projects share a single working copy and are higher-risk for unattended runs.

**Verified manually** (2026-09-14): `claude -p --output-format json` was
run directly to confirm its JSON shape matches `internal/runner`'s parsing
(`session_id`, `result`, `is_error`, `total_cost_usd`), that `--resume`
correctly continues a prior session, and the full `runner.Manager` path
(spawn → JSON parse → `runs.sqlite3` update → completion callback) was
exercised end-to-end with a throwaway harness. Not yet exercised: `/stop`
against a genuinely long-running process, and the bot's Telegram-facing
commands themselves (needs `TELEGRAM_MASTER_USER_ID` configured first).
