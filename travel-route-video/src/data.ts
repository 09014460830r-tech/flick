import {geoDistance, geoInterpolate} from 'd3-geo';

export type Mode = 'plane' | 'bus' | 'jeep';
export type LabelSide = 'top' | 'bottom' | 'left' | 'right';

export type City = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  side: LabelSide;
  // Minor cities sit inside the Karakoram cluster: their labels fade out in wide views.
  minor?: boolean;
};

// Coordinates: city centres (WGS84, decimal degrees).
export const CITIES: Record<string, City> = {
  osaka: {id: 'osaka', name: '大阪', lon: 135.5023, lat: 34.6937, side: 'bottom'},
  seoul: {id: 'seoul', name: 'ソウル', lon: 126.978, lat: 37.5665, side: 'top'},
  urumqi: {id: 'urumqi', name: 'ウルムチ', lon: 87.6168, lat: 43.8256, side: 'top'},
  kashgar: {id: 'kashgar', name: 'カシュガル', lon: 75.9898, lat: 39.4704, side: 'right'},
  tashkurgan: {id: 'tashkurgan', name: 'タシュクルガン', lon: 75.2269, lat: 37.7726, side: 'right', minor: true},
  karimabad: {id: 'karimabad', name: 'カリマバード', lon: 74.664, lat: 36.3236, side: 'right', minor: true},
  minapin: {id: 'minapin', name: 'ミナピン', lon: 74.5965, lat: 36.177, side: 'left', minor: true},
  gilgit: {id: 'gilgit', name: 'ギルギット', lon: 74.3089, lat: 35.9208, side: 'left', minor: true},
  fairy: {id: 'fairy', name: 'フェアリーメドウズ', lon: 74.5969, lat: 35.4213, side: 'bottom', minor: true},
  skardu: {id: 'skardu', name: 'スカルドゥ', lon: 75.6333, lat: 35.2971, side: 'top', minor: true},
  islamabad: {id: 'islamabad', name: 'イスラマバード', lon: 73.0479, lat: 33.6844, side: 'left'},
  doha: {id: 'doha', name: 'ドーハ', lon: 51.531, lat: 25.2854, side: 'bottom'},
};

// Peaks drawn as decorative landmarks in the mountain close-up.
export const PEAKS = [
  {name: 'ムスターグ・アタ', lon: 75.1167, lat: 38.2753},
  {name: 'ナンガ・パルバット', lon: 74.5892, lat: 35.2375},
  {name: 'K2', lon: 76.5133, lat: 35.8825},
];

const LEGS: [string, string, Mode][] = [
  ['osaka', 'seoul', 'plane'],
  ['seoul', 'urumqi', 'plane'],
  ['urumqi', 'kashgar', 'plane'],
  ['kashgar', 'tashkurgan', 'bus'],
  ['tashkurgan', 'karimabad', 'bus'],
  ['karimabad', 'minapin', 'bus'],
  ['minapin', 'gilgit', 'bus'],
  ['gilgit', 'fairy', 'jeep'],
  ['fairy', 'gilgit', 'jeep'],
  ['gilgit', 'skardu', 'bus'],
  ['skardu', 'islamabad', 'plane'],
  ['islamabad', 'doha', 'plane'],
  ['doha', 'osaka', 'plane'],
];

export type LonLat = [number, number];

export type Leg = {
  index: number;
  from: City;
  to: City;
  mode: Mode;
  km: number;
  points: LonLat[]; // sampled path (great circle for flights, straight for land)
};

const EARTH_KM = 6371;
const SAMPLES = 160;

export const LEG_DATA: Leg[] = LEGS.map(([a, b, mode], index) => {
  const from = CITIES[a];
  const to = CITIES[b];
  const A: LonLat = [from.lon, from.lat];
  const B: LonLat = [to.lon, to.lat];
  const km = geoDistance(A, B) * EARTH_KM;
  const points: LonLat[] = [];
  if (mode === 'plane') {
    const gc = geoInterpolate(A, B);
    for (let i = 0; i <= SAMPLES; i++) points.push(gc(i / SAMPLES) as LonLat);
  } else {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      points.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
  }
  return {index, from, to, mode, km, points};
});

export const TOTAL_KM = LEG_DATA.reduce((s, l) => s + l.km, 0);

export const MODE_LABEL: Record<Mode, string> = {
  plane: '飛行機',
  bus: 'バス',
  jeep: 'ジープ',
};
