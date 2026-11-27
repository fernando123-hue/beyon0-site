/* A CENA NA MINIATURA (Mapa vivo v2, Fase 2, PR 2; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 2").
   Dentro da miniatura do site dela (#o-nasce), abaixo do título, o corte arquitetônico do lugar (js/cena-tracos.js + js/cena-desenho.js), montado
   por código no aparelho (js/cena-dicionario.js) do ramo que ela tocou, dos objetivos e do que ela escreveu (só as falas DELA no estado).
   - Só com o mapa vivo ligado (o estado traz reacao: true; BZ_REACAO). Desligado: o lugar some e NADA é baixado (a página é a de hoje).
   - Ligado: o lugar é reservado na hora (aspect-ratio no CSS estático, sem empurrar a página depois) e os 7 módulos e o CSS da cena vêm sob
     demanda, uma vez, em ordem, de URL CONSTANTE (padrão de js/orcamento-reacao.js). Falhou ao baixar: o lugar some, sem novas tentativas.
   - Depoimento nunca aparece aqui: a tela não sabe se o nicho é regulado (regulado vai sem valor, e o dicionário falha fechado).
   - O desenho só se refaz quando a cena muda (não reanima a cada render); o toque novo (bz:respostas) redesenha com o último estado.
   Decorativo (o SVG é aria-hidden). ES5: window.BZOrcCenaTela; nunca lança. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica(raiz);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcCenaTela = api;
})(typeof window !== 'undefined' ? window : null, function (raiz) {
  'use strict';

  var CSS = 'css/orcamento-cena.css';
  /* [URL constante, o global que o arquivo define], na ordem em que um depende do outro */
  var MODULOS = [
    ['js/oracao.js', 'BZOracao'], ['js/orcamento-cena-forma.js', 'BZCenaForma'], ['js/cena-dicionario.js', 'BZCenaDicionario'],
    ['js/planta-pecas.js', 'BZPlantaPecas'], ['js/mapa-saber.js', 'BZMapaSaber'], ['js/cena-tracos.js', 'BZCenaTracos'], ['js/cena-desenho.js', 'BZCenaDesenho']
  ];
  var TEXTO_MAX = 2000;
  var st = { carga: 'nao', ultimoE: null, assinatura: null, ouvindo: false };
  var ehObjeto = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };

  function janela() { return raiz || {}; }
  function prontos(w) { for (var i = 0; i < MODULOS.length; i++) if (!w[MODULOS[i][1]]) return false; return true; }

  /* baixa, um de cada vez, o que ainda falta; aoFim(true) com tudo pronto, aoFim(false) se algum falhou */
  function baixar(w, doc, aoFim) {
    var i = 0;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS;
    doc.head.appendChild(link);
    function proximo() {
      while (i < MODULOS.length && w[MODULOS[i][1]]) i++;
      if (i >= MODULOS.length) { aoFim(prontos(w)); return; }
      var s = doc.createElement('script');
      s.src = MODULOS[i][0];
      s.async = false;
      s.onload = function () { i++; proximo(); };
      s.onerror = function () { aoFim(false); };
      doc.head.appendChild(s);
    }
    proximo();
  }
  function carregar(w, doc, alvo) {
    if (st.carga !== 'nao') return;
    st.carga = 'baixando';
    baixar(w, doc, function (ok) {
      st.carga = ok ? 'pronta' : 'falhou';
      if (!ok) { alvo.hidden = true; return; }
      desenhar(w, doc, alvo, st.ultimoE);
    });
  }

  /* o que ela escreveu: só as falas DELA (o que o Zero disse não conta), as últimas TEXTO_MAX letras */
  function falasDela(E) {
    var m = Array.isArray(E.mensagens) ? E.mensagens : [], partes = [], i;
    for (i = 0; i < m.length; i++) if (ehObjeto(m[i]) && m[i].papel === 'visitante' && typeof m[i].conteudo === 'string') partes.push(m[i].conteudo);
    var t = partes.join('. ');
    return t.length > TEXTO_MAX ? t.slice(t.length - TEXTO_MAX) : t;
  }
  function cenaDoEstado(w, E) {
    var r = w.BZToques && typeof w.BZToques.respostas === 'function' ? w.BZToques.respostas() : null;
    if (!ehObjeto(r)) return null;
    var texto = falasDela(E);
    return w.BZCenaDicionario.cenaDoCaso({
      ramo: r.ramo, texto: texto, canais: w.BZMapaSaber.origensDoCaso(texto), objetivos: r.objetivos,
      regulado: undefined   /* (a tela não sabe o nicho: depoimento nunca na tela) */
    });
  }
  function desenhar(w, doc, alvo, E) {
    if (!E || !prontos(w)) return false;
    var cena = cenaDoEstado(w, E), assinatura = JSON.stringify(cena);
    if (assinatura === st.assinatura) return !!cena;
    st.assinatura = assinatura;
    if (!cena) { while (alvo.firstChild) alvo.removeChild(alvo.firstChild); return false; }
    return !!w.BZCenaDesenho.desenhar(doc, alvo, w.BZCenaTracos.tracosDaCena(cena));
  }

  /* o estado chegou (js/orcamento.js, a cada render) */
  function atualizar(E) {
    try {
      var w = janela(), doc = w.document, alvo = doc && doc.getElementById ? doc.getElementById('o-nasce-cena') : null;
      if (!alvo) return false;
      if (!ehObjeto(E) || E.reacao !== true || st.carga === 'falhou') { alvo.hidden = true; return false; }
      alvo.hidden = false;
      st.ultimoE = E;
      if (!st.ouvindo && typeof doc.addEventListener === 'function') {
        st.ouvindo = true;
        doc.addEventListener('bz:respostas', function () { try { if (st.carga === 'pronta') desenhar(w, doc, alvo, st.ultimoE); } catch (x) { /* a cena é enfeite */ } });
      }
      if (prontos(w)) { st.carga = 'pronta'; return desenhar(w, doc, alvo, E); }
      carregar(w, doc, alvo);
      return false;
    } catch (x) { return false; }
  }

  return Object.freeze({ atualizar: atualizar, MODULOS: MODULOS, CSS: CSS });
});
