/**
 * Графік на «міліметрівці» (власний легкий SVG, без сторонніх бібліотек).
 *
 * Уміє: кілька серій точок (з'єднаних лінією чи ні), прямі (напр. результат МНК),
 * лінійні та логарифмічні осі, підказку з координатами при наведенні.
 * Точки беруться з таблиці вимірювань — тобто студент бачить графік саме своїх даних.
 */
import { useId, useMemo, useRef, useState } from 'react';
import { formatNum } from '@/core/format';

export interface PlotPoint {
  x: number;
  y: number;
}

export interface PlotSeries {
  id: string;
  label: string;
  points: PlotPoint[];
  color?: string;
  /** З'єднати точки ламаною (у порядку зростання x). */
  line?: boolean;
  marker?: 'circle' | 'square' | 'triangle' | 'diamond';
}

export interface PlotLine {
  /** y = slope·x + intercept (в лінійних координатах осей; для лог-осей — у lg-координатах). */
  slope: number;
  intercept: number;
  label?: string;
  color?: string;
  /** Проміжок x, на якому малювати пряму (за замовчуванням — вся вісь). */
  xFrom?: number;
  xTo?: number;
}

interface Props {
  series: PlotSeries[];
  lines?: PlotLine[];
  xLabel: string;
  yLabel: string;
  xLog?: boolean;
  yLog?: boolean;
  /** Фіксовані межі осей (інакше — автоматично за даними). */
  xDomain?: [number, number];
  yDomain?: [number, number];
  /** Включати нуль в автоматичні межі осі. */
  xZero?: boolean;
  yZero?: boolean;
  height?: number;
  ariaLabel?: string;
}

export const PLOT_COLORS = ['#1f4e9c', '#e0531a', '#2a7548', '#8c5a2b', '#0f7c86', '#7a2e8e'];

const W = 640;
const M = { l: 64, r: 18, t: 16, b: 50 };

/** «Круглий» крок поділок: 1, 2, 2,5, 5 × 10ⁿ. */
function niceStep(span: number, count: number): number {
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * p;
}

interface Axis {
  toPx: (v: number) => number;
  ticks: number[];
  minor: number[];
  lo: number;
  hi: number;
  log: boolean;
}

function makeAxis(values: number[], log: boolean, fixed: [number, number] | undefined, zero: boolean, px0: number, px1: number, count: number): Axis {
  let lo: number;
  let hi: number;
  const vs = log ? values.filter((v) => v > 0).map(Math.log10) : values;
  if (fixed) {
    [lo, hi] = log ? [Math.log10(fixed[0]), Math.log10(fixed[1])] : fixed;
  } else if (vs.length === 0) {
    [lo, hi] = log ? [0, 1] : [0, 1];
  } else {
    lo = Math.min(...vs);
    hi = Math.max(...vs);
    if (zero && !log) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (hi - lo < 1e-12) {
      const d = Math.abs(hi) * 0.1 || 1;
      lo -= d;
      hi += d;
    }
    const pad = (hi - lo) * 0.06;
    if (!(zero && lo === 0)) lo -= pad;
    hi += pad;
    if (log) {
      lo = Math.floor(lo * 2) / 2;
      hi = Math.ceil(hi * 2) / 2;
    }
  }
  const ticks: number[] = [];
  const minor: number[] = [];
  if (log) {
    for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
      if (e >= lo - 1e-9 && e <= hi + 1e-9) ticks.push(e);
      for (let k = 2; k <= 9; k++) {
        const v = e + Math.log10(k);
        if (v > lo && v < hi) minor.push(v);
      }
    }
  } else {
    const step = niceStep(hi - lo, count);
    const first = Math.ceil(lo / step - 1e-9) * step;
    for (let v = first; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    const ms = step / 5;
    const mfirst = Math.ceil(lo / ms - 1e-9) * ms;
    for (let v = mfirst; v <= hi; v += ms) minor.push(v);
  }
  const toPx = (v: number) => px0 + ((v - lo) / (hi - lo)) * (px1 - px0);
  return { toPx, ticks, minor, lo, hi, log };
}

