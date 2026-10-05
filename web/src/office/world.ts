// The office map: a grid of rooms (one per project, plus meeting / break / server /
// owner rooms and a mushola with tempat wudhu) joined by corridors. buildWorld() draws the
// static background once into an offscreen canvas (atlas props from sprites/props.png;
// walls, caps and doors procedural) and returns the nav graph, seats and anchors.
import type { Office, OfficeRoom, Role } from "../api/types";
import { ROLES } from "../api/types";
import * as P from "./props";
import { OUT } from "./props";
import { floorFill, prop } from "./propAtlas";
import { drawText, fitText, hash, rect, textWidth, type Ctx } from "./pixel";
import type { Dir } from "./sprites";

export const RW = 352;
const RH_P = 300;
const RH_F = 264;
export const VC = 40;
export const HC = 48;
const CAP = P.CAP;
const FACE = 52;
const DOOR_W = 32;
const MAT_DX = 27;
const MAT_DY = 46;

export interface Pt {
  x: number;
  y: number;
}
export interface NavNode extends Pt {
  id: number;
  adj: number[];
}
export type SpotKind = "deskA" | "deskB" | "meetTop" | "meetBottom" | "couch" | "stand" | "mat" | "wudhu" | "shoe";
export type Chair =
  | { kind: "office" | "wood"; cx: number; top: number }
  | { kind: "part"; name: string; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number };
export interface Spot extends Pt {
  id: string;
  node: number;
  via: Pt[];
  kind: SpotKind;
  dir: Dir;
  idle: boolean;
  talk?: boolean;
  flip?: boolean;
  clipY?: number;
  chair?: Chair;
  occupant: string | null;
}
export interface Desk {
  key: string;
  project: string | null;
  role: Role;
  row: "A" | "B";
  cx: number;
  dA: number;
  seat: Spot;
  screens: Pt[];
  backs: Pt[];
  cards: Pt;
}
export interface Occluder {
  x0: number;
  x1: number;
  yTop: number;
  yBottom: number;
}
export interface RoomBox {
  x: number;
  y: number;
  w: number;
  h: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
  kind: "project" | "meeting" | "break" | "server" | "owner" | "mushola";
  project: string | null;
  name: string;
  active: boolean;
}
export interface Mushola {
  male: Spot[];
  female: Spot[];
  imam: Spot;
  wudhu: Spot[];
  shoes: Spot[];
  hall: { x0: number; x1: number; y0: number; y1: number };
}
export interface World {
  W: number;
  H: number;
  cols: number;
  bg: HTMLCanvasElement;
  nodes: NavNode[];
  spots: Map<string, Spot>;
  desks: Map<string, Desk>;
  meetSeats: Spot[];
  idleSpots: Spot[];
  occluders: Occluder[];
  rooms: RoomBox[];
  racks: { x: number; y: number; w: number; h: number }[];
  server: { x: number; y: number; w: number; h: number; screen: Pt } | null;
  owner: { x: number; y: number; clipY: number; screen: Pt } | null;
  tvs: { x: number; y: number; w: number; h: number; kind: "tokens" | "chart" }[];
  register: { x: number; y: number; w: number; h: number } | null;
  mushola: Mushola | null;
  /** queue in front of the Owner's desk for workers waiting on an answer */
  ownerQueue: Spot[];
  signature: string;
}

type Slot =
  | { kind: "project"; room: OfficeRoom; hq: boolean; index: number; span: 1 }
  | { kind: "meeting"; span: 1 }
  | { kind: "breakServer"; span: 1 }
  | { kind: "owner"; span: 1 }
  | { kind: "mushola"; span: 2 }
  | { kind: "garden"; span: 1 };

export const deskKey = (project: string | null, role: string) => `${project ?? "hq"}/${role}`;

export function roomsOf(office: Office): { rooms: OfficeRoom[]; hq: boolean } {
  if (office.rooms.length) return { rooms: office.rooms, hq: false };
  return { rooms: [{ project: "", name: "HQ", active: true, workers: office.hq }], hq: true };
}

export function worldWidth(cols: number) {
  return cols * RW + (cols - 1) * VC;
}

// Atlas floor per room + wall colours; the procedural kind is the fallback.
const THEMES: { floor: string; fb: P.FloorKind; wall: string; base: string }[] = [
  { floor: "office", fb: "teal", wall: "#efe9c4", base: "#b9a77a" },
  { floor: "blue_carpet", fb: "wavy", wall: "#cfdcb9", base: "#8fa078" },
  { floor: "wood", fb: "wood", wall: "#d6e3ee", base: "#97a8b8" },
  { floor: "meeting_carpet", fb: "olive", wall: "#f1dfc6", base: "#b8956c" },
  { floor: "reception", fb: "sage", wall: "#e5daf0", base: "#a596b8" },
];

function fl(g: Ctx, name: string, fb: P.FloorKind, x: number, y: number, w: number, h: number, seed: number) {
  if (!floorFill(g, name, x, y, w, h)) P.floor(g, fb, x, y, w, h, seed);
}

class Builder {
  nodes: NavNode[] = [];
  spots = new Map<string, Spot>();
  desks = new Map<string, Desk>();
  meetSeats: Spot[] = [];
  idleSpots: Spot[] = [];
  occluders: Occluder[] = [];
  rooms: RoomBox[] = [];
  racks: World["racks"] = [];
  server: World["server"] = null;
  owner: World["owner"] = null;
  tvs: World["tvs"] = [];
  register: World["register"] = null;
  mushola: Mushola | null = null;
  ownerQueue: Spot[] = [];
  doors: { corridor: number; x: number; inside: number }[] = [];
  constructor(public g: Ctx) {}
  node(x: number, y: number): number {
    const id = this.nodes.length;
    this.nodes.push({ id, x: Math.round(x), y: Math.round(y), adj: [] });
    return id;
  }
  link(a: number, b: number) {
    if (a === b) return;
    if (!this.nodes[a].adj.includes(b)) this.nodes[a].adj.push(b);
    if (!this.nodes[b].adj.includes(a)) this.nodes[b].adj.push(a);
  }
  chain(ids: number[]) {
    for (let i = 1; i < ids.length; i++) this.link(ids[i - 1], ids[i]);
  }
  spot(s: Omit<Spot, "occupant">): Spot {
    const sp: Spot = { ...s, occupant: null };
    this.spots.set(sp.id, sp);
    if (sp.idle) this.idleSpots.push(sp);
    return sp;
  }
  lane(y: number, xs: number[]): Map<number, number> {
    const sorted = [...new Set(xs.map(Math.round))].sort((a, b) => a - b);
    const m = new Map<number, number>();
    this.chain(
      sorted.map((x) => {
        const id = this.node(x, y);
        m.set(x, id);
        return id;
      }),
    );
    return m;
  }
  /** nearest node of a lane map to x */
  near(m: Map<number, number>, x: number): number {
    let best = -1;
    let bd = Infinity;
    for (const [lx, id] of m) if (Math.abs(lx - x) < bd) (bd = Math.abs(lx - x)), (best = id);
    return best;
  }
}

