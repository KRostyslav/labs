/**
 * Обробка результатів вимірювань: середнє, відхилення, метод найменших квадратів (МНК),
 * відносна похибка «у старому стилі», заокруглення результату X = X₀ ± ΔX.
 */

/** Середнє арифметичне. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Середнє абсолютне відхилення від середнього (випадкова похибка серії з кількох вимірів). */
export function meanAbsDev(xs: readonly number[]): number {
  const m = mean(xs);
  return mean(xs.map((x) => Math.abs(x - m)));
}

/** Результат лінійної апроксимації y = slope·x + intercept. */
export interface Fit {
  slope: number;
  intercept: number;
  /** Стандартна похибка нахилу. */
  slopeErr: number;
  /** Стандартна похибка вільного члена. */
  interceptErr: number;
  /** Коефіцієнт детермінації R² (1 — ідеальна пряма). */
  r2: number;
  n: number;
}

/** Метод найменших квадратів: пряма y = a·x + b через точки (x, y). Потрібно ≥ 2 точок. */
export function linearFit(x: readonly number[], y: readonly number[]): Fit {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { slope: NaN, intercept: NaN, slopeErr: NaN, interceptErr: NaN, r2: NaN, n };
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = y[i]! - (slope * x[i]! + intercept);
    sse += e * e;
  }
  const s2 = n > 2 ? sse / (n - 2) : 0;
  const slopeErr = Math.sqrt(s2 / sxx);
  const interceptErr = Math.sqrt(s2 * (1 / n + (mx * mx) / sxx));
  const r2 = syy === 0 ? 1 : 1 - sse / syy;
  return { slope, intercept, slopeErr, interceptErr, r2, n };
}

/** МНК для прямої через початок координат y = k·x (напр. U_H(I) в ефекті Холла). */
export function fitThroughOrigin(
  x: readonly number[],
  y: readonly number[],
): { slope: number; slopeErr: number } {
  const n = Math.min(x.length, y.length);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += x[i]! * x[i]!;
    sxy += x[i]! * y[i]!;
  }
  const k = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i]! - k * x[i]!) ** 2;
  const slopeErr = n > 1 ? Math.sqrt(sse / (n - 1) / sxx) : 0;
  return { slope: k, slopeErr };
}

/** Доданок формули відносної похибки: величина, її абсолютна похибка і показник степеня у формулі. */
export interface ErrorTerm {
  value: number;
  abs: number;
  /** Показник степеня величини в розрахунковій формулі (R² → 2). За замовчуванням 1. */
  power?: number;
}

/**
 * Відносна похибка непрямого вимірювання — сума відносних похибок, помножених на степені:
 *   Ē = |p₁|·Δa/a + |p₂|·Δb/b + …
 * (саме так, як у паперових методичках: Ē = Δm/m + 2ΔR/R + Δh/h + 2Δs/s).
 */
export function relError(terms: readonly ErrorTerm[]): number {
  return terms.reduce((acc, t) => acc + Math.abs(t.power ?? 1) * Math.abs(t.abs / t.value), 0);
}

/**
 * Заокруглення результату за шкільним правилом: похибку — до 1 значущої цифри (до 2, якщо
 * перша цифра 1 або 2), значення — до того самого розряду.
 * @returns value, abs — заокруглені числа; decimals — кількість знаків після коми (може бути < 0)
 */
export function roundResult(
  value: number,
  abs: number,
): { value: number; abs: number; decimals: number } {
  if (!isFinite(abs) || abs <= 0) return { value, abs, decimals: 3 };
  const exp = Math.floor(Math.log10(abs));
  const first = Math.floor(abs / 10 ** exp);
  const sig = first <= 2 ? 2 : 1;
  const decimals = sig - 1 - exp;
  const f = 10 ** decimals;
  return {
    value: Math.round(value * f) / f,
    abs: Math.round(abs * f) / f,
    decimals,
  };
}

/** Чи потрапляє відповідь студента в допуск (відносний або абсолютний) навколо еталона. */
export function withinTol(student: number, ref: number, relTol: number, absTol = 0): boolean {
  // Множник (1 + 1e-9) — запас на похибку плаваючої коми (1,05 − 1 = 0,050000000000000044)
  return Math.abs(student - ref) <= Math.max(relTol * Math.abs(ref), absTol) * (1 + 1e-9);
}
