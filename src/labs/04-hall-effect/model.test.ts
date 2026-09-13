/**
 * Тести моделі ефекту Холла: відомі типові значення, умова знаків, компенсація паразитних
 * напруг реверсом поля і головний «зворотний» тест — обробка зашумлених показів приладів
 * процедурою студента дає параметри зразка «X» у межах допуску еталонних відповідей.
 */
import { describe, expect, it } from 'vitest';
import { autoRange, readInstrument, readingIn } from '@/core/instruments';
import { DMM_DCA, DMM_MILLIVOLT, TESLAMETER } from '@/core/instrumentCatalog';
import { makeRng } from '@/core/rng';
import { fitThroughOrigin, mean, withinTol } from '@/core/stats';
import { PHYS } from '@/physics/constants';
import {
  SAMPLES,
  carrierTypeFromSign,
  concentrationFromHall,
  conductivityFrom,
  hallCoefficientFrom,
  hallFromReversal,
  hallMobility,
  magnetField,
  materialByMobility,
  model,
  simulate,
  type FieldDir,
  type HallSample,
} from './model';

/** Струм електромагніта, при якому B = 0,3 Тл. */
const IM_FOR_03T = 2 * Math.atanh(0.5);

describe('hall-effect: модель', () => {
  it('електромагніт: B(0) = 0, B монотонно зростає і насичується біля 0,6 Тл, S2 змінює знак', () => {
    expect(magnetField(0)).toBe(0);
    expect(magnetField(IM_FOR_03T)).toBeCloseTo(0.3, 10);
    expect(magnetField(1)).toBeLessThan(magnetField(2));
    expect(magnetField(3)).toBeGreaterThan(0.5);
    expect(magnetField(3)).toBeLessThan(0.6);
    expect(magnetField(1.5, -1)).toBeCloseTo(-magnetField(1.5, 1), 12);
  });

  it('n-Ge, N = 10²¹ м⁻³, I = 5 мА, B = 0,3 Тл, d = 0,5 мм: |U_H| ≈ 18,7 мВ, зсув контактів ≈ 4 мВ', () => {
    const t = simulate({ current_A: 5e-3, magnetCurrent_A: IM_FOR_03T, fieldDir: 1 }, SAMPLES.nGe);
    expect(t.hallVoltage_V * 1e3).toBeCloseTo(-18.7, 1);
    const offset = t.voltageAB_V - t.hallVoltage_V - SAMPLES.nGe.thermalOffset_V;
    expect(offset * 1e3).toBeGreaterThan(3.5);
    expect(offset * 1e3).toBeLessThan(4.5);
    // Зразок сильно легований: R_H ≈ −1/(eN)
    expect(-1 / (PHYS.e * t.hallCoefficient_m3C) / 1e21).toBeCloseTo(1, 2);
  });

  it('умова знаків: при I «+» і +B U_H > 0 для p-типу і U_H < 0 для n-типу', () => {
    const p = { current_A: 5e-3, magnetCurrent_A: 1.5, fieldDir: 1 as FieldDir };
    expect(simulate(p, SAMPLES.pGe).hallVoltage_V).toBeGreaterThan(0);
    expect(simulate(p, SAMPLES.nGe).hallVoltage_V).toBeLessThan(0);
    expect(simulate(p, SAMPLES.X).hallVoltage_V).toBeGreaterThan(0);
  });

  it('реверс поля повністю прибирає зсув контактів і термо-ЕРС', () => {
    for (const s of Object.values(SAMPLES) as HallSample[]) {
      const plus = simulate({ current_A: 7e-3, magnetCurrent_A: 2, fieldDir: 1 }, s);
      const minus = simulate({ current_A: 7e-3, magnetCurrent_A: 2, fieldDir: -1 }, s);
      expect(hallFromReversal(plus.voltageAB_V, minus.voltageAB_V)).toBeCloseTo(plus.hallVoltage_V, 12);
      // А без реверсу помилка помітна (для «X» U₁ більш ніж удвічі більша за U_H)
      expect(Math.abs(plus.voltageAB_V - plus.hallVoltage_V)).toBeGreaterThan(1e-4);
    }
    const x = simulate({ current_A: 5e-3, magnetCurrent_A: 1.5, fieldDir: 1 }, SAMPLES.X);
    expect(x.voltageAB_V / x.hallVoltage_V).toBeGreaterThan(2);
  });

  it('U_CD = I·l/(σ·b·d) не залежить від поля; σ з U_σ збігається з σ моделі', () => {
    const a = simulate({ current_A: 3e-3, magnetCurrent_A: 0, fieldDir: 1 }, SAMPLES.pGe);
    const b = simulate({ current_A: 3e-3, magnetCurrent_A: 3, fieldDir: -1 }, SAMPLES.pGe);
    expect(a.voltageCD_V).toBeCloseTo(b.voltageCD_V, 12);
    expect(conductivityFrom(3e-3, a.voltageCD_V, SAMPLES.pGe.thickness_m)).toBeCloseTo(a.conductivity_Sm, 8);
  });

  it('усі покази стенда в межах приладів: U_AB < 200 мВ, U_σ < 2 В при робочих струмах', () => {
    for (const s of Object.values(SAMPLES) as HallSample[]) {
      const t = simulate({ current_A: 10e-3, magnetCurrent_A: 3, fieldDir: 1 }, s);
      expect(Math.abs(t.voltageAB_V)).toBeLessThan(0.2);
      const u = simulate({ current_A: 5e-3, magnetCurrent_A: 0, fieldDir: 1 }, s).voltageCD_V;
      expect(u).toBeLessThan(1.9999);
    }
  });

  it('еталон: навчальні зразки — германій потрібного типу, «X» — кремній p-типу', () => {
    const byId = (s: HallSample) => Object.fromEntries(model.referenceAnswers(s).map((a) => [a.id, a.ref]));
    expect(byId(SAMPLES.nGe)).toMatchObject({ type: 'n', material: 'Ge' });
    expect(byId(SAMPLES.pGe)).toMatchObject({ type: 'p', material: 'Ge' });
    const x = byId(SAMPLES.X);
    expect(x).toMatchObject({ type: 'p', material: 'Si' });
    expect((x.n as number) / 2.5e21).toBeCloseTo(1, 4);
    expect(x.mu as number).toBeCloseTo(0.0474, 4);
  });
});