// ------------------------------------------------------------------ room shell
interface Shell {
  ix: number;
  iy: number;
  iw: number;
  ih: number;
  fy: number;
}
function shell(b: Builder, x: number, y: number, w: number, h: number, floorName: string, fb: P.FloorKind, wall: string, base: string, door: "top" | "bottom", doorX: number, seed: number): Shell {
  const g = b.g;
  const ix = x + CAP;
  const iy = y + CAP;
  const iw = w - CAP * 2;
  const ih = h - CAP * 2;
  const fy = iy + FACE;
  fl(g, floorName, fb, ix, fy, iw, ih - FACE, seed);
  P.wallFace(g, ix, iy, iw, FACE, wall, base);
  rect(g, ix, fy, iw, 3, "rgba(24,22,44,0.16)");
  const gx0 = doorX - DOOR_W / 2;
  const gx1 = doorX + DOOR_W / 2;
  if (door === "top") {
    P.capH(g, x, y, gx0 - x);
    P.capH(g, gx1, y, x + w - gx1);
    fl(g, floorName, fb, gx0, iy, DOOR_W, FACE, seed + 3);
    rect(g, gx0 - 1, iy, 1, FACE, OUT);
    rect(g, gx1, iy, 1, FACE, OUT);
    rect(g, gx0 - 3, iy, 2, FACE, P.shadeHex(wall, 0.8));
    rect(g, gx1 + 1, iy, 2, FACE, P.shadeHex(wall, 0.8));
    P.capH(g, x, y + h - CAP, w);
  } else {
    P.capH(g, x, y, w);
    P.capH(g, x, y + h - CAP, gx0 - x);
    P.capH(g, gx1, y + h - CAP, x + w - gx1);
  }
  P.capV(g, x, y, h);
  P.capV(g, x + w - CAP, y, h);
  const py = door === "top" ? y : y + h - CAP;
  rect(g, gx0 - 1, py, 1, CAP, OUT);
  rect(g, gx1, py, 1, CAP, OUT);
  return { ix, iy, iw, ih, fy };
}

function plaque(g: Ctx, cx: number, y: number, text: string, lit = false, maxW = 96) {
  const t = fitText(text.toUpperCase(), maxW);
  const w = textWidth(t) + 8;
  const x = Math.round(cx - w / 2);
  rect(g, x, y, w, 9, OUT);
  rect(g, x + 1, y + 1, w - 2, 7, lit ? "#ffd76a" : "#3b3a52");
  if (lit) rect(g, x + 1, y + 1, w - 2, 1, "#fff0b0");
  drawText(g, t, x + 4, y + 2, lit ? OUT : "#f6f2e9");
  return { x, w };
}

