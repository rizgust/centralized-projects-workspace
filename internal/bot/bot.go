// Package bot wires a long-polling Telegram bot to the project index and
// the agent runner, gated to a single master user.
package bot

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/PaulSonOfLars/gotgbot/v2"
	"github.com/PaulSonOfLars/gotgbot/v2/ext"
	"github.com/PaulSonOfLars/gotgbot/v2/ext/handlers"

	"github.com/rizgust/centralized-projects-workspace/internal/config"
	"github.com/rizgust/centralized-projects-workspace/internal/index"
	"github.com/rizgust/centralized-projects-workspace/internal/runner"
)

var safeAllowedTools = []string{
	"Read", "Edit", "Write", "Grep", "Glob",
	"Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
}

type pendingFull struct {
	name, prompt, token string
	expires             time.Time
}

type Bot struct {
	cfg         config.Config
	metaRoot    string
	controlRoot string
	idxDB       *sql.DB
	runner      *runner.Manager
	bot         *gotgbot.Bot
	updater     *ext.Updater

	mu      sync.Mutex
	pending map[int64]pendingFull
}

func New(cfg config.Config, metaRoot, controlRoot string, idxDB *sql.DB, mgr *runner.Manager) (*Bot, error) {
	if cfg.TelegramBotToken == "" {
		return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN not set in control/.env")
	}
	gbot, err := gotgbot.NewBot(cfg.TelegramBotToken, nil)
	if err != nil {
		return nil, fmt.Errorf("creating bot: %w", err)
	}

	b := &Bot{
		cfg: cfg, metaRoot: metaRoot, controlRoot: controlRoot,
		idxDB: idxDB, runner: mgr, bot: gbot,
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
	}
}

// wrap gates every command except /whoami to the configured master user.
func (b *Bot) wrap(fn handlers.Response) handlers.Response {
	return func(bot *gotgbot.Bot, ctx *ext.Context) error {
		if !b.isMaster(ctx) {
			_, err := ctx.EffectiveMessage.Reply(bot, "not authorized. send /whoami and set TELEGRAM_MASTER_USER_ID in control/.env to your id, then restart the bot.", nil)
			return err
		}
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
	if err := b.updater.StartPolling(b.bot, &ext.PollingOpts{
		DropPendingUpdates: true,
		GetUpdatesOpts: &gotgbot.GetUpdatesOpts{
			Timeout: 9,
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
	msg := fmt.Sprintf("[%s] run %s (%s/%s) finished: %s\n%s",
		r.Status, shortID(r.ID), r.Org, r.Repo, costLine(r.CostUSD), truncate(r.Summary, 3000))
	b.bot.SendMessage(b.cfg.TelegramMasterID, msg, nil)
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

// index is used by commands.go via this small helper so callers don't need
// to import database/sql directly.
func (b *Bot) rebuildIndex() (index.Counts, error) {
	return index.Rebuild(b.idxDB, b.metaRoot)
}
