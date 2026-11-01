import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import {geoGraticule, geoMercator, geoPath} from 'd3-geo';
import {useEffect, useState} from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {feature} from 'topojson-client';
import landTopo from 'world-atlas/land-50m.json';
import {cameraAt, H, View, W, widthDeg} from './camera';
import {CITIES, City, LEG_DATA, Leg, LonLat, MODE_LABEL, PEAKS, TOTAL_KM} from './data';
import {ModeIcon} from './icons';
import {OUTRO_START, TIMINGS} from './timeline';

const FONT = '"M PLUS Rounded 1c", sans-serif';

const C = {
  ocean: '#E6D6BA',
  land: '#FAF4E8',
  landEdge: '#D3BE98',
  grid: '#DCCAAB',
  plane: '#E2583E',
  land_: '#1F8A7E',
  ink: '#3B3128',
  sub: '#8C7B68',
  card: '#FFFDF8',
};
const modeColor = (l: Leg) => (l.mode === 'plane' ? C.plane : C.land_);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LAND_RAW = feature(landTopo as any, (landTopo as any).objects.land) as any;
// Drop Antarctica: under Mercator it reaches infinity and makes the clipped fill invert.
const LAND = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'MultiPolygon',
    coordinates: (LAND_RAW.features?.[0]?.geometry ?? LAND_RAW.geometry).coordinates.filter(
      (poly: number[][][]) => Math.max(...poly[0].map((c) => c[1])) > -60,
    ),
  },
} as any;
const GRATICULE = geoGraticule().step([5, 5])();

// Base map is projected once into world space (Mercator, scale = BASE) and then
// placed with an SVG transform per frame — cheaper and avoids clipping artefacts.
const BASE = 1000;
const baseProj = geoMercator().scale(BASE).translate([0, 0]);
const basePath = geoPath(baseProj).digits(3);
const LAND_D = basePath(LAND) ?? '';
const GRID_D = basePath(GRATICULE) ?? '';

const ALL_TEXT =
  Object.values(CITIES).map((c) => c.name).join('') +
  PEAKS.map((p) => p.name).join('') +
  '飛行機バスジープ約kmLEG出発到着旅のルート全区間総移動距離陸路→0123456789,・';

const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all(
      ['500', '700', '800'].map((w) => document.fonts.load(`${w} 40px "M PLUS Rounded 1c"`, ALL_TEXT)),
    )
      .then(() => document.fonts.ready)
      .then(() => continueRender(handle));
  }, [handle]);
};

const makeProjection = (v: View) => {
  const s = W / v[2];
  return geoMercator()
    .scale(s)
    .translate([W / 2 - s * v[0], H / 2 - s * v[1]])
    .clipExtent([
      [-80, -80],
      [W + 80, H + 80],
    ]);
};

type XY = [number, number];

// Partial polyline along a leg's samples; returns path + tip position + heading (deg, 0 = up).
const partial = (pts: XY[], t: number) => {
  const n = pts.length - 1;
  const f = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const r = f - i;
  const tip: XY = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
  const drawn = [...pts.slice(0, i + 1), tip];
  const d = 'M' + drawn.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L');
  const a = pts[Math.max(0, i)];
  const b = pts[Math.min(n, i + 1)];
  const heading = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
  return {d, tip, heading};
};

