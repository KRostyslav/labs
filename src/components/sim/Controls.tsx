/**
 * Органи керування стендом: повзунок з кнопками «−/+», сегментований перемикач, тумблер, вкладки.
 * Усі компоненти «керовані» (controlled): значення зберігається у стані симуляції.
 */
import type { ReactNode } from 'react';
import { formatFixed } from '@/core/format';

/* ------------------------------------------------------------------ */
interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** Одиниця для показу значення. */
  unit?: string;
  /** Знаків після коми у показі (за замовчуванням — з кроку). */
  decimals?: number;
  hint?: ReactNode;
  disabled?: boolean;
}

/** Кількість знаків після коми, щоб показати крок step. */
const stepDecimals = (step: number) => {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1]!.length : 0;
};

/** Повзунок для плавного параметра (напруга джерела, температура, відстань…). */
export function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
  decimals,
  hint,
  disabled,
}: SliderProps) {
  const d = decimals ?? stepDecimals(step);
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Number(v.toFixed(d + 2)))));
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="sim-field">
      <div className="sim-field__label">
        <span>{label}</span>
        <span className="sim-field__value">
          {formatFixed(value, d)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div className="sim-slider">
        <button
          type="button"
          className="sim-step"
          aria-label="Зменшити"
          disabled={disabled || value <= min}
          onClick={() => set(value - step)}
        >
          −
        </button>
        <input
          className="sim-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => set(Number(e.target.value))}
          aria-label={typeof label === 'string' ? label : undefined}
        />
        <button
          type="button"
          className="sim-step"
          aria-label="Збільшити"
          disabled={disabled || value >= max}
          onClick={() => set(value + step)}
        >
          +
        </button>
      </div>
      {hint && <div className="sim-field__hint">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/** Перемикач з кількох положень (вибір зразка, полярності, режиму). */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label?: ReactNode;
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  return (
    <div className="sim-field">
      {label && (
        <div className="sim-field__label">
          <span>{label}</span>
        </div>
      )}
      <div className="sim-seg" role="group">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <div className="sim-field__hint">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/** Тумблер «увімк./вимк.» з індикатором-світлодіодом (напр. живлення стенда). */
export function ToggleSwitch({
  label,
  checked,
  onChange,
  led = false,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Показати світлодіод поруч. */
  led?: boolean;
}) {
  return (
    <label className="sim-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="sim-toggle__track" aria-hidden="true" />
      <span>{label}</span>
      {led && <span className={`sim-led${checked ? ' sim-led--on' : ''}`} aria-hidden="true" />}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/** Вкладки (напр. «Пряма гілка / Зворотна гілка» або частини А, Б, В лаби). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label = 'Частини роботи',
}: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div className="sim-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
