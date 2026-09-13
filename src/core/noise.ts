/**
 * Фізичний шум вимірюваної величини (до того, як її «побачить» прилад).
 *
 * Шум самого приладу додає readInstrument() (core/instruments.ts). Тут — шум джерела:
 * мерехтіння лампи, коливання температури, наводки тощо.
 */
import { gaussian, type Rng } from './rng';

export interface NoiseSpec {
  /** Відносне СКВ (0.01 = 1 %). */
  rel?: number;
  /** Абсолютне СКВ у тих самих одиницях, що й x. */
  abs?: number;
  /** Стале зміщення (систематична похибка) у тих самих одиницях, що й x. */
  offset?: number;
}

/** x·(1 + N(0, rel)) + N(0, abs) + offset */
export function addNoise(r: Rng, x: number, n: NoiseSpec = {}): number {
  let y = x;
  if (n.rel) y *= 1 + gaussian(r, 0, n.rel);
  if (n.abs) y += gaussian(r, 0, n.abs);
  if (n.offset) y += n.offset;
  return y;
}
