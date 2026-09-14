// Package remote parses git remote URLs into host/org/repo triples.
package remote

import (
	"fmt"
	"regexp"
	"strings"
)

type Ref struct {
	Host, Org, Repo string
}

var (
	sshRe  = regexp.MustCompile(`^git@([^:]+):(.+)$`)
	httpRe = regexp.MustCompile(`^https?://([^/]+)/(.+)$`)
	altRe  = regexp.MustCompile(`^ssh://git@([^/]+)/(.+)$`)
)

func Parse(url string) (Ref, error) {
	var host, path string
	switch {
	case sshRe.MatchString(url):
		m := sshRe.FindStringSubmatch(url)
		host, path = m[1], m[2]
	case altRe.MatchString(url):
		m := altRe.FindStringSubmatch(url)
		host, path = m[1], m[2]
	case httpRe.MatchString(url):
		m := httpRe.FindStringSubmatch(url)
		host, path = m[1], m[2]
	default:
		return Ref{}, fmt.Errorf("unrecognized remote URL: %s", url)
	}
	path = strings.TrimSuffix(path, ".git")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 {
		return Ref{}, fmt.Errorf("remote URL missing org/repo: %s", url)
	}
	repo := parts[len(parts)-1]
	org := parts[len(parts)-2]
	return Ref{Host: host, Org: org, Repo: repo}, nil
}
