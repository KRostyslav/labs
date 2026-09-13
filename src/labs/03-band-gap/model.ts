/**
 * Фізична модель лаби №3: температурна залежність опору напівпровідника й металу,
 * визначення ширини забороненої зони Eg.
 *
 * Зразок — брусок довжиною l = 10 мм і перерізом S = 2 мм² в електропечі.
 *  - Напівпровідник: σ(T) = e(n·μn + p·μp) — з src/physics/sample.ts (nᵢ(T) з формулою Варшні
 *    Eg(T) і μ(T) ∝ T^(−a)); R = l / (σ·S). При нагріванні опір різко ПАДАЄ.
 *  - Метал (мідний дріт): R = R₀(1 + α·t) — опір повільно ЗРОСТАЄ.
 *
 * Студент будує графік ln R від 10³/T і за нахилом прямої обчислює Eg = 2k·(нахил).
 * Уся модель — чисті функції без випадковості (шум додають прилади в Simulation.tsx).
 */
import type { AnswerSpec, LabModel } from '@/core/lab';
import { linearFit } from '@/core/stats';
import { PHYS, celsiusToKelvin } from '@/physics/constants';
import { MATERIALS, type MaterialId } from '@/physics/materials';
import { barResistance, conductivity, type Sample as BarSample } from '@/physics/sample';

/* ------------------------------------------------------------------ */
/* Сталі стенда                                                        */
/* ------------------------------------------------------------------ */

/** Довжина зразка l, м (10 мм). */
export const SAMPLE_LENGTH_M = 10e-3;
/** Площа поперечного перерізу зразка S, м² (2 мм²). */
export const SAMPLE_AREA_M2 = 2e-6;
/** Температура в лабораторії (до неї остигає вимкнена піч), °C. */
export const AMBIENT_C = 20;
/** Стала часу печі τ, с (реального часу): за τ різниця «задана − фактична» зменшується в e ≈ 2,7 раза. */
export const FURNACE_TAU_S = 4;
/** Температура вважається встановленою, якщо |t − t_зад| менше за це значення, °C. */
export const STABLE_BAND_C = 0.3;
/** Крок задавача температури, °C. */
export const SETPOINT_STEP_C = 5;

/* ------------------------------------------------------------------ */
/* Типи                                                                */
/* ------------------------------------------------------------------ */

/** Параметри, які змінює студент (через піч): фактична температура зразка. */
export interface Params {
  /** Температура зразка, К */
  temperature_K: number;
}

/** Діапазон температур, у якому за методикою будують пряму ln R — 10³/T. */
export interface FitProcedure {
  /** Нижня межа (включно), °C */
  from_C: number;
  /** Верхня межа (включно), °C */
  to_C: number;
  /** Крок, °C */
  step_C: number;
}

interface SampleCommon {
  /** Назва для інтерфейсу */
  name: string;
  /** Максимальна температура, до якої дозволено нагрівати зразок, °C */
  maxTemp_C: number;
}

/** Напівпровідниковий зразок: матеріал, тип провідності й концентрація домішки. */
export interface SemiconductorSample extends SampleCommon {
  kind: 'semiconductor';
  bar: BarSample;
  /** Температурний діапазон для прямої за методикою (з «Ходу роботи»). */
  fit: FitProcedure;
}

/** Металевий зразок (дріт): R = R₀(1 + α·t). */
export interface MetalSample extends SampleCommon {
  kind: 'metal';
  /** Опір при 0 °C, Ом */
  r0_Ohm: number;
  /** Температурний коефіцієнт опору α, 1/К */
  alpha_perK: number;
}

/** Параметри зразка (прихована «істина»). */
export type Sample = SemiconductorSample | MetalSample;

/** Істинні значення величин (без шуму). */
export interface Truth {
  /** Опір зразка, Ом */
  resistance_Ohm: number;
  /** Питома провідність, См/м */
  conductivity_Sm: number;
}

/* ------------------------------------------------------------------ */
/* Зразки                                                              */
/* ------------------------------------------------------------------ */

/**
 * Зразки стенда.
 *  - Ge: слабко легований германій (N = 10¹⁸ м⁻³ ≪ nᵢ ≈ 2,4·10¹⁹ м⁻³), тож провідність майже
 *    власна вже при кімнатній температурі: R ≈ 2,3 кОм при 300 К, ≈ 110 Ом при 400 К.
 *  - Cu: мідний дріт для порівняння (опір зростає з нагріванням).
 *  - X: високоомний кремній (N = 10¹⁶ м⁻³): одиниці–десятки МОм при кімнатній температурі,
 *    близько 1 кОм при 250 °C.
 */
