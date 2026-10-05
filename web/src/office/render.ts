// Per-frame drawing on top of the cached background: monitor screens, rack LEDs and
// heat, TVs, task-card stacks, depth-sorted characters/chairs/desks, and status bubbles.
import { drawCharacter, drawIcon, drawSholat, frameCount, resolve, variantFor, type AgentStyle, type AtlasPose, type IconName, type Pose, type Variant } from "./characters";
import { drawText, fitText, hash, px, rect, textWidth, type Ctx } from "./pixel";
import * as P from "./props";
import { OUT } from "./props";
import { sprite, ANCHOR_X, ANCHOR_Y, type Dir } from "./sprites";
import type { Actor, Sim } from "./sim";
import type { Chair, Desk, World } from "./world";
import { propPart } from "./propAtlas";

function drawChair(ctx: Ctx, c: Chair) {
  if (c.kind === "part") propPart(ctx, c.name, c.sx, c.sy, c.sw, c.sh, c.dx, c.dy);
  else if (c.kind === "office") P.chairBack(ctx, c.cx, c.top);
  else P.woodChairBack(ctx, c.cx, c.top);
}

export interface LiveExtras {
  cpu: number | null;
  todayTokens: number | null;
  todayCost: number | null;
  interactive: number;
  /** actor key -> recently finished run outcome (shows done / sweat icon) */
  recent: Map<string, "done" | "sweat">;
  openQuestions: number;
}

export interface Hit {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameOpts {
  t: number;
  reduced: boolean;
  hover: string | null;
  focus: string | null;
  registerHover: boolean;
  style: AgentStyle;
}

export function compact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K";
  return String(n);
}

const seatedOn = (a: Actor | undefined, d: Desk) => !!a && !a.path.length && a.at === d.seat;

interface PoseInfo {
  pose: Pose;
  dir: Dir;
  frame: number;
  dx: number;
  atlasPose?: AtlasPose;
}

function poseFor(a: Actor, t: number, reduced: boolean, variant: Variant): PoseInfo {
  const sp = !a.path.length ? a.at : null;
  const role = a.worker.role;
  const st = a.worker.state;
  if (!sp) {
    const n = frameCount(variant, role, "walk", a.dir);
    // ~5 fps step cycle driven by distance walked
    return { pose: "walk", dir: a.dir, frame: reduced ? 0 : Math.floor(a.walked / (n <= 2 ? 9 : 6)) % n, dx: 0 };
  }
  const dir = sp.dir;
  let frame = 0;
  let dx = 0;
  switch (sp.kind) {
    case "deskA":
    case "deskB":
      if (st === "working") return { pose: "sitType", dir, frame: reduced ? 0 : Math.floor(t / 150) % 3, dx };
      if (st === "blocked") {
        if (!reduced && t % 1600 < 450) dx = Math.floor(t / 60) % 2 ? 1 : -1;
        return { pose: "frustrated", dir, frame: reduced ? 0 : Math.floor(t / 300) % 2, dx };
      }
      return { pose: "sitIdle", dir, frame: reduced ? 0 : Math.floor(t / 900) % 2, dx };
    case "meetTop":
      return { pose: "read", dir, frame: 0, dx, atlasPose: "tablet" };
    case "meetBottom":
      return { pose: "sitIdle", dir, frame: reduced ? 0 : Math.floor(t / 900) % 2, dx };
    case "couch":
      return { pose: "couch", dir, frame: 0, dx };
    default:
      frame = reduced ? 0 : Math.floor(t / 500) % 2;
      return { pose: "stand", dir, frame, dx, atlasPose: sp.talk && st === "idle" ? "talk" : undefined };
  }
}

