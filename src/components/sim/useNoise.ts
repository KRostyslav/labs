/**
 * Хук шуму вимірювань.
 *
 * Шум генерується детерміновано з (id лаби, номер виміру, ключ параметрів, id приладу):
 *  - поки параметри не змінюються, покази стабільні (не «стрибають» при перемальовуванні);
 *  - після «Записати вимір» номер виміру збільшується → повторний вимір дає трохи інший
 *    показ, як у реальному досліді (тому серія з 3 вимірів має розкид);
 *  - сервер і браузер дають однаковий перший показ (немає помилок гідратації).
 */
import { useCallback, useState } from 'react';
import { makeRng, type Rng } from '@/core/rng';

export function useNoise(labId: string) {
  const [tick, setTick] = useState(0);
  /** PRNG для конкретного приладу при конкретних параметрах. */
  const rngFor = useCallback(
    (...parts: (string | number)[]): Rng => makeRng('noise', labId, tick, ...parts),
    [labId, tick],
  );
  /** Перейти до наступного виміру (викликати після запису в таблицю). */
  const next = useCallback(() => setTick((t) => t + 1), []);
  return { rngFor, next, tick };
}
