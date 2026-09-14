// Package relocate moves an existing local working copy (e.g. under
// ~/Projects) into repos/<host>/<org>/<repo>. Always explicit and confirmed
// by the caller — dry-run unless Confirm is true.
package relocate

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/rizgust/centralized-projects-workspace/internal/meta"
	"github.com/rizgust/centralized-projects-workspace/internal/remote"
)

type Plan struct {
	Ref       remote.Ref
	Src       string
	TargetDir string
	MetaDir   string
}

func Prepare(pcRoot, controlRoot, src string) (Plan, error) {
	src, err := filepath.Abs(src)
	if err != nil {
		return Plan{}, err
	}
	if _, err := os.Stat(filepath.Join(src, ".git")); err != nil {
		return Plan{}, fmt.Errorf("not a git repo: %s", src)
	}

	out, err := exec.Command("git", "-C", src, "remote", "get-url", "origin").Output()
	if err != nil {
		return Plan{}, fmt.Errorf("could not read 'origin' remote in %s: %w", src, err)
	}
	remoteURL := strings.TrimSpace(string(out))

	ref, err := remote.Parse(remoteURL)
	if err != nil {
		return Plan{}, err
	}

	targetDir := filepath.Join(pcRoot, "repos", ref.Host, ref.Org, ref.Repo)
	metaDir := filepath.Join(controlRoot, "meta", ref.Host, ref.Org, ref.Repo)

	if _, err := os.Stat(targetDir); err == nil {
		return Plan{}, fmt.Errorf("target already exists, refusing to overwrite: %s", targetDir)
	}

	return Plan{Ref: ref, Src: src, TargetDir: targetDir, MetaDir: metaDir}, nil
}

// Execute performs the move. Only call this once the caller has confirmed.
func Execute(p Plan) error {
	if err := os.MkdirAll(filepath.Dir(p.TargetDir), 0o755); err != nil {
		return err
	}
	if err := os.Rename(p.Src, p.TargetDir); err != nil {
		return fmt.Errorf("move failed: %w", err)
	}

	if err := os.MkdirAll(p.MetaDir, 0o755); err != nil {
		return err
	}
	statusPath := filepath.Join(p.MetaDir, "status.md")
	body := "Free-form current-state notes."
	if raw, err := os.ReadFile(statusPath); err == nil {
		if existing, perr := meta.ParseStatus(raw); perr == nil && existing.Body != "" {
			body = existing.Body
		}
	}
	remoteOut, _ := exec.Command("git", "-C", p.TargetDir, "remote", "get-url", "origin").Output()
	s := meta.Status{
		Org: p.Ref.Org, Repo: p.Ref.Repo, Host: p.Ref.Host, Remote: strings.TrimSpace(string(remoteOut)),
		LocalPath: p.TargetDir, Relocated: true,
		LastSynced: time.Now().Format("2006-01-02"),
		Health:     "unknown", Body: body,
	}
	if err := os.WriteFile(statusPath, []byte(s.Render()), 0o644); err != nil {
		return err
	}
	tasksPath := filepath.Join(p.MetaDir, "tasks.md")
	if _, err := os.Stat(tasksPath); os.IsNotExist(err) {
		if err := os.WriteFile(tasksPath, []byte(meta.RenderTasks(p.Ref.Org, p.Ref.Repo, nil)), 0o644); err != nil {
			return err
		}
	}
	return nil
}
