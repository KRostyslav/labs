/**
 * Схема стенда лаби №2 (viewBox 480×250):
 *   G1 (джерело струму) → S1 (перемикач напрямку, показано прямі або перехрещені з'єднання)
 *   → PA1 → контакт 1 бруска → … → контакт 4 → S1 → G1.
 *   PV1 під'єднано перемикачем S2 до зондів 2–3 (4-зондова схема) або до контактів 1–4
 *   (2-зондова); неактивне під'єднання показано блідим пунктиром.
 */
import { Block, CurrentSource, Meter, Node, Schematic, Text, Wire } from '@/components/schematic/Schematic';
import type { Method } from '../model';

interface Props {
  label: string;
  polarity: 1 | -1;
  method: Method;
  /** Відносна «швидкість» струму 0…1 (0 — струму немає). */
  flow: number;
}

const TOP = 50; // верхня шина
const BOT = 232; // нижня шина
const BAR = { x1: 280, x2: 440, y1: 136, y2: 168 };
const MID = (BAR.y1 + BAR.y2) / 2; // 152
const P2 = 320; // зонд 2 (l = 10 мм ↔ 80 px)
const P3 = 400; // зонд 3
const PROBE_TIP = BAR.y1;

/** Лише «течія» струму без лінії провідника (для струму всередині бруска). */
function Flow({ points, flow }: { points: [number, number][]; flow: number }) {
  const speed = Math.min(1, Math.abs(flow));
  if (speed <= 0.01) return null;
  const pts = flow < 0 ? [...points].reverse() : points;
  return (
    <polyline
      className="sch-flow"
      points={pts.map((p) => p.join(',')).join(' ')}
      style={{ ['--flow-dur' as string]: `${(1.6 - 1.3 * speed).toFixed(2)}s` }}
    />
  );
}

/** Неактивне під'єднання вольтметра (блідий пунктир). */
function Ghost({ points }: { points: [number, number][] }) {
  return (
    <polyline
      className="sch-thin"
      points={points.map((p) => p.join(',')).join(' ')}
      style={{ opacity: 0.3, strokeDasharray: '4 4' }}
    />
  );
}

/** Розмірна лінія з засічками і підписом під нею. */
function Dim({ x1, x2, y, text }: { x1: number; x2: number; y: number; text: string }) {
  return (
    <>
      <line className="sch-thin" x1={x1} y1={y} x2={x2} y2={y} />
      <line className="sch-thin" x1={x1} y1={y - 5} x2={x1} y2={y + 5} />
      <line className="sch-thin" x1={x2} y1={y - 5} x2={x2} y2={y + 5} />
      <Text x={(x1 + x2) / 2} y={y + 13} small>
        {text}
      </Text>
    </>
  );
}

/** Потенціальний зонд — вістря, що торкається верхньої грані бруска. */
function Probe({ x, n }: { x: number; n: string }) {
  return (
    <>
      <path className="sch-fill" d={`M${x - 4},${PROBE_TIP - 10} L${x + 4},${PROBE_TIP - 10} L${x},${PROBE_TIP} Z`} />
      <Text x={x + 11} y={PROBE_TIP - 3} small>
        {n}
      </Text>
    </>
  );
}

