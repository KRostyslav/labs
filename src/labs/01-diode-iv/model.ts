/**
 * Фізична модель лабораторної роботи №1
 * «Дослідження вольт-амперної характеристики напівпровідникових діодів (кремнієвого та германієвого)».
 *
 * Що моделюємо:
 *  - діод — рівняння Шоклі з послідовним опором Rs (об'єм кристала й виводи), опором витоку Rsh
 *    (струм по поверхні кристала) і, для германієвого діода, «м'яким» пробоєм;
 *  - коло стенда — джерело G → перемикач полярності S1 → обмежувальний резистор R_обм →
 *    амперметр → діод; вольтметр вмикається по-різному для прямої і зворотної гілки;
 *  - внутрішні опори приладів (R_A амперметра на обраній межі, R_V вольтметра) — вони
 *    створюють «похибку методу», про яку йдеться в теорії.
 *
 * Правила (див. src/labs/_template/model.ts): лише чисті функції, одиниці SI, без випадковості.
 */
import type { AnswerSpec, LabModel } from '@/core/lab';
import type { Limits } from '@/core/limits';
import { ANALOG_VOLTMETER } from '@/core/instrumentCatalog';
import { bisect } from '@/core/solve';
import { linearFit } from '@/core/stats';
import { thermalVoltage } from '@/physics/constants';

/* ------------------------------------------------------------------ */
/* Сталі стенда                                                        */
/* ------------------------------------------------------------------ */

/** Температура в лабораторії, К (20 °C). */
export const T_K = 293;

/** Температурний потенціал U_T = kT/e при 293 К, В (≈ 25,2 мВ). */
export const UT_V = thermalVoltage(T_K);

/**
 * Обмежувальний резистор R_обм, Ом. Перемикається разом із S1:
 *  - пряме ввімкнення — 51 Ом: обмежує великий прямий струм і майже не «з'їдає» напругу;
 *  - зворотне — 10 кОм: зворотний струм малий, а при пробої резистор не дає струму зрости
 *    до небезпечного значення й захищає мікроамперметр.
 */
export const R_LIMIT_OHM = { forward: 51, reverse: 10e3 } as const;

/** Внутрішній опір джерела G, Ом. */
export const SOURCE_R_OHM = 0.5;

/** Найбільша напруга джерела для кожного положення S1, В (межі повзунка U₀ на стенді). */
export const SOURCE_MAX_V = { forward: 10, reverse: 50 } as const;

/**
 * Опір вольтметра на межі 1 В, Ом (1 кОм/В). Саме на цій межі студент знімає всю пряму гілку,
 * тому з цим опором рахуються еталонні відповіді.
 */
export const FORWARD_VOLTMETER_R_OHM = ANALOG_VOLTMETER.ranges[0]!.internalR_Ohm ?? 1e3;

/** Струми (показ міліамперметра), за якими студент рахує r_д = ΔU/ΔI «біля 10 мА», А. */
export const RD_POINTS_A = [5e-3, 20e-3] as const;

/** Струми чотирьох останніх точок прямої гілки для дотичної в кінцевому завданні, А. */
export const TANGENT_POINTS_A = [25e-3, 30e-3, 35e-3, 40e-3] as const;

/** Струм, при якому визначають пряму напругу й диференціальний опір, А. */
export const I_REF_A = 10e-3;

/* ------------------------------------------------------------------ */
/* Типи                                                                */
/* ------------------------------------------------------------------ */

/** Положення перемикача S1: пряме або зворотне ввімкнення діода. */
export type Polarity = 'forward' | 'reverse';

/** Матеріал діода — те, що студент має визначити в кінцевому завданні. */
export type DiodeMaterial = 'Si' | 'Ge';

/** «М'який» пробій p–n-переходу (лише для германієвого діода). */
export interface Breakdown {
  /** Напруга пробою U_проб (модуль), В. */
  Vbr_V: number;
  /** Коефіцієнт «крутизни» пробою (чим більший, тим плавніший злам). */
  nbv: number;
  /** Струм у точці U = −U_проб, А. */
  Ibv_A: number;
}

