// Package onboard clones a repo fresh into repos/<host>/<org>/<repo> and
// scaffolds its control/meta entry. It never touches an existing local
// working copy elsewhere (e.g. under ~/Projects) — see internal/relocate
// for that separate, explicit action.
package onboard

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/rizgust/centralized-projects-workspace/internal/meta"
	"github.com/rizgust/centralized-projects-workspace/internal/remote"
)

type Result struct {
	Ref        remote.Ref
	TargetDir  string
	MetaDir    string
	Scaffolded bool
}

// pcRoot is Projects-Centralized itself (the parent of control/).
func Run(pcRoot, controlRoot, remoteURL string) (Result, error) {
	ref, err := remote.Parse(remoteURL)
	if err != nil {
		return Result{}, err
	}

	targetDir := filepath.Join(pcRoot, "repos", ref.Host, ref.Org, ref.Repo)
	metaDir := filepath.Join(controlRoot, "meta", ref.Host, ref.Org, ref.Repo)

	if _, err := os.Stat(targetDir); err == nil {
		return Result{}, fmt.Errorf("already onboarded: %s", targetDir)
	}

	if err := os.MkdirAll(filepath.Dir(targetDir), 0o755); err != nil {
		return Result{}, err
	}

	cmd := exec.Command("git", "clone", remoteURL, targetDir)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return Result{}, fmt.Errorf("git clone: %w", err)
	}

	res := Result{Ref: ref, TargetDir: targetDir, MetaDir: metaDir}

	if _, err := os.Stat(filepath.Join(metaDir, "status.md")); os.IsNotExist(err) {
		if err := os.MkdirAll(metaDir, 0o755); err != nil {
			return Result{}, err
		}
		s := meta.Status{
			Org: ref.Org, Repo: ref.Repo, Host: ref.Host, Remote: remoteURL,
			LocalPath: targetDir, Relocated: false,
			LastSynced: time.Now().Format("2006-01-02"),
			Health:     "unknown", Body: "Free-form current-state notes.",
		}
		if err := os.WriteFile(filepath.Join(metaDir, "status.md"), []byte(s.Render()), 0o644); err != nil {
			return Result{}, err
		}
		tasksPath := filepath.Join(metaDir, "tasks.md")
		if _, err := os.Stat(tasksPath); os.IsNotExist(err) {
			if err := os.WriteFile(tasksPath, []byte(meta.RenderTasks(ref.Org, ref.Repo, nil)), 0o644); err != nil {
				return Result{}, err
			}
		}
		res.Scaffolded = true
	}

	return res, nil
}
