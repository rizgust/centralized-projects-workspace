// Layered chibi characters (24x36 native px). A character = body template x pose, then
// hair style, outfit palette and role accessory. Painted into a small palette buffer,
// given a selective outline (a darker hue of the neighbouring colour), rasterised once
// and cached as an offscreen canvas per (look, pose, dir, frame).
import type { Role } from "../api/types";

export const CW = 24;
export const CH = 36;
const PAD = 2;
const BW = CW + PAD * 2;
const BH = CH + PAD * 2 + 4; // extra rows for spikes/hats above the head

export type Dir = "down" | "up" | "left" | "right";
export type Pose = "stand" | "walk" | "sitType" | "sitIdle" | "read" | "frustrated" | "couch";
type HairStyle = "bob" | "spiky" | "ponytail" | "long" | "buzz" | "afro" | "neat";
type Outfit = "sweater" | "blazer" | "hoodie" | "shirtTie" | "vest";
type Acc = "glasses" | "notebook" | "headset" | "clipboard" | "beret" | "stylus" | "beard" | "hardhat" | "badge";

type Tone3 = [string, string, string];
type Tone4 = [string, string, string, string];

export interface Look {
  skin: Tone3;
  hair: Tone4;
  style: HairStyle;
  outfit: Outfit;
  top: Tone3;
  inner: string;
  accent: string;
  pants: [string, string];
  shoes: string;
  acc: Acc[];
}

export const LOOKS: Record<Role | "owner", Look> = {
  analyst: {
    skin: ["#fde3cb", "#f2c3a0", "#d79a76"],
    hair: ["#c2875a", "#8a5232", "#643620", "#43230f"],
    style: "bob",
    outfit: "sweater",
    top: ["#5fd0bf", "#2a9d8f", "#1d7065"],
    inner: "#f4f1e8",
    accent: "#1d7065",
    pants: ["#3b4466", "#2b3150"],
    shoes: "#3a2a24",
    acc: ["glasses", "notebook"],
  },
  "project-manager": {
    skin: ["#e9b98d", "#c68642", "#9f6630"],
    hair: ["#5d5d76", "#2e2e40", "#1e1e2c", "#121219"],
    style: "ponytail",
    outfit: "blazer",
    top: ["#a98ade", "#7b5ea7", "#56407e"],
    inner: "#f4f1e8",
    accent: "#e05a7a",
    pants: ["#2e2e44", "#202032"],
    shoes: "#1c1c28",
    acc: ["headset", "clipboard"],
  },
  uiux: {
    skin: ["#fff0e2", "#f6d5b5", "#dfb48d"],
    hair: ["#ff9a6a", "#e0532f", "#b23a1f", "#7a2210"],
    style: "long",
    outfit: "sweater",
    top: ["#ffe08a", "#f4b942", "#c98f22"],
    inner: "#f4f1e8",
    accent: "#5b2a5e",
    pants: ["#4a3b5e", "#352a45"],
    shoes: "#2c2233",
    acc: ["beret", "stylus"],
  },
  frontend: {
    skin: ["#fbd9b0", "#f1c27d", "#d4a15a"],
    hair: ["#6f86c9", "#3a4a8a", "#263264", "#161d40"],
    style: "spiky",
    outfit: "hoodie",
    top: ["#7db4ff", "#3a86ff", "#2560c0"],
    inner: "#f4f1e8",
    accent: "#ffffff",
    pants: ["#4a5a80", "#34405e"],
    shoes: "#e9e7f5",
    acc: [],
  },
  backend: {
    skin: ["#b8794a", "#8d5524", "#6a3f1a"],
    hair: ["#5a4636", "#33271e", "#211912", "#140e0a"],
    style: "afro",
    outfit: "sweater",
    top: ["#79cc7c", "#43a047", "#2d7531"],
    inner: "#f4f1e8",
    accent: "#2d7531",
    pants: ["#45413a", "#2f2c27"],
    shoes: "#1f1a16",
    acc: ["beard"],
  },
  infra: {
    skin: ["#f4d09c", "#e0ac69", "#c18a4b"],
    hair: ["#9a8a78", "#6b5d4f", "#4f4439", "#352d25"],
    style: "buzz",
    outfit: "vest",
    top: ["#b3bccc", "#8a93a6", "#666e80"],
    inner: "#ff8c42",
    accent: "#f4c430",
    pants: ["#3a4150", "#2a303c"],
    shoes: "#3a2c22",
    acc: ["hardhat", "badge"],
  },
  owner: {
    skin: ["#f0caa6", "#d8a47a", "#b8845d"],
    hair: ["#4e3e35", "#2b211b", "#1b1410", "#0e0a08"],
    style: "neat",
    outfit: "blazer",
    top: ["#4d7391", "#2c4f66", "#1c3546"],
    inner: "#f4f1e8",
    accent: "#e9c46a",
    pants: ["#262b36", "#1b1f28"],
    shoes: "#15161c",
    acc: [],
  },
};

