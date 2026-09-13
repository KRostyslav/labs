/**
 * Каталог типових приладів лабораторії. Лаби беруть прилади звідси, щоб усюди були однакові
 * характеристики (і Довідник показував ті самі числа, що використовує симуляція).
 *
 * Щоб додати прилад: опишіть його тут як InstrumentSpec і за потреби додайте рядок до
 * таблиці приладів у Довіднику (компонент InstrumentsTable).
 */
import type { AnalogSpec, DigitalSpec } from './instruments';

const V = (max: number, divisions: number, internalR_Ohm: number) => ({
  max, unit: 'В', factor: 1, divisions, internalR_Ohm,
});

/** Стрілковий вольтметр М2004-подібний, клас 1,0; опір 1 кОм/В. */
export const ANALOG_VOLTMETER: AnalogSpec = {
  kind: 'analog',
  name: 'Вольтметр стрілковий',
  symbol: 'V',
  accuracyClass: 1.0,
  ranges: [V(1, 100, 1e3), V(3, 150, 3e3), V(10, 100, 1e4), V(30, 150, 3e4)],
};

/** Стрілковий міліамперметр, клас 1,0. */
export const ANALOG_MILLIAMMETER: AnalogSpec = {
  kind: 'analog',
  name: 'Міліамперметр стрілковий',
  symbol: 'mA',
  accuracyClass: 1.0,
  ranges: [
    { max: 10, unit: 'мА', factor: 1e-3, divisions: 100, internalR_Ohm: 2 },
    { max: 30, unit: 'мА', factor: 1e-3, divisions: 150, internalR_Ohm: 0.7 },
    { max: 100, unit: 'мА', factor: 1e-3, divisions: 100, internalR_Ohm: 0.2 },
    { max: 300, unit: 'мА', factor: 1e-3, divisions: 150, internalR_Ohm: 0.07 },
  ],
};

/** Стрілковий мікроамперметр, клас 1,5. */
export const ANALOG_MICROAMMETER: AnalogSpec = {
  kind: 'analog',
  name: 'Мікроамперметр стрілковий',
  symbol: 'µA',
  accuracyClass: 1.5,
  ranges: [
    { max: 10, unit: 'мкА', factor: 1e-6, divisions: 100, internalR_Ohm: 1000 },
    { max: 100, unit: 'мкА', factor: 1e-6, divisions: 100, internalR_Ohm: 100 },
    { max: 1000, unit: 'мкА', factor: 1e-6, divisions: 100, internalR_Ohm: 10 },
  ],
};

/** Цифровий мультиметр DT-830-подібний: режим постійної напруги, ±(0,5 % + 2 од.), 1999 од. */
export const DMM_DCV: DigitalSpec = {
  kind: 'digital',
  name: 'Мультиметр (V⎓)',
  symbol: 'V',
  counts: 1999,
  pctReading: 0.5,
  digits: 2,
  ranges: [
    { max: 200, unit: 'мВ', factor: 1e-3, internalR_Ohm: 1e7 },
    { max: 2, unit: 'В', factor: 1, internalR_Ohm: 1e7 },
    { max: 20, unit: 'В', factor: 1, internalR_Ohm: 1e7 },
    { max: 200, unit: 'В', factor: 1, internalR_Ohm: 1e7 },
  ],
};

/** Цифровий мілівольтметр з високою роздільною здатністю (4½ розряди) — для малих напруг (Холл). */
export const DMM_MILLIVOLT: DigitalSpec = {
  kind: 'digital',
  name: 'Мілівольтметр цифровий',
  symbol: 'mV',
  counts: 19999,
  pctReading: 0.1,
  digits: 3,
  ranges: [
    { max: 20, unit: 'мВ', factor: 1e-3, internalR_Ohm: 1e9 },
    { max: 200, unit: 'мВ', factor: 1e-3, internalR_Ohm: 1e9 },
    { max: 2000, unit: 'мВ', factor: 1e-3, internalR_Ohm: 1e9 },
  ],
};

/** Цифровий мультиметр: режим постійного струму, ±(1 % + 2 од.). */
export const DMM_DCA: DigitalSpec = {
  kind: 'digital',
  name: 'Мультиметр (A⎓)',
  symbol: 'A',
  counts: 1999,
  pctReading: 1,
  digits: 2,
  ranges: [
    { max: 200, unit: 'мкА', factor: 1e-6, internalR_Ohm: 1000 },
    { max: 2000, unit: 'мкА', factor: 1e-6, internalR_Ohm: 100 },
    { max: 20, unit: 'мА', factor: 1e-3, internalR_Ohm: 10 },
    { max: 200, unit: 'мА', factor: 1e-3, internalR_Ohm: 1 },
  ],
};

/** Цифровий омметр: ±(0,8 % + 2 од.). */
export const DMM_OHM: DigitalSpec = {
  kind: 'digital',
  name: 'Мультиметр (Ω)',
  symbol: 'Ω',
  counts: 1999,
  pctReading: 0.8,
  digits: 2,
  ranges: [
    { max: 200, unit: 'Ом', factor: 1 },
    { max: 2, unit: 'кОм', factor: 1e3 },
    { max: 20, unit: 'кОм', factor: 1e3 },
    { max: 200, unit: 'кОм', factor: 1e3 },
    { max: 2, unit: 'МОм', factor: 1e6 },
    { max: 20, unit: 'МОм', factor: 1e6 },
  ],
};

/** Цифровий термометр: роздільна здатність 0,1 °C, похибка ±(0,5 % + 5 од.) ≈ ±1 °C. */
export const THERMOMETER: DigitalSpec = {
  kind: 'digital',
  name: 'Термометр цифровий',
  symbol: '°C',
  counts: 19999,
  pctReading: 0.5,
  digits: 5,
  // factor 1: значення передається одразу в °C (переведення K → °C робить лаба)
  ranges: [{ max: 2000, unit: '°C', factor: 1 }],
};

/** Тесламетр (датчик Холла): ±(2 % + 1 мТл). */
export const TESLAMETER: DigitalSpec = {
  kind: 'digital',
  name: 'Тесламетр',
  symbol: 'T',
  counts: 1999,
  pctReading: 2,
  digits: 1,
  ranges: [{ max: 2000, unit: 'мТл', factor: 1e-3 }],
};

/** Люксметр Ю116-подібний (цифровий): ±(5 % + 2 од.). */
export const LUXMETER: DigitalSpec = {
  kind: 'digital',
  name: 'Люксметр',
  symbol: 'lx',
  counts: 1999,
  pctReading: 5,
  digits: 2,
  ranges: [
    { max: 200, unit: 'лк', factor: 1 },
    { max: 2000, unit: 'лк', factor: 1 },
    { max: 20000, unit: 'лк', factor: 1 },
  ],
};

/** Засоби вимірювання довжини: абсолютна похибка (для розрахунку похибок і Довідника). */
export const LENGTH_TOOLS = {
  ruler: { name: 'Лінійка', absError_m: 0.5e-3, resolution_m: 1e-3 },
  caliper: { name: 'Штангенциркуль', absError_m: 0.05e-3, resolution_m: 0.05e-3 },
  micrometer: { name: 'Мікрометр', absError_m: 0.01e-3, resolution_m: 0.01e-3 },
} as const;
