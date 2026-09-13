/**
 * Тести моделі ЛР №5. Головні — «зворотні»: згенерувати покази приладів (з шумом),
 * обробити їх так, як написано в розділі «Обробка результатів», і отримати приховані
 * параметри комплекту «X» у межах допуску еталонних відповідей.
 */
import { describe, expect, it } from 'vitest';
import { autoRange, readInstrument, readingIn } from '@/core/instruments';
import { DMM_DCA, DMM_DCV, LUXMETER } from '@/core/instrumentCatalog';
import { addNoise } from '@/core/noise';
import { makeRng } from '@/core/rng';
import { fitThroughOrigin, linearFit, withinTol } from '@/core/stats';
import { thermalVoltage } from '@/physics/constants';
import { MATERIALS, type MaterialId } from '@/physics/materials';
import {
  LAMP_FLICKER_REL,
  MONO_NOISE_REL,
  PHOTODIODE,
  PHOTORESISTORS,
  SAMPLES,
  SPECTRAL_DETECTORS,
  TASK_PLAN,
  bandGapFromCutoff,
  darkResistance,
  detectorCutoff_nm,
  gammaFromLux,
  halfHeightCutoff,
  illuminance,
  lambdaGrid,
  model,
  openCircuitVoltage,
  photoConductance,
  prPhotocurrent,
  shortCircuitCurrent,
  simulatePhotoresistorAutoRange,
  spectralCurrent,
} from './model';

const lit = (r: number, T = 1) => illuminance({ lampOn: true, distance_m: r, filterT: T, curtainOpen: false });

/** Покази: мерехтіння лампи → люксметр (лк); та сама освітленість → фоторезистор (I у А, U у В). */
function readPr(U0: number, r: number | null, seed: string) {
  const E0 = r === null ? 0 : lit(r);
  const E = addNoise(makeRng(seed, 'lamp'), E0, { rel: LAMP_FLICKER_REL });
  const t = simulatePhotoresistorAutoRange(U0, E, SAMPLES.X.photoresistor);
  const rI = readInstrument(DMM_DCA, t.rangeIdx, t.current_A, makeRng(seed, 'PA1'));
  const rU = readInstrument(DMM_DCV, autoRange(DMM_DCV, t.voltage_V), t.voltage_V, makeRng(seed, 'PV1'));
  const rE = readInstrument(LUXMETER, autoRange(LUXMETER, E), E, makeRng(seed, 'lux'));
  return { E: readingIn(rE, 1)!, I: readingIn(rI, 1)!, U: readingIn(rU, 1)! };
}

describe('photoeffect: оптична лава', () => {
  it('закон обернених квадратів для лампи 100 кд', () => {
    expect(lit(0.3)).toBeCloseTo(1111.1, 1);
    expect(lit(1.5)).toBeCloseTo(44.44, 2);
    expect(lit(0.1)).toBeCloseTo(10000, 6);
    expect(lit(0.5, 0.25)).toBeCloseTo(100, 6);
  });

  it('штора додає 5 лк; вимкнена лампа й закрита штора — темрява', () => {
    expect(illuminance({ lampOn: false, distance_m: 1, filterT: 1, curtainOpen: true })).toBe(5);
    expect(illuminance({ lampOn: false, distance_m: 1, filterT: 1, curtainOpen: false })).toBe(0);
  });
});

describe('photoeffect: фоторезистор', () => {
  const pr = PHOTORESISTORS.R1;

  it('у темряві опір дорівнює темновому, при 10 лк додається 1/R₁₀', () => {
    expect(1 / photoConductance(pr, 0)).toBeCloseTo(5e6, 0);
    expect(photoConductance(pr, 10)).toBeCloseTo(1 / 5e6 + 1 / 20e3, 12);
  });

  it('фотопровідність зростає як E^γ', () => {
    const g1 = photoConductance(pr, 100) - 1 / pr.darkR_Ohm;
    const g2 = photoConductance(pr, 1000) - 1 / pr.darkR_Ohm;
    expect(Math.log10(g2 / g1)).toBeCloseTo(pr.gamma, 10);
  });

  it('при 5 В і 0,1 м потужність перевищує 0,1 Вт у 1,5 раза (згоряє), а при 0,2 м — ні', () => {
    expect(simulatePhotoresistorAutoRange(5, lit(0.1), pr).power_W).toBeGreaterThan(0.15);
    expect(simulatePhotoresistorAutoRange(5, lit(0.2), pr).power_W).toBeLessThan(0.1);
  });

  it('процедура студента (lg I_ф від lg E) дає γ фоторезистора «X» у допуску', () => {
    const U0 = TASK_PLAN.sourceVoltage_V;
    const dark = readPr(U0, null, 'dark');
    const Rd = darkResistance(dark.U, dark.I);
    const E: number[] = [];
    const Iph: number[] = [];
    TASK_PLAN.distances_m.forEach((r, k) => {
      const m = readPr(U0, r, `lux${k}`);
      E.push(m.E);
      Iph.push(prPhotocurrent(m.I, m.U, Rd));
    });
    const gamma = gammaFromLux(E, Iph);
    const ref = model.referenceAnswers(SAMPLES.X).find((a) => a.id === 'gamma')!;
    expect(ref.ref as number).toBeCloseTo(0.62, 2);
    expect(withinTol(gamma, ref.ref as number, 0, ref.absTol)).toBe(true);
  });
});

