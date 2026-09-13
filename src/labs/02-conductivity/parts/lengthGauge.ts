/**
 * Вимірювання розмірів зразка штангенциркулем і мікрометром (локальний «прилад» лаби).
 *
 * Показ = справжній розмір × (1 ± 0,5 % неоднорідності бруска) → заокруглення до ціни поділки
 * інструмента (LENGTH_TOOLS: штангенциркуль 0,05 мм, мікрометр 0,01 мм).
 * Кандидат у спільний кіт (src/core/instruments.ts → readLength).
 */
import { LENGTH_TOOLS } from '@/core/instrumentCatalog';
import { decimalsForStep, quantize } from '@/core/instruments';
import { uniform, type Rng } from '@/core/rng';

export type LengthToolId = keyof typeof LENGTH_TOOLS;

/** Неоднорідність бруска: розмір у різних місцях відрізняється до ±0,5 %. */
export const NON_UNIFORMITY = 0.005;

export interface LengthReading {
  /** Показ інструмента, мм. */
  value_mm: number;
  /** Ціна поділки, мм. */
  resolution_mm: number;
  /** Абсолютна похибка інструмента, мм. */
  absError_mm: number;
  /** Знаків після коми для запису. */
  decimals: number;
}

/** Один вимір довжини інструментом `tool`. */
export function readLength(tool: LengthToolId, trueValue_m: number, r: Rng): LengthReading {
  const t = LENGTH_TOOLS[tool];
  const step_mm = t.resolution_m * 1e3;
  const decimals = decimalsForStep(step_mm);
  const x_mm = trueValue_m * 1e3 * (1 + uniform(r, -NON_UNIFORMITY, NON_UNIFORMITY));
  return {
    value_mm: Number(quantize(x_mm, step_mm).toFixed(decimals)),
    resolution_mm: step_mm,
    absError_mm: t.absError_m * 1e3,
    decimals,
  };
}
