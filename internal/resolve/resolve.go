// Package resolve looks up a project by a user-typed name like "satudata",
// "Nuanu-com/satudata", or "github.com/Nuanu-com/satudata" against
// control/meta.
package resolve

import (
	"fmt"
	"os"
	"strings"

	"github.com/rizgust/centralized-projects-workspace/internal/meta"
)

type Match struct {
	Dir    meta.ProjectDir
	Status meta.Status
}

func (m Match) FullName() string {
	return fmt.Sprintf("%s/%s/%s", m.Dir.Host, m.Dir.Org, m.Dir.Repo)
}

func Project(metaRoot, query string) (Match, error) {
	dirs, err := meta.Walk(metaRoot)
	if err != nil {
		return Match{}, err
	}

	q := strings.ToLower(strings.Trim(query, "/"))
	var matches []meta.ProjectDir
	for _, d := range dirs {
		full := strings.ToLower(fmt.Sprintf("%s/%s/%s", d.Host, d.Org, d.Repo))
		orgRepo := strings.ToLower(fmt.Sprintf("%s/%s", d.Org, d.Repo))
		repo := strings.ToLower(d.Repo)
		if q == full || q == orgRepo || q == repo {
			matches = append(matches, d)
		}
	}

	if len(matches) == 0 {
		return Match{}, fmt.Errorf("no project found matching %q", query)
	}
	if len(matches) > 1 {
		var names []string
		for _, d := range matches {
			names = append(names, fmt.Sprintf("%s/%s/%s", d.Host, d.Org, d.Repo))
		}
		return Match{}, fmt.Errorf("ambiguous %q, matches: %s", query, strings.Join(names, ", "))
	}

	d := matches[0]
	raw, err := os.ReadFile(meta.StatusPath(metaRoot, d.Host, d.Org, d.Repo))
	if err != nil {
		return Match{}, err
	}
	s, err := meta.ParseStatus(raw)
	if err != nil {
		return Match{}, err
	}
	return Match{Dir: d, Status: s}, nil
}
