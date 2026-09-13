/**
 * Чисельний розв'язок рівнянь f(x) = 0 — потрібен для нелінійних кіл
 * (діод + резистор, фотодіод з навантаженням), де струм не виражається формулою.
 */

/**
 * Метод бісекції (ділення відрізка навпіл). Надійний: працює завжди, якщо f неперервна
 * і має різні знаки на кінцях відрізка [lo, hi].
 * @throws якщо на кінцях відрізка f має однаковий знак
 */
export function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tol = 1e-12,
  maxIter = 200,
): number {
  let flo = f(lo);
  const fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (Math.sign(flo) === Math.sign(fhi)) {
    throw new Error(`bisect: немає зміни знаку на [${lo}, ${hi}]`);
  }
  let a = lo;
  let b = hi;
  for (let i = 0; i < maxIter && b - a > tol; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(flo)) {
      a = m;
      flo = fm;
    } else {
      b = m;
    }
  }
  return (a + b) / 2;
}
