/* ==========================================================================
   O CLIENTE DA API do orçamento (/api/vendas). Guarda a sessão do visitante
   anônimo no aparelho (localStorage 'bz-orcamento': token curto, token de
   renovação e o id da conversa) para quem sai e volta continuar de onde
   parou. O token só abre a conversa deste visitante; não há preço, regra ou
   chave aqui: tudo isso fica no servidor.
   A sessão nasce no "Ver o preço" das perguntas (ou na primeira mensagem
   ao consultor), não a cada visita: sem visitante anônimo criado à toa.
   ========================================================================== */
(function () {
  'use strict';
  var CHAVE = 'bz-orcamento';
  var MARGEM_S = 60;   /* renova o token um minuto antes de vencer */
  var MENSAGEM_MS = 90e3;   /* tempo limite de um turno com a IA (mensagem e ajuste; auditoria 2026-10-09, F2): sem ele, a rede caída deixava a página esperando para sempre */
  var ESTADO_MS = 15e3;     /* a leitura do estado: curta, para a releitura depois de uma falha não pendurar a tela */
  var ESQUECIDA = 'bz-orcamento-esquecida';   /* a conversa que a pessoa mandou recomeçar: nenhuma aba a grava de novo */

  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; } }
  var sessao = ler();
  var perdida = false;   /* a sessão existia e o servidor a recusou de vez: a página avisa em vez de abrir conversa nova em silêncio */
  var codigoPerdido = null;   /* o código do pedido da sessão perdida: o aviso cita (ele saiu do aparelho junto com a sessão) */
  var falhaDaRenovacao = null;   /* a renovação não concluiu por rede ou servidor instável (503 recuperável): a sessão fica e o erro sobe */
  var esquecida = function () { try { return localStorage.getItem(ESQUECIDA); } catch (e) { return null; } };
  function gravar(s) {
    if (s && s.conversa_id && s.conversa_id === esquecida()) s = null;   /* (outra aba ainda com a sessão na memória: não ressuscita) */
    sessao = s;
    try { if (s) localStorage.setItem(CHAVE, JSON.stringify(s)); else localStorage.removeItem(CHAVE); } catch (e) { /* sem armazenamento: vale só nesta aba */ }
  }
  if (sessao && sessao.conversa_id && sessao.conversa_id === esquecida()) gravar(null);   /* (gravada por outra aba depois do Recomeçar) */
  function perder() {
    if (sessao && sessao.conversa_id) codigoPerdido = String(sessao.conversa_id).slice(0, 8);
    gravar(null);
    perdida = true;
  }
  /* outra aba apagou a sessão (Recomeçar, ou a renovação recusada lá): esta também para e avisa já (a página ouve
     'bz-orcamento:perdida': para a espera e o pagamento e mostra o aviso quieto) */
  window.addEventListener('storage', function (ev) {
    if (ev.key === CHAVE && ev.newValue === null && sessao && sessao.conversa_id) {
      codigoPerdido = String(sessao.conversa_id).slice(0, 8); sessao = null; perdida = true;
      try { document.dispatchEvent(new CustomEvent('bz-orcamento:perdida')); } catch (e) { /* navegador muito antigo: avisa na próxima ação */ }
    }
  });

  /* a origem da visita (js/metricas.js, sessionStorage): só meio, fonte, campanha, termo e o código curto */
  function origem() {
    var v = null;
    try { v = JSON.parse(sessionStorage.getItem('bz-visita') || 'null'); } catch (e) { v = null; }
    if (!v) return {};
    return { meio: v.meio, fonte: v.fonte, campanha: v.campanha, termo: v.termo, codigo: v.codigo };
  }

  function Falha(status, dados) {
    this.name = 'Falha';
    this.status = status;
    this.dados = dados || {};
    this.message = (dados && dados.erro) || 'Não foi possível concluir agora.';
  }
  Falha.prototype = Object.create(Error.prototype);

  /* limiteMs: tempo limite (AbortController); estourado, vira Falha(0) com dados.tempo = true */
  async function http(metodo, acao, corpo, query, token, limiteMs) {
    var cab = {};
    if (corpo !== undefined) cab['content-type'] = 'application/json';
    if (token) cab.authorization = 'Bearer ' + token;
    var ctrl = limiteMs && typeof AbortController === 'function' ? new AbortController() : null;
    var relogio = ctrl ? setTimeout(function () { ctrl.abort(); }, limiteMs) : null;
    var r;
    try {
      r = await fetch('/api/vendas?acao=' + encodeURIComponent(acao) + (query || ''), { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
    } catch (e) {
      if (ctrl && ctrl.signal.aborted) throw new Falha(0, { erro: 'A resposta demorou mais que o normal.', tempo: true });
      throw new Falha(0, { erro: 'Sem conexão. Confira a internet e tente de novo.' });
    } finally { clearTimeout(relogio); }
    var dados = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Falha(r.status, dados);
    return dados;
  }

  /* UMA renovação por vez nesta aba (duas com o mesmo refresh: a 2ª levaria 401 e apagaria a sessão boa).
     Outra aba pode ter renovado antes: relê o aparelho antes de concluir que a sessão morreu. */
  var renovando = null;
  function renovar() {
    if (renovando) return renovando;
    renovando = (async function () {
      falhaDaRenovacao = null;   /* (no início: uma saída antecipada não pode deixar um 503 velho para trás) */
      var guardada = ler();
      if (guardada && sessao && guardada.refresh !== sessao.refresh && guardada.conversa_id === sessao.conversa_id) { sessao = guardada; return true; }
      if (!sessao || !sessao.refresh) return false;
      var usado = sessao.refresh;
      try {
        var s = await http('POST', 'renovar', { refresh: usado }, undefined, undefined, ESTADO_MS);   /* (com limite: a renovação vem antes de toda chamada) */
        gravar(Object.assign({}, sessao, { token: s.token, refresh: s.refresh, expira_em: s.expira_em }));
        return true;
      } catch (e) {
        /* rede ou servidor instável (o servidor responde 503 recuperável quando o Auth oscila): a sessão FICA,
           e quem chamou recebe esse erro (frase do servidor + "Tentar de novo"), não "Sua sessão terminou" */
        if (e.status !== 401) { falhaDaRenovacao = e; return false; }
        var agora = ler();
        if (agora && agora.refresh !== usado) { sessao = agora; return true; }   /* outra aba renovou */
        perder();   /* só o 401 de verdade: a página avisa ("Sua sessão terminou") e oferece recomeçar */
        return false;
      }
    })().finally(function () { renovando = null; });
    return renovando;
  }

  async function chamar(metodo, acao, corpo, query, limiteMs) {
    if (sessao && sessao.expira_em && sessao.expira_em - Date.now() / 1000 < MARGEM_S) await renovar();
    try {
      return await http(metodo, acao, corpo, query, sessao && sessao.token, limiteMs);
    } catch (e) {
      if (e.status !== 401) throw e;
      if (await renovar()) {
        if (!sessao) throw e;   /* (renovou, mas a sessão foi esquecida no meio: Recomeçar em outra aba) */
        return http(metodo, acao, corpo, query, sessao.token, limiteMs);
      }
      if (sessao && falhaDaRenovacao) throw falhaDaRenovacao;   /* (a sessão segue: o erro passageiro é o que vale) */
      throw e;
    }
  }

  /* uma criação de sessão por vez: duas chamadas juntas esperam a mesma (não abrem dois desafios) */
  var criando = null;
  function garantirSessao() {
    if (sessao && sessao.conversa_id) return Promise.resolve(sessao);
    if (perdida) return Promise.reject(new Falha(401, { erro: 'Sua sessão terminou.' }));   /* (não abre conversa nova sem a pessoa saber) */
    if (!criando) criando = criarSessao().finally(function () { criando = null; });
    return criando;
  }
  async function criarSessao() {
    var corpo = origem();
    /* anti-robô (js/orcamento-turnstile.js): sem chave configurada, não há token e o servidor não exige */
    if (window.BZTurnstile) {
      var t;
      try { t = await window.BZTurnstile.token(); }
      catch (e) {
        if (e && e.tipo === 'carga') throw new Falha(503, { erro: 'A verificação de segurança não carregou. Tente de novo em instantes ou fale com a Beyon Zero pelo WhatsApp.', whatsapp: true });
        throw new Falha(403, { erro: 'Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo.' });
      }
      if (t) corpo = Object.assign({}, corpo, { turnstile: t });
    }
    var s = await http('POST', 'sessao', corpo);
    gravar({ token: s.token, refresh: s.refresh, expira_em: s.expira_em, conversa_id: s.conversa_id });
    return sessao;
  }

  var comConversa = function (corpo) { return Object.assign({ conversa_id: sessao && sessao.conversa_id }, corpo || {}); };

  window.BZOrcamento = {
    Falha: Falha,
    temSessao: function () { return !!(sessao && sessao.conversa_id); },
    /* a sessão existia e terminou (a renovação foi recusada): a página mostra "Sua sessão terminou" + Recomeçar */
    perdeuSessao: function () { return perdida; },
    /* o código do pedido: os 8 primeiros caracteres da conversa (o mesmo id curto do painel) */
    codigo: function () { return sessao && sessao.conversa_id ? String(sessao.conversa_id).slice(0, 8) : null; },
    codigoPerdido: function () { return codigoPerdido; },
    /* Recomeçar: apaga a sessão e marca a conversa como esquecida (outra aba aberta não a grava de volta) */
    esquecer: function () {
      try { if (sessao && sessao.conversa_id) localStorage.setItem(ESQUECIDA, sessao.conversa_id); } catch (e) { /* sem armazenamento */ }
      gravar(null); perdida = false; codigoPerdido = null;
    },
    estado: function () {
      if (!sessao || !sessao.conversa_id) return Promise.reject(new Falha(401, { erro: 'Sessão encerrada.' }));
      return chamar('GET', 'estado', undefined, '&conversa=' + encodeURIComponent(sessao.conversa_id), ESTADO_MS);
    },
    mensagem: async function (texto) { await garantirSessao(); return chamar('POST', 'mensagem', comConversa({ texto: texto }), undefined, MENSAGEM_MS); },
    contato: function (dados) { return chamar('POST', 'contato', comConversa(dados)); },
    gerar: function () { return chamar('POST', 'gerar', comConversa()); },
    gerarDirecao: function (id) { return chamar('POST', 'gerar-direcao', comConversa({ direcao_id: id })); },
    escolher: function (id) { return chamar('POST', 'escolher', comConversa({ direcao_id: id })); },
    alterar: function (pedido) { return chamar('POST', 'alterar', comConversa({ pedido: pedido }), undefined, MENSAGEM_MS); },
    escopo: function () { return chamar('POST', 'escopo', comConversa()); },
    confirmar: function (propostaId, inicioImediato) { return chamar('POST', 'confirmar', comConversa({ proposta_id: propostaId, confirmo: true, inicio_imediato: inicioImediato })); },
    /* o valor NUNCA vai daqui: o servidor tira da proposta aceita */
    pagar: function (metodo, pagador, cartao) { return chamar('POST', 'pagar', comConversa({ metodo: metodo, pagador: pagador, cartao: cartao })); },
    pagamento: function () {
      if (!sessao || !sessao.conversa_id) return Promise.reject(new Falha(401, { erro: 'Sessão encerrada.' }));   /* (sem sessão: erro, não TypeError) */
      return chamar('GET', 'pagamento', undefined, '&conversa=' + encodeURIComponent(sessao.conversa_id));
    },
    pagamentoConfig: function () { return http('GET', 'pagamento-config'); },
    /* o orçamento sem IA (spec 2026-10-11): se há consultor; o catálogo da tabela ativa; o preço ao vivo (simular,
       que NÃO grava) e o pacote gravado uma vez (confirmar-pacote, com a versão da tabela que a pessoa viu) */
    sessaoConfig: function () { return http('GET', 'sessao-config', undefined, undefined, undefined, ESTADO_MS); },
    catalogo: async function (formato, ramo) {
      await garantirSessao();
      return chamar('GET', 'catalogo', undefined, '&conversa=' + encodeURIComponent(sessao.conversa_id) + '&formato=' + encodeURIComponent(formato || '') + '&ramo=' + encodeURIComponent(ramo || ''), ESTADO_MS);
    },
    simular: async function (dados) { await garantirSessao(); return chamar('POST', 'simular', comConversa(dados), undefined, ESTADO_MS); },
    confirmarPacote: function (dados) { return chamar('POST', 'confirmar-pacote', comConversa(dados), undefined, ESTADO_MS); }
  };
})();
