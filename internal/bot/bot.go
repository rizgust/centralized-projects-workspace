// Package bot wires a long-polling Telegram bot to the project index and
// the agent runner, gated to a single master user.
package bot

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/PaulSonOfLars/gotgbot/v2"
	"github.com/PaulSonOfLars/gotgbot/v2/ext"
	"github.com/PaulSonOfLars/gotgbot/v2/ext/handlers"

	"github.com/rizgust/centralized-projects-workspace/internal/config"
	"github.com/rizgust/centralized-projects-workspace/internal/index"
	"github.com/rizgust/centralized-projects-workspace/internal/queue"
	"github.com/rizgust/centralized-projects-workspace/internal/runner"
)

var safeAllowedTools = []string{
	"Read", "Edit", "Write", "Grep", "Glob",
	"Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
	"Bash(pcctl queue:*)",
}

// knownRoles are the five agent personas defined globally at
// ~/.claude/agents/<role>.md, invoked headlessly via `claude --agent <role>`.
var knownRoles = []string{"analyst", "golang-dev", "frontend-dev", "godot-dev", "qa-tester"}

func isKnownRole(r string) bool {
	for _, k := range knownRoles {
		if r == k {
			return true
		}
	}
	return false
}

type pendingFull struct {
	role, name, prompt, token string
	expires                   time.Time
}

type Bot struct {
	cfg         config.Config
	metaRoot    string
	controlRoot string
	idxDB       *sql.DB
	runner      *runner.Manager
	queue       *queue.Queue
	bot         *gotgbot.Bot
	updater     *ext.Updater

	mu      sync.Mutex
	pending map[int64]pendingFull
}

func New(cfg config.Config, metaRoot, controlRoot string, idxDB *sql.DB, mgr *runner.Manager, q *queue.Queue) (*Bot, error) {
	if cfg.TelegramBotToken == "" {
		return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN not set in control/.env")
	}
	gbot, err := gotgbot.NewBot(cfg.TelegramBotToken, nil)
	if err != nil {
		return nil, fmt.Errorf("creating bot: %w", err)
	}

	b := &Bot{
		cfg: cfg, metaRoot: metaRoot, controlRoot: controlRoot,
		idxDB: idxDB, runner: mgr, queue: q, bot: gbot,
		pending: map[int64]pendingFull{},
	}
	mgr.SetEventHandler(b.notifyRunEvent)

	dispatcher := ext.NewDispatcher(&ext.DispatcherOpts{
		Error: func(b *gotgbot.Bot, ctx *ext.Context, err error) ext.DispatcherAction {
			return ext.DispatcherActionNoop
		},
	})
	for _, h := range b.handlers() {
		dispatcher.AddHandler(h)
	}

	updater := ext.NewUpdater(dispatcher, nil)
	b.updater = updater
	return b, nil
}

func (b *Bot) handlers() []ext.Handler {
	return []ext.Handler{
		handlers.NewCommand("start", b.wrap(b.cmdHelp)),
		handlers.NewCommand("help", b.wrap(b.cmdHelp)),
		handlers.NewCommand("whoami", b.cmdWhoami), // intentionally unauthenticated
		handlers.NewCommand("list", b.wrap(b.cmdList)),
		handlers.NewCommand("status", b.wrap(b.cmdStatus)),
		handlers.NewCommand("tasks", b.wrap(b.cmdTasks)),
		handlers.NewCommand("sync", b.wrap(b.cmdSync)),
		handlers.NewCommand("run", b.wrap(b.cmdRun)),
		handlers.NewCommand("full", b.wrap(b.cmdFull)),
		handlers.NewCommand("confirm", b.wrap(b.cmdConfirm)),
		handlers.NewCommand("runs", b.wrap(b.cmdRuns)),
		handlers.NewCommand("stop", b.wrap(b.cmdStop)),
		handlers.NewCommand("resume", b.wrap(b.cmdResume)),
		handlers.NewCommand("queue", b.wrap(b.cmdQueue)),
		handlers.NewCommand("task", b.wrap(b.cmdTask)),
		handlers.NewCommand("assign", b.wrap(b.cmdAssign)),
		handlers.NewCommand("taskdone", b.wrap(b.cmdTaskDone)),
		handlers.NewCommand("handoff", b.wrap(b.cmdHandoff)),
	}
}

// wrap gates every command except /whoami to the configured master user.
func (b *Bot) wrap(fn handlers.Response) handlers.Response {
	return func(bot *gotgbot.Bot, ctx *ext.Context) error {
		userID := int64(0)
		if ctx.EffectiveUser != nil {
			userID = ctx.EffectiveUser.Id
		}
		if !b.isMaster(ctx) {
			fmt.Printf("[refused] user id=%d text=%q\n", userID, ctx.EffectiveMessage.GetText())
			_, err := ctx.EffectiveMessage.Reply(bot, "not authorized. send /whoami and set TELEGRAM_MASTER_USER_ID in control/.env to your id, then restart the bot.", nil)
			return err
		}
		fmt.Printf("[cmd] user id=%d text=%q\n", userID, ctx.EffectiveMessage.GetText())
		return fn(bot, ctx)
	}
}

