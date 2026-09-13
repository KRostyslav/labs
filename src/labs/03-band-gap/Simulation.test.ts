/**
 * «Димовий» тест стенда: компонент має рендеритися на сервері (SSR) без помилок.
 * Astro спершу рендерить острів на сервері, тому помилка тут = зламана сторінка.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Simulation from './Simulation';
import BandDiagram from './parts/BandDiagram';

describe('band-gap: Simulation', () => {
  it('рендериться на сервері', () => {
    const html = renderToString(createElement(Simulation));
    expect(html).toContain('Записати');
    // Початковий стан детермінований: піч вимкнена, кімнатна температура
    expect(html).toContain('кімнатна температура');
  });

  it('ілюстрація зон рендериться на сервері', () => {
    const html = renderToString(createElement(BandDiagram));
    expect(html).toContain('валентна зона');
  });
});