export default function StandSchematic({ label, polarity, method, flow }: Props) {
  const f0 = flow; // до перемикача S1 струм завжди в одному напрямку
  const f = flow * polarity; // після S1 — залежно від положення перемикача
  const four = method === '4p';

  // Під'єднання вольтметра: 4-зондове (до зондів) і 2-зондове (до струмових контактів)
  const v4L: [number, number][] = [[330, 95], [P2, 95], [P2, PROBE_TIP - 10]];
  const v4R: [number, number][] = [[390, 95], [P3, 95], [P3, PROBE_TIP - 10]];
  const v2L: [number, number][] = [[330, 95], [262, 95]];
  const v2R: [number, number][] = [[390, 95], [462, 95], [462, MID]];

  return (
    <Schematic
      width={480}
      height={250}
      title={`Джерело струму G1, перемикач напрямку S1, міліамперметр PA1 і брусок ${label} послідовно; вольтметр PV1 на ${four ? 'зондах 2–3' : 'контактах 1–4'}`}
    >
      {/* Джерело струму і шини до S1 */}
      <CurrentSource x={40} y={135} rot={270} label="G1" labelDx={-24} labelDy={4} />
      <Wire points={[[40, 105], [40, TOP], [100, TOP]]} flow={f0} />
      <Wire points={[[100, BOT], [40, BOT], [40, 165]]} flow={f0} />

      {/* S1 — перемикач напрямку струму */}
      <Block x={125} y={(TOP + BOT) / 2} w={50} h={BOT - TOP + 28} dashed />
      <Text x={125} y={TOP - 20}>
        {`S1 «${polarity > 0 ? '+' : '−'}»`}
      </Text>
      {polarity > 0 ? (
        <>
          <Wire points={[[100, TOP], [150, TOP]]} flow={f0} />
          <Wire points={[[150, BOT], [100, BOT]]} flow={f0} />
        </>
      ) : (
        <>
          <Wire points={[[100, TOP], [150, BOT]]} flow={f0} />
          <Wire points={[[150, TOP], [100, BOT]]} flow={f0} />
        </>
      )}
      {[TOP, BOT].map((y) => (
        <g key={y}>
          <Node x={100} y={y} />
          <Node x={150} y={y} />
        </g>
      ))}

      {/* Міліамперметр і струмові проводи до контактів 1 і 4 */}
      <Wire points={[[150, TOP], [170, TOP]]} flow={f} />
      <Meter x={200} y={TOP} sym="mA" label="PA1" />
      <Wire points={[[230, TOP], [262, TOP], [262, MID], [BAR.x1 - 4, MID]]} flow={f} />
      <Wire points={[[BAR.x2 + 4, MID], [462, MID], [462, BOT], [150, BOT]]} flow={f} />

      {/* Брусок напівпровідника з контактами 1, 4 і зондами 2, 3 */}
      <g className="sch-active">
        <rect className="sch-body" x={BAR.x1} y={BAR.y1} width={BAR.x2 - BAR.x1} height={BAR.y2 - BAR.y1} />
      </g>
      <rect className="sch-fill" x={BAR.x1 - 5} y={BAR.y1 - 4} width={9} height={BAR.y2 - BAR.y1 + 8} />
      <rect className="sch-fill" x={BAR.x2 - 4} y={BAR.y1 - 4} width={9} height={BAR.y2 - BAR.y1 + 8} />
      <Text x={BAR.x1 - 12} y={BAR.y1 - 6} small>
        1
      </Text>
      <Text x={BAR.x2 + 12} y={BAR.y1 - 6} small>
        4
      </Text>
      <Flow points={[[BAR.x1 + 6, MID + 8], [BAR.x2 - 6, MID + 8]]} flow={f} />
      <Text x={(BAR.x1 + BAR.x2) / 2} y={MID - 1} small>
        {label}
      </Text>
      <Probe x={P2} n="2" />
      <Probe x={P3} n="3" />

      {/* Вольтметр і перемикач S2 */}
      <Meter x={360} y={95} sym="V" label="PV1" />
      {four ? (
        <>
          <Ghost points={v2L} />
          <Ghost points={v2R} />
          <Wire points={v4L} />
          <Wire points={v4R} />
        </>
      ) : (
        <>
          <Ghost points={v4L} />
          <Ghost points={v4R} />
          <Wire points={v2L} />
          <Wire points={v2R} />
          <Node x={262} y={95} />
          <Node x={462} y={MID} />
        </>
      )}
      <Text x={474} y={80} small anchor="end">
        {four ? 'S2: 4 зонди' : 'S2: 2 зонди'}
      </Text>

      {/* Розміри */}
      <Dim x1={P2} x2={P3} y={182} text="l = 10 мм" />
      <Dim x1={BAR.x1} x2={BAR.x2} y={204} text="L = 20 мм" />
    </Schematic>
  );
}
