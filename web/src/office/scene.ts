import type { Office, OfficeRoom, Role, Worker } from "../api/types";
import { ROLES } from "../api/types";
import {
  C,
  THEMES,
  drawText,
  drawWorker,
  fitText,
  hash,
  lookOf,
  px,
  rect,
  textWidth,
  themeForType,
  type Ctx,
  type RoomTheme,
} from "./pixel";

export const ROOM_W = 178;
export const ROOM_H = 150;
const CAP = 3;
const FACE = 24;
const DECOR = 14;
export const ST_W = 48;
export const ST_H = 54;
export const STRIP_H = 76;
const MIN_W = 356;
const SERVER_W = 78;
const LOBBY_W = 108;

export const SHORT: Record<Role, string> = {
  analyst: "ANALYST",
  "project-manager": "PM",
  uiux: "UI/UX",
  frontend: "FRONTEND",
  backend: "BACKEND",
  infra: "INFRA",
};

export interface Station {
  x: number;
  y: number;
  worker: Worker;
  index: number;
  project: string | null;
}
export interface RoomBox {
  x: number;
  y: number;
  room: OfficeRoom;
  hq: boolean;
  theme: RoomTheme;
  stations: Station[];
  doorX: number;
}
export interface Layout {
  W: number;
  H: number;
  cols: number;
  rooms: RoomBox[];
  stripY: number;
  display: { x: number; y: number; w: number; h: number };
  register: { x: number; y: number; w: number; h: number } | null;
  signature: string;
}

export interface LiveExtras {
  cpu: number | null;
  todayTokens: number | null;
  todayCost: number | null;
  interactive: number;
}

export function roomsOf(office: Office): { rooms: OfficeRoom[]; hq: boolean } {
  if (office.rooms.length) return { rooms: office.rooms, hq: false };
  return { rooms: [{ project: "", name: "HQ", active: true, workers: office.hq }], hq: true };
}

const roleIdx = (r: string) => {
  const i = ROLES.indexOf(r as Role);
  return i < 0 ? 99 : i;
};

export function computeLayout(office: Office, cols: number, types: Record<string, string>): Layout {
  const { rooms, hq } = roomsOf(office);
  cols = Math.max(1, Math.min(cols, rooms.length));
  const rowsOfRooms = Math.ceil(rooms.length / cols);
  const roomHeights = rooms.map((r) => roomHeight(r.workers.length));
  const rowH: number[] = [];
  for (let i = 0; i < rooms.length; i++) {
    const row = Math.floor(i / cols);
    rowH[row] = Math.max(rowH[row] ?? 0, roomHeights[i]);
  }
  const W = Math.max(cols * ROOM_W, MIN_W);
  const ox = Math.floor((W - cols * ROOM_W) / 2);
  const stripY = rowH.reduce((a, b) => a + b, 0);
  const H = stripY + STRIP_H;
  const display = { x: 0, y: stripY + 4, w: 112, h: 18 };
  const midL = SERVER_W;
  const midR = W - LOBBY_W;
  display.x = Math.floor(midL + (midR - midL - display.w) / 2);

  const boxes: RoomBox[] = rooms.map((room, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = ox + col * ROOM_W;
    const y = rowH.slice(0, row).reduce((a, b) => a + b, 0);
    const sorted = [...room.workers].sort((a, b) => roleIdx(a.role) - roleIdx(b.role));
    const stations: Station[] = sorted.map((w, k) => ({
      x: x + CAP + DECOR + (k % 3) * ST_W,
      y: y + CAP + FACE + 4 + Math.floor(k / 3) * ST_H,
      worker: w,
      index: i * 10 + k,
      project: hq ? null : room.project,
    }));
    // Door into the corridor: pick a spot clear of the wall display / side rooms.
    const candidates = [x + ROOM_W - 34, x + 20, x + 80];
    let doorX = candidates[0];
    if (row === rowsOfRooms - 1) {
      doorX =
        candidates.find((d) => (d + 14 < display.x || d > display.x + display.w) && d > SERVER_W + 2 && d + 14 < W - LOBBY_W - 2) ??
        candidates.find((d) => d + 14 < display.x || d > display.x + display.w) ??
        candidates[0];
    }
    return { x, y, room, hq, theme: hq ? THEMES.hq : themeForType(types[room.project], i), stations, doorX };
  });

  const register = hq ? { x: boxes[0].x + 40, y: boxes[0].y + CAP + 3, w: ROOM_W - 80, h: 19 } : null;
  const signature = JSON.stringify([
    W,
    H,
    cols,
    boxes.map((b) => [b.x, b.y, b.room.project, b.room.name, b.room.active, b.stations.map((s) => s.worker.role)]),
    hq,
  ]);
  return { W, H, cols, rooms: boxes, stripY, display, register, signature };
}

function roomHeight(n: number) {
  const rows = Math.max(2, Math.ceil(n / 3));
  return ROOM_H + (rows - 2) * ST_H;
}

