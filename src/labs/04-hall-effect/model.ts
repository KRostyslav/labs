/**
 * Фізична модель лаби №4 «Ефект Холла».
 *
 * Стенд: брусок напівпровідника (довжина між зондами l, ширина b, товщина d) лежить у зазорі
 * електромагніта. Через зразок пропускають струм I, магнітне поле B перпендикулярне до зразка.
 * Мілівольтметр вимірює або напругу між холлівськими контактами A–B, або напругу між
 * поздовжніми зондами C–D (для визначення провідності σ).
 *
 * Правила (див. docs/ADDING_A_LAB.md): лише чисті функції, одиниці SI, жодної випадковості.
 * Шум і похибки додають прилади у Simulation.tsx.
 */
import type { AnswerSpec, LabModel } from '@/core/lab';
import { PHYS } from '@/physics/constants';
import { MATERIALS, type MaterialId } from '@/physics/materials';
import { conductivity, hallCoefficient, type ConductivityType, type Sample as SemiconductorSample } from '@/physics/sample';

/** Температура в лабораторії, К (20 °C). */
export const ROOM_T_K = 293;

/** Ширина зразка b, м (однакова для всіх зразків). */
export const SAMPLE_WIDTH_M = 4e-3;

/** Відстань між поздовжніми зондами C і D, м. */
export const PROBE_DISTANCE_M = 10e-3;

/** Індукція насичення електромагніта, Тл. */
export const MAGNET_B_SAT_T = 0.6;

/** Струм електромагніта, при якому B(I_м) починає «насичуватися», А (параметр tanh). */
export const MAGNET_I0_A = 2;

/** Межі органів керування стенда. */
export const LIMITS = {
  /** Максимальний струм через зразок, А. */
  maxCurrent_A: 10e-3,
  /** Крок регулювання струму через зразок, А. */
  currentStep_A: 0.5e-3,
  /** Максимальний струм електромагніта, А. */
  maxMagnetCurrent_A: 3,
  /** Крок регулювання струму електромагніта, А. */
  magnetStep_A: 0.1,
} as const;

/** Положення перемикача S2: +1 — поле «+B» (від нас, ⊗), −1 — поле «−B» (до нас, ⊙). */
export type FieldDir = 1 | -1;

/** Параметри, які змінює студент. */
export interface Params {
  /** Струм через зразок I (напрям «+»: від контакту 1 до контакту 2), А */
  current_A: number;
  /** Струм в обмотці електромагніта I_м, А */
  magnetCurrent_A: number;
  /** Напрям поля (перемикач S2) */
  fieldDir: FieldDir;
}

/**
 * Зразок для вимірювання ефекту Холла (прихована «істина»).
 * Матеріал, тип і концентрація домішки — як у спільній моделі src/physics/sample.ts,
 * плюс розміри та «паразитні» параметри контактів.
 */
export interface HallSample extends SemiconductorSample {
  /** Назва для інтерфейсу (для зразка «X» не розкриває ні матеріал, ні тип) */
  name: string;
  /** Товщина d, м — написана на етикетці зразка (її студент знає) */
  thickness_m: number;
  /**
   * Зсув холлівських контактів A і B вздовж зразка, м (зі знаком).
   * Через нього між A і B є частина поздовжнього спаду напруги: U_δ = I·δ/(σ·b·d).
   */
  misalignment_m: number;
  /** Термо-ЕРС контактів, В — стале зміщення, що не залежить ні від I, ні від B */
  thermalOffset_V: number;
}

/** Істинні значення величин (без шуму). */
export interface Truth {
  /** Магнітна індукція в зазорі (зі знаком), Тл */
  field_T: number;
  /** «Чиста» холлівська напруга R_H·I·B/d, В */
  hallVoltage_V: number;
  /** Напруга між контактами A і B — те, що показує мілівольтметр у положенні S3 «U_H», В */
  voltageAB_V: number;
  /** Напруга між зондами C і D — те, що показує мілівольтметр у положенні S3 «U_σ», В */
  voltageCD_V: number;
  /** Стала Холла матеріалу зразка, м³/Кл */
  hallCoefficient_m3C: number;
  /** Питома провідність, См/м */
  conductivity_Sm: number;
}

