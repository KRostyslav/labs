/**
 * Таблиця напівпровідникових матеріалів — ЄДИНЕ джерело даних для моделей і Довідників.
 * Якщо уточнюєте значення — робіть це тут, і воно зміниться всюди (симуляції + таблиці).
 *
 * Одиниці: енергія — еВ, концентрація — м⁻³, рухливість — м²/(В·с).
 * (Для студентів у таблицях додатково показується см⁻³ і см²/(В·с).)
 *
 * Джерела: Sze & Ng «Physics of Semiconductor Devices», ioffe.ru/SVA/NSM (типові значення при 300 К).
 */
import { PHYS, cutoffWavelength_nm } from './constants';

export type MaterialId = 'Si' | 'Ge' | 'GaAs' | 'InSb' | 'CdS' | 'CdSe' | 'PbS';

export interface Material {
  id: MaterialId;
  /** Назва українською */
  name: string;
  /** Ширина забороненої зони при 300 К, еВ */
  Eg300: number;
  /** Параметри формули Варшні Eg(T) = Eg0 − αT²/(T + β): еВ, еВ/К, К */
  varshni?: { Eg0: number; alpha: number; beta: number };
  /** Власна концентрація носіїв при 300 К, м⁻³ (для широкозонних — не вказується) */
  ni300?: number;
  /** Рухливість електронів при 300 К, м²/(В·с) */
  mun: number;
  /** Рухливість дірок при 300 К, м²/(В·с) (якщо невідома — не вказується) */
  mup?: number;
  /** Показники степеня μ ∝ T^(−exp) для електронів і дірок */
  muExpN?: number;
  muExpP?: number;
  /** Відносна діелектрична проникність */
  eps?: number;
  /** Пряма (true) чи непряма (false) заборонена зона — впливає на крутизну краю поглинання */
  directGap: boolean;
  /** Де застосовують (для Довідника) */
  usage: string;
}

export const MATERIALS: Record<MaterialId, Material> = {
  Si: {
    id: 'Si',
    name: 'Кремній',
    Eg300: 1.12,
    varshni: { Eg0: 1.17, alpha: 4.73e-4, beta: 636 },
    ni300: 1.0e16,
    mun: 0.14,
    mup: 0.045,
    muExpN: 2.4,
    muExpP: 2.2,
    eps: 11.7,
    directGap: false,
    usage: 'діоди, транзистори, мікросхеми, сонячні елементи, фотодіоди',
  },
  Ge: {
    id: 'Ge',
    name: 'Германій',
    Eg300: 0.66,
    varshni: { Eg0: 0.744, alpha: 4.77e-4, beta: 235 },
    ni300: 2.4e19,
    mun: 0.39,
    mup: 0.19,
    muExpN: 1.66,
    muExpP: 2.33,
    eps: 16.0,
    directGap: false,
    usage: 'діоди, ІЧ-фотоприймачі, датчики Холла',
  },
  GaAs: {
    id: 'GaAs',
    name: 'Арсенід галію',
    Eg300: 1.42,
    varshni: { Eg0: 1.519, alpha: 5.405e-4, beta: 204 },
    ni300: 2.1e12,
    mun: 0.85,
    mup: 0.04,
    muExpN: 1.0,
    muExpP: 2.1,
    eps: 12.9,
    directGap: true,
    usage: 'світлодіоди, лазери, НВЧ-транзистори, сонячні елементи для космосу',
  },
  InSb: {
    id: 'InSb',
    name: 'Антимонід індію',
    Eg300: 0.17,
    ni300: 1.9e22,
    mun: 7.7,
    mup: 0.085,
    muExpN: 1.6,
    muExpP: 2.1,
    eps: 16.8,
    directGap: true,
    usage: 'датчики Холла, ІЧ-детектори (тепловізори)',
  },
  CdS: {
    id: 'CdS',
    name: 'Сульфід кадмію',
    Eg300: 2.42,
    mun: 0.034,
    mup: 0.005,
    eps: 8.9,
    directGap: true,
    usage: 'фоторезистори для видимого світла (фотореле, датчики освітлення)',
  },
  CdSe: {
    id: 'CdSe',
    name: 'Селенід кадмію',
    Eg300: 1.74,
    mun: 0.08,
    eps: 10.2,
    directGap: true,
    usage: 'фоторезистори (червона область спектра)',
  },
  PbS: {
    id: 'PbS',
    name: 'Сульфід свинцю',
    Eg300: 0.41,
    mun: 0.06,
    mup: 0.07,
    eps: 17,
    directGap: true,
    usage: 'ІЧ-фоторезистори (1–3 мкм)',
  },
};

/** Ширина забороненої зони при температурі T (формула Варшні), еВ. */
export function bandGap(m: Material, T_K: number): number {
  if (!m.varshni) return m.Eg300;
  const { Eg0, alpha, beta } = m.varshni;
  return Eg0 - (alpha * T_K * T_K) / (T_K + beta);
}

/**
 * Власна концентрація носіїв nᵢ(T), м⁻³:
 *   nᵢ(T) = nᵢ(300)·(T/300)^1,5·exp( Eg(300)/(2k·300) − Eg(T)/(2kT) )
 * Головне для студента: nᵢ ∝ exp(−Eg / 2kT) — дуже швидко зростає з температурою.
 */
export function intrinsicConcentration(m: Material, T_K: number): number {
  if (m.ni300 === undefined) throw new Error(`nᵢ для ${m.id} не задано`);
  const T0 = PHYS.T300;
  const k = PHYS.kEv;
  return (
    m.ni300 *
    (T_K / T0) ** 1.5 *
    Math.exp(bandGap(m, T0) / (2 * k * T0) - bandGap(m, T_K) / (2 * k * T_K))
  );
}

/** Рухливість носіїв μ(T) = μ(300)·(T/300)^(−exp), м²/(В·с). */
export function mobility(m: Material, T_K: number, carrier: 'n' | 'p'): number {
  const mu300 = carrier === 'n' ? m.mun : (m.mup ?? m.mun);
  const exp = carrier === 'n' ? (m.muExpN ?? 1.5) : (m.muExpP ?? 1.5);
  return mu300 * (T_K / PHYS.T300) ** -exp;
}

/** Червона межа фотоефекту для матеріалу, нм. */
export function materialCutoff_nm(m: Material): number {
  return cutoffWavelength_nm(m.Eg300);
}