/** Параметри діода (прихована «істина» зразка). */
export interface DiodeSample {
  /** Повна назва для заголовків. */
  name: string;
  /** Позначення на схемі й у легенді: «VD1». */
  label: string;
  material: DiodeMaterial;
  /** Струм насичення (тепловий струм) I_s, А. */
  Is_A: number;
  /** Коефіцієнт неідеальності n (1…2). */
  n: number;
  /** Послідовний опір Rs (кристал + виводи), Ом. */
  Rs_Ohm: number;
  /** Опір витоку Rsh (паралельно переходу), Ом. */
  Rsh_Ohm: number;
  /** Пробій (якщо в межах стенда його немає — не задається). */
  breakdown?: Breakdown;
  /** Найбільший допустимий прямий струм I_пр.max, А. */
  Imax_A: number;
  /** Найбільший допустимий зворотний струм (модуль), А; не задано — обмеження немає. */
  IrevMax_A?: number;
}

/** Параметри стенда, які задає студент. */
export interface Params {
  /** Напруга джерела U₀ (≥ 0), В. */
  sourceVoltage_V: number;
  /** Положення S1. */
  polarity: Polarity;
  /** Внутрішній опір увімкненого амперметра на обраній межі, Ом. */
  ammeterR_Ohm: number;
  /** Внутрішній опір вольтметра на обраній межі, Ом. */
  voltmeterR_Ohm: number;
  /** Діод згорів — у колі обрив на місці діода. */
  open?: boolean;
}

/** Істинні значення величин у колі (без шуму й похибок приладів). */
export interface Truth {
  /** Напруга на самому p–n-переході U_j (знак: «+» — пряме зміщення), В. */
  junctionVoltage_V: number;
  /** Напруга між виводами діода (анод − катод), В. */
  diodeVoltage_V: number;
  /** Струм діода (від анода до катода; зворотний — від'ємний), А. */
  diodeCurrent_A: number;
  /** Струм через амперметр (модуль — те, що він показує), А. */
  ammeterCurrent_A: number;
  /** Напруга на затискачах вольтметра (модуль — те, що він показує), В. */
  voltmeterVoltage_V: number;
  /** Струм через вольтметр (модуль), А. */
  voltmeterCurrent_A: number;
  /** Струм через джерело й R_обм (модуль), А. */
  sourceCurrent_A: number;
}

/* ------------------------------------------------------------------ */
/* Зразки                                                              */
/* ------------------------------------------------------------------ */

/**
 * Діоди стенда.
 *  - VD1 — кремнієвий (подібний до КД522 / 1N4148): I_s малий → відкривається при ≈ 0,65 В.
 *  - VD2 — германієвий (подібний до Д9 / Д310): I_s у ~200 разів більший → відкривається при
 *    ≈ 0,3 В, зворотний струм — десятки мікроамперів, пробій ≈ 30 В.
 *  - X — зразок кінцевого завдання (однаковий для всіх): кремнієвий, але з іншими I_s, n, Rs,
 *    ніж у VD1. Його параметри студенту не показуються.
 */
export const SAMPLES = {
  VD1: {
    name: 'Діод VD1 (кремнієвий)',
    label: 'VD1',
    material: 'Si',
    Is_A: 5e-9,
    n: 1.8,
    Rs_Ohm: 0.5,
    Rsh_Ohm: 2e8,
    Imax_A: 0.1,
  },
  VD2: {
    name: 'Діод VD2 (германієвий)',
    label: 'VD2',
    material: 'Ge',
    Is_A: 1e-6,
    n: 1.3,
    Rs_Ohm: 5,
    Rsh_Ohm: 1e6,
    breakdown: { Vbr_V: 30, nbv: 3, Ibv_A: 1e-6 },
    Imax_A: 0.05,
    IrevMax_A: 0.5e-3,
  },
  X: {
    name: 'Діод «X»',
    label: 'VDX',
    material: 'Si',
    Is_A: 1e-9,
    n: 1.7,
    Rs_Ohm: 2,
    Rsh_Ohm: 5e8,
    Imax_A: 0.1,
  },
} satisfies Record<string, DiodeSample>;