const legProgress = (frame: number, i: number) =>
  Easing.bezier(0.42, 0, 0.5, 1)(
    interpolate(frame, [TIMINGS[i].start, TIMINGS[i].end], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

// First frame each city's pin appears, plus every arrival frame (for pulses).
const FIRST_ARRIVAL: Record<string, number> = {osaka: 6};
const ARRIVALS: {city: City; frame: number}[] = [{city: CITIES.osaka, frame: 6}];
LEG_DATA.forEach((l, i) => {
  ARRIVALS.push({city: l.to, frame: TIMINGS[i].end});
  if (FIRST_ARRIVAL[l.to.id] === undefined) FIRST_ARRIVAL[l.to.id] = TIMINGS[i].end;
});

const Pin: React.FC<{x: number; y: number; scale: number; color: string}> = ({x, y, scale, color}) => (
  <g transform={`translate(${x},${y}) scale(${scale})`}>
    <ellipse cx={0} cy={1} rx={9} ry={3.5} fill="rgba(60,40,20,0.18)" />
    <path
      d="M0,0 C-4,-9 -15,-16 -15,-29 A15,15 0 1 1 15,-29 C15,-16 4,-9 0,0 Z"
      fill={color}
      stroke="#fff"
      strokeWidth={3}
    />
    <circle cx={0} cy={-29} r={6} fill="#fff" />
  </g>
);

const CityLabel: React.FC<{city: City; x: number; y: number; scale: number; opacity: number}> = ({
  city,
  x,
  y,
  scale,
  opacity,
}) => {
  const anchor: Record<City['side'], {left: number; top: number; tx: string; origin: string}> = {
    top: {left: x, top: y - 54, tx: 'translate(-50%,-100%)', origin: '50% 100%'},
    bottom: {left: x, top: y + 14, tx: 'translate(-50%,0)', origin: '50% 0%'},
    left: {left: x - 26, top: y - 29, tx: 'translate(-100%,-50%)', origin: '100% 50%'},
    right: {left: x + 26, top: y - 29, tx: 'translate(0,-50%)', origin: '0% 50%'},
  };
  const a = anchor[city.side];
  return (
    <div
      style={{
        position: 'absolute',
        left: a.left,
        top: a.top,
        transform: `${a.tx} scale(${scale})`,
        transformOrigin: a.origin,
        opacity,
        background: C.card,
        color: C.ink,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: 30,
        lineHeight: 1,
        padding: '12px 22px 13px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        boxShadow: '0 6px 18px rgba(80,55,30,0.18)',
        letterSpacing: '0.02em',
      }}
    >
      {city.name}
    </div>
  );
};

export const TravelRoute: React.FC = () => {
  useFonts();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const view = cameraAt(frame);
  const proj = makeProjection(view);
  const project = (p: LonLat): XY => proj(p) as XY;
  const zoomDeg = widthDeg(view);

  const intro = interpolate(frame, [0, 18], [0, 1], {extrapolateRight: 'clamp'});

  // ---- route lines
  const lines = LEG_DATA.map((leg, i) => {
    if (frame < TIMINGS[i].start) return null;
    const pts = leg.points.map(project);
    const t = legProgress(frame, i);
    return {leg, i, t, ...partial(pts, t)};
  }).filter(Boolean) as (ReturnType<typeof partial> & {leg: Leg; i: number; t: number})[];

  // ---- current vehicle
  const currentIdx = (() => {
    let idx = -1;
    TIMINGS.forEach((t, i) => {
      if (frame >= t.start - 4) idx = i;
    });
    return idx;
  })();
  let vehicle: {x: number; y: number; scale: number; leg: Leg; heading: number} | null = null;
  if (currentIdx >= 0) {
    const leg = LEG_DATA[currentIdx];
    const tm = TIMINGS[currentIdx];
    const line = lines.find((l) => l.i === currentIdx);
    const [x, y] = line ? line.tip : project([leg.from.lon, leg.from.lat]);
    const popIn = spring({frame: frame - (tm.start - 4), fps, config: {damping: 11, stiffness: 200}});
    const popOut = interpolate(frame, [tm.end - 3, tm.end + 5], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.in(Easing.back(2)),
    });
    vehicle = {x, y, scale: Math.max(0, Math.min(popIn, popOut)), leg, heading: line?.heading ?? 0};
  }

  // ---- header card (current leg)
  const headerIdx = currentIdx;
  const headerChange = headerIdx >= 0 ? TIMINGS[headerIdx].start - 4 : 0;
  const headerT = spring({frame: frame - headerChange, fps, config: {damping: 14, stiffness: 160}});
  const headerOut = interpolate(frame, [OUTRO_START - 4, OUTRO_START + 10], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ---- outro
  const outroT = spring({frame: frame - (OUTRO_START + 14), fps, config: {damping: 15, stiffness: 120}});

  return (
    <AbsoluteFill style={{background: C.ocean, fontFamily: FONT}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: intro}}>
        <defs>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#6b4e2e" floodOpacity="0.18" />
          </filter>
        </defs>
        <g transform={`translate(${W / 2 - (W / view[2]) * view[0]},${H / 2 - (W / view[2]) * view[1]}) scale(${W / view[2] / BASE})`}>
          <path d={GRID_D} fill="none" stroke={C.grid} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path
            d={LAND_D}
            fill={C.land}
            stroke={C.landEdge}
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* peaks: only in close-ups */}
        {PEAKS.map((pk) => {
          const o = interpolate(zoomDeg, [5, 9], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          if (o <= 0) return null;
          const [x, y] = project([pk.lon, pk.lat]);
          return (
            <g key={pk.name} opacity={o * 0.9} transform={`translate(${x},${y})`}>
              <path d="M-26,10 L-6,-18 L2,-7 L8,-14 L26,10 Z" fill="#CDB993" />
              <path d="M-6,-18 L-11.5,-10 L-7,-11 L-3,-8 L0,-10.5 Z" fill="#FFFDF8" />
              <text
                y={36}
                textAnchor="middle"
                fontFamily={FONT}
                fontWeight={700}
                fontSize={21}
                fill="#A08C70"
              >
                {pk.name}
              </text>
            </g>
          );
        })}

        {/* route */}
        {lines.map(({leg, d, i}) =>
          leg.mode === 'plane' ? (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={modeColor(leg)}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="0.1 19"
            />
          ) : (
            <g key={i}>
              <path d={d} fill="none" stroke="#FFFDF8" strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke={modeColor(leg)} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ),
        )}

        {/* arrival pulses */}
        {ARRIVALS.map(({city, frame: f}, k) => {
          const p = (frame - f) / 22;
          if (p < 0 || p > 1) return null;
          const [x, y] = project([city.lon, city.lat]);
          return (
            <circle
              key={k}
              cx={x}
              cy={y}
              r={10 + 46 * Easing.out(Easing.cubic)(p)}
              fill="none"
              stroke={C.plane}
              strokeWidth={4 * (1 - p)}
              opacity={1 - p}
            />
          );
        })}

        {/* pins */}
        {Object.values(CITIES).map((city) => {
          const f0 = FIRST_ARRIVAL[city.id];
          if (f0 === undefined || frame < f0) return null;
          const s = spring({frame: frame - f0, fps, config: {damping: 8, stiffness: 220, mass: 0.7}});
          const [x, y] = project([city.lon, city.lat]);
          const small = city.minor
            ? interpolate(zoomDeg, [9, 15], [1, 0.62], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
            : 1;
          return <Pin key={city.id} x={x} y={y} scale={s * small} color={C.plane} />;
        })}
      </svg>

      {/* city labels */}
      {Object.values(CITIES).map((city) => {
        const f0 = FIRST_ARRIVAL[city.id];
        if (f0 === undefined || frame < f0 + 3) return null;
        const s = spring({frame: frame - f0 - 3, fps, config: {damping: 10, stiffness: 180}});
        const zoomFade = city.minor
          ? interpolate(zoomDeg, [9, 15], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
          : 1;
        if (zoomFade <= 0) return null;
        const [x, y] = project([city.lon, city.lat]);
        return (
          <CityLabel
            key={city.id}
            city={city}
            x={x}
            y={y}
            scale={s * (0.85 + 0.15 * zoomFade)}
            opacity={Math.min(1, s * 1.5) * zoomFade}
          />
        );
      })}

      {/* vehicle */}
      {vehicle && vehicle.scale > 0.001 && (
        <div
          style={{
            position: 'absolute',
            left: vehicle.x,
            top: vehicle.y,
            width: 66,
            height: 66,
            transform: `translate(-50%,-50%) scale(${vehicle.scale})`,
            borderRadius: 999,
            background: '#fff',
            border: `4px solid ${modeColor(vehicle.leg)}`,
            boxShadow: '0 8px 20px rgba(80,55,30,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          <ModeIcon
            mode={vehicle.leg.mode}
            size={38}
            color={modeColor(vehicle.leg)}
            rotate={vehicle.leg.mode === 'plane' ? vehicle.heading : 0}
          />
        </div>
      )}

      {/* header */}
      <Header frame={frame} idx={headerIdx} t={headerT} opacity={intro * headerOut} />

      {/* outro */}
      {frame >= OUTRO_START && <Outro t={outroT} />}
    </AbsoluteFill>
  );
};

const Header: React.FC<{frame: number; idx: number; t: number; opacity: number}> = ({idx, t, opacity}) => {
  const leg = idx >= 0 ? LEG_DATA[idx] : null;
  const color = leg ? modeColor(leg) : C.plane;
  return (
    <div
      style={{
        position: 'absolute',
        left: 56,
        top: 48,
        opacity,
        background: C.card,
        borderRadius: 28,
        padding: '22px 30px 24px',
        boxShadow: '0 10px 30px rgba(80,55,30,0.16)',
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        fontFamily: FONT,
        color: C.ink,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${0.6 + 0.4 * t})`,
        }}
      >
        <ModeIcon mode={leg ? leg.mode : "plane"} size={38} color="#fff" rotate={!leg || leg.mode === "plane" ? 90 : 0} />
      </div>
      <div style={{opacity: t, transform: `translateY(${(1 - t) * 14}px)`}}>
        <div style={{fontSize: 20, fontWeight: 700, color: C.sub, letterSpacing: '0.08em'}}>
          {leg ? `LEG ${String(idx + 1).padStart(2, '0')} / ${LEG_DATA.length}　${MODE_LABEL[leg.mode]}・約${Math.round(leg.km / 10) * 10 >= 1000 ? Math.round(leg.km / 10) * 10 : Math.round(leg.km / 5) * 5}km` : '出発'}
        </div>
        <div style={{fontSize: 40, fontWeight: 800, marginTop: 6, letterSpacing: '0.02em'}}>
          {leg ? `${leg.from.name} → ${leg.to.name}` : '大阪'}
        </div>
      </div>
    </div>
  );
};

const Outro: React.FC<{t: number}> = ({t}) => {
  const km = Math.round(TOTAL_KM / 10) * 10;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 60,
        transform: `translate(-50%, ${(1 - t) * 60}px)`,
        opacity: Math.min(1, t * 1.4),
        background: C.card,
        borderRadius: 36,
        padding: '26px 48px 28px',
        boxShadow: '0 14px 40px rgba(80,55,30,0.2)',
        fontFamily: FONT,
        color: C.ink,
        display: 'flex',
        alignItems: 'center',
        gap: 44,
        whiteSpace: 'nowrap',
      }}
    >
      <div>
        <div style={{fontSize: 22, fontWeight: 700, color: C.sub, letterSpacing: '0.1em'}}>旅のルート・全{LEG_DATA.length}区間</div>
        <div style={{fontSize: 46, fontWeight: 800, marginTop: 6}}>
          総移動距離 約{km.toLocaleString('en-US')}km
        </div>
      </div>
      <div style={{width: 3, alignSelf: 'stretch', background: '#EADFCC', borderRadius: 2}} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 14, fontSize: 24, fontWeight: 700}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <svg width={70} height={14}>
            <line x1={7} y1={7} x2={66} y2={7} stroke={C.plane} strokeWidth={9} strokeLinecap="round" strokeDasharray="0.1 19" />
          </svg>
          飛行機
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <svg width={70} height={14}>
            <line x1={7} y1={7} x2={63} y2={7} stroke={C.land_} strokeWidth={8} strokeLinecap="round" />
          </svg>
          陸路（バス・ジープ）
        </div>
      </div>
    </div>
  );
};

