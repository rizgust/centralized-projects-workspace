// Furniture, floors, walls and wall decor for the office map. All drawn with integer
// fillRects in native px, outlined in dark navy, shaded with 2-3 tones.
import { hash, px, rect, type Ctx } from "./pixel";

export const OUT = "#2b2a3a";
export const SHADOW = "rgba(24,22,44,0.24)";

export function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, out = OUT) {
  rect(ctx, x, y, w, h, out);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
}
export function shadow(ctx: Ctx, x: number, y: number, w: number, h: number) {
  rect(ctx, x, y, w, h, SHADOW);
}
function noise(seed: number, i: number) {
  return hash(seed * 7919 + i);
}

// ================================================================== floors
export type FloorKind = "teal" | "wavy" | "olive" | "wood" | "stone" | "server" | "grass" | "sage" | "plum";

export function floor(ctx: Ctx, kind: FloorKind, x: number, y: number, w: number, h: number, seed = 1) {
  switch (kind) {
    case "teal":
    case "sage":
    case "plum": {
      const [base, alt, stitch, fleck] =
        kind === "teal"
          ? ["#3f8f8c", "#3b8885", "#2f7472", "#4fa3a0"]
          : kind === "sage"
            ? ["#8fa877", "#88a070", "#738a5d", "#9db886"]
            : ["#7d6a9a", "#776493", "#635281", "#8a78a8"];
      rect(ctx, x, y, w, h, base);
      for (let ty = 0; ty < h; ty += 16)
        for (let tx = 0; tx < w; tx += 16) {
          if (((tx + ty) / 16) % 2) rect(ctx, x + tx, y + ty, Math.min(16, w - tx), Math.min(16, h - ty), alt);
          for (let k = 0; k < 16; k += 2) {
            if (tx + k < w) px(ctx, x + tx + k, y + ty, stitch);
            if (ty + k < h) px(ctx, x + tx, y + ty + k, stitch);
          }
        }
      for (let i = 0; i < (w * h) / 22; i++) px(ctx, x + Math.floor(noise(seed, i) * w), y + Math.floor(noise(seed + 1, i) * h), i % 3 ? fleck : stitch);
      break;
    }
    case "wavy": {
      rect(ctx, x, y, w, h, "#4a6fb0");
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          const v = (yy + Math.round(Math.sin((xx + seed * 13) / 5) * 2)) % 8;
          if (v === 0) px(ctx, x + xx, y + yy, "#5b82c4");
          else if (v === 1) px(ctx, x + xx, y + yy, "#4366a3");
          else if (v === 5 && (xx + yy) % 2 === 0) px(ctx, x + xx, y + yy, "#456aa8");
        }
      break;
    }
    case "olive": {
      rect(ctx, x, y, w, h, "#86866a");
      const cols = ["#7a7a5f", "#929276", "#6e6e55", "#9c9c80"];
      for (let i = 0; i < (w * h) / 3; i++) px(ctx, x + Math.floor(noise(seed, i) * w), y + Math.floor(noise(seed + 3, i) * h), cols[i % 4]);
      break;
    }
    case "wood": {
      const tones = ["#c58d57", "#bb8450", "#c99460", "#b67f4c"];
      for (let r = 0; r * 8 < h; r++) {
        const yy = y + r * 8;
        const hh = Math.min(8, h - r * 8);
        rect(ctx, x, yy, w, hh, tones[r % 4]);
        if (hh === 8) rect(ctx, x, yy + 7, w, 1, "#8e5f3c");
        rect(ctx, x, yy, w, 1, "#d39c66");
        let k = Math.floor(noise(seed + r, 0) * 40);
        while (k < w) {
          rect(ctx, x + k, yy, 1, hh, "#8e5f3c");
          k += 44 + Math.floor(noise(seed + r, k) * 30);
        }
        for (let g = 0; g < w / 10; g++) {
          const gx = Math.floor(noise(seed + r * 3, g) * w);
          const gy = 2 + Math.floor(noise(seed + r * 5, g) * 4);
          rect(ctx, x + gx, yy + gy, 2 + Math.floor(noise(r, g) * 4), 1, "#a8743f");
        }
      }
      break;
    }
    case "stone": {
      rect(ctx, x, y, w, h, "#d8d8d3");
      for (let ty = 0; ty < h; ty += 16)
        for (let tx = 0; tx < w; tx += 16) {
          const t = noise(seed, tx * 31 + ty);
          if (t < 0.3) rect(ctx, x + tx, y + ty, Math.min(16, w - tx), Math.min(16, h - ty), "#d1d1cb");
        }
      for (let i = 0; i < (w * h) / 14; i++) px(ctx, x + Math.floor(noise(seed + 5, i) * w), y + Math.floor(noise(seed + 6, i) * h), i % 2 ? "#cacac4" : "#e2e2dd");
      for (let ty = 0; ty < h; ty += 16) rect(ctx, x, y + ty, w, 1, "#bdbdb6");
      for (let tx = 0; tx < w; tx += 16) rect(ctx, x + tx, y, 1, h, "#bdbdb6");
      break;
    }
    case "server": {
      rect(ctx, x, y, w, h, "#3b4152");
      for (let ty = 0; ty < h; ty += 12)
        for (let tx = 0; tx < w; tx += 12) {
          rect(ctx, x + tx, y + ty, 12, 1, "#2e3343");
          rect(ctx, x + tx, y + ty, 1, 12, "#2e3343");
          if ((tx / 12 + ty / 12) % 3 === 0) for (let k = 0; k < 3; k++) rect(ctx, x + tx + 3, y + ty + 3 + k * 2, 6, 1, "#33394a");
        }
      break;
    }
    case "grass": {
      rect(ctx, x, y, w, h, "#5d9a45");
      const cols = ["#6aab4f", "#4f8a3b", "#73b556", "#558f3f"];
      for (let i = 0; i < (w * h) / 5; i++) px(ctx, x + Math.floor(noise(seed, i) * w), y + Math.floor(noise(seed + 9, i) * h), cols[i % 4]);
      break;
    }
  }
}

