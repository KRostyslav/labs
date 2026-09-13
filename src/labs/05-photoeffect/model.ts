/**
 * Фізична модель ЛР №5 «Дослідження внутрішнього фотоефекту та фотоелектричних приладів».
 *
 * Три частини роботи — три моделі на спільній «оптичній лаві»:
 *   А. Фоторезистор (CdS-типу): провідність G = 1/R_темн + (1/R₁₀)·(E/10 лк)^γ.
 *   Б. Кремнієвий фотодіод: I_ф = S_E·E; I_кз ≈ I_ф; U_хх ≈ n·U_T·ln(I_ф/I_s).
 *   В. Спектральна характеристика: I(λ) = R_λ·P, R_λ = QE(λ)·λ/1239,84 (А/Вт), різкий спад за λ_ч.
 *
 * Правила (як у шаблоні): лише чисті функції, одиниці SI (крім λ — у нм і E — у лк, як у
 * лабораторії), жодної випадковості — шум додає Simulation.tsx через useNoise().
 */
import type { AnswerSpec, LabModel } from '@/core/lab';
import { autoRange } from '@/core/instruments';
import { DMM_DCA } from '@/core/instrumentCatalog';
import { bisect } from '@/core/solve';
import { linearFit } from '@/core/stats';
import { PHYS, cutoffWavelength_nm, thermalVoltage } from '@/physics/constants';
import { MATERIALS, type MaterialId } from '@/physics/materials';

/* ================================================================== */
/* Оптична лава (частини А і Б)                                        */
/* ================================================================== */

/** Сила світла лампи розжарювання, кд. */
export const LAMP_INTENSITY_CD = 100;
/** Освітленість від кімнатного світла, коли штора відкрита, лк. */
export const ROOM_LIGHT_LX = 5;
/** Коефіцієнти пропускання нейтральних світлофільтрів (1 — без фільтра). */
export const FILTERS = [1, 0.5, 0.25, 0.1] as const;
/** Межі та крок переміщення фотоприймача вздовж лави, м. */
export const DIST_MIN_M = 0.1;
export const DIST_MAX_M = 1.5;
export const DIST_STEP_M = 0.01;
/** Відносне СКВ мерехтіння лампи (1 %) — використовує Simulation через addNoise. */
export const LAMP_FLICKER_REL = 0.01;

/** Стан оптичної лави, яким керує студент. */
export interface OpticsParams {
  /** Лампа увімкнена */
  lampOn: boolean;
  /** Відстань від лампи до фотоприймача, м */
  distance_m: number;
  /** Пропускання світлофільтра (1; 0,5; 0,25; 0,1) */
  filterT: number;
  /** Штора відкрита — додається кімнатне світло */
  curtainOpen: boolean;
}

/**
 * Освітленість фотоприймача (закон обернених квадратів), лк:
 *   E = T·I_v / r² + E_фон.
 * Світло від точкового джерела «розтікається» по поверхні сфери площею 4πr²,
 * тому вдвічі далі — вчетверо темніше.
 */
export function illuminance(p: OpticsParams): number {
  const lamp = p.lampOn ? (p.filterT * LAMP_INTENSITY_CD) / (p.distance_m * p.distance_m) : 0;
  return lamp + (p.curtainOpen ? ROOM_LIGHT_LX : 0);
}

/* ================================================================== */
/* Частина А. Фоторезистор                                             */
/* ================================================================== */

/** Параметри фоторезистора (прихована «істина»). */
export interface Photoresistor {
  name: string;
  /** Темновий опір (без освітлення), Ом */
  darkR_Ohm: number;
  /** Опір фотопровідної складової при E = 10 лк, Ом */
  r10_Ohm: number;
  /** Показник люкс-амперної характеристики: I_ф ∝ E^γ (для CdS γ ≈ 0,5–1) */
  gamma: number;
  /** Допустима потужність розсіювання, Вт */
  maxPower_W: number;
}

/** Навчальний фоторезистор R1 і фоторезистор кінцевого завдання «X». */
export const PHOTORESISTORS = {
  R1: { name: 'Фоторезистор R1 (CdS)', darkR_Ohm: 5e6, r10_Ohm: 20e3, gamma: 0.7, maxPower_W: 0.1 },
  X: { name: 'Фоторезистор «X»', darkR_Ohm: 8e6, r10_Ohm: 30e3, gamma: 0.62, maxPower_W: 0.1 },
} satisfies Record<string, Photoresistor>;