export type SampleId = keyof typeof SAMPLES;

/* ------------------------------------------------------------------ */
/* Діод                                                                */
/* ------------------------------------------------------------------ */

/** Обмеження показника експоненти, щоб уникнути Infinity під час пошуку розв'язку. */
const safeExp = (x: number) => Math.exp(Math.min(x, 600));

/**
 * Струм через p–n-перехід при напрузі на переході Vj (рівняння Шоклі + витік + пробій):
 *
 *   I = I_s·(exp(Vj / (n·U_T)) − 1) + Vj / Rsh  [− I_bv·exp(−(Vj + U_проб)/(n_bv·U_T)), якщо Vj < −0,8·U_проб]
 *
 * Пряма гілка (Vj > 0): експонента — струм зростає в ~10 разів на кожні n·U_T·ln10 ≈ 0,06·n В.
 * Зворотна (Vj < 0): експонента → 0, лишається −I_s (тепловий струм) і струм витоку Vj/Rsh.
 * Біля U_проб пробійний доданок різко збільшує зворотний струм.
 */
export function junctionCurrent(Vj_V: number, s: DiodeSample): number {
  let I = s.Is_A * (safeExp(Vj_V / (s.n * UT_V)) - 1) + Vj_V / s.Rsh_Ohm;
  const b = s.breakdown;
  if (b && Vj_V < -0.8 * b.Vbr_V) {
    I -= b.Ibv_A * safeExp(-(Vj_V + b.Vbr_V) / (b.nbv * UT_V));
  }
  return I;
}

/** Напруга між виводами діода: на переході плюс спад на послідовному опорі, В. */
export function terminalVoltage(Vj_V: number, s: DiodeSample): number {
  return Vj_V + junctionCurrent(Vj_V, s) * s.Rs_Ohm;
}

/**
 * Теоретичний диференціальний опір діода при прямому струмі I:
 *   r_д = n·U_T / I + Rs
 * (похідна dU/dI рівняння Шоклі; витоком Rsh при прямих струмах можна знехтувати).
 */
export function differentialResistanceTheory(s: DiodeSample, I_A: number): number {
  return (s.n * UT_V) / I_A + s.Rs_Ohm;
}

/** Допустимі значення для core/limits: прямий струм або (якщо задано) зворотний струм. */
export function limitsFor(s: DiodeSample, polarity: Polarity): Limits {
  if (polarity === 'forward') return { maxCurrent_A: s.Imax_A };
  return s.IrevMax_A ? { maxCurrent_A: s.IrevMax_A } : {};
}

/* ------------------------------------------------------------------ */
/* Коло стенда                                                         */
/* ------------------------------------------------------------------ */

const ZERO: Truth = {
  junctionVoltage_V: 0,
  diodeVoltage_V: 0,
  diodeCurrent_A: 0,
  ammeterCurrent_A: 0,
  voltmeterVoltage_V: 0,
  voltmeterCurrent_A: 0,
  sourceCurrent_A: 0,
};

/**
 * Розрахунок кола стенда (методом бісекції за напругою на переході Vj, див. core/solve.ts).
 *
 * Пряме ввімкнення (вольтметр — безпосередньо на діоді; амперметр рахує струм діода
 * І струм вольтметра):
 *   U₀ = (I_д + U_д/R_V)·(R_обм + R_A + r) + U_д
 *
 * Зворотне ввімкнення (вольтметр — на діоді разом із мікроамперметром; мікроамперметр рахує
 * лише струм діода, а вольтметр додатково «бачить» спад I·R_A):
 *   U_V = |U_д| + |I_д|·R_A,   U₀ = (|I_д| + U_V/R_V)·(R_обм + r) + U_V
 *
 * де r — внутрішній опір джерела. Згорілий діод (open) — обрив: струм тече лише через вольтметр.
 */