// ================================================================== walls
export const CAP = 7;
export function capH(ctx: Ctx, x: number, y: number, w: number) {
  rect(ctx, x, y, w, CAP, OUT);
  rect(ctx, x, y + 1, w, CAP - 2, "#f7f6f2");
  rect(ctx, x, y + CAP - 2, w, 1, "#dedcd4");
}
export function capV(ctx: Ctx, x: number, y: number, h: number) {
  rect(ctx, x, y, CAP, h, OUT);
  rect(ctx, x + 1, y, CAP - 2, h, "#f7f6f2");
  rect(ctx, x + CAP - 2, y, 1, h, "#dedcd4");
}
export function wallFace(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, base: string) {
  rect(ctx, x, y, w, h, color);
  rect(ctx, x, y, w, 2, shadeHex(color, 0.88));
  for (let i = 0; i < (w * h) / 40; i++) px(ctx, x + Math.floor(hash(i * 3 + x) * w), y + 2 + Math.floor(hash(i * 5 + y) * (h - 8)), shadeHex(color, 0.96));
  rect(ctx, x, y + h - 6, w, 6, base);
  rect(ctx, x, y + h - 6, w, 1, shadeHex(base, 1.15));
  rect(ctx, x, y + h - 1, w, 1, shadeHex(base, 0.7));
}

export function shadeHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

// ================================================================== wall decor
export function whiteboard(ctx: Ctx, x: number, y: number, w: number, h: number, seed = 1) {
  box(ctx, x, y, w, h, "#c9ccd6");
  rect(ctx, x + 2, y + 2, w - 4, h - 5, "#fbfbf8");
  rect(ctx, x + 2, y + h - 3, w - 4, 1, "#9aa0ad");
  // axes + two line series (red, orange)
  rect(ctx, x + 5, y + 4, 1, h - 10, "#9aa0ad");
  rect(ctx, x + 5, y + h - 7, w - 10, 1, "#9aa0ad");
  for (const [col, off] of [
    ["#e34948", 0],
    ["#eb8a34", 3],
  ] as const) {
    let py = y + h - 10 - off;
    for (let i = 0; i < w - 12; i += 3) {
      const ny = Math.max(y + 5, Math.min(y + h - 9, py + Math.round((hash(seed * 31 + i + off) - 0.55) * 6)));
      for (let k = 0; k < 3; k++) px(ctx, x + 7 + i + k, Math.round(py + ((ny - py) * k) / 3), col);
      py = ny;
    }
  }
  rect(ctx, x + w - 12, y + h - 3, 6, 2, "#3a86ff");
  rect(ctx, x + w - 20, y + h - 3, 6, 2, "#e34948");
}