// ================================================================== background
export function drawBackground(ctx: Ctx, L: Layout) {
  // exterior garden
  rect(ctx, 0, 0, L.W, L.H, "#4f8a3a");
  for (let i = 0; i < (L.W * L.stripY) / 40; i++) {
    const x = Math.floor(hash(i * 3 + 1) * L.W);
    const y = Math.floor(hash(i * 3 + 2) * L.stripY);
    px(ctx, x, y, hash(i * 5) < 0.5 ? "#5f9c45" : "#467d33");
  }
  for (let i = 0; i < Math.floor(L.W / 24); i++) {
    const x = Math.floor(hash(i * 11 + 7) * (L.W - 14));
    const y = Math.floor(hash(i * 13 + 5) * Math.max(1, L.stripY - 14));
    bush(ctx, x, y);
  }
  for (const R of L.rooms) drawRoom(ctx, R, L);
  drawStrip(ctx, L);
}

function bush(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 2, y + 8, 10, 3, "rgba(0,0,0,0.18)");
  rect(ctx, x + 1, y + 2, 12, 7, "#2f6b2a");
  rect(ctx, x + 3, y, 8, 8, "#3c8a35");
  rect(ctx, x + 4, y + 1, 3, 2, "#5fb04f");
  px(ctx, x + 9, y + 4, "#e76f9a");
}

function drawFloor(ctx: Ctx, x: number, y: number, w: number, h: number, t: RoomTheme) {
  rect(ctx, x, y, w, h, t.floorA);
  if (t === THEMES.wood) {
    for (let r = 0; r * 5 < h; r++) {
      rect(ctx, x, y + r * 5 + 4, w, 1, t.seam);
      const off = (r * 17) % 23;
      for (let k = off; k < w; k += 23) rect(ctx, x + k, y + r * 5, 1, 4, t.seam);
      if (r % 2) rect(ctx, x, y + r * 5, w, 4, t.floorB);
      for (let k = off; k < w; k += 23) rect(ctx, x + k, y + r * 5, 1, 4, t.seam);
    }
  } else if (t === THEMES.tile || t === THEMES.hq) {
    for (let r = 0; r * 8 < h; r++)
      for (let c = 0; c * 8 < w; c++) {
        if ((r + c) % 2) rect(ctx, x + c * 8, y + r * 8, Math.min(8, w - c * 8), Math.min(8, h - r * 8), t.floorB);
      }
    for (let r = 0; r * 8 < h; r++) rect(ctx, x, y + r * 8, w, 1, t.seam);
    for (let c = 0; c * 8 < w; c++) rect(ctx, x + c * 8, y, 1, h, t.seam);
  } else {
    // carpet: subtle noise
    for (let i = 0; i < (w * h) / 6; i++) {
      const xx = Math.floor(hash(i * 7 + x) * w);
      const yy = Math.floor(hash(i * 9 + y) * h);
      px(ctx, x + xx, y + yy, t.floorB);
    }
    for (let r = 0; r * 16 < h; r++) rect(ctx, x, y + r * 16, w, 1, t.seam);
  }
}

function windowAt(ctx: Ctx, x: number, y: number, w = 22, h = 13) {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, C.wallTrim);
  rect(ctx, x, y, w, h, C.sky);
  for (let i = 0; i < 5; i++) px(ctx, x + 3 + i, y + 2 + i, C.skyHi), px(ctx, x + 4 + i, y + 2 + i, C.skyHi);
  rect(ctx, x + Math.floor(w / 2), y, 1, h, C.frame);
  rect(ctx, x, y + Math.floor(h / 2), w, 1, C.frame);
  rect(ctx, x - 1, y + h + 1, w + 2, 1, C.frame);
}

function plant(ctx: Ctx, x: number, y: number, tall = false) {
  rect(ctx, x + 2, y + 13, 9, 2, "rgba(0,0,0,0.2)");
  rect(ctx, x + 3, y + 8, 7, 6, C.pot);
  rect(ctx, x + 3, y + 8, 7, 1, C.potDark);
  rect(ctx, x + 4, y + 13, 5, 1, C.potDark);
  const top = tall ? y - 6 : y;
  rect(ctx, x + 1, top + 3, 11, 5 + (y - top), C.leaf);
  rect(ctx, x + 3, top, 7, 4, C.leaf);
  px(ctx, x + 4, top + 1, C.leafHi);
  px(ctx, x + 2, top + 4, C.leafHi);
  px(ctx, x + 8, top + 3, C.leafHi);
  px(ctx, x + 6, top + 6, C.leafHi);
}

function shelf(ctx: Ctx, x: number, y: number) {
  rect(ctx, x, y, 12, 22, C.shelfDark);
  rect(ctx, x + 1, y + 1, 10, 20, C.shelf);
  const books = ["#e63946", "#3a86ff", "#f4b942", "#2a9d8f", "#c39bff", "#ff8c42"];
  for (let s = 0; s < 3; s++) {
    const yy = y + 2 + s * 7;
    rect(ctx, x + 1, yy + 5, 10, 1, C.shelfDark);
    for (let b = 0; b < 4; b++) {
      const hgt = 3 + Math.floor(hash(s * 9 + b + x) * 3);
      rect(ctx, x + 2 + b * 2, yy + 5 - hgt, 2, hgt, books[(s * 4 + b + x) % books.length]);
    }
  }
}

function vending(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 1, y + 30, 16, 2, "rgba(0,0,0,0.25)");
  rect(ctx, x, y, 17, 31, C.out);
  rect(ctx, x + 1, y + 1, 15, 29, "#d1495b");
  rect(ctx, x + 2, y + 3, 9, 19, "#1d2433");
  const cans = ["#f4b942", "#3a86ff", "#7ee08a", "#ff8c42", "#c39bff", "#e9e7f5"];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) rect(ctx, x + 3 + c * 3, y + 4 + r * 5, 2, 3, cans[(r * 3 + c) % cans.length]);
  rect(ctx, x + 12, y + 4, 3, 6, "#2b2a3d");
  px(ctx, x + 13, y + 6, "#7ee08a");
  rect(ctx, x + 2, y + 24, 13, 4, "#2b2a3d");
}

