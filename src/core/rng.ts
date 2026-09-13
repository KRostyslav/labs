/**
 * Детермінований генератор псевдовипадкових чисел (PRNG).
 *
 * Навіщо детермінований, а не Math.random()?
 *  - Покази приладів не «стрибають» при кожному перемальовуванні сторінки: для тих самих
 *    параметрів і того самого номера виміру отримуємо той самий шум.
 *  - У майбутньому (індивідуальні варіанти, див. README → Roadmap) той самий код варіанту
 *    завжди дає ті самі приховані параметри зразка.
 */

/** Функція, що повертає рівномірне випадкове число з [0, 1). */
export type Rng = () => number;

/**
 * Хеш рядка → 32-бітне ціле (алгоритм cyrb53, молодші 32 біти).
 * Використовується, щоб перетворити текстовий «зерновий» ключ на число.
 */
export function hashString(s: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Простий швидкий PRNG mulberry32 з 32-бітним станом. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Створити PRNG із довільного набору «частин» ключа.
 * @example makeRng('noise', 'diode-iv', measurementIndex)
 */
export function makeRng(...parts: (string | number)[]): Rng {
  return mulberry32(hashString(parts.join(':')));
}

/** Рівномірний розподіл на [a, b). */
export function uniform(r: Rng, a: number, b: number): number {
  return a + (b - a) * r();
}

/** Логарифмічно-рівномірний розподіл на [a, b) (a, b > 0) — для величин, що змінюються на порядки. */
export function logUniform(r: Rng, a: number, b: number): number {
  return Math.exp(uniform(r, Math.log(a), Math.log(b)));
}

/** Нормальний (гаусів) розподіл, метод Бокса–Мюллера. */
export function gaussian(r: Rng, mean = 0, sd = 1): number {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Випадковий елемент масиву. */
export function pick<T>(r: Rng, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)] as T;
}

/** Випадкове ціле з [a, b] (включно). */
export function randInt(r: Rng, a: number, b: number): number {
  return a + Math.floor(r() * (b - a + 1));
}