export function frame(ctx: Ctx, x: number, y: number, w: number, h: number, frameColor: string, seed = 1) {
  box(ctx, x, y, w, h, frameColor);
  rect(ctx, x + 1, y + 1, w - 2, 1, shadeHex(frameColor, 1.2));
  rect(ctx, x + 2, y + 2, w - 4, h - 4, "#bfe3f5");
  rect(ctx, x + 2, y + 2 + Math.floor((h - 4) * 0.6), w - 4, Math.ceil((h - 4) * 0.4), seed % 2 ? "#7cc06a" : "#e9b44c");
  rect(ctx, x + 3 + (seed % 3), y + 3, 3, 3, "#ffe680");
  px(ctx, x + Math.floor(w / 2), y + Math.floor(h * 0.55), "#3e8e4f");
}

export function worldMap(ctx: Ctx, x: number, y: number, w: number, h: number) {
  box(ctx, x, y, w, h, "#8a6a44");
  rect(ctx, x + 2, y + 2, w - 4, h - 4, "#7fc3e6");
  const blobs = [
    [0.15, 0.3, 0.12, 0.22],
    [0.22, 0.62, 0.07, 0.2],
    [0.45, 0.28, 0.08, 0.14],
    [0.48, 0.55, 0.09, 0.22],
    [0.68, 0.3, 0.18, 0.2],
    [0.8, 0.68, 0.08, 0.12],
  ];
  for (const [cx, cy, rw, rh] of blobs) {
    const bx = x + 2 + Math.floor(cx * (w - 4));
    const by = y + 2 + Math.floor(cy * (h - 4));
    const ww = Math.max(2, Math.floor(rw * (w - 4)));
    const hh = Math.max(2, Math.floor(rh * (h - 4)));
    rect(ctx, bx - ww / 2, by - hh / 2, ww, hh, "#7cbf6a");
    rect(ctx, bx - ww / 2 + 1, by - hh / 2 + 1, ww - 2, 1, "#a2d68a");
  }
  px(ctx, x + Math.floor(w * 0.7), y + Math.floor(h * 0.35), "#e34948");
}

export function wallTV(ctx: Ctx, x: number, y: number, w: number, h: number) {
  rect(ctx, x + 2, y + h, w - 4, 2, SHADOW);
  box(ctx, x, y, w, h, "#30323f");
  rect(ctx, x + 2, y + 2, w - 4, h - 4, "#14223a");
}

export function corkBoard(ctx: Ctx, x: number, y: number, w: number, h: number, seed = 1) {
  box(ctx, x, y, w, h, "#9b6b3e");
  rect(ctx, x + 2, y + 2, w - 4, h - 4, "#c99a64");
  for (let i = 0; i < 40; i++) px(ctx, x + 2 + Math.floor(hash(i + seed) * (w - 4)), y + 2 + Math.floor(hash(i * 7 + seed) * (h - 4)), "#b88a56");
  const notes = ["#fff6a8", "#a8e6ff", "#ffb3c7", "#c9f5b0"];
  for (let i = 0; i < 4; i++) {
    const nx = x + 4 + ((i * 9 + seed * 3) % Math.max(1, w - 12));
    const ny = y + 4 + ((i * 5) % Math.max(1, h - 12));
    rect(ctx, nx, ny, 7, 6, notes[i]);
    rect(ctx, nx + 1, ny + 2, 4, 1, "#9aa0ad");
    px(ctx, nx + 3, ny, "#e34948");
  }
}

