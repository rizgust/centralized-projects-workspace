// pcctl is the single CLI for Projects-Centralized: it rebuilds the project
// index, onboards/relocates repos, and runs the Telegram control bot.
// Run it from inside control/ — every path below is resolved relative to
// the current working directory on that assumption.
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/rizgust/centralized-projects-workspace/internal/bot"
	"github.com/rizgust/centralized-projects-workspace/internal/config"
	"github.com/rizgust/centralized-projects-workspace/internal/index"
	"github.com/rizgust/centralized-projects-workspace/internal/onboard"
	"github.com/rizgust/centralized-projects-workspace/internal/relocate"
	"github.com/rizgust/centralized-projects-workspace/internal/runner"
)

type paths struct {
	controlRoot string
	pcRoot      string
	metaRoot    string
	dbDir       string
	indexDBPath string
	runsDBPath  string
	logsDir     string
	envPath     string
}

func resolvePaths() (paths, error) {
	controlRoot, err := os.Getwd()
	if err != nil {
		return paths{}, err
	}
	if _, err := os.Stat(filepath.Join(controlRoot, "go.mod")); err != nil {
		return paths{}, fmt.Errorf("run pcctl from the control/ directory (no go.mod found in %s)", controlRoot)
	}
	pcRoot := filepath.Dir(controlRoot)
	return paths{
		controlRoot: controlRoot,
		pcRoot:      pcRoot,
		metaRoot:    filepath.Join(controlRoot, "meta"),
		dbDir:       filepath.Join(controlRoot, "db"),
		indexDBPath: filepath.Join(controlRoot, "db", "index.sqlite3"),
		runsDBPath:  filepath.Join(controlRoot, "db", "runs.sqlite3"),
		logsDir:     filepath.Join(pcRoot, "logs"),
		envPath:     filepath.Join(controlRoot, ".env"),
	}, nil
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	p, err := resolvePaths()
	if err != nil {
		fatal(err)
	}
	if err := os.MkdirAll(p.dbDir, 0o755); err != nil {
		fatal(err)
	}

	switch os.Args[1] {
	case "sync":
		cmdSync(p)
	case "onboard":
		cmdOnboard(p, os.Args[2:])
	case "relocate":
		cmdRelocate(p, os.Args[2:])
	case "bot":
		cmdBot(p)
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Println(`usage: pcctl <command>

  sync                          rebuild db/index.sqlite3 from meta/**/*.md
  onboard <remote-url>          fresh git clone into ../repos/<host>/<org>/<repo> + scaffold meta
  relocate <path> [--yes]       move an existing local working copy in (dry run without --yes)
  bot                           start the Telegram control bot (long polling)`)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}

func cmdSync(p paths) {
	db, err := index.Open(p.indexDBPath)
	if err != nil {
		fatal(err)
	}
	defer db.Close()
	counts, err := index.Rebuild(db, p.metaRoot)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("synced %d project(s), %d task(s) -> %s\n", counts.Projects, counts.Tasks, p.indexDBPath)
}

func cmdOnboard(p paths, args []string) {
	if len(args) < 1 {
		fmt.Println("usage: pcctl onboard <remote-url>")
		os.Exit(1)
	}
	res, err := onboard.Run(p.pcRoot, p.controlRoot, args[0])
	if err != nil {
		fatal(err)
	}
	fmt.Printf("cloned -> %s\n", res.TargetDir)
	if res.Scaffolded {
		fmt.Printf("scaffolded meta -> %s\n", res.MetaDir)
	} else {
		fmt.Printf("meta already existed, left untouched -> %s\n", res.MetaDir)
	}
	fmt.Println("run: pcctl sync")
}

func cmdRelocate(p paths, args []string) {
	if len(args) < 1 {
		fmt.Println("usage: pcctl relocate <path> [--yes]")
		os.Exit(1)
	}
	confirm := false
	for _, a := range args[1:] {
		if a == "--yes" {
			confirm = true
		}
	}

	plan, err := relocate.Prepare(p.pcRoot, p.controlRoot, args[0])
	if err != nil {
		fatal(err)
	}
	fmt.Printf("plan: move\n  %s\n  -> %s\nand mark relocated: true in\n  %s/status.md\n", plan.Src, plan.TargetDir, plan.MetaDir)

	if !confirm {
		fmt.Println("\ndry run only — re-run with --yes to actually move the folder.")
		return
	}
	if err := relocate.Execute(plan); err != nil {
		fatal(err)
	}
	fmt.Printf("moved -> %s\nmeta updated. run: pcctl sync\n", plan.TargetDir)
}

func cmdBot(p paths) {
	if err := config.LoadEnvFile(p.envPath); err != nil {
		fatal(err)
	}
	cfg := config.Load()
	if cfg.TelegramMasterID == 0 {
		fmt.Println("warning: TELEGRAM_MASTER_USER_ID is not set — every command except /whoami will be refused until you set it in control/.env and restart")
	}

	idxDB, err := index.Open(p.indexDBPath)
	if err != nil {
		fatal(err)
	}
	defer idxDB.Close()
	if _, err := index.Rebuild(idxDB, p.metaRoot); err != nil {
		fatal(err)
	}

	mgr, err := runner.Open(p.runsDBPath, p.logsDir, nil)
	if err != nil {
		fatal(err)
	}
	if n, err := mgr.ReconcileOnBoot(); err != nil {
		fatal(err)
	} else if n > 0 {
		fmt.Printf("marked %d stale run(s) as interrupted from a previous boot\n", n)
	}

	b, err := bot.New(cfg, p.metaRoot, p.controlRoot, idxDB, mgr)
	if err != nil {
		fatal(err)
	}
	if err := b.Run(); err != nil {
		fatal(err)
	}
}
