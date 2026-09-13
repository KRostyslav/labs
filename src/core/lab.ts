/**
 * Спільний «контракт» моделі лабораторної роботи.
 *
 * Кожна src/labs/NN-назва/model.ts експортує об'єкт, що відповідає LabModel. Це робить лаби
 * однаковими за структурою, а головне — готує ґрунт для індивідуальних варіантів
 * (див. README → Roadmap): для них знадобиться лише додати generateVariant() і UI введення
 * відповідей, не змінюючи фізики.
 */
import { withinTol } from './stats';
import type { Rng } from './rng';

/** Еталонна відповідь кінцевого завдання (для тестів і майбутньої автоперевірки). */
export interface AnswerSpec {
  id: string;
  /** Що треба визначити: «Ширина забороненої зони Eg» */
  label: string;
  /** Одиниця, в якій очікується відповідь: 'еВ', 'См/м'… */
  unit: string;
  kind: 'number' | 'choice';
  /** Еталон: число (в одиницях unit) або текст (для choice — id варіанту, напр. 'Ge'). */
  ref: number | string;
  /** Відносний допуск (0.05 = ±5 %). */
  relTol?: number;
  /** Абсолютний допуск (в одиницях unit). */
  absTol?: number;
}

/**
 * @typeParam Params  параметри, які змінює студент (напруга, температура…)
 * @typeParam Sample  параметри зразка (прихована «істина»: матеріал, Is, N…)
 * @typeParam Truth   істинні значення фізичних величин (без шуму й похибок приладів)
 */
export interface LabModel<Params, Sample, Truth> {
  /** Збігається зі slug лаби. */
  id: string;
  /** Навчальні зразки, доступні у симуляції (ключ → зразок). */
  samples: Record<string, Sample>;
  /** Ключ зразка кінцевого завдання в `samples` (зараз — спільний для всіх «Зразок X»). */
  taskSampleId: string;
  /** Чиста фізика: істинні значення для заданих параметрів і зразка. */
  simulate(params: Params, sample: Sample): Truth;
  /** Еталонні відповіді кінцевого завдання (за процедурою студента на даних без шуму). */
  referenceAnswers(sample: Sample): AnswerSpec[];
  /**
   * (Майбутнє) Згенерувати індивідуальний зразок з PRNG варіанту.
   * Поки що не використовується — див. README → Roadmap.
   */
  generateVariant?(r: Rng): Sample;
}

export interface AnswerCheck {
  id: string;
  ok: boolean;
  /** Відносне відхилення від еталона (для числових). */
  deviation: number;
}

/** (Майбутнє) Перевірити відповіді студента. Значення вже розібрані в числа/рядки. */
export function checkAnswers(
  specs: readonly AnswerSpec[],
  inputs: Record<string, number | string | null>,
): AnswerCheck[] {
  return specs.map((s) => {
    const v = inputs[s.id];
    if (v === null || v === undefined) return { id: s.id, ok: false, deviation: NaN };
    if (s.kind === 'choice' || typeof s.ref === 'string') {
      return { id: s.id, ok: String(v) === String(s.ref), deviation: 0 };
    }
    const num = Number(v);
    return {
      id: s.id,
      ok: withinTol(num, s.ref, s.relTol ?? 0, s.absTol ?? 0),
      deviation: Math.abs(num - s.ref) / Math.abs(s.ref),
    };
  });
}
