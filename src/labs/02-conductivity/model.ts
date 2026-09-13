/**
 * Фізична модель лаби №2 «Визначення питомої електропровідності напівпровідників».
 *
 * Стенд: стабілізоване джерело струму (0,5–10 мА, обмеження 20 В) → перемикач напрямку S1 →
 * міліамперметр → брусок напівпровідника (струмові контакти 1 і 4 на торцях). Між зондами 2 і 3
 * (відстань l) — вольтметр. Перемикач S2 під'єднує вольтметр або до зондів 2–3 (4-зондовий метод),
 * або до струмових контактів 1–4 (2-зондовий метод: разом з опором контактів і всією довжиною L).
 *
 * Правила (як у шаблоні): лише чисті функції, одиниці SI, жодної випадковості.
 * Шум приладів додає Simulation через readInstrument().
 */
import type { AnswerSpec, LabModel } from '@/core/lab';
import { PHYS } from '@/physics/constants';
import { MATERIALS, mobility, type MaterialId } from '@/physics/materials';
import { conductivity, type Sample as SemiSample } from '@/physics/sample';
import { fitThroughOrigin } from '@/core/stats';

/** Температура в лабораторії, К (20 °C). За неї рахуються σ і табличні μ у Довіднику лаби. */
export const T_ROOM_K = 293;

/** Найбільша напруга, яку може дати джерело струму, В. Якщо потрібно більше — «ОБМЕЖЕННЯ». */
export const SOURCE_LIMIT_V = 20;

/**
 * Відносна похибка встановлення струму джерелом: справжній струм на 0,6 % менший за
 * встановлений на ручці. Тому в таблицю записують показ міліамперметра, а не ручки.
 */
export const SOURCE_SETPOINT_ERR = -0.006;

/** Довжина бруска між струмовими контактами 1 і 4, м (однакова для всіх зразків). */
export const BAR_LENGTH_M = 20e-3;

/** Номінальна відстань між потенціальними зондами 2 і 3, м. */
export const PROBE_SPACING_M = 10e-3;

/** Схема вимірювання: 4-зондова (вольтметр на зондах 2–3) або 2-зондова (на контактах 1–4). */
export type Method = '4p' | '2p';

/** Параметри, які змінює студент. */
export interface Params {
  /** Струм, встановлений на ручці джерела, А (0 — джерело вимкнене). */
  setCurrent_A: number;
  /** Положення перемикача напрямку S1: +1 — прямий струм, −1 — зворотний. */
  polarity: 1 | -1;
  /** Положення перемикача S2. */
  method: Method;
  /** Внутрішній опір міліамперметра на обраній межі, Ом (впливає лише на напругу джерела). */
  ammeterR_Ohm: number;
}

/** Параметри зразка (прихована «істина»). */
export interface Sample {
  /** Повна назва для таблиць: «Зразок n-Si (навчальний)». */
  name: string;
  /** Короткий підпис на схемі. */
  label: string;
  /** Що знає студент про зразок (для «X» — лише матеріал і тип). */
  info: string;
  /** Напівпровідник: матеріал, тип провідності, концентрація домішки. */
  semi: SemiSample;
  /** Ширина бруска b, м. */
  width_m: number;
  /** Товщина бруска d, м. */
  thickness_m: number;
  /** Справжня відстань між зондами 2 і 3, м. */
  probeSpacing_m: number;
  /** Довжина між струмовими контактами L, м. */
  length_m: number;
  /** Опір КОЖНОГО струмового контакту (метал–напівпровідник), Ом. */
  contactR_Ohm: number;
  /**
   * Термо-ЕРС на контактах, В. Виникає через різницю температур кінців бруска і НЕ змінює
   * знак при зміні напрямку струму — тому її прибирають усередненням U = (U₊ − U₋)/2.
   */
  thermoEmf_V: number;
}

/** Істинні значення величин (без шуму). */
export interface Truth {
  /** Струм через зразок з урахуванням напрямку S1, А (після перемикача — зі знаком). */
  current_A: number;
  /** Напруга, яку дає джерело, В (за модулем). */
  sourceVoltage_V: number;
  /** Джерело не може дати встановлений струм (потрібно понад 20 В). */
  inLimit: boolean;
  /** Напруга між зондами 2–3, В. */
  u4_V: number;
  /** Напруга між контактами 1–4, В. */
  u2_V: number;
  /** Те, що показує вольтметр при поточному положенні S2, В. */
  voltmeter_V: number;
  /** Питома провідність матеріалу, См/м. */
  sigma_Sm: number;
  /** Опір ділянки між зондами R₄ = l/(σbd), Ом. */
  r4_Ohm: number;
  /** Опір між контактами 1–4: R₂ = L/(σbd) + 2R_к, Ом. */
  r2_Ohm: number;
}

