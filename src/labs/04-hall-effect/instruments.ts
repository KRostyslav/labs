/**
 * Локальні прилади лаби №4, яких немає у спільному каталозі src/core/instrumentCatalog.ts.
 * (Кандидат на перенесення в каталог, якщо знадобиться іншим лабам.)
 */
import type { AnalogSpec } from '@/core/instruments';

/** Стрілковий амперметр кола електромагніта: межі 1 А і 3 А, клас 1,5. */
export const ANALOG_AMMETER_3A: AnalogSpec = {
  kind: 'analog',
  name: 'Амперметр стрілковий',
  symbol: 'A',
  accuracyClass: 1.5,
  ranges: [
    { max: 1, unit: 'А', factor: 1, divisions: 100, internalR_Ohm: 0.05 },
    { max: 3, unit: 'А', factor: 1, divisions: 150, internalR_Ohm: 0.02 },
  ],
};