func (b *Bot) isMaster(ctx *ext.Context) bool {
	return b.cfg.TelegramMasterID != 0 && ctx.EffectiveUser != nil && ctx.EffectiveUser.Id == b.cfg.TelegramMasterID
}

func (b *Bot) Run() error {
	if _, err := b.bot.GetMe(nil); err != nil {
		return fmt.Errorf("connecting to telegram: %w", err)
	}
	// Timeout is how long Telegram holds the long-poll open server-side;
	// RequestOpts.Timeout is our own HTTP client's deadline for that same
	// request and must be longer, or every empty poll "times out" locally
	// even though nothing is actually wrong.
	if err := b.updater.StartPolling(b.bot, &ext.PollingOpts{
		DropPendingUpdates: true,
		GetUpdatesOpts: &gotgbot.GetUpdatesOpts{
			Timeout:     9,
			RequestOpts: &gotgbot.RequestOpts{Timeout: 20 * time.Second},
		},
	}); err != nil {
		return fmt.Errorf("starting polling: %w", err)
	}
	fmt.Println("bot started (long polling), listening for commands")
	b.updater.Idle()
	return nil
}

func (b *Bot) notifyRunEvent(r runner.Run) {
	if b.cfg.TelegramMasterID == 0 {
		return
	}
	role := r.Role
	if role == "" {
		role = "-"
	}
	msg := fmt.Sprintf("[%s] run %s (%s, %s/%s) finished: %s\n%s",
		r.Status, shortID(r.ID), role, r.Org, r.Repo, costLine(r.CostUSD), truncate(r.Summary, 3000))
	b.bot.SendMessage(b.cfg.TelegramMasterID, msg, nil)
}

// metaDirFor returns this project's control/meta directory, granted to a
// spawned agent via --add-dir so it can read/write status.md, tasks.md and
// journal.md there even though its cwd is the project's own repo.
func (b *Bot) metaDirFor(host, org, repo string) string {
	return filepath.Join(b.metaRoot, host, org, repo)
}

// systemPromptFor briefs a role-run agent on where its project's memory
// files and the shared queue tool live, so it can follow the "update memory
// before finishing" contract every role definition commits to.
func systemPromptFor(role, metaDir string) string {
	return fmt.Sprintf(
		"You are acting as the %s role in Projects-Centralized. "+
			"This project's control metadata lives at: %s (status.md, tasks.md, journal.md) — "+
			"you have file access there via --add-dir. "+
			"The shared cross-role task queue is available as `pcctl queue` on PATH "+
			"(e.g. `pcctl queue list --role %s`, `pcctl queue done <id> <notes>`, "+
			"`pcctl queue handoff <id> <to-role> <title>`). "+
			"Before you finish: update status.md if project state changed, update tasks.md for "+
			"any project-level task this closes or opens, and append a dated entry to journal.md "+
			"summarizing what you did. If you were given a queue task id, mark it done or hand it "+
			"off to the appropriate next role.",
		role, metaDir, role)
}

func genToken() string {
	buf := make([]byte, 4)
	rand.Read(buf)
	return hex.EncodeToString(buf)
}

func shortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

func costLine(cost float64) string {
	if cost <= 0 {
		return ""
	}
	return fmt.Sprintf("($%.3f)", cost)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func splitCommandArgs(ctx *ext.Context) string {
	text := ctx.EffectiveMessage.GetText()
	parts := strings.SplitN(text, " ", 2)
	if len(parts) < 2 {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func splitNameRest(rest string) (name, prompt string) {
	parts := strings.SplitN(rest, " ", 2)
	name = parts[0]
	if len(parts) > 1 {
		prompt = strings.TrimSpace(parts[1])
	}
	return
}

// splitRoleNameRest parses "<role> <project> <rest...>" for /run and /full.
func splitRoleNameRest(rest string) (role, name, prompt string) {
	parts := strings.SplitN(rest, " ", 3)
	if len(parts) > 0 {
		role = parts[0]
	}
	if len(parts) > 1 {
		name = parts[1]
	}
	if len(parts) > 2 {
		prompt = strings.TrimSpace(parts[2])
	}
	return
}

// index is used by commands.go via this small helper so callers don't need
// to import database/sql directly.
func (b *Bot) rebuildIndex() (index.Counts, error) {
	return index.Rebuild(b.idxDB, b.metaRoot)
}