const NAVY = [43, 42, 58];
const EYE = "#2b2a3a";
const WHITE = "#ffffff";
const MOUTH = "#a2504a";
const BLUSH = "#f2a39a";
const PAPER = "#f6f4ec";
const PAPER_LINE = "#b9b4a6";
const GREY = ["#9aa0b0", "#6a7080", "#454a58"];

class Painter {
  buf: (string | null)[] = new Array(BW * BH).fill(null);
  noOutline = new Set<number>();
  oy = PAD + 4;
  px(x: number, y: number, c: string, keepEdge = false) {
    const X = x + PAD;
    const Y = y + this.oy;
    if (X < 0 || Y < 0 || X >= BW || Y >= BH) return;
    this.buf[Y * BW + X] = c;
    if (keepEdge) this.noOutline.add(Y * BW + X);
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  row(y: number, x0: number, x1: number, c: string) {
    for (let x = x0; x <= x1; x++) this.px(x, y, c);
  }
  col(x: number, y0: number, y1: number, c: string) {
    for (let y = y0; y <= y1; y++) this.px(x, y, c);
  }
  get(x: number, y: number) {
    const X = x + PAD;
    const Y = y + this.oy;
    if (X < 0 || Y < 0 || X >= BW || Y >= BH) return null;
    return this.buf[Y * BW + X];
  }
  /** Replace only pixels that are already painted (for shading within a shape). */
  tint(x: number, y: number, c: string) {
    if (this.get(x, y)) this.px(x, y, c);
  }
  circle(cx: number, cy: number, r: number, c: string) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, c);
  }
}

// ------------------------------------------------------------------ head + hair
const HEAD_HW = [5, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 6, 4]; // half-widths per row, 14 rows
const HY = 1;

function headShape(p: Painter, s: Tone3, hy: number) {
  for (let r = 0; r < 14; r++) {
    const hw = HEAD_HW[r];
    p.row(hy + r, 12 - hw, 11 + hw, s[1]);
    if (r >= 3) {
      p.px(11 + hw, hy + r, s[2]);
      if (r >= 6) p.px(10 + hw, hy + r, s[2]);
    }
  }
  p.row(hy + 13, 8, 15, s[2]);
  p.row(hy + 12, 6, 7, s[2]);
  p.px(6, hy + 3, s[0]);
  p.px(6, hy + 4, s[0]);
  p.px(7, hy + 3, s[0]);
}

function face(p: Painter, L: Look, dir: Dir, hy: number, o: { blink?: boolean; down?: boolean; frown?: boolean }) {
  const s = L.skin;
  if (dir === "down") {
    p.col(3, hy + 7, hy + 9, s[1]);
    p.col(20, hy + 7, hy + 9, s[2]);
    const ey = hy + (o.down ? 9 : 8);
    if (o.blink) {
      p.row(ey + 1, 8, 9, EYE);
      p.row(ey + 1, 14, 15, EYE);
    } else {
      for (const ex of [8, 14]) {
        p.rect(ex, ey, 2, 2, EYE);
        p.px(ex, ey, WHITE, true);
      }
    }
    p.row(hy + 10, 6, 7, BLUSH);
    p.row(hy + 10, 16, 17, BLUSH);
    if (o.frown) {
      p.px(10, hy + 12, MOUTH);
      p.row(hy + 11, 11, 12, MOUTH);
      p.px(13, hy + 12, MOUTH);
    } else {
      p.row(hy + 11, 11, 12, MOUTH);
      p.px(10, hy + 10, s[2]);
    }
  } else if (dir === "left") {
    p.px(3, hy + 9, s[1]);
    p.px(3, hy + 10, s[2]);
    const ey = hy + 8;
    if (o.blink) p.row(ey + 1, 6, 7, EYE);
    else {
      p.rect(6, ey, 2, 2, EYE);
      p.px(6, ey, WHITE, true);
    }
    p.row(hy + 10, 8, 9, BLUSH);
    p.px(5, hy + 11, MOUTH);
    p.px(6, hy + 11, MOUTH);
  }
}

function hairCap(p: Painter, H: Tone4, hy: number) {
  p.row(hy - 1, 8, 15, H[1]);
  p.row(hy, 6, 17, H[1]);
  p.row(hy + 1, 5, 18, H[1]);
  for (let y = hy + 2; y <= hy + 4; y++) p.row(y, 4, 19, H[1]);
  p.row(hy, 8, 11, H[0]);
  p.row(hy + 1, 7, 10, H[0]);
  p.px(13, hy + 1, H[0]);
  for (let y = hy + 1; y <= hy + 4; y++) {
    p.px(18, y, H[2]);
    p.px(19, y, H[2]);
  }
  p.row(hy + 4, 14, 19, H[2]);
}