// ------------------------------------------------------------------ project room (and HQ)
function projectRoom(b: Builder, x: number, y: number, room: OfficeRoom, hq: boolean, index: number, door: "top" | "bottom"): number {
  const g = b.g;
  const th = hq ? THEMES[1] : THEMES[index % THEMES.length];
  const doorX = door === "bottom" ? x + RW / 2 : x + CAP + 120;
  const s = shell(b, x, y, RW, RH_P, th.floor, th.fb, th.wall, th.base, door, doorX, index + 1);
  const { ix, iy, fy } = s;
  const project = hq ? null : room.project;
  b.rooms.push({ x, y, w: RW, h: RH_P, ix, iy, iw: s.iw, ih: s.ih, kind: "project", project, name: room.name, active: room.active && !hq });

  // ---- wall decor
  const sign = plaque(g, ix + 169, iy + 4, hq ? "HQ" : room.name, room.active && !hq, 110);
  if (room.active && !hq) {
    rect(g, sign.x - 3, iy + 6, 2, 5, "#ffd76a");
    rect(g, sign.x + sign.w + 1, iy + 6, 2, 5, "#ffd76a");
    const tw = textWidth("ACTIVE") + 6;
    rect(g, ix + 169 - tw / 2, iy + 17, tw, 8, OUT);
    rect(g, ix + 169 - tw / 2 + 1, iy + 18, tw - 2, 6, "#e05a2b");
    drawText(g, "ACTIVE", ix + 169 - tw / 2 + 3, iy + 19, "#ffffff");
  }
  prop(g, "frame_chart", ix + 72, iy + 9, { anchor: "top" });
  prop(g, "notice_board", ix + 114, iy + 10, { anchor: "top" });
  if (index % 2) P.worldMap(g, ix + 230, iy + 8, 50, 26);
  else {
    P.wallTV(g, ix + 232, iy + 7, 46, 28);
    b.tvs.push({ x: ix + 234, y: iy + 9, w: 42, h: 24, kind: "chart" });
  }
  prop(g, "clock", ix + 212, iy + 14, { anchor: "top" });
  prop(g, "cork_board", ix + 308, iy + 9, { anchor: "top" });

  // ---- side furniture
  prop(g, "bookshelf", ix + 27, fy + 14);
  prop(g, "plant_tall", ix + 324, fy + 30);

  // ---- cubicle islands: back row (A) faces the viewer, front row (B) faces the wall
  const dA = fy + 40;
  const laneB = fy + 12;
  const laneF = dA + 96;
  const laneBot = dA + 150;
  const aisles = [ix + 18, ix + 120, ix + 219, ix + 326];
  const centers = [ix + 70, ix + 169, ix + 268];
  for (let k = 0; k < 3; k++) {
    const cx = centers[k];
    rect(g, cx - 31, dA + 16, 62, 2, P.SHADOW);
    // B desk (atlas desk_single: desk + monitor + chair, worker sits with back to viewer)
    prop(g, "desk_single", cx, dA + 76);
    plaque(g, cx, iy + 41, SHORT[ROLES[k]]);
    const lb = SHORT[ROLES[k + 3]];
    const lw = textWidth(lb) + 6;
    rect(g, cx - lw / 2 - 1, dA + 78, lw + 2, 9, OUT);
    rect(g, cx - lw / 2, dA + 79, lw, 7, "#3b3a52");
    drawText(g, lb, cx - lw / 2 + 3, dA + 80, "#f6f2e9");
  }

  // ---- bottom zone: cabinets, copier, cooler, lounge
  prop(g, "file_cabinet", ix + 22, dA + 138);
  prop(g, "file_cabinet", ix + 48, dA + 138);
  prop(g, "copier", ix + 84, dA + 138);
  prop(g, "water_cooler", ix + 116, dA + 138);
  prop(g, "plant_b", ix + 136, dA + 190);
  const sofaCx = ix + 270;
  const sofaTop = dA + 136;
  prop(g, "sofa_set", sofaCx, sofaTop + 55);
  prop(g, "plant_a", ix + 330, dA + 192);

  // ---- nav
  const lb = b.lane(laneB, [...aisles, ...centers]);
  const lf = b.lane(laneF, [...aisles, ...centers]);
  const lbot = b.lane(laneBot, [aisles[0], aisles[1], aisles[2], doorX, ix + 84, ix + 116]);
  for (const ax of aisles) b.link(lb.get(ax)!, lf.get(ax)!);
  for (const ax of aisles.slice(0, 3)) b.link(lf.get(ax)!, lbot.get(ax)!);
  for (let k = 0; k < 3; k++) {
    const cx = centers[k];
    const dk = deskKey(project, ROLES[k]);
    const seatA = b.spot({ id: `seat:${dk}`, x: cx, y: dA + 11, node: lb.get(cx)!, via: [], kind: "deskA", dir: "down", idle: false, clipY: dA + 3 });
    b.desks.set(dk, { key: dk, project, role: ROLES[k], row: "A", cx, dA, seat: seatA, screens: [], backs: [{ x: cx - 16, y: dA - 1 }, { x: cx + 1, y: dA - 1 }], cards: { x: cx + 19, y: dA + 2 } });
    const dkB = deskKey(project, ROLES[k + 3]);
    const sx = cx - 1;
    const seatB = b.spot({
      id: `seat:${dkB}`,
      x: sx,
      y: dA + 71,
      node: lf.get(cx)!,
      via: [{ x: sx, y: laneF }],
      kind: "deskB",
      dir: "up",
      idle: false,
      chair: { kind: "part", name: "desk_single", sx: 20, sy: 31, sw: 25, sh: 22, dx: cx - 32 + 20, dy: dA + 23 + 31 },
    });
    b.desks.set(dkB, { key: dkB, project, role: ROLES[k + 3], row: "B", cx, dA, seat: seatB, screens: [{ x: cx - 9, y: dA + 29 }], backs: [], cards: { x: cx + 14, y: dA + 34 } });
  }
  const pid = project ?? "hq";
  b.spot({ id: `printer:${pid}`, x: ix + 84, y: dA + 150, node: lbot.get(ix + 84)!, via: [], kind: "stand", dir: "up", idle: true });
  b.spot({ id: `cooler:${pid}`, x: ix + 116, y: dA + 150, node: lbot.get(ix + 116)!, via: [], kind: "stand", dir: "up", idle: true, talk: true });
  const sofaN = lf.get(aisles[3])!;
  for (const lx of [30, 52, 74]) {
    const sx = sofaCx - 48 + lx;
    b.spot({ id: `couch:${pid}:${lx}`, x: sx, y: sofaTop + 31, node: sofaN, via: [{ x: aisles[3], y: sofaTop + 31 }], kind: "couch", dir: "down", idle: true, clipY: sofaTop + 27 });
  }

  if (door === "bottom") {
    const inside = b.node(doorX, dA + 186);
    b.link(inside, lbot.get(doorX)!);
    return inside;
  }
  const inside = b.node(doorX, laneB);
  b.link(inside, lb.get(ix + 120)!);
  return inside;
}

export const SHORT: Record<Role, string> = {
  analyst: "ANALYST",
  "project-manager": "PM",
  uiux: "UI/UX",
  frontend: "FRONTEND",
  backend: "BACKEND",
  infra: "INFRA",
};

