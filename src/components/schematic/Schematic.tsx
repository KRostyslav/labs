/**
 * Бібліотека умовних графічних позначень (УГП) для електричних схем у стилі ДСТУ/ГОСТ 2.7xx.
 *
 * Правила:
 *  - кожен двополюсник має довжину 60 (виводи в точках (−30, 0) і (30, 0) відносно центру);
 *  - x, y — центр елемента; rot — поворот (0, 90, 180, 270 градусів);
 *  - з'єднання малюються <Wire points={[[x1,y1],[x2,y2],…]} />;
 *  - анімація струму: <Wire … flow={0.7} /> (0 — немає струму, 1 — максимум; знак — напрям).
 *
 * Приклад:
 *   <Schematic width={420} height={220}>
 *     <Source x={40} y={110} rot={90} label="G" />
 *     <Resistor x={140} y={40} label="R1" />
 *     <Wire points={[[40, 80], [40, 40], [110, 40]]} />
 *   </Schematic>
 */
import type { ReactNode } from 'react';

type Rot = 0 | 90 | 180 | 270;

interface ElemProps {
  x: number;
  y: number;
  rot?: Rot;
  /** Позиційне позначення: R1, VD1, PA1… */
  label?: string;
  /** Зміщення підпису відносно центру (у повернутих координатах не обертається). */
  labelDx?: number;
  labelDy?: number;
  /** Підсвітити елемент (напр. активний зразок). */
  active?: boolean;
  /** Елемент пошкоджено (червоний). */
  broken?: boolean;
}

/** Обгортка схеми: SVG з сіткою 10 px. */
export function Schematic({
  width,
  height,
  children,
  title,
}: {
  width: number;
  height: number;
  children: ReactNode;
  title?: string;
}) {
  return (
    <svg className="sch" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title ?? 'Електрична схема'}>
      {children}
    </svg>
  );
}

