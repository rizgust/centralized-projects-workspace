// Package web embeds the built dashboard UI (web/dist, produced by
// `bun run build`). When the UI has not been built, dist holds only
// .gitkeep and the server shows build instructions instead.
package web

import "embed"

//go:embed all:dist
var Dist embed.FS
