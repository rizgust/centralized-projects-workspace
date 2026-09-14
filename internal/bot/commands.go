package bot

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/PaulSonOfLars/gotgbot/v2"
	"github.com/PaulSonOfLars/gotgbot/v2/ext"

	"github.com/rizgust/centralized-projects-workspace/internal/meta"
	"github.com/rizgust/centralized-projects-workspace/internal/resolve"
	"github.com/rizgust/centralized-projects-workspace/internal/runner"
)

const helpText = `Projects-Centralized control bot

/list [org]              list tracked projects
/status <name>           show a project's status.md
/tasks <name>            show a project's open/done tasks
/sync                    rebuild the project index from meta/

/run <name> <prompt>     start a constrained agent run (safe tool subset)
/full <name> <prompt>    start a run with full permissions (needs /confirm)
/confirm <token>         confirm a pending /full request
/runs                    list recent runs
/stop <run-id>           stop a running run
/resume <run-id> <text>  continue a finished/stopped run's session

/whoami                  show your Telegram user id (works even if unauthorized)`

func (b *Bot) cmdWhoami(bot *gotgbot.Bot, ctx *ext.Context) error {
	id := int64(0)
	name := ""
	if ctx.EffectiveUser != nil {
		id = ctx.EffectiveUser.Id
		name = ctx.EffectiveUser.Username
	}
	fmt.Printf("[/whoami] telegram user id=%d username=%q\n", id, name)
	msg := fmt.Sprintf("your telegram user id: %d", id)
	if b.cfg.TelegramMasterID == 0 {
		msg += "\n\nTELEGRAM_MASTER_USER_ID is not set yet. Add it to control/.env and restart the bot to authorize yourself."
	} else if !b.isMaster(ctx) {
		msg += "\n\nthis id is not the configured master user."
	}
	_, err := ctx.EffectiveMessage.Reply(bot, msg, nil)
	return err
}

func (b *Bot) cmdHelp(bot *gotgbot.Bot, ctx *ext.Context) error {
	_, err := ctx.EffectiveMessage.Reply(bot, helpText, nil)
	return err
}

func (b *Bot) cmdSync(bot *gotgbot.Bot, ctx *ext.Context) error {
	counts, err := b.rebuildIndex()
	if err != nil {
		return b.reply(bot, ctx, "sync failed: "+err.Error())
	}
	return b.reply(bot, ctx, fmt.Sprintf("synced %d project(s), %d task(s)", counts.Projects, counts.Tasks))
}

func (b *Bot) cmdList(bot *gotgbot.Bot, ctx *ext.Context) error {
	if _, err := b.rebuildIndex(); err != nil {
		return b.reply(bot, ctx, "sync failed: "+err.Error())
	}
	orgFilter := strings.TrimSpace(splitCommandArgs(ctx))

	rows, err := b.idxDB.Query(`SELECT host, org, repo, health, relocated, local_path FROM projects ORDER BY host, org, repo`)
	if err != nil {
		return b.reply(bot, ctx, "query failed: "+err.Error())
	}
	defer rows.Close()

	var lines []string
	for rows.Next() {
		var host, org, repo, health, localPath string
		var relocated int
		if err := rows.Scan(&host, &org, &repo, &health, &relocated, &localPath); err != nil {
			return err
		}
		if orgFilter != "" && !strings.EqualFold(org, orgFilter) {
			continue
		}
		state := "not cloned here"
		if localPath != "" {
			state = "cloned"
			if relocated == 1 {
				state = "relocated (single copy)"
			}
		}
		lines = append(lines, fmt.Sprintf("%s/%s/%s — %s, %s", host, org, repo, health, state))
	}
	if len(lines) == 0 {
		return b.reply(bot, ctx, "no tracked projects yet. onboard one with: pcctl onboard <remote-url>")
	}
	return b.reply(bot, ctx, strings.Join(lines, "\n"))
}