export type PhotoresistorId = keyof typeof PHOTORESISTORS;

/**
 * Провідність фоторезистора, См:  G = 1/R_темн + (1/R₁₀)·(E/10)^γ.
 * Перший доданок — «темнова» провідність (власні носії є завжди), другий — носії,
 * народжені світлом: чим більше фотонів, тим більше пар «електрон — дірка».
 */
export function photoConductance(pr: Photoresistor, E_lx: number): number {
  const photo = E_lx > 0 ? (1 / pr.r10_Ohm) * (E_lx / 10) ** pr.gamma : 0;
  return 1 / pr.darkR_Ohm + photo;
}

/** Параметри кола частини А. */
export interface PrCircuitParams {
  /** Напруга джерела, В */
  sourceVoltage_V: number;
  /** Освітленість фоторезистора, лк */
  illuminance_lx: number;
  /** Внутрішній опір амперметра на обраній межі, Ом */
  ammeterR_Ohm: number;
}

/** Істинні величини в колі фоторезистора. */
export interface PrTruth {
  /** Струм у колі (показ амперметра), А */
  current_A: number;
  /** Напруга на фоторезисторі (показ вольтметра), В */
  voltage_V: number;
  /** Потужність, що виділяється у фоторезисторі, Вт */
  power_W: number;
  /** Опір фоторезистора, Ом */
  resistance_Ohm: number;
}

/**
 * Коло «джерело → амперметр → фоторезистор», вольтметр паралельно фоторезистору
 * (вольтметр вважаємо ідеальним). Закон Ома для кола: I = U₀ / (R_A + R_ф).
 */
export function simulatePhotoresistor(p: PrCircuitParams, pr: Photoresistor): PrTruth {
  const R = 1 / photoConductance(pr, p.illuminance_lx);
  const current_A = p.sourceVoltage_V / (R + p.ammeterR_Ohm);
  const voltage_V = current_A * R;
  return { current_A, voltage_V, power_W: current_A * voltage_V, resistance_Ohm: R };
}

/**
 * Те саме коло, але з опором амперметра на тій межі, яку вибрав би уважний студент
 * (найменша межа без зашкалювання). Потрібно для еталонних відповідей і тестів.
 */
export function simulatePhotoresistorAutoRange(
  U0_V: number,
  E_lx: number,
  pr: Photoresistor,
): PrTruth & { rangeIdx: number } {
  let idx = DMM_DCA.ranges.length - 1;
  let t = simulatePhotoresistor({ sourceVoltage_V: U0_V, illuminance_lx: E_lx, ammeterR_Ohm: 0 }, pr);
  for (let k = 0; k < 3; k++) {
    idx = autoRange(DMM_DCA, t.current_A);
    const R_A = DMM_DCA.ranges[idx]!.internalR_Ohm ?? 0;
    t = simulatePhotoresistor({ sourceVoltage_V: U0_V, illuminance_lx: E_lx, ammeterR_Ohm: R_A }, pr);
  }
  return { ...t, rangeIdx: idx };
}

/* ================================================================== */
/* Частина Б. Фотодіод                                                  */
/* ================================================================== */

/** Параметри фотодіода. */
export interface Photodiode {
  name: string;
  /** Інтегральна чутливість S_E = I_ф / E, А/лк */
  sensitivity_A_per_lx: number;
  /** Струм насичення p–n-переходу, А */
  Is_A: number;
  /** Коефіцієнт неідеальності */
  n: number;
  /** Опір витоку (шунтувальний), Ом */
  shuntR_Ohm: number;
}

/** Кремнієвий фотодіод, подібний до BPW34. */
export const PHOTODIODE: Photodiode = {
  name: 'Фотодіод VD1 (Si)',
  sensitivity_A_per_lx: 5e-8,
  Is_A: 7e-11,
  n: 1.1,
  shuntR_Ohm: 5e8,
};

/** Температура фотодіода, К. */
export const PD_TEMP_K = 300;

/** Фотострум (струм, «народжений» світлом), А:  I_ф = S_E·E. */
export function photodiodePhotocurrent(pd: Photodiode, E_lx: number): number {
  return pd.sensitivity_A_per_lx * Math.max(0, E_lx);
}

