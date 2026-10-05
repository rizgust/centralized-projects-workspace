// Palette-indexed sprites, a 3x5 bitmap font and worker drawing. Everything is drawn
// with integer fillRects on a 1x "world" canvas, then scaled up without smoothing.
import type { Role } from "../api/types";

export type Ctx = CanvasRenderingContext2D;

export const C = {
  out: "#1b1b2a",
  ink: "#24243a",
  white: "#ffffff",
  paper: "#f4f1e8",
  paperLine: "#b9b4a6",
  eye: "#1b1b2a",
  blush: "#e8958a",
  mouth: "#9b4a3c",
  pants: "#2e3047",
  glass: "#bfe6ff",
  tie: "#d1495b",
  headset: "#4a4e69",
  // furniture
  deskTop: "#e9e4d8",
  deskTopHi: "#f6f2e9",
  deskFront: "#b8b0a0",
  deskShadow: "#8f8778",
  deskLeg: "#6e6a63",
  bezel: "#2d2f3e",
  bezelHi: "#44475e",
  screen: "#0f1a2b",
  key: "#cfd3dc",
  keyDark: "#9aa0ad",
  chair: "#3c3f58",
  chairHi: "#565a7a",
  chairBase: "#25263a",
  pot: "#c46a3c",
  potDark: "#97502c",
  leaf: "#3e8e4f",
  leafHi: "#6cc06a",
  shelf: "#7a4e2d",
  shelfDark: "#5a3820",
  mug: "#e9d8a6",
  // code colours on monitors
  code: ["#63c7ff", "#f7d154", "#ff7a90", "#7ee08a", "#c39bff", "#e6e6f0"],
  // rooms
  wallCap: "#3a3550",
  wallCapHi: "#4d4769",
  wallTrim: "#8f7f69",
  sky: "#8fd3ff",
  skyHi: "#c6ecff",
  frame: "#f2ead8",
  signDark: "#2b2a3d",
  signLit: "#ffd76a",
  bubbleRed: "#e63946",
  led: { off: "#2a2d3a", ok: "#4ade80", warn: "#fbbf24", hot: "#f05252" },
  rack: "#2a2c3d",
  rackHi: "#3d4058",
  display: "#101624",
  displayGlow: "#7fdcff",
  sofa: "#7d5ba6",
  sofaHi: "#9a78c4",
  laptop: "#c8ccd8",
  laptopGlow: "#8ff0ff",
};

// Floors / walls per room theme (picked from project type).
export interface RoomTheme {
  wall: string;
  wallLow: string;
  floorA: string;
  floorB: string;
  seam: string;
}
export const THEMES: Record<string, RoomTheme> = {
  wood: { wall: "#efe3c8", wallLow: "#dccfae", floorA: "#b98252", floorB: "#ad784a", seam: "#8e5f3c" },
  teal: { wall: "#d8ecea", wallLow: "#bfdcd9", floorA: "#3f7f86", floorB: "#3a767c", seam: "#2c5c61" },
  tile: { wall: "#e6e4ef", wallLow: "#cfcce0", floorA: "#a7abbf", floorB: "#9ca0b4", seam: "#7e8296" },
  rose: { wall: "#f3dfe0", wallLow: "#e3c6c8", floorA: "#9c6b7a", floorB: "#93636f", seam: "#734a56" },
  hq: { wall: "#e9e1f5", wallLow: "#d4c9e8", floorA: "#6b6f9e", floorB: "#646896", seam: "#4c4f78" },
};

export function themeForType(type: string | undefined, index: number): RoomTheme {
  if (type === "game") return THEMES.teal;
  if (type === "template") return THEMES.tile;
  if (type === "web-application") return THEMES.wood;
  return [THEMES.wood, THEMES.teal, THEMES.tile, THEMES.rose][index % 4];
}

// ------------------------------------------------------------------ primitives
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}
export function px(ctx: Ctx, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

/** Deterministic hash → [0,1). */
export function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ 3x5 font
const GLYPHS: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
  "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001110",
  " ": "000000000000000", "-": "000000111000000", ".": "000000000000010", ",": "000000000010100",
  ":": "000010000010000", "!": "010010010000010", "?": "110001010000010", $: "011110010011110",
  "%": "101001010100101", "/": "001001010100100", "+": "000010111010000", _: "000000000000111",
  "(": "010100100100010", ")": "010001001001010", "#": "101111101111101", "&": "010101010101011",
  "'": "010010000000000", "=": "000111000111000", "*": "000101010101000", "<": "001010100010001",
  ">": "100010001010100", "@": "010101111100011",
};

