/**
 * Модель вимірювального приладу: межі вимірювання, клас точності, ціна поділки, шум,
 * «зашкалювання».
 *
 * Потік даних у кожній симуляції:
 *   фізична модель (істинне значення, SI) → readInstrument() → Reading (що бачить студент)
 *
 * Похибки приладів (як у паперових лабораторних):
 *  - стрілковий (аналоговий):  Δ = клас · межа / 100
 *  - цифровий:                 Δ = a % · показ + n · (одиниця молодшого розряду)
 */
import { gaussian, type Rng } from './rng';

/** Одна межа вимірювання (положення перемикача меж). */
export interface RangeSpec {
  /** Верхня межа шкали в одиницях `unit` (напр. 30 для «30 мА»). */
  max: number;
  /** Одиниця для відображення: 'мА', 'В', 'кОм'… */
  unit: string;
  /** Скільки одиниць SI в одній одиниці `unit` (мА → 1e-3). */
  factor: number;
  /** Лише для стрілкових: кількість поділок шкали на цій межі. */
  divisions?: number;
  /** Внутрішній опір приладу на цій межі, Ом (для амперметра — малий, для вольтметра — великий). */
  internalR_Ohm?: number;
}

interface InstrumentBase {
  /** Назва для підпису: «Міліамперметр», «Мультиметр DT-830» */
  name: string;
  /** Буква на схемі/циферблаті: 'A', 'V', 'Ω', 'T', 'lx'… */
  symbol: string;
  ranges: RangeSpec[];
}

export interface AnalogSpec extends InstrumentBase {
  kind: 'analog';
  /** Клас точності (1.0, 1.5, 2.5…) — друкується на циферблаті. */
  accuracyClass: number;
}

export interface DigitalSpec extends InstrumentBase {
  kind: 'digital';
  /** Максимальний показ (1999 для «3½ розряди»). */
  counts: number;
  /** Відсоткова складова похибки від показу (0.5 означає ±0,5 %). */
  pctReading: number;
  /** Кількість одиниць молодшого розряду в похибці. */
  digits: number;
}

export type InstrumentSpec = AnalogSpec | DigitalSpec;

/** Те, що «бачить» студент на приладі. */
export interface Reading {
  /** Показ у одиницях поточної межі (заокруглений до ціни поділки / розряду); null — зашкалює. */
  value: number | null;
  /** Показ з шумом до заокруглення (для положення стрілки), в одиницях межі. */
  raw: number;
  /** Показ перевищує межу (стрілка за шкалою або «OL» на табло). */
  overRange: boolean;
  /** Абсолютна похибка приладу для цього показу, в одиницях межі. */
  absError: number;
  /** Ціна поділки (аналоговий, половина поділки для відліку) або одиниця молодшого розряду (цифровий). */
  resolution: number;
  /** Кількість знаків після коми, з якою варто записувати показ. */
  decimals: number;
  range: RangeSpec;
}

/** Заокруглення до кратного step. */
export function quantize(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/** Кількість десяткових знаків, потрібних для запису кроку step (0.05 → 2, 0.2 → 1, 5 → 0). */
export function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  return Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}

/** Крок відліку: для стрілкового — половина поділки, для цифрового — одиниця молодшого розряду. */
export function resolution(spec: InstrumentSpec, rangeIdx: number): number {
  const r = spec.ranges[rangeIdx]!;
  if (spec.kind === 'analog') return r.max / (r.divisions ?? 100) / 2;
  return r.max / (spec.counts + 1);
}

/** Ціна однієї поділки стрілкового приладу (для підпису шкали). */
export function divisionValue(spec: AnalogSpec, rangeIdx: number): number {
  const r = spec.ranges[rangeIdx]!;
  return r.max / (r.divisions ?? 100);
}

/** Абсолютна похибка приладу (в одиницях межі) для показу `reading`. */
export function instrumentAbsError(spec: InstrumentSpec, rangeIdx: number, reading: number): number {
  const r = spec.ranges[rangeIdx]!;
  if (spec.kind === 'analog') return (spec.accuracyClass * r.max) / 100;
  return (spec.pctReading / 100) * Math.abs(reading) + spec.digits * resolution(spec, rangeIdx);
}

export interface ReadOptions {
  /** СКВ шуму як частка похибки приладу (за замовчуванням 0,3: три повтори трохи різняться, але в межах Δ). */
  noiseFraction?: number;
}

/**
 * Зняти показ приладу.
 * @param trueValueSI істинне значення величини в одиницях SI (А, В, Ом, К…)
 * @param r генератор шуму (див. core/rng.ts)
 */
export function readInstrument(
  spec: InstrumentSpec,
  rangeIdx: number,
  trueValueSI: number,
  r: Rng,
  opts: ReadOptions = {},
): Reading {
  const range = spec.ranges[rangeIdx]!;
  const x = trueValueSI / range.factor;
  const step = resolution(spec, rangeIdx);
  const err = instrumentAbsError(spec, rangeIdx, x);
  const raw = x + gaussian(r, 0, (opts.noiseFraction ?? 0.3) * err);
  const decimals = decimalsForStep(step);

  // Цифровий прилад показує до counts одиниць молодшого розряду; стрілковий — до кінця шкали.
  const limit = spec.kind === 'digital' ? spec.counts * step : range.max;
  const q = quantize(raw, step);
  const overRange = Math.abs(q) > limit + 1e-12;
  // Прибираємо «хвости» плаваючої коми (0.30000000004 → 0.3).
  const value = overRange ? null : Number(q.toFixed(decimals));
  return { value, raw, overRange, absError: err, resolution: step, decimals, range };
}

/**
 * Показ у потрібних одиницях для запису в таблицю.
 * @param targetFactor множник одиниці стовпця відносно SI (мА → 1e-3, В → 1)
 * @returns значення або null (якщо зашкалює)
 * @example readingIn(ammeterReading, 1e-3) // показ у мА незалежно від обраної межі
 */
export function readingIn(rd: Reading, targetFactor: number): number | null {
  if (rd.value === null) return null;
  // toPrecision прибирає «хвости» на кшталт 12.299999999
  return Number(((rd.value * rd.range.factor) / targetFactor).toPrecision(6));
}

/**
 * Автоматично підібрати найменшу межу, на якій значення не зашкалює
 * (корисно для початкового стану симуляції).
 */
export function autoRange(spec: InstrumentSpec, valueSI: number): number {
  for (let i = 0; i < spec.ranges.length; i++) {
    const r = spec.ranges[i]!;
    const lim = spec.kind === 'digital' ? spec.counts * resolution(spec, i) : r.max;
    if (Math.abs(valueSI / r.factor) <= lim) return i;
  }
  return spec.ranges.length - 1;
}
