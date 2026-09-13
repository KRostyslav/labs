/**
 * Стрілковий (аналоговий) вимірювальний прилад: SVG-циферблат зі шкалою, стрілкою,
 * класом точності та перемикачем меж.
 *
 * Студент читає показ зі шкали (або з рядка «Відлік» під приладом, якщо showReadout).
 * Похибку приладу студент рахує сам: Δ = клас · межа / 100 (клас надруковано на шкалі).
 */
import { divisionValue, type AnalogSpec, type Reading } from '@/core/instruments';
import { formatFixed, formatNum } from '@/core/format';

interface Props {
  spec: AnalogSpec;
  rangeIdx: number;
  onRangeChange: (i: number) => void;
  /** null — прилад не під'єднано / немає живлення (стрілка на нулі). */
  reading: Reading | null;
  /** Позначення на схемі: «PA1», «PV1». */
  tag?: string;
  /** Показувати числовий відлік під шкалою (за замовчуванням так). */
  showReadout?: boolean;
}

// Геометрія циферблата у координатах viewBox 260×170
const CX = 130;
const CY = 158;
const R = 118;
const SWEEP = 46; // кут від вертикалі до краю шкали, градуси

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)] as const;
};

/** Крок підписів шкали: 5–7 «круглих» підписів на всю шкалу. */
function labelStep(max: number): number {
  const candidates = [1, 2, 2.5, 5].flatMap((m) => [-3, -2, -1, 0, 1, 2, 3].map((e) => m * 10 ** e));
  candidates.sort((a, b) => a - b);
  return candidates.find((s) => max / s <= 7) ?? max;
}

export default function AnalogMeter({
  spec,
  rangeIdx,
  onRangeChange,
  reading,
  tag,
  showReadout = true,
}: Props) {
  const range = spec.ranges[rangeIdx]!;
  const N = range.divisions ?? 100;
  const step = labelStep(range.max);
  const div = divisionValue(spec, rangeIdx);

  // Положення стрілки (частка шкали); впирається в упори трохи за межами шкали
  const frac = reading ? reading.raw / range.max : 0;
  const pinnedHigh = frac > 1.04;
  const pinnedLow = frac < -0.04;
  const clamped = Math.min(1.06, Math.max(-0.05, frac));
  const angle = -SWEEP + 2 * SWEEP * clamped;

  const ticks = [];
  for (let i = 0; i <= N; i++) {
    const v = (i / N) * range.max;
    const isLabel = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const isMid = i % 5 === 0;
    const len = isLabel ? 12 : isMid ? 8 : 4.5;
    const deg = -SWEEP + (2 * SWEEP * i) / N;
    const [x1, y1] = polar(deg, R);
    const [x2, y2] = polar(deg, R - len);
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="var(--dial-ink)"
        strokeWidth={isLabel ? 1.4 : 0.6}
      />,
    );
    if (isLabel) {
      const [tx, ty] = polar(deg, R + 9);
      ticks.push(
        <text
          key={`t${i}`}
          x={tx}
          y={ty}
          textAnchor="middle"
          fontSize="10"
          fontFamily="var(--font-mono)"
          fill="var(--dial-ink)"
        >
          {formatNum(v, 3)}
        </text>,
      );
    }
  }

  const [ax1, ay1] = polar(-SWEEP, R - 16);
  const [ax2, ay2] = polar(SWEEP, R - 16);
  const clipId = `dial-${spec.symbol}-${tag ?? ''}`.replace(/[^a-zA-Z0-9-]/g, '');

  let status = '';
  if (reading?.overRange && pinnedHigh) status = 'ЗАШКАЛЮЄ — збільште межу';
  else if (pinnedLow) status = 'Стрілка за нулем — змініть полярність';

  return (
    <div className="sim-meter">
      <div className="sim-meter__head">
        <span>
          {tag && <b>{tag} </b>}
          {spec.name}
        </span>
        <span>кл. {formatFixed(spec.accuracyClass, 1)}</span>
      </div>
      <svg viewBox="0 0 260 170" role="img" aria-label={`${spec.name}, межа ${range.max} ${range.unit}`}>
        <defs>
          <clipPath id={clipId}>
            <rect x="12" y="12" width="236" height="122" rx="6" />
          </clipPath>
          <linearGradient id={`${clipId}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbf7e8" />
            <stop offset="1" stopColor="var(--dial)" />
          </linearGradient>
        </defs>
        {/* Корпус */}
        <rect x="0" y="0" width="260" height="170" rx="14" fill="var(--bakelite-2)" />
        <rect x="4" y="4" width="252" height="162" rx="11" fill="var(--bakelite)" />
        {/* Циферблат */}
        <rect x="12" y="12" width="236" height="122" rx="6" fill={`url(#${clipId}-g)`} />
        <g clipPath={`url(#${clipId})`}>
          {/* Дзеркальна смужка (щоб уникнути паралакса при відліку) */}
          <path
            d={`M ${ax1} ${ay1} A ${R - 16} ${R - 16} 0 0 1 ${ax2} ${ay2}`}
            stroke="#c9ccd1"
            strokeWidth="5"
            fill="none"
            opacity="0.8"
          />
          {ticks}
          <text x={CX} y="96" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--dial-ink)">
            {range.unit}
          </text>
          <text x="26" y="126" fontSize="10" fill="var(--dial-ink)" fontFamily="var(--font-mono)">
            {formatFixed(spec.accuracyClass, 1)}
          </text>
          <text x="234" y="126" textAnchor="end" fontSize="12" fill="var(--dial-ink)">
            ⎓
          </text>
          <text x={CX} y="126" textAnchor="middle" fontSize="8" fill="#8a8674" letterSpacing="1">
            1 под. = {formatNum(div, 3)} {range.unit}
          </text>
          {/* Стрілка */}
          <g
            className={`sim-meter__needle${pinnedHigh || pinnedLow ? ' sim-meter__needle--pinned' : ''}`}
            style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px` }}
          >
            <line x1={CX} y1={CY} x2={CX} y2={CY - R + 2} stroke="#b3200f" strokeWidth="1.6" />
            <line x1={CX} y1={CY} x2={CX} y2={CY - 40} stroke="#1c1c1a" strokeWidth="3" />
          </g>
        </g>
        {/* Кришка осі стрілки */}
        <rect x="12" y="136" width="236" height="26" rx="4" fill="var(--bakelite-2)" />
        <circle cx={CX} cy={CY - 8} r="9" fill="#15181c" stroke="#5b616a" />
        <text x="22" y="153" fontSize="9" fill="#8f8a7b" letterSpacing="1.5">
          {spec.symbol}
        </text>
      </svg>
      <div className="sim-ranges" role="group" aria-label="Межа вимірювання">
        {spec.ranges.map((r, i) => (
          <button key={i} type="button" aria-pressed={i === rangeIdx} onClick={() => onRangeChange(i)}>
            {formatNum(r.max, 3)} {r.unit}
          </button>
        ))}
      </div>
      <div className="sim-meter__readout" aria-live="polite">
        {status ? (
          <span style={{ color: '#ff8a5c' }}>{status}</span>
        ) : showReadout && reading?.value != null ? (
          <span>
            Відлік: <b>{formatFixed(reading.value, reading.decimals)}</b> {range.unit}
          </span>
        ) : (
          <span>{reading ? '' : 'Немає сигналу'}</span>
        )}
      </div>
    </div>
  );
}
