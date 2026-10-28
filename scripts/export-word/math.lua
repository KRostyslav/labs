--[[
  Lua-фільтр pandoc для експорту в Word.
  Скрипт export_word.py замінює формули KaTeX на <span class="math inline|display" data-tex="…">.
  Тут такі span-и перетворюються на справжні формули pandoc → у .docx це редаговані формули Word (OMML).
]]
function Span(el)
  if el.classes:includes('math') then
    local tex = el.attributes['tex'] or el.attributes['data-tex'] or pandoc.utils.stringify(el)
    local kind = el.classes:includes('display') and 'DisplayMath' or 'InlineMath'
    return pandoc.Math(kind, tex)
  end
end
