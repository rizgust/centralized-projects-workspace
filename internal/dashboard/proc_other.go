//go:build !windows

package dashboard

import "os/exec"

func hideWindow(c *exec.Cmd) {}
