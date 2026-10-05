// Sholat routine: when a prayer window opens (or "Preview sholat" is pressed) every worker
// leaves their desk -> takes off shoes at the shoe rack -> wudhu (queued over the taps) ->
// takes a mat (men in front, women behind the hijab divider) -> prays in sync -> walks back
// via the shoe rack -> returns to their desk. The schedule is a pure function of the
// elapsed time, so joining mid-window drops everyone into the right phase.
import type { Spot, World } from "./world";

export type PrayerName = "subuh" | "dzuhur" | "ashar" | "maghrib" | "isya";
export const RAKAAT: Record<PrayerName, number> = { subuh: 2, dzuhur: 4, ashar: 4, maghrib: 3, isya: 4 };

export interface SholatPlan {
  name: PrayerName;
  start: number; // epoch ms
  end: number; // epoch ms
  preview?: boolean;
}

interface Step {
  pose: string;
  at: number; // seconds from prayer start
  dur: number;
}

export function prayerSteps(rakaat: number): Step[] {
  const out: Step[] = [];
  let t = 0;
  const add = (pose: string, dur: number) => {
    out.push({ pose, at: t, dur });
    t += dur;
  };
  for (let r = 1; r <= rakaat; r++) {
    if (r === 1) add("takbir", 3.5);
    add("qiyam_b", r === 1 ? 6 : 4.5);
    add("ruku", 4);
    add("itidal", 3.5);
    add("sujud", 4.5);
    add("duduk", 3.5);
    add("sujud", 4.5);
    if (r === 2 || r === rakaat) add("tahiyat", r === rakaat ? 9 : 7);
    else add("qiyam_b", 0.01);
  }
  add("salam_right", 3);
  add("salam_left", 3);
  add("dua", 8);
  return out;
}

export interface Timeline {
  k: number; // time scale (<= 1) so everything fits in the window
  shoeAt: number;
  wudhuAt: number;
  wudhuGap: number;
  wudhuDur: number;
  prayAt: number;
  steps: Step[];
  prayEnd: number;
  shoesOnAt: number;
  doneAt: number;
}

const SHOE_AT = 26;
const WUDHU_AT = 34;
const WUDHU_GAP = 12;
const WUDHU_DUR = 8;

export function timeline(plan: SholatPlan, n: number, basins: number): Timeline {
  const waves = Math.max(1, Math.ceil(n / Math.max(1, basins)));
  const prayAt = WUDHU_AT + (waves - 1) * WUDHU_GAP + 4 + WUDHU_DUR + 16;
  const steps = prayerSteps(RAKAAT[plan.name] ?? 4);
  const last = steps[steps.length - 1];
  const prayEnd = prayAt + last.at + last.dur;
  const shoesOnAt = prayEnd + 16;
  const doneAt = shoesOnAt + 6;
  const windowS = Math.max(60, (plan.end - plan.start) / 1000);
  const k = Math.min(1, (windowS * 0.95) / doneAt);
  return { k, shoeAt: SHOE_AT, wudhuAt: WUDHU_AT, wudhuGap: WUDHU_GAP, wudhuDur: WUDHU_DUR, prayAt, steps, prayEnd, shoesOnAt, doneAt };
}

export interface Participant {
  key: string;
  female: boolean;
  role: string;
  /** worker belongs to the active project's room */
  active: boolean;
}

const ROLE_ORDER = ["project-manager", "analyst", "uiux", "frontend", "backend", "infra"];

/** Imam: the active project's PM if male, otherwise the first male worker by role order. */
export function pickImam(ps: Participant[]): Participant | null {
  const men = ps.filter((p) => !p.female);
  if (!men.length) return null;
  return (
    men.find((p) => p.role === "project-manager" && p.active) ??
    [...men].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.key.localeCompare(b.key))[0]
  );
}

