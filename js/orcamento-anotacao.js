/* MAPA VIVO v2, fase 1b NA PÁGINA: a anotação curta da IA. Enquanto a pessoa escreve, ~0,7 s depois de ela parar, uma linha acima da caixa diz
   "O Zero (IA) anotou: ..." (o servidor é a ação `reagir`: api/_vendas/fluxo-reacao.mjs, que redige, confere e devolve só frase fiel ao texto).
   Especificação no cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "Fase 1b". js/orcamento.js chama BZOrcAnotacao.atualizar(E) a cada render().
   - Só com a reação ligada no servidor (o estado traz reacao: true; hoje só na prévia). Sem ela, nada é criado nem ouvido: a tela é a de hoje.
   - LGPD (revisão de segurança do PR #274): o AVISO aparece antes da 1ª chamada, no mesmo lugar em que a anotação vai aparecer (quem a vê já leu
     que uma IA da Anthropic, fora do Brasil, lê o texto); "Desligar" fica guardado no aparelho e, desligada, a página nunca chama `reagir`;
     a anotação é rotulada como IA e entra só por textContent.
   - O porteiro é regra de código: texto com 25 caracteres ou mais, 700 ms de pausa, 15 caracteres novos desde a última chamada, até 3 chamadas por
     mensagem e 12 por conversa (o servidor também conta as 12). Resposta velha (seq menor que uma já respondida) não troca a linha.
   - O lugar tem altura fixa (o aviso e a anotação cabem no mesmo espaço): a linha chega sem empurrar a caixa.
   - No envio (bz:pensando), a anotação vira a 1ª linha do cartão "Analisando o seu caso…" e o lugar volta ao aviso.
   - Falha fechada: qualquer erro tira a linha, com aviso "[beyon] anotacao". ES5. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcAnotacao = api.criar(raiz);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var MINIMO = 25, PAUSA = 700, NOVOS = 15, POR_MENSAGEM = 3, POR_CONVERSA = 12, FINAL = 400, LETRA_MS = 18, ANOTACAO_MAX = 120;
  var CHAVE = 'bz-anotacao', DESLIGADA = 'desligada';
  var TEXTOS = {
    rotuloAviso: 'Anotação ao vivo',
    /* (espaços que não quebram, \u00a0, prendem os trechos de sentido: a linha nunca quebra em 'lê o / que você escreve', medido em 320 e 390) */
    aviso: 'Uma IA da Anthropic, fora\u00a0do\u00a0Brasil, lê\u00a0o\u00a0que\u00a0você\u00a0escreve. Não guardamos o\u00a0texto, e\u00a0contatos viram\u00a0marcadores.',
    rotulo: 'O Zero (IA) anotou:',
    desligada: 'Anotação ao vivo desligada.',
    saiba: 'Saiba mais', naoEIsso: 'Não é isso', desligar: 'Desligar', ligar: 'Ligar'
  };
  var SAIBA_URL = 'privacidade.html#orcamento';
  var ehObjeto = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
  var ligada = function (E) { return ehObjeto(E) && E.reacao === true; };
  var comum = function (a, b) { var i = 0, n = Math.min(a.length, b.length); while (i < n && a.charAt(i) === b.charAt(i)) i++; return i; };

  function criar(win) {
    var doc = win.document;
    var st = { caixa: null, campo: null, timer: 0, letras: 0, ouvindo: false, falhou: false, desligadaAqui: false, pensando: false, modo: '', noCartao: null,
      seq: 0, respondido: 0, mensagem: 0, porMensagem: 0, porConversa: 0, conversa: null, ultimo: '', anotacao: '' };
    var $ = function (id) { return doc.getElementById(id); };

    function desligada() {
      if (st.desligadaAqui) return true;
      try { return win.localStorage.getItem(CHAVE) === DESLIGADA; } catch (e) { return false; }
    }
    function guardar(sim) {
      st.desligadaAqui = sim;   /* (sem armazenamento no aparelho, vale ao menos nesta página) */
      try { if (sim) win.localStorage.setItem(CHAVE, DESLIGADA); else win.localStorage.removeItem(CHAVE); } catch (e) { /* idem */ }
    }
    function falhar(e) {
      st.falhou = true;
      tirar();
      if (win.console) win.console.warn('[beyon] anotacao', e && e.message ? e.message : e);
    }
    function pararLetras() { win.clearTimeout(st.letras); st.letras = 0; }
    function tirarDoCartao() {
      if (st.noCartao && st.noCartao.parentNode) st.noCartao.parentNode.removeChild(st.noCartao);
      st.noCartao = null;
    }
    function tirar() {
      if (st.caixa && st.caixa.parentNode) st.caixa.parentNode.removeChild(st.caixa);
      st.caixa = null;
      if (st.campo && st.ouvindo) st.campo.removeEventListener('input', aoDigitar);
      st.ouvindo = false;
      win.clearTimeout(st.timer);
      pararLetras();
      tirarDoCartao();
      st.anotacao = '';
      st.modo = '';
    }

    function el(tag, classe, texto) {
      var n = doc.createElement(tag);
      if (classe) n.className = classe;
      if (texto) n.textContent = texto;
      return n;
    }
    function botao(texto, aoTocar) {
      var b = el('button', 'orc-anota__acao', texto);
      b.setAttribute('type', 'button');
      b.addEventListener('click', function () { try { aoTocar(); } catch (e) { falhar(e); } });
      return b;
    }
    /* o foco estava num botão que vai sumir: passa para o que fica no lugar (sem ele, o foco cairia no body) */
    function focar(n) { if (n && n.focus) n.focus({ preventScroll: true }); }

    /* desenha o lugar: 'aviso' (antes de qualquer anotação), 'anota' (a frase) ou 'desligada' */
    function desenhar(modo) {
      var c = st.caixa, tinhaFoco = !!doc.activeElement && c.contains && c.contains(doc.activeElement);
      pararLetras();
      while (c.firstChild) c.removeChild(c.firstChild);
      st.modo = modo;
      c.classList.toggle('is-desligada', modo === 'desligada');
      var topo = el('p', 'orc-anota__topo'), acoes = el('span', 'orc-anota__acoes'), primeiro = null;
      if (modo === 'desligada') {
        topo.appendChild(el('span', 'orc-anota__rotulo', TEXTOS.desligada));
        acoes.appendChild(primeiro = botao(TEXTOS.ligar, ligar));
        topo.appendChild(acoes);
        c.appendChild(topo);
        if (tinhaFoco) focar(primeiro);
        return;
      }
      topo.appendChild(el('span', 'orc-anota__rotulo', modo === 'anota' ? TEXTOS.rotulo : TEXTOS.rotuloAviso));
      if (modo === 'anota') acoes.appendChild(botao(TEXTOS.naoEIsso, naoEIsso));
      else {
        var a = el('a', 'orc-anota__acao', TEXTOS.saiba);
        a.setAttribute('href', SAIBA_URL);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
        acoes.appendChild(a);
      }
      acoes.appendChild(primeiro = botao(TEXTOS.desligar, desligar));
      topo.appendChild(acoes);
      c.appendChild(topo);
      var corpo = el('p', 'orc-anota__texto' + (modo === 'anota' ? ' is-anota' : ''));
      c.appendChild(corpo);
      if (modo === 'anota') escrever(corpo, st.anotacao);
      else corpo.textContent = TEXTOS.aviso;
      if (tinhaFoco) focar(primeiro);
    }
    /* letra a letra; com movimento reduzido, de uma vez. O leitor de tela recebe a frase inteira, uma vez (a região viva) */
    function escrever(corpo, frase) {
      var viva = $('o-anota-viva');
      if (viva) viva.textContent = TEXTOS.rotulo + ' ' + frase;
      corpo.setAttribute('aria-hidden', 'true');
      var reduzido = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (reduzido) { corpo.textContent = frase; return; }
      var i = 0;
      (function passo() {
        i++;
        corpo.textContent = frase.slice(0, i);
        if (i < frase.length) st.letras = win.setTimeout(passo, LETRA_MS);
      })();
    }

    function novaMensagem() {
      st.mensagem++;
      st.porMensagem = 0;
      st.ultimo = '';
      st.anotacao = '';
      win.clearTimeout(st.timer);
      if (st.caixa && st.modo === 'anota') desenhar('aviso');
    }
    function naoEIsso() {
      st.anotacao = '';
      desenhar('aviso');
      focar(st.campo);
    }
    function desligar() {
      guardar(true);
      st.seq++; st.respondido = st.seq;   /* (o que ainda está a caminho não aparece mais) */
      st.anotacao = '';
      win.clearTimeout(st.timer);
      desenhar('desligada');
    }
    function ligar() { guardar(false); desenhar('aviso'); }

    function aoDigitar() {
      win.clearTimeout(st.timer);
      if (!st.campo.value.trim()) { novaMensagem(); return; }
      st.timer = win.setTimeout(tentar, PAUSA);
    }
    /* o porteiro: nenhuma chamada desligada, durante o envio, sem sessão, com pouco texto ou pouco texto novo, ou além das cotas */
    function tentar() {
      try {
        var Api = win.BZOrcamento;
        if (!st.caixa || desligada() || st.pensando || st.modo === 'desligada' || !Api || typeof Api.reagir !== 'function') return;
        if (typeof Api.temSessao === 'function' && !Api.temSessao()) return;
        var t = String(st.campo.value || '').trim();
        if (t.length < MINIMO || t.length - comum(t, st.ultimo) < NOVOS) return;
        if (st.porMensagem >= POR_MENSAGEM || st.porConversa >= POR_CONVERSA) return;
        st.porMensagem++; st.porConversa++; st.ultimo = t;
        var seq = ++st.seq, mensagem = st.mensagem;
        Promise.resolve(Api.reagir(t.slice(-FINAL), seq)).then(function (r) { receber(r, seq, mensagem); }, function () { /* sem reação: a tela segue a de hoje */ });
      } catch (e) { falhar(e); }
    }
    function receber(r, seq, mensagem) {
      try {
        if (!st.caixa || st.falhou || desligada() || st.pensando || mensagem !== st.mensagem || seq < st.respondido) return;
        st.respondido = seq;
        var a = r && ehObjeto(r.reacao) && typeof r.reacao.anotacao === 'string' ? r.reacao.anotacao.replace(/\s+/g, ' ').trim().slice(0, ANOTACAO_MAX) : '';
        if (!a) return;   /* (sem frase: a linha que já está fica) */
        st.anotacao = a;
        desenhar('anota');
      } catch (e) { falhar(e); }
    }

    /* o envio: a anotação vai para o cartão de espera; o lugar volta ao aviso para a próxima mensagem */
    function aoPensar(ev) {
      try {
        var ativo = !!(ev && ev.detail && ev.detail.ativo);
        if (!ativo) { st.pensando = false; tirarDoCartao(); return; }
        st.pensando = true;
        var cartao = $('o-pensando');
        if (st.caixa && st.anotacao && cartao) {
          tirarDoCartao();
          st.noCartao = el('span', 'orc-pensando__anota', TEXTOS.rotulo + ' ' + st.anotacao);
          cartao.insertBefore(st.noCartao, cartao.firstChild);
        }
        novaMensagem();
      } catch (e) { falhar(e); }
    }
    if (doc.addEventListener) doc.addEventListener('bz:pensando', aoPensar);

    function montar() {
      var form = $('o-form');
      st.campo = $('o-texto');
      if (!form || !st.campo || !form.parentNode) return false;
      var c = el('div', 'orc-anota');
      c.id = 'o-anota';
      var fileira = $('o-reacao'), antes = fileira && fileira.parentNode === form.parentNode ? fileira : form;   /* (acima das peças da 1a) */
      form.parentNode.insertBefore(c, antes);
      st.caixa = c;
      var viva = $('o-anota-viva');
      if (!viva) {   /* a região viva fica fora do lugar redesenhado: o leitor de tela não perde o anúncio */
        viva = el('p', 'sr-only');
        viva.id = 'o-anota-viva';
        viva.setAttribute('aria-live', 'polite');
        form.parentNode.insertBefore(viva, c);
      }
      st.campo.addEventListener('input', aoDigitar);
      st.ouvindo = true;
      desenhar(desligada() ? 'desligada' : 'aviso');
      return true;
    }

    function atualizar(E) {
      if (st.falhou) return;
      try {
        if (!ligada(E)) { tirar(); return; }
        var conversa = E.conversa && E.conversa.id ? E.conversa.id : null;
        if (conversa !== st.conversa) { st.conversa = conversa; st.porConversa = 0; }
        if (st.caixa && st.campo !== $('o-texto')) tirar();
        if (!st.caixa && !montar()) return;
        var form = $('o-form');
        var semCaixa = !form || form.hidden || form.classList.contains('is-recolhido');
        if (st.caixa.hidden !== semCaixa) st.caixa.hidden = semCaixa;
      } catch (e) { falhar(e); }
    }

    return { atualizar: atualizar, _estado: st, _tentar: tentar };
  }

  return { criar: criar, TEXTOS: TEXTOS, LIMITES: { MINIMO: MINIMO, PAUSA: PAUSA, NOVOS: NOVOS, POR_MENSAGEM: POR_MENSAGEM, POR_CONVERSA: POR_CONVERSA, FINAL: FINAL }, CHAVE: CHAVE, ligada: ligada };
});