// ------------------------------------------------------------------ meeting room
function meetingRoom(b: Builder, x: number, y: number, door: "top" | "bottom"): number {
  const g = b.g;
  const doorX = door === "top" ? x + CAP + 46 : x + RW / 2;
  const s = shell(b, x, y, RW, RH_F, "meeting_carpet", "wood", "#cfdcb9", "#8fa078", door, doorX, 41);
  const { ix, iy, fy } = s;
  b.rooms.push({ x, y, w: RW, h: RH_F, ix, iy, iw: s.iw, ih: s.ih, kind: "meeting", project: null, name: "Meeting", active: false });
  plaque(g, ix + 60, iy + 4, "MEETING");
  prop(g, "frame_landscape", ix + 40, iy + 18, { anchor: "top" });
  P.wallTV(g, ix + 124, iy + 6, 92, 40);
  b.tvs.push({ x: ix + 126, y: iy + 8, w: 88, h: 36, kind: "tokens" });
  prop(g, "frame_chart", ix + 250, iy + 14, { anchor: "top" });
  prop(g, "clock", ix + 296, iy + 12, { anchor: "top" });
  prop(g, "whiteboard_stand", ix + 300, fy + 52);
  prop(g, "plant_tall", ix + 18, fy + 40);
  prop(g, "plant_c", ix + 20, fy + 196);
  prop(g, "plant_pink_tall", ix + 322, fy + 196);

  const tcx = ix + 169;
  const ty = fy + 58; // table prop top
  prop(g, "conference_table", tcx, ty + 62);
  b.occluders.push({ x0: tcx - 61, x1: tcx + 61, yTop: ty + 10, yBottom: ty + 50 });

  const laneTop = ty - 10;
  const laneBot = ty + 82;
  const topX = [37, 60, 84].map((l) => tcx - 61 + l);
  const botX = [32, 61, 92].map((l) => tcx - 61 + l);
  const aisles = [ix + 46, ix + 270];
  const lt = b.lane(laneTop, [...aisles, ...topX]);
  const lbm = b.lane(laneBot, [...aisles, ...botX, x + RW / 2]);
  for (const ax of aisles) b.link(lt.get(ax)!, lbm.get(ax)!);
  topX.forEach((sx, k) => b.meetSeats.push(b.spot({ id: `meet:t${k}`, x: sx, y: ty + 18, node: lt.get(sx)!, via: [], kind: "meetTop", dir: "down", idle: false, clipY: ty + 14 })));
  botX.forEach((sx, k) =>
    b.meetSeats.push(
      b.spot({
        id: `meet:b${k}`,
        x: sx,
        y: ty + 60,
        node: lbm.get(sx)!,
        via: [],
        kind: "meetBottom",
        dir: "up",
        idle: false,
        chair: { kind: "part", name: "conference_table", sx: sx - (tcx - 61) - 9, sy: 49, sw: 18, sh: 13, dx: sx - 9, dy: ty + 49 },
      }),
    ),
  );
  // standing room around the table for bigger reviews
  for (let k = 0; k < 4; k++) {
    const sx = ix + 64 + k * 22;
    b.meetSeats.push(b.spot({ id: `meet:s${k}`, x: sx, y: laneBot + 28, node: b.near(lbm, sx), via: [], kind: "stand", dir: "up", idle: false }));
    const sx2 = ix + 230 + k * 22;
    b.meetSeats.push(b.spot({ id: `meet:s${k + 4}`, x: sx2, y: laneBot + 28, node: b.near(lbm, sx2), via: [], kind: "stand", dir: "up", idle: false }));
  }
  if (door === "top") return lt.get(ix + 46)!;
  const inside = b.node(x + RW / 2, fy + 188);
  b.link(inside, lbm.get(x + RW / 2)!);
  return inside;
}

// ------------------------------------------------------------------ break + server (half rooms)
function breakRoom(b: Builder, x: number, y: number, w: number, door: "top" | "bottom"): number {
  const g = b.g;
  const doorX = x + CAP + 28;
  const s = shell(b, x, y, w, RH_F, "reception", "olive", "#f1dfc6", "#b8956c", door, doorX, 51);
  const { ix, iy, fy } = s;
  b.rooms.push({ x, y, w, h: RH_F, ix, iy, iw: s.iw, ih: s.ih, kind: "break", project: null, name: "Break room", active: false });
  plaque(g, ix + 60, iy + 4, "BREAK");
  prop(g, "cork_board", ix + 120, iy + 10, { anchor: "top" });
  prop(g, "clock", ix + 150, iy + 14, { anchor: "top" });
  prop(g, "coffee_counter", ix + 29, fy + 12);
  prop(g, "vending_snack", ix + 72, fy + 16);
  prop(g, "vending_drink", ix + 106, fy + 16);
  prop(g, "water_cooler", ix + 140, fy + 14);
  const sofaCx = ix + 108;
  const sofaTop = fy + 112;
  prop(g, "sofa_set", sofaCx, sofaTop + 55);
  prop(g, "plant_pink_big", ix + 16, fy + 196);
  prop(g, "plant_d", ix + 150, fy + 196);

  const hub = b.node(ix + 28, fy + 64);
  const hub2 = b.node(ix + 28, sofaTop + 31);
  b.link(hub, hub2);
  b.spot({ id: "break:coffee", x: ix + 29, y: fy + 34, node: hub, via: [], kind: "stand", dir: "up", idle: true, talk: true });
  b.spot({ id: "break:snack", x: ix + 72, y: fy + 38, node: hub, via: [{ x: ix + 72, y: fy + 64 }], kind: "stand", dir: "up", idle: true });
  b.spot({ id: "break:drink", x: ix + 106, y: fy + 38, node: hub, via: [{ x: ix + 106, y: fy + 64 }], kind: "stand", dir: "up", idle: true });
  b.spot({ id: "break:cooler", x: ix + 140, y: fy + 38, node: hub, via: [{ x: ix + 140, y: fy + 64 }], kind: "stand", dir: "up", idle: true, talk: true });
  for (const lx of [30, 52, 74]) {
    const sx = sofaCx - 48 + lx;
    b.spot({ id: `couch:break:${lx}`, x: sx, y: sofaTop + 31, node: hub2, via: [], kind: "couch", dir: "down", idle: true, clipY: sofaTop + 27 });
  }
  const inside = b.node(doorX, door === "top" ? fy + 12 : fy + 188);
  b.link(inside, door === "top" ? hub : hub2);
  return inside;
}

