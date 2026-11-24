/* O TEMA DO ORÇAMENTO (dono, 23/11: "escuro ativado de início; caso o usuário deseje mudar, clicar em um botão e muda").
   O escuro é o padrão de todo visitante (e o de quem não tem JS: o HTML e o CSS já nascem escuros). O botão do topo (.nav__tema)
   troca para o claro da v2 e volta; a escolha fica no aparelho (localStorage).
   Carregado no <head>, SEM defer, antes das folhas de estilo: o data-tema do <html> está posto antes da 1ª pintura e o tema
   guardado nunca pisca (docs/tema-orcamento.mjs prova com o script atrasado). Externo porque a CSP é script-src 'self'.
   O claro diz "only light" (o Chrome do celular escurecia a página clara sozinho e estragava a logo e o nome, print do dono de
   24/11); o escuro diz "dark" (uma página que já é escura o navegador não escurece). */
(function (raiz) {
  'use strict';
  var CHAVE = 'bz-orcamento-tema';
  var CLARO = 'claro', ESCURO = 'escuro';
  var ESQUEMA = { claro: 'only light', escuro: 'dark' };
  var COR_BARRA = { claro: '#FFFFFF', escuro: '#131617' };   /* (a cor da barra do navegador: a mesma do topo de cada tema) */

  /* só "claro" exato volta ao claro; qualquer outra coisa (nada, lixo, armazenamento quebrado) é o escuro */
  function lerTema(armazem) {
    try { return armazem && armazem.getItem(CHAVE) === CLARO ? CLARO : ESCURO; } catch (e) { return ESCURO; }
  }
  function guardarTema(armazem, tema) {
    try { armazem.setItem(CHAVE, tema); return true; } catch (e) { return false; }   /* (sem poder guardar, a troca vale só nesta visita) */
  }
  function aplicarTema(doc, tema) {
    var t = tema === CLARO ? CLARO : ESCURO;
    doc.documentElement.setAttribute('data-tema', t);
    var esquema = doc.querySelector('meta[name="color-scheme"]');
    if (esquema) esquema.setAttribute('content', ESQUEMA[t]);
    var barra = doc.querySelector('meta[name="theme-color"]');
    if (barra) barra.setAttribute('content', COR_BARRA[t]);
    var botoes = doc.querySelectorAll('.nav__tema');
    for (var i = 0; i < botoes.length; i++) botoes[i].setAttribute('aria-pressed', t === CLARO ? 'true' : 'false');
    return t;
  }
  function alternar(doc, armazem) {
    var novo = doc.documentElement.getAttribute('data-tema') === CLARO ? ESCURO : CLARO;
    aplicarTema(doc, novo);
    guardarTema(armazem, novo);
    return novo;
  }

  var api = { CHAVE: CHAVE, lerTema: lerTema, guardarTema: guardarTema, aplicarTema: aplicarTema, alternar: alternar };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  var doc = raiz.document, armazem = null;
  try { armazem = raiz.localStorage; } catch (e) { armazem = null; }
  aplicarTema(doc, lerTema(armazem));
  /* o botão ainda não existe aqui (o <body> não chegou): o clique é ouvido no documento, e o aria-pressed acerta quando ele chega */
  doc.addEventListener('click', function (ev) {
    var alvo = ev.target && ev.target.closest ? ev.target.closest('.nav__tema') : null;
    if (alvo) alternar(doc, armazem);
  });
  doc.addEventListener('DOMContentLoaded', function () { aplicarTema(doc, doc.documentElement.getAttribute('data-tema')); });
})(typeof window !== 'undefined' ? window : this);