function hairDown(p: Painter, L: Look, hy: number) {
  const H = L.hair;
  switch (L.style) {
    case "bob":
      hairCap(p, H, hy);
      p.row(hy + 5, 4, 19, H[1]);
      for (let x = 5; x <= 18; x += 3) p.px(x, hy + 6, H[1]);
      p.row(hy + 5, 15, 19, H[2]);
      for (let y = hy + 5; y <= hy + 12; y++) {
        p.row(y, 3, 5, H[1]);
        p.row(y, 18, 20, H[2]);
      }
      p.px(3, hy + 12, H[3]);
      p.row(hy + 12, 18, 20, H[3]);
      p.px(4, hy + 6, H[0]);
      break;
    case "spiky":
      hairCap(p, H, hy);
      for (const [x, h] of [[6, 2], [9, 3], [12, 4], [15, 3], [18, 2]] as const) for (let k = 1; k <= h; k++) p.px(x + (k > 2 ? 0 : k % 2), hy - 1 - k, k === h ? H[0] : H[1]);
      for (const x0 of [4, 8, 12, 16]) {
        p.row(hy + 5, x0, x0 + 2, H[1]);
        p.px(x0 + 1, hy + 6, H[2]);
      }
      p.col(4, hy + 5, hy + 8, H[1]);
      p.col(19, hy + 5, hy + 8, H[2]);
      break;
    case "ponytail":
      // tail peeking behind the right side of the head
      for (let y = hy + 2; y <= hy + 12; y++) p.row(y, 20, 22, y > hy + 9 ? H[2] : H[1]);
      p.row(hy + 3, 20, 21, L.accent);
      hairCap(p, H, hy);
      p.row(hy + 5, 4, 12, H[1]);
      p.row(hy + 6, 4, 8, H[1]);
      p.row(hy + 7, 4, 5, H[2]);
      p.col(19, hy + 5, hy + 8, H[2]);
      p.px(9, hy + 5, H[0]);
      break;
    case "long":
      hairCap(p, H, hy);
      p.row(hy + 5, 4, 10, H[1]);
      p.row(hy + 5, 13, 19, H[1]);
      p.row(hy + 6, 4, 7, H[1]);
      p.row(hy + 6, 16, 19, H[2]);
      for (let y = hy + 5; y <= hy + 22; y++) {
        const t = y > hy + 18 ? 1 : 0;
        p.row(y, 2 + t, 5, H[1]);
        p.row(y, 18, 21 - t, H[2]);
        if (y % 3 === 0) p.px(3 + t, y, H[0]);
      }
      p.row(hy + 22, 3, 5, H[3]);
      p.row(hy + 22, 18, 20, H[3]);
      break;
    case "buzz":
      p.row(hy, 7, 16, H[1]);
      p.row(hy + 1, 5, 18, H[1]);
      for (let y = hy + 2; y <= hy + 3; y++) p.row(y, 4, 19, H[1]);
      for (let x = 5; x <= 18; x += 2) p.px(x, hy + 2, H[2]);
      p.row(hy + 4, 5, 7, H[2]);
      p.row(hy + 4, 16, 18, H[2]);
      p.row(hy, 9, 11, H[0]);
      break;
    case "afro":
      // front curls (the big round mass is painted behind the head)
      for (const x of [4, 7, 10, 13, 16, 19]) {
        p.px(x, hy + 4, H[1]);
        p.px(x + 1, hy + 4, H[1]);
        p.px(x, hy + 5, H[2]);
      }
      p.row(hy - 1, 7, 16, H[1]);
      for (let y = hy; y <= hy + 3; y++) p.row(y, 4, 19, H[1]);
      for (let i = 0; i < 14; i++) p.px(5 + ((i * 5) % 14), hy + (i % 4), i % 3 ? H[2] : H[0]);
      break;
    case "neat":
      hairCap(p, H, hy);
      p.row(hy + 5, 4, 9, H[1]);
      p.row(hy + 5, 16, 19, H[2]);
      p.col(4, hy + 5, hy + 7, H[1]);
      p.col(19, hy + 5, hy + 7, H[2]);
      p.col(9, hy + 1, hy + 4, H[2]);
      break;
  }
}

function hairBehindDown(p: Painter, L: Look, hy: number) {
  if (L.style === "afro") {
    const H = L.hair;
    p.circle(12, hy + 3, 10, H[1]);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      p.px(Math.round(12 + Math.cos(a) * 9), Math.round(hy + 3 + Math.sin(a) * 9), i % 2 ? H[2] : H[3]);
    }
    p.px(7, hy - 4, H[0]);
    p.px(8, hy - 5, H[0]);
  }
}

