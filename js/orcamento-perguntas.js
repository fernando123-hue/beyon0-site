/* ==========================================================================
   OS CONTROLES DO PACOTE (spec docs/specs/2026-10-11-orcamento-sem-ia.md §2–§3; desde o orçamento como conversa, spec
   docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md, as respostas vêm dos toques na conversa, js/orcamento-toques.js,
   por BZPerguntas.definir: a tela de perguntas saiu).
   As respostas → o preço (do servidor, nunca calculado aqui) →
   as sugestões e "Ver todos os extras" com o preço ao vivo (simular, que não grava) → "Quero os
   três modelos" grava o pacote (confirmar-pacote) e entrega a vez ao resto
   da página (evento bz:pacote-confirmado). Todo texto por textContent.
   Os extras vão SEMPRE explícitos (marcado = quantidade, desmarcado = 0): o
   servidor só soma os extras da recomendação no formato recomendado, então
   trocar de formato e voltar não pode depender dele para não perder nada.
   O que se grava é exatamente o pedido do ÚLTIMO preço que apareceu na tela:
   uma conta que falha (rede, 429, tempo) devolve a tela a esse preço.
   ========================================================================== */
(function () {
  'use strict';
  var API = window.BZOrcamento;
  var $ = function (id) { return document.getElementById(id); };
  if (!API || !$('o-est-acoes')) return;

  var ESPERA_MS = 300;   /* o preço ao vivo espera a pessoa parar de marcar (o servidor freia 60 cálculos por hora por conversa) */
  var NOMES = { landing_page: 'Site de uma página', institucional: 'Site com várias páginas', sob_medida: 'Atelier (site com visual exclusivo)', loja_plataforma: 'Loja virtual' };
  var ASSUMIDO = { ramo: 'o seu ramo', objetivos: 'o que o site precisa trazer', site_atual: 'se já tem site', material: 'se já tem logo e textos' };
  var FALHA_CALCULO = 'Não consegui calcular agora. Tente de novo ou deixe um recado.';
  var FALHA_GRAVAR = 'Não consegui guardar agora. Tente de novo.';
  var QUERO = 'Quero os três modelos', GUARDANDO = 'Guardando…';
  var SETAS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  /* o que fica parado enquanto o pacote é gravado (nada muda o pedido no meio) */
  var CONTROLES = ['o-ajustar-principais', 'o-ajustar-mais', 'o-x-urgencia', 'o-ajustar-abrir', 'o-p-refazer', 'o-est-sugerido'];

  var r = { objetivos: [] };          /* as respostas */
  var formato = null;                 /* null até o 1º preço: o servidor recomenda */
  var extras = {}, iniciais = {};     /* chave → quantidade; iniciais: a quantidade que a recomendação trouxe */
  var conhecidos = false;             /* a tela já sabe quais extras a recomendação traz (veio um preço com valor no formato recomendado) */
  var urgencia = false, catalogo = null, catalogoDe = null;
  var seq = 0, ultimaDeu = false, emVoo = null, adiado = null, gravando = false, gravado = false, opcoes = {};
  var ultimoRes = null;  /* a última conta desenhada: os controles aparecem quando o valor é liberado */
  var mostrado = null;   /* as escolhas do último preço que deu certo ({formato, extras, urgencia}): para onde a tela volta se a conta falhar */
  var valido = null;     /* o pedido e a versão do último preço mostrado; null sem preço ou com diagnóstico. É o que "Quero" grava */
  var sugerido = null;   /* o formato que o servidor indicou na recusa (a landing grande demais) */

  var dinheiro = function (n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  var todos = function (seletor) { return [].slice.call(document.querySelectorAll(seletor)); };
  var sem = function (obj, chave) { var c = Object.assign({}, obj); delete c[chave]; return c; };
  var com = function (obj, chave, valor) { var c = Object.assign({}, obj); c[chave] = valor; return c; };
  var todosExtras = function () { return catalogo ? catalogo.extras.principais.concat(catalogo.extras.mais) : []; };

  /* ---------- as respostas (dos toques da conversa) ---------- */
  function respostas() {
    var t = Toques(), sit = t && !t.comConsultor() ? t.situacao() : [];   /* (sem o consultor, a dor tocada vai junto ao gravar o pacote) */
    var o = { ramo: r.ramo, outro: r.ramo === 'outro' ? (r.outro || '') : '', objetivos: (r.objetivos || []).slice(), site_atual: r.site_atual, material: r.material };
    if (sit.length) o.situacao = sit;
    return o;
  }
  /* o valor espera o caso (js/orcamento-toques.js): enquanto isso, a conta só alimenta o radar e nenhum controle aparece. Com o consultor, o valor é o
     da estimativa do Zero: os extras e os formatos ao lado (que fariam outra conta) ficam na conversa; ficam o "Quero" e o "Mudar as respostas" */
  var Toques = function () { return window.BZToques || null; };
  var retido = function () { var t = Toques(); return !!(t && t.reterValor(null)); };
  var comZero = function () { var t = Toques(); return !!(t && t.comConsultor()); };
  function lista(ul, itens) { ul.textContent = ''; itens.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); }
  /* o erro vai para onde a pessoa está olhando: as perguntas ou o cartão do preço. No cartão, a recusa que indica outro
     formato (a landing passou de 3 páginas) ganha o botão para ver esse formato */
  function erro(msg, formatoIndicado) {
    /* (o 1º preço em voo: as perguntas saíram só por enquanto e a falha volta a elas. A mensagem fica guardada e o "Ver o preço" a escreve quando
       elas estiverem à vista: o #o-p-erro é role="alert", e um alerta escrito num bloco escondido não é anunciado pelo leitor de tela) */
    var texto = msg, noCartao = true;
    $('o-est-erro').textContent = texto;
    /* (a conta que falhou já devolveu a tela ao formato mostrado: se é o indicado, o botão não levaria a lugar nenhum) */
    sugerido = noCartao && texto && NOMES[formatoIndicado] && formatoIndicado !== formato ? formatoIndicado : null;
    $('o-est-sugerido').hidden = !sugerido;
    if (sugerido) $('o-est-sugerido').textContent = 'Ver o ' + NOMES[sugerido].toLowerCase();
  }
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
  /* explícito: cada extra do catálogo vai com a quantidade marcada ou 0 (o 0 vence o extra da recomendação). Enquanto a
     tela não conhece os extras da recomendação (o 1º preço pode ter vindo sem valor, pedindo conversa), só os marcados:
     o servidor soma os da recomendação no formato recomendado, e um 0 aqui apagaria o que a pessoa nunca viu */
  function pedidoDeExtras() {
    if (!conhecidos) return Object.keys(extras).reduce(function (p, k) { return extras[k] > 0 ? com(p, k, extras[k]) : p; }, {});
    return todosExtras().reduce(function (p, x) { return x.fale_comigo ? p : com(p, x.chave, extras[x.chave] > 0 ? extras[x.chave] : 0); }, Object.assign({}, extras));
  }
  /* o 1º preço traz os extras da recomendação (ex.: agendamento): eles viram o estado da tela, pela chave do item */
  function extrasDoPreco(est) {
    if (!est) return {};
    var chaves = todosExtras().map(function (x) { return x.chave; });
    var itens = (est.itens || []).concat(est.fase_seguinte ? est.fase_seguinte.itens : []);
    return itens.reduce(function (ex, i) {
      return chaves.indexOf(i.chave) >= 0 ? com(ex, i.chave, (ex[i.chave] || 0) + i.qtd) : ex;
    }, {});
  }

  /* ---------- o preço (servidor) ---------- */
  function ocupado(sim) {
    if (sim) $('o-est').setAttribute('aria-busy', 'true'); else $('o-est').removeAttribute('aria-busy');
    document.dispatchEvent(new CustomEvent('bz:calculando', { detail: { ativo: sim } }));   /* (o radar do escopo varre só com a conta em voo) */
  }
  /* uma conta por vez vale: a resposta de um pedido mais velho que o último é descartada. Devolve se deu certo */
  function calcular() {
    var meu = ++seq;
    var pedido = { respostas: respostas(), formato: formato, extras: pedidoDeExtras(), urgencia: urgencia };
    var escolhas = { formato: formato, extras: extras, urgencia: urgencia };
    ocupado(true);
    erro('');
    emVoo = (async function () {
      try {
        var res = await API.simular(pedido);
        /* (superada por outra conta: responde o que a ÚLTIMA responder, para quem espera não tratar como falha uma conta que só foi trocada) */
        if (meu !== seq) return emVoo || ultimaDeu;
        var fmt = formato || res.recomendacao.formato;
        if (catalogoDe !== fmt) {
          var cat = await API.catalogo(fmt, r.ramo);
          if (meu !== seq) return emVoo || ultimaDeu;
          catalogo = cat; catalogoDe = fmt;
          if ($('o-ajustar').hidden === false) montarExtras();
        }
        /* o 1º preço com valor no formato recomendado ensina à tela os extras da recomendação. Sem valor, segue a
           recomendar; se a pessoa já mexeu de novo (outra conta esperando), quem ensina é a conta seguinte (o clique fica) */
        if (!conhecidos && res.estimativa && fmt === res.recomendacao.formato && !adiado) {
          formato = fmt; extras = extrasDoPreco(res.estimativa); iniciais = extras; conhecidos = true;
          escolhas = { formato: formato, extras: extras, urgencia: escolhas.urgencia };
        }
        mostrado = escolhas;
        valido = res.estimativa ? { pedido: pedido, versao: res.versao } : null;
        desenhar(res, pedido.urgencia);
        ultimaDeu = true;
        return true;
      } catch (e) {
        if (meu !== seq) return emVoo || ultimaDeu;
        contaFalhou(e);
        ultimaDeu = false;
        return false;
      } finally { if (meu === seq) { ocupado(false); emVoo = null; } }
    })();
    return emVoo;
  }
  /* a conta falhou: a tela volta às escolhas do último preço que apareceu (é ele que "Quero" grava). Se a pessoa já
     mexeu de novo (outra conta esperando), quem decide é a conta seguinte */
  function contaFalhou(e) {
    if (mostrado && !adiado) {
      formato = mostrado.formato; extras = mostrado.extras; urgencia = mostrado.urgencia;
      atualizarExtras();
    }
    erro(mensagem(e, FALHA_CALCULO), e && e.status === 400 && e.dados ? e.dados.formato_sugerido : null);
  }
  function agendar() { clearTimeout(adiado); adiado = setTimeout(function () { adiado = null; calcular(); }, ESPERA_MS); }
  /* antes de gravar: as contas pendentes (espera ou em voo, inclusive uma que começou durante a espera) terminam, para
     gravar exatamente o preço que está na tela. Devolve se a última deu certo (se falhou, o erro já está na tela) */
  async function assentar() {
    var deu = true;
    while (adiado || emVoo) {
      if (adiado) { clearTimeout(adiado); adiado = null; calcular(); }
      deu = await emVoo;
    }
    return deu;
  }

  function desenhar(res, comUrgencia) {
    if (gravado) return;   /* (o pacote já foi gravado: uma conta atrasada não reabre os controles) */
    var rec = res.recomendacao;
    var atual = formato || rec.formato;   /* (a recomendar: o da recomendação) */
    $('o-est-motivo').textContent = atual === rec.formato ? (rec.motivo || '') : '';
    $('o-est-motivo').hidden = !$('o-est-motivo').textContent;
    var assumidos = (rec.assumido || []).map(function (k) { return ASSUMIDO[k]; }).filter(Boolean);
    $('o-est-assumido').hidden = !assumidos.length;
    $('o-est-assumido').textContent = assumidos.length ? 'Escolhi por você: ' + assumidos.join(', ') + '. Dá para trocar em "Mudar as respostas".' : '';
    /* o cartão (e o pacote que pede conversa) é desenhado por js/orcamento.js, o mesmo do resto da página; o radar do escopo
       (js/orcamento-escopo.js) lê também a recomendação, o formato da tela, a urgência DESTA conta e o que o catálogo diz do formato */
    var fmtCat = catalogo ? catalogo.formatos.filter(function (x) { return x.chave === atual; })[0] : null;
    document.dispatchEvent(new CustomEvent('bz:preco', { detail: { estimativa: res.estimativa, diagnostico: res.diagnostico, recomendacao: rec, formato: atual, urgencia: comUrgencia,
      paginas_incluidas: fmtCat ? fmtCat.paginas_incluidas : null, urgencia_pct: catalogo && catalogo.urgencia ? catalogo.urgencia.acrescimo_percentual : null } }));
    if (res.estimativa && NOMES[atual]) $('o-est-formato').textContent = NOMES[atual];   /* (as palavras da tela, as mesmas dos vizinhos) */
    vizinhos(rec, atual);
    incluidos(atual);
    $('o-quero-modelos').hidden = !res.estimativa;   /* (pacote que pede conversa não se grava por aqui) */
    ultimoRes = { res: res, urgencia: comUrgencia };
    $('o-est-acoes').hidden = retido();
    ['o-reco', 'o-ajustar-abrir', 'o-vizinhos', 'o-est-sugerido'].forEach(function (id) { if (comZero()) $(id).hidden = true; });
    if (comZero()) return;
    /* as sugestões (refeitas quando o catálogo muda: outro formato, outro ramo) e as marcas dos dois lugares */
    if (catalogo && sugestoesDe !== catalogoDe) montarSugestoes();
    if (catalogo) atualizarExtras();
    /* (depois das marcas: se o "requer" escondeu todos os cartões, o título não fica sozinho) */
    $('o-reco').hidden = !res.estimativa || !$('o-reco-lista').querySelector('.orc-reco__item:not([hidden])');
  }
  /* os formatos ao lado (âncora honesta): a alternativa da recomendação e, fora dela, o próprio recomendado */
  function vizinhos(rec, atual) {
    var caixa = $('o-vizinhos');
    caixa.textContent = '';
    if (!catalogo) return;
    var chaves = [rec.alternativa, rec.formato].filter(function (k, i, l) { return k && k !== atual && l.indexOf(k) === i; });
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

  /* ---------- os extras: as SUGESTÕES no painel (dono, 2026-11-10, opção A) e a lista completa ("Ver todos os extras").
     Um estado só (extras): marcar num lugar marca no outro. Montados uma vez por catálogo; cada mudança só acerta marcado e
     visível (o foco fica) ---------- */
  var GRUPOS = { conteudo: 'Conteúdo', negocio: 'Para o seu negócio', loja: 'Loja', visual: 'Visual', alcance: 'Alcance', area: 'Área com login', sistema: 'Sistema' };
  var ORDEM_GRUPOS = Object.keys(GRUPOS);
  var sugestoesDe = null;
  var preco = function (x) { return x.valor != null && !x.fale_comigo ? '+ ' + dinheiro(x.valor) : 'fale comigo'; };
  function alternar(x, sim) {
    extras = sim ? com(extras, x.chave, iniciais[x.chave] || 1) : semOrfaos(sem(extras, x.chave), formato || catalogoDe);
    atualizarExtras();
    agendar();
  }
  /* a lista completa, por grupo (o nome curto e o preço à vista; a frase da tabela fica para o leitor de tela) */
  function montarExtras() {
    [['o-ajustar-principais', catalogo.extras.principais], ['o-ajustar-mais', catalogo.extras.mais]].forEach(function (par) {
      var caixa = $(par[0]), grupoAntes = null;
      todos('#' + par[0] + ' .orc-extra, #' + par[0] + ' .orc-extra__grupo').forEach(function (n) { n.remove(); });
      ordenados(par[1]).forEach(function (x) {
        if (x.grupo !== grupoAntes) { grupoAntes = x.grupo; var g = document.createElement('p'); g.className = 'orc-extra__grupo'; g.textContent = GRUPOS[x.grupo] || ''; caixa.appendChild(g); }
        caixa.appendChild(extraNaTela(x));
      });
    });
    $('o-ajustar').querySelector('.orc-ajustar__mais').hidden = !catalogo.extras.mais.length;
    if (catalogo.urgencia) $('o-x-urgencia-texto').textContent = 'Preciso antes do prazo: +' + catalogo.urgencia.acrescimo_percentual + '% no valor';
    atualizarExtras();
  }
  function ordenados(lista) {
    var pos = function (x) { var i = ORDEM_GRUPOS.indexOf(x.grupo); return i < 0 ? ORDEM_GRUPOS.length : i; };
    return lista.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) { return pos(a.x) - pos(b.x) || a.i - b.i; }).map(function (p) { return p.x; });
  }
  function extraNaTela(x) {
    var rotulo = document.createElement('label'); rotulo.className = 'orc-check orc-extra';
    var c = document.createElement('input'); c.type = 'checkbox'; c.id = 'o-x-' + x.chave; c.setAttribute('data-extra', x.chave);
    c.disabled = x.fale_comigo;
    var nome = document.createElement('span'), valor = document.createElement('span'), frase = document.createElement('span');
    nome.className = 'orc-extra__nome'; valor.className = 'orc-extra__valor'; frase.className = 'sr-only';
    nome.textContent = x.curto || x.nome;
    valor.textContent = preco(x);
    if (x.por_pagina && !x.fale_comigo) { var pp = document.createElement('small'); pp.textContent = 'por página'; valor.appendChild(pp); }
    frase.textContent = '. ' + x.frase;
    nome.appendChild(frase);
    rotulo.setAttribute('for', c.id);
    rotulo.appendChild(c); rotulo.appendChild(nome); rotulo.appendChild(valor);
    c.addEventListener('change', function () { alternar(x, c.checked); });
    return rotulo;
  }
  /* as sugestões: cartões grandes antes do "Quero os três modelos" (o servidor escolhe pelo ramo e pelo formato: catalogo.recomendados) */
  function montarSugestoes() {
    sugestoesDe = catalogoDe;
    var lista = $('o-reco-lista'), achados = (catalogo.recomendados || []).map(function (k) { return todosExtras().filter(function (x) { return x.chave === k; })[0]; }).filter(Boolean);
    lista.textContent = '';
    achados.forEach(function (x) { lista.appendChild(cartao(x)); });
    $('o-reco').hidden = !achados.length;
    var n = todosExtras().length;
    $('o-ajustar-abrir').textContent = n ? 'Ver todos os extras (' + n + ')' : 'Ver todos os extras';
  }
  function cartao(x) {
    var rotulo = document.createElement('label'); rotulo.className = 'orc-reco__item';
    var c = document.createElement('input'); c.type = 'checkbox'; c.id = 'o-r-' + x.chave; c.className = 'orc-reco__caixa'; c.setAttribute('data-extra', x.chave);
    var marca = document.createElement('span'), txt = document.createElement('span'), nome = document.createElement('b'), ben = document.createElement('span'), valor = document.createElement('span');
    marca.className = 'orc-reco__marca'; marca.setAttribute('aria-hidden', 'true');
    txt.className = 'orc-reco__txt'; ben.className = 'orc-reco__beneficio'; valor.className = 'orc-reco__valor';
    nome.textContent = x.curto || x.nome; ben.textContent = x.beneficio || x.frase;
    valor.textContent = preco(x);
    if (x.por_pagina) { var p = document.createElement('small'); p.textContent = 'por página'; valor.appendChild(p); }
    txt.appendChild(nome); txt.appendChild(ben);
    rotulo.setAttribute('for', c.id);
    rotulo.appendChild(c); rotulo.appendChild(marca); rotulo.appendChild(txt); rotulo.appendChild(valor);
    c.addEventListener('change', function () { alternar(x, c.checked); });
    return rotulo;
  }
  function atualizarExtras() {
    var fmt = formato || catalogoDe;   /* (a recomendar: o do catálogo, que é o recomendado) */
    todosExtras().forEach(function (x) {
      var visivel = !x.requer || x.requer.some(function (q) { return q === fmt || extras[q] > 0; });
      todos('[data-extra="' + CSS.escape(x.chave) + '"]').forEach(function (c) {
        c.checked = extras[x.chave] > 0;
        c.closest('.orc-extra, .orc-reco__item').hidden = !visivel;
      });
    });
    $('o-x-urgencia').checked = urgencia;
  }

  /* ---------- os botões ---------- */
  $('o-ajustar-abrir').addEventListener('click', function () {
    var abrir = $('o-ajustar').hidden;
    if (abrir && catalogo) montarExtras();
    $('o-ajustar').hidden = !abrir;
    this.setAttribute('aria-expanded', String(abrir));
    if (abrir) $('o-ajustar').scrollIntoView({ block: 'nearest' });
  });
  $('o-x-urgencia').addEventListener('change', function () { urgencia = this.checked; agendar(); });
  $('o-est-sugerido').addEventListener('click', function () { var k = sugerido; erro(''); if (k) trocarFormato(k); });
  /* recomeça o pacote: o preço será recomendado de novo para as respostas novas */
  function recomecar() {
    clearTimeout(adiado); adiado = null; seq++;
    ocupado(false); emVoo = null;   /* (a conta em voo foi descartada pelo seq: ela não solta o cartão sozinha) */
    /* (o catálogo também: com ele, os extras iriam explícitos em 0 e apagariam os da nova recomendação) */
    formato = null; extras = {}; iniciais = {}; conhecidos = false; urgencia = false; catalogo = null; catalogoDe = null; sugestoesDe = null;
    mostrado = null; valido = null; ultimoRes = null;
    erro('');
    fecharControles();
  }
  /* "Mudar as respostas": as perguntas fixas voltam DENTRO da conversa (js/orcamento-toques.js), com as respostas de agora marcadas */
  $('o-p-refazer').addEventListener('click', function () {
    var t = Toques();
    if (t) t.reabrir();
  });
  /* o valor foi liberado (o caso entendido): os controles da última conta aparecem */
  document.addEventListener('bz:valor-liberado', function () { if (ultimoRes && !gravado) desenhar(ultimoRes.res, ultimoRes.urgencia); });
  function fecharControles() {
    $('o-est-acoes').hidden = true;
    $('o-ajustar').hidden = true;
    $('o-ajustar-abrir').setAttribute('aria-expanded', 'false');
  }
  /* enquanto grava: nada muda o pedido (extras, urgência, formato, respostas) e o botão diz o que está fazendo */
  function travar(sim, botao) {
    CONTROLES.forEach(function (id) { $(id).disabled = sim; });
    todos('#o-vizinhos .orc-vizinho, #o-reco-lista input').forEach(function (v) { v.disabled = sim; });
    if (sim) botao.setAttribute('aria-disabled', 'true'); else botao.removeAttribute('aria-disabled');
    botao.textContent = sim ? GUARDANDO : QUERO;
  }
  $('o-quero-modelos').addEventListener('click', async function () {
    var b = this;
    if (gravando || gravado) return;
    /* com o consultor, o pacote é a estimativa que o Zero gravou: nada a confirmar por aqui (confirmar-pacote a trocaria pela do classificador, spec §2) */
    if (comZero()) { document.dispatchEvent(new CustomEvent('bz:quero-com-zero')); return; }
    gravando = true;
    travar(true, b);
    erro('');
    try {
      if (!(await assentar()) || !valido) return;   /* (a conta falhou: o erro já está na tela; com diagnóstico, nada a gravar) */
      var res = await API.confirmarPacote(com(valido.pedido, 'versao', valido.versao));
      /* gravado: nenhuma conta atrasada redesenha o preço nem reabre os controles */
      gravado = true;
      clearTimeout(adiado); adiado = null; seq++;
      ocupado(false); emVoo = null;
      fecharControles();
      document.dispatchEvent(new CustomEvent('bz:pacote-confirmado', { detail: { estimativa: res.estimativa } }));
      if (typeof opcoes.aoConfirmar === 'function') opcoes.aoConfirmar(res.estimativa);
    } catch (e) {
      /* a tabela mudou no meio: mostra o preço novo e a pessoa confirma de novo */
      if (e && e.status === 409 && e.dados && e.dados.versao_nova) await calcular();
      erro(mensagem(e, FALHA_GRAVAR));
    } finally {
      gravando = false;
      travar(false, b);
    }
  });

  /* a página (js/orcamento.js) dá as opções; os toques (js/orcamento-toques.js) dão as respostas e pedem a conta (o radar se preenche) */
  window.BZPerguntas = {
    iniciar: function (o) { opcoes = o || {}; },
    /* respostas novas: o pacote recomeça e a conta sai já (sem a espera dos extras, que é para quem marca vários seguidos) */
    definir: function (novas) {
      var n = novas || {};
      r = { ramo: n.ramo, outro: n.outro || '', objetivos: (n.objetivos || []).slice(), site_atual: n.site_atual, material: n.material };
      recomecar();
      return calcular();
    },
    respostas: function () { return respostas(); }
  };
})();
