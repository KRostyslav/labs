/**
 * Захист елементів від перевантаження — простий навчальний «кінцевий автомат»:
 *
 *   'ok' → (перевищено допустиме) → 'overload' (попередження, покази ще є)
 *        → (перевищено в BURN_FACTOR разів) → 'destroyed' (елемент згорів: обрив кола)
 *
 * 'destroyed' — «липкий» стан: повернути 'ok' можна лише кнопкою «Замінити елемент» у симуляції.
 */

export type DeviceState = 'ok' | 'overload' | 'destroyed';

/** Допустимі значення (усі — необов'язкові, в одиницях SI). */
export interface Limits {
  maxCurrent_A?: number;
  maxVoltage_V?: number;
  maxPower_W?: number;
}

/** У скільки разів треба перевищити допустиме значення, щоб елемент згорів. */
export const BURN_FACTOR = 1.5;

/** Наскільки (у разах) перевищено найжорсткіше обмеження; ≤ 1 — все гаразд. */
export function overloadRatio(l: Limits, s: { current_A?: number; voltage_V?: number }): number {
  const I = Math.abs(s.current_A ?? 0);
  const U = Math.abs(s.voltage_V ?? 0);
  let k = 0;
  if (l.maxCurrent_A) k = Math.max(k, I / l.maxCurrent_A);
  if (l.maxVoltage_V) k = Math.max(k, U / l.maxVoltage_V);
  if (l.maxPower_W) k = Math.max(k, (I * U) / l.maxPower_W);
  return k;
}

/** Новий стан елемента з урахуванням попереднього. */
export function checkLimits(
  l: Limits,
  s: { current_A?: number; voltage_V?: number },
  prev: DeviceState,
): DeviceState {
  if (prev === 'destroyed') return 'destroyed';
  const k = overloadRatio(l, s);
  if (k > BURN_FACTOR) return 'destroyed';
  if (k > 1) return 'overload';
  return 'ok';
}
