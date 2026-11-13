/* ==========================================================================
   O PEDIDO DENTRO DA CONVERSA (spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §5; PR 3).
   Depois de "Quero os três modelos" (ou do pedir_contato do Zero): o nome do negócio, o que vende e o WhatsApp, um passo opcional
   (como quer ser chamado, um site que admira, para quem vende, o que diferencia, as redes com a autorização própria) e o CARTÃO DE
   ACEITE: o resumo do que ela passou (com "Corrigir" em cada item), o texto da versão vigente (js/orcamento-rotulos.js, ACEITE) e o
   botão "Concordo e quero os modelos". Envia UMA vez pelo mesmo API.detalhes de antes, com a versão do aceite; o servidor confere tudo
   de novo. Nada daqui vai ao modelo nem às mensagens da conversa, e nada fica guardado no aparelho: recarregar recomeça o pedido.
   Usa o kit da conversa de js/orcamento-toques.js (falas anunciadas, grupos rotulados, foco que não se perde). Texto por textContent. ES5.
   ========================================================================== */
(function () {
  'use strict';
  var R = window.BZOrcRotulos, T = window.BZToques, API = window.BZOrcamento, doc = document;
  var $ = function (id) { return doc.getElementById(id); };
  if (!R || !T || !T.kit || !API || !$('o-log')) return;
  var K = T.kit;

  var REDES = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn']];
  var OPCIONAIS = [
    { chave: 'nome', toque: 'Como quer ser chamado', pergunta: 'Como você quer que a gente te chame?', max: 60, mostra: 'Como quer ser chamado' },
    { chave: 'admira', toque: 'Um site que eu admiro', pergunta: 'Qual site você admira? Pode ser o endereço ou só o nome.', max: 60, mostra: 'Site que admira' },
    { chave: 'publico', toque: 'Para quem eu vendo', pergunta: 'Para quem você vende?', max: 200, mostra: 'Para quem vende' },
    { chave: 'diferencial', toque: 'O que me diferencia', pergunta: 'O que diferencia o seu negócio?', max: 160, mostra: 'O que diferencia' },
    { chave: 'redes', toque: 'As redes do negócio', mostra: 'Redes do negócio' }
  ];
  var MENSAGEM_DO_CAMPO = [[/whatsapp|telefone/i, 'telefone'], [/autoriza|redes?|instagram|facebook|tiktok|youtube|linkedin/i, 'redes'], [/diferencia/i, 'diferencial'],
    [/para quem/i, 'publico'], [/chamado/i, 'nome'], [/admira/i, 'admira'], [/vende/i, 'vende'], [/neg[óo]cio/i, 'negocio']];
  var FALHA = 'Não consegui guardar agora. Tente de novo ou deixe um recado para a equipe.';

  var p = null;   /* o pedido em andamento, só em memória: { d: os dados, corrigindo, enviando } */
  var ganchos = { sessaoTerminou: function () { return false; }, avisarSessao: function () {} };

  function limpo(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  var digitos = function (v) { return String(v || '').replace(/\D/g, ''); };

  /* um campo dentro da conversa: a pergunta (fala do Zero), a caixa, as sugestões (se houver), "Seguir" e, nos opcionais, "Pular" */
  function campo(cfg) {
    K.fala(cfg.pergunta);
    var li = K.el('li', 'orc-toque orc-toque--campo'), linha = K.el('div', 'orc-toque__linha'), caixa = K.el('input', 'orc-toque__campo');
    var erro = K.el('p', 'orc-toque__erro-campo'), seguir = K.el('button', 'btn btn--primary btn--sm', 'Seguir');
    caixa.type = cfg.tipo || 'text';
    caixa.maxLength = cfg.max;
    caixa.value = cfg.valor || '';
    caixa.setAttribute('aria-labelledby', K.ultimaFala());
    if (cfg.autocomplete) caixa.setAttribute('autocomplete', cfg.autocomplete); else caixa.autocomplete = 'off';
    if (cfg.inputmode) caixa.setAttribute('inputmode', cfg.inputmode);
    erro.id = 'o-pedido-erro-' + cfg.chave;
    erro.setAttribute('role', 'alert');
    seguir.type = 'button';
    function ir(ev) {
      if (li.hasAttribute('data-feito')) return;
      K.teclado(!ev || ev.detail === 0);
      var v = cfg.tipo === 'tel' ? String(caixa.value || '').trim().slice(0, cfg.max) : limpo(caixa.value, cfg.max);
      var ruim = cfg.validar ? cfg.validar(v) : null;
      if (ruim) { erro.textContent = ruim; caixa.setAttribute('aria-invalid', 'true'); caixa.setAttribute('aria-describedby', erro.id); K.focar(caixa); return; }
      K.fechar(li, null);
      K.bolha(v || 'Pular');
      cfg.depois(v);
    }
    seguir.addEventListener('click', ir);
    caixa.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ir(null); } });
    caixa.addEventListener('input', function () { if (caixa.getAttribute('aria-invalid')) { caixa.removeAttribute('aria-invalid'); erro.textContent = ''; } });
    linha.appendChild(caixa); linha.appendChild(seguir);
    li.appendChild(linha);
    if (cfg.sugestoes && cfg.sugestoes.length) li.appendChild(sugestoes(cfg.sugestoes, caixa, cfg.max));
    if (cfg.opcional) {
      var pular = K.el('button', 'orc-toque__naosei', 'Pular');
      pular.type = 'button';
      pular.addEventListener('click', function (ev) { if (li.hasAttribute('data-feito')) return; K.teclado(!!ev && ev.detail === 0); K.fechar(li, null); K.bolha('Pular'); cfg.depois(''); });
      li.appendChild(pular);
    }
    li.appendChild(erro);
    K.inserir(li);
    K.focar(caixa);
    return li;
  }
  /* as sugestões do que vende: tocar soma (ou tira) o rótulo na caixa, como no formulário de antes */
  function sugestoes(lista, caixa, max) {
    var grupo = K.el('div', 'orc-toque__ops');
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', 'Sugestões');
    lista.forEach(function (s) {
      var b = K.el('button', 'orc-op orc-op--toque', s);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var partes = caixa.value.trim() ? caixa.value.split(/,\s*/) : [], i = partes.indexOf(s);
        if (i >= 0) partes.splice(i, 1); else partes.push(s);
        var novo = partes.join(', ');
        if (novo.length > max) return;
        caixa.value = novo;
        b.setAttribute('aria-pressed', String(i < 0));
      });
      grupo.appendChild(b);
    });
    return grupo;
  }

  /* ---------- os passos (8a a 8e) ---------- */
  function seguirOu(proximo) { return function () { if (p.corrigindo) { p.corrigindo = false; cartao(); } else proximo(); }; }
  function passoNegocio() {
    campo({ chave: 'negocio', pergunta: 'Para fazer os três modelos: qual é o nome do negócio?', max: 60, autocomplete: 'organization', valor: p.d.negocio,
      validar: function (v) { return v.length < 2 ? 'Informe o nome do negócio.' : null; },
      depois: function (v) { p.d.negocio = v; seguirOu(passoVende)(); } });
  }
  function passoVende() {
    var ramo = (T.respostas() || {}).ramo;
    campo({ chave: 'vende', pergunta: 'E o que vocês vendem ou fazem, em poucas palavras?', max: 200, valor: p.d.vende,
      sugestoes: R.VENDE_POR_RAMO[ramo] || R.VENDE_POR_RAMO.outro,
      validar: function (v) { return v.length < 3 ? 'Conte o que você vende (pode tocar numa sugestão).' : null; },
      depois: function (v) { p.d.vende = v; seguirOu(passoTelefone)(); } });
  }
  function passoTelefone() {
    campo({ chave: 'telefone', tipo: 'tel', inputmode: 'tel', autocomplete: 'tel', max: 25, valor: p.d.telefone,
      pergunta: 'Qual WhatsApp eu passo para a equipe te avisar quando os modelos ficarem prontos?',
      validar: function (v) { return digitos(v).length < 10 ? 'Informe o seu WhatsApp com DDD: é o contato do seu pedido.' : null; },
      depois: function (v) { p.d.telefone = v; seguirOu(passoOpcionais)(); } });
  }
  /* 8d: o que mais ela quiser contar, em toques; cada toque abre a pergunta daquele campo e volta aqui; "Não, pode seguir" leva ao aceite */
  function passoOpcionais(depoisDeUm) {
    K.fala(depoisDeUm ? 'Mais alguma coisa?' : 'Quer me contar mais alguma coisa? Ajuda a acertar os modelos.');
    var itens = OPCIONAIS.filter(function (o) { return !preenchido(o.chave); }).map(function (o) { return { valor: o.chave, rotulo: o.toque }; });
    itens.push({ valor: 'seguir', rotulo: 'Não, pode seguir' });
    K.opcoes('Mais alguma coisa', itens, function (v) {
      if (v === 'seguir') { K.bolha('Não, pode seguir'); cartao(); return; }
      var o = OPCIONAIS.filter(function (x) { return x.chave === v; })[0];
      K.bolha(o.toque);
      if (v === 'redes') passoRedes(); else passoOpcional(o);
    }, { falaId: K.ultimaFala() });
  }
  function preenchido(chave) { return chave === 'redes' ? Object.keys(p.d.redes).length > 0 : !!p.d[chave]; }
  function passoOpcional(o) {
    campo({ chave: o.chave, pergunta: o.pergunta, max: o.max, valor: p.d[o.chave], opcional: true,
      depois: function (v) { p.d[o.chave] = v; if (p.corrigindo) { p.corrigindo = false; cartao(); } else passoOpcionais(true); } });
  }
  /* as redes: os endereços (ou o @) e a autorização PRÓPRIA, um toque claro que nunca vem marcado; o servidor também a exige */
  function passoRedes() {
    K.fala('Quais são as redes do negócio? Preencha só as que quiser.');
    var li = K.el('li', 'orc-toque orc-toque--redes'), caixas = {}, erro = K.el('p', 'orc-toque__erro-campo');
    erro.id = 'o-pedido-erro-redes';
    erro.setAttribute('role', 'alert');
    REDES.forEach(function (r) {
      var rotulo = K.el('label', 'orc-toque__rede'), nome = K.el('span', 'orc-toque__titulo', r[1]), c = K.el('input', 'orc-toque__campo');
      c.type = 'text'; c.maxLength = 120; c.autocomplete = 'off'; c.value = p.d.redes[r[0]] || '';
      rotulo.appendChild(nome); rotulo.appendChild(c);
      caixas[r[0]] = c;
      li.appendChild(rotulo);
    });
    var autoriza = K.el('button', 'orc-op orc-op--toque', 'Autorizo a Beyon Zero a olhar essas redes para preparar os modelos');
    autoriza.type = 'button';
    autoriza.setAttribute('aria-pressed', String(!!p.d.autoriza_redes));
    autoriza.addEventListener('click', function () { autoriza.setAttribute('aria-pressed', String(autoriza.getAttribute('aria-pressed') !== 'true')); });
    var seguir = K.el('button', 'btn btn--primary btn--sm', 'Seguir');
    seguir.type = 'button';
    seguir.addEventListener('click', function (ev) {
      if (li.hasAttribute('data-feito')) return;
      K.teclado(!!ev && ev.detail === 0);
      var redes = {};
      REDES.forEach(function (r) { var v = String(caixas[r[0]].value || '').trim().slice(0, 120); if (v) redes[r[0]] = v; });
      var aut = autoriza.getAttribute('aria-pressed') === 'true';
      if (Object.keys(redes).length && !aut) { erro.textContent = 'Para olharmos as suas redes, toque na autorização (ou deixe em branco).'; K.focar(autoriza); return; }
      K.fechar(li, null);
      p.d.redes = redes; p.d.autoriza_redes = aut && Object.keys(redes).length > 0;
      K.bolha(Object.keys(redes).length ? REDES.filter(function (r) { return redes[r[0]]; }).map(function (r) { return r[1]; }).join(' · ') : 'Pular');
      if (p.corrigindo) { p.corrigindo = false; cartao(); } else passoOpcionais(true);
    });
    li.appendChild(autoriza); li.appendChild(seguir); li.appendChild(erro);
    K.inserir(li);
    K.focar(caixas.instagram);
  }

  /* ---------- 8e: o cartão de aceite ---------- */
  function cartao() {
    K.fala('Pronto. Confira o que você me passou:');
    var li = K.el('li', 'orc-toque orc-toque--aceite'), lista = K.el('ul', 'orc-aceite__resumo');
    var itens = [['negocio', 'Nome do negócio', p.d.negocio], ['vende', 'O que vende', p.d.vende], ['telefone', 'WhatsApp', p.d.telefone]];
    OPCIONAIS.forEach(function (o) {
      if (!preenchido(o.chave)) return;
      itens.push([o.chave, o.mostra, o.chave === 'redes' ? REDES.filter(function (r) { return p.d.redes[r[0]]; }).map(function (r) { return r[1]; }).join(', ') : p.d[o.chave]]);
    });
    itens.forEach(function (it) {
      var item = K.el('li', 'orc-aceite__item'), texto = K.el('span', '', it[1] + ': ' + it[2]), corrigir = K.el('button', 'orc-toque__naosei', 'Corrigir');
      corrigir.type = 'button';
      corrigir.setAttribute('aria-label', 'Corrigir ' + it[1].toLowerCase());
      corrigir.addEventListener('click', function () { if (li.hasAttribute('data-feito') || p.enviando) return; K.fechar(li, null); p.corrigindo = true; corrigirCampo(it[0]); });
      item.appendChild(texto); item.appendChild(corrigir);
      lista.appendChild(item);
    });
    var aceite = K.el('p', 'orc-aceite__texto', R.ACEITE.texto), link = K.el('a', 'orc-aceite__link', 'Como tratamos os dados');
    link.href = '/privacidade#orcamento'; link.target = '_blank'; link.rel = 'noopener';
    var concordo = K.el('button', 'btn btn--primary orc-aceite__concordo', 'Concordo e quero os modelos');
    concordo.type = 'button';
    concordo.setAttribute('aria-describedby', 'o-pedido-aceite-texto');
    aceite.id = 'o-pedido-aceite-texto';
    concordo.addEventListener('click', function (ev) { if (li.hasAttribute('data-feito')) return; K.teclado(!!ev && ev.detail === 0); enviar(li, concordo); });
    li.appendChild(lista); li.appendChild(aceite); li.appendChild(link); li.appendChild(concordo);
    K.inserir(li);
    K.focar(concordo);
  }
  function corrigirCampo(chave) {
    if (chave === 'negocio') passoNegocio();
    else if (chave === 'vende') passoVende();
    else if (chave === 'telefone') passoTelefone();
    else if (chave === 'redes') passoRedes();
    else passoOpcional(OPCIONAIS.filter(function (o) { return o.chave === chave; })[0]);
  }

  /* ---------- o envio: uma vez, com a versão do aceite; o erro vira fala do Zero no passo certo ---------- */
  function enviar(li, botao) {
    if (p.enviando) return;
    p.enviando = true;
    botao.setAttribute('aria-disabled', 'true');
    botao.textContent = 'Enviando…';
    var d = p.d;
    return API.detalhes({ negocio: d.negocio, vende: d.vende, telefone: d.telefone, nome: d.nome || '', publico: d.publico || '', diferencial: d.diferencial || '',
      admira: d.admira || '', redes: d.redes, autoriza_redes: !!d.autoriza_redes, aceite: true, aceite_versao: R.ACEITE.versao }).then(function (r) {
      K.fechar(li, null);
      K.bolha('Concordo e quero os modelos');
      p = null;
      doc.dispatchEvent(new CustomEvent('bz:detalhes-enviados', { detail: { codigo: r && r.codigo } }));
    }, function (e) {
      p.enviando = false;
      botao.removeAttribute('aria-disabled');
      botao.textContent = 'Concordo e quero os modelos';
      if (ganchos.sessaoTerminou(e)) { ganchos.avisarSessao(); return; }
      var m = (e && e.message) || FALHA;
      if (e && e.dados && e.dados.fila_cheia) { K.fechar(li, null); K.fala(m); if ($('o-fila-cheia')) $('o-fila-cheia').hidden = false; p = null; return; }
      /* a versão do aceite mudou (aba velha, página em cache): recarregar mostra o texto novo */
      if (e && e.status === 409 && /Recarregue/.test(m)) { K.fala(m); return; }
      var chave = e && e.status === 400 ? campoDaMensagem(m) : null;
      K.fala(m);
      if (chave) { K.fechar(li, null); p.corrigindo = true; corrigirCampo(chave); }
    });
  }
  function campoDaMensagem(m) {
    for (var i = 0; i < MENSAGEM_DO_CAMPO.length; i++) if (MENSAGEM_DO_CAMPO[i][0].test(m)) return MENSAGEM_DO_CAMPO[i][1];
    return null;
  }

  window.BZPedido = {
    /* "Quero os três modelos" ou o pedir_contato do Zero: os passos começam (uma vez por vez; um segundo toque leva ao que está aberto) */
    iniciar: function () {
      if (p) { var aberto = $('o-log').querySelector('.orc-toque--campo:not([data-feito]), .orc-toque--aceite:not([data-feito]), .orc-toque--redes:not([data-feito])');
        if (aberto) { K.focar(aberto.querySelector('input, button')); return; } }
      p = { d: { negocio: '', vende: '', telefone: '', redes: {}, autoriza_redes: false }, corrigindo: false, enviando: false };
      passoNegocio();
    },
    ativo: function () { return !!p; },
    configurar: function (g) { if (g && typeof g.sessaoTerminou === 'function' && typeof g.avisarSessao === 'function') ganchos = g; }
  };
})();