export function bookshelf(ctx: Ctx, x: number, y: number, w: number, h: number, seed = 1, plantTop = true) {
  rect(ctx, x + 2, y + h, w - 2, 3, SHADOW);
  box(ctx, x, y, w, h, "#8a5a33");
  rect(ctx, x + 1, y + 1, w - 2, 2, "#a9714a");
  const books = ["#e34948", "#3a86ff", "#f4b942", "#2a9d8f", "#9085e9", "#eb6834", "#e9e7f5", "#4caf50"];
  const shelves = Math.floor((h - 6) / 12);
  for (let s = 0; s < shelves; s++) {
    const sy = y + 4 + s * 12;
    rect(ctx, x + 2, sy, w - 4, 10, "#5e3b20");
    let bx = x + 3;
    let i = 0;
    while (bx < x + w - 4) {
      const bw = 2 + Math.floor(hash(seed * 13 + s * 7 + i) * 2);
      const bh = 6 + Math.floor(hash(seed * 17 + s * 3 + i) * 4);
      if (hash(seed + s + i * 11) < 0.12) {
        bx += 3;
        i++;
        continue;
      }
      const c = books[(seed + s * 3 + i) % books.length];
      rect(ctx, bx, sy + 10 - bh, Math.min(bw, x + w - 3 - bx), bh, c);
      px(ctx, bx, sy + 10 - bh, shadeHex(c.length === 7 ? c : "#888888", 1.25));
      bx += bw + 0;
      i++;
    }
    rect(ctx, x + 1, sy + 10, w - 2, 2, "#a9714a");
  }
  if (plantTop) smallPlant(ctx, x + w - 12, y - 9);
}

// ================================================================== plants
export function bigPlant(ctx: Ctx, x: number, y: number, pot: "terracotta" | "white" = "terracotta", size = 1, seed = 1) {
  // (x, y) = bottom-centre of the pot
  const pw = Math.round(14 * size);
  const ph = Math.round(12 * size);
  rect(ctx, x - pw / 2 - 1, y - 2, pw + 4, 4, SHADOW);
  const [p1, p2, p3] = pot === "white" ? ["#f4f3ee", "#d9d7cf", "#b8b5ab"] : ["#d97a4a", "#b85e34", "#8e4424"];
  rect(ctx, x - pw / 2, y - ph, pw, ph, OUT);
  rect(ctx, x - pw / 2 + 1, y - ph + 1, pw - 2, ph - 2, p1);
  rect(ctx, x + pw / 2 - 4, y - ph + 1, 3, ph - 2, p2);
  rect(ctx, x - pw / 2 - 1, y - ph, pw + 2, 3, OUT);
  rect(ctx, x - pw / 2, y - ph + 1, pw, 1, p3);
  const greens = ["#2f6b3a", "#3e8a46", "#55a752", "#6cc062"];
  const hi = "#9be07e";
  const cy = y - ph - Math.round(10 * size);
  const n = Math.round(9 * size);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const r = (6 + hash(seed * 11 + i) * 6) * size;
    leaf(ctx, Math.round(x + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), Math.round((5 + hash(i + seed) * 2) * size), greens, hi);
  }
  leaf(ctx, x, cy - Math.round(4 * size), Math.round(6 * size), greens, hi);
}
function leaf(ctx: Ctx, cx: number, cy: number, r: number, g: string[], hi: string) {
  for (let yy = -r; yy <= r; yy++)
    for (let xx = -r; xx <= r; xx++) {
      const d = xx * xx + yy * yy;
      if (d > r * r) continue;
      const edge = d > (r - 1) * (r - 1);
      const tone = edge ? g[0] : xx + yy > r * 0.4 ? g[1] : xx + yy < -r * 0.6 ? g[3] : g[2];
      px(ctx, cx + xx, cy + yy, tone);
    }
  px(ctx, cx - Math.floor(r / 2), cy - Math.floor(r / 2), hi);
}
export function smallPlant(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 1, y + 5, 7, 5, OUT);
  rect(ctx, x + 2, y + 6, 5, 3, "#d97a4a");
  leaf(ctx, x + 4, y + 2, 3, ["#2f6b3a", "#3e8a46", "#55a752", "#6cc062"], "#9be07e");
  px(ctx, x + 1, y + 3, "#55a752");
  px(ctx, x + 7, y + 2, "#55a752");
}
export function tree(ctx: Ctx, x: number, y: number, seed = 1) {
  rect(ctx, x - 12, y - 3, 24, 5, SHADOW);
  rect(ctx, x - 2, y - 12, 5, 12, "#6b4426");
  rect(ctx, x - 1, y - 12, 1, 12, "#8a5a33");
  const greens = ["#2a5f2f", "#367a3a", "#47944a", "#5aab55"];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + seed;
    leaf(ctx, Math.round(x + Math.cos(a) * 9), Math.round(y - 26 + Math.sin(a) * 7), 7, greens, "#8fd477");
  }
  leaf(ctx, x, y - 30, 8, greens, "#8fd477");
}

