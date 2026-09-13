/**
 * Форматування чисел для українського інтерфейсу:
 *  - десятковий роздільник — кома (0,68 В);
 *  - префікси SI українською (мкА, мА, кОм, МОм);
 *  - запис степенів: 2,40·10¹⁹.
 */

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** Замінити крапку на кому. */
export function uk(s: string): string {
  return s.replace('.', ',');
}

/** Число з фіксованою кількістю знаків після коми: formatFixed(0.683, 2) → «0,68». */
export function formatFixed(x: number, decimals: number): string {
  if (!isFinite(x)) return '—';
  return uk(x.toFixed(Math.max(0, decimals)));
}

/** Число з заданою кількістю значущих цифр, без зайвих нулів: formatNum(0.68300001) → «0,683». */
export function formatNum(x: number, sig = 4): string {
  if (!isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-4) return formatSci(x, sig);
  return uk(String(Number(x.toPrecision(sig))));
}

/** Степінь десяти верхніми індексами: 19 → «¹⁹». */
export function superscript(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join('');
}

/** Науковий запис: formatSci(2.4e19, 3) → «2,40·10¹⁹». */
export function formatSci(x: number, sig = 3): string {
  if (!isFinite(x)) return '—';
  if (x === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(x)));
  const mant = x / 10 ** exp;
  // Заокруглення може дати 10,0 — тоді зсуваємо порядок
  let m = Number(mant.toFixed(sig - 1));
  let e = exp;
  if (Math.abs(m) >= 10) {
    m /= 10;
    e += 1;
  }
  const ms = uk(m.toFixed(sig - 1));
  return e === 0 ? ms : `${ms}·10${superscript(e)}`;
}

const PREFIXES: { p: string; f: number }[] = [
  { p: 'Г', f: 1e9 },
  { p: 'М', f: 1e6 },
  { p: 'к', f: 1e3 },
  { p: '', f: 1 },
  { p: 'м', f: 1e-3 },
  { p: 'мк', f: 1e-6 },
  { p: 'н', f: 1e-9 },
  { p: 'п', f: 1e-12 },
];

/** Значення SI з підібраним префіксом: formatSI(0.0123, 'А') → «12,3 мА». */
export function formatSI(x: number, unit: string, sig = 3): string {
  if (!isFinite(x)) return '—';
  if (x === 0) return `0 ${unit}`;
  const a = Math.abs(x);
  const pr = PREFIXES.find((p) => a >= p.f * 0.9995) ?? PREFIXES[PREFIXES.length - 1]!;
  return `${uk(String(Number((x / pr.f).toPrecision(sig))))} ${pr.p}${unit}`;
}

/**
 * Розібрати число, введене студентом: «1,5», «1.5», «1,5e-3», «1,5·10^-3», «1,5*10^-3».
 * @returns число або null, якщо розібрати не вдалося
 */
export function parseNumberUk(s: string): number | null {
  const t = s
    .trim()
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[·×*]10\^?\(?([-+−]?\d+)\)?/, 'e$1')
    .replace('−', '-');
  if (t === '') return null;
  const v = Number(t);
  return isFinite(v) ? v : null;
}