/** Back-view frame (qibla is up, so we see everyone from behind). */
function backPose(step: string, sinceStep: number): { pose: string; flip?: boolean; bob?: number } {
  switch (step) {
    case "takbir":
      return { pose: "stand_back", bob: Math.floor(sinceStep * 3) % 2 };
    case "qiyam_b":
    case "itidal":
      return { pose: "stand_back" };
    case "ruku":
      return { pose: "ruku" };
    case "sujud":
      return { pose: "sujud" };
    case "salam_right":
      return { pose: "sit_back", flip: sinceStep < 1.6 };
    case "salam_left":
      return { pose: "sit_back" };
    default:
      return { pose: "sit_back" }; // duduk, tahiyat, dua (composed back view)
  }
}

export interface Directive {
  spot: Spot;
  /** atlas sholat pose to show once arrived (null = normal standing/walking frame) */
  pose: string | null;
  flip?: boolean;
  /** 1px vertical bob (takbir) */
  bob?: number;
  phase: "toShoes" | "shoes" | "toWudhu" | "wudhu" | "toMat" | "pray" | "back" | "shoesOn";
}

/**
 * Where should participant `p` be, and in what posture, at `now`?
 * Returns null once the routine is over (back to normal behaviour).
 */
export function directive(w: World, plan: SholatPlan, tl: Timeline, ps: Participant[], p: Participant, now: number, reduced: boolean): Directive | null {
  const m = w.mushola;
  if (!m) return null;
  const t = (now - plan.start) / 1000 / tl.k; // unscaled seconds
  if (t < 0 || t >= tl.doneAt || now >= plan.end) return null;
  const i = ps.indexOf(p);
  const imamP = pickImam(ps);
  const men = ps.filter((x) => !x.female && x !== imamP);
  const women = ps.filter((x) => x.female);
  const isImam = p === imamP;
  // no men (e.g. "All female"): no imam row, the women's rows start at the front
  const womenMats = imamP ? m.female : m.male;
  const mat = isImam ? m.imam : p.female ? womenMats[women.indexOf(p) % Math.max(1, womenMats.length)] : m.male[men.indexOf(p) % Math.max(1, m.male.length)];
  const shoe = m.shoes.length ? m.shoes[i % m.shoes.length] : mat;
  const basin = m.wudhu.length ? m.wudhu[i % m.wudhu.length] : mat;
  const wave = m.wudhu.length ? Math.floor(i / m.wudhu.length) : 0;
  const wStart = tl.wudhuAt + wave * tl.wudhuGap;

  // the imam moves to each posture ~0.5 s ahead of the jamaah
  const prayDir = (): Omit<Directive, "spot" | "phase"> => {
    const pt = t - tl.prayAt + (isImam ? 0.5 : 0);
    if (pt < 0) return { pose: "stand_back" };
    let cur = tl.steps[0];
    for (const s of tl.steps) if (pt >= s.at) cur = s;
    return backPose(cur.pose, pt - cur.at);
  };

  if (reduced) {
    // no walking: everyone is already on their mat; postures still change
    return { spot: mat, ...(t >= tl.prayAt && t < tl.prayEnd ? prayDir() : { pose: "stand_back" }), phase: "pray" };
  }
  if (t < tl.shoeAt) return { spot: shoe, pose: "stand_0", phase: "toShoes" };
  if (t < wStart) {
    const st = t - tl.shoeAt;
    const pose = st < 2.5 ? "remove_shoes" : st < 3.2 ? "stand_0" : st < 5.5 ? "store_shoes" : "stand_back";
    return { spot: shoe, pose, phase: "shoes" };
  }
  if (t < wStart + 4 + tl.wudhuDur) {
    const inWudhu = t >= wStart + 4;
    return { spot: basin, pose: inWudhu ? "wudhu" : "stand_0", flip: basin.flip, phase: inWudhu ? "wudhu" : "toWudhu" };
  }
  if (t < tl.prayEnd) return { spot: mat, ...prayDir(), phase: t < tl.prayAt ? "toMat" : "pray" };
  if (t < tl.shoesOnAt) return { spot: shoe, pose: "stand_after_a", phase: "back" };
  const st = t - tl.shoesOnAt;
  return { spot: shoe, pose: st < 2.5 ? "store_shoes" : "remove_shoes", phase: "shoesOn" };
}

export function planProgress(plan: SholatPlan, now: number): number {
  return Math.max(0, Math.min(1, (now - plan.start) / Math.max(1, plan.end - plan.start)));
}
