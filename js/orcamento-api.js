/* ==========================================================================
   O CLIENTE DA API do orçamento (/api/vendas). Guarda a sessão do visitante
   anônimo no aparelho (localStorage 'bz-orcamento': token curto, token de
   renovação e o id da conversa) para quem sai e volta continuar de onde
   parou. O token só abre a conversa deste visitante; não há preço, regra ou
   chave aqui: tudo isso fica no servidor.
   A sessão nasce na PRIMEIRA mensagem (não a cada visita): sem visitante
   anônimo criado à toa.
   ========================================================================== */
(function () {
  'use strict';
  var CHAVE = 'bz-orcamento';
  var MARGEM_S = 60;   /* renova o token um minuto antes de vencer */

  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; } }
  var sessao = ler();
  function gravar(s) {
    sessao = s;
    try { if (s) localStorage.setItem(CHAVE, JSON.stringify(s)); else localStorage.removeItem(CHAVE); } catch (e) { /* sem armazenamento: vale só nesta aba */ }
  }

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

  async function http(metodo, acao, corpo, query, token) {
    var cab = {};
    if (corpo !== undefined) cab['content-type'] = 'application/json';
    if (token) cab.authorization = 'Bearer ' + token;
    var r;
    try {
      r = await fetch('/api/vendas?acao=' + encodeURIComponent(acao) + (query || ''), { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), cache: 'no-store' });
    } catch (e) {
      throw new Falha(0, { erro: 'Sem conexão. Confira a internet e tente de novo.' });
    }
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
      var guardada = ler();
      if (guardada && sessao && guardada.refresh !== sessao.refresh && guardada.conversa_id === sessao.conversa_id) { sessao = guardada; return true; }
      if (!sessao || !sessao.refresh) return false;
      var usado = sessao.refresh;
      try {
        var s = await http('POST', 'renovar', { refresh: usado });
        gravar(Object.assign({}, sessao, { token: s.token, refresh: s.refresh, expira_em: s.expira_em }));
        return true;
      } catch (e) {
        if (e.status !== 401) return false;   /* rede ou servidor: a sessão fica para tentar depois */
        var agora = ler();
        if (agora && agora.refresh !== usado) { sessao = agora; return true; }   /* outra aba renovou */
        gravar(null);   /* a renovação venceu de verdade: começa de novo */
        return false;
      }
    })().finally(function () { renovando = null; });
    return renovando;
  }

  async function chamar(metodo, acao, corpo, query) {
    if (sessao && sessao.expira_em && sessao.expira_em - Date.now() / 1000 < MARGEM_S) await renovar();
    try {
      return await http(metodo, acao, corpo, query, sessao && sessao.token);
    } catch (e) {
      if (e.status === 401 && (await renovar())) return http(metodo, acao, corpo, query, sessao.token);
      throw e;
    }
  }

  async function garantirSessao() {
    if (sessao && sessao.conversa_id) return sessao;
    var s = await http('POST', 'sessao', origem());
    gravar({ token: s.token, refresh: s.refresh, expira_em: s.expira_em, conversa_id: s.conversa_id });
    return sessao;
  }

  var comConversa = function (corpo) { return Object.assign({ conversa_id: sessao && sessao.conversa_id }, corpo || {}); };

  window.BZOrcamento = {
    Falha: Falha,
    temSessao: function () { return !!(sessao && sessao.conversa_id); },
    esquecer: function () { gravar(null); },
    estado: function () {
      if (!sessao || !sessao.conversa_id) return Promise.reject(new Falha(401, { erro: 'Sessão encerrada.' }));
      return chamar('GET', 'estado', undefined, '&conversa=' + encodeURIComponent(sessao.conversa_id));
    },
    mensagem: async function (texto) { await garantirSessao(); return chamar('POST', 'mensagem', comConversa({ texto: texto })); },
    contato: function (dados) { return chamar('POST', 'contato', comConversa(dados)); },
    gerar: function () { return chamar('POST', 'gerar', comConversa()); },
    gerarDirecao: function (id) { return chamar('POST', 'gerar-direcao', comConversa({ direcao_id: id })); },
    escolher: function (id) { return chamar('POST', 'escolher', comConversa({ direcao_id: id })); },
    alterar: function (pedido) { return chamar('POST', 'alterar', comConversa({ pedido: pedido })); },
    escopo: function () { return chamar('POST', 'escopo', comConversa()); },
    confirmar: function (propostaId, inicioImediato) { return chamar('POST', 'confirmar', comConversa({ proposta_id: propostaId, confirmo: true, inicio_imediato: inicioImediato })); },
    /* o valor NUNCA vai daqui: o servidor tira da proposta aceita */
    pagar: function (metodo, pagador, cartao) { return chamar('POST', 'pagar', comConversa({ metodo: metodo, pagador: pagador, cartao: cartao })); },
    pagamento: function () { return chamar('GET', 'pagamento', undefined, '&conversa=' + encodeURIComponent(sessao.conversa_id)); },
    pagamentoConfig: function () { return http('GET', 'pagamento-config'); }
  };
})();
