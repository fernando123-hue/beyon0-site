/* ==========================================================================
   ORÇAMENTO COM IA — a página (/orcamento). A tela segue o ESTADO que o
   servidor devolve (etapa, mensagens, estimativa, direções, escolha,
   alterações, proposta, pagamentos): recarregar a página, sair e voltar ou
   abrir em outra aba dá no mesmo lugar. Os números (valor, sinal, prazo)
   vêm sempre do motor de preço pelo servidor; aqui só se formata.
   Todo texto entra por textContent (nada de innerHTML com dado de fora).
   ========================================================================== */
(function () {
  'use strict';
  var API = window.BZOrcamento, PV = window.BZPrevia;
  if (!API || !PV) return;
  var $ = function (id) { return document.getElementById(id); };
  var RECUPERACAO = 'Não consegui concluir a análise neste momento. Suas informações foram preservadas. Vamos continuar de onde paramos.';
  var NOMES = { conversao: 'Conversão', autoridade: 'Autoridade', experiencia: 'Experiência' };
  var ESPERA_MS = 5000, ESPERA_MAX_MS = 15 * 60e3;
  var E = null;                 /* o último estado do servidor */
  var pediuContato = false, restaurado = false;
  var gerando = {};             /* direções que ESTA aba está pedindo (não pedir duas vezes) */
  var inicioGeracao = {};
  var ultimaAcao = null;        /* o que "Tentar de novo" repete */
  var espera = null;

  var dinheiro = function (n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function mostrar(id, sim) { $(id).hidden = !sim; }

  /* ---------- aviso (falha, limite, recuperação) ---------- */
  function avisar(msg, acao) {
    ultimaAcao = acao || null;
    $('o-aviso-texto').textContent = msg;
    $('o-tentar').hidden = !acao;
    mostrar('o-aviso', true);
  }
  function limparAviso() { mostrar('o-aviso', false); ultimaAcao = null; }
  function mensagemDe(e) {
    if (e && e.status === 0) return e.message;
    if (e && e.status === 503 && e.dados && e.dados.recuperavel) return RECUPERACAO;
    return (e && e.message) || RECUPERACAO;
  }
  $('o-tentar').addEventListener('click', function () { var a = ultimaAcao; limparAviso(); if (a) a(); });

  /* ---------- a conversa ---------- */
  function msg(papel, texto) {
    var li = el('li', 'msg msg--' + papel);
    li.appendChild(el('p', '', texto));
    $('o-log').appendChild(li);
    $('o-log').scrollTop = $('o-log').scrollHeight;
    return li;
  }
  function pensando(sim) { mostrar('o-pensando', sim); $('o-form').setAttribute('aria-busy', sim ? 'true' : 'false'); $('o-enviar').disabled = sim; }

  async function enviar(texto) {
    limparAviso();
    var minha = msg('visitante', texto);
    $('o-atalhos').hidden = true;
    pensando(true);
    try {
      var r = await API.mensagem(texto);
      msg('agente', r.resposta || 'Entendi.');
      if (r.estimativa) investimento(r.estimativa, true);
      if (r.sugestoes_ia && r.sugestoes_ia.length) sugestao(r.sugestoes_ia[0]);
      if (r.diagnostico) mostrar('o-diagnostico', true);
      if (r.pedir_contato) pediuContato = true;
      await recarregar();
      if (r.pedir_contato) $('o-contato').scrollIntoView({ block: 'start' });
    } catch (e) {
      minha.remove();               /* não ficou gravada: volta para a caixa */
      $('o-texto').value = texto;
      avisar(mensagemDe(e), e.status === 429 ? null : function () { $('o-texto').value = ''; enviar(texto); });
    } finally { pensando(false); }
  }
  $('o-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = $('o-texto').value.trim();
    if (!t) return;
    $('o-texto').value = '';
    enviar(t.slice(0, 2000));
  });
  $('o-texto').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); $('o-form').requestSubmit(); }
  });
  [].forEach.call(document.querySelectorAll('[data-atalho]'), function (b) {
    b.addEventListener('click', function () { enviar(b.getAttribute('data-atalho')); });
  });

  /* ---------- o investimento (o cartão do motor de preço) ---------- */
  function cartaoDe(est) {
    var d = est.detalhes || est;
    return { formato: d.formato && d.formato.nome ? d.formato.nome : d.formato, valor_total: d.valor_total, sinal: d.sinal, prazo_dias: d.prazo_dias, itens: d.itens || [], fase_seguinte: d.fase_seguinte || null };
  }
  function lista(ul, itens) {
    ul.textContent = '';
    itens.forEach(function (i) { ul.appendChild(el('li', '', i.nome + (i.qtd > 1 ? ' × ' + i.qtd : ''))); });
  }
  function investimento(est, novo) {
    var c = cartaoDe(est);
    if (c.valor_total == null) return;
    mostrar('o-est-vazio', false);
    mostrar('o-est-cheio', true);
    $('o-est-formato').textContent = c.formato || '';
    var v = $('o-est-valor');
    if (v.textContent !== dinheiro(c.valor_total) && novo) { v.classList.remove('is-novo'); void v.offsetWidth; v.classList.add('is-novo'); }
    v.textContent = dinheiro(c.valor_total);
    $('o-est-prazo').textContent = c.prazo_dias + (c.prazo_dias === 1 ? ' dia' : ' dias');
    $('o-est-sinal').textContent = dinheiro(c.sinal);
    $('o-est-resto').textContent = dinheiro(Number(c.valor_total) - Number(c.sinal));
    lista($('o-est-itens'), c.itens);
    var f = c.fase_seguinte;
    mostrar('o-est-fase', !!(f && f.itens && f.itens.length));
    if (f && f.itens) {
      lista($('o-est-fase-itens'), f.itens);
      $('o-est-fase-valor').textContent = 'Estimativa da fase seguinte: ' + dinheiro(f.valor_estimado) + '. O prazo máximo de cada fase é de 10 dias.';
    }
  }
  function sugestao(s) {
    $('o-sugestao-ideia').textContent = s.ideia;
    $('o-sugestao-motivo').textContent = s.motivo || '';
    mostrar('o-sugestao', true);
  }

  /* ---------- o contato ---------- */
  $('o-contato-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var erro = $('o-contato-erro');
    var dados = { nome: $('o-nome').value.trim(), telefone: $('o-tel').value.trim(), email: $('o-email').value.trim(), aceite: $('o-aceite').checked };
    if (dados.nome.length < 2) { erro.textContent = 'Informe seu nome.'; $('o-nome').focus(); return; }
    if (!dados.telefone && !dados.email) { erro.textContent = 'Informe o WhatsApp ou o e-mail.'; $('o-tel').focus(); return; }
    if (!dados.aceite) { erro.textContent = 'É preciso concordar com o uso dos dados para receber as propostas.'; $('o-aceite').focus(); return; }
    if (!dados.telefone) delete dados.telefone;
    if (!dados.email) delete dados.email;
    erro.textContent = '';
    this.setAttribute('aria-busy', 'true');
    try {
      await API.contato(dados);
      await gerarTodas();
    } catch (e) { erro.textContent = mensagemDe(e); }
    finally { this.removeAttribute('aria-busy'); }
  });

  /* ---------- as três direções ---------- */
  async function gerarTodas() {
    limparAviso();
    try {
      await API.gerar();
      await recarregar();
      $('o-direcoes').scrollIntoView({ block: 'start' });
    } catch (e) { avisar(mensagemDe(e), e.status === 409 || e.status === 429 ? null : gerarTodas); }
  }
  async function pedirDirecao(id) {
    if (gerando[id]) return;
    gerando[id] = true;
    inicioGeracao[id] = inicioGeracao[id] || Date.now();
    try {
      var r = await API.gerarDirecao(id);
      if (r.status === 'em_andamento') esperar();
    } catch (e) { /* o estado mostra "falhou" se for o caso */ }
    gerando[id] = false;
    await recarregar().catch(function () {});
  }
  function tempo(id) {
    var s = Math.max(0, Math.round((Date.now() - (inicioGeracao[id] || Date.now())) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function miniatura(conteudo) {
    var tela = el('div', 'pv-tela');
    tela.appendChild(PV.desenhar(conteudo));
    return tela;
  }
  function cartaoDirecao(d) {
    var li = el('li', 'dir');
    var escolhida = E.escolha && E.escolha.direcao_id === d.id;
    if (escolhida) li.classList.add('is-escolhida');
    var mini = el('div', 'dir__mini');
    var corpo = el('div', 'dir__corpo');
    corpo.appendChild(el('p', 'dir__estrategia', String(d.numero).padStart(2, '0') + ' · ' + (NOMES[d.estrategia] || d.estrategia)));
    if (d.status === 'pronta' && d.conteudo) {
      var tela = miniatura(d.conteudo);
      mini.appendChild(tela);
      mini.setAttribute('aria-hidden', 'true');
      mini.addEventListener('click', function () { abrirVisor(d.id); });
      corpo.appendChild(el('h3', 'dir__nome', d.conteudo.nome_conceito));
      corpo.appendChild(el('p', 'dir__resumo', d.conteudo.resumo));
      var acoes = el('div', 'dir__acoes');
      var abrir = el('button', 'btn btn--sm', 'Abrir prévia');
      abrir.type = 'button';
      abrir.addEventListener('click', function () { abrirVisor(d.id); });
      acoes.appendChild(abrir);
      if (podeEscolher()) {
        var esc = el('button', 'btn btn--sm' + (escolhida ? ' btn--ghost' : ' btn--primary'), escolhida ? 'Escolhida' : 'Escolher esta');
        esc.type = 'button';
        esc.disabled = escolhida;
        esc.addEventListener('click', function () { escolher(d.id); });
        acoes.appendChild(esc);
      }
      corpo.appendChild(acoes);
    } else if (d.status === 'falhou') {
      var p = el('div', 'dir__progresso');
      p.appendChild(el('p', '', 'Esta direção não saiu desta vez.'));
      mini.appendChild(p);
      corpo.appendChild(el('p', 'dir__resumo', 'Você pode gerar as três de novo ou seguir com as que ficaram prontas.'));
      var de = el('button', 'btn btn--sm', 'Gerar de novo');
      de.type = 'button';
      de.addEventListener('click', gerarTodas);
      corpo.appendChild(de);
    } else {
      var g = el('div', 'dir__progresso');
      g.appendChild(el('p', '', 'Desenhando a direção de ' + (NOMES[d.estrategia] || '').toLowerCase() + '…'));
      g.appendChild(el('span', 'orc-pensando__fio'));
      var t = el('p', 'dir__tempo', tempo(d.id));
      t.setAttribute('data-tempo', d.id);
      g.appendChild(t);
      mini.appendChild(g);
      corpo.appendChild(el('p', 'dir__resumo', 'Pode continuar conversando ou sair: o progresso fica salvo.'));
    }
    li.appendChild(mini);
    li.appendChild(corpo);
    return li;
  }
  var podeEscolher = function () { return ['direcoes', 'escolhida', 'alteracoes'].indexOf(E.conversa.etapa) >= 0; };
  setInterval(function () { [].forEach.call(document.querySelectorAll('[data-tempo]'), function (t) { t.textContent = tempo(t.getAttribute('data-tempo')); }); }, 1000);

  async function escolher(id) {
    limparAviso();
    try { await API.escolher(id); fecharVisor(); await recarregar(); $('o-ajustes').scrollIntoView({ block: 'start' }); }
    catch (e) { avisar(mensagemDe(e), function () { escolher(id); }); }
  }

  /* ---------- o visor: abrir, navegar, comparar ---------- */
  var visor = { id: null, largura: 390, origem: null };
  function prontas() {
    var l = E.direcoes.filter(function (d) { return d.status === 'pronta' && d.conteudo; });
    if (E.versao_final) l = l.concat([{ id: 'final', numero: 0, estrategia: 'final', conteudo: E.versao_final }]);
    return l;
  }
  function desenharVisor() {
    var lista = prontas();
    var d = lista.filter(function (x) { return x.id === visor.id; })[0] || lista[0];
    if (!d) return fecharVisor();
    visor.id = d.id;
    $('o-visor-titulo').textContent = d.id === 'final' ? 'Sua versão, com os ajustes' : 'Direção ' + d.numero + ' · ' + (NOMES[d.estrategia] || '') + ' · ' + d.conteudo.nome_conceito;
    $('o-visor-resumo').textContent = d.conteudo.resumo || '';
    var abas = $('o-visor-abas');
    abas.textContent = '';
    lista.forEach(function (x) {
      var b = el('button', 'chip', x.id === 'final' ? 'Sua versão' : String(x.numero));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(x.id === d.id));
      if (x.id !== 'final') b.setAttribute('aria-label', 'Direção ' + x.numero + ': ' + (NOMES[x.estrategia] || ''));
      b.addEventListener('click', function () { visor.id = x.id; desenharVisor(); });
      abas.appendChild(b);
    });
    var esc = $('o-visor-escolher');
    esc.hidden = d.id === 'final' || !podeEscolher() || (E.escolha && E.escolha.direcao_id === d.id);
    var palco = $('o-visor-palco');
    palco.textContent = '';
    var janela = el('div', 'visor__janela visor__janela--' + visor.largura);
    var tela = el('div', 'pv-tela' + (visor.largura === 1280 ? ' pv-tela--1280' : ''));
    tela.appendChild(PV.desenhar(d.conteudo));
    janela.appendChild(tela);
    palco.appendChild(janela);
    palco.scrollTop = 0;
    PV.encaixar(janela, tela, visor.largura, true);   /* (síncrono: mede o layout já; rAF não roda em aba oculta) */
  }
  function abrirVisor(id) {
    visor.id = id;
    visor.origem = document.activeElement;
    mostrar('o-visor', true);
    document.documentElement.classList.add('visor-aberto');
    desenharVisor();
    $('o-visor-fechar').focus();
  }
  function fecharVisor() {
    if ($('o-visor').hidden) return;
    mostrar('o-visor', false);
    document.documentElement.classList.remove('visor-aberto');
    if (visor.origem && visor.origem.focus) visor.origem.focus();
  }
  $('o-visor-fechar').addEventListener('click', fecharVisor);
  $('o-visor-escolher').addEventListener('click', function () { escolher(visor.id); });
  [].forEach.call(document.querySelectorAll('[data-aparelho]'), function (b) {
    b.addEventListener('click', function () {
      visor.largura = Number(b.getAttribute('data-aparelho'));
      [].forEach.call(document.querySelectorAll('[data-aparelho]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      desenharVisor();
    });
  });
  document.addEventListener('keydown', function (ev) {
    if ($('o-visor').hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); fecharVisor(); return; }
    if (ev.key !== 'Tab') return;   /* o foco fica dentro do visor */
    var f = [].filter.call($('o-visor').querySelectorAll('button:not([hidden]), [tabindex="0"]'), function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  });
  function encaixarMinis() { [].forEach.call(document.querySelectorAll('.dir__mini'), function (m) { var t = m.querySelector('.pv-tela'); if (t) PV.encaixar(m, t, 390); }); }
  window.addEventListener('resize', function () { encaixarMinis(); if (!$('o-visor').hidden) desenharVisor(); });

  /* ---------- ajustes ---------- */
  $('o-aj-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var pedido = $('o-aj-texto').value.trim();
    if (!pedido) return;
    var form = this;
    form.setAttribute('aria-busy', 'true');
    limparAviso();
    try {
      var r = await API.alterar(pedido.slice(0, 2000));
      $('o-aj-texto').value = '';
      if (r.estimativa) investimento(r.estimativa, true);
      if (r.diagnostico) mostrar('o-diagnostico', true);
      if (r.resposta) msg('agente', r.resposta);
      await recarregar();
    } catch (e) { avisar(mensagemDe(e)); }
    finally { form.removeAttribute('aria-busy'); }
  });
  var OPERACOES = { usar_paleta_de: 'Cores de outra direção', usar_tipografia_de: 'Fontes de outra direção', cor: 'Cor trocada', tipografia: 'Fontes trocadas', tema: 'Tema claro/escuro', mover_antes_de: 'Seção movida', mover_depois_de: 'Seção movida', remover_secao: 'Seção removida', adicionar_secao: 'Seção adicionada', trocar_texto: 'Texto trocado', trocar_cta_menu: 'Botão do menu trocado', adicional: 'Item adicionado ao escopo', paginas: 'Número de páginas', outro: 'Pedido' };
  function mudancas() {
    var ul = $('o-mudancas');
    ul.textContent = '';
    E.alteracoes.forEach(function (a) {
      (a.mudancas || []).forEach(function (m) {
        var li = el('li', m.aplicada ? 'is-ok' : 'is-nao', (OPERACOES[m.operacao] || m.operacao) + (m.aplicada ? '' : ': ' + (m.motivo || 'não foi possível')));
        ul.appendChild(li);
      });
    });
    var v = $('o-versao');
    v.textContent = '';
    if (E.versao_final) {
      var b = el('button', 'btn btn--sm', 'Abrir a sua versão');
      b.type = 'button';
      b.addEventListener('click', function () { abrirVisor('final'); });
      v.appendChild(b);
    }
  }
  $('o-fechar-escopo').addEventListener('click', async function () {
    limparAviso();
    try { await API.escopo(); await recarregar(); $('o-escopo').scrollIntoView({ block: 'start' }); }
    catch (e) { avisar(mensagemDe(e)); }
  });

  /* ---------- escopo e confirmação ---------- */
  $('o-esc-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var erro = $('o-esc-erro');
    if (!$('o-confirmo').checked) { erro.textContent = 'Marque a confirmação do escopo.'; $('o-confirmo').focus(); return; }
    erro.textContent = '';
    var form = this;
    form.setAttribute('aria-busy', 'true');
    try { await API.confirmar(E.proposta.id, $('o-inicio').checked); await recarregar(); $('o-pagamento').scrollIntoView({ block: 'start' }); }
    catch (e) { erro.textContent = mensagemDe(e); }
    finally { form.removeAttribute('aria-busy'); }
  });

  /* ---------- pagamento do sinal ---------- */
  $('o-pagar').addEventListener('click', async function () {
    var st = $('o-pag-status');
    st.textContent = 'Preparando o pagamento…';
    try {
      var r = await API.pagar();
      if (r.link) {
        var janela = window.open(r.link, '_blank', 'noopener');
        st.textContent = 'Aguardando a confirmação do pagamento. ';
        var a = el('a', '', janela ? 'Abrir o pagamento de novo' : 'Abrir o pagamento');
        a.href = r.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
        st.appendChild(a);
      } else st.textContent = 'Aguardando a confirmação do pagamento.';
      esperar();
    } catch (e) { st.textContent = mensagemDe(e); }
  });

  /* ---------- o estado manda na tela ---------- */
  function passoAtual() {
    var et = E.conversa.etapa;
    if (et === 'aguardando_pagamento' || et === 'em_producao') return 'pagamento';
    if (et === 'escopo') return 'escopo';
    if (et === 'escolhida' || et === 'alteracoes') return 'ajustes';
    if (et === 'gerando' || et === 'direcoes' || E.conversa.tem_contato) return 'direcoes';
    if (E.estimativa) return 'estimativa';
    return 'conversa';
  }
  function etapas() {
    var atual = passoAtual(), passou = true;
    [].forEach.call(document.querySelectorAll('#o-etapas li'), function (li) {
      var eh = li.getAttribute('data-passo') === atual;
      if (eh) passou = false;
      li.classList.toggle('is-feita', passou);
      if (eh) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    var ol = $('o-etapas'), cur = ol.querySelector('[aria-current]');
    if (cur && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = Math.max(0, cur.offsetLeft - ol.offsetLeft - 16);   /* celular: a etapa atual à vista */
  }
  function conversa() {
    var log = $('o-log');
    var primeira = log.firstElementChild;
    log.textContent = '';
    if (primeira) log.appendChild(primeira);
    E.mensagens.forEach(function (m) { msg(m.papel === 'agente' ? 'agente' : 'visitante', m.conteudo); });
    $('o-atalhos').hidden = E.mensagens.length > 0;
  }
  function render() {
    var et = E.conversa.etapa;
    etapas();
    if (E.estimativa) investimento(E.estimativa, false);
    mostrar('o-contato', !E.conversa.tem_contato && !!E.estimativa && (pediuContato || restaurado));
    var temDirecoes = E.direcoes.length > 0;
    mostrar('o-direcoes', temDirecoes || (E.conversa.tem_contato && et === 'contato'));
    var ul = $('o-dirs');
    ul.textContent = '';
    if (temDirecoes) { E.direcoes.forEach(function (d) { ul.appendChild(cartaoDirecao(d)); }); encaixarMinis(); }
    else if (E.conversa.tem_contato) {
      var b = el('button', 'btn btn--primary', 'Gerar as três direções');
      b.type = 'button';
      b.addEventListener('click', gerarTodas);
      ul.appendChild(b);
    }
    E.direcoes.forEach(function (d) { if (d.status === 'gerando') pedirDirecao(d.id); });
    mostrar('o-ajustes', et === 'escolhida' || et === 'alteracoes');
    mudancas();
    var temProposta = !!(E.proposta && et === 'escopo');
    mostrar('o-escopo', temProposta);
    if (temProposta) $('o-esc-texto').textContent = E.proposta.escopo;
    mostrar('o-pagamento', et === 'aguardando_pagamento');
    if (et === 'aguardando_pagamento' && E.proposta) {
      var sinal = Number(E.proposta.valor_total) * Number(E.proposta.sinal_percentual) / 100;
      $('o-pag-lead').textContent = 'Escopo confirmado: ' + dinheiro(E.proposta.valor_total) + ' em ' + E.proposta.prazo_dias + ' dias. Para começar, o sinal de ' + E.proposta.sinal_percentual + '%: ' + dinheiro(sinal) + '. O restante na entrega.';
      $('o-pagar').textContent = 'Pagar o sinal de ' + dinheiro(sinal);
    }
    mostrar('o-pronto', et === 'em_producao');
    if (et === 'em_producao') pararEspera();
    if (!$('o-visor').hidden) desenharVisor();
  }
  async function recarregar() {
    E = await API.estado();
    render();
    if (E.conversa.etapa === 'gerando' || E.conversa.etapa === 'aguardando_pagamento') esperar();
    return E;
  }

  /* espera pelo que acontece fora desta aba (direção feita por outro pedido, aviso do pagamento) */
  function esperar() {
    if (espera) return;
    var inicio = Date.now();
    espera = setInterval(async function () {
      if (document.hidden) return;
      if (Date.now() - inicio > ESPERA_MAX_MS) return pararEspera();
      try {
        await recarregar();
        if (E.conversa.etapa !== 'gerando' && E.conversa.etapa !== 'aguardando_pagamento') pararEspera();
      } catch (e) { /* tenta na próxima */ }
    }, ESPERA_MS);
  }
  function pararEspera() { clearInterval(espera); espera = null; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && API.temSessao() && E && E.conversa.etapa === 'aguardando_pagamento') recarregar().catch(function () {}); });

  /* ---------- começo: retoma a conversa salva neste aparelho ---------- */
  async function retomar() {
    if (!API.temSessao()) return;
    restaurado = true;
    try {
      await recarregar();
      conversa();
      var BLOCOS = { direcoes: 'o-direcoes', ajustes: 'o-ajustes', escopo: 'o-escopo', pagamento: E.conversa.etapa === 'em_producao' ? 'o-pronto' : 'o-pagamento' };
      var alvo = BLOCOS[passoAtual()];
      if (alvo && !$(alvo).hidden) $(alvo).scrollIntoView({ block: 'start' });   /* quem volta cai na etapa em que parou */
    } catch (e) {
      if (e.status === 401 || e.status === 404 || e.status === 400) { API.esquecer(); return; }
      avisar(mensagemDe(e), retomar);
    }
  }
  retomar();
})();