function hairUp(p: Painter, L: Look, hy: number) {
  const H = L.hair;
  if (L.style === "afro") {
    p.circle(12, hy + 3, 10, H[1]);
    for (let i = 0; i < 40; i++) p.px(4 + ((i * 7) % 17), hy - 5 + ((i * 3) % 16), i % 3 ? H[2] : H[0]);
    return;
  }
  const bottom = L.style === "buzz" ? hy + 9 : L.style === "bob" ? hy + 12 : hy + 11;
  for (let r = 0; r < 14; r++) {
    const y = hy + r - 1;
    if (y > bottom) break;
    const hw = HEAD_HW[r] + (r > 1 ? 1 : 0);
    p.row(y, 12 - hw, 11 + hw, H[1]);
  }
  p.row(hy + 1, 8, 12, H[0]);
  p.row(hy + 2, 7, 10, H[0]);
  for (let y = hy + 7; y <= bottom; y++) p.tint(18, y, H[2]), p.tint(19, y, H[2]), p.tint(17, y, H[2]);
  p.row(bottom, 6, 17, H[2]);
  if (L.style === "spiky") for (const [x, h] of [[6, 2], [9, 3], [12, 4], [15, 3], [18, 2]] as const) for (let k = 1; k <= h; k++) p.px(x, hy - 1 - k, H[1]);
  if (L.style === "ponytail") {
    for (let y = hy + 9; y <= hy + 20; y++) p.row(y, 10, 13, y > hy + 17 ? H[2] : H[1]);
    p.row(hy + 9, 10, 13, L.accent);
    p.px(11, hy + 13, H[0]);
  }
  if (L.style === "long")
    for (let y = hy + 11; y <= hy + 24; y++) {
      const t = y > hy + 21 ? 1 : 0;
      p.row(y, 3 + t, 20 - t, y % 4 === 0 ? H[2] : H[1]);
    }
}

function hairLeft(p: Painter, L: Look, hy: number) {
  const H = L.hair;
  if (L.style === "afro") {
    p.circle(13, hy + 3, 10, H[1]);
    for (let i = 0; i < 30; i++) p.px(5 + ((i * 7) % 17), hy - 5 + ((i * 3) % 14), i % 3 ? H[2] : H[0]);
    // reveal the face
    for (let y = hy + 5; y <= hy + 13; y++) for (let x = 4; x <= 10; x++) p.px(x, y, L.skin[1]);
    return;
  }
  p.row(hy - 1, 8, 15, H[1]);
  p.row(hy, 6, 18, H[1]);
  for (let y = hy + 1; y <= hy + 4; y++) p.row(y, 5, 19, H[1]);
  p.row(hy, 8, 11, H[0]);
  p.row(hy + 1, 7, 9, H[0]);
  const back = L.style === "buzz" ? hy + 8 : L.style === "bob" ? hy + 12 : L.style === "long" ? hy + 24 : hy + 11;
  for (let y = hy + 5; y <= back; y++) p.row(y, L.style === "buzz" ? 15 : 12, y > hy + 13 ? 18 : 19, y > hy + 9 ? H[2] : H[1]);
  if (L.style !== "buzz") {
    p.row(hy + 5, 4, 8, H[1]);
    if (L.style !== "neat") p.row(hy + 6, 4, 6, H[1]);
  }
  if (L.style === "spiky")
    for (const [x, y] of [
      [8, -2],
      [11, -3],
      [14, -2],
      [20, 1],
      [21, 3],
    ] as const)
      p.px(x, hy + y, H[1]);
  if (L.style === "ponytail") {
    for (let y = hy + 3; y <= hy + 13; y++) p.row(y, 20, 22, y > hy + 10 ? H[2] : H[1]);
    p.row(hy + 4, 19, 20, L.accent);
  }
}

