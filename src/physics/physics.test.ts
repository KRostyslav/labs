/**
 * Тести фізичних моделей матеріалів і зразка: перевіряємо відомі табличні значення.
 */
import { describe, expect, it } from 'vitest';
import { MATERIALS, bandGap, intrinsicConcentration, materialCutoff_nm, mobility } from './materials';
import { barResistance, carriers, conductivity, hallCoefficient, type Sample } from './sample';
import { PHYS, thermalVoltage } from './constants';

const Si = MATERIALS.Si;
const Ge = MATERIALS.Ge;

describe('materials', () => {
  it('Eg(300 К) з формули Варшні збігається з табличним', () => {
    for (const m of [Si, Ge, MATERIALS.GaAs]) {
      expect(Math.abs(bandGap(m, 300) - m.Eg300)).toBeLessThan(0.01);
    }
  });
  it('nᵢ(300 К) = табличне, і сильно зростає з T', () => {
    expect(intrinsicConcentration(Si, 300)).toBeCloseTo(1e16, -13);
    expect(intrinsicConcentration(Ge, 400) / intrinsicConcentration(Ge, 300)).toBeGreaterThan(20);
  });
  it('μ(T) спадає з температурою', () => {
    expect(mobility(Si, 400, 'n')).toBeLessThan(mobility(Si, 300, 'n'));
  });
  it('червона межа Si ≈ 1107 нм', () => {
    expect(materialCutoff_nm(Si)).toBeCloseTo(1107, -1);
  });
  it('U_T(300 К) ≈ 25,9 мВ', () => {
    expect(thermalVoltage(300)).toBeCloseTo(0.02585, 4);
  });
});

describe('sample', () => {
  it('власний Ge: ρ ≈ 0,47 Ом·м', () => {
    const s: Sample = { material: Ge, type: 'i', doping_m3: 0 };
    expect(1 / conductivity(s, 300)).toBeCloseTo(0.44, 1);
  });
  it('n-Si з N = 10²¹ м⁻³: n ≈ N, R_H ≈ −1/(eN)', () => {
    const s: Sample = { material: Si, type: 'n', doping_m3: 1e21 };
    const { n, p } = carriers(s, 300);
    expect(n / 1e21).toBeCloseTo(1, 6);
    expect(p).toBeLessThan(1e12);
    const RH = hallCoefficient(s, 300);
    expect(RH).toBeLessThan(0);
    expect(-1 / (PHYS.e * RH) / 1e21).toBeCloseTo(1, 3);
  });
  it('p-Ge: R_H > 0', () => {
    const s: Sample = { material: Ge, type: 'p', doping_m3: 1e21 };
    expect(hallCoefficient(s, 300)).toBeGreaterThan(0);
  });
  it('опір бруска: власний Ge, l = 10 мм, S = 2 мм² → ≈ 2,2 кОм', () => {
    const s: Sample = { material: Ge, type: 'i', doping_m3: 0 };
    const R = barResistance(conductivity(s, 300), 10e-3, 2e-6);
    expect(R).toBeGreaterThan(2000);
    expect(R).toBeLessThan(2500);
  });
});