const Si = MATERIALS.Si;
const Ge = MATERIALS.Ge;

/**
 * Зразки. Навчальні — n-Si і p-Ge з N = 10²¹ м⁻³ (10¹⁵ см⁻³).
 * «X» — p-Si з N_A = 4·10²⁰ м⁻³: студент знає лише матеріал і тип, концентрацію визначає сам.
 * Опір «X» великий, тому при струмі понад ≈ 8,5 мА джерело переходить в «ОБМЕЖЕННЯ».
 */
export const SAMPLES = {
  nSi: {
    name: 'Зразок n-Si (навчальний)',
    label: 'n-Si',
    info: 'кремній n-типу (донори — фосфор), N ≈ 10²¹ м⁻³',
    semi: { material: Si, type: 'n', doping_m3: 1e21 },
    width_m: 4.12e-3,
    thickness_m: 1.03e-3,
    probeSpacing_m: 10.0e-3,
    length_m: BAR_LENGTH_M,
    contactR_Ohm: 150,
    thermoEmf_V: 0.8e-3,
  },
  pGe: {
    name: 'Зразок p-Ge (навчальний)',
    label: 'p-Ge',
    info: 'германій p-типу (акцептори — галій), N ≈ 10²¹ м⁻³',
    semi: { material: Ge, type: 'p', doping_m3: 1e21 },
    width_m: 3.94e-3,
    thickness_m: 0.97e-3,
    probeSpacing_m: 10.0e-3,
    length_m: BAR_LENGTH_M,
    contactR_Ohm: 90,
    thermoEmf_V: -0.45e-3,
  },
  X: {
    name: 'Зразок «X» (p-Si, концентрація невідома)',
    label: 'X',
    info: 'кремній p-типу, концентрація акцепторів невідома',
    semi: { material: Si, type: 'p', doping_m3: 4e20 },
    width_m: 4.06e-3,
    thickness_m: 0.96e-3,
    probeSpacing_m: 10.0e-3,
    length_m: BAR_LENGTH_M,
    contactR_Ohm: 330,
    thermoEmf_V: 0.62e-3,
  },
} satisfies Record<string, Sample>;

export type SampleId = keyof typeof SAMPLES;

/**
 * Рухливість основних носіїв при температурі стенда (20 °C), м²/(В·с) — саме це значення
 * студент бере з Довідника лаби. μ залежить від температури: μ(T) = μ(300)·(T/300)^(−k).
 */
export function referenceMobility(material: MaterialId, carrier: 'n' | 'p'): number {
  return mobility(MATERIALS[material], T_ROOM_K, carrier);
}

/** Рухливість основних носіїв зразка (n-тип — електрони, p-тип — дірки), м²/(В·с). */
export function majorityMobility(s: Sample): number {
  return referenceMobility(s.semi.material.id, s.semi.type === 'p' ? 'p' : 'n');
}

/**
 * Чиста фізика стенда.
 *  σ = e(nμn + pμp) при 293 К;
 *  U₄ = ±I·l/(σbd) + U_терм;   U₂ = ±I·(L/(σbd) + 2R_к) + U_терм;
 *  джерело дає I, поки I·(R_L + 2R_к + R_A) ≤ 20 В, інакше — лише 20 В (обмеження).
 */
export function simulate(p: Params, s: Sample): Truth {
  const sigma_Sm = conductivity(s.semi, T_ROOM_K);
  const area_m2 = s.width_m * s.thickness_m;
  const r4_Ohm = s.probeSpacing_m / (sigma_Sm * area_m2);
  const rBar_Ohm = s.length_m / (sigma_Sm * area_m2);
  const r2_Ohm = rBar_Ohm + 2 * s.contactR_Ohm;
  const loop_Ohm = r2_Ohm + p.ammeterR_Ohm;

  const wanted_A = Math.max(0, p.setCurrent_A) * (1 + SOURCE_SETPOINT_ERR);
  const inLimit = wanted_A * loop_Ohm > SOURCE_LIMIT_V;
  const mag_A = inLimit ? SOURCE_LIMIT_V / loop_Ohm : wanted_A;
  const current_A = p.polarity * mag_A;

  const u4_V = current_A * r4_Ohm + s.thermoEmf_V;
  const u2_V = current_A * r2_Ohm + s.thermoEmf_V;
  return {
    current_A,
    sourceVoltage_V: mag_A * loop_Ohm,
    inLimit,
    u4_V,
    u2_V,
    voltmeter_V: p.method === '4p' ? u4_V : u2_V,
    sigma_Sm,
    r4_Ohm,
    r2_Ohm,
  };
}