function bench(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 1, y + 9, 26, 2, "rgba(0,0,0,0.2)");
  rect(ctx, x, y, 28, 4, C.out);
  rect(ctx, x + 1, y + 1, 26, 2, "#c4925f");
  rect(ctx, x, y + 4, 28, 4, C.out);
  rect(ctx, x + 1, y + 4, 26, 3, "#a8794c");
  rect(ctx, x + 2, y + 8, 2, 2, C.out);
  rect(ctx, x + 24, y + 8, 2, 2, C.out);
}

function cooler(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 1, y + 18, 9, 2, "rgba(0,0,0,0.2)");
  rect(ctx, x + 2, y, 7, 8, "#9bd9f5");
  rect(ctx, x + 3, y + 1, 2, 5, "#cfeefc");
  rect(ctx, x + 1, y + 8, 9, 11, "#e4e6ee");
  rect(ctx, x + 1, y + 8, 9, 1, "#b7bbca");
  px(ctx, x + 3, y + 11, "#e63946");
  px(ctx, x + 7, y + 11, "#3a86ff");
}

function drawRoom(ctx: Ctx, R: RoomBox, L: Layout) {
  const { x, y, theme } = R;
  const h = roomHeight(R.room.workers.length);
  const ix = x + CAP;
  const iy = y + CAP;
  const iw = ROOM_W - CAP * 2;
  const ih = h - CAP * 2;
  // caps (wall tops)
  rect(ctx, x, y, ROOM_W, h, C.wallCap);
  rect(ctx, x, y, ROOM_W, 1, C.wallCapHi);
  // wall face
  rect(ctx, ix, iy, iw, FACE, theme.wall);
  rect(ctx, ix, iy + FACE - 7, iw, 7, theme.wallLow);
  rect(ctx, ix, iy + FACE - 7, iw, 1, C.wallTrim);
  rect(ctx, ix, iy + FACE - 1, iw, 1, C.wallTrim);
  // floor
  drawFloor(ctx, ix, iy + FACE, iw, ih - FACE, theme);
  rect(ctx, ix, iy + FACE, iw, 2, "rgba(0,0,0,0.12)");

  // windows + sign
  windowAt(ctx, ix + 7, iy + 3);
  windowAt(ctx, ix + iw - 29, iy + 3);
  if (!R.hq) {
    const label = fitText(R.room.name.toUpperCase(), 92);
    const sw = textWidth(label) + 8;
    const sx = ix + Math.floor((iw - sw) / 2);
    const lit = R.room.active;
    rect(ctx, sx - 1, iy + 3, sw + 2, 11, C.out);
    rect(ctx, sx, iy + 4, sw, 9, lit ? C.signLit : C.signDark);
    drawText(ctx, label, sx + 4, iy + 6, lit ? C.out : "#d8d4c8");
    if (lit) {
      // small "ACTIVE" tag under the sign
      const tw = textWidth("ACTIVE") + 4;
      rect(ctx, ix + Math.floor((iw - tw) / 2), iy + 15, tw, 7, "#e05a2b");
      drawText(ctx, "ACTIVE", ix + Math.floor((iw - tw) / 2) + 2, iy + 16, C.white);
    }
  }

  // decor columns
  shelf(ctx, ix + 1, iy + FACE - 10);
  plant(ctx, ix, iy + ih - 18);
  plant(ctx, ix + iw - 13, iy + FACE - 8, true);
  cooler(ctx, ix + iw - 12, iy + ih - 24);

  // desks (static parts)
  for (const s of R.stations) drawDeskStatic(ctx, s);

  // door gap on the bottom cap (into the corridor)
  if (y + h === L.stripY) {
    rect(ctx, R.doorX, y + h - CAP, 14, CAP, theme.floorB);
  }

  // lighting: warm glow on the active room, dim others
  if (R.room.active) {
    const g = ctx.createRadialGradient(ix + iw / 2, iy + 10, 4, ix + iw / 2, iy + ih / 2, iw * 0.7);
    g.addColorStop(0, "rgba(255,214,140,0.30)");
    g.addColorStop(1, "rgba(255,190,110,0.04)");
    ctx.fillStyle = g;
    ctx.fillRect(ix, iy, iw, ih);
  } else if (!R.hq) {
    rect(ctx, ix, iy, iw, ih, "rgba(30,28,60,0.16)");
  }

  // HQ: register sign
  if (R.hq && L.register) {
    const r = L.register;
    rect(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.out);
    rect(ctx, r.x, r.y, r.w, r.h, C.signLit);
    const l1 = "+ REGISTER YOUR";
    const l2 = "FIRST PROJECT";
    drawText(ctx, l1, r.x + Math.floor((r.w - textWidth(l1)) / 2), r.y + 3, C.out);
    drawText(ctx, l2, r.x + Math.floor((r.w - textWidth(l2)) / 2), r.y + 11, C.out);
  }
}

