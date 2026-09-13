/**
 * Фундаментальні фізичні сталі (CODATA 2018, точні значення SI) і прості перетворення.
 * Використовуються моделями лаб і таблицями Довідника — змінювати лише тут.
 */

export const PHYS = {
  /** Елементарний заряд, Кл */
  e: 1.602176634e-19,
  /** Стала Больцмана, Дж/К */
  k: 1.380649e-23,
  /** Стала Больцмана, еВ/К */
  kEv: 8.617333262e-5,
  /** Стала Планка, Дж·с */
  h: 6.62607015e-34,
  /** Швидкість світла у вакуумі, м/с */
  c: 2.99792458e8,
  /** h·c, еВ·нм — для λ_ч = hc / Eg */
  hcEvNm: 1239.84198,
  /** Кімнатна температура для таблиць, К */
  T300: 300,
} as const;

/** Температурний потенціал U_T = kT/e, В (≈ 25,9 мВ при 300 К). */
export function thermalVoltage(T_K: number): number {
  return PHYS.kEv * T_K;
}

/** °C → К */
export function celsiusToKelvin(t_C: number): number {
  return t_C + 273.15;
}

/** К → °C */
export function kelvinToCelsius(T_K: number): number {
  return T_K - 273.15;
}

/** Червона межа внутрішнього фотоефекту λ_ч = hc/Eg, нм. */
export function cutoffWavelength_nm(Eg_eV: number): number {
  return PHYS.hcEvNm / Eg_eV;
}
