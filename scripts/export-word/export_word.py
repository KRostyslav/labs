#!/usr/bin/env python3
"""
Експорт сторінок лабораторних робіт у Word (.docx) — для перегляду й редагування викладачем.

Що робить:
  1. Роздає зібраний сайт (dist/) локальним HTTP-сервером.
  2. Відкриває кожну сторінку /labs/<slug>/ у headless-Chrome (Playwright):
     - знімає скриншот віртуального стенда та статичних рисунків;
     - перетворює вміст сторінки на «чистий» HTML: формули KaTeX → TeX, блоки
       (визначення, формули, «Увага», кінцеве завдання…) → абзаци зі стилями Word.
  3. Конвертує HTML у .docx через pandoc з власним шаблоном стилів (A4, Times New Roman,
     українська мова, таблиці з рамками, кольорові стилі блоків). Формули стають
     редагованими формулами Word.

Результат: exports/word/ЛР-NN <назва>.docx

Запуск (з кореня проєкту):
  npm run export:word            # = npm run build && python3 scripts/export-word/export_word.py
  python3 scripts/export-word/export_word.py [--out теки] [--only diode-iv]

Потрібно: Python 3.10+, пакет playwright (pip install playwright), Google Chrome або Chromium
(шлях — змінна CHROME_PATH, за замовчуванням /usr/bin/google-chrome), pandoc ≥ 3.
"""
from __future__ import annotations

import argparse
import datetime
import http.server
import io
import os
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
OUT_DEFAULT = ROOT / 'exports' / 'word'
CHROME = os.environ.get('CHROME_PATH', '/usr/bin/google-chrome')

# --------------------------------------------------------------------------------------------
# Шаблон стилів Word (reference.docx) — на основі стандартного шаблону pandoc
# --------------------------------------------------------------------------------------------

FONT = 'Times New Roman'
RFONTS = f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:eastAsia="{FONT}" w:cs="{FONT}"/>'

# Власні стилі абзаців: назва → оформлення. Назви збігаються з data-custom-style у HTML.
CUSTOM_STYLES = {
    'Визначення': dict(border='left', color='1F4E9C', sz=24, fill='EAF0F9'),
    'Головна думка': dict(border='left', color='E0531A', sz=24, fill='FCEBE1'),
    'Примітка': dict(border='left', color='5B7DB8', sz=12, fill='F1F5FB'),
    'Увага': dict(border='left', color='BB3326', sz=24, fill='FBE7E3'),
    'Формула': dict(border='box', color='BDB39C', sz=6, fill='FBFAF4'),
    'Завдання': dict(border='box', color='18212F', sz=12, fill='FFFDF7'),
    'Для викладача': dict(border='box', color='C9A227', sz=8, fill='FFF6D6',
                          rpr='<w:sz w:val="21"/><w:szCs w:val="21"/>'),
    'Підказка': dict(rpr='<w:i/><w:iCs/><w:color w:val="4A5568"/><w:sz w:val="22"/><w:szCs w:val="22"/>',
                     ind=0),
    'Рисунок': dict(jc='center'),
    'Підпис рисунка': dict(jc='center', rpr='<w:i/><w:iCs/><w:sz w:val="20"/><w:szCs w:val="20"/>'),
}


def _custom_style_xml(name: str, s: dict) -> str:
    sid = name.replace(' ', '')
    ppr = []
    if s.get('border') == 'left':
        ppr.append(f'<w:pBdr><w:left w:val="single" w:sz="{s["sz"]}" w:space="8" w:color="{s["color"]}"/></w:pBdr>')
    elif s.get('border') == 'box':
        side = f'w:val="single" w:sz="{s["sz"]}" w:space="6" w:color="{s["color"]}"'
        ppr.append(f'<w:pBdr><w:top {side}/><w:left {side}/><w:bottom {side}/><w:right {side}/></w:pBdr>')
    if s.get('fill'):
        ppr.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{s["fill"]}"/>')
    ppr.append('<w:spacing w:before="40" w:after="40"/>')
    if s.get('border'):
        ppr.append('<w:ind w:left="198" w:right="113"/>')
    elif 'ind' in s:
        ppr.append(f'<w:ind w:left="{s["ind"]}"/>')
    if s.get('jc'):
        ppr.append(f'<w:jc w:val="{s["jc"]}"/>')
    rpr = f'<w:rPr>{s["rpr"]}</w:rPr>' if s.get('rpr') else ''
    return (
        f'<w:style w:type="paragraph" w:customStyle="1" w:styleId="{sid}">'
        f'<w:name w:val="{name}"/><w:basedOn w:val="BodyText"/><w:qFormat/>'
        f'<w:pPr>{"".join(ppr)}</w:pPr>{rpr}</w:style>'
    )


