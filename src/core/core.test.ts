/**
 * Тести спільного ядра: PRNG, прилади, статистика, форматування, розв'язувач, ліміти.
 */
import { describe, expect, it } from 'vitest';
import { gaussian, hashString, makeRng } from './rng';
import { autoRange, decimalsForStep, instrumentAbsError, quantize, readInstrument, resolution } from './instruments';
import { ANALOG_MILLIAMMETER, DMM_DCV, DMM_OHM } from './instrumentCatalog';
import { fitThroughOrigin, linearFit, mean, meanAbsDev, relError, roundResult, withinTol } from './stats';
import { formatFixed, formatNum, formatSI, formatSci, parseNumberUk } from './format';
import { bisect } from './solve';
import { checkLimits } from './limits';
import { checkAnswers } from './lab';

describe('rng', () => {
  it('детермінований: однаковий ключ → однакова послідовність', () => {
    const a = makeRng('x', 1);
    const b = makeRng('x', 1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(makeRng('x', 2)()).not.toEqual(makeRng('x', 1)());
  });
  it('hashString дає 32-бітне ціле', () => {
    const h = hashString('діод');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
  it('gaussian має приблизно нульове середнє й одиничне СКВ', () => {
    const r = makeRng('g');
    const xs = Array.from({ length: 20000 }, () => gaussian(r));
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });
});

describe('instruments', () => {
  it('quantize і decimalsForStep', () => {
    expect(quantize(0.683, 0.05)).toBeCloseTo(0.7, 10);
    expect(decimalsForStep(0.05)).toBe(2);
    expect(decimalsForStep(0.1)).toBe(1);
    expect(decimalsForStep(0.001)).toBe(3);
    expect(decimalsForStep(5)).toBe(0);
  });
  it('стрілковий: похибка = клас·межа/100, відлік до половини поділки', () => {
    // межа 30 мА, 150 поділок → поділка 0,2 мА, відлік 0,1 мА; Δ = 1,0·30/100 = 0,3 мА
    expect(resolution(ANALOG_MILLIAMMETER, 1)).toBeCloseTo(0.1);
    expect(instrumentAbsError(ANALOG_MILLIAMMETER, 1, 12)).toBeCloseTo(0.3);
    const rd = readInstrument(ANALOG_MILLIAMMETER, 1, 12.34e-3, makeRng('a'));
    expect(rd.overRange).toBe(false);
    expect(rd.value).not.toBeNull();
    expect(Math.abs(rd.value! - 12.34)).toBeLessThan(1.0);
    expect(rd.range.unit).toBe('мА');
  });
  it('стрілковий зашкалює понад межу', () => {
    const rd = readInstrument(ANALOG_MILLIAMMETER, 0, 15e-3, makeRng('b'));
    expect(rd.overRange).toBe(true);
    expect(rd.value).toBeNull();
  });
  it('цифровий: OL понад 1999 од.', () => {
    const ok = readInstrument(DMM_DCV, 1, 1.5, makeRng('c'));
    expect(ok.value).not.toBeNull();
    expect(ok.decimals).toBe(3);
    const ol = readInstrument(DMM_DCV, 1, 2.5, makeRng('c'));
    expect(ol.overRange).toBe(true);
  });
  it('цифровий: похибка ±(a% + n од.)', () => {
    // 2 В: од. розряду 0,001 В; Δ = 0,005·1,5 + 2·0,001 = 0,0095 В
    expect(instrumentAbsError(DMM_DCV, 1, 1.5)).toBeCloseTo(0.0095, 6);
  });
  it('autoRange підбирає найменшу межу без зашкалювання', () => {
    expect(autoRange(DMM_OHM, 150)).toBe(0);
    expect(autoRange(DMM_OHM, 2300)).toBe(2);
    expect(autoRange(ANALOG_MILLIAMMETER, 50e-3)).toBe(2);
  });
  it('повтори трохи різняться, але в межах похибки приладу', () => {
    const vals = [1, 2, 3, 4, 5, 6].map(
      (i) => readInstrument(DMM_DCV, 1, 0.683, makeRng('rep', i)).value!,
    );
    for (const v of vals) expect(Math.abs(v - 0.683)).toBeLessThanOrEqual(0.0055);
    expect(new Set(vals).size).toBeGreaterThan(1);
  });
});

describe('stats', () => {
  it('mean, meanAbsDev', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(meanAbsDev([1, 2, 3])).toBeCloseTo(2 / 3);
  });
  it('linearFit відновлює пряму', () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((v) => 2.5 * v - 1);
    const f = linearFit(x, y);
    expect(f.slope).toBeCloseTo(2.5, 10);
    expect(f.intercept).toBeCloseTo(-1, 10);
    expect(f.r2).toBeCloseTo(1, 10);
  });
  it('fitThroughOrigin', () => {
    const f = fitThroughOrigin([1, 2, 3], [3, 6, 9]);
    expect(f.slope).toBeCloseTo(3, 10);
  });
  it('relError з показниками степеня (як Ē = Δm/m + 2ΔR/R)', () => {
    const e = relError([
      { value: 100, abs: 1 },
      { value: 10, abs: 0.1, power: 2 },
    ]);
    expect(e).toBeCloseTo(0.03, 10);
  });
  it('roundResult: похибка до 1–2 значущих цифр', () => {
    expect(roundResult(0.68347, 0.0123)).toEqual({ value: 0.683, abs: 0.012, decimals: 3 });
    expect(roundResult(1234.5, 47)).toEqual({ value: 1230, abs: 50, decimals: -1 });
  });
  it('withinTol', () => {
    expect(withinTol(1.05, 1, 0.05)).toBe(true);
    expect(withinTol(1.06, 1, 0.05)).toBe(false);
  });
});

describe('format', () => {
  it('кома як десятковий роздільник', () => {
    expect(formatFixed(0.683, 2)).toBe('0,68');
    expect(formatNum(0.68300001)).toBe('0,683');
  });
  it('науковий запис і префікси SI', () => {
    expect(formatSci(2.4e19, 3)).toBe('2,40·10¹⁹');
    expect(formatSci(9.999e-5, 2)).toBe('1,0·10⁻⁴');
    expect(formatSI(0.0123, 'А')).toBe('12,3 мА');
    expect(formatSI(2.2e-5, 'А')).toBe('22 мкА');
    expect(formatSI(4700, 'Ом')).toBe('4,7 кОм');
  });
  it('parseNumberUk розуміє різні записи', () => {
    expect(parseNumberUk('1,5')).toBe(1.5);
    expect(parseNumberUk('1.5e-3')).toBe(1.5e-3);
    expect(parseNumberUk('1,5·10^-3')).toBeCloseTo(1.5e-3);
    expect(parseNumberUk('2*10^19')).toBe(2e19);
    expect(parseNumberUk('abc')).toBeNull();
    expect(parseNumberUk('')).toBeNull();
  });
});

describe('solve', () => {
  it('bisect знаходить корінь', () => {
    expect(bisect((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 10);
    expect(() => bisect((x) => x * x + 1, 0, 2)).toThrow();
  });
});

describe('limits', () => {
  it('ok → overload → destroyed (липкий)', () => {
    const l = { maxCurrent_A: 0.1 };
    expect(checkLimits(l, { current_A: 0.05 }, 'ok')).toBe('ok');
    expect(checkLimits(l, { current_A: 0.12 }, 'ok')).toBe('overload');
    expect(checkLimits(l, { current_A: 0.2 }, 'ok')).toBe('destroyed');
    expect(checkLimits(l, { current_A: 0 }, 'destroyed')).toBe('destroyed');
  });
});

describe('lab.checkAnswers', () => {
  it('перевіряє числові й вибіркові відповіді', () => {
    const res = checkAnswers(
      [
        { id: 'Eg', label: 'Eg', unit: 'еВ', kind: 'number', ref: 0.7, relTol: 0.05 },
        { id: 'mat', label: 'Матеріал', unit: '', kind: 'choice', ref: 'Ge' },
      ],
      { Eg: 0.72, mat: 'Si' },
    );
    expect(res[0]!.ok).toBe(true);
    expect(res[1]!.ok).toBe(false);
  });
});
