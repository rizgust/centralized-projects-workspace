// pcctl is the CLI for Projects-Centralized: it builds the gitignored parts
// of the workspace (repos/<id> clones, worktrees/, runtime/) from
// workspace.yaml, validates the workspace files, and serves the local dashboard.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/rizgust/centralized-projects-workspace/internal/dashboard"
	"github.com/rizgust/centralized-projects-workspace/internal/workspace"
)

// resolveRoot finds the workspace root (the directory holding go.mod) via
// the running binary's own location first, so pcctl works from any cwd,
// falling back to cwd for `go run` during development.
func resolveRoot() (string, error) {
	if exe, err := os.Executable(); err == nil {
		if resolved, err := filepath.EvalSymlinks(exe); err == nil {
			exe = resolved
		}
		dir := filepath.Dir(exe)
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(filepath.Join(cwd, "go.mod")); err != nil {
		return "", fmt.Errorf("could not locate the workspace root (checked the pcctl binary's own directory and cwd %s for go.mod)", cwd)
	}
	return cwd, nil
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	root, err := resolveRoot()
	if err != nil {
		fatal(err)
	}

	switch os.Args[1] {
	case "init":
		cmdInit(root, os.Args[2:])
	case "check":
		cmdCheck(root)
	case "dashboard":
		cmdDashboard(root, os.Args[2:])
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Println(`usage: pcctl <command>

  init [--dry-run] [--no-clone] clone missing repos/<id>, create worktrees/ and runtime/
  check                         validate workspace.yaml, project files, repos and task states
  dashboard [--port 7777] [--dev]   serve the local dashboard on 127.0.0.1`)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}

func cmdInit(root string, args []string) {
	var opt workspace.InitOptions
	for _, a := range args {
		switch a {
		case "--dry-run":
			opt.DryRun = true
		case "--no-clone":
			opt.NoClone = true
		default:
			fatal(fmt.Errorf("unknown flag %s", a))
		}
	}
	c, err := workspace.Load(root)
	if err != nil {
		fatal(err)
	}
	if err := workspace.Init(root, c, opt, os.Stdout); err != nil {
		fatal(err)
	}
	if opt.DryRun {
		fmt.Println("dry run only, nothing written")
	}
}

func cmdCheck(root string) {
	c, err := workspace.Load(root)
	if err != nil {
		fatal(err)
	}
	problems := workspace.Check(root, c)
	for _, pr := range problems {
		fmt.Println("-", pr)
	}
	if len(problems) > 0 {
		os.Exit(1)
	}
	fmt.Printf("ok: %d project(s)\n", len(c.Projects))
}

func cmdDashboard(root string, args []string) {
	fs := flag.NewFlagSet("dashboard", flag.ExitOnError)
	port := fs.Int("port", 7777, "port on 127.0.0.1")
	dev := fs.Bool("dev", false, "allow the Vite dev server on localhost:5173 and expose /api/dev-token")
	_ = fs.Parse(args)
	if err := dashboard.Serve(root, dashboard.Options{Port: *port, Dev: *dev}); err != nil {
		fatal(err)
	}
}
