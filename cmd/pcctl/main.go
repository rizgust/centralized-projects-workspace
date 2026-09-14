// pcctl is the single CLI for Projects-Centralized: it rebuilds the project
// index, onboards/relocates repos, and runs the Telegram control bot.
// Run it from inside control/ — every path below is resolved relative to
// the current working directory on that assumption.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/rizgust/centralized-projects-workspace/internal/bot"
	"github.com/rizgust/centralized-projects-workspace/internal/config"
	"github.com/rizgust/centralized-projects-workspace/internal/index"
	"github.com/rizgust/centralized-projects-workspace/internal/onboard"
	"github.com/rizgust/centralized-projects-workspace/internal/queue"
	"github.com/rizgust/centralized-projects-workspace/internal/relocate"
	"github.com/rizgust/centralized-projects-workspace/internal/resolve"
	"github.com/rizgust/centralized-projects-workspace/internal/runner"
)

type paths struct {
	controlRoot string
	pcRoot      string
	metaRoot    string
	dbDir       string
	indexDBPath string
	runsDBPath  string
	queueDBPath string
	logsDir     string
	envPath     string
}

// resolvePaths finds control/ two ways: primarily via the running binary's
// own location (pcctl.exe lives in control/, so this works no matter what
// directory a caller — including a spawned agent working in its own repo —
// invoked it from), falling back to cwd for `go run` during development.
func resolvePaths() (paths, error) {
	controlRoot := ""
	if exe, err := os.Executable(); err == nil {
		if resolved, err := filepath.EvalSymlinks(exe); err == nil {
			exe = resolved
		}
		dir := filepath.Dir(exe)
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			controlRoot = dir
		}
	}
	if controlRoot == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return paths{}, err
		}
		if _, err := os.Stat(filepath.Join(cwd, "go.mod")); err != nil {
			return paths{}, fmt.Errorf("could not locate control/ (checked the pcctl binary's own directory and cwd %s for go.mod)", cwd)
		}
		controlRoot = cwd
	}
	pcRoot := filepath.Dir(controlRoot)
	return paths{
		controlRoot: controlRoot,
		pcRoot:      pcRoot,
		metaRoot:    filepath.Join(controlRoot, "meta"),
		dbDir:       filepath.Join(controlRoot, "db"),
		indexDBPath: filepath.Join(controlRoot, "db", "index.sqlite3"),
		runsDBPath:  filepath.Join(controlRoot, "db", "runs.sqlite3"),
		queueDBPath: filepath.Join(controlRoot, "db", "queue.sqlite3"),
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
	case "queue":
		cmdQueue(p, os.Args[2:])
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
  bot                           start the Telegram control bot (long polling)

  queue add <project> <role> <title>            add a task to the shared queue
  queue list [--role r] [--project p] [--status s]   list queue tasks
  queue show <task-id>                           show one task
  queue done <task-id> [notes...]                mark a task done
  queue handoff <task-id> <to-role> <title>      finish a task, hand a new one to another role`)
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

	mgr, err := runner.Open(p.runsDBPath, p.logsDir, p.controlRoot, nil)
	if err != nil {
		fatal(err)
	}
	if n, err := mgr.ReconcileOnBoot(); err != nil {
		fatal(err)
	} else if n > 0 {
		fmt.Printf("marked %d stale run(s) as interrupted from a previous boot\n", n)
	}

	q, err := queue.Open(p.queueDBPath)
	if err != nil {
		fatal(err)
	}

	b, err := bot.New(cfg, p.metaRoot, p.controlRoot, idxDB, mgr, q)
	if err != nil {
		fatal(err)
	}
	if err := b.Run(); err != nil {
		fatal(err)
	}
}

func cmdQueue(p paths, args []string) {
	if len(args) < 1 {
		usage()
		os.Exit(1)
	}
	q, err := queue.Open(p.queueDBPath)
	if err != nil {
		fatal(err)
	}

	switch args[0] {
	case "add":
		if len(args) < 4 {
			fmt.Println("usage: pcctl queue add <project> <role> <title...>")
			os.Exit(1)
		}
		m, err := resolveProject(p.metaRoot, args[1])
		if err != nil {
			fatal(err)
		}
		title := strings.Join(args[3:], " ")
		t, err := q.Add(m.Dir.Host, m.Dir.Org, m.Dir.Repo, args[2], title, "", "human", "")
		if err != nil {
			fatal(err)
		}
		fmt.Printf("added task %s [%s] %s (%s)\n", t.ID, t.Role, t.Title, t.Project())

	case "list":
		var f queue.Filter
		fs := flag.NewFlagSet("queue list", flag.ExitOnError)
		fs.StringVar(&f.Role, "role", "", "filter by role")
		fs.StringVar(&f.Status, "status", "", "filter by status")
		project := fs.String("project", "", "filter by project name")
		fs.Parse(args[1:])
		if *project != "" {
			m, err := resolveProject(p.metaRoot, *project)
			if err != nil {
				fatal(err)
			}
			f.Host, f.Org, f.Repo = m.Dir.Host, m.Dir.Org, m.Dir.Repo
		}
		tasks, err := q.List(f, 50)
		if err != nil {
			fatal(err)
		}
		if len(tasks) == 0 {
			fmt.Println("no matching tasks")
			return
		}
		for _, t := range tasks {
			fmt.Printf("%s  %-9s %-12s %s (%s)\n", t.ID, t.Status, t.Role, t.Title, t.Project())
		}

	case "show":
		if len(args) < 2 {
			fmt.Println("usage: pcctl queue show <task-id>")
			os.Exit(1)
		}
		t, err := q.FindByPrefix(args[1])
		if err != nil {
			fatal(err)
		}
		fmt.Printf("id: %s\nproject: %s\nrole: %s\nstatus: %s\ntitle: %s\nbody: %s\ncreated_by: %s\nparent: %s\nnotes: %s\ncreated_at: %s\ndone_at: %s\n",
			t.ID, t.Project(), t.Role, t.Status, t.Title, t.Body, t.CreatedBy, t.ParentTaskID, t.Notes, t.CreatedAt, t.DoneAt)

	case "done":
		if len(args) < 2 {
			fmt.Println("usage: pcctl queue done <task-id> [notes...]")
			os.Exit(1)
		}
		t, err := q.FindByPrefix(args[1])
		if err != nil {
			fatal(err)
		}
		notes := strings.Join(args[2:], " ")
		if err := q.SetStatus(t.ID, queue.StatusDone, notes); err != nil {
			fatal(err)
		}
		fmt.Printf("marked %s done\n", t.ID)

	case "handoff":
		if len(args) < 4 {
			fmt.Println("usage: pcctl queue handoff <task-id> <to-role> <title...>")
			os.Exit(1)
		}
		t, err := q.FindByPrefix(args[1])
		if err != nil {
			fatal(err)
		}
		title := strings.Join(args[3:], " ")
		next, err := q.HandOff(t.ID, args[2], title, "", "")
		if err != nil {
			fatal(err)
		}
		fmt.Printf("%s done -> handed off as %s [%s] %s\n", t.ID, next.ID, next.Role, next.Title)

	default:
		usage()
		os.Exit(1)
	}
}

func resolveProject(metaRoot, query string) (resolve.Match, error) {
	return resolve.Project(metaRoot, query)
}
