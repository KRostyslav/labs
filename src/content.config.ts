/**
 * Колекції контенту (Astro Content Collections).
 *
 * Кожна лабораторна живе у власній теці src/labs/NN-назва/ і має два MDX-файли:
 *   index.mdx      → колекція `labs`        → сторінка /labs/<slug>/
 *   reference.mdx  → колекція `references`  → сторінка /labs/<slug>/dovidnyk/
 *
 * Теки, що починаються не з цифри (напр. _template), ігноруються.
 * Поле `slug` у frontmatter стає адресою сторінки (і id запису), тому воно має бути
 * однаковим в index.mdx і reference.mdx однієї лаби.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const labs = defineCollection({
  loader: glob({ pattern: '[0-9]*/index.mdx', base: './src/labs' }),
  schema: z.object({
    /** Номер роботи — задає порядок на головній сторінці. */
    number: z.number().int().positive(),
    /** Адреса сторінки латиницею: /labs/<slug>/ */
    slug: z.string(),
    /** Повна назва (тема) роботи. */
    title: z.string(),
    /** Коротка назва для карток і навігації. */
    shortTitle: z.string(),
    /** Мета роботи (1–2 речення). */
    goal: z.string(),
    /** Короткий опис для картки на головній. */
    summary: z.string(),
    /** Перелік обладнання (віртуального). */
    equipment: z.array(z.string()),
    /** Орієнтовна тривалість, хв. */
    durationMin: z.number().int().positive().default(90),
    /** Emoji/символ для картки. */
    icon: z.string().default('🔬'),
    /** true — лаба не публікується (чернетка). */
    draft: z.boolean().default(false),
  }),
});

const references = defineCollection({
  loader: glob({ pattern: '[0-9]*/reference.mdx', base: './src/labs' }),
  schema: z.object({
    /** Має збігатися зі slug відповідної лаби. */
    slug: z.string(),
    title: z.string(),
  }),
});

export const collections = { labs, references };