def _set_style_rpr(xml: str, style_id: str, rpr: str) -> str:
    m = re.search(rf'<w:style [^>]*w:styleId="{style_id}"[^>]*>.*?</w:style>', xml, re.S)
    if not m:
        return xml
    block = m.group(0)
    if re.search(r'<w:rPr>.*?</w:rPr>', block, re.S):
        new = re.sub(r'<w:rPr>.*?</w:rPr>', rpr, block, count=1, flags=re.S)
    else:
        new = block.replace('</w:style>', rpr + '</w:style>')
    return xml.replace(block, new)


def _patch_styles(xml: str) -> str:
    # Шрифт, мова (для перевірки правопису) і міжрядковий інтервал за замовчуванням
    xml = re.sub(r'(<w:rPrDefault>.*?)<w:rFonts[^>]*/>', rf'\g<1>{RFONTS}', xml, count=1, flags=re.S)
    xml = re.sub(r'<w:lang [^>]*/>', '<w:lang w:val="uk-UA" w:eastAsia="uk-UA" w:bidi="ar-SA"/>', xml, count=1)
    xml = re.sub(r'(<w:pPrDefault>\s*<w:pPr>\s*)<w:spacing[^>]*/>',
                 r'\g<1><w:spacing w:after="120" w:line="276" w:lineRule="auto"/>', xml, count=1)
    # Заголовки: чорні, жирні, Times New Roman
    for sid, size in (('Heading1', 32), ('Heading2', 28), ('Heading3', 25), ('Title', 36)):
        xml = _set_style_rpr(
            xml, sid,
            f'<w:rPr>{RFONTS}<w:b/><w:bCs/><w:color w:val="18212F"/>'
            f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>',
        )
    # Таблиці: рамки та затінений жирний перший рядок
    m = re.search(r'<w:style [^>]*w:styleId="Table"[^>]*>.*?</w:style>', xml, re.S)
    if m:
        block = m.group(0)
        b = 'w:val="single" w:sz="4" w:space="0" w:color="8C8672"'
        borders = (f'<w:tblBorders><w:top {b}/><w:left {b}/><w:bottom {b}/><w:right {b}/>'
                   f'<w:insideH {b}/><w:insideV {b}/></w:tblBorders>')
        new = block.replace('<w:tblPr>', '<w:tblPr>' + borders, 1)
        new = new.replace('<w:tblStylePr w:type="firstRow">',
                          '<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/></w:rPr>', 1)
        new = re.sub(r'<w:vAlign w:val="bottom"\s*/>',
                     '<w:shd w:val="clear" w:color="auto" w:fill="EBE5D6"/><w:vAlign w:val="bottom"/>', new, count=1)
        xml = xml.replace(block, new)
    # Власні стилі блоків
    custom = ''.join(_custom_style_xml(n, s) for n, s in CUSTOM_STYLES.items())
    return xml.replace('</w:styles>', custom + '</w:styles>')


def _patch_document(xml: str) -> str:
    """Сторінка A4, поля 2,5 / 1,5 / 2 / 2 см."""
    pg = '<w:pgSz w:w="11906" w:h="16838"/>'
    mar = ('<w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1418" '
           'w:header="709" w:footer="709" w:gutter="0"/>')
    if '<w:sectPr' in xml:
        xml = re.sub(r'<w:pgSz[^>]*/>', pg, xml)
        xml = re.sub(r'<w:pgMar[^>]*/>', mar, xml)
        if '<w:pgSz' not in xml:
            xml = re.sub(r'(<w:sectPr[^>]*>)', rf'\g<1>{pg}{mar}', xml, count=1)
    else:
        xml = xml.replace('</w:body>', f'<w:sectPr>{pg}{mar}</w:sectPr></w:body>')
    return xml