/* ------------------------------------------------------------------ */
/** Один рядок таблиці Холла так, як його записує студент на стенді. */
interface HallRow {
  I_mA: number;
  B_mT: number;
  U1_mV: number;
  U2_mV: number;
}

/** Зняти рядок: U₁ при +B (і B з тесламетра), потім U₂ при −B — кожен запис з новим шумом. */
function measureRow(s: HallSample, I_mA: number, Im_A: number, seed: string): HallRow {
  const read = (dir: FieldDir, k: number) => {
    const t = simulate({ current_A: I_mA * 1e-3, magnetCurrent_A: Im_A, fieldDir: dir }, s);
    const rI = readInstrument(DMM_DCA, 2, I_mA * 1e-3, makeRng(seed, k, 'PA1'));
    const rB = readInstrument(TESLAMETER, 0, t.field_T, makeRng(seed, k, 'PT'));
    const rU = readInstrument(DMM_MILLIVOLT, autoRange(DMM_MILLIVOLT, t.voltageAB_V), t.voltageAB_V, makeRng(seed, k, 'PV1'));
    return { I: readingIn(rI, 1e-3)!, B: readingIn(rB, 1e-3)!, U: readingIn(rU, 1e-3)! };
  };
  const first = read(1, 1);
  const second = read(-1, 2);
  return { I_mA: first.I, B_mT: Math.abs(first.B), U1_mV: first.U, U2_mV: second.U };
}

