/**
 * Тести моделі лаби №1 (ВАХ діодів).
 *
 * 1. Типові значення: пряма напруга Si ≈ 0,65–0,7 В і Ge ≈ 0,3–0,4 В при 10 мА, зворотні струми,
 *    пробій германієвого діода, вплив опорів приладів.
 * 2. «Зворотний» тест: зняти покази приладів через readInstrument() з шумом (сталий seed),
 *    обробити їх так, як це робить студент (усереднення трьох повторів, r_д за точками 5 і 20 мА,
 *    дотична МНК за 4 останніми точками), і переконатися, що відповіді для зразка «X» потрапляють
 *    у допуски еталонних відповідей.
 */
import { describe, expect, it } from 'vitest';
import { readInstrument, readingIn } from '@/core/instruments';
import { ANALOG_MICROAMMETER, ANALOG_MILLIAMMETER, ANALOG_VOLTMETER } from '@/core/instrumentCatalog';
import { checkLimits } from '@/core/limits';
import { makeRng } from '@/core/rng';
import { mean, withinTol } from '@/core/stats';
import { checkAnswers } from '@/core/lab';
import {
  R_LIMIT_OHM,
  SAMPLES,
  UT_V,
  differentialResistanceFromPoints,
  differentialResistanceTheory,
  forwardVoltageAtReading,
  junctionCurrent,
  limitsFor,
  model,
  simulate,
  tangentFit,
  type DiodeSample,
  type IvPoint,
  type Params,
} from './model';

const RV_1V = ANALOG_VOLTMETER.ranges[0]!.internalR_Ohm!; // 1 кОм
const RV_30V = ANALOG_VOLTMETER.ranges[3]!.internalR_Ohm!; // 30 кОм
const RA_30MA = ANALOG_MILLIAMMETER.ranges[1]!.internalR_Ohm!;
const RA_100UA = ANALOG_MICROAMMETER.ranges[1]!.internalR_Ohm!;

const fwd = (U0: number, s: DiodeSample, extra: Partial<Params> = {}) =>
  simulate({ sourceVoltage_V: U0, polarity: 'forward', ammeterR_Ohm: RA_30MA, voltmeterR_Ohm: RV_1V, ...extra }, s);
const rev = (U0: number, s: DiodeSample, extra: Partial<Params> = {}) =>
  simulate({ sourceVoltage_V: U0, polarity: 'reverse', ammeterR_Ohm: RA_100UA, voltmeterR_Ohm: RV_30V, ...extra }, s);