/** Струм через сам p–n-перехід і опір витоку при напрузі V, А:  I_s·(e^(V/nU_T) − 1) + V/R_ш. */
export function diodeCurrent(pd: Photodiode, V: number): number {
  const nUT = pd.n * thermalVoltage(PD_TEMP_K);
  return pd.Is_A * Math.expm1(V / nUT) + V / pd.shuntR_Ohm;
}

/**
 * Струм короткого замикання (фотодіод замкнений на амперметр з опором R_A), А.
 * Розв'язуємо I = I_ф − I_діода(I·R_A). Оскільки I·R_A — лише десятки мілівольт,
 * I_кз ≈ I_ф, тобто пропорційний освітленості.
 */
export function shortCircuitCurrent(pd: Photodiode, E_lx: number, ammeterR_Ohm: number): number {
  const Iph = photodiodePhotocurrent(pd, E_lx);
  if (Iph <= 0) return 0;
  return bisect((I) => Iph - diodeCurrent(pd, I * ammeterR_Ohm) - I, 0, Iph, 1e-15);
}

/**
 * Напруга холостого ходу (фотодіод під'єднано лише до вольтметра з опором R_V), В.
 * Увесь фотострум «повертається» через сам перехід: I_ф = I_s·(e^(U/nU_T) − 1) + U/R_ш + U/R_V.
 * Звідси U_хх ≈ n·U_T·ln(I_ф/I_s) — зростає як логарифм освітленості.
 */
export function openCircuitVoltage(pd: Photodiode, E_lx: number, voltmeterR_Ohm = Infinity): number {
  const Iph = photodiodePhotocurrent(pd, E_lx);
  if (Iph <= 0) return 0;
  const nUT = pd.n * thermalVoltage(PD_TEMP_K);
  const hi = nUT * Math.log(Iph / pd.Is_A + 1) + 0.01;
  return bisect((V) => Iph - diodeCurrent(pd, V) - V / voltmeterR_Ohm, 0, hi, 1e-12);
}

/* ================================================================== */
/* Частина В. Спектральна характеристика                               */
/* ================================================================== */

/** Фотоприймач для спектральних вимірювань. */
export interface SpectralDetector {
  name: string;
  /** Матеріал (з src/physics/materials.ts) — задає Eg і тип забороненої зони */
  material: MaterialId;
  /** Максимальний квантовий вихід (частка фотонів, що дають носій у колі) */
  qeMax: number;
}

/** Навчальні фотоприймачі і невідомий фотоприймач «X» (CdSe, інший квантовий вихід). */
export const SPECTRAL_DETECTORS = {
  CdS: { name: 'CdS', material: 'CdS', qeMax: 0.6 },
  CdSe: { name: 'CdSe', material: 'CdSe', qeMax: 0.6 },
  GaAs: { name: 'GaAs', material: 'GaAs', qeMax: 0.75 },
  Si: { name: 'Si', material: 'Si', qeMax: 0.8 },
  Ge: { name: 'Ge', material: 'Ge', qeMax: 0.7 },
  X: { name: 'Фотоприймач «X»', material: 'CdSe', qeMax: 0.45 },
} satisfies Record<string, SpectralDetector>;

export type DetectorId = keyof typeof SPECTRAL_DETECTORS;

/** Діапазон і крок монохроматора, нм. */
export const LAMBDA_MIN_NM = 350;
export const LAMBDA_MAX_NM = 2000;
export const LAMBDA_STEP_NM = 10;
/**
 * Потужність світла на виході монохроматора (підтримується сталою), Вт.
 * 100 мкВт (а не 1 мкВт), щоб струм був десятки мікроампер — інакше на межі 200 мкА
 * мультиметра (крок 0,1 мкА) спектральну криву не вдалося б розгледіти.
 */
export const MONO_POWER_W = 100e-6;
/** Масштаб спаду чутливості в короткохвильовій області (поглинання біля самої поверхні), нм. */
export const SHORT_EDGE_NM = 100;
/** Відносне СКВ нестабільності потужності монохроматора. */
export const MONO_NOISE_REL = 0.005;

