/**
 * Тести моделі лаби №3. Головний — «зворотний»: зняти покази приладів (термометр і омметр
 * з шумом), обробити їх так, як це робить студент (ln R від 10³/T, пряма МНК, Eg = 2k·нахил),
 * і переконатися, що Eg зразка «X» потрапляє в допуск еталонної відповіді.
 */
import { describe, expect, it } from 'vitest';
import { autoRange, instrumentAbsError, readInstrument, readingIn } from '@/core/instruments';
import { DMM_OHM, THERMOMETER } from '@/core/instrumentCatalog';
import { makeRng } from '@/core/rng';
import { linearFit, withinTol } from '@/core/stats';
import { PHYS, celsiusToKelvin } from '@/physics/constants';
import {
  AMBIENT_C,
  FURNACE_TAU_S,
  SAMPLES,
  bandGapTwoPoint,
  furnaceStep,
  identifyMaterial,
  inFitRange,
  isStabilized,
  model,
  procedureTemps,
  resistanceAt,
  simulate,
  tempCoefficient,
  twoPointRelError,
  type SampleId,
} from './model';

/** Істинний опір зразка при температурі t (°C). */
const R = (id: SampleId, t_C: number) => resistanceAt(SAMPLES[id], celsiusToKelvin(t_C));

/** Еталон Eg (еВ) і матеріал зразка. */
function refOf(id: SampleId) {
  const [eg, mat] = model.referenceAnswers(SAMPLES[id]);
  return { Eg: eg!.ref as number, relTol: eg!.relTol!, material: mat!.ref as string };
}

describe('band-gap: типові значення', () => {
  it('германій: ≈ 2,2 кОм при 300 К, при 400 К — у десятки разів менше', () => {
    const r300 = resistanceAt(SAMPLES.Ge, 300);
    expect(r300).toBeGreaterThan(2000);
    expect(r300).toBeLessThan(2500);
    expect(r300 / resistanceAt(SAMPLES.Ge, 400)).toBeGreaterThan(20);
  });

  it('зразок «X»: мегаоми при 20 °C (влазить у межу 20 МОм), кілоом при 250 °C', () => {
    const r20 = R('X', AMBIENT_C);
    expect(r20).toBeGreaterThan(2e6);
    expect(r20).toBeLessThan(19.99e6);
    expect(readInstrument(DMM_OHM, 5, r20, makeRng('x20')).overRange).toBe(false);
    const r250 = R('X', 250);
    expect(r250).toBeGreaterThan(1e3);
    expect(r250).toBeLessThan(2e3);
  });

  it('мідний дріт: R = R₀(1 + αt)', () => {
    expect(R('Cu', 0)).toBeCloseTo(10, 10);
    expect(R('Cu', 100)).toBeCloseTo(14.3, 10);
  });

  it("ТКО: у напівпровідника від'ємний (кілька %/К), у металу додатний (≈ 0,4 %/К)", () => {
    const aGe = tempCoefficient(20, R('Ge', 20), 40, R('Ge', 40));
    expect(aGe).toBeLessThan(-0.02);
    expect(aGe).toBeGreaterThan(-0.05);
    const aCu = tempCoefficient(20, R('Cu', 20), 150, R('Cu', 150));
    expect(aCu).toBeGreaterThan(0.0038);
    expect(aCu).toBeLessThan(0.0043);
  });

  it('simulate: σ узгоджена з R = l/(σS)', () => {
    const tr = simulate({ temperature_K: 300 }, SAMPLES.Ge);
    expect(tr.resistance_Ohm).toBeCloseTo(resistanceAt(SAMPLES.Ge, 300), 8);
    expect(tr.conductivity_Sm).toBeGreaterThan(1);
    expect(tr.conductivity_Sm).toBeLessThan(4);
  });
});