describe('diode-iv: діод і коло стенда', () => {
  it('температурний потенціал при 293 К ≈ 25,2 мВ', () => {
    expect(UT_V * 1e3).toBeCloseTo(25.25, 1);
  });

  it('пряма напруга при 10 мА: Si 0,65–0,70 В, Ge 0,30–0,40 В', () => {
    const si = forwardVoltageAtReading(SAMPLES.VD1, 10e-3);
    const ge = forwardVoltageAtReading(SAMPLES.VD2, 10e-3);
    expect(si).toBeGreaterThan(0.65);
    expect(si).toBeLessThan(0.7);
    expect(ge).toBeGreaterThan(0.3);
    expect(ge).toBeLessThan(0.4);
  });

  it('розв’язок кола задовольняє закон Ома для повного кола (пряме ввімкнення)', () => {
    const t = fwd(1.5, SAMPLES.VD1);
    const Rser = R_LIMIT_OHM.forward + 0.5 + RA_30MA;
    expect(t.sourceCurrent_A * Rser + t.voltmeterVoltage_V).toBeCloseTo(1.5, 9);
    // Амперметр рахує і струм вольтметра (≈ U/R_V ≈ 0,7 мА)
    expect(t.ammeterCurrent_A - t.diodeCurrent_A).toBeCloseTo(t.voltmeterVoltage_V / RV_1V, 12);
    expect(t.diodeCurrent_A).toBeCloseTo(junctionCurrent(t.junctionVoltage_V, SAMPLES.VD1), 15);
  });

  it('струм монотонно зростає з U₀, а при U₀ = 0 струму немає', () => {
    expect(fwd(0, SAMPLES.VD2).ammeterCurrent_A).toBe(0);
    let prev = 0;
    for (let U0 = 0.2; U0 <= 10; U0 += 0.4) {
      const I = fwd(U0, SAMPLES.VD2).diodeCurrent_A;
      expect(I).toBeGreaterThan(prev);
      prev = I;
    }
  });

  it('зворотний струм при 20 В: Ge ≈ 20 мкА, Si ≈ 0,1 мкА (менше за поділку мікроамперметра)', () => {
    // На межі 30 В вольтметр разом із R_обм = 10 кОм — дільник: U ≈ 0,75·U₀, тому U₀ ≈ 26,9 В
    const ge = rev(26.9, SAMPLES.VD2);
    expect(ge.voltmeterVoltage_V).toBeGreaterThan(19.5);
    expect(ge.voltmeterVoltage_V).toBeLessThan(20.5);
    expect(ge.ammeterCurrent_A * 1e6).toBeGreaterThan(17);
    expect(ge.ammeterCurrent_A * 1e6).toBeLessThan(25);
    const si = rev(26.9, SAMPLES.VD1);
    expect(si.ammeterCurrent_A * 1e6).toBeGreaterThan(0.05);
    expect(si.ammeterCurrent_A * 1e6).toBeLessThan(0.2);
    // Поділка мікроамперметра на межі 10 мкА — 0,1 мкА
    expect(si.ammeterCurrent_A * 1e6).toBeLessThan(ANALOG_MICROAMMETER.ranges[0]!.max / 100 + 0.05);
  });

  it('вольтметр на зворотній гілці бачить діод + мікроамперметр, а мікроамперметр — лише струм діода', () => {
    const t = rev(20, SAMPLES.VD2);
    expect(t.ammeterCurrent_A).toBeCloseTo(-t.diodeCurrent_A, 15);
    expect(t.voltmeterVoltage_V - -t.diodeVoltage_V).toBeCloseTo(t.ammeterCurrent_A * RA_100UA, 12);
    // Струм вольтметра (≈ 0,5 мА) у десятки разів більший за зворотний струм Ge — тому його
    // не можна вмикати безпосередньо на діод: мікроамперметр рахував би переважно струм вольтметра
    expect(t.voltmeterCurrent_A / t.ammeterCurrent_A).toBeGreaterThan(20);
  });

  it('германієвий діод пробивається біля 30 В і згорає при надмірному зворотному струмі', () => {
    const before = rev(40, SAMPLES.VD2);
    expect(before.ammeterCurrent_A).toBeLessThan(40e-6);
    const after = rev(50, SAMPLES.VD2);
    expect(-after.diodeVoltage_V).toBeGreaterThan(30);
    expect(-after.diodeVoltage_V).toBeLessThan(31);
    expect(after.ammeterCurrent_A).toBeGreaterThan(0.75e-3);
    const lim = limitsFor(SAMPLES.VD2, 'reverse');
    expect(checkLimits(lim, { current_A: after.diodeCurrent_A }, 'ok')).toBe('destroyed');
    // Кремнієвий діод у межах стенда не пробивається
    expect(rev(50, SAMPLES.VD1).ammeterCurrent_A).toBeLessThan(1e-6);
  });

  it('обмеження прямого струму: Ge 50 мА, Si 100 мА; згорілий діод — обрив', () => {
    expect(checkLimits(limitsFor(SAMPLES.VD2, 'forward'), { current_A: fwd(3.5, SAMPLES.VD2).diodeCurrent_A }, 'ok')).toBe('overload');
    expect(checkLimits(limitsFor(SAMPLES.VD1, 'forward'), { current_A: fwd(3.5, SAMPLES.VD1).diodeCurrent_A }, 'ok')).toBe('ok');
    const open = fwd(5, SAMPLES.VD1, { open: true });
    expect(open.diodeCurrent_A).toBe(0);
    // Вольтметр показує майже всю напругу джерела — ознака обриву
    expect(open.voltmeterVoltage_V).toBeGreaterThan(4.5);
  });

  it('r_д = ΔU/ΔI за точками 5 і 20 мА збігається з n·U_T/I + Rs при 10 мА', () => {
    for (const s of Object.values(SAMPLES)) {
      const p = (mA: number): IvPoint => ({ U: forwardVoltageAtReading(s, mA * 1e-3), I: mA });
      const rd = differentialResistanceFromPoints(p(5), p(20));
      const theory = differentialResistanceTheory(s, 10e-3);
      expect(Math.abs(rd - theory) / theory).toBeLessThan(0.03);
    }
  });

  it('напруга відкривання за дотичною: Si > 0,6 В, Ge ≈ 0,3 В', () => {
    const pts = (s: DiodeSample) => [5, 10, 20, 25, 30, 35, 40].map((mA) => ({ U: forwardVoltageAtReading(s, mA * 1e-3), I: mA }));
    expect(tangentFit(pts(SAMPLES.VD1))!.Uopen_V).toBeGreaterThan(0.6);
    const ge = tangentFit(pts(SAMPLES.VD2))!.Uopen_V;
    expect(ge).toBeGreaterThan(0.25);
    expect(ge).toBeLessThan(0.35);
    expect(tangentFit(pts(SAMPLES.VD1).slice(0, 3))).toBeNull();
  });

  it('еталонні відповіді для «X»: кремній, 0,70–0,72 В при 10 мА, r_д ≈ 6,3 Ом', () => {
    const ref = model.referenceAnswers(SAMPLES.X);
    const by = (id: string) => ref.find((r) => r.id === id)!;
    expect(by('material').ref).toBe('Si');
    expect(by('U10').ref as number).toBeGreaterThan(0.7);
    expect(by('U10').ref as number).toBeLessThan(0.72);
    expect(withinTol(by('rd10').ref as number, differentialResistanceTheory(SAMPLES.X, 10e-3), 0.03)).toBe(true);
    expect(by('Uopen').ref as number).toBeGreaterThan(0.6);
    // Зразок «X» відрізняється від VD1 більше, ніж на допуск: відповіді VD1 не зараховуються
    const vd1 = model.referenceAnswers(SAMPLES.VD1);
    const res = checkAnswers(ref, { U10: vd1[1]!.ref, rd10: vd1[2]!.ref });
    expect(res.find((r) => r.id === 'U10')!.ok).toBe(false);
    expect(res.find((r) => r.id === 'rd10')!.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Зворотний тест: процедура студента на показах приладів із шумом      */
/* ------------------------------------------------------------------ */

/**
 * Студент крутить U₀ (крок 0,05 В), доки міліамперметр не покаже ≈ target мА,
 * і записує покази `repeats` разів (кожен запис — новий шум, як після noise.next()).
 */
function studentPoint(s: DiodeSample, seed: string, target_mA: number, aIdx: number, repeats: number): IvPoint {
  const Ra = ANALOG_MILLIAMMETER.ranges[aIdx]!.internalR_Ohm!;
  const at = (U0: number) => fwd(U0, s, { ammeterR_Ohm: Ra });
  let U0 = 0;
  for (let k = 0; k <= 200; k++) {
    if (Math.abs(at(k * 0.05).ammeterCurrent_A * 1e3 - target_mA) < Math.abs(at(U0).ammeterCurrent_A * 1e3 - target_mA)) U0 = k * 0.05;
  }
  const t = at(U0);
  const Us: number[] = [];
  const Is: number[] = [];
  for (let r = 0; r < repeats; r++) {
    const rI = readInstrument(ANALOG_MILLIAMMETER, aIdx, t.ammeterCurrent_A, makeRng(seed, target_mA, r, 'PA1'));
    const rU = readInstrument(ANALOG_VOLTMETER, 0, t.voltmeterVoltage_V, makeRng(seed, target_mA, r, 'PV1'));
    expect(rI.overRange || rU.overRange).toBe(false);
    Is.push(readingIn(rI, 1e-3)!);
    Us.push(readingIn(rU, 1)!);
  }
  return { U: mean(Us), I: mean(Is) };
}

/** Зворотний струм, як його бачить студент на мікроамперметрі (межа 10 мкА), мкА. */
function studentReverseCurrent(s: DiodeSample, seed: string, U0: number): number {
  const t = rev(U0, s, { ammeterR_Ohm: ANALOG_MICROAMMETER.ranges[0]!.internalR_Ohm! });
  const rd = readInstrument(ANALOG_MICROAMMETER, 0, t.ammeterCurrent_A, makeRng(seed, 'rev', U0));
  return rd.overRange ? Infinity : readingIn(rd, 1e-6)!;
}

/** Повна обробка результатів для кінцевого завдання (як у розділі «Обробка результатів»). */
function studentAnswers(s: DiodeSample, seed: string) {
  // Межі міліамперметра: 5 мА — 10 мА; 10, 20, 25 мА — 30 мА; 30, 35, 40 мА — 100 мА
  const p5 = studentPoint(s, seed, 5, 0, 3);
  const p10 = studentPoint(s, seed, 10, 1, 3);
  const p20 = studentPoint(s, seed, 20, 1, 3);
  const top = [studentPoint(s, seed, 25, 1, 1), studentPoint(s, seed, 30, 2, 1), studentPoint(s, seed, 35, 2, 1), studentPoint(s, seed, 40, 2, 1)];
  const tangent = tangentFit([p5, p10, p20, ...top])!;
  const Irev20_uA = studentReverseCurrent(s, seed, 26.9); // ≈ 20 В на діоді
  // Кремній: U_відкр > 0,5 В і зворотний струм менший за 1 мкА; германій — навпаки
  const material = tangent.Uopen_V > 0.5 && Irev20_uA < 1 ? 'Si' : 'Ge';
  return {
    material,
    U10: p10.U,
    rd10: differentialResistanceFromPoints(p5, p20),
    Uopen: tangent.Uopen_V,
  };
}

describe('diode-iv: зворотний тест (процедура студента → параметри зразка «X»)', () => {
  it('з показів приладів із шумом студент отримує всі відповіді «X» у допуску', () => {
    const ref = model.referenceAnswers(SAMPLES.X);
    for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
      const ans = studentAnswers(SAMPLES.X, seed);
      const res = checkAnswers(ref, ans);
      for (const r of res) expect(r.ok, `${seed}: ${r.id} (відхилення ${r.deviation})`).toBe(true);
    }
  });

  it('та сама процедура розпізнає германієвий діод VD2', () => {
    const ans = studentAnswers(SAMPLES.VD2, 'ge-check');
    expect(ans.material).toBe('Ge');
    const res = checkAnswers(model.referenceAnswers(SAMPLES.VD2), ans);
    for (const r of res) expect(r.ok, `${r.id} (відхилення ${r.deviation})`).toBe(true);
  });
});
