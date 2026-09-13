/**
 * Налаштування юніт-тестів (Vitest).
 * Тестуються лише чисті функції: src/core, src/physics і моделі лаб src/labs/*\/model.ts.
 * Запуск: `npm run test` (одноразово) або `npm run test:watch` (під час розробки).
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Той самий аліас, що й у tsconfig.json
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