function drawDeskStatic(ctx: Ctx, s: Station) {
  const { x, y } = s;
  // floor shadow
  rect(ctx, x + 5, y + 28, 40, 2, "rgba(0,0,0,0.16)");
  // desk
  rect(ctx, x + 4, y + 13, 40, 1, C.out);
  rect(ctx, x + 3, y + 14, 42, 9, C.out);
  rect(ctx, x + 4, y + 14, 40, 9, C.deskTop);
  rect(ctx, x + 4, y + 14, 40, 1, C.deskTopHi);
  rect(ctx, x + 3, y + 23, 42, 6, C.out);
  rect(ctx, x + 4, y + 23, 40, 4, C.deskFront);
  rect(ctx, x + 4, y + 27, 40, 1, C.deskShadow);
  // monitor
  rect(ctx, x + 15, y + 2, 18, 13, C.bezel);
  rect(ctx, x + 15, y + 2, 18, 1, C.bezelHi);
  rect(ctx, x + 22, y + 15, 4, 2, C.bezel);
  rect(ctx, x + 20, y + 17, 8, 1, C.bezel);
  // keyboard
  rect(ctx, x + 14, y + 18, 20, 3, C.keyDark);
  rect(ctx, x + 14, y + 18, 20, 2, C.key);
  for (let k = 0; k < 9; k++) px(ctx, x + 15 + k * 2, y + 19, C.keyDark);
  // papers
  rect(ctx, x + 6, y + 15, 6, 5, C.paper);
  rect(ctx, x + 7, y + 16, 4, 1, C.paperLine);
  rect(ctx, x + 7, y + 18, 3, 1, C.paperLine);
  // nameplate
  const label = SHORT[s.worker.role as Role] ?? fitText(s.worker.name.toUpperCase(), 36);
  const w = textWidth(label) + 6;
  const nx = x + 24 - Math.floor(w / 2);
  rect(ctx, nx, y + 42, w, 8, C.out);
  rect(ctx, nx + 1, y + 43, w - 2, 6, C.signDark);
  drawText(ctx, label, nx + 3, y + 44, "#f6f2e9");
}

function drawStrip(ctx: Ctx, L: Layout) {
  const y = L.stripY;
  const W = L.W;
  const t = THEMES.tile;
  // corridor wall face (south faces of the rooms' walls)
  rect(ctx, 0, y, W, STRIP_H, C.wallCap);
  rect(ctx, 0, y + 3, W, 22, "#d9d3c4");
  rect(ctx, 0, y + 18, W, 7, "#c6bfae");
  rect(ctx, 0, y + 18, W, 1, C.wallTrim);
  rect(ctx, 0, y + 24, W, 1, C.wallTrim);
  // corridor floor
  drawFloor(ctx, 0, y + 25, W, STRIP_H - 28, t);
  rect(ctx, 0, y + 25, W, 2, "rgba(0,0,0,0.12)");
  rect(ctx, 0, y + STRIP_H - 3, W, 3, C.wallCap);

  // doors from rooms
  for (const R of L.rooms) {
    if (R.y + roomHeight(R.room.workers.length) !== y) continue;
    const dx = R.doorX;
    rect(ctx, dx - 1, y + 3, 16, 22, C.out);
    rect(ctx, dx, y + 3, 14, 22, R.theme.floorB);
    rect(ctx, dx, y + 3, 14, 3, "rgba(0,0,0,0.25)");
    rect(ctx, dx - 2, y + 3, 1, 22, C.wallTrim);
    rect(ctx, dx + 15, y + 3, 1, 22, C.wallTrim);
  }

  // server room (left)
  rect(ctx, 0, y + 3, SERVER_W, 22, "#4a4f63");
  rect(ctx, 0, y + 18, SERVER_W, 7, "#3e4255");
  rect(ctx, 0, y + 25, SERVER_W, STRIP_H - 28, "#2f3242");
  for (let gx = 0; gx < SERVER_W; gx += 8) rect(ctx, gx, y + 25, 1, STRIP_H - 28, "#3a3e52");
  for (let gy = y + 25; gy < y + STRIP_H - 3; gy += 8) rect(ctx, 0, gy, SERVER_W, 1, "#3a3e52");
  rect(ctx, SERVER_W, y, 3, STRIP_H, C.wallCap);
  rect(ctx, SERVER_W, y + 25, 3, STRIP_H - 28, "rgba(150,210,255,0.35)");
  // racks (static frame)
  for (const rx of [5, 26]) {
    rect(ctx, rx + 1, y + 58, 19, 3, "rgba(0,0,0,0.3)");
    rect(ctx, rx, y + 12, 19, 47, C.out);
    rect(ctx, rx + 1, y + 13, 17, 3, C.rackHi);
    rect(ctx, rx + 1, y + 16, 17, 42, C.rack);
    for (let u = 0; u < 5; u++) rect(ctx, rx + 1, y + 16 + u * 8 + 7, 17, 1, C.out);
  }
  // CPU plaque frame
  rect(ctx, 48, y + 5, 27, 16, C.out);
  rect(ctx, 49, y + 6, 25, 14, C.display);

  // wall display frame
  const d = L.display;
  rect(ctx, d.x - 2, d.y - 1, d.w + 4, d.h + 3, C.out);
  rect(ctx, d.x - 1, d.y, d.w + 2, d.h + 1, C.bezelHi);
  rect(ctx, d.x, d.y + 1, d.w, d.h - 1, C.display);

  // corridor decor: runner rug, benches, vending machine, plants
  const midL = SERVER_W + 3;
  const midR = W - LOBBY_W - 3;
  rect(ctx, midL + 4, y + 50, midR - midL - 8, 12, "#7b3b45");
  rect(ctx, midL + 6, y + 52, midR - midL - 12, 8, "#a34f5c");
  for (let k = midL + 10; k < midR - 10; k += 6) px(ctx, k, y + 56, "#d9a35a");
  plant(ctx, SERVER_W + 6, y + 22, true);
  vending(ctx, d.x - 22, y + 15);
  cooler(ctx, d.x + d.w + 8, y + 18);
  bench(ctx, d.x + 8, y + 32);
  if (d.x + d.w + 52 < midR) bench(ctx, d.x + d.w + 24, y + 32);
  if (midR - 18 > d.x + d.w + 60) plant(ctx, midR - 16, y + 22, true);

  // lobby (right)
  const lx = W - LOBBY_W;
  rect(ctx, lx - 3, y, 3, STRIP_H, C.wallCap);
  rect(ctx, lx, y + 3, LOBBY_W, 22, "#f1dcc0");
  rect(ctx, lx, y + 18, LOBBY_W, 7, "#e2c7a3");
  rect(ctx, lx, y + 18, LOBBY_W, 1, C.wallTrim);
  drawFloor(ctx, lx, y + 25, LOBBY_W, STRIP_H - 28, THEMES.rose);
  rect(ctx, lx - 3, y + 34, 3, 20, THEMES.rose.floorB); // lobby doorway
  windowAt(ctx, lx + 8, y + 5, 26, 11);
  // rug
  rect(ctx, lx + 10, y + 40, 50, 24, "#c9a227");
  rect(ctx, lx + 12, y + 42, 46, 20, "#e0bd45");
  // sofa
  const sx = lx + 14;
  const sy = y + 28;
  rect(ctx, sx, sy, 34, 14, C.out);
  rect(ctx, sx + 1, sy + 1, 32, 6, C.sofa);
  rect(ctx, sx + 1, sy + 7, 32, 5, C.sofaHi);
  rect(ctx, sx + 1, sy + 1, 4, 11, C.sofa);
  rect(ctx, sx + 29, sy + 1, 4, 11, C.sofa);
  rect(ctx, sx + 16, sy + 7, 1, 5, C.sofa);
  plant(ctx, W - 16, y + 20, true);
  // owner desk
  const ox = W - 50;
  const oy = y + 46;
  rect(ctx, ox, oy, 30, 1, C.out);
  rect(ctx, ox - 1, oy + 1, 32, 6, C.out);
  rect(ctx, ox, oy + 1, 30, 5, "#a8794c");
  rect(ctx, ox, oy + 1, 30, 1, "#c4925f");
  rect(ctx, ox - 1, oy + 7, 32, 6, C.out);
  rect(ctx, ox, oy + 7, 30, 4, "#7d5534");
  // owner nameplate
  const lbl = "OWNER";
  rect(ctx, ox + 15 - 12, oy + 14, 24, 8, C.out);
  rect(ctx, ox + 15 - 11, oy + 15, 22, 6, C.signDark);
  drawText(ctx, lbl, ox + 15 - Math.floor(textWidth(lbl) / 2), oy + 16, "#f6f2e9");
}

