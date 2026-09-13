/**
 * «Димовий» тест симуляції лаби №1: компонент має рендеритися на сервері (SSR) без помилок.
 * Astro спершу рендерить острів на сервері, тому помилка тут = зламана сторінка.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Simulation from './Simulation';

describe('diode-iv: Simulation', () => {
  it('рендериться на сервері', () => {
    const html = renderToString(createElement(Simulation));
    expect(html).toContain('Записати');
    expect(html).toContain('Пряма гілка');
    expect(html).toContain('Зворотна гілка');
    expect(html).toContain('Провести дотичну');
  });
});