export function drawFrame(ctx: Ctx, w: World, sim: Sim, ex: LiveExtras, o: FrameOpts): Hit[] {
  const t = o.reduced ? 0 : o.t;
  ctx.drawImage(w.bg, 0, 0);
  const variantOf = (a: Actor) => variantFor(a.project, a.worker.role, o.style);

  // ---- server room heat + racks
  const cpu = ex.cpu ?? 0;
  if (w.server && cpu > 40) {
    const s = w.server;
    const gr = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, 10, s.x + s.w / 2, s.y + s.h / 2, s.w);
    gr.addColorStop(0, `rgba(255,90,40,${(((cpu - 40) / 60) * 0.42).toFixed(3)})`);
    gr.addColorStop(1, "rgba(255,90,40,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  const led = cpu >= 85 ? "#ff5a5a" : cpu >= 60 ? "#ffc23d" : null;
  const tick = Math.floor(t / Math.max(70, 650 - cpu * 6));
  w.racks.forEach((r, ri) => {
    const units = Math.floor((r.h - 10) / 5);
    for (let u = 0; u < units; u++) {
      const uy = r.y + 6 + u * 5;
      for (const [ci, cx0] of [r.x + 5, r.x + Math.floor(r.w / 2) + 4].entries())
        for (let k = 0; k < 3; k++) {
          const on = hash(ri * 977 + ci * 499 + u * 31 + k * 7 + tick * 13) < Math.max(0.15, cpu / 100);
          px(ctx, cx0 + k * 3, uy, on ? (led ?? (k % 2 ? "#4ade80" : "#5ab8ff")) : "#1b1e28");
        }
    }
    if (cpu > 70) for (let k = 0; k < 3; k++) px(ctx, r.x + 8 + k * 7 + (Math.floor(t / 200 + k) % 2), r.y - 3 - ((Math.floor(t / 110) + k * 3) % 8), "rgba(255,150,80,0.85)");
  });
  if (w.server) {
    const sc = w.server.screen;
    rect(ctx, sc.x, sc.y, 42, 22, "#0e1a2c");
    drawText(ctx, "CPU", sc.x + 3, sc.y + 3, "#8fa3c7");
    drawText(ctx, ex.cpu === null ? "--" : `${Math.round(cpu)}%`, sc.x + 17, sc.y + 3, cpu >= 85 ? "#ff8f8f" : cpu >= 60 ? "#ffd479" : "#9df5b8");
    rect(ctx, sc.x + 3, sc.y + 13, 36, 4, "#1d2a40");
    rect(ctx, sc.x + 3, sc.y + 13, Math.round((36 * Math.min(100, cpu)) / 100), 4, led ?? "#4ade80");
  }

  // ---- TVs
  for (const tv of w.tvs) {
    rect(ctx, tv.x, tv.y, tv.w, tv.h, "#16284a");
    if (tv.kind === "tokens") {
      drawText(ctx, "TODAY", tv.x + 4, tv.y + 4, "#8fd3ff");
      drawText(ctx, fitText(`${ex.todayTokens === null ? "--" : compact(ex.todayTokens)} TOKENS`, tv.w - 8), tv.x + 4, tv.y + 13, "#ffffff");
      drawText(ctx, fitText(`${ex.todayCost === null ? "--" : "$" + ex.todayCost.toFixed(2)} API-EQ`, tv.w - 8), tv.x + 4, tv.y + 22, "#ffd76a");
      if (Math.floor(t / 700) % 2) px(ctx, tv.x + tv.w - 4, tv.y + 4, "#ff5a6a");
    } else {
      for (let i = 0; i < 9; i++) {
        const hgt = 4 + Math.floor(hash(i * 13 + Math.floor(t / 2000)) * (tv.h - 10));
        rect(ctx, tv.x + 3 + i * 5, tv.y + tv.h - 3 - hgt, 3, hgt, i % 3 === 0 ? "#f7d154" : "#5ab8ff");
      }
    }
  }

  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  const hits: Hit[] = [];
  const bubbles: (() => void)[] = [];
  const handled = new Set<string>();

  const pushHit = (a: Actor, box: { x: number; y: number; w: number; h: number }, x: number) => {
    hits.push({ key: a.key, ...box });
    if (o.hover === a.key || o.focus === a.key) {
      for (let k = 0; k < 3; k++) rect(ctx, x - 3 + k, box.y - 6 + k, 7 - k * 2, 1, "#ffffff");
    }
    bubbles.push(() => bubble(ctx, a, x, box.y, t, ex.recent.get(a.key)));
  };

  // ---- cubicle islands: one item per (A,B) pair, so desk A, partition and B monitors stack right
  const islands = new Map<string, { A?: Desk; B?: Desk }>();
  for (const d of w.desks.values()) {
    const k = `${d.cx},${d.dA}`;
    const isl = islands.get(k) ?? {};
    isl[d.row] = d;
    islands.set(k, isl);
  }
  for (const { A, B } of islands.values()) {
    if (!A) continue;
    const a = sim.actors.get(A.key);
    const seated = seatedOn(a, A);
    if (seated) handled.add(a!.key);
    const { cx, dA } = A;
    items.push({
      y: dA + 10,
      draw: () => {
        let femaleWork = false;
        if (seated && a) {
          const v = variantOf(a);
          const pi = poseFor(a, t, o.reduced, v);
          const r = resolve(v, a.worker.role, pi.pose, pi.dir, pi.frame, pi.atlasPose);
          if (r && r.pose === "work" && r.variant === "female") {
            femaleWork = true;
            const box = drawCharacter(ctx, v, a.worker.role, pi.pose, pi.dir, pi.frame, cx + pi.dx, dA + 18, undefined, r);
            pushHit(a, box, cx);
          } else if (r && r.pose === "work") {
            P.chairFront(ctx, cx, dA - 26);
            deskA(ctx, cx, dA);
            const box = drawCharacter(ctx, v, a.worker.role, pi.pose, pi.dir, pi.frame, cx + pi.dx, dA + 13, undefined, r);
            pushHit(a, box, cx);
          } else {
            P.chairFront(ctx, cx, dA - 26);
            const box = drawCharacter(ctx, v, a.worker.role, pi.pose, pi.dir, pi.frame, cx + pi.dx, A.seat.y, pi.atlasPose, r);
            deskA(ctx, cx, dA);
            for (const b of A.backs) P.monitorBack(ctx, b.x, b.y, a.worker.state === "working");
            pushHit(a, { ...box, h: Math.max(8, dA + 3 - box.y) }, cx);
          }
        } else {
          P.chairFront(ctx, cx, dA - 26);
          deskA(ctx, cx, dA);
          for (const b of A.backs) P.monitorBack(ctx, b.x, b.y, false);
        }
        if (!femaleWork) cards(ctx, A, a);
        P.partition(ctx, cx - 34, dA + 11, 68);
        if (B) {
          const b = sim.actors.get(B.key);
          const bs = seatedOn(b, B);
          for (const [i, s] of B.screens.entries()) screen(ctx, s.x, s.y, bs ? b!.worker.state : undefined, t, cx + i * 3, 18, 9);
          cards(ctx, B, b);
        }
      },
    });
  }

  // ---- everybody else
  for (const a of sim.actors.values()) {
    if (handled.has(a.key)) continue;
    const v = variantOf(a);
    const pi = poseFor(a, t, o.reduced, v);
    const sp = !a.path.length ? a.at : null;
    let sortY = a.y;
    let clipY: number | undefined;
    let ay = a.y;
    if (sp?.kind === "meetTop") {
      clipY = sp.clipY;
      sortY = sp.y - 12;
    }
    if (sp?.kind === "couch") clipY = sp.clipY;
    const sh = a.sholat && sp && sp === a.sholat.spot ? a.sholat : null;
    if (sh) {
      clipY = undefined;
      sortY = a.y;
    }
    if (!sp) {
      const oc = w.occluders.find((q) => a.y > q.yTop && a.y < q.yBottom + 4 && a.x > q.x0 - 6 && a.x < q.x1 + 6);
      if (oc) clipY = oc.yTop + 2;
    }
    const x = a.x + pi.dx;
    items.push({
      y: sortY,
      draw: () => {
        if (!sp || sp.kind === "stand") rect(ctx, x - 8, ay - 2, 16, 3, P.SHADOW);
        if (clipY !== undefined) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - 40, ay - 90, 80, clipY - (ay - 90));
          ctx.clip();
        }
        let box = sh?.pose ? drawSholat(ctx, v, sh.pose, x, ay - (sh.bob ?? 0), sh.flip) : null;
        if (!box) box = drawCharacter(ctx, v, a.worker.role, pi.pose, pi.dir, pi.frame, x, ay, pi.atlasPose);
        if (clipY !== undefined) ctx.restore();
        pushHit(a, clipY !== undefined ? { ...box, h: Math.max(8, clipY - box.y) } : box, x);
        if (sp?.chair && !sh) drawChair(ctx, sp.chair);
        if (sh?.phase === "wudhu" && !o.reduced) {
          const tx = x + (sh.flip ? -13 : 13);
          for (let k = 0; k < 3; k++) {
            const dy = (Math.floor(t / 90) + k * 5) % 12;
            px(ctx, tx + ((k * 3) % 4) - 1, ay - 26 + dy, k % 2 ? "#8fd3ff" : "#5ab8ff");
          }
        }
      },
    });
  }
  // empty chairs in front of back-facing seats
  for (const s of w.spots.values()) {
    if (!s.chair) continue;
    if ([...sim.actors.values()].some((a) => !a.path.length && a.at === s)) continue;
    items.push({ y: s.y, draw: () => drawChair(ctx, s.chair!) });
  }
  // the owner
  if (w.owner) {
    const ow = w.owner;
    items.push({
      y: ow.y - 12,
      draw: () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(ow.x - 40, ow.y - 80, 80, ow.clipY - (ow.y - 80));
        ctx.clip();
        const live = ex.interactive > 0;
        const c = sprite("owner", live ? "sitType" : "sitIdle", "down", live ? Math.floor(t / 160) % 3 : Math.floor(t / 900) % 2);
        ctx.drawImage(c, ow.x - ANCHOR_X, ow.y - ANCHOR_Y);
        ctx.restore();
        const L = ow.screen;
        if (live) {
          const gr = ctx.createRadialGradient(L.x + 13, L.y + 6, 1, L.x + 13, L.y + 6, 24);
          gr.addColorStop(0, "rgba(143,240,255,0.45)");
          gr.addColorStop(1, "rgba(143,240,255,0)");
          ctx.fillStyle = gr;
          ctx.fillRect(L.x - 14, L.y - 20, 54, 46);
        }
        if (live) bubbles.push(() => textBubble(ctx, ow.x + 14, ow.y - 50, `${ex.interactive} LIVE`, "normal"));
        hits.push({ key: "__owner", x: ow.x - 14, y: ow.y - 40, w: 28, h: 30 });
        if (ex.openQuestions > 0)
          bubbles.push(() => {
            // notification badge with the number of open questions
            const bx = ow.x - 22;
            const by = ow.y - 46;
            const txt = String(Math.min(9, ex.openQuestions));
            rect(ctx, bx + 1, by, 9, 11, OUT);
            rect(ctx, bx, by + 1, 11, 9, OUT);
            rect(ctx, bx + 1, by + 1, 9, 9, "#e63946");
            drawText(ctx, txt, bx + 4, by + 3, "#ffffff");
          });
      },
    });
  }

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  if (w.register) {
    const r = w.register;
    if (o.registerHover || Math.floor(t / 600) % 2 === 0) {
      const c = o.registerHover ? "#ffffff" : "#fff2b8";
      rect(ctx, r.x - 2, r.y - 2, r.w + 4, 1, c);
      rect(ctx, r.x - 2, r.y + r.h + 1, r.w + 4, 1, c);
    }
  }
  for (const b of bubbles) b();
  return hits;
}