// ================================================================== frame
export interface FrameState {
  t: number;
  hover: Station | null;
  focus: Station | null;
  registerHover: boolean;
}

interface Bubble {
  x: number;
  y: number;
  text: string;
  kind: "normal" | "alert" | "soft";
  minX: number;
  maxX: number;
}

export function drawFrame(ctx: Ctx, bg: CanvasImageSource, L: Layout, extras: LiveExtras, fs: FrameState) {
  ctx.drawImage(bg, 0, 0);
  const bubbles: Bubble[] = [];
  for (const R of L.rooms) {
    const minX = R.x + CAP;
    const maxX = R.x + ROOM_W - CAP;
    for (const s of R.stations) drawStation(ctx, s, fs, bubbles, minX, maxX);
  }
  if (L.register) {
    const r = L.register;
    const on = Math.floor(fs.t / 500) % 2 === 0;
    if (on || fs.registerHover) {
      rect(ctx, r.x - 2, r.y - 2, r.w + 4, 1, fs.registerHover ? C.white : "#fff2b8");
      rect(ctx, r.x - 2, r.y + r.h + 1, r.w + 4, 1, fs.registerHover ? C.white : "#fff2b8");
    }
  }
  drawStripDynamic(ctx, L, extras, fs, bubbles);
  for (const b of bubbles) drawBubble(ctx, b);
}

