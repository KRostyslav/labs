/**
 * Хук для таблиці вимірювань: зберігає рядки у стані React і в localStorage,
 * щоб результати не зникали після перезавантаження сторінки.
 *
 * Ключ сховища: 'vlab:<storageKey>'. Для кожної таблиці лаби — свій ключ,
 * напр. 'diode-iv:VD1:forward'. Ключ можна змінювати «на льоту» (напр. при виборі іншого
 * зразка) — хук завантажить таблицю для нового ключа. Якщо змінюєте структуру рядка,
 * змініть і ключ (додайте ':v2'), щоб старі збережені дані не зламали сторінку.
 */
import { useCallback, useEffect, useState } from 'react';

/** Рядок таблиці: значення за id стовпця (числа — в одиницях стовпця). */
export type Row = Record<string, number | string | null>;

interface State<R> {
  /** Ключ, якому належать рядки (важливо при зміні ключа — щоб не записати чужі рядки). */
  key: string;
  rows: R[];
  /** true — рядки вже прочитано зі сховища для цього ключа. */
  loaded: boolean;
}

export function useMeasurements<R extends Row = Row>(storageKey: string) {
  const key = `vlab:${storageKey}`;
  const [state, setState] = useState<State<R>>({ key, rows: [], loaded: false });

  // Читаємо збережене лише після монтування (на сервері localStorage немає) і при зміні ключа.
  useEffect(() => {
    let rows: R[] = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) rows = JSON.parse(raw) as R[];
    } catch {
      /* пошкоджені дані або заборонене сховище — починаємо з порожньої таблиці */
    }
    setState({ key, rows, loaded: true });
  }, [key]);

  // Зберігаємо лише рядки, завантажені для свого ключа.
  useEffect(() => {
    if (!state.loaded) return;
    try {
      localStorage.setItem(state.key, JSON.stringify(state.rows));
    } catch {
      /* сховище недоступне (приватний режим) — працюємо без збереження */
    }
  }, [state]);

  const add = useCallback((row: R) => setState((s) => ({ ...s, rows: [...s.rows, row] })), []);
  const remove = useCallback(
    (index: number) => setState((s) => ({ ...s, rows: s.rows.filter((_, i) => i !== index) })),
    [],
  );
  const clear = useCallback(() => setState((s) => ({ ...s, rows: [] })), []);

  // Поки рядки для нового ключа не завантажено — показуємо порожню таблицю, а не чужу.
  const rows = state.key === key ? state.rows : [];
  return { rows, add, remove, clear };
}
