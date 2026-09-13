/**
 * Ілюстрація «Що відбувається в зразку» (вид згори) — головна наочна частина лаби.
 *
 * Показує: напрям струму I, напрям поля B (⊗ / ⊙), рух носіїв, силу Лоренца F_Л і силу від
 * електричного поля накопичених зарядів F_Е, а також знаки зарядів на краях A і B.
 * Для зразка «X» тип носіїв не розкривається (сірі носії зі знаком «?»).
 *
 * Рендер детермінований: положення носіїв фіксовані, рух — лише CSS-анімація зсуву
 * (класи hall-carriers у ../hall.css), яка вимикається при prefers-reduced-motion.
 */
import { useId } from 'react';
import { formatFixed } from '@/core/format';
import { FieldMark } from './SchematicParts';

interface Props {
  /** Тип носіїв: 'p' — дірки, 'n' — електрони, null — невідомо (зразок «X»). */
  carrier: 'n' | 'p' | null;
  /** Струм через зразок, А (≥ 0; напрям «+» — зліва направо). */
  current_A: number;
  /** Струм, при якому анімація найшвидша, А. */
  maxCurrent_A: number;
  /** Напрям поля: 1 — +B (від нас), −1 — −B (до нас), 0 — поля немає. */
  fieldDir: -1 | 0 | 1;
  /** Відносна «сила» ефекту 0…1 (∝ I·B) — яскравість накопичених зарядів. */
  strength: number;
}

// Геометрія (viewBox 460×214)
const SX = 50; // лівий край зразка
const SW = 280; // довжина зразка
const SY = 56; // верхній край зразка
const SH = 100; // ширина зразка на рисунку
const ROWS = [84, 106, 128];
const STEP = 35; // відстань між носіями = період анімації (див. hall.css)
const COLORS = { p: '#e0531a', n: '#1f4e9c', unknown: '#8a8f98' };

/** Стрілка з трикутним вістрям. */
function Arrow({
  x1,
  y1,
  x2,
  y2,
  color,
  dashed,
  width = 2.4,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dashed?: boolean;
  width?: number;
}) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const h = 9; // довжина вістря
  const w = 5; // півширина вістря
  const bx = x2 - ux * h;
  const by = y2 - uy * h;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={bx}
        y2={by}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? '4 3' : undefined}
      />
      <path d={`M${x2},${y2} L${bx - uy * w},${by + ux * w} L${bx + uy * w},${by - ux * w} Z`} fill={color} />
    </g>
  );
}

/** Носій заряду: кружечок зі знаком. */
function Carrier({ x, y, kind, r = 7 }: { x: number; y: number; kind: 'n' | 'p' | 'unknown'; r?: number }) {
  const sign = kind === 'p' ? '+' : kind === 'n' ? '−' : '?';
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={COLORS[kind]} stroke="#fff" strokeWidth={1.2} />
      <text
        x={x}
        y={y + r * 0.45}
        textAnchor="middle"
        fontSize={r * 1.5}
        fontWeight={700}
        fill="#fff"
        fontFamily="var(--font-mono)"
      >
        {sign}
      </text>
    </g>
  );
}

