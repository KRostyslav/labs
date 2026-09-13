/**
 * Таблиця «Розміри зразка»: три стовпці b, l, d (мм). Кожен вимір заповнює першу порожню
 * клітинку свого стовпця, тож після трьох вимірів кожного розміру маємо три повні рядки.
 *
 * Те саме, що useMeasurements з кіту (localStorage 'vlab:<ключ>'), але з методом fill()
 * — оновлення наявного рядка. Кандидат у спільний кіт: useMeasurements.update(index, row).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type DimKey = 'b' | 'l' | 'd';
/** Рядок: розміри в мм; null — ще не виміряно. */
export type DimRow = { b: number | null; l: number | null; d: number | null };

export function useDimensions(storageKey: string) {
  const [rows, setRows] = useState<DimRow[]>([]);
  const loaded = useRef(false);
  const key = `vlab:${storageKey}`;

  // Читаємо збережене лише після монтування (на сервері localStorage немає).
  useEffect(() => {
    loaded.current = false;
    try {
      const raw = localStorage.getItem(key);
      setRows(raw ? (JSON.parse(raw) as DimRow[]) : []);
    } catch {
      setRows([]);
    }
    loaded.current = true;
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(rows));
    } catch {
      /* сховище недоступне — працюємо без збереження */
    }
  }, [key, rows]);

  /** Записати вимір розміру q (мм) у першу порожню клітинку стовпця або в новий рядок. */
  const fill = useCallback((q: DimKey, value_mm: number) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => r[q] === null);
      if (i < 0) return [...rs, { b: null, l: null, d: null, [q]: value_mm }];
      return rs.map((r, j) => (j === i ? { ...r, [q]: value_mm } : r));
    });
  }, []);
  const remove = useCallback((index: number) => setRows((rs) => rs.filter((_, i) => i !== index)), []);
  const clear = useCallback(() => setRows([]), []);

  return { rows, fill, remove, clear };
}