function drawStation(ctx: Ctx, s: Station, fs: FrameState, bubbles: Bubble[], minX: number, maxX: number) {
  const { x, y, worker: w } = s;
  const t = fs.t + s.index * 137;
  const role = w.role as Role;
  const hl = fs.hover === s || fs.focus === s;
  if (hl) {
    rect(ctx, x + 1, y - 1, 46, 42, "rgba(255,255,255,0.18)");
    rect(ctx, x + 1, y - 1, 46, 1, C.white);
    rect(ctx, x + 1, y + 40, 46, 1, C.white);
    rect(ctx, x + 1, y - 1, 1, 42, C.white);
    rect(ctx, x + 46, y - 1, 1, 42, C.white);
  }
  drawScreen(ctx, x + 16, y + 3, w.state, t, s.index);

  // desk-top props that depend on state
  if (w.state === "waiting" || w.queued > 0) {
    const n = Math.min(5, Math.max(1, w.queued));
    for (let i = 0; i < n; i++) {
      const cx = x + 35 + (i % 2);
      const cy = y + 16 - i * 2;
      rect(ctx, cx, cy, 9, 7, C.out);
      rect(ctx, cx + 1, cy + 1, 7, 5, ["#ffe37a", "#a8e6ff", "#ffb3c7", "#b9f5a8", "#ffd1a1"][i]);
    }
    if (w.queued > 0) {
      const cy = y + 16 - (n - 1) * 2;
      drawText(ctx, String(Math.min(9, w.queued)), x + 38 + ((n - 1) % 2), cy + 1, C.out);
    }
  } else {
    rect(ctx, x + 37, y + 16, 3, 4, C.mug);
    px(ctx, x + 40, y + 17, C.mug);
    if (Math.floor(t / 400) % 3 !== 0) px(ctx, x + 38, y + 14 - (Math.floor(t / 400) % 2), "rgba(255,255,255,0.6)");
  }

  const look = lookOf(role);
  const blink = t % 3200 < 140;
  switch (w.state) {
    case "working": {
      const f = Math.floor(t / 110) % 2;
      // arms + hands on the keyboard
      rect(ctx, x + 16, y + 20, 2, 8, look.shirt);
      rect(ctx, x + 30, y + 20, 2, 8, look.shirt);
      rect(ctx, x + 15, y + 18 + f, 3, 2, look.skin);
      rect(ctx, x + 30, y + 19 - f, 3, 2, look.skin);
      drawWorker(ctx, role, "back", x + 18, y + 19);
      backChair(ctx, x, y);
      break;
    }
    case "blocked": {
      const shake = Math.floor(t / 1600) % 2 === 0 && t % 1600 < 500 ? (Math.floor(t / 60) % 2 ? 1 : -1) : 0;
      const dx = x + shake;
      rect(ctx, dx + 16, y + 21, 2, 7, look.shirt);
      rect(ctx, dx + 30, y + 21, 2, 7, look.shirt);
      drawWorker(ctx, role, "back", dx + 18, y + 19);
      rect(ctx, dx + 16, y + 19, 3, 3, look.skin);
      rect(ctx, dx + 29, y + 19, 3, 3, look.skin);
      backChair(ctx, x, y);
      break;
    }
    case "waiting": {
      const f = Math.floor(t / 450) % 2;
      rect(ctx, x + 30, y + 21, 2, 7, look.shirt);
      rect(ctx, x + 30, y + 19 + f, 3, 2, look.skin);
      drawWorker(ctx, role, "back", x + 18, y + 19);
      backChair(ctx, x, y);
      break;
    }
    case "review": {
      frontChair(ctx, x, y);
      drawWorker(ctx, role, "front", x + 18, y + 21, { blink });
      // document held up
      const bob = Math.floor(t / 900) % 2;
      rect(ctx, x + 20, y + 29 + bob, 9, 7, C.out);
      rect(ctx, x + 21, y + 30 + bob, 7, 5, C.paper);
      rect(ctx, x + 22, y + 31 + bob, 5, 1, C.paperLine);
      rect(ctx, x + 22, y + 33 + bob, 4, 1, C.paperLine);
      rect(ctx, x + 19, y + 32 + bob, 2, 2, look.skin);
      rect(ctx, x + 28, y + 32 + bob, 2, 2, look.skin);
      break;
    }
    case "idle":
    default: {
      frontChair(ctx, x, y);
      drawWorker(ctx, role, "front", x + 18, y + 21, { eyesClosed: true });
      // hands behind head, elbows out
      rect(ctx, x + 15, y + 21, 2, 2, look.shirt);
      rect(ctx, x + 16, y + 23, 2, 2, look.shirt);
      rect(ctx, x + 31, y + 21, 2, 2, look.shirt);
      rect(ctx, x + 30, y + 23, 2, 2, look.shirt);
      px(ctx, x + 17, y + 22, look.skin);
      px(ctx, x + 30, y + 22, look.skin);
      break;
    }
  }

  // bubbles
  const bx = x + 30;
  const by = y - 4;
  if (w.state === "working") bubbles.push({ x: bx, y: by, text: fitText((w.bubble || "WORK").toUpperCase(), 40), kind: "normal", minX, maxX });
  else if (w.state === "idle") bubbles.push({ x: bx, y: by, text: "Z".repeat(1 + (Math.floor(t / 600) % 3)), kind: "soft", minX, maxX });
  else if (w.state === "blocked") {
    if (Math.floor(t / 400) % 4 !== 3) bubbles.push({ x: bx, y: by, text: "!", kind: "alert", minX, maxX });
  } else if (w.state === "review") bubbles.push({ x: bx, y: by, text: "?", kind: "normal", minX, maxX });
  else if (w.state === "waiting") bubbles.push({ x: bx, y: by, text: ".".repeat(1 + (Math.floor(t / 400) % 3)), kind: "soft", minX, maxX });
}