func (b *Bot) cmdStatus(bot *gotgbot.Bot, ctx *ext.Context) error {
	name := strings.TrimSpace(splitCommandArgs(ctx))
	if name == "" {
		return b.reply(bot, ctx, "usage: /status <name>")
	}
	m, err := resolve.Project(b.metaRoot, name)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	s := m.Status
	local := s.LocalPath
	if local == "" {
		local = "(not cloned in this workspace)"
	}
	msg := fmt.Sprintf("%s\nhealth: %s\nrelocated: %t\nlocal_path: %s\nlast_synced: %s\n\n%s",
		m.FullName(), s.Health, s.Relocated, local, s.LastSynced, s.Body)
	return b.reply(bot, ctx, msg)
}

func (b *Bot) cmdTasks(bot *gotgbot.Bot, ctx *ext.Context) error {
	name := strings.TrimSpace(splitCommandArgs(ctx))
	if name == "" {
		return b.reply(bot, ctx, "usage: /tasks <name>")
	}
	m, err := resolve.Project(b.metaRoot, name)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	raw, err := os.ReadFile(meta.TasksPath(b.metaRoot, m.Dir.Host, m.Dir.Org, m.Dir.Repo))
	if err != nil {
		return b.reply(bot, ctx, "no tasks.md for "+m.FullName())
	}
	tasks := meta.ParseTasks(raw)
	if len(tasks) == 0 {
		return b.reply(bot, ctx, m.FullName()+": no tasks recorded")
	}
	var lines []string
	lines = append(lines, m.FullName()+":")
	for _, t := range tasks {
		mark := "[ ]"
		if t.Done {
			mark = "[x]"
		}
		lines = append(lines, fmt.Sprintf("%s %s", mark, t.Text))
	}
	return b.reply(bot, ctx, strings.Join(lines, "\n"))
}

func (b *Bot) cmdRun(bot *gotgbot.Bot, ctx *ext.Context) error {
	name, prompt := splitNameRest(splitCommandArgs(ctx))
	if name == "" || prompt == "" {
		return b.reply(bot, ctx, "usage: /run <name> <prompt>")
	}
	m, err := resolve.Project(b.metaRoot, name)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	if m.Status.LocalPath == "" {
		return b.reply(bot, ctx, m.FullName()+" has no local_path — onboard or relocate it first")
	}

	run, err := b.runner.Start(runner.ProjectRef{
		Host: m.Dir.Host, Org: m.Dir.Org, Repo: m.Dir.Repo, CWD: m.Status.LocalPath,
	}, prompt, runner.Options{
		PermissionMode: "acceptEdits",
		AllowedTools:   safeAllowedTools,
		MaxBudgetUSD:   b.cfg.MaxBudgetSafe,
	})
	if err != nil {
		return b.reply(bot, ctx, "failed to start: "+err.Error())
	}
	return b.reply(bot, ctx, fmt.Sprintf("started run %s on %s (safe mode, budget $%.2f). I'll message you when it finishes.",
		shortID(run.ID), m.FullName(), b.cfg.MaxBudgetSafe))
}

func (b *Bot) cmdFull(bot *gotgbot.Bot, ctx *ext.Context) error {
	name, prompt := splitNameRest(splitCommandArgs(ctx))
	if name == "" || prompt == "" {
		return b.reply(bot, ctx, "usage: /full <name> <prompt>")
	}
	if _, err := resolve.Project(b.metaRoot, name); err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	token := genToken()
	b.mu.Lock()
	b.pending[ctx.EffectiveUser.Id] = pendingFull{name: name, prompt: prompt, token: token, expires: time.Now().Add(2 * time.Minute)}
	b.mu.Unlock()
	return b.reply(bot, ctx, fmt.Sprintf(
		"this will run against %s with FULL permissions (bypassPermissions, budget $%.2f) — no tool restrictions.\nreply /confirm %s within 2 minutes to proceed.",
		name, b.cfg.MaxBudgetFull, token))
}