// ================================================================== desks & chairs
export function deskTop(ctx: Ctx, x: number, y: number, w: number, h: number, wood = false) {
  const [top, hi, edge] = wood ? ["#c99a64", "#dbb07c", "#9b6b3e"] : ["#e8dcc0", "#f5ecd6", "#c4b593"];
  rect(ctx, x, y, w, h, OUT);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, top);
  rect(ctx, x + 1, y + 1, w - 2, 1, hi);
  rect(ctx, x + 1, y + h - 2, w - 2, 1, edge);
}
export function deskFront(ctx: Ctx, x: number, y: number, w: number, h: number, wood = false) {
  const [face, dark] = wood ? ["#9b6b3e", "#7a5230"] : ["#c4b593", "#a8997a"];
  rect(ctx, x, y, w, h, OUT);
  rect(ctx, x + 1, y, w - 2, h - 1, face);
  rect(ctx, x + 1, y + h - 3, w - 2, 1, dark);
  rect(ctx, x + 3, y + h, 3, 3, OUT);
  rect(ctx, x + w - 6, y + h, 3, 3, OUT);
  shadow(ctx, x + 1, y + h, w - 2, 3);
}
export function partition(ctx: Ctx, x: number, y: number, w: number) {
  rect(ctx, x, y, w, 15, OUT);
  rect(ctx, x + 1, y + 1, w - 2, 2, "#c7cbd6");
  rect(ctx, x + 1, y + 3, w - 2, 11, "#9ba1b2");
  for (let i = 0; i < w; i += 3) px(ctx, x + 1 + i, y + 6 + (i % 2) * 3, "#8d93a5");
  rect(ctx, x + 1, y + 13, w - 2, 1, "#7f8597");
}
export function monitorFrontBezel(ctx: Ctx, x: number, y: number) {
  // 15x11 bezel + stand; screen (13x8) at (x+1, y+1) drawn per frame
  rect(ctx, x, y, 15, 11, OUT);
  rect(ctx, x + 1, y + 9, 13, 1, "#3d4357");
  rect(ctx, x + 6, y + 11, 3, 2, "#3d4357");
  rect(ctx, x + 4, y + 13, 7, 1, OUT);
}
export function monitorBack(ctx: Ctx, x: number, y: number, glow: boolean) {
  rect(ctx, x, y, 15, 11, OUT);
  rect(ctx, x + 1, y + 1, 13, 9, "#5a6075");
  rect(ctx, x + 1, y + 1, 13, 1, "#737a91");
  rect(ctx, x + 5, y + 4, 5, 3, "#4a4f62");
  if (glow) {
    rect(ctx, x - 1, y - 1, 17, 1, "rgba(150,210,255,0.55)");
  }
  rect(ctx, x + 6, y + 11, 3, 2, "#3d4357");
}
export function keyboard(ctx: Ctx, x: number, y: number, w = 16) {
  rect(ctx, x, y, w, 4, OUT);
  rect(ctx, x + 1, y + 1, w - 2, 2, "#d4d8e2");
  for (let k = 0; k < w - 2; k += 2) px(ctx, x + 1 + k, y + 2, "#a6acba");
  rect(ctx, x + w + 2, y + 1, 3, 3, OUT);
  px(ctx, x + w + 3, y + 2, "#d4d8e2");
}
export function papers(ctx: Ctx, x: number, y: number) {
  rect(ctx, x, y, 9, 7, OUT);
  rect(ctx, x + 1, y + 1, 7, 5, "#f6f4ec");
  rect(ctx, x + 2, y + 2, 5, 1, "#b9b4a6");
  rect(ctx, x + 2, y + 4, 4, 1, "#b9b4a6");
}
export function mug(ctx: Ctx, x: number, y: number, c = "#e34948") {
  rect(ctx, x, y, 5, 6, OUT);
  rect(ctx, x + 1, y + 1, 3, 4, c);
  rect(ctx, x + 1, y + 1, 3, 1, "#5a3a24");
  px(ctx, x + 5, y + 2, OUT);
  px(ctx, x + 5, y + 3, OUT);
}
/** Office chair seen from the front (worker sits facing the viewer, chair behind them). */
export function chairFront(ctx: Ctx, cx: number, top: number) {
  rect(ctx, cx - 10, top, 20, 16, OUT);
  rect(ctx, cx - 9, top + 1, 18, 14, "#3d4357");
  rect(ctx, cx - 9, top + 1, 18, 2, "#5b6380");
  rect(ctx, cx - 9, top + 1, 1, 13, "#525a75");
  rect(ctx, cx - 12, top + 10, 3, 8, OUT);
  rect(ctx, cx + 9, top + 10, 3, 8, OUT);
}
/** Office chair seen from behind (worker faces away from the viewer). */
export function chairBack(ctx: Ctx, cx: number, top: number) {
  shadow(ctx, cx - 10, top + 18, 20, 3);
  rect(ctx, cx - 10, top, 20, 14, OUT);
  rect(ctx, cx - 9, top + 1, 18, 12, "#3d4357");
  rect(ctx, cx - 9, top + 1, 18, 1, "#6a7392");
  rect(ctx, cx - 9, top + 2, 1, 10, "#565e7c");
  rect(ctx, cx + 7, top + 2, 2, 10, "#30354a");
  rect(ctx, cx - 1, top + 14, 3, 3, OUT);
  rect(ctx, cx - 7, top + 17, 15, 2, OUT);
  px(ctx, cx - 7, top + 19, OUT);
  px(ctx, cx + 7, top + 19, OUT);
}
export function woodChairBack(ctx: Ctx, cx: number, top: number) {
  shadow(ctx, cx - 8, top + 14, 16, 3);
  rect(ctx, cx - 8, top, 16, 12, OUT);
  rect(ctx, cx - 7, top + 1, 14, 3, "#c99a64");
  rect(ctx, cx - 7, top + 4, 2, 7, "#a87b4f");
  rect(ctx, cx + 5, top + 4, 2, 7, "#a87b4f");
  rect(ctx, cx - 3, top + 4, 6, 7, "#a87b4f");
  rect(ctx, cx - 7, top + 11, 2, 4, OUT);
  rect(ctx, cx + 5, top + 11, 2, 4, OUT);
}
export function woodChairFront(ctx: Ctx, cx: number, top: number) {
  rect(ctx, cx - 8, top, 16, 14, OUT);
  rect(ctx, cx - 7, top + 1, 14, 12, "#c99a64");
  rect(ctx, cx - 7, top + 1, 14, 2, "#dbb07c");
  for (let k = 0; k < 3; k++) rect(ctx, cx - 5 + k * 4, top + 4, 2, 8, "#a87b4f");
}