export function simulate(p: Params, s: DiodeSample): Truth {
  const U0 = Math.max(0, p.sourceVoltage_V);
  if (U0 === 0) return ZERO;
  const Rv = p.voltmeterR_Ohm;
  const Ra = p.ammeterR_Ohm;

  if (p.polarity === 'forward') {
    const Rser = R_LIMIT_OHM.forward + SOURCE_R_OHM + Ra;
    if (p.open) {
      // Діода немає: U₀ ділиться між R_обм + R_A + r і вольтметром
      const Iv = U0 / (Rser + Rv);
      const Vd = Iv * Rv;
      return {
        junctionVoltage_V: Vd,
        diodeVoltage_V: Vd,
        diodeCurrent_A: 0,
        ammeterCurrent_A: Iv,
        voltmeterVoltage_V: Vd,
        voltmeterCurrent_A: Iv,
        sourceCurrent_A: Iv,
      };
    }
    const residual = (Vj: number) => {
      const Id = junctionCurrent(Vj, s);
      const Vd = Vj + Id * s.Rs_Ohm;
      return (Id + Vd / Rv) * Rser + Vd - U0;
    };
    const Vj = bisect(residual, 0, Math.min(U0, 5));
    const Id = junctionCurrent(Vj, s);
    const Vd = Vj + Id * s.Rs_Ohm;
    const Iv = Vd / Rv;
    return {
      junctionVoltage_V: Vj,
      diodeVoltage_V: Vd,
      diodeCurrent_A: Id,
      ammeterCurrent_A: Id + Iv,
      voltmeterVoltage_V: Vd,
      voltmeterCurrent_A: Iv,
      sourceCurrent_A: Id + Iv,
    };
  }

  // Зворотне ввімкнення
  const Rser = R_LIMIT_OHM.reverse + SOURCE_R_OHM;
  if (p.open) {
    const Iv = U0 / (Rser + Ra + Rv);
    const Vv = Iv * Rv;
    // Через мікроамперметр струм не тече (діода немає), напруга на місці діода ≈ U_V
    return {
      junctionVoltage_V: -Vv,
      diodeVoltage_V: -Vv,
      diodeCurrent_A: 0,
      ammeterCurrent_A: 0,
      voltmeterVoltage_V: Vv,
      voltmeterCurrent_A: Iv,
      sourceCurrent_A: Iv,
    };
  }
  const reverseState = (Vj: number) => {
    const i = -junctionCurrent(Vj, s); // модуль зворотного струму
    const u = -Vj + i * s.Rs_Ohm; // модуль напруги на діоді
    const Vv = u + i * Ra; // вольтметр охоплює діод і мікроамперметр
    return { i, u, Vv };
  };
  const residual = (Vj: number) => {
    const { i, Vv } = reverseState(Vj);
    return (i + Vv / Rv) * Rser + Vv - U0;
  };
  const Vj = bisect(residual, -U0, 0);
  const { i, u, Vv } = reverseState(Vj);
  const Iv = Vv / Rv;
  return {
    junctionVoltage_V: Vj,
    diodeVoltage_V: -u,
    diodeCurrent_A: -i,
    ammeterCurrent_A: i,
    voltmeterVoltage_V: Vv,
    voltmeterCurrent_A: Iv,
    sourceCurrent_A: i + Iv,
  };
}

/* ------------------------------------------------------------------ */
/* Процедура студента (без шуму) → еталонні відповіді                   */
/* ------------------------------------------------------------------ */

/**
 * Показ вольтметра на прямій гілці, коли міліамперметр показує струм I_A.
 * Вольтметр увімкнено безпосередньо на діоді, тому I_A = I_д + U_д/R_V (струм вольтметра
 * теж проходить через міліамперметр). Результат не залежить від R_обм і R_A.
 */
export function forwardVoltageAtReading(s: DiodeSample, ammeterCurrent_A: number, voltmeterR_Ohm = FORWARD_VOLTMETER_R_OHM): number {
  const h = (Vj: number) => {
    const Id = junctionCurrent(Vj, s);
    const Vd = Vj + Id * s.Rs_Ohm;
    return Id + Vd / voltmeterR_Ohm - ammeterCurrent_A;
  };
  return terminalVoltage(bisect(h, 0, 5), s);
}