function headAcc(p: Painter, L: Look, dir: Dir, hy: number) {
  const D = "#2b2a3a";
  for (const a of L.acc) {
    if (a === "glasses") {
      if (dir === "down") {
        for (const x0 of [7, 13]) {
          p.row(hy + 7, x0, x0 + 3, D);
          p.row(hy + 10, x0, x0 + 3, D);
          p.col(x0, hy + 8, hy + 9, D);
          p.col(x0 + 3, hy + 8, hy + 9, D);
        }
        p.row(hy + 8, 11, 12, D);
      } else if (dir === "left") {
        p.row(hy + 7, 5, 8, D);
        p.row(hy + 10, 5, 8, D);
        p.col(5, hy + 8, hy + 9, D);
        p.col(8, hy + 8, hy + 9, D);
        p.row(hy + 8, 9, 13, D);
      }
    }
    if (a === "headset") {
      const g = GREY;
      if (dir === "down" || dir === "up") {
        p.row(hy - 2, 8, 15, g[2]);
        p.row(hy - 1, 6, 7, g[2]);
        p.row(hy - 1, 16, 17, g[2]);
        p.col(4, hy, hy + 5, g[2]);
        p.col(19, hy, hy + 5, g[2]);
        for (const x of [2, 19]) p.rect(x, hy + 6, 3, 4, g[1]);
        p.px(dir === "down" ? 3 : 20, hy + 7, L.accent);
        if (dir === "down") {
          p.px(5, hy + 10, g[1]);
          p.row(hy + 11, 6, 8, g[1]);
          p.px(9, hy + 11, D);
        }
      } else {
        p.row(hy - 2, 8, 15, g[2]);
        p.col(13, hy - 1, hy + 5, g[2]);
        p.rect(12, hy + 6, 4, 4, g[1]);
        p.px(13, hy + 7, L.accent);
        p.row(hy + 10, 9, 12, g[1]);
        p.row(hy + 11, 6, 8, g[1]);
      }
    }
    if (a === "beret") {
      const b = L.accent;
      p.row(hy - 4, 10, 11, b);
      p.row(hy - 3, 6, 15, b);
      p.row(hy - 2, 4, 17, b);
      p.row(hy - 1, 3, 17, b);
      p.row(hy, 4, 12, "#3f1c42");
      p.row(hy - 2, 6, 8, "#7d4a80");
    }
    if (a === "hardhat") {
      const [hi, base, sh] = ["#ffe98a", "#f4c430", "#c99a12"];
      p.row(hy - 4, 9, 14, base);
      p.row(hy - 3, 6, 17, base);
      for (let y = hy - 2; y <= hy + 1; y++) p.row(y, 4, 19, base);
      p.row(hy + 2, 2, 21, sh);
      p.row(hy + 3, 3, 20, sh);
      p.col(11, hy - 4, hy + 1, hi);
      p.col(12, hy - 4, hy + 1, hi);
      p.row(hy - 3, 7, 9, hi);
      p.row(hy + 1, 15, 19, sh);
    }
    if (a === "beard") {
      const H = L.hair;
      if (dir === "down") {
        p.row(hy + 9, 4, 5, H[1]);
        p.row(hy + 9, 18, 19, H[1]);
        p.row(hy + 10, 4, 7, H[1]);
        p.row(hy + 10, 16, 19, H[1]);
        p.row(hy + 11, 4, 10, H[1]);
        p.row(hy + 11, 13, 19, H[1]);
        p.row(hy + 12, 5, 18, H[1]);
        p.row(hy + 13, 7, 16, H[2]);
        p.row(hy + 11, 11, 12, MOUTH);
        p.row(hy + 10, 10, 13, H[1]);
      } else if (dir === "left") {
        for (let y = hy + 10; y <= hy + 13; y++) p.row(y, 4, 12, H[1]);
        p.px(5, hy + 11, MOUTH);
      }
    }
  }
}