function deskA(ctx: Ctx, cx: number, dA: number) {
  P.deskTop(ctx, cx - 32, dA, 64, 16);
  P.papers(ctx, cx - 30, dA + 3);
}

function cards(ctx: Ctx, d: Desk, a: Actor | undefined) {
  const st = a?.worker.state;
  const q = a?.worker.queued ?? 0;
  if (a && (st === "waiting" || q > 0)) {
    const n = Math.min(4, Math.max(1, q));
    const notes = ["#ffe37a", "#a8e6ff", "#ffb3c7", "#b9f5a8"];
    for (let i = 0; i < n; i++) {
      const x = d.cards.x + (i % 2);
      const y = d.cards.y - i * 2;
      rect(ctx, x, y, 11, 8, OUT);
      rect(ctx, x + 1, y + 1, 9, 6, notes[i]);
      rect(ctx, x + 2, y + 5, 6, 1, "rgba(0,0,0,0.25)");
    }
    if (q > 0) drawText(ctx, String(Math.min(9, q)), d.cards.x + 4 + ((n - 1) % 2), d.cards.y - (n - 1) * 2 + 1, OUT);
  } else P.mug(ctx, d.cards.x + 3, d.cards.y + 2, d.row === "A" ? "#e34948" : "#3a86ff");
}