/**
 * Зразки стенда. Навчальні — германій n- і p-типу; «X» — кінцеве завдання (однаковий для всіх):
 * кремній p-типу, але студент цього не знає — тип він визначає за знаком U_H, а матеріал — за
 * рухливістю.
 */
export const SAMPLES = {
  nGe: {
    name: 'Ge n-типу',
    material: MATERIALS.Ge,
    type: 'n',
    doping_m3: 1.0e21,
    thickness_m: 0.5e-3,
    misalignment_m: 0.1e-3,
    thermalOffset_V: 40e-6,
  },
  pGe: {
    name: 'Ge p-типу',
    material: MATERIALS.Ge,
    type: 'p',
    doping_m3: 1.5e21,
    thickness_m: 0.6e-3,
    misalignment_m: -0.06e-3,
    thermalOffset_V: 25e-6,
  },
  X: {
    name: 'Зразок «X»',
    material: MATERIALS.Si,
    type: 'p',
    doping_m3: 2.5e21,
    thickness_m: 0.4e-3,
    misalignment_m: 0.12e-3,
    thermalOffset_V: 60e-6,
  },
} satisfies Record<string, HallSample>;

export type SampleId = keyof typeof SAMPLES;

/**
 * Градуювання електромагніта: B = B_нас · tanh(I_м / I₀) · (знак S2).
 * При малих струмах B зростає майже пропорційно I_м, при великих — осердя «насичується».
 */
export function magnetField(magnetCurrent_A: number, dir: FieldDir = 1): number {
  return MAGNET_B_SAT_T * Math.tanh(magnetCurrent_A / MAGNET_I0_A) * dir;
}

/**
 * Модель зразка в магнітному полі:
 *   U_AB = R_H·I·B/d + I·δ/(σ·b·d) + U_T     (перший доданок змінює знак разом з B, решта — ні)
 *   U_CD = I·l/(σ·b·d)                       (закон Ома для ділянки між зондами)
 */
export function simulate(p: Params, s: HallSample): Truth {
  const R_H = hallCoefficient(s, ROOM_T_K);
  const sigma = conductivity(s, ROOM_T_K);
  const B = magnetField(p.magnetCurrent_A, p.fieldDir);
  const I = p.current_A;
  const d = s.thickness_m;
  const area = SAMPLE_WIDTH_M * d;
  const hall = (R_H * I * B) / d;
  const misalignment = (I * s.misalignment_m) / (sigma * area);
  return {
    field_T: B,
    hallVoltage_V: hall,
    voltageAB_V: hall + misalignment + s.thermalOffset_V,
    voltageCD_V: (I * PROBE_DISTANCE_M) / (sigma * area),
    hallCoefficient_m3C: R_H,
    conductivity_Sm: sigma,
  };
}

/* ------------------------------------------------------------------ */
/* Процедура студента (ті самі формули, що в розділі «Обробка результатів»). */

/** Холлівська напруга з двох вимірів при протилежних напрямках поля: U_H = (U₁ − U₂)/2. */
export function hallFromReversal(u1_V: number, u2_V: number): number {
  return (u1_V - u2_V) / 2;
}

/** Стала Холла з одного виміру: R_H = U_H·d/(I·B), м³/Кл. */
export function hallCoefficientFrom(hall_V: number, thickness_m: number, current_A: number, field_T: number): number {
  return (hall_V * thickness_m) / (current_A * field_T);
}

/** Тип провідності за знаком R_H (при нашій умові знаків): R_H > 0 — діркова (p), R_H < 0 — електронна (n). */
export function carrierTypeFromSign(R_H: number): Exclude<ConductivityType, 'i'> {
  return R_H > 0 ? 'p' : 'n';
}