function Marker({ kind, x, y, color }: { kind: PlotSeries['marker']; x: number; y: number; color: string }) {
  const s = 4.5;
  switch (kind) {
    case 'square':
      return <rect x={x - s} y={y - s} width={2 * s} height={2 * s} fill={color} />;
    case 'triangle':
      return <path d={`M${x} ${y - s - 1} L${x + s + 1} ${y + s} L${x - s - 1} ${y + s} Z`} fill={color} />;
    case 'diamond':
      return <path d={`M${x} ${y - s - 1} L${x + s + 1} ${y} L${x} ${y + s + 1} L${x - s - 1} ${y} Z`} fill={color} />;
    default:
      return <circle cx={x} cy={y} r={s} fill={color} stroke="#fff" strokeWidth="1.2" />;
  }
}

export default function Plot({
  series,
  lines = [],
  xLabel,
  yLabel,
  xLog = false,
  yLog = false,
  xDomain,
  yDomain,
  xZero = false,
  yZero = false,
  height = 400,
  ariaLabel,
}: Props) {
  const H = height;
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ left: number; top: number; text: string } | null>(null);

  const { ax, ay } = useMemo(() => {
    const xs = series.flatMap((s) => s.points.map((p) => p.x));
    const ys = series.flatMap((s) => s.points.map((p) => p.y));
    return {
      ax: makeAxis(xs, xLog, xDomain, xZero, M.l, W - M.r, 8),
      ay: makeAxis(ys, yLog, yDomain, yZero, H - M.b, M.t, 6),
    };
  }, [series, xLog, yLog, xDomain, yDomain, xZero, yZero, H]);

  const X = (v: number) => ax.toPx(xLog ? Math.log10(v) : v);
  const Y = (v: number) => ay.toPx(yLog ? Math.log10(v) : v);
  const valid = (p: PlotPoint) => isFinite(p.x) && isFinite(p.y) && (!xLog || p.x > 0) && (!yLog || p.y > 0);
  const tickText = (v: number, log: boolean) => (log ? formatNum(10 ** v, 3) : formatNum(v, 4));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const k = W / rect.width;
    const mx = (e.clientX - rect.left) * k;
    const my = (e.clientY - rect.top) * k;
    let best: { d: number; p: PlotPoint; s: PlotSeries } | null = null;
    for (const s of series)
      for (const p of s.points) {
        if (!valid(p)) continue;
        const d = Math.hypot(X(p.x) - mx, Y(p.y) - my);
        if (d < 18 && (!best || d < best.d)) best = { d, p, s };
      }
    if (best) {
      setTip({
        left: X(best.p.x) / k,
        top: Y(best.p.y) / k,
        text: `${best.s.label}: x = ${formatNum(best.p.x, 4)}; y = ${formatNum(best.p.y, 4)}`,
      });
    } else setTip(null);
  };

  // useId — однаковий id на сервері й у браузері (Math.random зламав би гідратацію)
  const clipId = `plot-clip-${useId().replace(/:/g, '')}`;

  return (
    <div className="sim-plot">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel ?? `Графік: ${yLabel} від ${xLabel}`}
        onMouseMove={onMove}
        onMouseLeave={() => setTip(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} />
          </clipPath>
        </defs>
        {/* Міліметрівка: дрібна і основна сітка */}
        {ax.minor.map((v, i) => (
          <line key={`xm${i}`} x1={ax.toPx(v)} x2={ax.toPx(v)} y1={M.t} y2={H - M.b} stroke="var(--mm-minor)" />
        ))}
        {ay.minor.map((v, i) => (
          <line key={`ym${i}`} y1={ay.toPx(v)} y2={ay.toPx(v)} x1={M.l} x2={W - M.r} stroke="var(--mm-minor)" />
        ))}
        {ax.ticks.map((v, i) => (
          <g key={`xt${i}`}>
            <line x1={ax.toPx(v)} x2={ax.toPx(v)} y1={M.t} y2={H - M.b} stroke="var(--mm-mid)" />
            <text x={ax.toPx(v)} y={H - M.b + 18} textAnchor="middle" fontSize="12" fill="var(--ink-2)" fontFamily="var(--font-mono)">
              {tickText(v, ax.log)}
            </text>
          </g>
        ))}
        {ay.ticks.map((v, i) => (
          <g key={`yt${i}`}>
            <line y1={ay.toPx(v)} y2={ay.toPx(v)} x1={M.l} x2={W - M.r} stroke="var(--mm-mid)" />
            <text x={M.l - 8} y={ay.toPx(v) + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)" fontFamily="var(--font-mono)">
              {tickText(v, ay.log)}
            </text>
          </g>
        ))}
        {/* Осі через нуль (якщо нуль у межах) */}
        {!ax.log && ax.lo < 0 && ax.hi > 0 && (
          <line x1={ax.toPx(0)} x2={ax.toPx(0)} y1={M.t} y2={H - M.b} stroke="var(--ink-2)" strokeWidth="1.2" />
        )}
        {!ay.log && ay.lo < 0 && ay.hi > 0 && (
          <line y1={ay.toPx(0)} y2={ay.toPx(0)} x1={M.l} x2={W - M.r} stroke="var(--ink-2)" strokeWidth="1.2" />
        )}
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="none" stroke="var(--mm-major)" strokeWidth="1.4" />
        <text x={(M.l + W - M.r) / 2} y={H - 10} textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--ink)">
          {xLabel}
        </text>
        <text
          x={16}
          y={(M.t + H - M.b) / 2}
          textAnchor="middle"
          fontSize="14"
          fontWeight="600"
          fill="var(--ink)"
          transform={`rotate(-90 16 ${(M.t + H - M.b) / 2})`}
        >
          {yLabel}
        </text>

        <g clipPath={`url(#${clipId})`}>
          {lines.map((ln, i) => {
            const x0 = ln.xFrom ?? (ax.log ? 10 ** ax.lo : ax.lo);
            const x1 = ln.xTo ?? (ax.log ? 10 ** ax.hi : ax.hi);
            const f = (x: number) => ln.slope * x + ln.intercept;
            return (
              <line
                key={`ln${i}`}
                x1={X(x0)}
                x2={X(x1)}
                y1={ay.toPx(f(xLog ? Math.log10(x0) : x0))}
                y2={ay.toPx(f(xLog ? Math.log10(x1) : x1))}
                stroke={ln.color ?? 'var(--ink)'}
                strokeWidth="2"
                strokeDasharray="7 5"
              />
            );
          })}
          {series.map((s, si) => {
            const color = s.color ?? PLOT_COLORS[si % PLOT_COLORS.length]!;
            const pts = s.points.filter(valid);
            const sorted = s.line ? [...pts].sort((a, b) => a.x - b.x) : pts;
            return (
              <g key={s.id}>
                {s.line && sorted.length > 1 && (
                  <polyline
                    points={sorted.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                )}
                {pts.map((p, i) => (
                  <Marker key={i} kind={s.marker} x={X(p.x)} y={Y(p.y)} color={color} />
                ))}
              </g>
            );
          })}
        </g>
      </svg>
      {tip && (
        <div className="sim-plot__tip" style={{ left: tip.left, top: tip.top }}>
          {tip.text}
        </div>
      )}
      {(series.length > 1 || lines.some((l) => l.label)) && (
        <div className="sim-legend">
          {series.map((s, si) => (
            <span key={s.id}>
              <i style={{ background: s.color ?? PLOT_COLORS[si % PLOT_COLORS.length] }} />
              {s.label}
            </span>
          ))}
          {lines
            .filter((l) => l.label)
            .map((l, i) => (
              <span key={`l${i}`} style={{ color: l.color ?? 'var(--ink)' }}>
                <i className="sim-legend__line" />
                {l.label}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