describe('photoeffect: фотодіод', () => {
  const pd = PHOTODIODE;

  it('I_кз ≈ 50 мкА при 1000 лк, U_хх ≈ 0,35–0,40 В', () => {
    expect(shortCircuitCurrent(pd, 1000, 100) * 1e6).toBeCloseTo(50, 1);
    const U = openCircuitVoltage(pd, 1000, 1e7);
    expect(U).toBeGreaterThan(0.34);
    expect(U).toBeLessThan(0.41);
  });

  it('U_хх зростає на n·U_T·ln10 ≈ 65 мВ на кожну декаду освітленості', () => {
    const dU = openCircuitVoltage(pd, 1000) - openCircuitVoltage(pd, 100);
    expect(dU).toBeCloseTo(pd.n * thermalVoltage(300) * Math.LN10, 3);
  });

  it('процедура студента: нахил I_кз(E) дає S_E у межах 3 %', () => {
    const E: number[] = [];
    const I: number[] = [];
    [1.5, 1.2, 1.0, 0.8, 0.6, 0.5, 0.4, 0.3].forEach((r, k) => {
      const e = addNoise(makeRng('pd', k, 'lamp'), lit(r), { rel: LAMP_FLICKER_REL });
      const idx = autoRange(DMM_DCA, pd.sensitivity_A_per_lx * e);
      const Isc = shortCircuitCurrent(pd, e, DMM_DCA.ranges[idx]!.internalR_Ohm ?? 0);
      E.push(readingIn(readInstrument(LUXMETER, autoRange(LUXMETER, e), e, makeRng('pd', k, 'lux')), 1)!);
      I.push(readingIn(readInstrument(DMM_DCA, idx, Isc, makeRng('pd', k, 'PA1')), 1)!);
    });
    const S = fitThroughOrigin(E, I).slope;
    expect(Math.abs(S - pd.sensitivity_A_per_lx) / pd.sensitivity_A_per_lx).toBeLessThan(0.03);
  });

  it('процедура студента: нахил U_хх(lg E) ≈ 65 мВ', () => {
    const x: number[] = [];
    const y: number[] = [];
    [1.5, 1.0, 0.6, 0.4, 0.3, 0.2].forEach((r, k) => {
      const U = openCircuitVoltage(pd, lit(r), 1e7);
      const rU = readInstrument(DMM_DCV, 1, U, makeRng('uoc', k));
      x.push(Math.log10(lit(r)));
      y.push(readingIn(rU, 1)!);
    });
    expect(linearFit(x, y).slope).toBeCloseTo(0.0655, 2);
  });
});

describe('photoeffect: спектральна характеристика', () => {
  it('червона межа кремнію ≈ 1107 нм; далеко за нею сигналу немає', () => {
    const si = SPECTRAL_DETECTORS.Si;
    expect(detectorCutoff_nm(si)).toBeCloseTo(1107, 0);
    expect(spectralCurrent(si, 1600)).toBeLessThan(1e-3 * spectralCurrent(si, 900));
  });

  it('halfHeightCutoff інтерполює між точками', () => {
    // половина максимуму (5) — між 520 нм (6) і 530 нм (2): 520 + 10·(6 − 5)/(6 − 2) = 522,5
    expect(halfHeightCutoff([500, 510, 520, 530], [1, 10, 6, 2])).toBeCloseTo(522.5, 6);
    expect(halfHeightCutoff([500, 510, 520], [1, 10, 8])).toBeNaN();
  });

  it('для навчальних фотоприймачів Eg за половиною висоти відрізняється від табличного < 2 %', () => {
    const grid = lambdaGrid();
    for (const d of Object.values(SPECTRAL_DETECTORS)) {
      const Eg = bandGapFromCutoff(halfHeightCutoff(grid, grid.map((l) => spectralCurrent(d, l))));
      const tab = MATERIALS[d.material].Eg300;
      expect(Math.abs(Eg - tab) / tab).toBeLessThan(0.02);
    }
  });

  it('процедура студента дає Eg фотоприймача «X» у допуску і впізнає матеріал', () => {
    const d = SAMPLES.X.detector;
    const grid = lambdaGrid(600, 800, 10); // студент знімає лише околицю максимуму і спаду
    const I = grid.map((l, k) => {
      const Itrue = addNoise(makeRng('spec', k, 'mono'), spectralCurrent(d, l), { rel: MONO_NOISE_REL });
      return readingIn(readInstrument(DMM_DCA, 0, Itrue, makeRng('spec', k, 'PA1')), 1e-6)!;
    });
    const Eg = bandGapFromCutoff(halfHeightCutoff(grid, I));
    const answers = model.referenceAnswers(SAMPLES.X);
    const ref = answers.find((a) => a.id === 'Eg')!;
    expect(withinTol(Eg, ref.ref as number, ref.relTol!)).toBe(true);

    const candidates: MaterialId[] = ['CdS', 'CdSe', 'GaAs', 'Si', 'Ge'];
    const nearest = candidates.reduce((a, b) =>
      Math.abs(MATERIALS[b].Eg300 - Eg) < Math.abs(MATERIALS[a].Eg300 - Eg) ? b : a,
    );
    expect(nearest).toBe(answers.find((a) => a.id === 'material')!.ref);
  });
});