/** Червона межа фотоефекту для фотоприймача, нм:  λ_ч = hc/Eg = 1239,84/Eg. */
export function detectorCutoff_nm(d: SpectralDetector): number {
  return cutoffWavelength_nm(MATERIALS[d.material].Eg300);
}

/**
 * Квантовий вихід QE(λ): частка фотонів, які дали носій заряду в колі.
 *   QE = QE_max · 1/(1 + e^((λ − λ_ч)/w)) · (1 − e^(−(λ − 300)/s))
 * Перший множник — «сходинка» біля червоної межі (w = 1 % λ_ч для прямозонних,
 * 3 % — для непрямозонних матеріалів, у них край поглинання пологіший);
 * другий — спад у фіолетовій області (світло поглинається біля поверхні й «губиться»).
 */
export function quantumEfficiency(d: SpectralDetector, lambda_nm: number): number {
  if (lambda_nm <= 300) return 0;
  const lc = detectorCutoff_nm(d);
  const w = (MATERIALS[d.material].directGap ? 0.01 : 0.03) * lc;
  const edge = 1 / (1 + Math.exp((lambda_nm - lc) / w));
  const shortWave = 1 - Math.exp(-(lambda_nm - 300) / SHORT_EDGE_NM);
  return d.qeMax * edge * shortWave;
}

/** Спектральна чутливість R_λ = QE·λ/1239,84, А/Вт (λ у нм). */
export function responsivity(d: SpectralDetector, lambda_nm: number): number {
  return (quantumEfficiency(d, lambda_nm) * lambda_nm) / PHYS.hcEvNm;
}

/** Фотострум при сталій потужності P монохроматора, А:  I = R_λ·P. */
export function spectralCurrent(d: SpectralDetector, lambda_nm: number, power_W = MONO_POWER_W): number {
  return responsivity(d, lambda_nm) * power_W;
}

/** Сітка довжин хвиль монохроматора (350, 360, … 2000 нм). */
export function lambdaGrid(from = LAMBDA_MIN_NM, to = LAMBDA_MAX_NM, step = LAMBDA_STEP_NM): number[] {
  const out: number[] = [];
  for (let l = from; l <= to + 1e-9; l += step) out.push(Math.round(l));
  return out;
}

/* ================================================================== */
/* Процедури обробки — ТІ САМІ, що в розділі «Обробка результатів»     */
/* ================================================================== */

/** Темновий опір за одним виміром у темряві: R_темн = U / I_темн, Ом. */
export function darkResistance(U_V: number, Idark_A: number): number {
  return U_V / Idark_A;
}

/** Фотострум фоторезистора: I_ф = I − U/R_темн (віднімаємо темновий струм при тій самій U). */
export function prPhotocurrent(I_A: number, U_V: number, darkR_Ohm: number): number {
  return I_A - U_V / darkR_Ohm;
}

/** γ — нахил прямої lg I_ф від lg E (МНК). Одиниці I_ф на нахил не впливають. */
export function gammaFromLux(E_lx: readonly number[], Iph: readonly number[]): number {
  const x: number[] = [];
  const y: number[] = [];
  E_lx.forEach((E, i) => {
    const I = Iph[i]!;
    if (E > 0 && I > 0) {
      x.push(Math.log10(E));
      y.push(Math.log10(I));
    }
  });
  return linearFit(x, y).slope;
}

/**
 * Червона межа за спектральною кривою: довжина хвилі на довгохвильовому краї, де сигнал
 * падає до половини максимального. Між двома сусідніми точками — лінійна інтерполяція.
 * @returns λ_ч, нм (NaN, якщо спаду до половини в даних немає)
 */
export function halfHeightCutoff(lambda_nm: readonly number[], I: readonly number[]): number {
  const pts = lambda_nm.map((l, i) => ({ l, I: I[i]! })).sort((a, b) => a.l - b.l);
  if (pts.length < 2) return NaN;
  let iMax = 0;
  pts.forEach((p, i) => {
    if (p.I > pts[iMax]!.I) iMax = i;
  });
  const half = pts[iMax]!.I / 2;
  for (let k = iMax + 1; k < pts.length; k++) {
    const b = pts[k]!;
    if (b.I <= half) {
      const a = pts[k - 1]!;
      return a.l + ((half - a.I) * (b.l - a.l)) / (b.I - a.I);
    }
  }
  return NaN;
}

