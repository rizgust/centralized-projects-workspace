// Virtual workers: each Worker becomes an Actor that walks the nav graph to the spot its
// state calls for (desk, meeting table, break room...). Idle workers wander.
import type { Office, Worker } from "../api/types";
import { ANALYST_KEY, deskKey, roomsOf, route, type Pt, type Spot, type World } from "./world";
import type { Dir } from "./sprites";
import { directive, timeline, type Directive, type Participant, type SholatPlan } from "./sholat";

interface PathPt extends Pt {
  node: number;
}

export interface Actor {
  key: string;
  project: string | null;
  worker: Worker;
  x: number;
  y: number;
  dir: Dir;
  path: PathPt[];
  target: Spot | null;
  at: Spot | null;
  walked: number;
  idleSpot: Spot | null;
  idleUntil: number;
  arrivedAt: number;
  sholat: Directive | null;
}

const SPEED = 46; // native px per second

export class Sim {
  actors = new Map<string, Actor>();
  world: World | null = null;
  plan: SholatPlan | null = null;
  /** decides the men's / women's side (same variant as the sprite) */
  isFemale: (a: Actor) => boolean = () => false;
  /** project -> epoch ms: the PM visits the Owner with a fresh report */
  visits: Record<string, number> = {};
  isVisiting(a: Actor): boolean {
    return a.worker.role === "project-manager" && !!a.project && (this.visits[a.project] ?? 0) > Date.now();
  }
  /** actor key -> live discussion (topic, running) */
  talks = new Map<string, { topic: string; running: boolean }>();

  /** Map Office.discussions onto workers: project worker, else HQ, else the active room's, else any. */
  setDiscussions(list: { role: string; project: string | null; topic: string; running: string | null }[], activeProject: string | null) {
    const m = new Map<string, { topic: string; running: boolean }>();
    for (const d of list) {
      // the Analyst talks from their own desk beside the Owner
      if (d.role === "analyst" && this.actors.has(ANALYST_KEY) && !m.has(ANALYST_KEY)) {
        m.set(ANALYST_KEY, { topic: d.topic, running: !!d.running });
        continue;
      }
      const tries = [d.project ? deskKey(d.project, d.role) : null, deskKey(null, d.role), activeProject ? deskKey(activeProject, d.role) : null];
      let key = tries.find((k) => k && this.actors.has(k) && !m.has(k)) ?? null;
      if (!key) key = [...this.actors.values()].find((a) => a.worker.role === d.role && !m.has(a.key))?.key ?? null;
      if (key) m.set(key, { topic: d.topic, running: !!d.running });
    }
    this.talks = m;
  }
  activeProject: string | null = null;
  private snapAll = false;

  setPlan(plan: SholatPlan | null, now: number) {
    if (plan?.start === this.plan?.start && plan?.end === this.plan?.end) return;
    this.plan = plan;
    // dashboard opened mid-window: drop everyone straight into their phase
    if (plan && now - plan.start > 5000) this.snapAll = true;
  }

  setWorld(w: World) {
    if (this.world === w) return;
    this.world = w;
    // spots belong to the old world: re-seat everybody instantly
    for (const s of w.spots.values()) s.occupant = null;
    for (const a of this.actors.values()) {
      a.path = [];
      a.at = null;
      a.target = null;
      a.idleSpot = null;
    }
  }

  sync(office: Office) {
    const { rooms, hq } = roomsOf(office);
    const seen = new Set<string>();
    for (const r of rooms)
      for (const w of r.workers) {
        const project = hq ? null : r.project;
        const key = deskKey(project, w.role);
        seen.add(key);
        const a = this.actors.get(key);
        if (a) a.worker = w;
        else
          this.actors.set(key, {
            key,
            project,
            worker: w,
            x: 0,
            y: 0,
            dir: "down",
            path: [],
            target: null,
            at: null,
            walked: 0,
            idleSpot: null,
            idleUntil: 0,
            arrivedAt: 0,
            sholat: null,
          });
      }
    // the one workspace Analyst, at their desk in the Owner's office
    if (office.analyst) {
      const w = office.analyst;
      seen.add(ANALYST_KEY);
      const a = this.actors.get(ANALYST_KEY);
      if (a) {
        a.worker = w;
        a.project = w.project;
      } else
        this.actors.set(ANALYST_KEY, {
          key: ANALYST_KEY,
          project: w.project,
          worker: w,
          x: 0,
          y: 0,
          dir: "down",
          path: [],
          target: null,
          at: null,
          walked: 0,
          idleSpot: null,
          idleUntil: 0,
          arrivedAt: 0,
          sholat: null,
        });
    }
    for (const [k, a] of this.actors)
      if (!seen.has(k)) {
        if (a.at) a.at.occupant = null;
        if (a.target) a.target.occupant = null;
        this.actors.delete(k);
      }
  }