function serverRoom(b: Builder, x: number, y: number, w: number, door: "top" | "bottom"): number {
  const g = b.g;
  const doorX = x + w / 2;
  const s = shell(b, x, y, w, RH_F, "", "server", "#c3c8d6", "#7d8396", door, doorX, 61);
  const { ix, iy, fy } = s;
  b.rooms.push({ x, y, w, h: RH_F, ix, iy, iw: s.iw, ih: s.ih, kind: "server", project: null, name: "Server room", active: false });
  plaque(g, ix + 40, iy + 4, "SERVER");
  prop(g, "air_vent", ix + 84, iy + 6, { anchor: "top" });
  // wall CPU screen
  rect(g, ix + 112, iy + 8, 46, 26, OUT);
  b.server = { x: ix, y: iy, w: s.iw, h: s.ih, screen: { x: ix + 114, y: iy + 10 } };
  const rackAt = (cx: number, bottom: number) => {
    const r = prop(g, "server_rack", cx, bottom);
    if (r) b.racks.push(r);
    else {
      P.serverRack(g, cx - 15, bottom - 60, 30, 60);
      b.racks.push({ x: cx - 15, y: bottom - 60, w: 30, h: 60 });
    }
  };
  for (const cx of [ix + 26, ix + 72]) rackAt(cx, fy + 14);
  rackAt(ix + 136, fy + 14);
  rackAt(ix + 26, fy + 100);
  rackAt(ix + 136, fy + 100);
  prop(g, "desk_laptop", ix + 81, fy + 160);
  prop(g, "boxes", ix + 30, fy + 196);
  prop(g, "plant_c", ix + 148, fy + 196);

  const hub = b.node(ix + 81, fy + 178);
  const mid = b.node(ix + 104, fy + 44);
  const side = b.node(ix + 104, fy + 178);
  b.chain([hub, side, mid]);
  b.spot({ id: "server:console", x: ix + 81, y: fy + 172, node: hub, via: [], kind: "stand", dir: "up", idle: true });
  b.spot({ id: "server:rack", x: ix + 104, y: fy + 30, node: mid, via: [], kind: "stand", dir: "up", idle: true });
  const inside = b.node(doorX, door === "top" ? fy + 14 : fy + 190);
  b.link(inside, door === "top" ? mid : hub);
  return inside;
}

// ------------------------------------------------------------------ owner office
function ownerOffice(b: Builder, x: number, y: number, door: "top" | "bottom"): number {
  const g = b.g;
  const doorX = door === "top" ? x + CAP + 266 : x + RW / 2 + 60;
  const s = shell(b, x, y, RW, RH_F, "wood", "wood", "#e9ddc6", "#a88a63", door, doorX, 71);
  const { ix, iy, fy } = s;
  b.rooms.push({ x, y, w: RW, h: RH_F, ix, iy, iw: s.iw, ih: s.ih, kind: "owner", project: null, name: "Owner's office", active: false });
  prop(g, "bookshelf", ix + 28, fy + 14);
  prop(g, "bookshelf", ix + 78, fy + 14);
  P.worldMap(g, ix + 124, iy + 6, 76, 32);
  plaque(g, ix + 162, iy + 41, "OWNER");
  prop(g, "frame_landscape", ix + 226, iy + 12, { anchor: "top" });
  prop(g, "clock", ix + 262, iy + 14, { anchor: "top" });
  prop(g, "frame_chart", ix + 302, iy + 12, { anchor: "top" });
  prop(g, "cabinet_plant", ix + 312, fy + 30);
  prop(g, "plant_pink_big", ix + 322, fy + 110);
  // executive desk (owner sits behind it, facing the viewer)
  const dTop = fy + 44;
  prop(g, "desk_exec", ix + 162, dTop + 70);
  b.owner = { x: ix + 162, y: dTop + 34, clipY: dTop + 22, screen: { x: ix + 162 - 42 + 29, y: dTop + 23 } };
  // lounge
  const sofaCx = ix + 82;
  const sofaTop = fy + 140;
  prop(g, "sofa_set", sofaCx, sofaTop + 55);
  prop(g, "plant_tall", ix + 16, fy + 196);

  const hub = b.node(ix + 230, fy + 128);
  const hub2 = b.node(ix + 150, fy + 128);
  const hub3 = b.node(ix + 150, sofaTop + 31);
  b.chain([hub, hub2, hub3]);
  for (const lx of [30, 52, 74]) {
    const sx = sofaCx - 48 + lx;
    b.spot({ id: `couch:owner:${lx}`, x: sx, y: sofaTop + 31, node: hub3, via: [], kind: "couch", dir: "down", idle: true, clipY: sofaTop + 27 });
  }
  b.spot({ id: "owner:visit", x: ix + 262, y: fy + 104, node: hub, via: [], kind: "stand", dir: "left", idle: true, talk: true });
  // askers queue in front of the desk, facing up toward the Owner: a front row, then an arc behind
  const qFront = [0, -26, 26].map((d) => ({ x: ix + 162 + d, y: fy + 136 }));
  const qBack = [0, 26, 52, 78].map((d) => ({ x: ix + 150 + d, y: fy + 176 }));
  [...qFront, ...qBack].forEach((p, k) =>
    b.ownerQueue.push(b.spot({ id: `owner:queue:${k}`, x: p.x, y: p.y, node: k < 3 ? hub2 : hub, via: [{ x: p.x, y: fy + 128 }], kind: "stand", dir: "up", idle: false })),
  );
  const inside = b.node(doorX, door === "top" ? fy + 14 : fy + 188);
  b.link(inside, hub);
  return inside;
}

// ------------------------------------------------------------------ mushola + tempat wudhu
export function musholaRows(n: number) {
  const perRow = Math.floor((2 * RW + VC - 14 - 204 - 24) / MAT_DX);
  return { perRow, rows: Math.max(1, Math.ceil(n / perRow)) };
}
/** Vertical layout of the prayer hall (qibla up): imam, men rows, gap, women rows. */
function hallLayout(fy: number, rows: number) {
  const imamY = fy + 46;
  const men = Array.from({ length: rows }, (_, k) => imamY + 46 + k * MAT_DY);
  const gapY = men[rows - 1] + MAT_DY; // empty row between men and women
  const women = Array.from({ length: rows }, (_, k) => gapY + MAT_DY + k * MAT_DY);
  const menLane = gapY - 6;
  const womenLane = women[rows - 1] + 24;
  return { imamY, men, gapY, women, menLane, womenLane, bottom: womenLane + 14 };
}
export function musholaHeight(n: number) {
  const { rows } = musholaRows(n);
  const L = hallLayout(CAP + FACE, rows);
  return L.bottom + CAP;
}