function G({ x, y, rot = 0, children, active, broken }: ElemProps & { children: ReactNode }) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rot})`}
      className={`${active ? 'sch-active' : ''} ${broken ? 'sch-broken' : ''}`}
    >
      {children}
    </g>
  );
}

function Label({ x, y, label, labelDx = 0, labelDy = -22 }: ElemProps) {
  if (!label) return null;
  return (
    <text className="sch-text" x={x + labelDx} y={y + labelDy} textAnchor="middle">
      {label}
    </text>
  );
}

/** Провідник. flow ≠ 0 — анімована «течія» струму (швидкість ∝ |flow|). */
export function Wire({ points, flow = 0 }: { points: [number, number][]; flow?: number }) {
  const d = points.map((p) => p.join(',')).join(' ');
  const pts = flow < 0 ? [...points].reverse() : points;
  const speed = Math.min(1, Math.abs(flow));
  return (
    <>
      <polyline className="sch-line" points={d} />
      {speed > 0.01 && (
        <polyline
          className="sch-flow"
          points={pts.map((p) => p.join(',')).join(' ')}
          style={{ ['--flow-dur' as string]: `${(1.6 - 1.3 * speed).toFixed(2)}s` }}
        />
      )}
    </>
  );
}

/** Вузол (точка з'єднання). */
export function Node({ x, y }: { x: number; y: number }) {
  return <circle className="sch-fill" cx={x} cy={y} r={3.5} />;
}

/** Клема (незафарбоване коло). */
export function Terminal({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <>
      <circle className="sch-body" cx={x} cy={y} r={4} />
      {label && (
        <text className="sch-text sch-text--small" x={x} y={y - 9} textAnchor="middle">
          {label}
        </text>
      )}
    </>
  );
}

/** Резистор (прямокутник 36×12). */
export function Resistor(p: ElemProps) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-18} y2={0} />
        <line className="sch-line" x1={18} y1={0} x2={30} y2={0} />
        <rect className="sch-body" x={-18} y={-6} width={36} height={12} />
      </G>
      <Label {...p} />
    </>
  );
}

/** Змінний резистор / реостат (резистор зі стрілкою). */
export function Rheostat(p: ElemProps) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-18} y2={0} />
        <line className="sch-line" x1={18} y1={0} x2={30} y2={0} />
        <rect className="sch-body" x={-18} y={-6} width={36} height={12} />
        <line className="sch-thin" x1={-16} y1={14} x2={16} y2={-14} />
        <path className="sch-fill" d="M16,-14 L7,-11 L13,-5 Z" />
      </G>
      <Label {...p} />
    </>
  );
}

/** Діод (анод зліва, катод справа). photo — фотодіод (стрілки ззовні). */
export function Diode(p: ElemProps & { photo?: boolean }) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-10} y2={0} />
        <line className="sch-line" x1={10} y1={0} x2={30} y2={0} />
        <path className="sch-body" d="M-10,-11 L10,0 L-10,11 Z" />
        <line className="sch-line" x1={10} y1={-11} x2={10} y2={11} />
        {p.photo && <LightArrows dx={-4} dy={-16} />}
      </G>
      <Label {...p} />
    </>
  );
}

/** Дві стрілки падаючого світла (для фотоприймачів). */
function LightArrows({ dx, dy }: { dx: number; dy: number }) {
  return (
    <g transform={`translate(${dx} ${dy})`}>
      {[0, 9].map((o) => (
        <g key={o} transform={`translate(${o} 0)`}>
          <line className="sch-thin" x1={-10} y1={-14} x2={0} y2={-2} />
          <path className="sch-fill" d="M0,-2 L-2,-10 L-7,-6 Z" />
        </g>
      ))}
    </g>
  );
}

/** Фоторезистор (резистор у колі зі стрілками світла). */
export function Photoresistor(p: ElemProps) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-18} y2={0} />
        <line className="sch-line" x1={18} y1={0} x2={30} y2={0} />
        <circle className="sch-thin" cx={0} cy={0} r={20} />
        <rect className="sch-body" x={-15} y={-6} width={30} height={12} />
        <LightArrows dx={-2} dy={-12} />
      </G>
      <Label {...p} labelDy={p.labelDy ?? -38} />
    </>
  );
}

/** Вимірювальний прилад: коло з позначенням (A, V, mA, µA, mV, Ω…). */
export function Meter(p: ElemProps & { sym: string }) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-16} y2={0} />
        <line className="sch-line" x1={16} y1={0} x2={30} y2={0} />
        <circle className="sch-body" cx={0} cy={0} r={16} />
      </G>
      <text className="sch-text sch-text--sym" x={p.x} y={p.y + 5} textAnchor="middle">
        {p.sym}
      </text>
      <Label {...p} labelDy={p.labelDy ?? -24} />
    </>
  );
}

/** Джерело постійної напруги (батарея): довга пластина «+» зліва. */
export function Source(p: ElemProps & { adjustable?: boolean }) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-4} y2={0} />
        <line className="sch-line" x1={5} y1={0} x2={30} y2={0} />
        <line className="sch-line" x1={-4} y1={-14} x2={-4} y2={14} />
        <line className="sch-line" style={{ strokeWidth: 4 }} x1={5} y1={-7} x2={5} y2={7} />
        {p.adjustable && (
          <>
            <line className="sch-thin" x1={-14} y1={14} x2={14} y2={-16} />
            <path className="sch-fill" d="M14,-16 L5,-13 L11,-7 Z" />
          </>
        )}
        <text className="sch-text sch-text--small" x={-12} y={-8} textAnchor="middle">
          +
        </text>
      </G>
      <Label {...p} />
    </>
  );
}

/** Джерело струму: коло з подвійною стрілкою. */
export function CurrentSource(p: ElemProps) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-16} y2={0} />
        <line className="sch-line" x1={16} y1={0} x2={30} y2={0} />
        <circle className="sch-body" cx={0} cy={0} r={16} />
        <line className="sch-line" x1={-9} y1={0} x2={9} y2={0} />
        <path className="sch-fill" d="M11,0 L3,-5 L3,5 Z" />
      </G>
      <Label {...p} labelDy={p.labelDy ?? -24} />
    </>
  );
}

/** Вимикач (замкнений/розімкнений). */
export function Switch(p: ElemProps & { closed?: boolean }) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-14} y2={0} />
        <line className="sch-line" x1={14} y1={0} x2={30} y2={0} />
        <circle className="sch-body" cx={-14} cy={0} r={2.5} />
        <circle className="sch-body" cx={14} cy={0} r={2.5} />
        <line className="sch-line" x1={-12} y1={0} x2={14} y2={p.closed ? -1 : -13} />
      </G>
      <Label {...p} />
    </>
  );
}

/** Лампа розжарювання (коло з хрестом). */
export function Lamp(p: ElemProps & { on?: boolean }) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-14} y2={0} />
        <line className="sch-line" x1={14} y1={0} x2={30} y2={0} />
        <circle cx={0} cy={0} r={14} className="sch-body" style={p.on ? { fill: '#ffe9a8' } : undefined} />
        <line className="sch-thin" x1={-10} y1={-10} x2={10} y2={10} />
        <line className="sch-thin" x1={-10} y1={10} x2={10} y2={-10} />
      </G>
      <Label {...p} />
    </>
  );
}

/** Котушка / обмотка електромагніта (півкола). */
export function Coil(p: ElemProps) {
  const arcs = [-18, -6, 6].map((s) => `M${s},0 a6,6 0 0 1 12,0`).join(' ');
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-18} y2={0} />
        <line className="sch-line" x1={18} y1={0} x2={30} y2={0} />
        <path className="sch-line" d={arcs} />
      </G>
      <Label {...p} />
    </>
  );
}

/** Нагрівач (резистор із зигзагом усередині) — для печі/термостата. */
export function Heater(p: ElemProps) {
  return (
    <>
      <G {...p}>
        <line className="sch-line" x1={-30} y1={0} x2={-18} y2={0} />
        <line className="sch-line" x1={18} y1={0} x2={30} y2={0} />
        <rect className="sch-body" x={-18} y={-8} width={36} height={16} />
        <polyline className="sch-thin" points="-14,0 -10,-5 -5,5 0,-5 5,5 10,-5 14,0" />
      </G>
      <Label {...p} />
    </>
  );
}

/**
 * Прямокутний блок з підписом (зразок, піч, монохроматор…) — для елементів,
 * що не мають стандартного УГП. Розмір задається w × h, центр — (x, y).
 */
export function Block({
  x,
  y,
  w,
  h,
  text,
  sub,
  active,
  dashed,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  sub?: string;
  active?: boolean;
  dashed?: boolean;
}) {
  return (
    <g className={active ? 'sch-active' : undefined}>
      <rect
        className="sch-body"
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={3}
        style={dashed ? { strokeDasharray: '6 4', fill: 'none' } : undefined}
      />
      {text && (
        <text className="sch-text" x={x} y={sub ? y - 2 : y + 5} textAnchor="middle">
          {text}
        </text>
      )}
      {sub && (
        <text className="sch-text sch-text--small" x={x} y={y + 13} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  );
}

/** Довільний підпис на схемі. */
export function Text({
  x,
  y,
  children,
  small,
  anchor = 'middle',
}: {
  x: number;
  y: number;
  children: ReactNode;
  small?: boolean;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text className={`sch-text${small ? ' sch-text--small' : ''}`} x={x} y={y} textAnchor={anchor}>
      {children}
    </text>
  );
}