function screen(ctx: Ctx, x: number, y: number, state: string | undefined, t: number, seed: number, W = 13, H = 8) {
  if (state === undefined) {
    rect(ctx, x, y, W, H, "#1a2a44");
    rect(ctx, x + 1, y + 1, 4, 1, "#2a4266");
    return;
  }
  if (state === "blocked") {
    rect(ctx, x, y, W, H, Math.floor(t / 400) % 2 ? "#5a1520" : "#3a0f16");
    rect(ctx, x + 6, y + 1, 1, 4, "#ff9aa5");
    px(ctx, x + 6, y + 6, "#ff9aa5");
    return;
  }
  rect(ctx, x, y, W, H, "#bfe3ff");
  rect(ctx, x, y, W, 1, "#6aa7ff");
  if (state === "working") {
    const step = Math.floor(t / 200);
    for (let i = 0; i < 3; i++) {
      const L = step + i;
      rect(ctx, x + 1 + Math.floor(hash(seed * 31 + L) * 2) * 2, y + 2 + i * 2, 3 + Math.floor(hash(seed * 97 + L) * 8), 1, hash(L * 7 + seed) < 0.3 ? "#e34948" : "#3a6ea5");
    }
    if (Math.floor(t / 90) % 7 === 0) rect(ctx, x, y, W, H, "rgba(255,255,255,0.25)");
  } else {
    rect(ctx, x + 1, y + 2, 7, 1, "#7aa7d8");
    rect(ctx, x + 1, y + 4, 9, 1, "#7aa7d8");
    rect(ctx, x + 1, y + 6, 5, 1, "#7aa7d8");
  }
}