/** Виміряні студентом дані для обробки (одиниці — як у таблицях стенда). */
export interface StudentData {
  /** Струм кожного рядка, мА. */
  I_mA: readonly number[];
  /** U₊ кожного рядка, мВ. */
  Uplus_mV: readonly number[];
  /** U₋ кожного рядка, мВ (від'ємні числа). */
  Uminus_mV: readonly number[];
  /** Середні розміри: ширина b, товщина d, відстань між зондами l — у мм. */
  b_mm: number;
  d_mm: number;
  l_mm: number;
  /** Рухливість основних носіїв з Довідника, м²/(В·с). */
  mu_m2Vs: number;
}

/** Результати обробки (SI). */
export interface StudentResult {
  /** Опір між зондами (нахил прямої U(I) через початок координат), Ом. */
  R_Ohm: number;
  /** Питомий опір ρ = R·b·d/l, Ом·м. */
  rho_OhmM: number;
  /** Питома провідність σ = 1/ρ, См/м. */
  sigma_Sm: number;
  /** Концентрація основних носіїв n (або p) = σ/(e·μ), м⁻³. */
  conc_m3: number;
}

/**
 * Процедура студента (так само, як у розділі «Обробка результатів»):
 *  1) U = (U₊ − U₋)/2 — прибираємо термо-ЕРС;
 *  2) R — нахил прямої U(I) через початок координат (мВ/мА = Ом);
 *  3) ρ = R·b·d/l,  σ = 1/ρ,  n = σ/(e·μ).
 */
export function processMeasurements(d: StudentData): StudentResult {
  const U = d.Uplus_mV.map((up, i) => (up - d.Uminus_mV[i]!) / 2);
  const R_Ohm = fitThroughOrigin(d.I_mA, U).slope;
  const rho_OhmM = (R_Ohm * (d.b_mm * 1e-3) * (d.d_mm * 1e-3)) / (d.l_mm * 1e-3);
  const sigma_Sm = 1 / rho_OhmM;
  return { R_Ohm, rho_OhmM, sigma_Sm, conc_m3: sigma_Sm / (PHYS.e * d.mu_m2Vs) };
}

/** Струми (мА), за якими будується еталон — ті самі, що в «Ході роботи» для зразка «X». */
export const REFERENCE_CURRENTS_MA = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Еталон кінцевого завдання: процедура студента на даних без шуму (4-зондова схема,
 * обидва напрямки струму, точні розміри, μ з Довідника лаби).
 */
export function referenceAnswers(s: Sample): AnswerSpec[] {
  const I_mA: number[] = [];
  const Uplus_mV: number[] = [];
  const Uminus_mV: number[] = [];
  for (const i of REFERENCE_CURRENTS_MA) {
    const base = { setCurrent_A: i * 1e-3, method: '4p' as const, ammeterR_Ohm: 10 };
    const tp = simulate({ ...base, polarity: 1 }, s);
    const tm = simulate({ ...base, polarity: -1 }, s);
    I_mA.push(tp.current_A * 1e3);
    Uplus_mV.push(tp.voltmeter_V * 1e3);
    Uminus_mV.push(tm.voltmeter_V * 1e3);
  }
  const r = processMeasurements({
    I_mA,
    Uplus_mV,
    Uminus_mV,
    b_mm: s.width_m * 1e3,
    d_mm: s.thickness_m * 1e3,
    l_mm: s.probeSpacing_m * 1e3,
    mu_m2Vs: majorityMobility(s),
  });
  const carrier = s.semi.type === 'p' ? 'дірок p' : 'електронів n';
  return [
    { id: 'sigma', label: 'Питома провідність σ', unit: 'См/м', kind: 'number', ref: r.sigma_Sm, relTol: 0.05 },
    { id: 'rho', label: 'Питомий опір ρ', unit: 'Ом·м', kind: 'number', ref: r.rho_OhmM, relTol: 0.05 },
    { id: 'conc', label: `Концентрація ${carrier}`, unit: 'м⁻³', kind: 'number', ref: r.conc_m3, relTol: 0.1 },
  ];
}

export const model: LabModel<Params, Sample, Truth> = {
  id: 'conductivity',
  samples: SAMPLES,
  taskSampleId: 'X',
  simulate,
  referenceAnswers,
};
