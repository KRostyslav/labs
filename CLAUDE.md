# CLAUDE.md — правила проєкту для AI-асистентів

Віртуальна лабораторія з фізики напівпровідників для студентів технічних коледжів (після 9–10
класу). Astro 7 (static) + React 19 islands + MDX + KaTeX, TypeScript strict, Vitest. Деплой — Vercel.

## Команди

- `npm run dev` — розробка (у фоні: `npx astro dev --background`, зупинка `npx astro dev stop`)
- `npm run test` — Vitest; `npm run check` — типи; `npm run build` — збирання в `dist/`
- Перед завершенням змін: `npm run test && npm run check && npm run build`

## Мова й аудиторія

- Увесь видимий текст, коментарі, JSDoc і документація — **українською** (правильна орфографія,
  лапки «», апостроф '). Ідентифікатори — англійською.
- Рівень пояснень — коледж після 9 класу: просто, з аналогіями, математика до логарифмів.
- Числа в UI — з десятковою комою (`src/core/format.ts`).

## Архітектура (деталі — docs/ARCHITECTURE.md)

- Одна лаба = тека `src/labs/NN-slug/`: `index.mdx`, `reference.mdx`, `model.ts`,
  `Simulation.tsx`, `*.test.ts`, `README.md`. Шаблон — `src/labs/_template/`.
- Спільне: `src/core/` (прилади, шум, статистика, формат, контракт `LabModel`),
  `src/physics/` (сталі, `materials.ts` — єдине джерело даних матеріалів, `sample.ts`),
  `src/components/sim/` (UI-кіт стендів), `src/components/schematic/` (УГП схем),
  `src/components/content/` (MDX-компоненти, доступні без import).

## Правила для коду

1. `model.ts` — чисті функції, SI, одиниця в імені (`current_A`), без React і випадковості.
2. Покази приладів — лише `readInstrument()`; шум — `useNoise().rngFor(...)`, після запису `noise.next()`.
3. Жодних `Math.random()` / `Date.now()` у рендері (гідратація!). Таймери — у `useEffect`.
4. Рядки таблиць — числа в одиницях заголовка стовпця (`readingIn()`); ключі сховища `'<slug>:…'`.
5. Нові прилади — у `src/core/instrumentCatalog.ts`; нові матеріали — у `src/physics/materials.ts`.
6. `referenceAnswers()` — за процедурою студента; кожна лаба має «зворотний» тест.
7. Кольори/шрифти — лише через токени `src/styles/tokens.css`.

## MDX

- Порожні рядки навколо `$$…$$` (особливо всередині компонентів).
- Коментарі `{/* */}`; `<` у тексті → `&lt;`; `{ }` поза формулами екранувати.
- Порядок розділів лаби: Теоретичні відомості → Віртуальний стенд → Хід роботи →
  Обробка результатів → Кінцеве завдання → Контрольні запитання («Мета»/«Обладнання» — з frontmatter).

## Roadmap

Індивідуальні варіанти з автоперевіркою — задокументовано в README.md → Roadmap
(PRNG, `generateVariant`, `checkAnswers` вже закладені).