/** Повна обробка студента для зразка: серія 1 (U_H від I), серія 2 (U_H від B), U_σ. */
function studentProcedure(s: HallSample, seed: string) {
  const d = s.thickness_m;

  // Серія 1: I = 1…10 мА при I_м = 1,5 А
  const s1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => measureRow(s, i, 1.5, `${seed}:vsI:${i}`));
  const k1 = fitThroughOrigin(
    s1.map((r) => r.I_mA),
    s1.map((r) => hallFromReversal(r.U1_mV, r.U2_mV)),
  ).slope; // мВ/мА = В/А
  const B1_T = mean(s1.map((r) => r.B_mT)) * 1e-3;
  const RH1 = (k1 * d) / B1_T;

  // Серія 2: I_м = 0,5…3 А при I = 5 мА
  const s2 = [0.5, 1, 1.5, 2, 2.5, 3].map((im) => measureRow(s, 5, im, `${seed}:vsB:${im}`));
  const k2 = fitThroughOrigin(
    s2.map((r) => r.B_mT * 1e-3),
    s2.map((r) => hallFromReversal(r.U1_mV, r.U2_mV) * 1e-3),
  ).slope; // В/Тл
  const I2_A = mean(s2.map((r) => r.I_mA)) * 1e-3;
  const RH2 = (k2 * d) / I2_A;

  // Одна точка «вручну» (формула R_H = U_H·d/(I·B)) — має збігатися з нахилом
  const row = s1[4]!;
  const RHpoint = hallCoefficientFrom(
    hallFromReversal(row.U1_mV, row.U2_mV) * 1e-3,
    d,
    row.I_mA * 1e-3,
    row.B_mT * 1e-3,
  );

  // U_σ при I = 1…5 мА (для «X» більші струми дають OL на межі 2000 мВ)
  const sigmas = [1, 2, 3, 4, 5].map((i) => {
    const t = simulate({ current_A: i * 1e-3, magnetCurrent_A: 0, fieldDir: 1 }, s);
    const rI = readInstrument(DMM_DCA, 2, i * 1e-3, makeRng(seed, 'sigma', i, 'PA1'));
    const rU = readInstrument(DMM_MILLIVOLT, autoRange(DMM_MILLIVOLT, t.voltageCD_V), t.voltageCD_V, makeRng(seed, 'sigma', i, 'PV1'));
    expect(rU.overRange).toBe(false);
    return conductivityFrom(readingIn(rI, 1e-3)! * 1e-3, readingIn(rU, 1e-3)! * 1e-3, d);
  });
  const sigma = mean(sigmas);

  const RH = (RH1 + RH2) / 2;
  const type = carrierTypeFromSign(RH);
  const mu = hallMobility(RH, sigma);
  return { RH1, RH2, RHpoint, type, n: concentrationFromHall(RH), mu, material: materialByMobility(mu, type) };
}

describe('hall-effect: зворотний тест (процедура студента на зашумлених показах)', () => {
  const ref = Object.fromEntries(model.referenceAnswers(SAMPLES.X).map((a) => [a.id, a]));

  for (const seed of ['t1', 't2', 't3', 't4', 't5']) {
    it(`зразок «X», зерно ${seed}: тип, n, μ і матеріал у допуску`, () => {
      const r = studentProcedure(SAMPLES.X, seed);
      // Дві серії й окрема точка узгоджуються між собою
      expect(Math.abs(r.RH1 / r.RH2 - 1)).toBeLessThan(0.05);
      expect(Math.abs(r.RHpoint / r.RH1 - 1)).toBeLessThan(0.06);

      expect(r.type).toBe(ref.type!.ref);
      expect(r.material).toBe(ref.material!.ref);
      expect(withinTol(r.n, ref.n!.ref as number, ref.n!.relTol!)).toBe(true);
      expect(withinTol(r.mu, ref.mu!.ref as number, ref.mu!.relTol!)).toBe(true);
    });
  }

  it('навчальні зразки: процедура дає правильний тип і германій', () => {
    for (const s of [SAMPLES.nGe, SAMPLES.pGe]) {
      const r = studentProcedure(s, 'train');
      expect(r.type).toBe(s.type);
      expect(r.material).toBe('Ge');
      expect(Math.abs(r.n / s.doping_m3 - 1)).toBeLessThan(0.08);
    }
  });
});