/** Концентрація основних носіїв n = 1/(e·|R_H|), м⁻³. */
export function concentrationFromHall(R_H: number): number {
  return 1 / (PHYS.e * Math.abs(R_H));
}

/** Питома провідність за напругою між зондами: σ = I·l/(U_σ·b·d), См/м. */
export function conductivityFrom(current_A: number, voltage_V: number, thickness_m: number): number {
  return (current_A * PROBE_DISTANCE_M) / (voltage_V * SAMPLE_WIDTH_M * thickness_m);
}

/** Холлівська рухливість μ = |R_H|·σ, м²/(В·с). */
export function hallMobility(R_H: number, sigma_Sm: number): number {
  return Math.abs(R_H) * sigma_Sm;
}

/** Матеріали, серед яких студент обирає відповідь у кінцевому завданні. */
export const CANDIDATE_MATERIALS: MaterialId[] = ['Si', 'Ge'];

/**
 * Матеріал за рухливістю: той, у якого табличне значення μ (для визначеного типу носіїв)
 * найближче до виміряного (порівнюємо у разах, а не в см²/(В·с)).
 */
export function materialByMobility(mu_m2Vs: number, type: 'n' | 'p'): MaterialId {
  let best: MaterialId = CANDIDATE_MATERIALS[0]!;
  let bestDist = Infinity;
  for (const id of CANDIDATE_MATERIALS) {
    const m = MATERIALS[id];
    const table = type === 'n' ? m.mun : (m.mup ?? m.mun);
    const dist = Math.abs(Math.log(mu_m2Vs / table));
    if (dist < bestDist) {
      best = id;
      bestDist = dist;
    }
  }
  return best;
}

/** Точка, в якій еталон «вимірює» U_H: I = 5 мА, I_м = 1,5 А. */
export const REFERENCE_POINT = { current_A: 5e-3, magnetCurrent_A: 1.5, sigmaCurrent_A: 2e-3 } as const;

/**
 * Еталонні відповіді кінцевого завдання — та сама процедура, що й у студента, на даних без шуму:
 * U₁ (+B), U₂ (−B) → U_H → R_H → тип і n; U_σ → σ → μ = |R_H|·σ → матеріал.
 */
export function referenceAnswers(s: HallSample): AnswerSpec[] {
  const { current_A: I, magnetCurrent_A: Im, sigmaCurrent_A: Is } = REFERENCE_POINT;
  const plus = simulate({ current_A: I, magnetCurrent_A: Im, fieldDir: 1 }, s);
  const minus = simulate({ current_A: I, magnetCurrent_A: Im, fieldDir: -1 }, s);
  const U_H = hallFromReversal(plus.voltageAB_V, minus.voltageAB_V);
  const R_H = hallCoefficientFrom(U_H, s.thickness_m, I, Math.abs(plus.field_T));
  const type = carrierTypeFromSign(R_H);
  const n = concentrationFromHall(R_H);
  const U_sigma = simulate({ current_A: Is, magnetCurrent_A: 0, fieldDir: 1 }, s).voltageCD_V;
  const sigma = conductivityFrom(Is, U_sigma, s.thickness_m);
  const mu = hallMobility(R_H, sigma);
  return [
    { id: 'type', label: 'Тип провідності', unit: '', kind: 'choice', ref: type },
    { id: 'n', label: 'Концентрація основних носіїв заряду', unit: 'м⁻³', kind: 'number', ref: n, relTol: 0.08 },
    { id: 'mu', label: 'Холлівська рухливість', unit: 'м²/(В·с)', kind: 'number', ref: mu, relTol: 0.1 },
    { id: 'material', label: 'Матеріал зразка (за рухливістю)', unit: '', kind: 'choice', ref: materialByMobility(mu, type) },
  ];
}

export const model: LabModel<Params, HallSample, Truth> = {
  id: 'hall-effect',
  samples: SAMPLES,
  taskSampleId: 'X',
  simulate,
  referenceAnswers,
};
