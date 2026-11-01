import {LEG_DATA} from './data';

export const FPS = 30;
export const INTRO = 24; // map appears, Osaka pin pops
export const DWELL = 8; // pause at each arrival while the pin pops
export const OUTRO = 102; // final overview
export const TOTAL_FRAMES = 600; // 20 s

// Raw pacing weight per leg: grows sub-linearly with distance, so long flights
// move fast; land legs get a big base so the mountain section stays slow.
const weight = (km: number, land: boolean) =>
  land ? 34 + 7 * Math.sqrt(km / 100) : 20 + 5 * Math.sqrt(km / 100);

const travelBudget = TOTAL_FRAMES - INTRO - OUTRO - DWELL * LEG_DATA.length;
const raw = LEG_DATA.map((l) => weight(l.km, l.mode !== 'plane'));
const rawSum = raw.reduce((a, b) => a + b, 0);

let cursor = INTRO;
const durations = raw.map((r) => Math.round((r / rawSum) * travelBudget));
// Fix rounding so the last frame lines up exactly.
durations[durations.length - 1] += travelBudget - durations.reduce((a, b) => a + b, 0);

export type LegTiming = {start: number; end: number; duration: number};
export const TIMINGS: LegTiming[] = durations.map((d) => {
  const t = {start: cursor, end: cursor + d, duration: d};
  cursor += d + DWELL;
  return t;
});

export const OUTRO_START = TIMINGS[TIMINGS.length - 1].end + DWELL;
