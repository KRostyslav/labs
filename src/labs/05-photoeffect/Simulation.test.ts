/**
 * «Димовий» тест симуляції ЛР №5: стенд і кожна його частина рендеряться на сервері (SSR)
 * без помилок. Astro спершу рендерить острів на сервері, тому помилка тут = зламана сторінка.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Simulation from './Simulation';
import PhotoresistorPart from './parts/PhotoresistorPart';
import PhotodiodePart from './parts/PhotodiodePart';
import SpectralPart from './parts/SpectralPart';
import { DEFAULT_OPTICS } from './parts/shared';

const opticsProps = { optics: DEFAULT_OPTICS, onOpticsChange: () => {} };

describe('photoeffect: Simulation', () => {
  it('рендериться на сервері', () => {
    const html = renderToString(createElement(Simulation));
    expect(html).toContain('Записати');
    expect(html).toContain('Фоторезистор');
  });

  it('кожна частина (А, Б, В) рендериться окремо', () => {
    expect(renderToString(createElement(PhotoresistorPart, opticsProps))).toContain('Записати');
    expect(renderToString(createElement(PhotodiodePart, opticsProps))).toContain('Записати');
    expect(renderToString(createElement(SpectralPart))).toContain('Записати');
  });
});
