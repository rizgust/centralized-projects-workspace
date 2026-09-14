# control

Source of truth for `Projects-Centralized`: per-project status/tasks/journal,
global memory, a queryable SQLite index synced from the markdown, and the
`pcctl` Go CLI (Telegram bot, agent-role runner, shared task queue) that
operates on all of it. This folder is its own git repo, separate from
`../repos/*` (which are plain clones of your actual projects).

## Layout

```
control/
├── meta/<host>/<org>/<repo>/{status.md,tasks.md,journal.md}  # authoritative, edit directly
├── global/memory.md                                 # cross-project notes
├── db/
│   ├── index.sqlite3                                # generated, gitignored — rebuilt from meta/
│   ├── runs.sqlite3                                  # generated, gitignored — agent run history, persists across index rebuilds
│   └── queue.sqlite3                                 # generated, gitignored — the shared cross-role/cross-project task board
├── go.mod / go.sum
├── cmd/pcctl/main.go                                 # CLI entrypoint (sync | onboard | relocate | bot | queue)
├── internal/
│   ├── meta/       # status.md/tasks.md/journal.md parsing + rendering
│   ├── remote/     # git remote URL -> host/org/repo
│   ├── index/      # markdown -> index.sqlite3 sync
│   ├── resolve/    # look up a project by short name against meta/
│   ├── onboard/    # fresh-clone onboarding
│   ├── relocate/   # explicit move-in of an existing local working copy
│   ├── runner/     # spawns/tracks `claude -p --agent <role>` child processes, runs.sqlite3
│   ├── queue/      # the shared task queue the 5 agent roles hand work off through
│   ├── bot/        # gotgbot long-polling bot wired to resolve/runner/index/queue
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
./pcctl.exe queue add satudata golang-dev "add a health check endpoint"
```

`pcctl` locates `control/` via its own binary's directory first (so it works
no matter what directory it's invoked from — this matters because a spawned
agent runs it from inside its own project repo, not from `control/`), falling
back to checking the current directory for `go.mod` when run via `go run`
during development.

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
`journal.md` (created on first use, header included) is a third, append-only
file per project — "tasks memory" — a dated history of completed work,
distinct from `tasks.md`'s live open/done checklist which gets edited in
place. Every agent role appends to it when finishing a task.

## The five agent roles

Defined globally at `~/.claude/agents/{analyst,golang-dev,frontend-dev,godot-dev,qa-tester}.md`
(YAML frontmatter `name`/`description` + a system-prompt body — no `tools:`
restriction in the files themselves; tool access is governed once, by the
runner's `--allowedTools`/`--permission-mode`, not doubled up). Global scope
means any onboarded project can use any role. Verified recognized via
`claude agents`.

- **analyst** — investigates/scopes a problem, doesn't write code, breaks
  work into queue tasks assigned to the right role.
- **golang-dev**, **frontend-dev**, **godot-dev** — implement work in their
  domain, matching each repo's existing conventions; hand off to qa-tester
  when ready for verification.
- **qa-tester** — actually runs tests/builds and checks behavior against
  acceptance criteria; hands back to the originating role on failure, closes
  out the task on pass.

Each role's system-prompt body ends with the same "closing protocol": update
`status.md`/`tasks.md` for what changed, append a `journal.md` entry, and
mark its queue task done or hand it off — see [Memory + queue contract
every role follows](#memory--queue-contract-every-role-follows) below for
the exact mechanics.

## The shared task queue (`internal/queue`, `db/queue.sqlite3`)

This is the "common ground" the roles exchange work through — a single
board spanning every project, not a per-project list. Unlike `meta/`,
this is SQLite as the live source of truth (concurrently written by
multiple role runs), not a markdown document. Schema: `id`, `host/org/repo`,
`role`, `title`, `body`, `status` (`open`/`done`/`blocked`/`cancelled`),
`created_by`, `parent_task_id` (set on hand-off, links the chain), `notes`,
timestamps.

```
pcctl queue add <project> <role> <title>              # human or bot adds work for a role
pcctl queue list [--role r] [--project p] [--status s]
pcctl queue show <task-id>
pcctl queue done <task-id> [notes...]
pcctl queue handoff <task-id> <to-role> <title>        # marks current task done, creates the next one
```

A spawned agent reaches this the same way you do: `pcctl` is put on that
run's `PATH` by `internal/runner` (see below), so `Bash(pcctl queue:*)` in
the safe tool allowlist is enough for it to list/claim/close/hand-off tasks
itself mid-run.

### Memory + queue contract every role follows

Every `/run`/`/full` in `internal/bot` passes three things to
`internal/runner` beyond the plain prompt: `Agent: <role>` (`--agent`, swaps
in that role's persona for the whole headless session), `ExtraAddDirs:
[metaDir]` (`--add-dir`, so the agent can Read/Edit/Write that project's
`status.md`/`tasks.md`/`journal.md` even though its `cwd` is the project's
own repo, not `control/meta/...`), and an `AppendSystemPrompt` (built by
`systemPromptFor` in `internal/bot/bot.go`) telling the agent exactly where
its meta dir is and how to invoke `pcctl queue`. This is prompt-level
enforcement, not a hard gate — there's no hook yet that blocks a run from
ending without a memory update; that's a reasonable hardening step for
later if an agent turns out to skip it.

## Onboarding vs. relocating

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
`/run <role> <name> <prompt>` (constrained: `acceptEdits` + a safe
read/edit/git-read/`pcctl queue` tool allowlist, capped at
`PCCTL_MAX_BUDGET_SAFE` USD, default $2),
`/full <role> <name> <prompt>` → `/confirm <token>` (unrestricted
`bypassPermissions`, capped at `PCCTL_MAX_BUDGET_FULL`, default $10 —
requires the two-step confirmation so a full-permission run is never one
accidental message away), `/runs`, `/stop <run-id>`, `/resume <run-id>
<prompt>` (carries the original run's role and permission mode forward),
plus the queue commands: `/queue [role]`, `/task <id>`, `/assign <role>
<project> <title>`, `/taskdone <id> [notes]`, `/handoff <id> <role>
<title>`. `role` must be one of `analyst`, `golang-dev`, `frontend-dev`,
`godot-dev`, `qa-tester`.

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
exercised end-to-end with a throwaway harness. The bot itself was bootstrapped
for real (`/whoami` → `TELEGRAM_MASTER_USER_ID` set → `/list` accepted).

**Verified manually, agent-role wiring** (2026-09-14): `claude agents`
confirms all 5 role definitions are recognized. A throwaway harness spawned
a real `--agent golang-dev` run against a scratch project and confirmed,
in one pass: (1) the persona override took effect (`claude -p` reported
"I am acting as the golang-dev role"), (2) `--add-dir <metaDir>` genuinely
grants Edit/Write access to `journal.md` outside the run's own `cwd`, and
(3) `Bash(pcctl queue:*)` in the allowlist plus the runner's `PATH`
injection let the agent invoke `pcctl queue list --role golang-dev`
directly, and it returned real results. Along the way this also caught and
fixed a real bug: `pcctl` originally required `control/` as cwd, which
broke for an agent invoking it from its own project directory — fixed by
resolving `control/` from the running binary's own path first. The queue's
`add`/`list`/`show`/`done`/`handoff` CLI subcommands were each exercised
directly too, including a real hand-off chaining `parent_task_id`.

Not yet exercised: `/stop` against a genuinely long-running process, and
the bot's new role-aware `/run`/`/queue`/`/assign`/`/handoff` commands over
live Telegram (only the underlying Go functions were tested directly).
