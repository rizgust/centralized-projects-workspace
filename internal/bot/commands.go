package bot

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/PaulSonOfLars/gotgbot/v2"
	"github.com/PaulSonOfLars/gotgbot/v2/ext"

	"github.com/rizgust/centralized-projects-workspace/internal/meta"
	"github.com/rizgust/centralized-projects-workspace/internal/queue"
	"github.com/rizgust/centralized-projects-workspace/internal/resolve"
	"github.com/rizgust/centralized-projects-workspace/internal/runner"
)

var helpText = "Projects-Centralized control bot\n\n" +
	"/list [org]              list tracked projects\n" +
	"/status <name>           show a project's status.md\n" +
	"/tasks <name>            show a project's open/done tasks\n" +
	"/sync                    rebuild the project index from meta/\n\n" +
	"/run <role> <name> <prompt>    start a constrained agent run (safe tool subset)\n" +
	"/full <role> <name> <prompt>   start a run with full permissions (needs /confirm)\n" +
	"/confirm <token>         confirm a pending /full request\n" +
	"/runs                    list recent runs\n" +
	"/stop <run-id>           stop a running run\n" +
	"/resume <run-id> <text>  continue a finished/stopped run's session\n\n" +
	"roles: " + strings.Join(knownRoles, ", ") + "\n\n" +
	"/queue [role]                     list shared-queue tasks (the roles' common ground)\n" +
	"/task <id>                       show one queue task\n" +
	"/assign <role> <project> <title> add a task to the queue\n" +
	"/taskdone <id> [notes]           mark a queue task done\n" +
	"/handoff <id> <role> <title>     finish a task, hand a new one to another role\n\n" +
	"/whoami                  show your Telegram user id (works even if unauthorized)"

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
	role, name, prompt := splitRoleNameRest(splitCommandArgs(ctx))
	if role == "" || name == "" || prompt == "" {
		return b.reply(bot, ctx, "usage: /run <role> <name> <prompt>\nroles: "+strings.Join(knownRoles, ", "))
	}
	if !isKnownRole(role) {
		return b.reply(bot, ctx, fmt.Sprintf("unknown role %q. roles: %s", role, strings.Join(knownRoles, ", ")))
	}
	m, err := resolve.Project(b.metaRoot, name)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	if m.Status.LocalPath == "" {
		return b.reply(bot, ctx, m.FullName()+" has no local_path — onboard or relocate it first")
	}

	metaDir := b.metaDirFor(m.Dir.Host, m.Dir.Org, m.Dir.Repo)
	run, err := b.runner.Start(runner.ProjectRef{
		Host: m.Dir.Host, Org: m.Dir.Org, Repo: m.Dir.Repo, CWD: m.Status.LocalPath,
	}, prompt, runner.Options{
		PermissionMode:     "acceptEdits",
		AllowedTools:       safeAllowedTools,
		MaxBudgetUSD:       b.cfg.MaxBudgetSafe,
		Agent:              role,
		ExtraAddDirs:       []string{metaDir},
		AppendSystemPrompt: systemPromptFor(role, metaDir),
	})
	if err != nil {
		return b.reply(bot, ctx, "failed to start: "+err.Error())
	}
	return b.reply(bot, ctx, fmt.Sprintf("started run %s as %s on %s (safe mode, budget $%.2f). I'll message you when it finishes.",
		shortID(run.ID), role, m.FullName(), b.cfg.MaxBudgetSafe))
}