export const SAMPLES = {
  Ge: {
    kind: 'semiconductor',
    name: 'Германій',
    maxTemp_C: 150,
    bar: { material: MATERIALS.Ge, type: 'n', doping_m3: 1e18 },
    fit: { from_C: 60, to_C: 150, step_C: 10 },
  },
  Cu: {
    kind: 'metal',
    name: 'Мідний дріт',
    maxTemp_C: 150,
    r0_Ohm: 10,
    alpha_perK: 4.3e-3,
  },
  X: {
    kind: 'semiconductor',
    name: 'Зразок «X»',
    maxTemp_C: 250,
    bar: { material: MATERIALS.Si, type: 'n', doping_m3: 1e16 },
    fit: { from_C: 100, to_C: 250, step_C: 10 },
  },
} satisfies Record<string, Sample>;

export type SampleId = keyof typeof SAMPLES;

/** Матеріали, з якими студент порівнює свій результат (таблиця в Довіднику). */
export const CANDIDATE_MATERIALS: readonly MaterialId[] = ['InSb', 'Ge', 'Si', 'GaAs'];

/* ------------------------------------------------------------------ */
/* Фізика                                                              */
/* ------------------------------------------------------------------ */

/**
 * Опір зразка при температурі T, Ом.
 *  - напівпровідник: R = l / (σ(T)·S), σ = e(n·μn + p·μp);
 *  - метал: R = R₀(1 + α·t), де t — температура в °C.
 */
export function resistanceAt(s: Sample, T_K: number): number {
  if (s.kind === 'metal') return s.r0_Ohm * (1 + s.alpha_perK * (T_K - 273.15));
  return barResistance(conductivity(s.bar, T_K), SAMPLE_LENGTH_M, SAMPLE_AREA_M2);
}

/** Істинний опір і питома провідність зразка при заданій температурі. */
export function simulate(p: Params, s: Sample): Truth {
  const resistance_Ohm = resistanceAt(s, p.temperature_K);
  return {
    resistance_Ohm,
    conductivity_Sm: SAMPLE_LENGTH_M / (resistance_Ohm * SAMPLE_AREA_M2),
  };
}

/* ------------------------------------------------------------------ */
/* Піч (терморегулятор)                                                */
/* ------------------------------------------------------------------ */

/**
 * Один крок «печі»: фактична температура t експоненційно наближається до цільової
 *   t ← t + (t_ціл − t)·(1 − e^(−Δt/τ)).
 * Коли різниця стає зовсім малою (< 0,05 °C), температура «зупиняється» точно на цілі —
 * так покази приладів перестають змінюватися.
 * @param t_C фактична температура, °C
 * @param target_C цільова: t_зад (піч увімкнена) або 20 °C (вимкнена)
 * @param dt_s крок часу, с (з урахуванням прискорення)
 */
export function furnaceStep(t_C: number, target_C: number, dt_s: number, tau_s = FURNACE_TAU_S): number {
  const next = t_C + (target_C - t_C) * (1 - Math.exp(-dt_s / tau_s));
  return Math.abs(target_C - next) < 0.05 ? target_C : next;
}

/** Чи встановилась температура: |t − t_ціл| < 0,3 °C. */
export function isStabilized(t_C: number, target_C: number): boolean {
  return Math.abs(t_C - target_C) < STABLE_BAND_C;
}

/* ------------------------------------------------------------------ */
/* Обробка (так само, як рахує студент)                               */
/* ------------------------------------------------------------------ */

/** Точка графіка Арреніуса: x = 10³/T (К⁻¹), y = ln R (R — в омах). */
export function arrheniusPoint(t_C: number, R_Ohm: number): { x: number; y: number } {
  return { x: 1e3 / celsiusToKelvin(t_C), y: Math.log(R_Ohm) };
}

/**
 * Ширина забороненої зони з нахилу прямої ln R — 1/T: Eg = 2k·(Δ ln R / Δ(1/T)), еВ.
 * @param slope_K нахил Δ ln R / Δ(1/T), К (увага: якщо по осі x відкладено 10³/T,
 *   нахил з графіка треба помножити на 10³)
 */
export function bandGapFromSlope(slope_K: number): number {
  return 2 * PHYS.kEv * slope_K;
}

/** Eg за двома точками: Eg = 2k·T₁T₂·ln(R₁/R₂) / (T₂ − T₁), еВ (T₁ < T₂). */
export function bandGapTwoPoint(T1_K: number, R1_Ohm: number, T2_K: number, R2_Ohm: number): number {
  return (2 * PHYS.kEv * T1_K * T2_K * Math.log(R1_Ohm / R2_Ohm)) / (T2_K - T1_K);
}

/**
 * Відносна похибка Eg для розрахунку за двома точками («старий стиль» — сума доданків):
 *   ε = ΔT/T₁ + ΔT/T₂ + 2ΔT/(T₂ − T₁) + (ΔR₁/R₁ + ΔR₂/R₂) / ln(R₁/R₂)
 */