def build_reference_docx(path: Path) -> None:
    base = subprocess.run(['pandoc', '--print-default-data-file', 'reference.docx'],
                          capture_output=True, check=True).stdout
    with zipfile.ZipFile(io.BytesIO(base)) as zin, zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'word/styles.xml':
                data = _patch_styles(data.decode('utf-8')).encode('utf-8')
            elif item.filename == 'word/document.xml':
                data = _patch_document(data.decode('utf-8')).encode('utf-8')
            zout.writestr(item, data)


# --------------------------------------------------------------------------------------------
# Перетворення сторінки лаби на «чистий» HTML (виконується в браузері)
# --------------------------------------------------------------------------------------------

MARK_FIGURES_JS = """
() => {
  // Статичні рисунки поза стендом (напр. зонна діаграма) — позначаємо для скриншотів
  const figs = [...document.querySelectorAll('article.lab-body figure:not(.formula)')]
    .filter((f) => !f.closest('astro-island'));
  figs.forEach((f, i) => f.setAttribute('data-export-fig', String(i + 1)));
  return figs.length;
}
"""

EXTRACT_JS = r"""
({ slug }) => {
  const doc = document;
  const art = doc.querySelector('article.lab-body').cloneNode(true);
  const q = (sel, root = art) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, children = []) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    for (const c of children) e.append(c);
    return e;
  };
  const styled = (style, children) => el('div', { 'data-custom-style': style }, children);
  const BLOCK = /^(P|UL|OL|TABLE|DIV|H[1-6]|BLOCKQUOTE|FIGURE|SECTION)$/;
  // Вміст контейнера як масив блоків (вільний текст загортається в <p>)
  const blocks = (c) => {
    if (!c) return [];
    const out = [];
    let run = [];
    const flush = () => {
      if (run.some((n) => n.nodeType === 1 || n.textContent.trim())) out.push(el('p', {}, run));
      run = [];
    };
    for (const n of Array.from(c.childNodes)) {
      if (n.nodeType === 1 && BLOCK.test(n.tagName)) { flush(); out.push(n); } else run.push(n);
    }
    flush();
    return out;
  };

  q('.lab-refcard, .lab-pager, style, script, .lab-meta__virtual, .task__stamp, .task__kicker')
    .forEach((e) => e.remove());

  // Формули KaTeX → span.math з TeX-джерелом (math.lua перетворить на формули Word)
  q('.katex-display').forEach((d) => {
    const tex = d.querySelector('annotation')?.textContent ?? '';
    const s = el('span', { class: 'math display', 'data-tex': tex });
    s.textContent = tex;
    if (d.parentElement && d.parentElement.tagName === 'P') d.replaceWith(s);
    else d.replaceWith(el('p', {}, [s]));
  });
  q('.katex').forEach((k) => {
    const tex = k.querySelector('annotation')?.textContent ?? '';
    const s = el('span', { class: 'math inline', 'data-tex': tex });
    s.textContent = tex;
    k.replaceWith(s);
  });

  // Посилання → звичайний текст; обгортки таблиць прибираємо
  q('a').forEach((a) => a.replaceWith(...a.childNodes));
  q('.table-scroll').forEach((d) => d.replaceWith(...d.childNodes));

  // Інтерактивний стенд → скриншот
  q('astro-island').forEach((isl) => {
    isl.replaceWith(
      styled('Рисунок', [el('p', {}, [el('img', { src: `${slug}-stand.png`, alt: 'Віртуальний стенд', width: '100%' })])]),
      styled('Підпис рисунка', [el('p', {}, ['Рис. Віртуальний стенд (скриншот). На сайті стенд інтерактивний: студент змінює параметри, знімає покази приладів і записує їх у таблицю.'])]),
    );
  });

  // Статичні рисунки → скриншоти
  q('figure[data-export-fig]').forEach((f) => {
    const i = f.getAttribute('data-export-fig');
    const cap = f.querySelector('figcaption')?.textContent?.trim();
    const nodes = [styled('Рисунок', [el('p', {}, [el('img', { src: `${slug}-fig${i}.png`, width: '75%' })])])];
    if (cap) nodes.push(styled('Підпис рисунка', [el('p', {}, [cap])]));
    f.replaceWith(...nodes);
  });

  // Блоки «Головна думка», «Примітка», «Увага»
  const CALLOUT = { idea: 'Головна думка', note: 'Примітка', warning: 'Увага' };
  q('aside.callout').forEach((a) => {
    const kind = Object.keys(CALLOUT).find((k) => a.classList.contains(`callout--${k}`)) ?? 'note';
    const t = a.querySelector('.callout__title');
    t?.querySelector('[aria-hidden]')?.remove();
    const title = t?.textContent?.trim() || CALLOUT[kind];
    a.replaceWith(styled(CALLOUT[kind], [el('p', {}, [el('strong', {}, [title])]), ...blocks(a.querySelector('.callout__body'))]));
  });

  // Визначення: «**термін** — пояснення»
  q('div.def').forEach((d) => {
    const term = d.querySelector('dfn')?.textContent?.trim() ?? '';
    const en = d.querySelector('.def__en')?.textContent?.trim();
    const bs = blocks(d.querySelector('.def__body'));
    const head = [el('strong', {}, [term]), ...(en ? [` (${en})`] : []), ' — '];
    if (bs[0] && bs[0].tagName === 'P') bs[0].prepend(...head);
    else bs.unshift(el('p', {}, [el('strong', {}, [term])]));
    d.replaceWith(styled('Визначення', bs));
  });

  // Іменовані формули
  q('figure.formula').forEach((f) => {
    const name = f.querySelector('figcaption')?.textContent?.trim() ?? '';
    f.replaceWith(styled('Формула', [el('p', {}, [el('strong', {}, [name])]), ...blocks(f.querySelector('.formula__body'))]));
  });

  // Кінцеве завдання
  q('section.task').forEach((t) => {
    const title = t.querySelector('.task__title')?.textContent?.trim() ?? '';
    t.replaceWith(styled('Завдання', [el('p', {}, [el('strong', {}, [`Кінцеве завдання: ${title}`])]), ...blocks(t.querySelector('.task__body'))]));
  });

  // Контрольні запитання з підказками
  q('ol.questions').forEach((ol) => {
    const items = Array.from(ol.querySelectorAll(':scope > li.q')).map((li) => {
      const parts = [el('p', {}, [li.querySelector('.q__text')?.textContent?.trim() ?? ''])];
      const hint = li.querySelector('details.q__hint > div');
      if (hint) {
        const hb = blocks(hint);
        if (hb[0] && hb[0].tagName === 'P') hb[0].prepend(el('em', {}, ['Підказка: ']));
        parts.push(styled('Підказка', hb));
      }
      return el('li', {}, parts);
    });
    ol.replaceWith(el('ol', {}, items));
  });

  const txt = (s) => doc.querySelector(s)?.textContent?.trim() ?? '';
  return {
    html: art.innerHTML,
    title: txt('.tb-title h1'),
    num: Number(txt('.tb-numval').replace(/\D/g, '')),
    duration: txt('.tb-dur span:last-child'),
    docTitle: doc.title.split(' · ')[0],
  };
}
"""