function backChair(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 17, y + 31, 14, 6, C.out);
  rect(ctx, x + 18, y + 31, 12, 5, C.chair);
  rect(ctx, x + 18, y + 31, 12, 1, C.chairHi);
  rect(ctx, x + 23, y + 37, 2, 2, C.chairBase);
  rect(ctx, x + 19, y + 39, 10, 1, C.chairBase);
  px(ctx, x + 19, y + 40, C.out);
  px(ctx, x + 28, y + 40, C.out);
}

function frontChair(ctx: Ctx, x: number, y: number) {
  rect(ctx, x + 17, y + 19, 14, 13, C.out);
  rect(ctx, x + 18, y + 20, 12, 11, C.chair);
  rect(ctx, x + 18, y + 20, 12, 1, C.chairHi);
  rect(ctx, x + 16, y + 33, 16, 3, C.out);
  rect(ctx, x + 17, y + 33, 14, 2, C.chairHi);
  rect(ctx, x + 23, y + 36, 2, 3, C.chairBase);
  rect(ctx, x + 19, y + 39, 10, 1, C.chairBase);
  px(ctx, x + 19, y + 40, C.out);
  px(ctx, x + 28, y + 40, C.out);
}

function drawScreen(ctx: Ctx, sx: number, sy: number, state: Worker["state"], t: number, seed: number) {
  const W = 16;
  const H = 10;
  switch (state) {
    case "working": {
      rect(ctx, sx, sy, W, H, C.screen);
      const step = Math.floor(t / 220);
      for (let i = 0; i < 5; i++) {
        const L = step + i;
        const indent = Math.floor(hash(seed * 31 + L) * 3) * 2;
        const len = 3 + Math.floor(hash(seed * 97 + L) * 10);
        const col = C.code[Math.floor(hash(L * 7 + seed) * C.code.length)];
        rect(ctx, sx + 1 + indent, sy + 1 + i * 2, Math.min(len, W - 2 - indent), 1, col);
      }
      if (Math.floor(t / 300) % 2) rect(ctx, sx + 13, sy + 8, 2, 1, C.white);
      break;
    }
    case "blocked": {
      rect(ctx, sx, sy, W, H, "#3a0f16");
      if (Math.floor(t / 400) % 2) rect(ctx, sx, sy, W, H, "#5a1520");
      drawText(ctx, "!", sx + 6, sy + 3, "#ff9aa5");
      rect(ctx, sx + 2, sy + 1, 12, 1, "#ff5a6a");
      break;
    }
    case "review": {
      rect(ctx, sx, sy, W, H, "#e8eef7");
      for (let i = 0; i < 4; i++) rect(ctx, sx + 2, sy + 1 + i * 2, 6 + Math.floor(hash(seed + i) * 7), 1, "#9aa6b8");
      rect(ctx, sx + 1, sy + 3, 14, 1, "#ffd76a");
      break;
    }
    case "waiting": {
      rect(ctx, sx, sy, W, H, C.screen);
      for (let i = 0; i < 3; i++) {
        rect(ctx, sx + 2, sy + 1 + i * 3, 2, 2, "#f4e7a1");
        rect(ctx, sx + 5, sy + 1 + i * 3, 8, 1, "#6f7a92");
      }
      break;
    }
    default: {
      rect(ctx, sx, sy, W, H, "#0a0f1a");
      const period = 5200;
      const p = (t % period) / period;
      const bx = Math.floor(Math.abs(((p * 3) % 2) - 1) * (W - 2));
      const by = Math.floor(Math.abs(((p * 5) % 2) - 1) * (H - 2));
      rect(ctx, sx + bx, sy + by, 2, 2, "#2f4a6e");
    }
  }
}

