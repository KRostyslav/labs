/**
 * Цифровий вимірювальний прилад (мультиметр, мілівольтметр, термометр, люксметр…):
 * РК-табло з показом, одиницею й перемикачем меж. При перевищенні межі показує «OL».
 *
 * Похибку студент рахує сам за паспортом: Δ = ±(a % · показ + n одиниць молодшого розряду).
 */
import type { DigitalSpec, Reading } from '@/core/instruments';
import { formatFixed, formatNum } from '@/core/format';

interface Props {
  spec: DigitalSpec;
  rangeIdx: number;
  onRangeChange?: (i: number) => void;
  /** null — прилад вимкнено або немає сигналу (табло порожнє). */
  reading: Reading | null;
  tag?: string;
  /** Додатковий напис на табло зліва згори (напр. «HOLD», «DC»). */
  flag?: string;
}

export default function DigitalMeter({ spec, rangeIdx, onRangeChange, reading, tag, flag = 'DC' }: Props) {
  const range = spec.ranges[rangeIdx]!;
  const decimals = reading?.decimals ?? 0;
  let text = '';
  if (reading) {
    text = reading.overRange ? 'OL' : formatFixed(reading.value ?? 0, decimals);
  }
  // «Примарні» сегменти 8.8.8.8 — як на справжньому РК-табло
  const ghost = text ? text.replace(/[0-9]/g, '8').replace('-', '8').replace('OL', '88') : '';

  return (
    <div className="sim-meter">
      <div className="sim-meter__head">
        <span>
          {tag && <b>{tag} </b>}
          {spec.name}
        </span>
        <span>
          ±({formatNum(spec.pctReading, 2)} % + {spec.digits} од.)
        </span>
      </div>
      <div className="sim-lcd" aria-live="polite" aria-label={`${spec.name}: ${text || 'вимкнено'} ${range.unit}`}>
        <span className="sim-lcd__flag">{reading ? flag : ''}</span>
        <span className="sim-lcd__digits">
          <span className="sim-lcd__ghost" aria-hidden="true">
            {ghost}
          </span>
          {text || ' '}
        </span>
        <span className="sim-lcd__unit">{range.unit}</span>
      </div>
      {spec.ranges.length > 1 && onRangeChange && (
        <div className="sim-ranges" role="group" aria-label="Межа вимірювання">
          {spec.ranges.map((r, i) => (
            <button key={i} type="button" aria-pressed={i === rangeIdx} onClick={() => onRangeChange(i)}>
              {formatNum(r.max, 4)} {r.unit}
            </button>
          ))}
        </div>
      )}
      <div className="sim-meter__readout">
        {reading?.overRange ? (
          <span style={{ color: '#ff8a5c' }}>OL — перевищено межу, перемкніть на більшу</span>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
