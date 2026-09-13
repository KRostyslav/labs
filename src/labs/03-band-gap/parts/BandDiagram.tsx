/**
 * Статична ілюстрація до теорії: енергетичні зони металу, напівпровідника й діелектрика.
 * В index.mdx вставляється БЕЗ client:* — Astro рендерить її на сервері як звичайну SVG-картинку
 * (жодного JavaScript у браузері).
 *
 * Кольори — змінні теми сайту (--blue-2, --blue-soft, --accent…), щоб малюнок пасував до схем.
 */

/** Стовпчик «зони» для одного типу речовини (координати — у viewBox 460×260). */
interface Column {
  x: number;
  title: string;
  /** Верх і низ зони провідності */
  cb: [number, number];
  /** Верх і низ валентної зони */
  vb: [number, number];
  gapLabel?: string;
}

const W = 104; // ширина зони
const COLS: Column[] = [
  { x: 80, title: 'Метал', cb: [50, 120], vb: [120, 210] },
  { x: 230, title: 'Напівпровідник', cb: [50, 100], vb: [150, 210], gapLabel: 'Eg ≈ 0,2–1,5 еВ' },
  { x: 380, title: 'Діелектрик', cb: [50, 80], vb: [170, 210], gapLabel: 'Eg > 3 еВ' },
];

const ink = 'var(--blue-2)';
const filled = 'var(--blue-soft)';
const accent = 'var(--accent)';

function Electron({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={4.5} fill={accent} />;
}
function Hole({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={4.5} fill="#fffef9" stroke={accent} strokeWidth={1.8} />;
}

export default function BandDiagram() {
  return (
    <figure style={{ margin: '1.4em 0', maxWidth: 560 }}>
      <svg
        viewBox="0 0 460 270"
        role="img"
        aria-label="Енергетичні зони металу, напівпровідника і діелектрика"
        style={{ display: 'block', width: '100%', height: 'auto', background: '#fffef9', border: '1px solid var(--line)', borderRadius: 8 }}
      >
        {/* Вісь енергії */}
        <line x1={16} y1={225} x2={16} y2={40} stroke={ink} strokeWidth={1.6} />
        <path d="M16,34 L11,46 L21,46 Z" fill={ink} />
        <text x={24} y={44} fontSize={13} fontWeight={700} fill={ink}>
          E
        </text>

        {COLS.map((c) => {
          const x0 = c.x - W / 2;
          const metal = c.gapLabel === undefined;
          return (
            <g key={c.title}>
              <text x={c.x} y={26} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--ink)">
                {c.title}
              </text>
              {metal ? (
                <>
                  {/* Одна частково заповнена зона: електрони вільно переходять на сусідні рівні */}
                  <rect x={x0} y={c.cb[0]} width={W} height={c.vb[1] - c.cb[0]} fill="#fffef9" stroke={ink} strokeWidth={1.6} />
                  <rect x={x0} y={c.vb[0]} width={W} height={c.vb[1] - c.vb[0]} fill={filled} stroke="none" />
                  <line x1={x0} y1={c.vb[0]} x2={x0 + W} y2={c.vb[0]} stroke={ink} strokeDasharray="4 3" />
                  {[-34, -12, 10, 32].map((dx) => (
                    <Electron key={dx} cx={c.x + dx} cy={c.vb[0] - 9} />
                  ))}
                  <text x={c.x} y={c.vb[0] + 30} textAnchor="middle" fontSize={11} fill={ink}>
                    заповнені рівні
                  </text>
                  <text x={c.x} y={c.cb[0] + 22} textAnchor="middle" fontSize={11} fill={ink}>
                    вільні рівні
                  </text>
                  <text x={c.x} y={236} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                    забороненої зони немає
                  </text>
                </>
              ) : (
                <>
                  {/* Зона провідності */}
                  <rect x={x0} y={c.cb[0]} width={W} height={c.cb[1] - c.cb[0]} fill="#fffef9" stroke={ink} strokeWidth={1.6} />
                  <text x={c.x} y={c.cb[0] + 16} textAnchor="middle" fontSize={11} fill={ink}>
                    зона провідності
                  </text>
                  {/* Валентна зона */}
                  <rect x={x0} y={c.vb[0]} width={W} height={c.vb[1] - c.vb[0]} fill={filled} stroke={ink} strokeWidth={1.6} />
                  <text x={c.x} y={c.vb[1] - 10} textAnchor="middle" fontSize={11} fill={ink}>
                    валентна зона
                  </text>
                  {/* Заборонена зона: подвійна стрілка і підпис */}
                  <line x1={c.x + W / 2 - 12} y1={c.cb[1] + 4} x2={c.x + W / 2 - 12} y2={c.vb[0] - 4} stroke={ink} strokeWidth={1.2} />
                  <path
                    d={`M${c.x + W / 2 - 12},${c.cb[1] + 2} l-4,8 h8 Z M${c.x + W / 2 - 12},${c.vb[0] - 2} l-4,-8 h8 Z`}
                    fill={ink}
                  />
                  <text x={c.x - 6} y={(c.cb[1] + c.vb[0]) / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={ink}>
                    {c.gapLabel}
                  </text>
                  {c.title === 'Напівпровідник' ? (
                    <>
                      {/* Тепловий «стрибок»: електрон угорі, дірка внизу */}
                      {[-30, 6].map((dx) => (
                        <g key={dx}>
                          <Electron cx={c.x + dx} cy={c.cb[1] - 10} />
                          <Hole cx={c.x + dx} cy={c.vb[0] + 10} />
                          <line
                            x1={c.x + dx}
                            y1={c.vb[0] + 3}
                            x2={c.x + dx}
                            y2={c.cb[1] - 17}
                            stroke={accent}
                            strokeWidth={1.2}
                            strokeDasharray="3 3"
                          />
                        </g>
                      ))}
                      <text x={c.x} y={236} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                        нагрівання «перекидає»
                      </text>
                      <text x={c.x} y={250} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                        частину електронів угору
                      </text>
                    </>
                  ) : (
                    <text x={c.x} y={236} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
                      «стрибнути» майже неможливо
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Легенда */}
        <Electron cx={150} cy={262} />
        <text x={158} y={266} fontSize={11} fill="var(--ink-2)">
          електрон
        </text>
        <Hole cx={240} cy={262} />
        <text x={248} y={266} fontSize={11} fill="var(--ink-2)">
          дірка
        </text>
      </svg>
      <figcaption style={{ fontSize: '0.85rem', color: 'var(--ink-3)', marginTop: 6 }}>
        Енергетичні зони (спрощено). Чим вище на малюнку, тим більша енергія електрона. Смуга між зонами —
        заборонена зона: там електрон перебувати не може.
      </figcaption>
    </figure>
  );
}