export default function SampleView({ carrier, current_A, maxCurrent_A, fieldDir, strength }: Props) {
  const clipId = `hall-clip-${useId().replace(/:/g, '')}`;
  const kind = carrier ?? 'unknown';
  const flowing = current_A > 0;
  const deflected = flowing && fieldDir !== 0;
  // Сила Лоренца при I «+»: +B (від нас) → до краю A (вгору), −B → до краю B (униз).
  const forceUp = fieldDir === 1;

  // Анімація: дірки рухаються за струмом (→), електрони — проти (←). Для «X» — без руху,
  // щоб напрям руху не підказав тип носіїв.
  const animated = flowing && carrier !== null;
  const dur = 2.6 - 1.9 * Math.min(1, current_A / maxCurrent_A);
  const flowClass = animated ? `hall-carriers hall-carriers--${carrier === 'p' ? 'right' : 'left'}` : undefined;

  // Знаки на краях: край, до якого штовхає сила, заряджається знаком носіїв.
  const carrierSign = carrier === 'p' ? '+' : carrier === 'n' ? '−' : '?';
  const otherSign = carrier === 'p' ? '−' : carrier === 'n' ? '+' : '?';
  const topSign = forceUp ? carrierSign : otherSign;
  const bottomSign = forceUp ? otherSign : carrierSign;
  const edgeOpacity = 0.35 + 0.65 * Math.max(0, Math.min(1, strength));
  const signColor = (s: string) => (s === '+' ? COLORS.p : s === '−' ? COLORS.n : COLORS.unknown);

  const fieldText = fieldDir === 1 ? '+B — від нас, за екран' : fieldDir === -1 ? '−B — до нас, з екрана' : 'B = 0 — поля немає';

  return (
    <svg className="hall-view" viewBox="0 0 460 214" role="img" aria-label="Зразок у магнітному полі, вид згори">
      <defs>
        <clipPath id={clipId}>
          <rect x={SX} y={SY} width={SW} height={SH} />
        </clipPath>
      </defs>

      {/* Легенда поля */}
      <FieldMark x={22} y={22} dir={fieldDir} r={9} />
      <text className="sch-text sch-text--small" x={38} y={26}>
        {fieldText}
      </text>

      {/* Зразок і контакти */}
      <rect x={SX} y={SY} width={SW} height={SH} fill="#f3ead2" stroke="var(--blue-2)" strokeWidth={2} />
      <rect x={SX - 10} y={SY} width={10} height={SH} fill="#b9bec6" stroke="var(--blue-2)" strokeWidth={1.2} />
      <rect x={SX + SW} y={SY} width={10} height={SH} fill="#b9bec6" stroke="var(--blue-2)" strokeWidth={1.2} />
      <text className="sch-text sch-text--small" x={SX - 5} y={SY + SH + 14} textAnchor="middle">
        1
      </text>
      <text className="sch-text sch-text--small" x={SX + SW + 5} y={SY + SH + 14} textAnchor="middle">
        2
      </text>
      <rect x={SX + SW / 2 - 8} y={SY - 8} width={16} height={8} fill="#b9bec6" stroke="var(--blue-2)" strokeWidth={1.2} />
      <rect x={SX + SW / 2 - 8} y={SY + SH} width={16} height={8} fill="#b9bec6" stroke="var(--blue-2)" strokeWidth={1.2} />
      <text className="sch-text" x={SX + SW / 2 + 16} y={SY - 2}>
        A
      </text>
      <text className="sch-text" x={SX + SW / 2 + 16} y={SY + SH + 12}>
        B
      </text>

      <g clipPath={`url(#${clipId})`}>
        {/* Слабкі позначки поля на тлі */}
        {fieldDir !== 0 &&
          [80, 150, 220, 290].map((x, i) => (
            <g key={x} opacity={0.3}>
              <FieldMark x={x} y={i % 2 ? 117 : 95} dir={fieldDir} r={5} />
            </g>
          ))}

        {/* Носії заряду */}
        <g className={flowClass} style={animated ? { ['--hall-dur' as string]: `${dur.toFixed(2)}s` } : undefined}>
          {ROWS.map((y, ri) =>
            Array.from({ length: Math.ceil(SW / STEP) + 3 }, (_, i) => {
              const x = SX - STEP + ((ri * 12) % STEP) + i * STEP;
              return <Carrier key={`${ri}-${i}`} x={x} y={y} kind={kind} />;
            }),
          )}
        </g>

        {/* Накопичені заряди на краях */}
        {deflected &&
          Array.from({ length: 8 }, (_, i) => {
            const x = SX + 22 + i * 34;
            return (
              <g key={i} opacity={edgeOpacity} fontWeight={800} fontSize={15} fontFamily="var(--font-mono)">
                <text x={x} y={SY + 14} textAnchor="middle" fill={signColor(topSign)}>
                  {topSign}
                </text>
                <text x={x} y={SY + SH - 4} textAnchor="middle" fill={signColor(bottomSign)}>
                  {bottomSign}
                </text>
              </g>
            );
          })}
      </g>

      {/* Напрям струму */}
      <Arrow x1={SX + 40} y1={194} x2={SX + SW - 40} y2={194} color={flowing ? 'var(--accent)' : '#b0b4ba'} dashed={!flowing} />
      <text className="sch-text" x={SX + SW - 30} y={199}>
        {flowing ? `I = ${formatFixed(current_A * 1e3, 1)} мА` : 'I = 0'}
      </text>

      {/* Сили, що діють на носій */}
      <text className="sch-text sch-text--small" x={405} y={52} textAnchor="middle">
        Сили на носій
      </text>
      <Carrier x={405} y={106} kind={kind} r={10} />
      {deflected ? (
        <>
          <Arrow x1={405} y1={forceUp ? 93 : 119} x2={405} y2={forceUp ? 64 : 148} color="var(--accent)" />
          <text className="sch-text" x={417} y={forceUp ? 76 : 142} fill="var(--accent-2)">
            F<tspan fontSize="9" dy="3">Л</tspan>
          </text>
          <Arrow x1={405} y1={forceUp ? 119 : 93} x2={405} y2={forceUp ? 144 : 68} color="var(--blue)" dashed width={2} />
          <text className="sch-text" x={417} y={forceUp ? 140 : 80}>
            F<tspan fontSize="9" dy="3">Е</tspan>
          </text>
        </>
      ) : (
        <text className="sch-text sch-text--small" x={405} y={138} textAnchor="middle">
          F<tspan fontSize="8" dy="3">Л</tspan>
          <tspan dy="-3"> = 0</tspan>
        </text>
      )}
    </svg>
  );
}
