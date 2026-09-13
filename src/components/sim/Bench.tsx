/**
 * Каркас стенда симуляції та дрібні спільні блоки.
 *
 * Типова структура Simulation.tsx:
 *
 *   <Sim>
 *     <Bench>
 *       <Panel area="schematic" title="Схема">…SVG-схема…</Panel>
 *       <Panel area="instruments" title="Прилади" dark>…AnalogMeter / DigitalMeter…</Panel>
 *       <Panel area="controls" title="Керування">…ParamSlider… <RecordButton/></Panel>
 *     </Bench>
 *     <Workbook>
 *       <Panel title="Таблиця вимірювань"><MeasurementTable/></Panel>
 *       <Panel title="Графік"><Plot/></Panel>
 *     </Workbook>
 *   </Sim>
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { DeviceState } from '@/core/limits';

/** Коренева обгортка симуляції. */
export function Sim({ children }: { children: ReactNode }) {
  return <div className="sim not-prose">{children}</div>;
}

/** Верхня частина: схема, прилади, керування. */
export function Bench({ children }: { children: ReactNode }) {
  return <div className="sim-bench">{children}</div>;
}

/** Нижня частина: таблиця і графік поруч. */
export function Workbook({ children }: { children: ReactNode }) {
  return <div className="sim-work">{children}</div>;
}

/** Панель стенда з заголовком. dark — «бакелітова» панель для приладів. */
export function Panel({
  title,
  area,
  dark = false,
  actions,
  children,
}: {
  title?: ReactNode;
  area?: 'schematic' | 'instruments' | 'controls';
  dark?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`sim-panel${dark ? ' sim-panel--dark' : ''}`} data-area={area}>
      {title && (
        <h3 className="sim-panel__title">
          <span>{title}</span>
          {actions}
        </h3>
      )}
      {children}
    </section>
  );
}

/** Сітка приладів усередині темної панелі. */
export function Instruments({ children }: { children: ReactNode }) {
  return <div className="sim-instruments">{children}</div>;
}

/** Вертикальний стек органів керування. */
export function Controls({ children }: { children: ReactNode }) {
  return <div className="sim-controls">{children}</div>;
}

/**
 * Кнопка «Записати вимір». Якщо disabledReason задано — кнопка неактивна і пояснює чому
 * (напр. «Прилад зашкалює — перемкніть межу»). Після запису коротко показує «Записано ✓».
 */
export function RecordButton({
  onRecord,
  disabledReason,
  label = 'Записати вимір',
  count,
}: {
  onRecord: () => void;
  disabledReason?: string | null;
  label?: string;
  /** Кількість уже записаних вимірів (для підказки). */
  count?: number;
}) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="sim-record">
      <button
        type="button"
        className="btn btn-primary"
        disabled={!!disabledReason}
        onClick={() => {
          onRecord();
          setFlash(true);
        }}
      >
        ✎ {label}
      </button>
      {disabledReason ? (
        <span className="sim-record__msg sim-record__msg--warn">{disabledReason}</span>
      ) : flash ? (
        <span className="sim-record__msg sim-record__msg--ok">Записано ✓</span>
      ) : count !== undefined ? (
        <span className="sim-record__msg">Записано вимірів: {count}</span>
      ) : null}
    </div>
  );
}

/** Стан елемента кола (діод, фоторезистор…) з кнопкою заміни після «згоряння». */
export function DeviceStatus({
  state,
  name,
  onReplace,
  overloadText = 'Перевантаження! Зменште струм, інакше елемент згорить.',
}: {
  state: DeviceState;
  name: string;
  onReplace: () => void;
  overloadText?: string;
}) {
  if (state === 'ok') return null;
  if (state === 'overload') {
    return (
      <div className="sim-status sim-status--overload" role="alert">
        ⚠ {name}: {overloadText}
      </div>
    );
  }
  return (
    <div className="sim-status sim-status--destroyed" role="alert">
      <span>✕ {name} згорів — коло розірване.</span>
      <button type="button" className="btn btn-sm" onClick={onReplace}>
        Замінити елемент
      </button>
    </div>
  );
}

/** Блок результату МНК під графіком. */
export function FitResult({ children }: { children: ReactNode }) {
  return <div className="sim-fit">{children}</div>;
}