// ------------------------------------------------------------------ body
function torsoDown(p: Painter, L: Look, back: boolean, y0 = 15) {
  const t = L.top;
  p.row(y0, 6, 17, t[1]);
  for (let y = y0 + 1; y <= y0 + 10; y++) p.row(y, 5, 18, t[1]);
  for (let y = y0 + 1; y <= y0 + 10; y++) {
    p.px(17, y, t[2]);
    p.px(18, y, t[2]);
  }
  p.row(y0 + 10, 5, 18, t[2]);
  p.col(6, y0 + 1, y0 + 3, t[0]);
  p.px(7, y0 + 1, t[0]);
  if (!back) {
    p.px(9, y0 + 7, t[2]);
    p.px(10, y0 + 8, t[2]);
    p.px(14, y0 + 5, t[2]);
    p.px(15, y0 + 6, t[2]);
  } else {
    p.col(11, y0 + 3, y0 + 8, t[2]);
  }
  const o = L.outfit;
  if (back) {
    if (o === "hoodie") {
      p.row(y0, 8, 15, t[2]);
      p.row(y0 + 1, 8, 15, t[2]);
      p.row(y0 + 2, 9, 14, t[2]);
      p.row(y0 + 1, 9, 14, t[0]);
    }
    if (o === "vest") {
      for (let y = y0 + 1; y <= y0 + 9; y++) p.row(y, 6, 17, L.inner);
      p.row(y0 + 6, 6, 17, "#e9e7f5");
    }
    if (o === "blazer") p.row(y0, 9, 14, L.inner);
    return;
  }
  switch (o) {
    case "hoodie":
      p.row(y0, 8, 15, t[2]);
      p.px(8, y0 + 1, t[2]);
      p.px(15, y0 + 1, t[2]);
      p.row(y0, 10, 13, L.skin[2]);
      p.col(10, y0 + 1, y0 + 4, L.accent);
      p.col(13, y0 + 1, y0 + 4, L.accent);
      p.row(y0 + 6, 8, 15, t[2]);
      p.col(8, y0 + 6, y0 + 8, t[2]);
      p.col(15, y0 + 6, y0 + 8, t[2]);
      break;
    case "shirtTie":
    case "blazer": {
      const v = [4, 3, 3, 2, 2, 1, 1, 0];
      for (let i = 0; i < v.length; i++) p.row(y0 + i, 12 - v[i] - 1, 11 + v[i] + 1, L.inner);
      p.row(y0, 10, 13, L.skin[1]);
      p.px(11, y0 + 1, L.accent);
      p.px(12, y0 + 1, L.accent);
      p.col(11, y0 + 2, y0 + 7, L.accent);
      p.col(12, y0 + 2, y0 + 7, L.accent);
      p.px(12, y0 + 3, "#ffffff55".slice(0, 7));
      if (o === "blazer") {
        for (let i = 0; i < 6; i++) {
          p.px(12 - v[i] - 2, y0 + i, t[2]);
          p.px(11 + v[i] + 2, y0 + i, t[2]);
        }
        p.px(9, y0 + 8, "#e9c46a");
        p.px(9, y0 + 10 - 1, t[2]);
      }
      break;
    }
    case "sweater":
      p.row(y0, 9, 14, t[2]);
      p.row(y0, 10, 13, L.skin[1]);
      for (let x = 5; x <= 18; x += 2) p.px(x, y0 + 10, t[0]);
      p.row(y0 + 4, 7, 9, t[0]);
      break;
    case "vest":
      p.row(y0, 10, 13, L.skin[1]);
      for (let y = y0 + 1; y <= y0 + 9; y++) {
        p.row(y, 5, 8, L.inner);
        p.row(y, 15, 18, L.inner);
      }
      p.row(y0 + 6, 5, 8, "#e9e7f5");
      p.row(y0 + 6, 15, 18, "#e9e7f5");
      p.col(18, y0 + 1, y0 + 9, "#d96f2a");
      break;
  }
  if (L.acc.includes("badge")) {
    p.rect(7, y0 + 2, 3, 3, "#3a86ff");
    p.px(8, y0 + 3, "#7ee08a", true);
  }
}

function torsoLeft(p: Painter, L: Look, y0 = 15) {
  const t = L.top;
  for (let y = y0; y <= y0 + 10; y++) p.row(y, 8, 16, t[1]);
  p.col(16, y0, y0 + 10, t[2]);
  p.row(y0 + 10, 8, 16, t[2]);
  p.col(8, y0, y0 + 3, t[0]);
  if (L.outfit === "hoodie") p.rect(14, y0, 3, 3, t[2]);
  if (L.outfit === "vest") for (let y = y0 + 1; y <= y0 + 9; y++) p.row(y, 8, 11, L.inner);
  if (L.outfit === "blazer" || L.outfit === "shirtTie") {
    p.row(y0, 8, 9, L.inner);
    p.col(8, y0 + 1, y0 + 5, L.accent);
  }
}

function arm(p: Painter, L: Look, x: number, y0: number, y1: number, shade = false) {
  for (let y = y0; y <= y1; y++) p.row(y, x, x + 1, shade ? L.top[2] : L.top[1]);
  p.rect(x, y1 + 1, 2, 2, L.skin[shade ? 2 : 1]);
}

function legsDown(p: Painter, L: Look, frame: number, up: boolean) {
  const [pb, ps] = L.pants;
  p.row(26, 6, 17, ps);
  const lift = (leg: 0 | 1) => (frame === 1 && leg === 0) || (frame === 3 && leg === 1);
  for (const leg of [0, 1] as const) {
    const x0 = leg === 0 ? 7 : 12;
    const bottom = lift(leg) ? 31 : 33;
    for (let y = 27; y <= bottom; y++) p.row(y, x0, x0 + 4, pb);
    p.col(leg === 0 ? x0 + 4 : x0, 27, bottom, ps);
    const sx = leg === 0 ? 6 : 12;
    p.row(bottom + 1, sx, sx + 5, L.shoes);
    p.row(bottom + 2, sx, sx + 5, L.shoes);
    p.row(bottom + 1, sx + 1, sx + 2, up ? L.shoes : lighten(L.shoes));
  }
}