function musholaRoom(b: Builder, x: number, y: number, n: number, corridorY: number | null): number {
  const g = b.g;
  const w = 2 * RW + VC;
  const h = musholaHeight(n);
  const WS = 190;
  const doorX = x + CAP + 95;
  const s = shell(b, x, y, w, h, "wood", "wood", "#e8f0dc", "#8fae86", "top", doorX, 81);
  const { ix, iy, fy, iw } = s;
  b.rooms.push({ x, y, w, h, ix, iy, iw, ih: s.ih, kind: "mushola", project: null, name: "Mushola", active: false });
  const wx = ix + WS; // inner wall (between wudhu and prayer hall)
  const hx0 = wx + CAP;
  const hx1 = ix + iw;
  const { perRow, rows } = musholaRows(n);

  // ---- tempat wudhu (left)
  fl(g, "restroom", "stone", ix, fy, WS, s.ih - FACE, 82);
  P.wallFace(g, ix, iy, WS, FACE, "#dfeef2", "#9bb8c2");
  plaque(g, ix + 46, iy + 4, "TEMPAT WUDHU", false, 80);
  prop(g, "mirror_large", ix + 130, iy + 8, { anchor: "top" });
  prop(g, "mirror_small", ix + 160, iy + 10, { anchor: "top" });
  prop(g, "towel_rack", ix + 150, iy + 32, { anchor: "top" });
  prop(g, "wudhu_basin_row", ix + 140, fy + 16);
  prop(g, "shoe_rack", ix + 30, fy + 22);
  prop(g, "sandals_black", ix + 18, fy + 34);
  prop(g, "sandals_blue", ix + 40, fy + 36);
  prop(g, "wet_floor_sign", ix + 66, fy + 34);
  prop(g, "bin_grey", ix + 10, s.iy + s.ih - 4);
  prop(g, "plant_shelf", ix + 176, s.iy + s.ih - 4);

  const L = hallLayout(fy, rows);
  const womenLane = L.womenLane;
  const menLane = L.menLane;
  // ---- inner wall with two gaps (men lane, women lane)
  const gaps = [
    [menLane - 26, menLane + 10],
    [womenLane - 26, womenLane + 10],
  ];
  let cy = iy;
  for (const [g0, g1] of gaps) {
    P.capV(g, wx, cy, g0 - cy);
    cy = g1;
  }
  P.capV(g, wx, cy, y + h - CAP - cy);
  P.wallFace(g, wx, iy, CAP, FACE, "#e8f0dc", "#8fae86");

  // ---- qibla wall (top): mihrab, prayer clock, frames
  const centre = Math.round((hx0 + hx1) / 2);
  plaque(g, hx0 + 60, iy + 4, "MUSHOLA", false, 80);
  prop(g, "mihrab_niche", centre, fy + 2);
  prop(g, "frame_kaaba", centre - 48, iy + 12, { anchor: "top" });
  prop(g, "frame_calligraphy", centre + 48, iy + 12, { anchor: "top" });
  prop(g, "prayer_clock", centre + 110, iy + 12, { anchor: "top" });
  prop(g, "frame_green", centre - 92, iy + 13, { anchor: "top" });
  prop(g, "frame_small", centre + 152, iy + 16, { anchor: "top" });
  prop(g, "aircon", hx0 + 40, iy + 22, { anchor: "top" });
  prop(g, "wall_fan", hx1 - 40, iy + 10, { anchor: "top" });
  prop(g, "plant_mushola_big", hx0 + 16, fy + 14);
  prop(g, "plant_mushola_b", hx1 - 16, fy + 14);
  prop(g, "bookshelf_mushola", hx1 - 26, s.iy + s.ih - 2);
  prop(g, "quran_stand", hx1 - 60, s.iy + s.ih - 2);
  prop(g, "sajadah_stack_green", hx0 + 18, s.iy + s.ih - 2);
  prop(g, "donation_box", hx0 + 42, s.iy + s.ih - 2);

  // ---- rows of sajadah, natural orientation (arch up, toward the qibla)
  const startX = Math.round(hx0 + (hx1 - hx0 - (perRow - 1) * MAT_DX) / 2);
  const matXs = Array.from({ length: perRow }, (_, i) => startX + i * MAT_DX);
  const laneXs = [hx0 + 8, ...matXs.filter((_, i) => i % 2 === 0), hx1 - 10];
  const ml = b.lane(menLane, laneXs);
  const wl = b.lane(womenLane, laneXs);
  const male: Spot[] = [];
  const female: Spot[] = [];
  L.men.forEach((ry, r) =>
    matXs.forEach((mx, i) => {
      prop(g, "sajadah_arch_a", mx, ry + 2);
      male.push(b.spot({ id: `mat:m${r}:${i}`, x: mx, y: ry, node: b.near(ml, mx), via: [{ x: mx, y: menLane }], kind: "mat", dir: "up", idle: false }));
    }),
  );
  L.women.forEach((ry, r) =>
    matXs.forEach((mx, i) => {
      prop(g, "sajadah_arch_a", mx, ry + 2);
      female.push(b.spot({ id: `mat:f${r}:${i}`, x: mx, y: ry, node: b.near(wl, mx), via: [{ x: mx, y: womenLane }], kind: "mat", dir: "up", idle: false }));
    }),
  );
  // fill order: front row first (nearest the imam), centre-out alternating left/right
  const front = (p: Spot, q: Spot) => p.y - q.y || Math.abs(p.x - centre) - Math.abs(q.x - centre) || p.x - q.x;
  male.sort(front);
  female.sort(front);
  // low rail across the empty row between the men's and women's sections
  rect(g, hx0 + 6, L.gapY + 12, hx1 - hx0 - 12, 4, OUT);
  rect(g, hx0 + 7, L.gapY + 13, hx1 - hx0 - 14, 2, "#a87b4f");
  for (let px0 = hx0 + 10; px0 < hx1 - 8; px0 += 40) rect(g, px0, L.gapY + 10, 3, 8, OUT);

  // imam: alone, centred, right below the mihrab
  prop(g, "sajadah_mihrab", centre, L.imamY + 2);
  const imam = b.spot({ id: "mat:imam", x: centre, y: L.imamY, node: b.near(ml, centre), via: [{ x: centre + Math.round(MAT_DX / 2), y: menLane }, { x: centre + Math.round(MAT_DX / 2), y: L.imamY + 20 }, { x: centre, y: L.imamY + 20 }], kind: "mat", dir: "up", idle: false });
  const qy = fy;

  // ---- wudhu taps: two columns (right column faces the inner wall, left faces the outer wall)
  const D0 = b.node(doorX, fy + 12);
  const wudhuLaneX = ix + 95;
  const ys: number[] = [];
  for (let wy = fy + 52; wy < y + h - CAP - 12; wy += 40) ys.push(wy);
  const laneIds = [D0];
  const wudhu: Spot[] = [];
  const allY = [...new Set([...ys, menLane, womenLane].filter((v) => v < y + h - CAP))].sort((a, c) => a - c);
  const byY = new Map<number, number>();
  for (const ly of allY) {
    const id = b.node(wudhuLaneX, ly);
    byY.set(ly, id);
    laneIds.push(id);
  }
  b.chain(laneIds);
  ys.forEach((wy, j) => {
    const node = byY.get(wy)!;
    wudhu.push(b.spot({ id: `wudhu:r${j}`, x: wx - 16, y: wy, node, via: [], kind: "wudhu", dir: "right", idle: false }));
    wudhu.push(b.spot({ id: `wudhu:l${j}`, x: ix + 16, y: wy, node, via: [], kind: "wudhu", dir: "left", idle: false, flip: true }));
  });
  // into the hall
  const gw = b.node(wx + 3, womenLane);
  b.link(byY.get(womenLane)!, gw);
  b.link(gw, wl.get(Math.round(hx0 + 8))!);
  const gm = b.node(wx + 3, menLane);
  b.link(byY.get(menLane)!, gm);
  b.link(gm, ml.get(Math.round(hx0 + 8))!);

  // ---- shoe line in the corridor along the mushola's top wall, racks at the door
  const shoes: Spot[] = [];
  if (corridorY !== null) {
    prop(g, "shoe_rack", doorX - 44, y + 1);
    prop(g, "shoe_rack", doorX + 44, y + 1);
    prop(g, "sandals_brown", doorX - 72, y + 2);
    prop(g, "sandals_tan", doorX + 74, y + 2);
    for (let sx = x + 18; sx < x + w - 14; sx += 22) {
      if (Math.abs(sx - doorX) < 66) continue;
      shoes.push(b.spot({ id: `shoe:${sx}`, x: sx, y: y - 3, node: -1, via: [], kind: "shoe", dir: "down", idle: false }));
    }
    shoes.sort((a, c) => Math.abs(a.x - doorX) - Math.abs(c.x - doorX));
  }
  b.mushola = { male, female, imam, wudhu, shoes, hall: { x0: hx0, x1: hx1, y0: fy, y1: qy } };
  return D0;
}

