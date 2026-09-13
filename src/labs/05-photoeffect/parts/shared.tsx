/**
 * Спільні частини стенда ЛР №5: стан оптичної лави, органи керування лавою,
 * SVG-зображення лави (лампа, фільтр, лінійка, фотоприймач з датчиком люксметра)
 * і дрібні допоміжні функції.
 *
 * Оптичну лаву використовують частини А (фоторезистор) і Б (фотодіод) — її стан
 * зберігається в Simulation.tsx, тому при перемиканні вкладок відстань і фільтр не скидаються.
 */
import { ParamSlider, Segmented, ToggleSwitch } from '@/components/sim';
import { addNoise } from '@/core/noise';
import type { Rng } from '@/core/rng';
import { formatFixed, formatNum } from '@/core/format';
import {
  DIST_MAX_M,
  DIST_MIN_M,
  DIST_STEP_M,
  FILTERS,
  LAMP_FLICKER_REL,
  ROOM_LIGHT_LX,
  illuminance,
  type OpticsParams,
} from '../model';

export const LAB_ID = 'photoeffect';

/** Початковий стан лави: лампа увімкнена, 0,50 м, без фільтра, штора закрита. */
export const DEFAULT_OPTICS: OpticsParams = {
  lampOn: true,
  distance_m: 0.5,
  filterT: 1,
  curtainOpen: false,
};

/** Пропси частин, що працюють на оптичній лаві. */
export interface OpticsProps {
  optics: OpticsParams;
  onOpticsChange: (o: OpticsParams) => void;
}

/** Ключ стану лави — частина «зерна» шуму (поки лава не змінюється, покази стабільні). */
export function opticsKey(o: OpticsParams): string {
  return `${o.lampOn ? 1 : 0}:${o.distance_m}:${o.filterT}:${o.curtainOpen ? 1 : 0}`;
}

/**
 * Освітленість з мерехтінням лампи (≈ 1 %). Мерехтить лише лампа, кімнатне світло стабільне.
 * Ту саму «мерехтливу» освітленість бачать і фотоприймач, і датчик люксметра.
 */
export function flickeringIlluminance(o: OpticsParams, rng: Rng): number {
  const lamp = illuminance({ ...o, curtainOpen: false });
  const bg = o.curtainOpen ? ROOM_LIGHT_LX : 0;
  return (lamp > 0 ? addNoise(rng, lamp, { rel: LAMP_FLICKER_REL }) : 0) + bg;
}

/** Десятковий логарифм для обчислюваних стовпців (null — якщо число не додатне). */
export function lg(x: number | null | undefined): number | null {
  return x !== null && x !== undefined && x > 0 ? Math.log10(x) : null;
}

/** Органи керування оптичною лавою. */
export function OpticsControls({ optics, onOpticsChange }: OpticsProps) {
  const set = (patch: Partial<OpticsParams>) => onOpticsChange({ ...optics, ...patch });
  return (
    <>
      <ToggleSwitch label="Лампа EL1 (100 кд)" checked={optics.lampOn} onChange={(v) => set({ lampOn: v })} led />
      <ParamSlider
        label="Відстань r (лампа — фотоприймач)"
        value={optics.distance_m}
        min={DIST_MIN_M}
        max={DIST_MAX_M}
        step={DIST_STEP_M}
        unit="м"
        onChange={(v) => set({ distance_m: v })}
        hint="Лінійка лави: ціна поділки 1 мм"
      />
      <Segmented
        label="Нейтральний світлофільтр"
        value={optics.filterT}
        onChange={(v) => set({ filterT: v })}
        options={FILTERS.map((T) => ({ value: T, label: T === 1 ? 'немає' : `T = ${formatNum(T, 2)}` }))}
      />
      <ToggleSwitch
        label={`Штора відкрита (кімнатне світло ${ROOM_LIGHT_LX} лк)`}
        checked={optics.curtainOpen}
        onChange={(v) => set({ curtainOpen: v })}
      />
    </>
  );
}

/**
 * Оптична лава на схемі: лампа зліва, промінь, фільтр, лінійка 0–1,5 м і фотоприймач
 * з датчиком люксметра на відстані r. Малюється всередині <Schematic> у смузі висотою ≈ 110.
 */