def _esc(s: str) -> str:
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _source_folder(slug: str) -> str:
    """Тека лаби за slug (для примітки «де редагувати на сайті»)."""
    for f in sorted((ROOT / 'src' / 'labs').glob('[0-9]*/index.mdx')):
        if re.search(rf'^slug:\s*{re.escape(slug)}\s*$', f.read_text(encoding='utf-8'), re.M):
            return str(f.relative_to(ROOT))
    return f'src/labs/…/{slug}'


def page_html(data: dict, slug: str) -> str:
    today = datetime.date.today().strftime('%d.%m.%Y')
    note = (
        f'<div data-custom-style="Для викладача">'
        f'<p><strong>Примітка для викладача.</strong> Це текст сторінки лабораторної роботи №{data["num"]} '
        f'з сайту віртуальної лабораторії (стан на {today}). Інтерактивний стенд показано скриншотом; '
        f'формули — редаговані формули Word.</p>'
        f'<p>Будь ласка, вносьте правки в режимі рецензування (Рецензування → Відстеження змін) '
        f'або залишайте примітки — так зміни буде легко перенести на сайт. '
        f'Джерело на сайті: {_esc(_source_folder(slug))}.</p></div>'
    )
    return (
        '<!doctype html><html lang="uk"><head><meta charset="utf-8"></head><body>'
        f'<h1>Лабораторна робота №{data["num"]}</h1>'
        f'<p><strong>Тема:</strong> {_esc(data["title"])}</p>'
        f'<p><strong>Тривалість:</strong> {_esc(data["duration"])}</p>'
        f'{note}{data["html"]}</body></html>'
    )


