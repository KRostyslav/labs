/**
 * Таблиця вимірювань у стилі лабораторного журналу.
 *
 * Стовпці бувають двох типів:
 *  - виміряні (значення записує студент кнопкою «Записати вимір»);
 *  - обчислені (compute) — рахуються автоматично з виміряних (напр. R = U/I, ln R, 1/T);
 *    вони підсвічені синім, щоб було видно різницю.
 * Кнопка «Копіювати» кладе таблицю в буфер обміну у форматі для Excel / Google Таблиць.
 */
import { useState, type ReactNode } from 'react';
import { formatFixed, formatNum } from '@/core/format';
import type { Row } from './useMeasurements';

export interface Column<R extends Row = Row> {
  key: string;
  /** Заголовок з одиницею: «U, В» */
  label: string;
  /** Знаків після коми; якщо не задано — 4 значущі цифри. */
  decimals?: number;
  /** Для обчислюваних стовпців — формула від рядка. */
  compute?: (row: R) => number | null;
}

interface Props<R extends Row> {
  columns: Column<R>[];
  rows: R[];
  onRemove: (index: number) => void;
  onClear: () => void;
  caption?: ReactNode;
  emptyText?: ReactNode;
}

function cellValue<R extends Row>(col: Column<R>, row: R): number | string | null {
  if (col.compute) {
    const v = col.compute(row);
    return v === null || !isFinite(v) ? null : v;
  }
  return row[col.key] ?? null;
}

function cellText<R extends Row>(col: Column<R>, row: R): string {
  const v = cellValue(col, row);
  if (v === null) return '—';
  if (typeof v === 'string') return v;
  return col.decimals !== undefined ? formatFixed(v, col.decimals) : formatNum(v, 4);
}

export default function MeasurementTable<R extends Row>({
  columns,
  rows,
  onRemove,
  onClear,
  caption,
  emptyText = 'Таблиця порожня. Встановіть параметри і натисніть «Записати вимір».',
}: Props<R>) {
  const [copied, setCopied] = useState(false);
  const hasComputed = columns.some((c) => c.compute);

  const copy = async () => {
    const lines = [
      ['№', ...columns.map((c) => c.label)].join('\t'),
      ...rows.map((r, i) => [String(i + 1), ...columns.map((c) => cellText(c, r))].join('\t')),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер обміну недоступний */
    }
  };

  const clear = () => {
    if (rows.length === 0 || window.confirm('Очистити всю таблицю? Записані виміри буде видалено.')) onClear();
  };

  return (
    <div className="sim-field">
      <div className="sim-toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="sim-field__label">{caption}</div>
        <div className="sim-toolbar">
          <button type="button" className="btn btn-sm" onClick={copy} disabled={rows.length === 0}>
            {copied ? 'Скопійовано ✓' : 'Копіювати'}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={clear} disabled={rows.length === 0}>
            Очистити
          </button>
        </div>
      </div>
      <div className="sim-table-wrap">
        <table className="sim-table">
          <thead>
            <tr>
              <th scope="col">№</th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.compute ? 'sim-table__computed' : undefined}>
                  {c.label}
                </th>
              ))}
              <th scope="col">
                <span className="visually-hidden">Дії</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} className={c.compute ? 'sim-table__computed' : undefined}>
                    {cellText(c, r)}
                  </td>
                ))}
                <td className="sim-table__actions">
                  <button
                    type="button"
                    className="sim-table__del"
                    aria-label={`Видалити вимір ${i + 1}`}
                    title="Видалити рядок"
                    onClick={() => onRemove(i)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="sim-table__empty">{emptyText}</div>}
      </div>
      {hasComputed && rows.length > 0 && (
        <div className="sim-table__legend">Сині стовпці обчислюються автоматично з виміряних значень.</div>
      )}
    </div>
  );
}