func (b *Bot) cmdFull(bot *gotgbot.Bot, ctx *ext.Context) error {
	role, name, prompt := splitRoleNameRest(splitCommandArgs(ctx))
	if role == "" || name == "" || prompt == "" {
		return b.reply(bot, ctx, "usage: /full <role> <name> <prompt>\nroles: "+strings.Join(knownRoles, ", "))
	}
	if !isKnownRole(role) {
		return b.reply(bot, ctx, fmt.Sprintf("unknown role %q. roles: %s", role, strings.Join(knownRoles, ", ")))
	}
	if _, err := resolve.Project(b.metaRoot, name); err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	token := genToken()
	b.mu.Lock()
	b.pending[ctx.EffectiveUser.Id] = pendingFull{role: role, name: name, prompt: prompt, token: token, expires: time.Now().Add(2 * time.Minute)}
	b.mu.Unlock()
	return b.reply(bot, ctx, fmt.Sprintf(
		"this will run as %s against %s with FULL permissions (bypassPermissions, budget $%.2f) — no tool restrictions.\nreply /confirm %s within 2 minutes to proceed.",
		role, name, b.cfg.MaxBudgetFull, token))
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

	metaDir := b.metaDirFor(m.Dir.Host, m.Dir.Org, m.Dir.Repo)
	run, err := b.runner.Start(runner.ProjectRef{
		Host: m.Dir.Host, Org: m.Dir.Org, Repo: m.Dir.Repo, CWD: m.Status.LocalPath,
	}, p.prompt, runner.Options{
		PermissionMode:     "bypassPermissions",
		MaxBudgetUSD:       b.cfg.MaxBudgetFull,
		Agent:              p.role,
		ExtraAddDirs:       []string{metaDir},
		AppendSystemPrompt: systemPromptFor(p.role, metaDir),
	})
	if err != nil {
		return b.reply(bot, ctx, "failed to start: "+err.Error())
	}
	return b.reply(bot, ctx, fmt.Sprintf("started FULL run %s as %s on %s. I'll message you when it finishes.", shortID(run.ID), p.role, m.FullName()))
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

	metaDir := b.metaDirFor(prev.Host, prev.Org, prev.Repo)
	opts := runner.Options{
		PermissionMode: "acceptEdits", AllowedTools: safeAllowedTools, MaxBudgetUSD: b.cfg.MaxBudgetSafe,
		Agent: prev.Role, ExtraAddDirs: []string{metaDir}, AppendSystemPrompt: systemPromptFor(prev.Role, metaDir),
	}
	if prev.PermissionMode == "bypassPermissions" {
		opts = runner.Options{
			PermissionMode: "bypassPermissions", MaxBudgetUSD: b.cfg.MaxBudgetFull,
			Agent: prev.Role, ExtraAddDirs: []string{metaDir}, AppendSystemPrompt: systemPromptFor(prev.Role, metaDir),
		}
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

func (b *Bot) cmdQueue(bot *gotgbot.Bot, ctx *ext.Context) error {
	role := strings.TrimSpace(splitCommandArgs(ctx))
	if role != "" && !isKnownRole(role) {
		return b.reply(bot, ctx, fmt.Sprintf("unknown role %q. roles: %s", role, strings.Join(knownRoles, ", ")))
	}
	tasks, err := b.queue.List(queue.Filter{Role: role, Status: queue.StatusOpen}, 30)
	if err != nil {
		return b.reply(bot, ctx, "query failed: "+err.Error())
	}
	if len(tasks) == 0 {
		return b.reply(bot, ctx, "no open tasks"+roleSuffix(role))
	}
	var lines []string
	for _, t := range tasks {
		lines = append(lines, fmt.Sprintf("%s  %-12s %s (%s)", t.ID, t.Role, t.Title, t.Project()))
	}
	return b.reply(bot, ctx, strings.Join(lines, "\n"))
}

func roleSuffix(role string) string {
	if role == "" {
		return ""
	}
	return " for " + role
}

func (b *Bot) cmdTask(bot *gotgbot.Bot, ctx *ext.Context) error {
	id := strings.TrimSpace(splitCommandArgs(ctx))
	if id == "" {
		return b.reply(bot, ctx, "usage: /task <id>")
	}
	t, err := b.queue.FindByPrefix(id)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	msg := fmt.Sprintf("%s [%s] %s\nproject: %s\nstatus: %s\ncreated_by: %s\nparent: %s\ncreated_at: %s",
		t.ID, t.Role, t.Title, t.Project(), t.Status, t.CreatedBy, t.ParentTaskID, t.CreatedAt)
	if t.Body != "" {
		msg += "\n\n" + t.Body
	}
	if t.Notes != "" {
		msg += "\n\nnotes: " + t.Notes
	}
	return b.reply(bot, ctx, msg)
}

func (b *Bot) cmdAssign(bot *gotgbot.Bot, ctx *ext.Context) error {
	role, name, title := splitRoleNameRest(splitCommandArgs(ctx))
	if role == "" || name == "" || title == "" {
		return b.reply(bot, ctx, "usage: /assign <role> <project> <title>\nroles: "+strings.Join(knownRoles, ", "))
	}
	if !isKnownRole(role) {
		return b.reply(bot, ctx, fmt.Sprintf("unknown role %q. roles: %s", role, strings.Join(knownRoles, ", ")))
	}
	m, err := resolve.Project(b.metaRoot, name)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	t, err := b.queue.Add(m.Dir.Host, m.Dir.Org, m.Dir.Repo, role, title, "", "human", "")
	if err != nil {
		return b.reply(bot, ctx, "failed: "+err.Error())
	}
	return b.reply(bot, ctx, fmt.Sprintf("added task %s [%s] %s (%s)", t.ID, t.Role, t.Title, t.Project()))
}

func (b *Bot) cmdTaskDone(bot *gotgbot.Bot, ctx *ext.Context) error {
	id, notes := splitNameRest(splitCommandArgs(ctx))
	if id == "" {
		return b.reply(bot, ctx, "usage: /taskdone <id> [notes]")
	}
	t, err := b.queue.FindByPrefix(id)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	if err := b.queue.SetStatus(t.ID, queue.StatusDone, notes); err != nil {
		return b.reply(bot, ctx, "failed: "+err.Error())
	}
	return b.reply(bot, ctx, "marked "+t.ID+" done")
}

func (b *Bot) cmdHandoff(bot *gotgbot.Bot, ctx *ext.Context) error {
	id, toRole, title := splitRoleNameRest(splitCommandArgs(ctx))
	if id == "" || toRole == "" || title == "" {
		return b.reply(bot, ctx, "usage: /handoff <id> <to-role> <title>\nroles: "+strings.Join(knownRoles, ", "))
	}
	if !isKnownRole(toRole) {
		return b.reply(bot, ctx, fmt.Sprintf("unknown role %q. roles: %s", toRole, strings.Join(knownRoles, ", ")))
	}
	t, err := b.queue.FindByPrefix(id)
	if err != nil {
		return b.reply(bot, ctx, err.Error())
	}
	next, err := b.queue.HandOff(t.ID, toRole, title, "", "")
	if err != nil {
		return b.reply(bot, ctx, "failed: "+err.Error())
	}
	return b.reply(bot, ctx, fmt.Sprintf("%s done -> handed off as %s [%s] %s", t.ID, next.ID, next.Role, next.Title))
}