describe('band-gap: ефективна Eg за нахилом (дані без шуму)', () => {
  it('германій: ≈ 0,76 еВ — більше за табличні 0,66 еВ, але близько до Eg(0) = 0,744 еВ; матеріал Ge', () => {
    const ref = refOf('Ge');
    expect(ref.Eg).toBeGreaterThan(0.74);
    expect(ref.Eg).toBeLessThan(0.78);
    expect(ref.material).toBe('Ge');
  });

  it('зразок «X» (кремній): ≈ 1,16 еВ; матеріал Si', () => {
    const ref = refOf('X');
    expect(ref.Eg).toBeGreaterThan(1.13);
    expect(ref.Eg).toBeLessThan(1.18);
    expect(ref.relTol).toBe(0.05);
    expect(ref.material).toBe('Si');
  });

  it('перевірка за двома крайніми точками дає те саме, що й пряма МНК', () => {
    for (const id of ['Ge', 'X'] as const) {
      const f = SAMPLES[id].fit;
      const T1 = celsiusToKelvin(f.from_C);
      const T2 = celsiusToKelvin(f.to_C);
      const eg2 = bandGapTwoPoint(T1, resistanceAt(SAMPLES[id], T1), T2, resistanceAt(SAMPLES[id], T2));
      expect(Math.abs(eg2 - refOf(id).Eg) / refOf(id).Eg).toBeLessThan(0.005);
    }
  });

  it('визначення матеріалу за найближчою табличною Eg', () => {
    expect(identifyMaterial(0.2)).toBe('InSb');
    expect(identifyMaterial(0.7)).toBe('Ge');
    expect(identifyMaterial(1.2)).toBe('Si');
    expect(identifyMaterial(1.45)).toBe('GaAs');
  });

  it('метал: еталон — ТКО між 20 °C і 150 °C', () => {
    const [a] = model.referenceAnswers(SAMPLES.Cu);
    expect(a!.id).toBe('alpha');
    expect(a!.ref as number).toBeCloseTo(0.00396, 5);
  });

  it('приклад з «Обробки результатів» (германій, 60 і 150 °C) дає Eg ≈ 0,76 еВ і ε ≈ 4,4 %', () => {
    expect(R('Ge', 60)).toBeCloseTo(518, 0);
    expect(R('Ge', 150)).toBeCloseTo(30.7, 1);
    const eg = bandGapTwoPoint(333.15, 518, 423.15, 30.7);
    expect(eg).toBeCloseTo(0.763, 3);
    const eps = twoPointRelError(333.15, 518, 423.15, 30.7, 1.25, 6.1, 0.45);
    expect(eps).toBeCloseTo(0.044, 3);
  });
});

describe('band-gap: піч', () => {
  it('за час τ різниця між заданою і фактичною температурою зменшується в e разів', () => {
    let t = AMBIENT_C;
    for (let i = 0; i < 40; i++) t = furnaceStep(t, 120, FURNACE_TAU_S / 40);
    expect(120 - t).toBeCloseTo(100 / Math.E, 6);
  });

  it('встановлюється за ≈ 20–25 с і далі стоїть точно на заданій', () => {
    let t = AMBIENT_C;
    let time = 0;
    while (!isStabilized(t, 100)) {
      t = furnaceStep(t, 100, 0.15);
      time += 0.15;
    }
    expect(time).toBeGreaterThan(18);
    expect(time).toBeLessThan(28);
    for (let i = 0; i < 200; i++) t = furnaceStep(t, 100, 0.15);
    expect(t).toBe(100);
  });

  it('вимкнена піч остигає до кімнатної температури', () => {
    let t = 150;
    for (let i = 0; i < 1000; i++) t = furnaceStep(t, AMBIENT_C, 0.15);
    expect(t).toBe(AMBIENT_C);
  });
});

