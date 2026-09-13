/**
 * Тести моделі лаби №2: типові значення і «зворотний» тест — згенерувати покази приладів,
 * обробити їх так, як студент (U = (U₊ − U₋)/2, нахил U(I), ρ = Rbd/l, σ = 1/ρ, n = σ/(eμ)),
 * і отримати прихований параметр зразка «X» у межах допуску еталона.
 */
import { describe, expect, it } from 'vitest';
import { autoRange, readInstrument, readingIn } from '@/core/instruments';
import { DMM_DCA, DMM_DCV } from '@/core/instrumentCatalog';
import { makeRng } from '@/core/rng';
import { mean, relError, withinTol } from '@/core/stats';
import { PHYS } from '@/physics/constants';
import {
  SAMPLES,
  SOURCE_LIMIT_V,
  majorityMobility,
  model,
  processMeasurements,
  referenceMobility,
  simulate,
  type Method,
  type Sample,
} from './model';
import { readLength } from './parts/lengthGauge';

const RA = DMM_DCA.ranges[2]!.internalR_Ohm!; // межа 20 мА
const at = (mA: number, polarity: 1 | -1, method: Method = '4p') => ({
  setCurrent_A: mA * 1e-3,
  polarity,
  method,
  ammeterR_Ohm: RA,
});

describe('conductivity: типові значення', () => {
  it('n-Si, N = 10²¹ м⁻³: σ ≈ 24 См/м, R₄ ≈ 100 Ом, U₄(5 мА) вміщується в межу 2 В', () => {
    const t = simulate(at(5, 1), SAMPLES.nSi);
    expect(t.sigma_Sm).toBeGreaterThan(20);
    expect(t.sigma_Sm).toBeLessThan(26);
    expect(t.r4_Ohm).toBeGreaterThan(90);
    expect(t.r4_Ohm).toBeLessThan(115);
    expect(t.u4_V).toBeGreaterThan(0.4);
    expect(t.u4_V).toBeLessThan(1.999);
  });

  it('σ = e·N·μ для сильно легованого кремнію', () => {
    const t = simulate(at(1, 1), SAMPLES.nSi);
    const expected = PHYS.e * 1e21 * referenceMobility('Si', 'n');
    expect(t.sigma_Sm / expected).toBeCloseTo(1, 6);
  });

  it('термо-ЕРС не змінює знак: (U₊ − U₋)/2 = I·R₄ точно', () => {
    const s = SAMPLES.nSi;
    const p = simulate(at(4, 1), s);
    const m = simulate(at(4, -1), s);
    expect(p.u4_V + m.u4_V).toBeCloseTo(2 * s.thermoEmf_V, 12);
    expect((p.u4_V - m.u4_V) / 2 / p.current_A).toBeCloseTo(p.r4_Ohm, 9);
  });

  it('2-зондова схема дає більше, ніж R₄·L/l, на 2R_к', () => {
    for (const s of Object.values(SAMPLES) as Sample[]) {
      const t = simulate(at(2, 1, '2p'), s);
      const diff = t.r2_Ohm - t.r4_Ohm * (s.length_m / s.probeSpacing_m);
      expect(diff).toBeCloseTo(2 * s.contactR_Ohm, 6);
    }
  });

  it('джерело «X» переходить в обмеження вище ≈ 8,5 мА, навчальні — ні', () => {
    expect(simulate(at(8.5, 1), SAMPLES.X).inLimit).toBe(false);
    const lim = simulate(at(10, 1), SAMPLES.X);
    expect(lim.inLimit).toBe(true);
    expect(lim.sourceVoltage_V).toBeCloseTo(SOURCE_LIMIT_V, 9);
    expect(simulate(at(10, 1), SAMPLES.nSi).inLimit).toBe(false);
    expect(simulate(at(10, 1), SAMPLES.pGe).inLimit).toBe(false);
  });

  it('еталон «X»: σ ≈ 3,04 См/м, ρ ≈ 0,329 Ом·м, p ≈ 4·10²⁰ м⁻³', () => {
    const [sigma, rho, conc] = model.referenceAnswers(SAMPLES.X);
    expect(sigma!.ref as number).toBeCloseTo(3.04, 2);
    expect(rho!.ref as number).toBeCloseTo(0.329, 3);
    expect((conc!.ref as number) / 4e20).toBeCloseTo(1, 3);
  });

  it('похибка «у старому стилі» для типового виміру ≈ 5 %', () => {
    const eps = relError([
      { value: 0.496, abs: 0.005 * 0.496 + 2 * 0.001 }, // U на межі 2 В
      { value: 5.0, abs: 0.01 * 5 + 2 * 0.01 }, // I на межі 20 мА
      { value: 4.12, abs: 0.05 }, // b, штангенциркуль
      { value: 1.03, abs: 0.01 }, // d, мікрометр
      { value: 10.0, abs: 0.05 }, // l, штангенциркуль
    ]);
    expect(eps).toBeGreaterThan(0.04);
    expect(eps).toBeLessThan(0.06);
  });
});

/** Повна процедура студента на «виміряних» даних з шумом. */
function studentRun(s: Sample, seed: string) {
  const avg = (tool: 'caliper' | 'micrometer', true_m: number, tag: string) =>
    mean([1, 2, 3].map((k) => readLength(tool, true_m, makeRng(seed, tag, k)).value_mm));
  const b_mm = avg('caliper', s.width_m, 'b');
  const l_mm = avg('caliper', s.probeSpacing_m, 'l');
  const d_mm = avg('micrometer', s.thickness_m, 'd');

  const I_mA: number[] = [];
  const Uplus_mV: number[] = [];
  const Uminus_mV: number[] = [];
  for (const mA of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const tp = simulate(at(mA, 1), s);
    const tm = simulate(at(mA, -1), s);
    expect(tp.inLimit).toBe(false);
    const rI = readInstrument(DMM_DCA, 2, tp.current_A, makeRng(seed, mA, 'I'));
    const rUp = readInstrument(DMM_DCV, autoRange(DMM_DCV, tp.voltmeter_V), tp.voltmeter_V, makeRng(seed, mA, 'U+'));
    const rUm = readInstrument(DMM_DCV, autoRange(DMM_DCV, tm.voltmeter_V), tm.voltmeter_V, makeRng(seed, mA, 'U-'));
    I_mA.push(Math.abs(readingIn(rI, 1e-3)!));
    Uplus_mV.push(readingIn(rUp, 1e-3)!);
    Uminus_mV.push(readingIn(rUm, 1e-3)!);
  }
  return processMeasurements({ I_mA, Uplus_mV, Uminus_mV, b_mm, d_mm, l_mm, mu_m2Vs: majorityMobility(s) });
}

describe('conductivity: зворотний тест (процедура студента)', () => {
  it('зразок «X»: σ, ρ і концентрація в межах допуску еталона', () => {
    const refs = model.referenceAnswers(SAMPLES.X);
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const r = studentRun(SAMPLES.X, seed);
      const got: Record<string, number> = { sigma: r.sigma_Sm, rho: r.rho_OhmM, conc: r.conc_m3 };
      for (const ref of refs) {
        expect(withinTol(got[ref.id]!, ref.ref as number, ref.relTol!), `${seed}:${ref.id}`).toBe(true);
      }
    }
  });

  it('навчальний n-Si: відновлюємо N = 10²¹ м⁻³ з точністю 10 %', () => {
    const r = studentRun(SAMPLES.nSi, 'train');
    expect(withinTol(r.conc_m3, 1e21, 0.1)).toBe(true);
  });
});