function legsLeft(p: Painter, L: Look, frame: number) {
  const [pb, ps] = L.pants;
  if (frame === 1 || frame === 3) {
    const front = frame === 1 ? 0 : 1;
    // front leg (toward the left) and back leg
    const legs = [
      { x: 6, c: front === 0 ? pb : ps },
      { x: 13, c: front === 0 ? ps : pb },
    ];
    for (const l of legs) {
      for (let y = 26; y <= 33; y++) {
        const dx = l.x < 10 ? Math.round(((y - 26) / 7) * -2) : Math.round(((y - 26) / 7) * 2);
        p.row(y, l.x + 2 + dx, l.x + 5 + dx, l.c);
      }
    }
    p.row(34, 3, 8, L.shoes);
    p.row(35, 3, 8, L.shoes);
    p.row(34, 15, 19, L.shoes);
    p.row(35, 15, 19, L.shoes);
  } else {
    for (let y = 26; y <= 33; y++) p.row(y, 9, 14, pb);
    p.col(14, 26, 33, ps);
    p.row(34, 6, 14, L.shoes);
    p.row(35, 6, 14, L.shoes);
    p.row(34, 7, 9, lighten(L.shoes));
  }
}

function lighten(hex: string): string {
  const [r, g, b] = rgb(hex);
  return `rgb(${Math.min(255, r + 50)},${Math.min(255, g + 50)},${Math.min(255, b + 50)})`;
}

function bodyAcc(p: Painter, L: Look, pose: Pose, dir: Dir) {
  if (dir !== "down" || !(pose === "stand" || pose === "walk")) return;
  if (L.acc.includes("notebook")) {
    p.rect(0, 21, 5, 6, "#3a6ea5");
    p.col(4, 21, 26, PAPER);
    p.px(1, 22, "#7aa7d8");
  }
  if (L.acc.includes("clipboard")) {
    p.rect(18, 19, 6, 9, "#a87b4f");
    p.rect(19, 21, 4, 6, PAPER);
    p.row(22, 19, 22, PAPER_LINE);
    p.row(24, 19, 21, PAPER_LINE);
    p.row(19, 20, 21, GREY[0]);
    p.rect(19, 23, 2, 2, L.skin[1]);
  }
  if (L.acc.includes("stylus")) {
    p.col(21, 20, 24, "#2b2a3a");
    p.px(21, 19, "#ff7a90");
  }
}

// ------------------------------------------------------------------ assemble
function paint(L: Look, pose: Pose, dir: Dir, frame: number): Painter {
  const p = new Painter();
  const d: Dir = dir === "right" ? "left" : dir;
  const seated = pose === "sitType" || pose === "sitIdle" || pose === "frustrated";
  const bob = pose === "sitIdle" && frame === 1 ? 1 : 0;
  const hy = HY + bob;
  const face0 = { blink: pose === "frustrated" || (pose === "sitIdle" && frame === 2), down: pose === "read", frown: pose === "frustrated" };

  // legs + torso
  if (d === "left") {
    if (!seated) legsLeft(p, L, pose === "walk" ? frame : 0);
    if (pose === "walk" && frame === 3) arm(p, L, 15, 16, 22, true);
    torsoLeft(p, L);
    const ax = pose === "walk" ? (frame === 1 ? 8 : frame === 3 ? 13 : 11) : 11;
    arm(p, L, ax, 16, 22);
  } else {
    if (pose === "couch") {
      const [pb, ps] = L.pants;
      for (let y = 26; y <= 30; y++) p.row(y, 6, 17, pb);
      p.col(11, 27, 30, ps);
      p.col(12, 27, 30, ps);
      for (let y = 31; y <= 33; y++) {
        p.row(y, 7, 10, pb);
        p.row(y, 13, 16, pb);
      }
      p.row(34, 6, 10, L.shoes);
      p.row(34, 13, 17, L.shoes);
      p.row(35, 6, 10, L.shoes);
      p.row(35, 13, 17, L.shoes);
    } else if (seated) {
      p.rect(5, 26, 14, 4, L.pants[0]);
    } else legsDown(p, L, pose === "walk" ? frame : 0, d === "up");
    torsoDown(p, L, d === "up", 15 + bob);
    // arms by pose
    if (pose === "stand" || pose === "walk") {
      const sw = pose === "walk" ? (frame === 1 ? -1 : frame === 3 ? 1 : 0) : 0;
      arm(p, L, 3, 16 + sw, 23 + sw);
      arm(p, L, 19, 16 - sw, 23 - sw, true);
    } else if (pose === "couch") {
      arm(p, L, 3, 16, 22);
      arm(p, L, 19, 16, 22, true);
    } else if (pose === "read") {
      p.rect(4, 16, 2, 5, L.top[1]);
      p.rect(18, 16, 2, 5, L.top[2]);
      p.rect(7, 17, 10, 9, PAPER);
      for (const y of [19, 21, 23]) p.row(y, 9, 14, PAPER_LINE);
      p.rect(5, 21, 2, 2, L.skin[1]);
      p.rect(17, 21, 2, 2, L.skin[1]);
    } else if ((pose === "sitType" || pose === "sitIdle") && d === "down") {
      p.rect(4, 16 + bob, 2, 5, L.top[1]);
      p.rect(18, 16 + bob, 2, 5, L.top[2]);
      p.rect(5, 20 + bob, 2, 2, L.top[1]);
      p.rect(17, 20 + bob, 2, 2, L.top[2]);
      if (pose === "sitType") {
        const lu = frame === 0 ? 1 : 0;
        const ru = frame === 1 ? 1 : 0;
        p.rect(7, 22 - lu, 3, 2, L.skin[1]);
        p.rect(14, 22 - ru, 3, 2, L.skin[1]);
      } else {
        p.rect(9, 22 + bob, 6, 2, L.skin[1]);
      }
    } else if ((pose === "sitType" || pose === "sitIdle") && d === "up") {
      const e = pose === "sitType" ? frame % 2 : 0;
      p.rect(2, 17 + e, 3, 4, L.top[1]);
      p.rect(19, 18 - e, 3, 4, L.top[2]);
    } else if (pose === "frustrated") {
      // painted after the head below
    }
  }

  // head + hair
  if (d === "down") {
    hairBehindDown(p, L, hy);
    headShape(p, L.skin, hy);
    face(p, L, "down", hy, face0);
    hairDown(p, L, hy);
  } else if (d === "up") {
    headShape(p, L.skin, hy);
    p.col(3, hy + 7, hy + 8, L.skin[1]);
    p.col(20, hy + 7, hy + 8, L.skin[2]);
    hairUp(p, L, hy);
  } else {
    headShape(p, L.skin, hy);
    hairLeft(p, L, hy);
    p.rect(13, hy + 8, 2, 2, L.skin[1]);
    p.px(14, hy + 9, L.skin[2]);
    face(p, L, "left", hy, face0);
  }
  headAcc(p, L, d, hy);
  if (pose === "frustrated") {
    const sh = frame % 2;
    for (const [x, c] of [
      [2, L.top[1]],
      [20, L.top[2]],
    ] as const)
      for (let y = 7 + sh; y <= 17; y++) p.row(y, x, x + 1, c);
    p.rect(3, 4 + sh, 3, 3, L.skin[1]);
    p.rect(18, 4 + sh, 3, 3, L.skin[2]);
  }
  bodyAcc(p, L, pose, d);
  return p;
}