function drawStripDynamic(ctx: Ctx, L: Layout, ex: LiveExtras, fs: FrameState, bubbles: Bubble[]) {
  const y = L.stripY;
  const cpu = ex.cpu ?? 0;
  // heat in the server room
  if (cpu > 45) {
    rect(ctx, 0, y + 25, SERVER_W, STRIP_H - 28, `rgba(255,90,40,${(((cpu - 45) / 55) * 0.35).toFixed(3)})`);
  }
  const ledColor = cpu >= 85 ? C.led.hot : cpu >= 60 ? C.led.warn : C.led.ok;
  const speed = Math.max(60, 600 - cpu * 5);
  const tick = Math.floor(fs.t / speed);
  for (const [ri, rx] of [5, 26].entries()) {
    for (let u = 0; u < 5; u++) {
      for (let k = 0; k < 6; k++) {
        const on = hash(ri * 1000 + u * 50 + k * 7 + tick * 13) < Math.max(0.12, cpu / 100);
        rect(ctx, rx + 3 + k * 2, y + 18 + u * 8, 1, 1, on ? ledColor : C.led.off);
      }
      // per-unit load bar
      const bar = Math.round((Math.min(100, cpu * (0.7 + hash(u + ri * 9) * 0.6)) / 100) * 13);
      rect(ctx, rx + 3, y + 21 + u * 8, 13, 2, "#1d1f2c");
      rect(ctx, rx + 3, y + 21 + u * 8, bar, 2, ledColor);
    }
    // heat shimmer above racks
    if (cpu > 70) {
      for (let k = 0; k < 3; k++) {
        const hy = y + 10 - ((Math.floor(fs.t / 120) + k * 3) % 8);
        px(ctx, rx + 5 + k * 4 + (Math.floor(fs.t / 200 + k) % 2), hy, "rgba(255,160,90,0.8)");
      }
    }
  }
  // CPU plaque
  drawText(ctx, "CPU", 50, y + 7, "#8fa3c7");
  const cpuTxt = ex.cpu === null ? "--" : `${Math.round(cpu)}%`;
  drawText(ctx, cpuTxt, 50, y + 14, cpu >= 85 ? "#ff8f8f" : cpu >= 60 ? "#ffd479" : "#9df5b8");
  rect(ctx, 72, y + 7, 1, 12, "#1d1f2c");
  rect(ctx, 72, y + 7 + 12 - Math.round((cpu / 100) * 12), 1, Math.round((cpu / 100) * 12), ledColor);

  // wall display
  const d = L.display;
  const l1 = `TODAY ${ex.todayTokens === null ? "--" : compact(ex.todayTokens)} TOKENS`;
  const l2 = `${ex.todayCost === null ? "--" : "$" + ex.todayCost.toFixed(2)} API-EQUIV`;
  drawText(ctx, fitText(l1, d.w - 6), d.x + 3, d.y + 3, C.displayGlow);
  drawText(ctx, fitText(l2, d.w - 6), d.x + 3, d.y + 10, "#ffd76a");
  if (Math.floor(fs.t / 700) % 2) px(ctx, d.x + d.w - 3, d.y + 3, "#ff5a6a");
  drawClock(ctx, d.x - 14, y + 8);

  // owner in the lobby
  const ox = L.W - 50;
  const oy = y + 46;
  const live = ex.interactive > 0;
  drawWorker(ctx, "owner", "front", ox + 9, oy - 14, { rows: 14, blink: fs.t % 4100 < 150, litFace: live });
  // re-draw desk front over the owner's lap
  rect(ctx, ox - 1, oy + 1, 32, 6, C.out);
  rect(ctx, ox, oy + 1, 30, 5, "#a8794c");
  rect(ctx, ox, oy + 1, 30, 1, "#c4925f");
  // laptop (lid faces the owner; we see its back)
  if (live) {
    const glow = ctx.createRadialGradient(ox + 15, oy - 2, 1, ox + 15, oy - 2, 18);
    glow.addColorStop(0, "rgba(143,240,255,0.45)");
    glow.addColorStop(1, "rgba(143,240,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(ox - 4, oy - 20, 38, 30);
    rect(ctx, ox + 9, oy - 4, 12, 7, C.out);
    rect(ctx, ox + 10, oy - 3, 10, 5, C.laptop);
    px(ctx, ox + 14, oy - 1, C.laptopGlow);
    px(ctx, ox + 15, oy - 1, C.laptopGlow);
    bubbles.push({ x: ox + 22, y: oy - 26, text: `${ex.interactive} LIVE`, kind: "normal", minX: L.W - LOBBY_W, maxX: L.W - 2 });
  } else {
    rect(ctx, ox + 9, oy + 1, 12, 2, C.out);
    rect(ctx, ox + 10, oy + 1, 10, 1, C.laptop);
    rect(ctx, ox + 23, oy + 1, 3, 3, C.mug);
  }
}

function drawClock(ctx: Ctx, cx: number, cy: number) {
  // 11x11 wall clock with real hour/minute hands
  rect(ctx, cx - 4, cy - 5, 9, 11, C.out);
  rect(ctx, cx - 5, cy - 4, 11, 9, C.out);
  rect(ctx, cx - 4, cy - 4, 9, 9, C.paper);
  const now = new Date();
  const hand = (frac: number, len: number, col: string) => {
    const a = frac * Math.PI * 2 - Math.PI / 2;
    for (let i = 1; i <= len; i++) px(ctx, Math.round(cx + Math.cos(a) * i), Math.round(cy + Math.sin(a) * i), col);
  };
  hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12, 2, C.out);
  hand(now.getMinutes() / 60, 3, "#d1495b");
  px(ctx, cx, cy, C.out);
}

function drawBubble(ctx: Ctx, b: Bubble) {
  const w = textWidth(b.text) + 6;
  const h = 9;
  let x = b.x;
  if (x + w > b.maxX - 1) x = b.maxX - 1 - w;
  if (x < b.minX + 1) x = b.minX + 1;
  const y = b.y;
  const bg = b.kind === "alert" ? C.bubbleRed : b.kind === "soft" ? "#dfe6f3" : C.white;
  const fg = b.kind === "alert" ? C.white : C.ink;
  rect(ctx, x + 1, y, w - 2, h, C.out);
  rect(ctx, x, y + 1, w, h - 2, C.out);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, bg);
  // tail
  const tx = Math.max(x + 2, Math.min(b.x + 1, x + w - 4));
  rect(ctx, tx, y + h - 1, 3, 1, bg);
  rect(ctx, tx, y + h, 2, 1, C.out);
  px(ctx, tx + 2, y + h - 1, C.out);
  px(ctx, tx + 1, y + h, bg);
  px(ctx, tx, y + h + 1, C.out);
  drawText(ctx, b.text, x + 3, y + 2, fg);
}

export function compact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K";
  return String(n);
}

export function hitTest(L: Layout, x: number, y: number): { station: Station | null; register: boolean } {
  if (L.register) {
    const r = L.register;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return { station: null, register: true };
  }
  for (const R of L.rooms)
    for (const s of R.stations) if (x >= s.x + 2 && x < s.x + 46 && y >= s.y - 4 && y < s.y + 50) return { station: s, register: false };
  return { station: null, register: false };
}