function bubble(ctx: Ctx, a: Actor, x: number, top: number, t: number, recent: "done" | "sweat" | undefined) {
  const w = a.worker;
  const atSpot = !a.path.length && !!a.at;
  const icon = (name: IconName) => drawIcon(ctx, name, x + 2, top - 1);
  if (a.sholat) {
    // the agent run keeps going server-side; show it as paused here
    if (w.runId || w.state === "working") pauseBadge(ctx, x + 6, top - 12);
    return;
  }
  if (recent && icon(recent)) return;
  if (w.state === "asking") {
    // bobbing question mark over the head while waiting in the Owner's office
    const bob = Math.round(Math.sin(t / 380) * 1.5);
    if (!drawIcon(ctx, "question", x + 2, top - 1 + bob)) textBubble(ctx, x + 6, top - 12 + bob, "?", "normal");
    return;
  }
  if (w.state === "working" && atSpot) textBubble(ctx, x + 6, top - 12, fitText((w.bubble || "WORK").toUpperCase(), 44), "normal");
  else if (w.state === "blocked") {
    if (Math.floor(t / 400) % 4 !== 3 && !icon("alert")) textBubble(ctx, x + 6, top - 12, "!", "alert");
  } else if (w.state === "review" && atSpot) {
    if (!icon("question")) textBubble(ctx, x + 6, top - 12, "?", "normal");
  } else if (w.state === "waiting" && atSpot) textBubble(ctx, x + 6, top - 12, ".".repeat(1 + (Math.floor(t / 400) % 3)), "soft");
  else if (w.state === "idle" && atSpot) {
    if (a.at?.kind === "couch") textBubble(ctx, x + 6, top - 12, "Z".repeat(1 + (Math.floor(t / 600) % 3)), "soft");
    else if (a.at?.talk && Math.floor(t / 2500) % 2 === 0) icon("talk");
  }
}

function pauseBadge(ctx: Ctx, x: number, y: number) {
  rect(ctx, x, y, 13, 11, OUT);
  rect(ctx, x + 1, y + 1, 11, 9, "#fff6c9");
  rect(ctx, x + 4, y + 3, 2, 5, OUT);
  rect(ctx, x + 7, y + 3, 2, 5, OUT);
}

function textBubble(ctx: Ctx, x: number, y: number, text: string, kind: "normal" | "alert" | "soft") {
  const w = textWidth(text) + 8;
  const h = 11;
  const bg = kind === "alert" ? "#e63946" : kind === "soft" ? "#dfe6f3" : "#ffffff";
  const fg = kind === "alert" ? "#ffffff" : "#24243a";
  rect(ctx, x + 1, y + 2, w, h, "rgba(24,22,44,0.25)");
  rect(ctx, x + 1, y, w - 2, h, OUT);
  rect(ctx, x, y + 1, w, h - 2, OUT);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, bg);
  rect(ctx, x + 1, y + 1, w - 2, 1, kind === "alert" ? "#ff6b75" : "#ffffff");
  rect(ctx, x + 2, y + h - 1, 4, 1, bg);
  rect(ctx, x + 2, y + h, 3, 1, bg);
  px(ctx, x + 1, y + h, OUT);
  px(ctx, x + 5, y + h, OUT);
  rect(ctx, x + 2, y + h + 1, 3, 1, OUT);
  drawText(ctx, text, x + 4, y + 3, fg);
}
