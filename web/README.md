# PC Office — dashboard UI

Local-only dashboard for the Projects-Centralized workspace: a pixel-art office where each
registered project is a room and the six roles are workers at their desks, plus Projects,
Tasks (kanban), Agents (runs + sessions), Usage (token analytics) and System (CPU/memory).

Vite + React 19 + TypeScript. Served by `pcctl dashboard`, which embeds `dist/` (see `embed.go`).
The API contract is [`API.md`](./API.md).

## Develop

Requires [Bun](https://bun.sh) (no Node needed).

```sh
cd web
bun install
bun run dev            # Vite on http://127.0.0.1:5173, proxies /api to 127.0.0.1:7777
```

In dev the UI fetches its token from `GET /api/dev-token`, so run the server with
`pcctl dashboard --dev` (port 7777).

### Mock mode (no backend)

Open `http://127.0.0.1:5173/?mock=1` (or start with `VITE_MOCK=1 bun run dev`). Every endpoint
is served from in-memory fixtures (`src/mock/`) and SSE is simulated:

- 3 projects (web app, game, template), 25 tasks across all statuses, 3 runs (1 running),
  90 days of usage across 3 models, 10 sessions, 15 min of CPU history.
- The running agent emits a scripted event stream; CPU fluctuates every 2 s; workers wander
  between states; today's usage ticks up. Mutations work: activate, register, create/move
  tasks, add notes, launch/stop runs. Runs launched from the UI finish after ~25 s.
- `?mock=1&empty=1` starts with no projects, which shows the HQ room and the
  "Register your first project" sign.

Mock mode also works in the production build (the mock is a lazily loaded chunk).

## Build

```sh
bun run typecheck      # tsc --noEmit (strict)
bun run build          # typecheck + vite build -> dist/ (keeps dist/.gitkeep)
```

`dist/` is gitignored except `.gitkeep`, so the Go embed compiles on a clean checkout.
In production the server must fill `<meta name="pc-token" content="">` in `dist/index.html`.

## Where things live

| Path | What |
|---|---|
| `src/api/types.ts` | TS types mirroring `API.md` |
| `src/api/client.ts` | typed fetch client, token handling, SSE with reconnect backoff |
| `src/store.tsx` | live state (SSE → React context), toasts, global dialogs, `useRunEvents` |
| `src/office/pixel.ts` | palette, 3×5 bitmap font, palette-indexed worker sprites |
| `src/office/scene.ts` | office layout, cached background, per-frame drawing, hit-testing |
| `src/office/OfficeCanvas.tsx` | canvas component: integer DPR scaling, rAF loop, hover/click |
| `src/components/charts.tsx` | hand-rolled SVG charts (columns, bars, line, meter) |
| `src/components/` | dialogs, run log, pixel avatar, shared UI |
| `src/pages/` | one file per page |
| `src/mock/` | fixtures + mock server/SSE |

Pixel art is drawn procedurally on a 1× world canvas and scaled by an integer number of
device pixels (`imageSmoothingEnabled = false`), so it stays crisp at any DPR. The loop pauses
when the tab is hidden; with `prefers-reduced-motion` the office renders static poses.
