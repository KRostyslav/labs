/**
 * ШАБЛОН тесту моделі. Головний тест — «зворотний»: згенерувати виміри моделлю,
 * обробити їх так, як це робитиме студент, і переконатися, що отримали прихований
 * параметр зразка в межах допуску еталонної відповіді.
 */
import { describe, expect, it } from 'vitest';
import { linearFit } from '@/core/stats';
import { readInstrument } from '@/core/instruments';
import { ANALOG_MILLIAMMETER, DMM_DCV } from '@/core/instrumentCatalog';
import { makeRng } from '@/core/rng';
import { SAMPLES, model, simulate } from './model';

describe('template: закон Ома', () => {
  it('струм зростає пропорційно напрузі', () => {
    const a = simulate({ sourceVoltage_V: 1, ammeterR_Ohm: 0 }, SAMPLES.R1);
    const b = simulate({ sourceVoltage_V: 2, ammeterR_Ohm: 0 }, SAMPLES.R1);
    expect(b.current_A / a.current_A).toBeCloseTo(2, 10);
  });

  it('процедура студента (нахил U(I) за показами приладів) дає R зразка «X» у допуску', () => {
    const s = SAMPLES.X;
    const U: number[] = [];
    const I: number[] = [];
    for (let k = 1; k <= 8; k++) {
      const t = simulate({ sourceVoltage_V: k, ammeterR_Ohm: 0.7 }, s);
      const rI = readInstrument(ANALOG_MILLIAMMETER, 1, t.current_A, makeRng('t', k, 'I'));
      const rU = readInstrument(DMM_DCV, 2, t.voltage_V, makeRng('t', k, 'U'));
      I.push(rI.value! * 1e-3);
      U.push(rU.value!);
    }
    const R = linearFit(I, U).slope;
    const ref = model.referenceAnswers(s)[0]!;
    expect(Math.abs(R - (ref.ref as number)) / (ref.ref as number)).toBeLessThan(ref.relTol!);
  });
});