const rgbCache = new Map<string, [number, number, number]>();
function rgb(c: string): [number, number, number] {
  let v = rgbCache.get(c);
  if (v) return v;
  if (c.startsWith("rgb")) {
    const m = c.match(/\d+/g)!.map(Number);
    v = [m[0], m[1], m[2]];
  } else {
    const n = parseInt(c.slice(1, 7), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  rgbCache.set(c, v);
  return v;
}

function rasterise(p: Painter, flip: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = BW;
  c.height = BH;
  const g = c.getContext("2d")!;
  const img = g.createImageData(BW, BH);
  const d = img.data;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= BW || y >= BH ? null : p.buf[y * BW + x]);
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const sx = flip ? BW - 1 - x : x;
      let col = at(sx, y);
      let alpha = 255;
      let r: number, gg: number, b: number;
      if (col) {
        [r, gg, b] = rgb(col);
      } else {
        // selective outline: darker hue of the neighbouring colour
        const n = at(sx - 1, y) ?? at(sx + 1, y) ?? at(sx, y - 1) ?? at(sx, y + 1);
        if (!n) continue;
        const [nr, ng, nb] = rgb(n);
        r = Math.round(nr * 0.38 + NAVY[0] * 0.62 * 0.9);
        gg = Math.round(ng * 0.38 + NAVY[1] * 0.62 * 0.9);
        b = Math.round(nb * 0.38 + NAVY[2] * 0.62 * 0.9);
        col = "o";
      }
      const i = (y * BW + x) * 4;
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
      d[i + 3] = alpha;
    }
  g.putImageData(img, 0, 0);
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();

export function lookOf(role: string): Look {
  return (LOOKS as Record<string, Look>)[role] ?? LOOKS.analyst;
}

export function sprite(role: string, pose: Pose, dir: Dir, frame = 0): HTMLCanvasElement {
  const key = `${role}|${pose}|${dir}|${frame}`;
  let c = cache.get(key);
  if (!c) {
    c = rasterise(paint(lookOf(role), pose, dir, frame), dir === "right");
    cache.set(key, c);
  }
  return c;
}

/** Offset from a sprite canvas's top-left to the character's feet anchor (12, 35). */
export const ANCHOR_X = 12 + PAD;
export const ANCHOR_Y = 35 + PAD + 4;
/** Offset from sprite canvas top-left to the character box top-left. */
export const BOX_X = PAD;
export const BOX_Y = PAD + 4;
