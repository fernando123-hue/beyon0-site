/* MAPA VIVO v2, fase 1b NA PÁGINA: a anotação curta da IA. Enquanto a pessoa escreve, ~0,7 s depois de ela parar, uma linha acima da caixa diz
   "O Zero (IA) anotou: ..." (o servidor é a ação `reagir`: api/_vendas/fluxo-reacao.mjs, que redige, confere e devolve só frase fiel ao texto).
   Especificação no cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "Fase 1b". js/orcamento.js chama BZOrcAnotacao.atualizar(E) a cada render().
   - Só com a reação ligada no servidor (o estado traz reacao: true; hoje só na prévia). Sem ela, nada é criado nem ouvido: a tela é a de hoje.
   - LGPD (revisão de segurança do PR #274): o AVISO aparece antes da 1ª chamada, no mesmo lugar em que a anotação vai aparecer (quem a vê já leu
     que uma IA da Anthropic, fora do Brasil, lê o texto); "Desligar" fica guardado no aparelho e, desligada, a página nunca chama `reagir`;
     a anotação é rotulada como IA e entra só por textContent.
   - O porteiro é regra de código: texto com 25 caracteres ou mais, 700 ms de pausa, 15 caracteres novos desde a última chamada, até 3 chamadas por
     mensagem e 12 por conversa (o servidor também conta as 12). Resposta velha (seq menor que uma já respondida) não troca a linha.
   - O lugar tem altura mínima (o aviso e a anotação cabem no mesmo espaço): a linha chega sem empurrar a caixa. Ele entra na página quando a pessoa
     toca a caixa (o deslocamento cola numa ação dela); sem armazenamento que funcione, não entra (o Desligar não teria como persistir).
   - No envio (bz:pensando), a anotação vira a 1ª linha do cartão "Analisando o seu caso…" e o lugar volta ao aviso.
   - Falha fechada: qualquer erro tira a linha, com aviso "[beyon] anotacao". ES5. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcAnotacao = api.criar(raiz);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var MINIMO = 25, PAUSA = 700, NOVOS = 15, POR_MENSAGEM = 3, POR_CONVERSA = 12, FINAL = 400, LETRA_MS = 18, ANOTACAO_MAX = 90;   /* (90 = o teto do servidor, ANOTACAO_MAX em api/_vendas/reacao.mjs, e o que a altura do lugar foi medida para caber) */
  var CHAVE = 'bz-anotacao', DESLIGADA = 'desligada';
  var TEXTOS = {
    rotuloAviso: 'Anotação ao vivo',
    /* (espaços que não quebram, \u00a0, e o \u2060 depois do hífen de e-mail prendem os trechos de sentido: a linha nunca quebra em 'lê o / que você escreve', medido em 320 e 390) */
    aviso: 'Uma IA da Anthropic, fora\u00a0do\u00a0Brasil, lê\u00a0o\u00a0que\u00a0você\u00a0escreve. Não\u00a0guardamos\u00a0o\u00a0texto, e\u00a0telefone e\u00a0e-\u2060mail viram\u00a0marcadores.',
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
    var st = { caixa: null, campo: null, timer: 0, letras: 0, ouvindo: false, falhou: false, desligadaAqui: false, pensando: false, modo: '', noCartao: null, corpo: null, esperando: null, ligadaAgora: false,
      seq: 0, respondido: 0, mensagem: 0, porMensagem: 0, porConversa: 0, conversa: null, ultimo: '', anotacao: '' };
    var $ = function (id) { return doc.getElementById(id); };

    /* FALHA FECHADA (revisão de segurança do #276, achado 2): sem armazenamento que funcione (bloqueado, modo privado), a escolha "Desligar"
       não teria como persistir; então a anotação nem aparece e nada é chamado. Leitura que lança conta como desligada */
    function armazemFunciona() {
      try { var k = CHAVE + '-teste'; win.localStorage.setItem(k, '1'); win.localStorage.removeItem(k); return true; } catch (e) { return false; }
    }
    function desligada() {
      if (st.desligadaAqui) return true;
      try { return win.localStorage.getItem(CHAVE) === DESLIGADA; } catch (e) { return true; }
    }
    function guardar(sim) {
      st.desligadaAqui = sim;
      try { if (sim) win.localStorage.setItem(CHAVE, DESLIGADA); else win.localStorage.removeItem(CHAVE); } catch (e) { st.desligadaAqui = true; }
    }
    function falhar(e) {
      st.falhou = true;
      tirar();
      if (win.console) win.console.warn('[beyon] anotacao', e && e.message ? e.message : e);
    }
    function pararLetras() { win.clearTimeout(st.letras); st.letras = 0; }
    function tirarDoCartao() {
      if (st.noCartao && st.noCartao.parentNode) {
        if (st.noCartao.parentNode.classList) st.noCartao.parentNode.classList.remove('tem-anotacao');
        st.noCartao.parentNode.removeChild(st.noCartao);
      }
      st.noCartao = null;
    }
    /* a região viva repete só a anotação que está na tela: rejeitada, desligada ou enviada, ela sai também (revisão técnica do #276, achado 4) */
    function limparViva() { var viva = $('o-anota-viva'); if (viva) viva.textContent = ''; }
    var GATILHOS = ['focus', 'keydown', 'pointerdown'];
    function soltarGatilhos() {
      if (st.esperando) GATILHOS.forEach(function (t) { st.esperando.removeEventListener(t, aoTocarCaixa); });
      st.esperando = null;
    }
    function tirar() {
      soltarGatilhos();
      if (st.caixa && st.caixa.parentNode) st.caixa.parentNode.removeChild(st.caixa);
      st.caixa = null;
      st.corpo = null;
      var viva = $('o-anota-viva');
      if (viva && viva.parentNode) viva.parentNode.removeChild(viva);
      if (st.campo && st.ouvindo) st.campo.removeEventListener('input', aoDigitar);
      st.ouvindo = false;
      win.clearTimeout(st.timer);
      pararLetras();
      tirarDoCartao();
      st.anotacao = '';
      st.modo = '';
      st.seq++; st.respondido = st.seq;   /* (resposta antiga pendente não aparece num lugar remontado) */
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
    /* o foco estava num controle que vai sumir: passa para o 1º controle do lugar novo, nunca direto para "Desligar" (sem isso, o foco cairia
       no body; revisão técnica do #276, achado 5) */
    function focar(n) { if (n && n.focus) n.focus({ preventScroll: true }); }

    /* desenha o lugar: 'aviso' (antes de qualquer anotação), 'anota' (a frase) ou 'desligada'. Uma anotação nova sobre outra troca SÓ a frase:
       os botões ficam no DOM, e o toque que começou num deles não se perde (revisão técnica do #276, achado 4) */
    function desenhar(modo) {
      var c = st.caixa;
      if (modo === 'anota' && st.modo === 'anota' && st.corpo) { pararLetras(); escrever(st.corpo, st.anotacao); return; }
      var tinhaFoco = !!doc.activeElement && !!c.contains && c.contains(doc.activeElement);
      pararLetras();
      while (c.firstChild) c.removeChild(c.firstChild);
      st.modo = modo;
      st.corpo = null;
      c.classList.toggle('is-desligada', modo === 'desligada');
      var topo = el('p', 'orc-anota__topo'), acoes = el('span', 'orc-anota__acoes'), primeiro = null;
      topo.appendChild(el('span', 'orc-anota__rotulo', modo === 'desligada' ? TEXTOS.desligada : TEXTOS.rotuloAviso));
      if (modo === 'desligada') acoes.appendChild(primeiro = botao(TEXTOS.ligar, ligar));
      else if (modo === 'anota') acoes.appendChild(primeiro = botao(TEXTOS.naoEIsso, naoEIsso));
      else {
        primeiro = el('a', 'orc-anota__acao', TEXTOS.saiba);
        primeiro.setAttribute('href', SAIBA_URL);
        primeiro.setAttribute('target', '_blank');
        primeiro.setAttribute('rel', 'noopener');
        acoes.appendChild(primeiro);
      }
      if (modo !== 'desligada') acoes.appendChild(botao(TEXTOS.desligar, desligar));
      topo.appendChild(acoes);
      c.appendChild(topo);
      if (modo !== 'desligada') {
        st.corpo = el('p', 'orc-anota__texto' + (modo === 'anota' ? ' is-anota' : ''));
        c.appendChild(st.corpo);
        if (modo === 'anota') escrever(st.corpo, st.anotacao);
        else st.corpo.textContent = TEXTOS.aviso;
      }
      if (tinhaFoco) focar(primeiro);
    }
    /* letra a letra; com movimento reduzido, de uma vez. O leitor de tela recebe a frase inteira, uma vez (a região viva) */
    /* o rótulo "O Zero (IA) anotou:" abre a PRÓPRIA frase (como na especificação): onde a frase aparece, o rótulo de IA aparece junto, mesmo
       quando a caixa cresce e a linha de cima passa por trás do topo fixo (medido em 320x400) */
    function escrever(corpo, frase) {
      var viva = $('o-anota-viva');
      if (viva) viva.textContent = TEXTOS.rotulo + ' ' + frase;
      corpo.setAttribute('aria-hidden', 'true');
      while (corpo.firstChild) corpo.removeChild(corpo.firstChild);
      corpo.appendChild(el('span', 'orc-anota__quem', TEXTOS.rotulo + ' '));
      var texto = el('span', 'orc-anota__frase');
      corpo.appendChild(texto);
      var reduzido = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (reduzido) { texto.textContent = frase; return; }
      var i = 0;
      (function passo() {
        i++;
        texto.textContent = frase.slice(0, i);
        if (i < frase.length) st.letras = win.setTimeout(passo, LETRA_MS);
      })();
    }

    function novaMensagem() {
      st.mensagem++;
      st.porMensagem = 0;
      st.ultimo = '';
      st.anotacao = '';
      win.clearTimeout(st.timer);
      limparViva();
      if (st.caixa && st.modo === 'anota') desenhar('aviso');
    }
    /* o que ainda está a caminho não aparece mais */
    function esquecerEmVoo() { st.seq++; st.respondido = st.seq; }
    function naoEIsso() {
      esquecerEmVoo();   /* (a frase rejeitada não volta pela resposta que já tinha saído; revisão técnica do #276, achado 1) */
      st.anotacao = '';
      limparViva();
      desenhar('aviso');
      focar(st.campo);
    }
    function desligar() {
      guardar(true);
      esquecerEmVoo();
      st.anotacao = '';
      win.clearTimeout(st.timer);
      limparViva();
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
        /* (Fase 3, PR 3a) o esboço do mapa (js/orcamento-reacao.js) não soube: a mesma chamada pede a peça; nenhuma chamada a mais */
        var Esb = win.BZOrcReacao, mapa = !!(Esb && typeof Esb.precisaDoServidor === 'function' && Esb.precisaDoServidor(t) === true);
        Promise.resolve(Api.reagir(t.slice(-FINAL), seq, mapa)).then(function (r) { receber(r, seq, mensagem, mapa ? t : ''); }, function () { /* sem reação: a tela segue a de hoje */ });
      } catch (e) { falhar(e); }
    }
    function receber(r, seq, mensagem, lido) {
      try {
        if (!st.caixa || st.falhou || desligada() || st.pensando || mensagem !== st.mensagem || seq < st.respondido) return;
        st.respondido = seq;
        var Esb = win.BZOrcReacao;
        /* (revisão técnica 1) a resposta sem ajuste também vai (null): o esboço tira o do servidor que ficou da frase de antes */
        if (lido && Esb && typeof Esb.ajusteDoServidor === 'function') Esb.ajusteDoServidor(r && ehObjeto(r.reacao) && ehObjeto(r.reacao.ajuste) ? r.reacao.ajuste : null, lido);
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
          if (cartao.classList) cartao.classList.add('tem-anotacao');   /* (classe, não :has(): vale em navegador antigo; achado 7) */
        }
        novaMensagem();
      } catch (e) { falhar(e); }
    }
    if (doc.addEventListener) doc.addEventListener('bz:pensando', aoPensar);
    /* outra aba desligou ou ligou: esta acompanha na tela (as chamadas já respeitavam, porque desligada() lê o armazenamento a cada vez;
       revisão de segurança do #276, achado 3) */
    if (win.addEventListener) win.addEventListener('storage', function (ev) {
      try {
        if (!st.caixa || (ev && ev.key !== CHAVE && ev.key !== null)) return;
        var agora = desligada() ? 'desligada' : 'aviso';
        if (agora === 'desligada' || st.modo === 'desligada') { esquecerEmVoo(); st.anotacao = ''; limparViva(); desenhar(agora); }
      } catch (e) { falhar(e); }
    });

    /* o lugar entra na página só quando a pessoa vai à caixa (toque, tecla ou foco): o deslocamento acontece colado a uma ação dela, e não conta
       como CLS. Montado num render qualquer, ele empurraria a caixa ~90 px sem ninguém ter feito nada (revisão técnica do #276, achado 3).
       Como nenhuma chamada sai antes de a pessoa digitar, o aviso continua na tela antes da 1ª */
    function aoTocarCaixa() {
      try {
        soltarGatilhos();
        if (!st.caixa && st.ligadaAgora) montar();
      } catch (e) { falhar(e); }
    }
    function esperarToque(campo) {
      if (st.esperando === campo) return;
      soltarGatilhos();
      st.esperando = campo;
      GATILHOS.forEach(function (t) { campo.addEventListener(t, aoTocarCaixa); });
    }

    /* a caixa fica onde a pessoa tocou: a página rola o que o lugar ocupou, e quem sobe é o que está acima dele (medido em 390x508 e 320x400:
       sem isto, a caixa descia ~90 px e saía de baixo da tela com o teclado aberto). Rolagem não é deslocamento de layout */
    function manterCaixa(topoAntes) {
      if (!st.campo.getBoundingClientRect || !win.scrollBy) return;
      var desceu = st.campo.getBoundingClientRect().top - topoAntes;
      if (desceu > 0) win.scrollBy(0, desceu);
    }
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
      var topoAntes = st.campo.getBoundingClientRect ? st.campo.getBoundingClientRect().top : 0;
      desenhar(desligada() ? 'desligada' : 'aviso');
      manterCaixa(topoAntes);
      return true;
    }

    function atualizar(E) {
      if (st.falhou) return;
      try {
        st.ligadaAgora = ligada(E) && armazemFunciona();
        if (!st.ligadaAgora) { tirar(); return; }
        /* outra conversa (Recomeçar): a anotação, as cotas e o que estava a caminho são da conversa velha (revisão técnica do #276, achado 2) */
        var conversa = E.conversa && E.conversa.id ? E.conversa.id : null;
        if (conversa !== st.conversa) {
          if (st.conversa !== null) { esquecerEmVoo(); novaMensagem(); }
          st.conversa = conversa; st.porConversa = 0;
        }
        var campo = $('o-texto');
        if (st.caixa && st.campo !== campo) tirar();
        if (!st.caixa) { if (campo) esperarToque(campo); return; }
        /* a caixa esvaziada por código (sem evento input): a anotação da mensagem velha sai */
        if (st.modo === 'anota' && !String(st.campo.value || '').trim()) novaMensagem();
        var form = $('o-form');
        var semCaixa = !form || form.hidden || form.classList.contains('is-recolhido');
        if (st.caixa.hidden !== semCaixa) st.caixa.hidden = semCaixa;
        if (semCaixa) { win.clearTimeout(st.timer); pararLetras(); }
      } catch (e) { falhar(e); }
    }

    return { atualizar: atualizar, _estado: st, _tentar: tentar };
  }

  return { criar: criar, TEXTOS: TEXTOS, LIMITES: { MINIMO: MINIMO, PAUSA: PAUSA, NOVOS: NOVOS, POR_MENSAGEM: POR_MENSAGEM, POR_CONVERSA: POR_CONVERSA, FINAL: FINAL }, CHAVE: CHAVE, ligada: ligada };
});
