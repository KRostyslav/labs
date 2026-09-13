/**
 * ШАБЛОН фізичної моделі лаби (приклад: закон Ома для резистора).
 *
 * Правила для model.ts (див. docs/ADDING_A_LAB.md):
 *  1. Лише чисті функції — жодного React, DOM чи випадковості (шум додають прилади в Simulation).
 *  2. Усі величини — в одиницях SI; одиниця в імені: voltage_V, current_A, resistance_Ohm.
 *  3. Експортуйте об'єкт `model`, що відповідає LabModel (src/core/lab.ts).
 *  4. Зразок кінцевого завдання — `SAMPLES.X`, його параметри «приховані» від студента.
 *  5. referenceAnswers() обчислює еталон ТІЄЮ Ж процедурою, що й студент (для тестів).
 */
import type { AnswerSpec, LabModel } from '@/core/lab';

/** Параметри, які змінює студент. */
export interface Params {
  /** Напруга джерела, В */
  sourceVoltage_V: number;
  /** Внутрішній опір міліамперметра на обраній межі, Ом */
  ammeterR_Ohm: number;
}

/** Параметри зразка (прихована «істина»). */
export interface Sample {
  name: string;
  resistance_Ohm: number;
  /** Допустима потужність розсіювання, Вт */
  maxPower_W: number;
}

/** Істинні значення величин (без шуму). */
export interface Truth {
  current_A: number;
  /** Напруга на резисторі (її показує вольтметр), В */
  voltage_V: number;
  power_W: number;
}

/** Внутрішній опір джерела, Ом. */
export const SOURCE_R_OHM = 0.5;

export const SAMPLES = {
  R1: { name: 'Резистор R1 (100 Ом)', resistance_Ohm: 100, maxPower_W: 0.5 },
  X: { name: 'Резистор «X»', resistance_Ohm: 270, maxPower_W: 0.5 },
} satisfies Record<string, Sample>;

export type SampleId = keyof typeof SAMPLES;

/** Закон Ома для повного кола: I = U₀ / (R + R_A + r). */
export function simulate(p: Params, s: Sample): Truth {
  const current_A = p.sourceVoltage_V / (s.resistance_Ohm + p.ammeterR_Ohm + SOURCE_R_OHM);
  const voltage_V = current_A * s.resistance_Ohm;
  return { current_A, voltage_V, power_W: current_A * voltage_V };
}

/** Еталон: опір — нахил прямої U(I), тобто просто R (вольтметр підключено до резистора). */
export function referenceAnswers(s: Sample): AnswerSpec[] {
  return [
    { id: 'R', label: 'Опір резистора', unit: 'Ом', kind: 'number', ref: s.resistance_Ohm, relTol: 0.03 },
  ];
}

export const model: LabModel<Params, Sample, Truth> = {
  id: 'template',
  samples: SAMPLES,
  taskSampleId: 'X',
  simulate,
  referenceAnswers,
};
