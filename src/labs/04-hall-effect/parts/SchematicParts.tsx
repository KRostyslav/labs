/**
 * Схемні символи лаби №4, яких немає в спільній бібліотеці src/components/schematic/Schematic.tsx.
 * Стиль — ті самі класи sch-*, тож символи виглядають як решта схеми.
 * (Кандидати на перенесення в спільний кіт: FieldMark, ReversingSwitch.)
 */

/**
 * Позначення напрямку магнітного поля, перпендикулярного до площини рисунка:
 *   dir = 1  → ⊗ (поле спрямоване від нас, «хвіст стріли»);
 *   dir = −1 → ⊙ (поле спрямоване до нас, «вістря стріли»);
 *   dir = 0  → пунктирне коло (поля немає).
 */
export function FieldMark({ x, y, dir, r = 8 }: { x: number; y: number; dir: -1 | 0 | 1; r?: number }) {
  if (dir === 0) {
    return <circle className="sch-thin" cx={x} cy={y} r={r} style={{ strokeDasharray: '2 3' }} />;
  }
  const a = r * 0.62;
  return (
    <g>
      <circle className="sch-body" cx={x} cy={y} r={r} style={{ strokeWidth: 1.5 }} />
      {dir === 1 ? (
        <>
          <line className="sch-thin" x1={x - a} y1={y - a} x2={x + a} y2={y + a} />
          <line className="sch-thin" x1={x - a} y1={y + a} x2={x + a} y2={y - a} />
        </>
      ) : (
        <circle className="sch-fill" cx={x} cy={y} r={r * 0.3} />
      )}
    </g>
  );
}

/**
 * Перемикач напрямку (реверсивний, двополюсний). Центр (x, y), розмір 50×44.
 * Виводи: ліворуч (x − 25, y ∓ 13), праворуч (x + 25, y ∓ 13).
 * dir = 1 — контакти «прямо» (=), dir = −1 — «навхрест» (×): струм у навантаженні змінює напрям.
 */
export function ReversingSwitch({
  x,
  y,
  dir,
  label,
  sub,
}: {
  x: number;
  y: number;
  dir: 1 | -1;
  label?: string;
  sub?: string;
}) {
  const t = y - 13;
  const b = y + 13;
  return (
    <g>
      <rect className="sch-body" x={x - 25} y={y - 22} width={50} height={44} rx={3} style={{ strokeWidth: 1.4 }} />
      {[t, b].map((yy) => (
        <g key={yy}>
          <line className="sch-line" x1={x - 25} y1={yy} x2={x - 19} y2={yy} />
          <line className="sch-line" x1={x + 19} y1={yy} x2={x + 25} y2={yy} />
          <circle className="sch-body" cx={x - 16.5} cy={yy} r={2.5} />
          <circle className="sch-body" cx={x + 16.5} cy={yy} r={2.5} />
        </g>
      ))}
      {dir === 1 ? (
        <>
          <line className="sch-line" x1={x - 14} y1={t} x2={x + 14} y2={t} />
          <line className="sch-line" x1={x - 14} y1={b} x2={x + 14} y2={b} />
        </>
      ) : (
        <>
          <line className="sch-line" x1={x - 14} y1={t + 1} x2={x + 14} y2={b - 1} />
          <line className="sch-line" x1={x - 14} y1={b - 1} x2={x + 14} y2={t + 1} />
        </>
      )}
      {label && (
        <text className="sch-text" x={x} y={y - 28} textAnchor="middle">
          {label}
        </text>
      )}
      {sub && (
        <text className="sch-text sch-text--small" x={x} y={y + 35} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  );
}

/** Положення перемикача S3: 'H' — холлівські контакти A–B, 'sigma' — поздовжні зонди C–D. */
export type MeasureMode = 'H' | 'sigma';

/** Координати виводів перемикача S3 відносно лівого верхнього кута (x, y). */
export const MEASURE_SWITCH_PINS = {
  C: 12,
  A: 30,
  D: 48,
  B: 66,
  out1: 10,
  out2: 70,
  width: 50,
  height: 80,
} as const;

/**
 * Перемикач S3: під'єднує мілівольтметр або до пари A–B (U_H), або до пари C–D (U_σ).
 * (x, y) — лівий верхній кут; входи ліворуч (C, A, D, B), два виходи праворуч.
 */
export function MeasureSwitch({ x, y, mode, label }: { x: number; y: number; mode: MeasureMode; label?: string }) {
  const P = MEASURE_SWITCH_PINS;
  const inX = x + 9;
  const outX = x + P.width - 9;
  const pins = (['C', 'A', 'D', 'B'] as const).map((k) => ({ k, y: y + P[k] }));
  const sel = mode === 'H' ? ([y + P.A, y + P.B] as const) : ([y + P.C, y + P.D] as const);
  return (
    <g>
      <rect className="sch-body" x={x} y={y} width={P.width} height={P.height} rx={3} style={{ strokeWidth: 1.4 }} />
      {pins.map((p) => (
        <g key={p.k}>
          <line className="sch-line" x1={x} y1={p.y} x2={inX - 2.5} y2={p.y} />
          <circle className="sch-body" cx={inX} cy={p.y} r={2.5} />
          <text className="sch-text sch-text--small" x={x - 5} y={p.y - 4} textAnchor="end">
            {p.k}
          </text>
        </g>
      ))}
      {[y + P.out1, y + P.out2].map((yy) => (
        <g key={yy}>
          <circle className="sch-body" cx={outX} cy={yy} r={2.5} />
          <line className="sch-line" x1={outX + 2.5} y1={yy} x2={x + P.width} y2={yy} />
        </g>
      ))}
      <line className="sch-line" x1={inX + 2} y1={sel[0]} x2={outX - 2} y2={y + P.out1} />
      <line className="sch-line" x1={inX + 2} y1={sel[1]} x2={outX - 2} y2={y + P.out2} />
      {label && (
        <text className="sch-text" x={x + P.width / 2} y={y - 8} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Вимірювальний зонд без кола (напр. тесламетр з датчиком у зазорі): коло з символом і
 * пунктирна «ніжка» до точки вимірювання.
 */
export function ProbeMeter({
  x,
  y,
  sym,
  label,
  toX,
  toY,
}: {
  x: number;
  y: number;
  sym: string;
  label?: string;
  toX: number;
  toY: number;
}) {
  const r = 15;
  const len = Math.hypot(toX - x, toY - y) || 1;
  const sx = x + ((toX - x) / len) * r;
  const sy = y + ((toY - y) / len) * r;
  return (
    <g>
      <line className="sch-thin" x1={sx} y1={sy} x2={toX} y2={toY} style={{ strokeDasharray: '4 3' }} />
      <rect className="sch-fill" x={toX - 3} y={toY - 3} width={6} height={6} />
      <circle className="sch-body" cx={x} cy={y} r={r} />
      <text className="sch-text sch-text--sym" x={x} y={y + 5} textAnchor="middle">
        {sym}
      </text>
      {label && (
        <text className="sch-text" x={x} y={y - r - 6} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}