export function textWidth(s: string): number {
  return s.length ? s.length * 4 - 1 : 0;
}

export function drawText(ctx: Ctx, s: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const g = GLYPHS[up[i]] ?? GLYPHS["?"];
    for (let b = 0; b < 15; b++) if (g[b] === "1") ctx.fillRect((x + i * 4 + (b % 3)) | 0, (y + ((b / 3) | 0)) | 0, 1, 1);
  }
}

/** Fit text to a pixel width, adding "." when truncated. */
export function fitText(s: string, maxW: number): string {
  const max = Math.floor((maxW + 1) / 4);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + ".";
}

// ------------------------------------------------------------------ sprites
export function drawSprite(ctx: Ctx, rows: string[], x: number, y: number, pal: Record<string, string>) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}

export const BACK: string[] = [
  "...kkkkkk...",
  "..kHHHHHHk..",
  ".kHHHHHHHHk.",
  ".kHHHHHHHHk.",
  ".kHHHHHHHHk.",
  ".kHhHHHHhHk.",
  "..khhhhhhk..",
  "...kssssk...",
  ".kkTTTTTTkk.",
  "kTTTTTTTTTTk",
  "kTTTTTTTTTTk",
  "kTtTTTTTTtTk",
  "kTtTTTTTTtTk",
  "kttttttttttk",
  ".kkkkkkkkkk.",
];

export const FRONT: string[] = [
  "...kkkkkk...",
  "..kHHHHHHk..",
  ".kHHHHHHHHk.",
  ".kHHSSSSHHk.",
  ".kSESSSSESk.",
  ".kbSSSSSSbk.",
  "..kSSmmSSk..",
  "...kkSSkk...",
  ".kkTTSSTTkk.",
  "kTTTTTTTTTTk",
  "kTTtTTTTtTTk",
  "kTTtTTTTtTTk",
  "kSTtTTTTtTSk",
  ".kPPPPPPPPk.",
  ".kPPk..kPPk.",
];

export interface Look {
  hair: string;
  hairS: string;
  skin: string;
  skinS: string;
  shirt: string;
  shirtS: string;
  accent: string;
}

export const LOOKS: Record<Role | "owner", Look> = {
  analyst: { hair: "#5a3825", hairS: "#3f2618", skin: "#f2c9a0", skinS: "#d9a77c", shirt: "#2a9d8f", shirtS: "#1f776c", accent: "#bfe6ff" },
  "project-manager": { hair: "#2b2b3a", hairS: "#1c1c28", skin: "#c68642", skinS: "#a86d33", shirt: "#7b5ea7", shirtS: "#5e4685", accent: "#d1495b" },
  uiux: { hair: "#e76f9a", hairS: "#c4507b", skin: "#f6d5b5", skinS: "#e2b893", shirt: "#f4b942", shirtS: "#d19a2a", accent: "#ffffff" },
  frontend: { hair: "#e07b39", hairS: "#b85f26", skin: "#f1c27d", skinS: "#d9a65f", shirt: "#3a86ff", shirtS: "#2a66c9", accent: "#ffffff" },
  backend: { hair: "#3d405b", hairS: "#2a2c40", skin: "#8d5524", skinS: "#6f421b", shirt: "#43a047", shirtS: "#2f7a33", accent: "#4a4e69" },
  infra: { hair: "#c9ccd5", hairS: "#a3a7b3", skin: "#e0ac69", skinS: "#c48f4f", shirt: "#ff8c42", shirtS: "#d96f2a", accent: "#e63946" },
  owner: { hair: "#1f1a17", hairS: "#120f0d", skin: "#d8a47a", skinS: "#bb8760", shirt: "#264653", shirtS: "#1a333c", accent: "#e9c46a" },
};

function palFor(look: Look): Record<string, string> {
  return {
    k: C.out,
    H: look.hair,
    h: look.hairS,
    S: look.skin,
    s: look.skinS,
    E: C.eye,
    b: C.blush,
    m: C.mouth,
    T: look.shirt,
    t: look.shirtS,
    P: C.pants,
    W: C.white,
    R: C.tie,
    G: C.glass,
    g: C.headset,
    B: look.accent,
    D: shade(look.accent),
  };
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.75);
  const g = Math.round(((n >> 8) & 255) * 0.75);
  const b = Math.round((n & 255) * 0.75);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