/** Точка ВАХ, як її записує студент: U — у вольтах, I — у міліамперах. */
export interface IvPoint {
  U: number;
  I: number;
}

/** Результат «дотичної» (МНК за чотирма точками з найбільшими струмами). */
export interface TangentResult {
  /** Нахил k прямої I = k·U + b, мА/В. */
  slope: number;
  /** Вільний член b, мА. */
  intercept: number;
  /** Напруга відкривання U_відкр = −b/k (перетин дотичної з віссю U), В. */
  Uopen_V: number;
  /** Точки, за якими проведено пряму. */
  used: IvPoint[];
}

/**
 * «Дотична» до прямої гілки: пряма МНК I = k·U + b через 4 точки з найбільшими струмами;
 * її перетин з віссю I = 0 дає напругу відкривання U_відкр = −b/k.
 * Той самий код використовує кнопка на стенді, еталонні відповіді й тест.
 * @returns null, якщо точок менше чотирьох або нахил не додатний
 */
export function tangentFit(points: readonly IvPoint[], count = 4): TangentResult | null {
  if (points.length < count) return null;
  const used = [...points].sort((a, b) => a.I - b.I).slice(-count);
  const fit = linearFit(
    used.map((p) => p.U),
    used.map((p) => p.I),
  );
  if (!(fit.slope > 0)) return null;
  return { slope: fit.slope, intercept: fit.intercept, Uopen_V: -fit.intercept / fit.slope, used };
}

/**
 * Диференціальний опір за двома точками прямої гілки: r_д = ΔU/ΔI, Ом
 * (U — у вольтах, I — у міліамперах, як у таблиці).
 */
export function differentialResistanceFromPoints(a: IvPoint, b: IvPoint): number {
  return (b.U - a.U) / ((b.I - a.I) * 1e-3);
}

/**
 * Еталонні відповіді кінцевого завдання — та сама процедура, що й у студента, але на
 * даних без шуму (пряма гілка знята з вольтметром на межі 1 В):
 *  - матеріал — за напругою відкривання та зворотним струмом;
 *  - U при I = 10 мА — показ вольтметра, коли міліамперметр показує 10 мА (±3 %);
 *  - r_д біля 10 мА = (U₂₀ − U₅)/(20 мА − 5 мА) (±12 %; збігається з n·U_T/I + Rs з точністю ~2 %);
 *  - U_відкр — дотична МНК через точки 25, 30, 35, 40 мА (±10 %, необов'язково).
 */
export function referenceAnswers(s: DiodeSample): AnswerSpec[] {
  const at = (I_A: number): IvPoint => ({ U: forwardVoltageAtReading(s, I_A), I: I_A * 1e3 });
  const U10 = at(I_REF_A).U;
  const rd = differentialResistanceFromPoints(at(RD_POINTS_A[0]), at(RD_POINTS_A[1]));
  const tangent = tangentFit(TANGENT_POINTS_A.map(at))!;
  return [
    { id: 'material', label: 'Матеріал діода (Si або Ge)', unit: '', kind: 'choice', ref: s.material },
    { id: 'U10', label: 'Пряма напруга при I = 10 мА', unit: 'В', kind: 'number', ref: U10, relTol: 0.03 },
    { id: 'rd10', label: 'Диференціальний опір r_д при I ≈ 10 мА', unit: 'Ом', kind: 'number', ref: rd, relTol: 0.12 },
    { id: 'Uopen', label: 'Напруга відкривання U_відкр (за дотичною)', unit: 'В', kind: 'number', ref: tangent.Uopen_V, relTol: 0.1 },
  ];
}

/** Модель лаби для спільного контракту LabModel (src/core/lab.ts). */
export const model: LabModel<Params, DiodeSample, Truth> = {
  id: 'diode-iv',
  samples: SAMPLES,
  taskSampleId: 'X',
  simulate,
  referenceAnswers,
};