function garden(b: Builder, x: number, y: number, w: number, h: number, seed: number) {
  const g = b.g;
  P.floor(g, "grass", x, y, w, h, seed);
  rect(g, x, y, w, 4, "#3f7a32");
  rect(g, x, y + h - 4, w, 4, "#3f7a32");
  rect(g, x, y, 4, h, "#3f7a32");
  rect(g, x + w - 4, y, 4, h, "#3f7a32");
  for (let i = 0; i < 7; i++) P.tree(g, x + 30 + Math.floor(hash(seed * 5 + i) * (w - 60)), y + 50 + Math.floor(hash(seed * 9 + i) * (h - 70)), i);
  P.bench(g, x + w / 2 - 18, y + h / 2);
  prop(g, "planter_long", x + w / 2, y + h - 12);
}

// ------------------------------------------------------------------ assemble
export function buildWorld(office: Office, cols: number): World {
  const { rooms, hq } = roomsOf(office);
  cols = Math.max(2, Math.min(3, cols));
  const nWorkers = rooms.reduce((a, r) => a + r.workers.length, 0);
  const grid: Slot[][] = [];
  const place = (list: Slot[]) => {
    let row: Slot[] = [];
    let used = 0;
    const flush = () => {
      if (!row.length) return;
      while (used < cols) {
        row.push({ kind: "garden", span: 1 });
        used++;
      }
      grid.push(row);
      row = [];
      used = 0;
    };
    for (const s of list) {
      if (used + s.span > cols) flush();
      row.push(s);
      used += s.span;
      if (used === cols) flush();
    }
    flush();
  };
  place(rooms.map((room, index) => ({ kind: "project", room, hq, index, span: 1 })));
  place([{ kind: "meeting", span: 1 }, { kind: "breakServer", span: 1 }, { kind: "owner", span: 1 }]);
  place([{ kind: "mushola", span: 2 }]);
  const MH = musholaHeight(nWorkers);
  const rowH = grid.map((row) => (row.some((s) => s.kind === "mushola") ? MH : row.some((s) => s.kind === "project") ? RH_P : RH_F));
  const W = worldWidth(cols);
  const rowY: number[] = [];
  let acc = 0;
  for (let r = 0; r < grid.length; r++) {
    rowY.push(acc);
    acc += rowH[r] + (r < grid.length - 1 ? HC : 0);
  }
  const H = acc;

  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  const g = bg.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const b = new Builder(g);

  fl(g, "hallway", "stone", 0, 0, W, H, 7);

  const last = grid.length - 1;
  grid.forEach((row, r) => {
    let c = 0;
    for (const slot of row) {
      const x = c * (RW + VC);
      const y = rowY[r];
      const door: "top" | "bottom" = r === last ? "top" : "bottom";
      const corridor = door === "bottom" ? r : r - 1;
      let inside: number | null = null;
      if (slot.kind === "project") inside = projectRoom(b, x, y, slot.room, slot.hq, slot.index, door);
      else if (slot.kind === "meeting") inside = meetingRoom(b, x, y, door);
      else if (slot.kind === "owner") inside = ownerOffice(b, x, y, door);
      else if (slot.kind === "mushola") inside = musholaRoom(b, x, y, nWorkers, r > 0 ? rowY[r - 1] + rowH[r - 1] : null);
      else if (slot.kind === "breakServer") {
        const i1 = breakRoom(b, x, y, RW / 2, door);
        b.doors.push({ corridor, x: b.nodes[i1].x, inside: i1 });
        inside = serverRoom(b, x + RW / 2, y, RW / 2, door);
      } else garden(b, x, y, RW, rowH[r], r * 3 + c);
      if (inside !== null) b.doors.push({ corridor, x: b.nodes[inside].x, inside });
      if (slot.kind === "project" && slot.hq) {
        const dx = x + RW / 2;
        const R = (b.register = { x: dx - 62, y: y + RH_P + 3, w: 124, h: 24 });
        rect(g, R.x + 2, R.y + R.h, R.w - 4, 3, P.SHADOW);
        rect(g, R.x, R.y, R.w, R.h, OUT);
        rect(g, R.x + 1, R.y + 1, R.w - 2, R.h - 2, "#ffd76a");
        rect(g, R.x + 1, R.y + 1, R.w - 2, 1, "#fff0b0");
        const l1 = "+ REGISTER YOUR";
        const l2 = "FIRST PROJECT";
        drawText(g, l1, R.x + Math.floor((R.w - textWidth(l1)) / 2), R.y + 5, OUT);
        drawText(g, l2, R.x + Math.floor((R.w - textWidth(l2)) / 2), R.y + 14, OUT);
      }
      c += slot.span;
    }
  });

  // corridor ends
  grid.forEach((row, r) => {
    let c = 0;
    for (const slot of row) {
      c += slot.span;
      if (c < cols && !(slot.kind === "mushola")) {
        const vx = (c - 1) * (RW + VC) + RW;
        if (r === 0) P.capH(g, vx, 0, VC);
        if (r === last) P.capH(g, vx, H - CAP, VC);
      }
    }
  });
  for (let r = 0; r < grid.length - 1; r++) {
    const cy = rowY[r] + rowH[r];
    P.capV(g, 0, cy, HC);
    P.capV(g, W - CAP, cy, HC);
  }

  // ---- corridor nav
  const lineY = (r: number) => rowY[r] + rowH[r] + 32;
  const vCenters = Array.from({ length: cols - 1 }, (_, c) => c * (RW + VC) + RW + VC / 2);
  const corridorNodes: Map<number, number>[] = [];
  for (let r = 0; r < grid.length - 1; r++) {
    const xs = [24, W - 24, ...vCenters, ...b.doors.filter((d) => d.corridor === r).map((d) => d.x)];
    if (r === grid.length - 2 && b.mushola) xs.push(...b.mushola.shoes.map((s) => s.x));
    const m = b.lane(lineY(r), xs);
    corridorNodes.push(m);
    for (const d of b.doors.filter((d) => d.corridor === r)) b.link(d.inside, m.get(Math.round(d.x))!);
    if (r === grid.length - 2 && b.mushola) for (const s of b.mushola.shoes) s.node = m.get(Math.round(s.x))!;
  }
  // vertical corridors: only through rows where that gap exists (not inside the 2-wide mushola)
  const blocked = (r: number, c: number) => {
    let cc = 0;
    for (const s of grid[r]) {
      if (s.span === 2 && cc === c) return true;
      cc += s.span;
    }
    return false;
  };
  vCenters.forEach((vx, c) => {
    let seg: number[] = [];
    const flush = () => {
      if (seg.length > 1) b.chain(seg);
      seg = [];
    };
    for (let r = 0; r < grid.length; r++) {
      if (blocked(r, c)) {
        flush();
        continue;
      }
      if (r === 0) {
        const top = b.node(vx, 66);
        seg.push(top);
        if (c % 2 === 0) {
          if (!prop(g, "water_cooler", vx, 54)) P.waterCooler(g, vx - 7, 10);
        }
        else if (!prop(g, "vending_drink", vx, 58)) P.vending(g, vx - 12, 9);
        prop(g, "plant_a", vx + 14, 60);
        b.spot({ id: `alcove:${c}`, x: vx, y: 76, node: top, via: [], kind: "stand", dir: "up", idle: true, talk: c % 2 === 0 });
      }
      if (r < grid.length - 1) seg.push(corridorNodes[r].get(Math.round(vx))!);
      if (r === grid.length - 1) {
        seg.push(b.node(vx, H - 28));
        prop(g, "plant_b", vx - 10, H - 10);
      }
    }
    flush();
  });
  for (let r = 0; r < grid.length - 1; r++) {
    const cy = rowY[r] + rowH[r];
    prop(g, "plant_c", 20, cy + 30);
    prop(g, "plant_c", W - 20, cy + 30);
  }

  const signature = JSON.stringify([cols, rooms.map((r) => [r.project, r.name, r.active, r.workers.map((w) => w.role).sort()]), hq]);
  return {
    W,
    H,
    cols,
    bg,
    nodes: b.nodes,
    spots: b.spots,
    desks: b.desks,
    meetSeats: b.meetSeats,
    idleSpots: b.idleSpots,
    occluders: b.occluders,
    rooms: b.rooms,
    racks: b.racks,
    server: b.server,
    owner: b.owner,
    tvs: b.tvs,
    register: b.register,
    mushola: b.mushola,
    ownerQueue: b.ownerQueue,
    signature,
  };
}

/** Dijkstra over the nav graph; returns node ids from a to b inclusive. */
export function route(w: World, a: number, bId: number): number[] {
  if (a === bId || a < 0 || bId < 0) return [a];
  const n = w.nodes.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[a] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) (best = dist[i]), (u = i);
    if (u < 0 || u === bId) break;
    done[u] = true;
    const U = w.nodes[u];
    for (const v of U.adj) {
      const V = w.nodes[v];
      const d = best + Math.abs(U.x - V.x) + Math.abs(U.y - V.y);
      if (d < dist[v]) (dist[v] = d), (prev[v] = u);
    }
  }
  if (prev[bId] < 0) return [a];
  const out = [bId];
  while (out[0] !== a) out.unshift(prev[out[0]]);
  return out;
}
