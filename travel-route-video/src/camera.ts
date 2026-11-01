import {interpolateZoom} from 'd3-interpolate';
import {Easing, interpolate} from 'remotion';
import {CITIES, LEG_DATA, LonLat} from './data';
import {TIMINGS, OUTRO_START, TOTAL_FRAMES} from './timeline';

export const W = 1920;
export const H = 1080;

// World space = raw Web Mercator in radians. A view is [centerX, centerY, widthInWorldUnits],
// which is exactly the format d3.interpolateZoom (van Wijk smooth zoom) works with.
export type View = [number, number, number];

const rad = Math.PI / 180;
export const toWorld = ([lon, lat]: LonLat): [number, number] => [
  lon * rad,
  -Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2)),
];

type Pad = {top: number; right: number; bottom: number; left: number};

const fit = (pts: LonLat[], pad: Pad): View => {
  const ws = pts.map(toWorld);
  const xs = ws.map((p) => p[0]);
  const ys = ws.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const availW = W - pad.left - pad.right;
  const availH = H - pad.top - pad.bottom;
  const scale = Math.min(availW / Math.max(x1 - x0, 1e-6), availH / Math.max(y1 - y0, 1e-6));
  // centre of the padded box, mapped back to world units
  const cxScreen = pad.left + availW / 2;
  const cyScreen = pad.top + availH / 2;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const cx = mx + (W / 2 - cxScreen) / scale;
  const cy = my + (H / 2 - cyScreen) / scale;
  return [cx, cy, W / scale];
};

const at = (lon: number, lat: number, widthDeg: number): View => {
  const [x, y] = toWorld([lon, lat]);
  return [x, y, widthDeg * rad];
};

const P = (...ids: string[]): LonLat[] => ids.map((id) => [CITIES[id].lon, CITIES[id].lat]);
const allPoints = LEG_DATA.flatMap((l) => l.points);

const WIDE_EAST = at(121, 38, 42);
const WIDE_WEST = at(88, 39.2, 42);
const MTN_1 = fit(P('kashgar', 'tashkurgan', 'karimabad'), {top: 150, right: 520, bottom: 110, left: 520});
const MTN_2 = fit(P('tashkurgan', 'karimabad', 'gilgit'), {top: 170, right: 560, bottom: 150, left: 560});
const MTN_3 = fit(P('karimabad', 'minapin', 'gilgit', 'fairy', 'skardu'), {top: 270, right: 330, bottom: 170, left: 520});
const BACK_WIDE = fit(P('kashgar', 'islamabad', 'doha', 'urumqi'), {top: 170, right: 220, bottom: 140, left: 220});
const OVERVIEW = fit(allPoints, {top: 150, right: 150, bottom: 150, left: 150});
const FINAL = fit(allPoints, {top: 120, right: 170, bottom: 270, left: 170});

type Shot = {from: number; to: number; a: View; b: View};
const mid = (i: number, f: number) => TIMINGS[i].start + TIMINGS[i].duration * f;

// Legs (0-based): 0 KIX-SEL, 1 SEL-URC, 2 URC-KHG, 3 KHG-TXK, 4 TXK-KRM, 5 KRM-MNP,
// 6 MNP-GIL, 7 GIL-FM, 8 FM-GIL, 9 GIL-KDU, 10 KDU-ISB, 11 ISB-DOH, 12 DOH-KIX
const SHOTS: Shot[] = [
  {from: 0, to: TIMINGS[2].end - 4, a: WIDE_EAST, b: WIDE_WEST}, // slow pan over the long flights
  {from: TIMINGS[2].end - 4, to: mid(3, 0.75), a: WIDE_WEST, b: MTN_1}, // dive into the mountains
  {from: mid(3, 0.75), to: TIMINGS[4].end + 4, a: MTN_1, b: MTN_2},
  {from: TIMINGS[4].end + 4, to: mid(5, 1), a: MTN_2, b: MTN_3},
  {from: TIMINGS[9].end, to: TIMINGS[11].start + 6, a: MTN_3, b: BACK_WIDE}, // pull back out
  {from: mid(11, 0.6), to: mid(12, 0.45), a: BACK_WIDE, b: OVERVIEW},
  {from: OUTRO_START - 6, to: TOTAL_FRAMES - 30, a: OVERVIEW, b: FINAL},
];

const ease = Easing.bezier(0.45, 0, 0.55, 1);

export const cameraAt = (frame: number): View => {
  let view = SHOTS[0].a;
  for (const s of SHOTS) {
    if (frame < s.from) break;
    const t = ease(interpolate(frame, [s.from, s.to], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
    view = interpolateZoom(s.a, s.b)(t) as View;
  }
  return view;
};

export const widthDeg = (v: View) => v[2] / rad;