export function OpticalRail({
  optics,
  x0,
  x1,
  y,
  detectorLabel,
}: {
  optics: OpticsParams;
  /** x центра лампи (r = 0) */
  x0: number;
  /** x кінця лінійки (r = 1,5 м) */
  x1: number;
  /** y оптичної осі */
  y: number;
  detectorLabel: string;
}) {
  const px = (r: number) => x0 + (r / DIST_MAX_M) * (x1 - x0);
  const xd = px(optics.distance_m);
  const on = optics.lampOn;
  const beamOpacity = on ? 0.12 + 0.28 * optics.filterT : 0;
  const railY = y + 34;
  const ticks = [];
  for (let k = 0; k <= 15; k++) {
    const x = px(k / 10);
    const major = k % 5 === 0;
    ticks.push(<line key={k} className="sch-thin" x1={x} y1={railY} x2={x} y2={railY + (major ? 8 : 4)} />);
    if (major) {
      ticks.push(
        <text key={`t${k}`} className="sch-text sch-text--small" x={x} y={railY + 20} textAnchor="middle">
          {formatFixed(k / 10, 1)}
        </text>,
      );
    }
  }
  return (
    <g>
      {/* Промінь світла від лампи до фотоприймача */}
      <polygon points={`${x0},${y - 6} ${xd},${y - 16} ${xd},${y + 16} ${x0},${y + 6}`} fill="#f5b400" opacity={beamOpacity} />
      {/* Лампа */}
      {on && <circle cx={x0} cy={y} r={22} fill="#ffd54a" opacity={0.35} />}
      <circle className="sch-body" cx={x0} cy={y} r={14} style={on ? { fill: '#ffe9a8' } : undefined} />
      <line className="sch-thin" x1={x0 - 10} y1={y - 10} x2={x0 + 10} y2={y + 10} />
      <line className="sch-thin" x1={x0 - 10} y1={y + 10} x2={x0 + 10} y2={y - 10} />
      <text className="sch-text" x={x0} y={y - 24} textAnchor="middle">
        EL1
      </text>
      {/* Світлофільтр */}
      {optics.filterT < 1 && (
        <g>
          <rect x={x0 + 26} y={y - 16} width={7} height={32} fill="#6b7280" opacity={0.25 + 0.5 * (1 - optics.filterT)} stroke="var(--blue-2)" />
          <text className="sch-text sch-text--small" x={x0 + 30} y={y - 21} textAnchor="middle">
            T = {formatNum(optics.filterT, 2)}
          </text>
        </g>
      )}
      {/* Лінійка лави */}
      <line className="sch-line" x1={x0} y1={railY} x2={x1} y2={railY} />
      {ticks}
      <text className="sch-text sch-text--small" x={x1 + 4} y={railY + 20} textAnchor="start">
        м
      </text>
      {/* Фотоприймач і датчик люксметра */}
      <rect className="sch-body sch-active" x={xd - 4} y={y - 18} width={8} height={36} style={{ fill: 'var(--accent-soft)' }} />
      <circle className="sch-body" cx={xd + 12} cy={y + 10} r={5} />
      <line className="sch-thin" x1={xd} y1={y + 18} x2={xd} y2={railY} strokeDasharray="3 3" />
      <text className="sch-text" x={xd} y={y - 24} textAnchor="middle">
        {detectorLabel}
      </text>
      <text className="sch-text sch-text--small" x={xd + 20} y={y + 14} textAnchor="start">
        лк
      </text>
      {/* Штора */}
      <text className="sch-text sch-text--small" x={x1 + 10} y={y - 30} textAnchor="end">
        штора: {optics.curtainOpen ? 'відкрита' : 'закрита'}
      </text>
    </g>
  );
}

/**
 * Приблизний колір світла довжини хвилі λ (для схеми й підказок). Поза видимим
 * діапазоном 380–760 нм повертає null (ультрафіолет / інфрачервоне — не видно оком).
 */
export function wavelengthColor(lambda_nm: number): string | null {
  const l = lambda_nm;
  if (l < 380 || l > 760) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  if (l < 440) [r, g, b] = [(440 - l) / 60, 0, 1];
  else if (l < 490) [r, g, b] = [0, (l - 440) / 50, 1];
  else if (l < 510) [r, g, b] = [0, 1, (510 - l) / 20];
  else if (l < 580) [r, g, b] = [(l - 510) / 70, 1, 0];
  else if (l < 645) [r, g, b] = [1, (645 - l) / 65, 0];
  else [r, g, b] = [1, 0, 0];
  const hex = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Назва кольору / області спектра для довжини хвилі λ. */
export function spectrumName(lambda_nm: number): string {
  const l = lambda_nm;
  if (l < 380) return 'ультрафіолет (невидиме)';
  if (l < 450) return 'фіолетовий';
  if (l < 485) return 'синій';
  if (l < 500) return 'блакитний';
  if (l < 565) return 'зелений';
  if (l < 590) return 'жовтий';
  if (l < 625) return 'оранжевий';
  if (l <= 760) return 'червоний';
  return 'інфрачервоне (невидиме)';
}
