package workspace

import (
	"bytes"
	"fmt"
	"os"
	"strconv"

	"gopkg.in/yaml.v3"
)

// Workspace YAML files are hand-edited by the Owner and by agents, so writes go
// through yaml.Node: keys keep their order and comments survive an update.

func readNode(path string) (*yaml.Node, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc yaml.Node
	if err := yaml.Unmarshal(b, &doc); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 || doc.Content[0].Kind != yaml.MappingNode {
		return nil, fmt.Errorf("%s: top level is not a mapping", path)
	}
	return &doc, nil
}

func writeNode(path string, doc *yaml.Node) error {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(doc); err != nil {
		return err
	}
	if err := enc.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, spaceTopLevel(buf.Bytes()), 0o644)
}

// spaceTopLevel restores the blank line before each top-level key or top-level
// comment block, which yaml.v3 drops; the templates use that layout.
func spaceTopLevel(b []byte) []byte {
	lines := bytes.Split(b, []byte("\n"))
	out := make([][]byte, 0, len(lines)*2)
	for i, l := range lines {
		topLevel := len(l) > 0 && l[0] != ' ' && l[0] != '-'
		if i > 0 && topLevel {
			prev := out[len(out)-1]
			prevComment := len(prev) > 0 && prev[0] == '#'
			if len(prev) > 0 && !(prevComment && l[0] != '#') && !(prevComment && l[0] == '#') {
				out = append(out, nil)
			}
		}
		out = append(out, l)
	}
	return bytes.Join(out, []byte("\n"))
}

// mapGet returns the value node for key in mapping m, or nil.
func mapGet(m *yaml.Node, key string) *yaml.Node {
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			return m.Content[i+1]
		}
	}
	return nil
}

// mapSet replaces the value for key (keeping the key's comments), or appends it.
func mapSet(m *yaml.Node, key string, val *yaml.Node) {
	for i := 0; i+1 < len(m.Content); i += 2 {
		if m.Content[i].Value == key {
			old := m.Content[i+1]
			val.LineComment = old.LineComment
			m.Content[i+1] = val
			return
		}
	}
	m.Content = append(m.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key}, val)
}

func strNode(s string) *yaml.Node {
	n := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: s}
	if bytes.ContainsAny([]byte(s), "\n") {
		n.Style = yaml.LiteralStyle
	}
	return n
}

func nullNode() *yaml.Node { return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"} }

func optStrNode(s *string) *yaml.Node {
	if s == nil || *s == "" {
		return nullNode()
	}
	return strNode(*s)
}

func intNode(i int) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: strconv.Itoa(i)}
}

func boolNode(b bool) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: strconv.FormatBool(b)}
}

func listNode(items []string) *yaml.Node {
	n := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
	if len(items) == 0 {
		n.Style = yaml.FlowStyle
	}
	for _, it := range items {
		n.Content = append(n.Content, strNode(it))
	}
	return n
}
