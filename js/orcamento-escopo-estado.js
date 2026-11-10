/* ==========================================================================
   O RADAR DO ESCOPO: A DERIVAÇÃO (direção docs/design/radar-escopo-2026-11-07.md). Função pura, sem DOM: lê o estado do servidor (E, o mesmo
   que js/orcamento.js desenha), a última simulação das perguntas (o evento bz:preco de js/orcamento-perguntas.js) e a atividade em voo (o Zero
   pensando, o preço sendo calculado) e devolve o que o radar mostra. Script clássico (window.BZEscopoEstado) e CommonJS (os testes), ES5.

   O que não se negocia (provado em docs/testes/planta-escopo-estado.test.mjs):
   - Nenhum número é calculado aqui. O valor é o valor_total que o servidor mandou, ou nada.
   - Nível 1 (identificado) = a simulação, o que o Zero anotou no briefing ou a estimativa que ele gravou; nível 2 (confirmado) = o
     pacote que a PESSOA confirmou (E.estimativa com contato, ou as etapas de depois: as mesmas do passoAtual de js/orcamento.js).
     Com uma estimativa gravada, a simulação (velha) não conta.
   - Mudar as respostas tira a simulação: o que só ela sabia volta a pendente. Contar mensagens não avança nada.
   - "confirmada" (o único ouro) só pela etapa real do pedido; "confirmacao" é a etapa do resumo (escopo).
   - Os textos dos cantos são curtos (cabem em 2 linhas a 320 px): "Agendamento online +2", nunca a lista inteira.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZEscopoEstado = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var congelar = Object.freeze || function (o) { return o; };
  var DIMENSOES = congelar(['entrega', 'escopo', 'integracoes', 'prazo']);
  var MARCOS = congelar(['Briefing', 'Análise', 'Estimativa', 'Proposta', 'Confirmada']);
  var ROTULOS = congelar({
    aguardando: 'Aguardando briefing', identificando: 'Identificando', analise: 'Escopo em análise', estimativa: 'Estimativa preliminar',
    proposta: 'Proposta configurada', confirmacao: 'Aguardando confirmação', confirmada: 'Proposta confirmada'
  });
  var MARCO = congelar({ aguardando: 0, identificando: 0, analise: 1, estimativa: 2, proposta: 3, confirmacao: 4, confirmada: 4 });
  var ETAPAS_CONFIRMADAS = ['aguardando_pagamento', 'em_producao'];
  /* a pessoa confirmou o pacote: deixou o contato (tem_contato) ou o pedido já andou (passoAtual: direcoes, ajustes, escopo, pagamento).
     Só E.estimativa não basta: o Zero também grava estimativa, com a etapa ainda em descoberta/estimativa */
  var ETAPAS_DO_PACOTE = ['gerando', 'direcoes', 'escolhida', 'alteracoes', 'escopo', 'aguardando_pagamento', 'em_producao'];
  var PENDENTE = 'A definir', MAX_TEXTO = 24;

  /* os mesmos nomes da tela das perguntas (js/orcamento-perguntas.js, NOMES; o teste prende os dois juntos) */
  var NOMES_FORMATO = congelar({ landing_page: 'Site de uma página', institucional: 'Site com várias páginas', sob_medida: 'Atelier (site com visual exclusivo)', loja_plataforma: 'Loja virtual' });
  /* as mesmas palavras do "Escolhi por você" das perguntas */
  var ASSUMIDO = congelar({ ramo: 'o seu ramo', objetivos: 'o que o site precisa trazer', site_atual: 'se já tem site', material: 'se já tem logo e textos' });
  /* Integrações: os itens da tabela que ligam o site a outra coisa (agenda, sistema, pagamento, catálogo). Nome curto para o canto */
  var INTEGRACOES = congelar({
    agendamento: 'Agendamento online', formulario_avancado: 'Formulário em etapas', integracao: 'Integração com sistema', integracao_erp: 'Integração com ERP',
    pagamento_extra: 'Pagamento extra', catalogo: 'Catálogo de produtos', marketplace: 'Marketplace', frete_transportadora: 'Frete por transportadora',
    area_cobranca_recorrente: 'Cobrança recorrente'
  });
  /* o que o Zero anota no briefing (api/_vendas/briefing.mjs, FUNCIONALIDADES): de ligação e de conteúdo */
  var FUNC_INTEGRACAO = congelar({ agendamento: 'Agendamento online', whatsapp: 'WhatsApp', formulario: 'Formulário', integracao: 'Integração com sistema', ia: 'Atendente de IA', automacao: 'Automação', catalogo: 'Catálogo de produtos', loja: 'Loja online' });
  var FUNC_ESCOPO = congelar({ blog: 'Blog', area_restrita: 'Área com login', idioma: 'Outro idioma', galeria: 'Galeria', depoimentos: 'Depoimentos' });
  /* a leitura (BZ_PLANTA): as listas fechadas de js/orcamento-planta-forma.js (o teste prende), com os rótulos que o radar antigo escrevia */
  var EIXOS = congelar(['volume', 'repeticao', 'urgencia', 'pessoas', 'informacao']);
  var NIVEIS = congelar(['nao_falou', 'comentou', 'deixou_claro']);
  var ROTULO_EIXO = congelar({ volume: 'Volume', repeticao: 'Repetição', urgencia: 'Urgência', pessoas: 'Depende de pessoas', informacao: 'Informação espalhada' });
  var PALAVRAS_NIVEL = congelar({ comentou: 'comentou', deixou_claro: 'deixou claro' });
  var EVIDENCIA_MAX = 60;

  function proprio(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function objeto(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }
  function lista(v) { return v instanceof Array ? v : null; }
  function naLista(l, v) { for (var i = 0; i < l.length; i++) if (l[i] === v) return true; return false; }
  /* o numérico do servidor (o banco devolve numeric como texto); nada vira zero por acidente */
  function numero(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  /* um número do servidor dentro do plausível (prazo, páginas, percentual): fora disso não vira texto (revisão de segurança) */
  var PLAUSIVEL = 1000;
  function plausivel(v) { var n = numero(v); return n !== null && n > 0 && n <= PLAUSIVEL ? n : null; }
  function curto(t) { return t.length > MAX_TEXTO ? t.slice(0, MAX_TEXTO - 1) + '…' : t; }
  function primeiroMais(nomes) { return nomes.length ? curto(nomes[0]) + (nomes.length > 1 ? ' +' + (nomes.length - 1) : '') : ''; }
  function dias(n) { return n === 1 ? '1 dia útil' : n + ' dias úteis'; }
  function dim(nivel, texto) { return texto ? { nivel: nivel, texto: texto } : null; }

  /* ---------- as fontes: o pedido salvo, a simulação, o briefing ---------- */
  function pacoteConfirmado(E) { return objeto(E) && objeto(E.conversa) && (E.conversa.tem_contato === true || naLista(ETAPAS_DO_PACOTE, E.conversa.etapa)); }
  function doSalvo(E) {
    var e = objeto(E) && objeto(E.estimativa) ? E.estimativa : null;
    if (!e) return null;
    var d = objeto(e.detalhes) ? e.detalhes : e, f = objeto(d.formato) ? d.formato : {};
    var m = objeto(d.multiplicadores) ? d.multiplicadores : {};
    return {
      nivel: pacoteConfirmado(E) ? 2 : 1, comValor: true, chave: typeof f.chave === 'string' ? f.chave : null, nome: typeof f.nome === 'string' ? f.nome : (typeof d.formato === 'string' ? d.formato : null),
      paginas: plausivel(f.paginas_incluidas), itens: lista(d.itens), urgencia: m.urgencia === true,
      prazo: plausivel(proprio(e, 'prazo_dias') ? e.prazo_dias : d.prazo_dias), valor: numero(proprio(e, 'valor_total') ? e.valor_total : d.valor_total)
    };
  }
  function daSimulacao(s) {
    if (!objeto(s)) return null;
    var est = objeto(s.estimativa) ? s.estimativa : null, rec = objeto(s.recomendacao) ? s.recomendacao : {};
    return {
      nivel: 1, chave: typeof s.formato === 'string' ? s.formato : (typeof rec.formato === 'string' ? rec.formato : null),
      nome: est && typeof est.formato === 'string' ? est.formato : null, comValor: !!est,
      paginas: est ? plausivel(s.paginas_incluidas) : null, itens: est ? lista(est.itens) : null, urgencia: s.urgencia === true,
      prazo: est ? plausivel(est.prazo_dias) : null, valor: est ? numero(est.valor_total) : null,
      assumido: lista(rec.assumido) || [], diagnostico: objeto(s.diagnostico) ? lista(s.diagnostico.itens) || [] : [], urgenciaPct: plausivel(s.urgencia_pct)
    };
  }
  function doBriefing(E) {
    var b = objeto(E) && objeto(E.conversa) && objeto(E.conversa.briefing) ? E.conversa.briefing : null;
    if (!b) return null;
    var p = objeto(b.projeto) ? b.projeto : {};
    return { formato: typeof p.formato === 'string' ? p.formato : null, paginas: plausivel(p.paginas), urgencia: p.urgencia === true, funcs: lista(b.funcionalidades) || [] };
  }

  /* ---------- as 4 dimensões, cada uma pela 1ª fonte que sabe ---------- */
  function nomeDoFormato(chave, nome) { return proprio(NOMES_FORMATO, chave) ? NOMES_FORMATO[chave] : (nome ? curto(nome) : ''); }
  function itensValidos(itens) {
    var saida = [];
    for (var i = 0; i < itens.length; i++) if (objeto(itens[i]) && typeof itens[i].chave === 'string') saida.push(itens[i]);
    return saida;
  }
  function textoDoEscopo(paginasIncluidas, itens) {
    if (paginasIncluidas === null && !itens) return '';
    var v = itensValidos(itens || []), extras = 0, a = [], paginas = paginasIncluidas, i, q;
    for (i = 0; i < v.length; i++) {
      if (v[i].chave === 'pagina_extra') { q = numero(v[i].qtd); if (paginas !== null && q) paginas += q; } else if (!proprio(INTEGRACOES, v[i].chave)) extras++;
    }
    if (paginas !== null) a.push(paginas === 1 ? '1 página' : 'Até ' + paginas + ' páginas');
    if (extras) a.push(extras + (extras === 1 ? ' extra' : ' extras'));
    return a.length ? a.join(' · ') : 'Só o pacote';
  }
  function textoDasIntegracoes(itens) {
    if (!itens) return '';
    var v = itensValidos(itens), nomes = [];
    for (var i = 0; i < v.length; i++) if (proprio(INTEGRACOES, v[i].chave)) nomes.push(INTEGRACOES[v[i].chave]);
    return nomes.length ? primeiroMais(nomes) : 'Só as do pacote';
  }
  function textoDoPrazo(prazo, urgencia) { return prazo !== null && prazo > 0 ? dias(prazo) + (urgencia ? ' · com urgência' : '') : ''; }
  function nomesDe(funcs, mapa) {
    var nomes = [];
    for (var i = 0; i < funcs.length; i++) if (typeof funcs[i] === 'string' && proprio(mapa, funcs[i])) nomes.push(mapa[funcs[i]]);
    return nomes;
  }
  function dimDaFonte(f, qual) {
    if (!f) return null;
    if (qual === 'entrega') return dim(f.nivel, nomeDoFormato(f.chave, f.nome));
    if (f.nivel === 1 && !f.comValor) return null;   /* (a simulação sem valor só sabe o formato) */
    if (qual === 'escopo') return dim(f.nivel, textoDoEscopo(f.paginas, f.itens));
    if (qual === 'integracoes') return dim(f.nivel, textoDasIntegracoes(f.itens));
    return dim(f.nivel, textoDoPrazo(f.prazo, f.urgencia));
  }
  function dimDoBriefing(b, qual) {
    if (!b) return null;
    if (qual === 'entrega') return dim(1, b.formato ? nomeDoFormato(b.formato, '') : '');
    if (qual === 'escopo') {
      var partes = [], conteudo = primeiroMais(nomesDe(b.funcs, FUNC_ESCOPO));
      if (b.paginas !== null && b.paginas > 0) partes.push(b.paginas === 1 ? '1 página' : b.paginas + ' páginas');
      if (conteudo) partes.push(conteudo);
      return dim(1, partes.join(' · '));
    }
    if (qual === 'integracoes') return dim(1, primeiroMais(nomesDe(b.funcs, FUNC_INTEGRACAO)));
    return dim(1, b.urgencia ? 'Com urgência' : '');
  }

  /* ---------- os detalhes ---------- */
  function leituraValida(l) {
    if (!objeto(l) || !(l.eixos instanceof Array) || l.eixos.length !== EIXOS.length) return null;
    var por = {}, i, it;
    for (i = 0; i < l.eixos.length; i++) {
      it = l.eixos[i];
      if (!objeto(it) || !naLista(EIXOS, it.eixo) || proprio(por, it.eixo) || !naLista(NIVEIS, it.nivel)) return null;
      if (proprio(it, 'evidencia') && (typeof it.evidencia !== 'string' || !it.evidencia || it.evidencia.length > EVIDENCIA_MAX)) return null;
      por[it.eixo] = it;
    }
    return por;
  }
  /* o que a pessoa contou, com as palavras dela (literais), na ordem fixa dos eixos; "não falou" não entra */
  function contou(E) {
    var por = leituraValida(objeto(E) ? E.leitura : null), saida = [], i, it;
    if (!por) return saida;
    for (i = 0; i < EIXOS.length; i++) {
      it = por[EIXOS[i]];
      if (it.nivel !== 'nao_falou' && it.evidencia) saida.push({ eixo: it.eixo, rotulo: ROTULO_EIXO[it.eixo], nivel: PALAVRAS_NIVEL[it.nivel], evidencia: it.evidencia });
    }
    return saida;
  }
  function aConfirmar(sim) {
    var saida = [], i;
    if (!sim) return saida;
    for (i = 0; i < sim.assumido.length; i++) if (proprio(ASSUMIDO, sim.assumido[i])) saida.push(ASSUMIDO[sim.assumido[i]]);
    for (i = 0; i < sim.diagnostico.length; i++) if (typeof sim.diagnostico[i] === 'string') saida.push('Pede conversa com a equipe: ' + sim.diagnostico[i]);
    return saida;
  }
  /* só enquanto o preço está aberto nas perguntas (a tela tem os extras e a urgência) */
  function podeMudar(sim) {
    if (!sim || !sim.comValor) return [];
    var urg = sim.urgencia ? 'Tirar a urgência: o valor e o prazo voltam aos da tabela'
      : sim.urgenciaPct !== null && sim.urgenciaPct > 0 ? 'Precisar antes do prazo: +' + sim.urgenciaPct + '% no valor' : 'Precisar antes do prazo (acréscimo da tabela)';
    return [urg, 'Mais páginas ou extras que você escolher abaixo do preço'];
  }

  /* ---------- o estado ---------- */
  function etapaDe(E) { return objeto(E) && objeto(E.conversa) && typeof E.conversa.etapa === 'string' ? E.conversa.etapa : ''; }
  function estadoDoEscopo(E, simulacao, atividade) {
    var at = objeto(atividade) ? atividade : {}, ativo = at.zero === true || at.preco === true;
    var salvo = doSalvo(E), sim = salvo ? null : daSimulacao(simulacao), b = doBriefing(E), et = etapaDe(E);
    var dims = {}, algum = false, i, q, d;
    for (i = 0; i < DIMENSOES.length; i++) {
      q = DIMENSOES[i];
      d = dimDaFonte(salvo, q) || dimDaFonte(sim, q) || dimDoBriefing(b, q) || { nivel: 0, texto: PENDENTE };
      dims[q] = d;
      if (d.nivel > 0) algum = true;
    }
    var estado = naLista(ETAPAS_CONFIRMADAS, et) || (et === 'encerrada' && !!E.entrega) ? 'confirmada'
      : et === 'escopo' ? 'confirmacao'
        : salvo && salvo.nivel === 2 ? 'proposta'
          : (salvo || sim) && (salvo || sim).valor !== null ? 'estimativa'
            : algum ? 'analise' : ativo ? 'identificando' : 'aguardando';
    /* o valor e DE ONDE ele veio: "Proposta atualizada" só compara valores da mesma fonte (trocar de fonte não é atualizar) */
    var valor = null, fonte = null, daProposta = objeto(E) && objeto(E.proposta) ? numero(E.proposta.valor_total) : null;
    if ((estado === 'confirmada' || estado === 'confirmacao') && daProposta !== null) { valor = daProposta; fonte = 'proposta'; }
    else if (salvo && estado !== 'aguardando' && estado !== 'identificando' && estado !== 'analise') { valor = salvo.valor; fonte = 'estimativa'; }
    else if (estado === 'estimativa') { valor = sim.valor; fonte = 'simulacao'; }
    if (valor === null) fonte = null;
    return {
      estado: estado, rotulo: ROTULOS[estado], marco: MARCO[estado], valor: valor, fonteValor: fonte, ouro: estado === 'confirmada', ativo: ativo, dims: dims,
      detalhes: { aConfirmar: aConfirmar(sim), podeMudar: estado === 'estimativa' ? podeMudar(sim) : [], contou: contou(E) }
    };
  }

  function semAtividade(st) { var c = {}, k; for (k in st) if (proprio(st, k) && k !== 'ativo') c[k] = st[k]; return c; }
  /* o que mudou de um desenho para o outro (o que a tela anima); sem anterior (a 1ª vez, a volta à página), nada anima */
  function transicao(a, b) {
    var subiram = [], desceram = [], i, q;
    if (objeto(a) && objeto(b) && objeto(a.dims) && objeto(b.dims)) {
      for (i = 0; i < DIMENSOES.length; i++) {
        q = DIMENSOES[i];
        if (!a.dims[q] || !b.dims[q]) continue;
        if (b.dims[q].nivel > a.dims[q].nivel) subiram.push(q); else if (b.dims[q].nivel < a.dims[q].nivel) desceram.push(q);
      }
    }
    var tem = objeto(a) && objeto(b);
    /* só a atividade mudou (o preço chegou e, no mesmo instante, a conta terminou): a tela troca o ponteiro e não mexe no resto */
    var soAtividade = tem && a.ativo !== b.ativo && JSON.stringify(semAtividade(a)) === JSON.stringify(semAtividade(b));
    return {
      atualizada: tem && a.valor !== null && b.valor !== null && a.valor !== b.valor && a.fonteValor === b.fonteValor, soAtividade: soAtividade,
      subiram: subiram, desceram: desceram, marcoMudou: tem && a.marco !== b.marco, virouOuro: tem && !a.ouro && b.ouro === true
    };
  }

  return {
    estadoDoEscopo: estadoDoEscopo, transicao: transicao, DIMENSOES: DIMENSOES, MARCOS: MARCOS, ROTULOS: ROTULOS, NOMES_FORMATO: NOMES_FORMATO,
    EIXOS: EIXOS, NIVEIS: NIVEIS, PENDENTE: PENDENTE
  };
});