  private desired(a: Actor, now: number, reviewers: string[]): Spot | null {
    const w = this.world!;
    if (a.sholat) return a.sholat.spot;
    const desk = w.desks.get(a.key)?.seat ?? null;
    if (this.isVisiting(a) && w.spots.get("owner:visit")) {
      a.idleSpot = null;
      return w.spots.get("owner:visit")!;
    }
    if (a.key === ANALYST_KEY && (this.talks.has(a.key) || a.worker.state === "asking")) {
      a.idleSpot = null;
      return desk;
    }
    if (this.talks.has(a.key) && w.talkSeats.length) {
      a.idleSpot = null;
      const keys = [...this.talks.keys()].sort();
      return w.talkSeats[Math.max(0, keys.indexOf(a.key)) % w.talkSeats.length];
    }
    switch (a.worker.state) {
      case "asking":
      case "proposing": {
        a.idleSpot = null;
        const askers = [...this.actors.values()].filter((x) => x.worker.state === "asking" || x.worker.state === "proposing").map((x) => x.key).sort();
        const i = askers.indexOf(a.key);
        return w.ownerQueue.length ? w.ownerQueue[Math.max(0, i) % w.ownerQueue.length] : desk;
      }
      case "working":
      case "waiting":
      case "blocked":
        a.idleSpot = null;
        return desk;
      case "review": {
        a.idleSpot = null;
        const i = reviewers.indexOf(a.key);
        return w.meetSeats.length ? w.meetSeats[(i < 0 ? 0 : i) % w.meetSeats.length] : desk;
      }
      case "idle":
      default: {
        if (a.idleSpot && (a.idleUntil === 0 || now < a.idleUntil)) return a.idleSpot;
        const prev = a.idleSpot;
        if (prev && prev.occupant === a.key) prev.occupant = null;
        const free = w.idleSpots.filter((s) => (!s.occupant || s.occupant === a.key) && s !== prev);
        // the Analyst mostly stays at the desk; sometimes fetches coffee or water
        const pool = a.key === ANALYST_KEY ? free.filter((s) => /coffee|cooler|alcove/.test(s.id)) : free;
        const pickDesk = Math.random() < (a.key === ANALYST_KEY ? 0.75 : 0.3) || !pool.length;
        const next = pickDesk ? desk : pool[Math.floor(Math.random() * pool.length)];
        a.idleSpot = next;
        a.idleUntil = 0; // starts counting on arrival
        if (next && next !== desk) next.occupant = a.key;
        return next;
      }
    }
  }

  update(dtMs: number, now: number, reduced: boolean) {
    const w = this.world;
    if (!w) return;
    const reviewers = [...this.actors.values()].filter((a) => a.worker.state === "review").map((a) => a.key).sort();
    // sholat routine
    const plan = this.plan;
    let ps: Participant[] = [];
    const byKey = new Map<string, Participant>();
    if (plan) {
      ps = [...this.actors.values()].map((a) => ({ key: a.key, female: this.isFemale(a), role: a.worker.role, active: a.project !== null && a.project === this.activeProject })).sort((x, y) => x.key.localeCompare(y.key));
      for (const p of ps) byKey.set(p.key, p);
    }
    const tl = plan ? timeline(plan, ps.length, w.mushola?.wudhu.length ?? 1) : null;
    const wall = Date.now();
    for (const a of this.actors.values()) {
      const wasSholat = !!a.sholat;
      a.sholat = plan && tl ? directive(w, plan, tl, ps, byKey.get(a.key)!, wall, reduced) : null;
      if (wasSholat && !a.sholat) a.idleSpot = null;
    }
    const snapAll = this.snapAll;
    this.snapAll = false;
    for (const a of this.actors.values()) {
      const want = this.desired(a, now, reviewers);
      if (!want) continue;
      if (want !== a.target) this.retarget(a, want, reduced || snapAll || (!a.at && !a.path.length && !a.target));
      if (!a.path.length) continue;
      // walk
      let budget = (SPEED * dtMs) / 1000;
      while (budget > 0 && a.path.length) {
        const p = a.path[0];
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) a.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
        if (d <= budget) {
          a.x = p.x;
          a.y = p.y;
          budget -= d;
          a.walked += d;
          a.path.shift();
        } else {
          a.x += (dx / d) * budget;
          a.y += (dy / d) * budget;
          a.walked += budget;
          budget = 0;
        }
      }
      if (!a.path.length) this.arrive(a, now);
    }
  }

  private arrive(a: Actor, now: number) {
    const s = a.target!;
    a.at = s;
    a.x = s.x;
    a.y = s.y;
    a.dir = s.dir;
    a.arrivedAt = now;
    if (a.worker.state === "idle" && a.idleSpot === s) a.idleUntil = now + 7000 + Math.random() * 9000;
  }

  private retarget(a: Actor, want: Spot, snap: boolean) {
    const w = this.world!;
    if (a.target && a.target !== want && a.target.occupant === a.key && a.target !== a.idleSpot) a.target.occupant = null;
    if (want.kind !== "deskA" && want.kind !== "deskB") want.occupant = a.key;
    a.target = want;
    if (snap) {
      a.path = [];
      a.at = want;
      a.x = want.x;
      a.y = want.y;
      a.dir = want.dir;
      if (a.worker.state === "idle") a.idleUntil = performance.now() + 4000 + Math.random() * 8000;
      return;
    }
    const pts: PathPt[] = [];
    let startNode: number;
    if (a.path.length) {
      const next = a.path[0];
      pts.push(next);
      startNode = next.node;
      if (w.nodes[startNode] && (w.nodes[startNode].x !== next.x || w.nodes[startNode].y !== next.y)) pts.push({ ...w.nodes[startNode], node: startNode });
    } else if (a.at) {
      // stand up: leave the seat back to its node
      for (const v of [...a.at.via].reverse()) pts.push({ ...v, node: a.at.node });
      startNode = a.at.node;
      pts.push({ x: w.nodes[startNode].x, y: w.nodes[startNode].y, node: startNode });
    } else {
      startNode = want.node;
    }
    a.at = null;
    const ids = route(w, startNode, want.node);
    for (const id of ids.slice(1)) pts.push({ x: w.nodes[id].x, y: w.nodes[id].y, node: id });
    for (const v of want.via) pts.push({ ...v, node: want.node });
    pts.push({ x: want.x, y: want.y, node: want.node });
    a.path = pts;
  }
}
