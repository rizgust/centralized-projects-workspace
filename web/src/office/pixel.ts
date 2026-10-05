// Shared pixel primitives and a 3x5 bitmap font. Everything in the office is drawn
// with integer fillRects on a native-resolution world, then scaled by an integer factor.

export type Ctx = CanvasRenderingContext2D;

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

