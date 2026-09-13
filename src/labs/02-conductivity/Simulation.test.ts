/**
 * «Димовий» тест симуляції лаби №2: компонент має рендеритися на сервері (SSR) без помилок.
 * Astro спершу рендерить острів на сервері, тому помилка тут = зламана сторінка.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Simulation from './Simulation';

describe('conductivity: Simulation', () => {
  it('рендериться на сервері', () => {
    const html = renderToString(createElement(Simulation));
    expect(html).toContain('Записати');
    expect(html).toContain('Виміряти мікрометром d');
  });
});