/** Ширина забороненої зони з червоної межі: Eg = 1239,84 / λ_ч, еВ. */
export function bandGapFromCutoff(lambda_nm: number): number {
  return PHYS.hcEvNm / lambda_nm;
}

/* ================================================================== */
/* Контракт LabModel                                                    */
/* ================================================================== */

/** Зразок роботи: фоторезистор (частина А) + фотоприймач для спектральних вимірювань (частина В). */
export interface Sample {
  name: string;
  photoresistor: Photoresistor;
  detector: SpectralDetector;
}

/** Параметри, які змінює студент (усі частини разом). */
export interface Params {
  optics: OpticsParams;
  sourceVoltage_V: number;
  ammeterR_Ohm: number;
  wavelength_nm: number;
}

/** Істинні величини (без шуму). */
export interface Truth {
  illuminance_lx: number;
  photoresistor: PrTruth;
  spectralCurrent_A: number;
}

/** Навчальний комплект і комплект кінцевого завдання «X». */
export const SAMPLES = {
  train: { name: 'Навчальний комплект', photoresistor: PHOTORESISTORS.R1, detector: SPECTRAL_DETECTORS.Si },
  X: { name: 'Комплект «X»', photoresistor: PHOTORESISTORS.X, detector: SPECTRAL_DETECTORS.X },
} satisfies Record<string, Sample>;

export type SampleId = keyof typeof SAMPLES;

/** Усе разом: освітленість → коло фоторезистора; довжина хвилі → струм фотоприймача. */
export function simulate(p: Params, s: Sample): Truth {
  const E = illuminance(p.optics);
  return {
    illuminance_lx: E,
    photoresistor: simulatePhotoresistor(
      { sourceVoltage_V: p.sourceVoltage_V, illuminance_lx: E, ammeterR_Ohm: p.ammeterR_Ohm },
      s.photoresistor,
    ),
    spectralCurrent_A: spectralCurrent(s.detector, p.wavelength_nm),
  };
}

/** Рекомендовані умови кінцевого завдання (так само написано в index.mdx). */
export const TASK_PLAN = {
  /** Напруга джерела для люкс-амперної характеристики, В */
  sourceVoltage_V: 5,
  /** Відстані (T = 1, штора закрита), м */
  distances_m: [1.5, 1.2, 1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2],
} as const;

/**
 * Еталонні відповіді кінцевого завдання — процедура студента на даних без шуму:
 *  1) темновий струм при U₀ = 5 В → R_темн; 2) I при відстанях TASK_PLAN → I_ф = I − U/R_темн;
 *  3) γ — нахил lg I_ф(lg E); 4) спектр на сітці 10 нм → λ_ч на половині висоти → Eg = 1239,84/λ_ч.
 */
export function referenceAnswers(s: Sample): AnswerSpec[] {
  const U0 = TASK_PLAN.sourceVoltage_V;
  const dark = simulatePhotoresistorAutoRange(U0, 0, s.photoresistor);
  const Rd = darkResistance(dark.voltage_V, dark.current_A);
  const E: number[] = [];
  const Iph: number[] = [];
  for (const r of TASK_PLAN.distances_m) {
    const e = illuminance({ lampOn: true, distance_m: r, filterT: 1, curtainOpen: false });
    const t = simulatePhotoresistorAutoRange(U0, e, s.photoresistor);
    E.push(e);
    Iph.push(prPhotocurrent(t.current_A, t.voltage_V, Rd));
  }
  const grid = lambdaGrid();
  const lc = halfHeightCutoff(
    grid,
    grid.map((l) => spectralCurrent(s.detector, l)),
  );
  return [
    { id: 'gamma', label: 'Показник люкс-амперної характеристики γ', unit: '', kind: 'number', ref: gammaFromLux(E, Iph), absTol: 0.05 },
    { id: 'Eg', label: 'Ширина забороненої зони Eg (з червоної межі)', unit: 'еВ', kind: 'number', ref: bandGapFromCutoff(lc), relTol: 0.04 },
    { id: 'material', label: 'Матеріал фотоприймача', unit: '', kind: 'choice', ref: s.detector.material },
  ];
}

export const model: LabModel<Params, Sample, Truth> = {
  id: 'photoeffect',
  samples: SAMPLES,
  taskSampleId: 'X',
  simulate,
  referenceAnswers,
};