export function twoPointRelError(
  T1_K: number,
  R1_Ohm: number,
  T2_K: number,
  R2_Ohm: number,
  dT_K: number,
  dR1_Ohm: number,
  dR2_Ohm: number,
): number {
  return (
    dT_K / T1_K +
    dT_K / T2_K +
    (2 * dT_K) / (T2_K - T1_K) +
    (dR1_Ohm / R1_Ohm + dR2_Ohm / R2_Ohm) / Math.log(R1_Ohm / R2_Ohm)
  );
}

/** Температурний коефіцієнт опору α = (R₂ − R₁) / (R₁·(t₂ − t₁)), 1/К. Для напівпровідника α < 0. */
export function tempCoefficient(t1_C: number, R1_Ohm: number, t2_C: number, R2_Ohm: number): number {
  return (R2_Ohm - R1_Ohm) / (R1_Ohm * (t2_C - t1_C));
}

/** Результат процедури студента: пряма МНК у координатах 10³/T — ln R. */
export interface BandGapFit {
  /** Нахил Δ ln R / Δ(1/T), К (нахил з графіка × 10³) */
  slope_K: number;
  /** Eg = 2k·нахил, еВ */
  Eg_eV: number;
  /** Кількість точок у прямій */
  n: number;
}

/**
 * Запас, °C, для відбору точок «t ≥ t_min»: термометр при t_зад = 100 °C може показати 99,7 °C,
 * а студент усе одно вважає цю точку «точкою при 100 °C». Задавач має крок 5 °C, тож запас 2 °C
 * ніколи не захопить сусідню нижчу точку.
 */
export const FIT_SLACK_C = 2;

/** Чи входить точка з показом термометра t у пряму «t ≥ from_C» (з запасом FIT_SLACK_C). */
export function inFitRange(t_C: number, from_C: number): boolean {
  return t_C >= from_C - FIT_SLACK_C;
}

/**
 * Процедура студента: відібрати точки з t ≥ minT_C, побудувати пряму МНК
 * ln R від 10³/T і перерахувати нахил в Eg.
 */
export function fitBandGap(points: readonly { t_C: number; R_Ohm: number }[], minT_C = -Infinity): BandGapFit {
  const used = points
    .filter((p) => inFitRange(p.t_C, minT_C) && p.R_Ohm > 0)
    .map((p) => arrheniusPoint(p.t_C, p.R_Ohm));
  const fit = linearFit(
    used.map((p) => p.x),
    used.map((p) => p.y),
  );
  const slope_K = fit.slope * 1e3;
  return { slope_K, Eg_eV: bandGapFromSlope(slope_K), n: used.length };
}

/** Температури (°C) за методикою: from, from + step, …, to. */
export function procedureTemps(f: FitProcedure): number[] {
  const ts: number[] = [];
  for (let t = f.from_C; t <= f.to_C + 1e-9; t += f.step_C) ts.push(t);
  return ts;
}

/** Визначити матеріал: той із таблиці (InSb, Ge, Si, GaAs), чия Eg(300 К) найближча до отриманої. */
export function identifyMaterial(Eg_eV: number): MaterialId {
  let best: MaterialId = CANDIDATE_MATERIALS[0]!;
  for (const id of CANDIDATE_MATERIALS) {
    if (Math.abs(MATERIALS[id].Eg300 - Eg_eV) < Math.abs(MATERIALS[best].Eg300 - Eg_eV)) best = id;
  }
  return best;
}

/**
 * Еталон тією самою процедурою, що й студент, на даних без шуму.
 *  - напівпровідник: пряма МНК ln R — 10³/T у діапазоні з методики → Eg (±5 %) і матеріал;
 *  - метал: α між 20 °C і максимальною температурою (±5 %).
 */
export function referenceAnswers(s: Sample): AnswerSpec[] {
  if (s.kind === 'metal') {
    const t1 = AMBIENT_C;
    const t2 = s.maxTemp_C;
    const alpha = tempCoefficient(
      t1,
      resistanceAt(s, celsiusToKelvin(t1)),
      t2,
      resistanceAt(s, celsiusToKelvin(t2)),
    );
    return [{ id: 'alpha', label: 'Температурний коефіцієнт опору α', unit: '1/К', kind: 'number', ref: alpha, relTol: 0.05 }];
  }
  const pts = procedureTemps(s.fit).map((t_C) => ({ t_C, R_Ohm: resistanceAt(s, celsiusToKelvin(t_C)) }));
  const { Eg_eV } = fitBandGap(pts);
  return [
    { id: 'Eg', label: 'Ширина забороненої зони Eg', unit: 'еВ', kind: 'number', ref: Eg_eV, relTol: 0.05 },
    { id: 'material', label: 'Матеріал зразка', unit: '', kind: 'choice', ref: identifyMaterial(Eg_eV) },
  ];
}

export const model: LabModel<Params, Sample, Truth> = {
  id: 'band-gap',
  samples: SAMPLES,
  taskSampleId: 'X',
  simulate,
  referenceAnswers,
};
