/**
 * Симуляція ЛР №5 «Дослідження внутрішнього фотоефекту та фотоелектричних приладів».
 *
 * Стенд:   спільна оптична лава (лампа 100 кд, відстань 0,10–1,50 м, нейтральні фільтри, штора,
 *          люксметр біля фотоприймача) і три вкладки:
 *            А — фоторезистор у колі «джерело 0–30 В → амперметр → фоторезистор», вольтметр паралельно;
 *            Б — фотодіод у режимі короткого замикання (I_кз) або холостого ходу (U_хх);
 *            В — монохроматор 350–2000 нм і фотоприймачі CdS, CdSe, GaAs, Si, Ge, «X».
 * Студент: вмикає лампу, переміщує фотоприймач, ставить фільтри, змінює напругу / λ,
 *          перемикає межі приладів і записує виміри в таблиці; графіки будуються з таблиць.
 * Дані:    фізика — ./model.ts; прилади — src/core/instrumentCatalog.ts;
 *          частини стенда — ./parts/*.tsx; таблиці — localStorage 'vlab:photoeffect:…'.
 *
 * Потік даних на кожен рендер:
 *   лава → illuminance() + мерехтіння (useNoise) → модель частини → readInstrument() → UI
 */
import { useState } from 'react';
import { Sim, Tabs } from '@/components/sim';
import PhotoresistorPart from './parts/PhotoresistorPart';
import PhotodiodePart from './parts/PhotodiodePart';
import SpectralPart from './parts/SpectralPart';
import { DEFAULT_OPTICS } from './parts/shared';
import type { OpticsParams } from './model';

type Part = 'A' | 'B' | 'C';

const TABS: { id: Part; label: string }[] = [
  { id: 'A', label: 'А. Фоторезистор' },
  { id: 'B', label: 'Б. Фотодіод' },
  { id: 'C', label: 'В. Спектральна характеристика' },
];

export default function Simulation() {
  const [part, setPart] = useState<Part>('A');
  // Лава спільна для частин А і Б: при перемиканні вкладок положення фотоприймача зберігається
  const [optics, setOptics] = useState<OpticsParams>(DEFAULT_OPTICS);

  return (
    <Sim>
      <Tabs tabs={TABS} value={part} onChange={setPart} />
      {part === 'A' && <PhotoresistorPart optics={optics} onOpticsChange={setOptics} />}
      {part === 'B' && <PhotodiodePart optics={optics} onOpticsChange={setOptics} />}
      {part === 'C' && <SpectralPart />}
    </Sim>
  );
}
