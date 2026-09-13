/**
 * Модель напівпровідникового зразка — спільна для лаб 2 (провідність), 3 (σ(T), Eg)
 * і 4 (ефект Холла).
 *
 * Зразок — брусок з матеріалу `material`, легований донорами (n-тип) або акцепторами
 * (p-тип) з концентрацією `doping_m3`, при температурі T. Вважаємо, що всі домішки
 * іонізовані (для Si і Ge при кімнатній і вищій температурі це так).
 */
import { PHYS } from './constants';
import { intrinsicConcentration, mobility, type Material } from './materials';

export type ConductivityType = 'n' | 'p' | 'i';

export interface Sample {
  material: Material;
  /** Тип провідності: n — електронна, p — діркова, i — власна (нелегований) */
  type: ConductivityType;
  /** Концентрація домішки, м⁻³ (для 'i' ігнорується) */
  doping_m3: number;
}

/**
 * Концентрації електронів n і дірок p, м⁻³, з умови електронейтральності та n·p = nᵢ²:
 *   n-тип: n = N/2 + √((N/2)² + nᵢ²),  p = nᵢ²/n   (для p-типу — навпаки)
 * При низькій T: n ≈ N (домішкова провідність); при високій: n ≈ p ≈ nᵢ (власна).
 */
export function carriers(s: Sample, T_K: number): { n: number; p: number } {
  const ni = intrinsicConcentration(s.material, T_K);
  if (s.type === 'i') return { n: ni, p: ni };
  const half = s.doping_m3 / 2;
  const major = half + Math.sqrt(half * half + ni * ni);
  const minor = (ni * ni) / major;
  return s.type === 'n' ? { n: major, p: minor } : { n: minor, p: major };
}

/** Питома провідність σ = e(n·μn + p·μp), См/м. */
export function conductivity(s: Sample, T_K: number): number {
  const { n, p } = carriers(s, T_K);
  const mun = mobility(s.material, T_K, 'n');
  const mup = mobility(s.material, T_K, 'p');
  return PHYS.e * (n * mun + p * mup);
}

/**
 * Коефіцієнт (стала) Холла, м³/Кл, для двох типів носіїв:
 *   R_H = (p·μp² − n·μn²) / (e·(p·μp + n·μn)²)
 * Для сильно легованого зразка R_H ≈ −1/(e·n) (n-тип) або +1/(e·p) (p-тип).
 */
export function hallCoefficient(s: Sample, T_K: number): number {
  const { n, p } = carriers(s, T_K);
  const mun = mobility(s.material, T_K, 'n');
  const mup = mobility(s.material, T_K, 'p');
  return (p * mup * mup - n * mun * mun) / (PHYS.e * (p * mup + n * mun) ** 2);
}

/** Опір бруска R = l / (σ·S), Ом; S = b·d — площа поперечного перерізу. */
export function barResistance(sigma_Sm: number, length_m: number, area_m2: number): number {
  return length_m / (sigma_Sm * area_m2);
}
