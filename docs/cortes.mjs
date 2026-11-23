/* ==========================================================================
   CORTES — procura texto cortado na tela que está aberta (regra do dono "espaçamento sem corte": nenhum texto cortado, nada
   encostado em borda). Roda dentro da página (page.evaluate) e devolve uma lista do que achou; lista vazia = nada cortado.
   O que conta como corte:
   - reticências: o elemento esconde o que passa (text-overflow / overflow) e o texto é mais largo que ele;
   - fora da tela: um pedaço do texto passa da borda da tela;
   - preso numa caixa: um pedaço do texto passa da borda de um ancestral que ESCONDE o que sobra (overflow hidden/clip).
     Caixa que ROLA (overflow auto/scroll, como a conversa) não conta: ali o resto está a um gesto de distância;
   - palavra partida: uma palavra quebra de uma linha para a outra no meio dela (com ou sem hífen);
   - encostado na régua: o texto de uma coluna chega a menos de 8 px do traço que separa a coluna seguinte.
   Fora da conta: o que é só para leitor de tela, o que está escondido, as miniaturas das prévias (o site do cliente em escala)
   e a travessia entre páginas. Usado por docs/e2e-orcamento.mjs (CORTES=1) e pelas conferências do palco.
   ========================================================================== */
export function procurarCortes() {
  const W = document.documentElement.clientWidth, achados = [];
  const FORA = '.sr-only, [hidden], .pv-tela, .passagem, .skip-link, .orc-turnstile, .visor[hidden], .dir__mini';
  const nome = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '');
  const anota = (tipo, el, texto) => { const t = tipo + ': ' + nome(el) + ' "' + texto.trim().replace(/\s+/g, ' ').slice(0, 40) + '"'; if (!achados.includes(t)) achados.push(t); };
  /* escondido de propósito para a vista (a caixa de 1 px com clip, o padrão .sr-only que o site repete em vários lugares) */
  const soLeitor = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const r = e.getBoundingClientRect(); if (r.width <= 1 && r.height <= 1) return true; } return false; };
  const esconde = el => { const c = getComputedStyle(el); return /hidden|clip/.test(c.overflowX) || /hidden|clip/.test(c.overflowY); };
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const n = tw.currentNode, el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest(FORA) || !el.checkVisibility({ visibilityProperty: true, opacityProperty: false })) continue;
    if (el.closest('svg') || soLeitor(el)) continue;
    const c = getComputedStyle(el);
    if ((c.textOverflow === 'ellipsis' || esconde(el)) && el.scrollWidth > el.clientWidth + 1 && c.whiteSpace !== 'normal') anota('reticências', el, n.textContent);
    for (const m of n.textContent.matchAll(/\S{2,}/g)) {
      const rp = document.createRange(); rp.setStart(n, m.index); rp.setEnd(n, m.index + m[0].length);
      const tops = [...new Set([...rp.getClientRects()].filter(q => q.width > 0).map(q => Math.round(q.top)))];
      if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 2) anota('palavra partida', el, m[0]);
    }
    const rg = document.createRange(); rg.selectNodeContents(n);
    const rects = [...rg.getClientRects()].filter(q => q.width > 0 && q.height > 0);
    /* (num carrossel que rola de lado, como os modelos no celular, o cartão seguinte está fora da tela de propósito: a um gesto) */
    const rolaDeLado = () => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true; return false; };
    if (rects.some(q => q.right > W + 0.5 || q.left < -0.5) && !rolaDeLado()) anota('fora da tela', el, n.textContent);
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ca = getComputedStyle(a);
      if (/auto|scroll/.test(ca.overflowY) || /auto|scroll/.test(ca.overflowX)) break;   /* (caixa que rola: o resto está a um gesto) */
      if (!esconde(a)) continue;
      const r = a.getBoundingClientRect();
      if (rects.some(q => q.right > r.right + 0.5 || q.left < r.left - 0.5 || q.bottom > r.bottom + 0.5 || q.top < r.top - 0.5)) anota('preso numa caixa (' + nome(a) + ')', el, n.textContent);
      break;
    }
  }
  /* o texto de uma coluna não encosta no traço da coluna seguinte (8 px de folga, no mínimo: a mesma ordem do respiro do outro lado) */
  for (const col of document.querySelectorAll('main *')) {
    if (col.closest(FORA) || !col.checkVisibility()) continue;
    const cc = getComputedStyle(col);
    if (parseFloat(cc.borderLeftWidth) < 1 || cc.borderLeftStyle === 'none' || cc.display === 'inline') continue;
    const ant = col.previousElementSibling;
    if (!ant || ant.closest(FORA) || soLeitor(ant) || !ant.checkVisibility()) continue;
    const borda = col.getBoundingClientRect().left, ra = ant.getBoundingClientRect(), rc = col.getBoundingClientRect();
    if (ra.right > borda + 1 || ra.bottom <= rc.top || ra.top >= rc.bottom) continue;   /* (só colunas lado a lado: a moldura de um bloco embaixo do outro não é régua de coluna) */
    const tw2 = document.createTreeWalker(ant, NodeFilter.SHOW_TEXT);
    while (tw2.nextNode()) {
      const rg = document.createRange(); rg.selectNodeContents(tw2.currentNode);
      const q = [...rg.getClientRects()].filter(x => x.width > 0 && x.top < col.getBoundingClientRect().bottom && x.bottom > col.getBoundingClientRect().top);
      if (q.some(x => x.right > borda - 8)) { anota('encostado na régua de ' + nome(col), tw2.currentNode.parentElement, tw2.currentNode.textContent); break; }
    }
  }
  return achados;
}

/* para quem tem a página do Playwright na mão */
export const cortes = page => page.evaluate(procurarCortes);