describe('band-gap: зворотний тест (процедура студента)', () => {
  /** Зняти таблицю t, R (як кнопка «Записати вимір»): t — у °C, R — в омах. */
  function measure(id: SampleId, temps: number[], seed: string) {
    return temps.map((tSet, k) => {
      const tTrue = tSet + 0.25 * Math.sin(3 * k + 1); // у межах смуги «Стабілізовано» (±0,3 °C)
      const rTrue = R(id, tTrue);
      const tRd = readInstrument(THERMOMETER, 0, tTrue, makeRng(seed, k, 'PK1'));
      const rRd = readInstrument(DMM_OHM, autoRange(DMM_OHM, rTrue), rTrue, makeRng(seed, k, 'PR1'));
      return { t: readingIn(tRd, 1)!, R: readingIn(rRd, 1)!, tRd, rRd };
    });
  }

  /** Обробка студента: T = t + 273,15; x = 10³/T; y = ln R; пряма МНК; Eg = 2k·(нахил·10³). */
  function studentEg(rows: { t: number; R: number }[], from_C: number) {
    const used = rows.filter((r) => inFitRange(r.t, from_C));
    const x = used.map((r) => 1e3 / (r.t + 273.15));
    const y = used.map((r) => Math.log(r.R));
    const slope_K = linearFit(x, y).slope * 1e3;
    return { Eg: 2 * PHYS.kEv * slope_K, n: used.length };
  }

  it('зразок «X»: пряма через точки t ≥ 100 °C дає Eg у допуску ±5 % і матеріал Si', () => {
    const ref = refOf('X');
    const temps = [20, 40, 60, 80, ...procedureTemps(SAMPLES.X.fit)];
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const rows = measure('X', temps, seed);
      expect(rows.every((r) => r.rRd.overRange === false)).toBe(true);
      const { Eg, n } = studentEg(rows, 100);
      expect(n).toBe(16);
      expect(withinTol(Eg, ref.Eg, ref.relTol)).toBe(true);
      expect(identifyMaterial(Eg)).toBe(ref.material);
    }
  });

  it('зразок «X»: перевірка за двома точками і похибка ε охоплює відхилення від еталона', () => {
    const ref = refOf('X');
    const rows = measure('X', [100, 250], 'two');
    const p1 = rows[0]!;
    const p2 = rows[1]!;
    const T1 = p1.t + 273.15;
    const T2 = p2.t + 273.15;
    const eg = bandGapTwoPoint(T1, p1.R, T2, p2.R);
    expect(withinTol(eg, ref.Eg, ref.relTol)).toBe(true);
    // Похибки приладів за паспортом (як рахує студент): ΔT — більша з двох, ΔR — для кожного показу
    const dT = Math.max(p1.tRd.absError, p2.tRd.absError);
    const dR1 = p1.rRd.absError * p1.rRd.range.factor;
    const dR2 = p2.rRd.absError * p2.rRd.range.factor;
    const eps = twoPointRelError(T1, p1.R, T2, p2.R, dT, dR1, dR2);
    expect(eps).toBeGreaterThan(0.01);
    expect(eps).toBeLessThan(0.08);
    expect(Math.abs(eg - ref.Eg)).toBeLessThan(eps * eg);
    // Похибка термометра при 250 °C — ±(0,5 % + 5 од.) = 1,75 °C
    expect(instrumentAbsError(THERMOMETER, 0, 250)).toBeCloseTo(1.75, 6);
  });

  it('германій (навчальний): пряма через t ≥ 60 °C дає ≈ 0,76 еВ і матеріал Ge', () => {
    const ref = refOf('Ge');
    const rows = measure('Ge', procedureTemps({ from_C: 20, to_C: 150, step_C: 10 }), 'ge');
    const { Eg } = studentEg(rows, 60);
    expect(withinTol(Eg, ref.Eg, ref.relTol)).toBe(true);
    expect(identifyMaterial(Eg)).toBe('Ge');
  });

  it('мідь: ТКО за двома показами — додатний, близько 4·10⁻³ 1/К', () => {
    const rows = measure('Cu', [20, 150], 'cu');
    const a = rows[0]!;
    const b = rows[1]!;
    const alpha = tempCoefficient(a.t, a.R, b.t, b.R);
    expect(alpha).toBeGreaterThan(0.0032);
    expect(alpha).toBeLessThan(0.0048);
  });
});
