/* ==========================================================================
   AS PERGUNTAS DO ORÇAMENTO SEM IA (spec docs/specs/2026-10-11-orcamento-sem-ia.md §2–§3).
   Uma pergunta por tela → o preço (do servidor, nunca calculado aqui) →
   "Quer ajustar?" com o preço ao vivo (simular, que não grava) → "Quero os
   três modelos" grava o pacote (confirmar-pacote) e entrega a vez ao resto
   da página (evento bz:pacote-confirmado). Todo texto por textContent.
   Os extras vão SEMPRE explícitos (marcado = quantidade, desmarcado = 0): o
   servidor só soma os extras da recomendação no formato recomendado, então
   trocar de formato e voltar não pode depender dele para não perder nada.
   ========================================================================== */
(function () {
  'use strict';
  var API = window.BZOrcamento;
  var $ = function (id) { return document.getElementById(id); };
  if (!API || !$('o-perguntas')) return;

  var ESPERA_MS = 300;   /* o preço ao vivo espera a pessoa parar de marcar (o servidor freia 60 cálculos por hora por conversa) */
  var NOMES = { landing_page: 'Site de uma página', institucional: 'Site com várias páginas', sob_medida: 'Site com visual exclusivo', loja_plataforma: 'Loja virtual' };
  var ASSUMIDO = { ramo: 'o seu ramo', objetivos: 'o que o site precisa trazer', site_atual: 'se já tem site', material: 'se já tem logo e textos' };
  var FALHA_CALCULO = 'Não consegui calcular agora. Tente de novo ou fale pelo WhatsApp.';
  var FALHA_GRAVAR = 'Não consegui guardar agora. Tente de novo.';

  var r = { objetivos: [] };          /* as respostas */
  var formato = null;                 /* null até o 1º preço: o servidor recomenda */
  var extras = {}, iniciais = {};     /* chave → quantidade; iniciais: a quantidade que a recomendação trouxe */
  var urgencia = false, versao = null, catalogo = null, catalogoDe = null;
  var seq = 0, emVoo = null, adiado = null, gravando = false, opcoes = {};
  var telas = [].slice.call(document.querySelectorAll('#o-perguntas .orc-p'));

  var dinheiro = function (n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  var todos = function (seletor) { return [].slice.call(document.querySelectorAll(seletor)); };
  var sem = function (obj, chave) { var c = Object.assign({}, obj); delete c[chave]; return c; };
  var com = function (obj, chave, valor) { var c = Object.assign({}, obj); c[chave] = valor; return c; };
  var todosExtras = function () { return catalogo ? catalogo.extras.principais.concat(catalogo.extras.mais) : []; };

  /* ---------- as telas ---------- */
  function irPara(n, focar) {
    telas.forEach(function (t) { t.hidden = t.getAttribute('data-p') !== String(n); });
    $('o-p-passo').textContent = 'Passo ' + n + ' de 3';
    if (!focar) return;
    $('o-perguntas').scrollIntoView({ block: 'start' });
    var h = telas[n - 1].querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  function marcarUm(attr, valor, campo) {
    todos('[' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === valor)); });
    r = valor == null ? sem(r, campo) : com(r, campo, valor);
  }
  todos('[data-ramo]').forEach(function (b) {
    b.addEventListener('click', function () { marcarUm('data-ramo', b.getAttribute('data-ramo'), 'ramo'); $('o-p-outro-rotulo').hidden = r.ramo !== 'outro'; });
  });
  todos('[data-objetivo]').forEach(function (b) {
    b.addEventListener('click', function () {
      var o = b.getAttribute('data-objetivo'), tinha = r.objetivos.indexOf(o) >= 0;
      r = com(r, 'objetivos', tinha ? r.objetivos.filter(function (x) { return x !== o; }) : r.objetivos.concat([o]));
      b.setAttribute('aria-pressed', String(!tinha));
    });
  });
  todos('[data-site-atual]').forEach(function (b) { b.addEventListener('click', function () { marcarUm('data-site-atual', b.getAttribute('data-site-atual'), 'site_atual'); }); });
  todos('[data-material]').forEach(function (b) { b.addEventListener('click', function () { marcarUm('data-material', b.getAttribute('data-material'), 'material'); }); });
  todos('.orc-p__seguir').forEach(function (b) {
    if (b.id === 'o-p-ver-preco') return;
    b.addEventListener('click', function () { irPara(Number(b.closest('.orc-p').getAttribute('data-p')) + 1, true); });
  });
  /* "Não sei, escolha por mim": esquece a resposta da tela (o servidor assume e a tela do preço diz o que assumiu) */
  todos('[data-naosei]').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = Number(b.getAttribute('data-naosei'));
      if (n === 1) { marcarUm('data-ramo', null, 'ramo'); $('o-p-outro-rotulo').hidden = true; }
      else { r = com(r, 'objetivos', []); todos('[data-objetivo]').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); }); }
      irPara(n + 1, true);
    });
  });

  function respostas() {
    return { ramo: r.ramo, outro: r.ramo === 'outro' ? $('o-p-outro').value.trim() : '', cidade: $('o-p-cidade').value.trim(), objetivos: r.objetivos.slice(), site_atual: r.site_atual, material: r.material };
  }
  function lista(ul, itens) { ul.textContent = ''; itens.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); }
  /* o erro vai para onde a pessoa está olhando: as perguntas ou o cartão do preço */
  function erro(msg) { $('o-p-erro').textContent = $('o-perguntas').hidden ? '' : msg; $('o-est-erro').textContent = $('o-perguntas').hidden ? msg : ''; }
  var mensagem = function (e, padrao) { return (e && e.message) || padrao; };

  /* ---------- os extras: o que vai ao servidor ---------- */
  /* tira o extra cujo "requer" não é atendido pelo formato nem por outro extra marcado (desmarcar o pai desmarca os
     dependentes; trocar para um formato que não os aceita também); repete até assentar (dependente de dependente) */
  function semOrfaos(ex, fmt) {
    var atual = ex, mexeu = true;
    while (mexeu) {
      mexeu = false;
      todosExtras().forEach(function (x) {
        if (!(atual[x.chave] > 0) || !x.requer) return;
        if (x.requer.some(function (q) { return q === fmt || atual[q] > 0; })) return;
        atual = sem(atual, x.chave); mexeu = true;
      });
    }
    return atual;
  }
  /* explícito: cada extra do catálogo vai com a quantidade marcada ou 0 (o 0 vence o extra da recomendação) */
  function pedidoDeExtras() {
    return todosExtras().reduce(function (p, x) { return x.fale_comigo ? p : com(p, x.chave, extras[x.chave] > 0 ? extras[x.chave] : 0); }, Object.assign({}, extras));
  }
  /* o 1º preço traz os extras da recomendação (ex.: agendamento): eles viram o estado da tela, pelo nome do item */
  function extrasDoPreco(est) {
    if (!est) return {};
    var itens = (est.itens || []).concat(est.fase_seguinte ? est.fase_seguinte.itens : []);
    return itens.reduce(function (ex, i) {
      var x = todosExtras().filter(function (c) { return c.nome === i.nome; })[0];
      return x ? com(ex, x.chave, (ex[x.chave] || 0) + i.qtd) : ex;
    }, {});
  }

  /* ---------- o preço (servidor) ---------- */
  function ocupado(sim) { if (sim) $('o-est').setAttribute('aria-busy', 'true'); else $('o-est').removeAttribute('aria-busy'); }
  /* uma conta por vez vale: a resposta de um pedido mais velho que o último é descartada. Devolve se deu certo */
  function calcular() {
    var meu = ++seq;
    ocupado(true);
    erro('');
    emVoo = (async function () {
      try {
        var res = await API.simular({ respostas: respostas(), formato: formato, extras: pedidoDeExtras(), urgencia: urgencia });
        if (meu !== seq) return false;
        var fmt = formato || res.recomendacao.formato;
        if (catalogoDe !== fmt) {
          var cat = await API.catalogo(fmt, r.ramo);
          if (meu !== seq) return false;
          catalogo = cat; catalogoDe = fmt;
          if ($('o-ajustar').hidden === false) montarExtras();
        }
        if (!formato) { formato = fmt; extras = extrasDoPreco(res.estimativa); iniciais = extras; }
        desenhar(res);
        return true;
      } catch (e) {
        if (meu === seq) erro(mensagem(e, FALHA_CALCULO));
        return false;
      } finally { if (meu === seq) { ocupado(false); emVoo = null; } }
    })();
    return emVoo;
  }
  function agendar() { clearTimeout(adiado); adiado = setTimeout(function () { adiado = null; calcular(); }, ESPERA_MS); }
  /* antes de gravar: a conta pendente (espera ou em voo) termina, para gravar exatamente o preço que está na tela */
  function assentar() {
    if (adiado) { clearTimeout(adiado); adiado = null; return calcular(); }
    return emVoo || Promise.resolve(true);
  }

  function desenhar(res) {
    versao = res.versao;
    var rec = res.recomendacao;
    var noPreco = rec.trocou_para_institucional ? 'institucional' : formato;
    $('o-est-motivo').textContent = formato === rec.formato ? (rec.motivo || '') : '';
    $('o-est-motivo').hidden = !$('o-est-motivo').textContent;
    var assumidos = (rec.assumido || []).map(function (k) { return ASSUMIDO[k]; }).filter(Boolean);
    $('o-est-assumido').hidden = !assumidos.length;
    $('o-est-assumido').textContent = assumidos.length ? 'Escolhi por você: ' + assumidos.join(', ') + '. Dá para trocar em "Mudar as respostas".' : '';
    $('o-est-troca').hidden = !rec.trocou_para_institucional;
    /* o cartão é desenhado por js/orcamento.js (o mesmo do resto da página) */
    document.dispatchEvent(new CustomEvent('bz:preco', { detail: { estimativa: res.estimativa, diagnostico: res.diagnostico } }));
    if (res.estimativa && NOMES[noPreco]) $('o-est-formato').textContent = NOMES[noPreco];   /* (as palavras da tela, as mesmas dos vizinhos) */
    vizinhos(rec);
    incluidos(noPreco);
    $('o-quero-modelos').hidden = !res.estimativa;   /* (pacote que pede conversa não se grava por aqui) */
    $('o-est-acoes').hidden = false;
    if (!$('o-ajustar').hidden) atualizarExtras();
  }
  /* os formatos ao lado (âncora honesta): a alternativa da recomendação e, fora dela, o próprio recomendado */
  function vizinhos(rec) {
    var caixa = $('o-vizinhos');
    caixa.textContent = '';
    if (!catalogo) return;
    var chaves = [rec.alternativa, rec.formato].filter(function (k, i, l) { return k && k !== formato && l.indexOf(k) === i; });
    var achados = chaves.map(function (k) { return catalogo.formatos.filter(function (x) { return x.chave === k; })[0]; }).filter(Boolean);
    if (!achados.length) return;
    var rot = document.createElement('p'); rot.className = 'orc-rotulo'; rot.textContent = 'Compare com';
    caixa.appendChild(rot);
    achados.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'orc-vizinho'; b.setAttribute('data-formato', f.chave);
      b.textContent = (NOMES[f.chave] || f.nome) + ' · a partir de ' + dinheiro(f.a_partir_de);
      b.addEventListener('click', function () { trocarFormato(f.chave); });
      caixa.appendChild(b);
    });
  }
  function incluidos(chave) {
    var f = catalogo ? catalogo.formatos.filter(function (x) { return x.chave === chave; })[0] : null;
    lista($('o-est-inclui'), f ? f.inclui : []);
    $('o-est-inclui-caixa').hidden = !(f && f.inclui.length);
  }
  function trocarFormato(k) {
    formato = k;
    extras = semOrfaos(extras, k);
    clearTimeout(adiado); adiado = null;
    /* o botão clicado sai (os vizinhos são refeitos): o foco vai para o vizinho novo, o caminho de volta */
    calcular().then(function (deu) { var v = document.querySelector('#o-vizinhos .orc-vizinho'); if (deu && v) v.focus({ preventScroll: true }); });
  }

  /* ---------- "Quer ajustar?": montado uma vez por catálogo; cada mudança só acerta marcado e visível (o foco fica) ---------- */
  function montarExtras() {
    [['o-ajustar-principais', catalogo.extras.principais], ['o-ajustar-mais', catalogo.extras.mais]].forEach(function (par) {
      var caixa = $(par[0]);
      todos('#' + par[0] + ' .orc-extra').forEach(function (n) { n.remove(); });
      par[1].forEach(function (x) { caixa.appendChild(extraNaTela(x)); });
    });
    $('o-ajustar').querySelector('.orc-ajustar__mais').hidden = !catalogo.extras.mais.length;
    if (catalogo.urgencia) $('o-x-urgencia-texto').textContent = 'Preciso antes do prazo: +' + catalogo.urgencia.acrescimo_percentual + '% no valor';
    atualizarExtras();
  }
  function extraNaTela(x) {
    var rotulo = document.createElement('label'); rotulo.className = 'orc-check orc-extra';
    var c = document.createElement('input'); c.type = 'checkbox'; c.id = 'o-x-' + x.chave; c.setAttribute('data-extra', x.chave);
    c.disabled = x.fale_comigo;
    var t = document.createElement('span'), nome = document.createElement('span'), frase = document.createElement('span');
    nome.className = 'orc-extra__nome'; frase.className = 'orc-extra__frase';
    nome.textContent = x.nome + (x.valor != null && !x.fale_comigo ? ' · ' + dinheiro(x.valor) : ' · fale comigo');
    frase.textContent = x.frase;
    t.appendChild(nome); t.appendChild(frase);
    rotulo.setAttribute('for', c.id);
    rotulo.appendChild(c); rotulo.appendChild(t);
    c.addEventListener('change', function () {
      extras = c.checked ? com(extras, x.chave, iniciais[x.chave] || 1) : semOrfaos(sem(extras, x.chave), formato);
      atualizarExtras();
      agendar();
    });
    return rotulo;
  }
  function atualizarExtras() {
    todosExtras().forEach(function (x) {
      var c = $('o-x-' + x.chave);
      if (!c) return;
      c.checked = extras[x.chave] > 0;
      if (x.requer) c.closest('.orc-extra').hidden = !x.requer.some(function (q) { return q === formato || extras[q] > 0; });
    });
    $('o-x-urgencia').checked = urgencia;
  }

  /* ---------- os botões ---------- */
  $('o-p-ver-preco').addEventListener('click', async function () {
    var b = this;
    if (b.getAttribute('aria-disabled') === 'true') return;
    b.setAttribute('aria-disabled', 'true');
    b.textContent = 'Calculando…';
    var deu = await calcular();
    b.removeAttribute('aria-disabled');
    b.textContent = 'Ver o preço';
    if (!deu) return;
    $('o-perguntas').hidden = true;
    var t = $('o-est-titulo');
    t.closest('.orc-painel').scrollIntoView({ block: 'start' });
    t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
  });
  $('o-ajustar-abrir').addEventListener('click', function () {
    var abrir = $('o-ajustar').hidden;
    if (abrir && catalogo) montarExtras();
    $('o-ajustar').hidden = !abrir;
    this.setAttribute('aria-expanded', String(abrir));
    if (abrir) $('o-ajustar').scrollIntoView({ block: 'nearest' });
  });
  $('o-x-urgencia').addEventListener('change', function () { urgencia = this.checked; agendar(); });
  /* "Mudar as respostas": volta às perguntas; o preço será recomendado de novo */
  $('o-p-refazer').addEventListener('click', function () {
    clearTimeout(adiado); adiado = null; seq++;
    ocupado(false); emVoo = null;   /* (a conta em voo foi descartada pelo seq: ela não solta o cartão sozinha) */
    /* (o catálogo também: com ele, os extras iriam explícitos em 0 e apagariam os da nova recomendação) */
    formato = null; extras = {}; iniciais = {}; urgencia = false; catalogo = null; catalogoDe = null;
    fecharControles();
    $('o-perguntas').hidden = false;
    document.dispatchEvent(new CustomEvent('bz:perguntas'));
    irPara(1, true);
  });
  function fecharControles() {
    $('o-est-acoes').hidden = true;
    $('o-ajustar').hidden = true;
    $('o-ajustar-abrir').setAttribute('aria-expanded', 'false');
  }
  $('o-quero-modelos').addEventListener('click', async function () {
    var b = this;
    if (gravando) return;
    gravando = true;
    b.setAttribute('aria-disabled', 'true');
    erro('');
    try {
      if (!(await assentar())) return;   /* (a conta falhou: o erro já está na tela) */
      var res = await API.confirmarPacote({ respostas: respostas(), formato: formato, extras: pedidoDeExtras(), urgencia: urgencia, versao: versao });
      fecharControles();
      document.dispatchEvent(new CustomEvent('bz:pacote-confirmado', { detail: { estimativa: res.estimativa } }));
      if (typeof opcoes.aoConfirmar === 'function') opcoes.aoConfirmar(res.estimativa);
    } catch (e) {
      /* a tabela mudou no meio: mostra o preço novo e a pessoa confirma de novo */
      if (e && e.status === 409 && e.dados && e.dados.versao_nova) await calcular();
      erro(mensagem(e, FALHA_GRAVAR));
    } finally {
      gravando = false;
      b.removeAttribute('aria-disabled');
    }
  });

  /* a página (js/orcamento.js) abre as perguntas numa conversa nova, sem tirar o foco nem rolar */
  window.BZPerguntas = {
    iniciar: function (o) {
      opcoes = o || {};
      $('o-perguntas').hidden = false;
      irPara(1, false);
    }
  };
})();