// ================================================================== appliances
export function waterCooler(ctx: Ctx, x: number, y: number) {
  // (x,y) top-left, 14x34
  shadow(ctx, x, y + 33, 16, 3);
  rect(ctx, x + 2, y, 10, 13, OUT);
  rect(ctx, x + 3, y + 1, 8, 11, "#6fc1f0");
  rect(ctx, x + 4, y + 2, 2, 8, "#b8e6ff");
  rect(ctx, x + 3, y + 10, 8, 2, "#3a9ad9");
  rect(ctx, x, y + 13, 14, 21, OUT);
  rect(ctx, x + 1, y + 14, 12, 19, "#eceef3");
  rect(ctx, x + 10, y + 14, 3, 19, "#cfd3dd");
  rect(ctx, x + 3, y + 18, 3, 3, "#3a86ff");
  rect(ctx, x + 8, y + 18, 3, 3, "#e34948");
  rect(ctx, x + 3, y + 25, 8, 1, "#9aa0ad");
}
export function printer(ctx: Ctx, x: number, y: number) {
  // 30x26 on a small stand
  shadow(ctx, x + 2, y + 26, 28, 3);
  box(ctx, x + 2, y + 12, 26, 14, "#7a8396");
  rect(ctx, x + 3, y + 13, 24, 2, "#9aa3b5");
  box(ctx, x, y, 30, 13, "#e4e6ec");
  rect(ctx, x + 1, y + 1, 28, 2, "#f6f7fa");
  rect(ctx, x + 4, y + 4, 22, 3, "#3d4357");
  rect(ctx, x + 6, y - 3, 18, 4, "#f6f4ec");
  rect(ctx, x + 6, y - 4, 18, 1, OUT);
  px(ctx, x + 25, y + 9, "#7ee08a");
  px(ctx, x + 22, y + 9, "#3a86ff");
}
export function coffeeMachine(ctx: Ctx, x: number, y: number) {
  // counter 32x30 with machine on top
  shadow(ctx, x, y + 30, 34, 3);
  box(ctx, x, y + 12, 32, 18, "#8a5a33");
  rect(ctx, x + 1, y + 13, 30, 2, "#a9714a");
  rect(ctx, x + 15, y + 15, 1, 14, "#5e3b20");
  box(ctx, x + 6, y - 6, 18, 19, "#30323f");
  rect(ctx, x + 7, y - 5, 16, 2, "#4a4e60");
  rect(ctx, x + 9, y - 1, 12, 4, "#e34948");
  rect(ctx, x + 12, y + 5, 6, 5, "#14141c");
  rect(ctx, x + 13, y + 7, 4, 3, "#f6f4ec");
  px(ctx, x + 20, y - 2, "#7ee08a");
  mug(ctx, x + 25, y + 6, "#3a86ff");
}
export function vending(ctx: Ctx, x: number, y: number) {
  // 24x44
  shadow(ctx, x + 1, y + 44, 24, 3);
  box(ctx, x, y, 24, 44, "#d1495b");
  rect(ctx, x + 1, y + 1, 22, 2, "#e46a7a");
  rect(ctx, x + 3, y + 4, 13, 30, OUT);
  rect(ctx, x + 4, y + 5, 11, 28, "#1d2433");
  const cans = ["#f4b942", "#3a86ff", "#7ee08a", "#ff8c42", "#c39bff", "#e9e7f5"];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) rect(ctx, x + 5 + c * 3, y + 6 + r * 5, 2, 3, cans[(r * 3 + c) % cans.length]);
  rect(ctx, x + 4, y + 5, 2, 28, "rgba(255,255,255,0.12)");
  rect(ctx, x + 17, y + 6, 4, 8, "#2b2a3d");
  px(ctx, x + 18, y + 8, "#7ee08a");
  px(ctx, x + 19, y + 11, "#f4b942");
  rect(ctx, x + 4, y + 36, 15, 5, "#2b2a3d");
}
export function filingCabinet(ctx: Ctx, x: number, y: number) {
  // 18x34
  shadow(ctx, x + 1, y + 34, 18, 3);
  box(ctx, x, y, 18, 34, "#9ba3b5");
  rect(ctx, x + 1, y + 1, 16, 2, "#bfc6d4");
  for (let d = 0; d < 3; d++) {
    rect(ctx, x + 2, y + 4 + d * 10, 14, 9, "#8a92a5");
    rect(ctx, x + 2, y + 4 + d * 10, 14, 1, "#b0b8c8");
    rect(ctx, x + 7, y + 7 + d * 10, 4, 2, OUT);
  }
}
export function couch(ctx: Ctx, x: number, y: number, w: number) {
  // grey box couch facing the viewer, 26 tall
  shadow(ctx, x + 2, y + 26, w, 3);
  rect(ctx, x, y, w, 26, OUT);
  rect(ctx, x + 1, y + 1, w - 2, 11, "#8f95a6");
  rect(ctx, x + 1, y + 1, w - 2, 2, "#a8aebd");
  rect(ctx, x + 1, y + 12, w - 2, 9, "#a3a9b8");
  rect(ctx, x + 1, y + 12, w - 2, 1, "#bcc2cf");
  for (let k = Math.floor(w / 2); k < w - 6; k += 999) rect(ctx, x + k, y + 13, 1, 8, "#868c9c");
  rect(ctx, x + Math.floor(w / 2), y + 13, 1, 8, "#868c9c");
  rect(ctx, x + 1, y + 1, 6, 23, "#7e8494");
  rect(ctx, x + w - 7, y + 1, 6, 23, "#7e8494");
  rect(ctx, x + 1, y + 21, w - 2, 4, "#7e8494");
}
export function coffeeTable(ctx: Ctx, x: number, y: number, w: number) {
  shadow(ctx, x + 2, y + 12, w, 3);
  box(ctx, x, y, w, 9, "#a87b4f");
  rect(ctx, x + 1, y + 1, w - 2, 2, "#c99a64");
  rect(ctx, x + 2, y + 9, 2, 3, OUT);
  rect(ctx, x + w - 4, y + 9, 2, 3, OUT);
  mug(ctx, x + 6, y - 2, "#f4b942");
  papers(ctx, x + w - 14, y - 1);
}
export function globe(ctx: Ctx, x: number, y: number) {
  shadow(ctx, x - 5, y + 22, 12, 3);
  rect(ctx, x - 1, y + 14, 3, 7, "#8a5a33");
  rect(ctx, x - 5, y + 20, 11, 3, OUT);
  for (let yy = -6; yy <= 6; yy++)
    for (let xx = -6; xx <= 6; xx++) {
      const d = xx * xx + yy * yy;
      if (d > 36) continue;
      const land = hash((xx + 7) * 13 + (yy + 7) * 7) < 0.35;
      px(ctx, x + xx, y + 7 + yy, d > 30 ? OUT : land ? "#6cbf5a" : xx + yy < -3 ? "#8fd3ff" : "#4aa3df");
    }
  rect(ctx, x - 7, y + 6, 1, 3, "#c9a227");
  rect(ctx, x + 7, y + 6, 1, 3, "#c9a227");
}
export function serverRack(ctx: Ctx, x: number, y: number, w = 30, h = 60) {
  shadow(ctx, x + 2, y + h, w, 4);
  rect(ctx, x, y, w, h, OUT);
  rect(ctx, x + 1, y + 1, w - 2, 4, "#5a6075");
  rect(ctx, x + 1, y + 5, w - 2, h - 6, "#363b4b");
  const units = Math.floor((h - 8) / 9);
  for (let u = 0; u < units; u++) {
    const uy = y + 6 + u * 9;
    rect(ctx, x + 2, uy, w - 4, 8, "#2a2e3b");
    rect(ctx, x + 2, uy, w - 4, 1, "#454a5d");
    for (let k = 0; k < w - 14; k += 2) px(ctx, x + 12 + k, uy + 5, "#20232e");
  }
}
export function meetingTable(ctx: Ctx, x: number, y: number, w: number, h: number) {
  shadow(ctx, x + 3, y + h + 8, w, 4);
  rect(ctx, x, y, w, h, OUT);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, "#4f7fc2");
  rect(ctx, x + 1, y + 1, w - 2, 2, "#76a0dc");
  rect(ctx, x + 1, y + h - 3, w - 2, 2, "#3f6aa6");
  rect(ctx, x, y + h, w, 8, OUT);
  rect(ctx, x + 1, y + h, w - 2, 6, "#36598c");
  rect(ctx, x + 4, y + h + 8, 4, 4, OUT);
  rect(ctx, x + w - 8, y + h + 8, 4, 4, OUT);
}
export function bench(ctx: Ctx, x: number, y: number, w = 36) {
  shadow(ctx, x + 1, y + 11, w, 3);
  rect(ctx, x, y, w, 5, OUT);
  rect(ctx, x + 1, y + 1, w - 2, 3, "#c99a64");
  rect(ctx, x, y + 5, w, 4, OUT);
  rect(ctx, x + 1, y + 5, w - 2, 3, "#a87b4f");
  rect(ctx, x + 2, y + 9, 3, 3, OUT);
  rect(ctx, x + w - 5, y + 9, 3, 3, OUT);
}
export function acUnit(ctx: Ctx, x: number, y: number) {
  shadow(ctx, x + 1, y + 40, 22, 3);
  box(ctx, x, y, 22, 40, "#d6dae3");
  rect(ctx, x + 1, y + 1, 20, 2, "#eef0f5");
  for (let k = 0; k < 8; k++) rect(ctx, x + 3, y + 6 + k * 4, 16, 2, "#9aa0ad");
  px(ctx, x + 18, y + 3, "#7ee08a");
}
export function shelfUnit(ctx: Ctx, x: number, y: number, w: number) {
  // floating wall shelf with props
  rect(ctx, x, y, w, 3, OUT);
  rect(ctx, x + 1, y, w - 2, 2, "#a9714a");
  smallPlant(ctx, x + 2, y - 10);
  rect(ctx, x + 12, y - 8, 3, 8, "#3a86ff");
  rect(ctx, x + 15, y - 7, 3, 7, "#f4b942");
  rect(ctx, x + 18, y - 9, 2, 9, "#e34948");
  if (w > 30) mug(ctx, x + w - 8, y - 6, "#e9e7f5");
}