def _safe_filename(s: str) -> str:
    s = s.replace('№', '').replace('ЛР ', 'ЛР-')
    s = re.sub(r'[\\/:*?"<>|]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# --------------------------------------------------------------------------------------------

class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # без логів кожного запиту
        pass


def main() -> None:
    ap = argparse.ArgumentParser(description='Експорт сторінок лабораторних робіт у Word (.docx)')
    ap.add_argument('--out', type=Path, default=OUT_DEFAULT, help='тека для .docx (за замовч. exports/word)')
    ap.add_argument('--only', nargs='*', help='slug-и лаб (за замовч. — усі)')
    args = ap.parse_args()

    if not (DIST / 'labs').is_dir():
        raise SystemExit('Немає зібраного сайту (dist/). Спершу виконайте: npm run build')
    slugs = sorted(p.name for p in (DIST / 'labs').iterdir() if (p / 'index.html').exists())
    if args.only:
        slugs = [s for s in slugs if s in args.only]
    args.out.mkdir(parents=True, exist_ok=True)

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(_QuietHandler, directory=str(DIST)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_address[1]}'

    work = Path(tempfile.mkdtemp(prefix='export-word-'))
    ref = work / 'reference.docx'
    build_reference_docx(ref)

    try:
        with sync_playwright() as p:
            launch = {'executable_path': CHROME, 'args': ['--headless=new']} if Path(CHROME).exists() else {}
            browser = p.chromium.launch(**launch)
            page = browser.new_page(viewport={'width': 1280, 'height': 900}, device_scale_factor=1.5)
            for slug in slugs:
                page.goto(f'{base}/labs/{slug}/', wait_until='networkidle')
                # Липка шапка не повинна потрапляти на скриншоти; стрілки приладів — без анімації
                # Підписи рисунків ховаємо на скриншоті — у Word вони йдуть окремим абзацом
                page.add_style_tag(content='.site-header{display:none!important}'
                                           '.sim-meter__needle{transition:none!important}'
                                           '[data-export-fig] figcaption{display:none!important}')
                page.wait_for_timeout(1500)
                n_figs = page.evaluate(MARK_FIGURES_JS)
                for i in range(1, n_figs + 1):
                    page.locator(f'[data-export-fig="{i}"]').screenshot(path=str(work / f'{slug}-fig{i}.png'))
                page.locator('article.lab-body astro-island .sim').first.screenshot(path=str(work / f'{slug}-stand.png'))
                data = page.evaluate(EXTRACT_JS, {'slug': slug})

                html_path = work / f'{slug}.html'
                html_path.write_text(page_html(data, slug), encoding='utf-8')
                out = args.out / f'{_safe_filename(data["docTitle"])}.docx'
                subprocess.run(
                    ['pandoc', str(html_path), '-f', 'html', '-t', 'docx',
                     '--reference-doc', str(ref), '--lua-filter', str(HERE / 'math.lua'),
                     '--resource-path', str(work), '-M', 'lang=uk-UA', '-o', str(out)],
                    check=True,
                )
                print(f'✓ {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}')
            browser.close()
    finally:
        server.shutdown()
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
