// @ts-check
/**
 * Конфігурація Astro для віртуальної лабораторії.
 *
 * - react()  — інтерактивні симуляції (React-«острови», див. src/labs/NN-назва/Simulation.tsx)
 * - mdx()    — тексти лабораторних робіт і довідників (src/labs/NN-назва/*.mdx)
 * - remark-math + rehype-katex — формули у тексті: $U = IR$ (у рядку) або $$...$$ (окремим блоком).
 *   В Astro 7 плагіни передаються через markdown.processor = unified({...}); MDX їх успадковує.
 *
 * Сайт повністю статичний (output: 'static' за замовчуванням) — Vercel збирає його командою
 * `npm run build` і роздає теку dist/.
 */
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      // strict: false — не падати на кирилиці всередині формул (напр. U_{пр})
      rehypePlugins: [[rehypeKatex, { strict: false }]],
    }),
  },
  integrations: [react(), mdx()],
});
