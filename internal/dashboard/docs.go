package dashboard

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Project documents the Owner edits from the dashboard (brief.md, requirements/*.md, ...).
// Only Markdown files inside projects/<id>/ are reachable.

func (s *server) docPath(project, rel string) (string, error) {
	p, ok := s.cfg().Projects[project]
	if !ok {
		return "", errors.New("unknown project " + project)
	}
	rel = filepath.ToSlash(filepath.Clean(rel))
	if rel == "." || strings.HasPrefix(rel, "../") || strings.HasPrefix(rel, "/") || strings.Contains(rel, ":") ||
		!strings.HasSuffix(strings.ToLower(rel), ".md") {
		return "", errors.New("only .md files inside the project folder can be read or edited")
	}
	base := filepath.Join(s.root, filepath.FromSlash(p.ProjectPath))
	full := filepath.Join(base, filepath.FromSlash(rel))
	if r, err := filepath.Rel(base, full); err != nil || strings.HasPrefix(r, "..") {
		return "", errors.New("path escapes the project folder")
	}
	return full, nil
}

func (s *server) docRoutes(h func(string, func(http.ResponseWriter, *http.Request) (any, error))) {
	h("GET /api/projects/{id}/docs/{path...}", func(w http.ResponseWriter, r *http.Request) (any, error) {
		full, err := s.docPath(r.PathValue("id"), r.PathValue("path"))
		if err != nil {
			return nil, err
		}
		b, err := os.ReadFile(full)
		if os.IsNotExist(err) {
			return map[string]any{"path": r.PathValue("path"), "content": "", "exists": false}, nil
		}
		if err != nil {
			return nil, err
		}
		return map[string]any{"path": r.PathValue("path"), "content": string(b), "exists": true}, nil
	})
	h("PUT /api/projects/{id}/docs/{path...}", func(w http.ResponseWriter, r *http.Request) (any, error) {
		full, err := s.docPath(r.PathValue("id"), r.PathValue("path"))
		if err != nil {
			return nil, err
		}
		var req struct {
			Content string `json:"content"`
		}
		if err := readJSON(r, &req); err != nil {
			return nil, err
		}
		if len(req.Content) > 512*1024 {
			return nil, errors.New("document too large (max 512 KB)")
		}
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(full, []byte(req.Content), 0o644); err != nil {
			return nil, err
		}
		s.hub.publish("workflow", map[string]string{"project": r.PathValue("id")})
		return map[string]any{"path": r.PathValue("path"), "content": req.Content, "exists": true}, nil
	})
}
