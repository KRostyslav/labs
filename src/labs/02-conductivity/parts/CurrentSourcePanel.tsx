/**
 * Передня панель стабілізованого джерела струму G1 (для темної панелі приладів).
 * Табло показує встановлений струм; прапорець «CC» — джерело тримає струм,
 * «ОБМЕЖЕННЯ» — для цього струму потрібно понад 20 В, і джерело дає лише 20 В.
 * Використовує класи цифрового приладу з sim.css. Кандидат у спільний кіт (SourcePanel).
 */
import { formatFixed } from '@/core/format';

interface Props {
  tag: string;
  /** Встановлений струм, мА. */
  setCurrent_mA: number;
  on: boolean;
  inLimit: boolean;
  /** Напруга на виході джерела, В. */
  outputVoltage_V: number;
  limit_V: number;
}

export default function CurrentSourcePanel({ tag, setCurrent_mA, on, inLimit, outputVoltage_V, limit_V }: Props) {
  const text = on ? formatFixed(setCurrent_mA, 1) : '';
  return (
    <div className="sim-meter">
      <div className="sim-meter__head">
        <span>
          <b>{tag} </b>Джерело струму
        </span>
        <span>до {formatFixed(limit_V, 0)} В</span>
      </div>
      <div className="sim-lcd" aria-live="polite" aria-label={`Джерело струму: ${on ? `${text} мА` : 'вимкнено'}`}>
        <span className="sim-lcd__flag" style={inLimit ? { color: '#b3200f', opacity: 1 } : undefined}>
          {on ? (inLimit ? 'ОБМЕЖЕННЯ' : 'CC') : ''}
        </span>
        <span className="sim-lcd__digits">
          <span className="sim-lcd__ghost" aria-hidden="true">
            {text ? text.replace(/[0-9]/g, '8') : ''}
          </span>
          {text || ' '}
        </span>
        <span className="sim-lcd__unit">мА</span>
      </div>
      <div className="sim-meter__readout">
        <span>
          U<sub>вих</sub> = <b>{formatFixed(on ? outputVoltage_V : 0, 1)}</b> В
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className={`sim-led${inLimit ? ' sim-led--on' : ''}`} aria-hidden="true" />
          {inLimit ? <span style={{ color: '#ff8a5c' }}>ліміт 20 В</span> : 'ліміт'}
        </span>
      </div>
    </div>
  );
}