type Px = [number, number, string];
function accessories(role: Role | "owner", view: "back" | "front"): Px[] {
  const out: Px[] = [];
  const row = (y: number, x0: number, x1: number, ch: string) => {
    for (let x = x0; x <= x1; x++) out.push([x, y, ch]);
  };
  switch (role) {
    case "analyst":
      if (view === "front") out.push([2, 4, "k"], [3, 4, "G"], [4, 4, "k"], [5, 4, "k"], [6, 4, "k"], [7, 4, "k"], [8, 4, "G"], [9, 4, "k"]);
      break;
    case "project-manager":
      if (view === "front") out.push([4, 8, "W"], [7, 8, "W"], [5, 8, "R"], [6, 8, "R"], [5, 9, "R"], [6, 9, "R"], [5, 10, "R"], [6, 10, "R"], [5, 11, "R"]);
      else out.push([4, 1, "h"], [4, 2, "h"]);
      break;
    case "uiux":
      if (view === "back") {
        row(7, 3, 8, "H");
        row(8, 2, 9, "H");
        row(9, 3, 8, "H");
        row(10, 4, 7, "h");
      } else {
        for (let y = 3; y <= 8; y++) out.push([1, y, "H"], [10, y, "H"]);
        out.push([0, 6, "k"], [0, 7, "k"], [0, 8, "k"], [11, 6, "k"], [11, 7, "k"], [11, 8, "k"], [9, 1, "W"], [9, 2, "R"]);
      }
      break;
    case "frontend":
      if (view === "back") {
        row(7, 3, 8, "t");
        out.push([2, 8, "t"], [9, 8, "t"]);
      } else out.push([4, 9, "W"], [7, 9, "W"], [4, 10, "W"], [7, 10, "W"]);
      out.push([4, -1, "k"], [5, -1, "k"], [7, -1, "k"], [4, 0, "H"], [7, 0, "H"]);
      break;
    case "backend":
      row(0, 3, 8, "g");
      out.push([2, 1, "g"], [9, 1, "g"]);
      for (const x of [0, 1, 10, 11]) out.push([x, 3, "g"], [x, 4, "g"]);
      out.push([0, 2, "k"], [11, 2, "k"], [0, 5, "k"], [11, 5, "k"]);
      break;
    case "infra":
      row(-1, 4, 7, "k");
      row(0, 3, 8, "B");
      row(1, 2, 9, "B");
      row(2, 1, 10, "D");
      out.push([5, -2, "W"], [6, -2, "W"], [3, -1, "k"], [8, -1, "k"]);
      break;
    case "owner":
      if (view === "front") out.push([4, 8, "W"], [7, 8, "W"], [3, 9, "B"]);
      break;
  }
  return out;
}

export type Pose = "type" | "blocked" | "wait" | "idle" | "review" | "bust" | "sit";

/**
 * Draws a worker sprite (12x15) at x,y. `frame` animates hands/eyes.
 * Office station-relative extras (hands on keyboard) are drawn by the scene.
 */
export function drawWorker(ctx: Ctx, role: Role | "owner", view: "back" | "front", x: number, y: number, opts: { blink?: boolean; eyesClosed?: boolean; rows?: number; litFace?: boolean } = {}) {
  const look = LOOKS[role] ?? LOOKS.analyst;
  const pal = palFor(look);
  const base = view === "back" ? BACK : FRONT;
  const rows = base.slice(0, opts.rows ?? base.length);
  drawSprite(ctx, rows, x, y, pal);
  for (const [ax, ay, ch] of accessories(role, view)) {
    if (ay >= rows.length) continue;
    ctx.fillStyle = pal[ch] ?? ch;
    ctx.fillRect(x + ax, y + ay, 1, 1);
  }
  if (view === "front") {
    if (opts.blink || opts.eyesClosed) {
      ctx.fillStyle = look.skinS;
      ctx.fillRect(x + 3, y + 4, 1, 1);
      ctx.fillRect(x + 8, y + 4, 1, 1);
      if (opts.eyesClosed) {
        ctx.fillStyle = C.eye;
        ctx.fillRect(x + 2, y + 5, 2, 1);
        ctx.fillRect(x + 8, y + 5, 2, 1);
      }
    }
    if (opts.litFace) {
      ctx.fillStyle = "rgba(143,240,255,0.28)";
      ctx.fillRect(x + 2, y + 3, 8, 5);
    }
  }
}

export function lookOf(role: string): Look {
  return (LOOKS as Record<string, Look>)[role] ?? LOOKS.analyst;
}