func (b *Bot) cmdConfirm(bot *gotgbot.Bot, ctx *ext.Context) error {
	token := strings.TrimSpace(splitCommandArgs(ctx))
	if token == "" {
		return b.reply(bot, ctx, "usage: /confirm <token>")
	}
	b.mu.Lock()
	p, ok := b.pending[ctx.EffectiveUser.Id]
	if ok {
		delete(b.pending, ctx.EffectiveUser.Id)
	}
	b.mu.Unlock()

	if !ok || p.token != token {
		return b.reply(bot, ctx, "no matching pending /full request")
	}
	if time.Now().After(p.expires) {
		return b.reply(bot, ctx, "that confirmation expired, run /full again")
	}

	m, err := resolve.Project(b.metaRoot, p.name)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	if m.Status.LocalPath == "" {
		return b.reply(bot, ctx, m.FullName()+" has no local_path — onboard or relocate it first")
	}

	run, err := b.runner.Start(runner.ProjectRef{
		Host: m.Dir.Host, Org: m.Dir.Org, Repo: m.Dir.Repo, CWD: m.Status.LocalPath,
	}, p.prompt, runner.Options{
		PermissionMode: "bypassPermissions",
		MaxBudgetUSD:   b.cfg.MaxBudgetFull,
	})
	if err != nil {
		return b.reply(bot, ctx, "failed to start: "+err.Error())
	}
	return b.reply(bot, ctx, fmt.Sprintf("started FULL run %s on %s. I'll message you when it finishes.", shortID(run.ID), m.FullName()))
}

func (b *Bot) cmdRuns(bot *gotgbot.Bot, ctx *ext.Context) error {
	runs, err := b.runner.List(15)
	if err != nil {
		return b.reply(bot, ctx, "query failed: "+err.Error())
	}
	if len(runs) == 0 {
		return b.reply(bot, ctx, "no runs yet")
	}
	var lines []string
	for _, r := range runs {
		lines = append(lines, fmt.Sprintf("%s  %-11s %s/%s  %s", shortID(r.ID), r.Status, r.Org, r.Repo, r.StartedAt))
	}
	return b.reply(bot, ctx, strings.Join(lines, "\n"))
}

func (b *Bot) cmdStop(bot *gotgbot.Bot, ctx *ext.Context) error {
	id := strings.TrimSpace(splitCommandArgs(ctx))
	if id == "" {
		return b.reply(bot, ctx, "usage: /stop <run-id>")
	}
	run, err := b.runner.FindByPrefix(id)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	if err := b.runner.Stop(run.ID); err != nil {
		return b.reply(bot, ctx, "stop failed: "+err.Error())
	}
	return b.reply(bot, ctx, "stopping "+shortID(run.ID))
}

func (b *Bot) cmdResume(bot *gotgbot.Bot, ctx *ext.Context) error {
	id, prompt := splitNameRest(splitCommandArgs(ctx))
	if id == "" || prompt == "" {
		return b.reply(bot, ctx, "usage: /resume <run-id> <prompt>")
	}
	prev, err := b.runner.FindByPrefix(id)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}

	opts := runner.Options{PermissionMode: "acceptEdits", AllowedTools: safeAllowedTools, MaxBudgetUSD: b.cfg.MaxBudgetSafe}
	if prev.PermissionMode == "bypassPermissions" {
		opts = runner.Options{PermissionMode: "bypassPermissions", MaxBudgetUSD: b.cfg.MaxBudgetFull}
	}

	run, err := b.runner.Resume(prev.ID, prompt, opts)
	if err != nil {
		return b.reply(bot, ctx, "resume failed: "+err.Error())
	}
	return b.reply(bot, ctx, fmt.Sprintf("resumed as %s (continuing %s/%s's session). I'll message you when it finishes.",
		shortID(run.ID), run.Org, run.Repo))
}

func (b *Bot) reply(bot *gotgbot.Bot, ctx *ext.Context, text string) error {
	_, err := ctx.EffectiveMessage.Reply(bot, text, nil)
	return err
}
