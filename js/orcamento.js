/* ==========================================================================
   ORÇAMENTO COM IA — a página (/orcamento). A tela segue o ESTADO que o
   servidor devolve (etapa, mensagens, estimativa, direções, escolha,
   alterações, proposta, pagamentos): recarregar, sair e voltar ou abrir em
   outra aba dá no mesmo lugar. Os números (valor, sinal, prazo) vêm sempre
   do motor de preço pelo servidor; aqui só se formata.
   Todo texto entra por textContent (nada de innerHTML com dado de fora).
   Regras da revisão (2026-10-07): nada é redesenhado se não mudou (foco e
   rolagem ficam); um pedido por vez; respostas velhas são descartadas; a
   espera não morre em silêncio; o aviso de erro vai para onde a pessoa vê.
   ========================================================================== */
(function () {
  'use strict';
  var API = window.BZOrcamento, PV = window.BZPrevia;
  if (!API || !PV || !window.BZVisor) return;
  var $ = function (id) { return document.getElementById(id); };
  var RECUPERACAO = 'Não consegui concluir a análise neste momento. Suas informações foram preservadas. Vamos continuar de onde paramos.';
  var NOMES = { conversao: 'Conversão', autoridade: 'Autoridade', experiencia: 'Experiência' };
  var CONVERSA_ABERTA = ['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes'];
  var ESPERA_MS = 5000, ESPERA_MAX_MS = 15 * 60e3, REPEDIR_MS = 60e3;
  var E = null;                 /* o último estado do servidor */
  var seq = 0, emVoo = null;    /* respostas fora de ordem: só a mais nova vale */
  var pedindo = {};             /* direção → até quando NÃO pedir de novo (posse de outro pedido) */
  var inicioGeracao = {};
  var assinaturas = {};         /* bloco → o que foi desenhado (não refaz o que não mudou) */
  var ultimaAcao = null, espera = null, relogio = null, enviando = false;

  var dinheiro = function (n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function mostrar(id, sim) { $(id).hidden = !sim; }
  function mudou(bloco, dados) { var s = JSON.stringify(dados); if (assinaturas[bloco] === s) return false; assinaturas[bloco] = s; return true; }

  /* ---------- aviso (falha, limite, recuperação): vai para a vista e recebe o foco ---------- */
  function avisar(msg, acao) {
    ultimaAcao = acao || null;
    $('o-aviso-texto').textContent = msg;
    $('o-tentar').hidden = !acao;
    mostrar('o-aviso', true);
    $('o-aviso').scrollIntoView({ block: 'center' });
    $('o-aviso').focus({ preventScroll: true });
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
  function ocupado(sim) { enviando = sim; mostrar('o-pensando', sim); $('o-form').setAttribute('aria-busy', String(sim)); $('o-enviar').disabled = sim; }

  async function enviar(texto) {
    if (enviando) return;   /* (Enter repetido não manda dois turnos) */
    limparAviso();
    var minha = msg('visitante', texto);
    $('o-atalhos').hidden = true;
    ocupado(true);
    var r;
    try { r = await API.mensagem(texto); }
    catch (e) {
      minha.remove();               /* não ficou gravada: volta para a caixa */
      $('o-texto').value = texto;
      ocupado(false);
      avisar(mensagemDe(e), e.status === 429 || e.status === 409 ? null : function () { $('o-texto').value = ''; enviar(texto); });
      return;
    }
    ocupado(false);
    msg('agente', r.resposta || 'Entendi.');
    if (r.estimativa) investimento(r.estimativa, true);
    if (r.sugestoes_ia && r.sugestoes_ia.length) sugestao(r.sugestoes_ia[0]);
    if (r.diagnostico) mostrar('o-diagnostico', true);
    try { await recarregar(); } catch (e) { /* o turno já está gravado; a espera ou a próxima ação atualizam */ }
    if (r.pedir_contato && !$('o-contato').hidden) $('o-contato').scrollIntoView({ block: 'start' });
  }
  $('o-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = $('o-texto').value.trim();
    if (!t || enviando) return;
    $('o-texto').value = '';
    enviar(t.slice(0, 2000));
  });
  $('o-texto').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); if (!enviando) $('o-form').requestSubmit(); }
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
    if (c.valor_total == null || !mudou('investimento', c)) return;
    mostrar('o-est-vazio', false);
    mostrar('o-est-cheio', true);
    $('o-est-formato').textContent = c.formato || '';
    var v = $('o-est-valor');
    if (novo) { v.classList.remove('is-novo'); void v.offsetWidth; v.classList.add('is-novo'); }
    v.textContent = dinheiro(c.valor_total);
    $('o-est-prazo').textContent = c.prazo_dias + (c.prazo_dias === 1 ? ' dia' : ' dias');
    $('o-est-sinal').textContent = dinheiro(c.sinal);
    $('o-est-resto').textContent = dinheiro(Number(c.valor_total) - Number(c.sinal));
    lista($('o-est-itens'), c.itens);
    var f = c.fase_seguinte;
    mostrar('o-est-fase', !!(f && f.itens && f.itens.length));
    if (f && f.itens) {
      lista($('o-est-fase-itens'), f.itens);
      $('o-est-fase-valor').textContent = 'Estimativa da fase seguinte: ' + dinheiro(f.valor_estimado) + '.';
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
    var form = this, erro = $('o-contato-erro');
    if (form.getAttribute('aria-busy') === 'true') return;
    var dados = { nome: $('o-nome').value.trim(), telefone: $('o-tel').value.trim(), email: $('o-email').value.trim(), aceite: $('o-aceite').checked };
    if (dados.nome.length < 2) { erro.textContent = 'Informe seu nome.'; $('o-nome').focus(); return; }
    if (!dados.telefone && !dados.email) { erro.textContent = 'Informe o WhatsApp ou o e-mail.'; $('o-tel').focus(); return; }
    if (manual() && !dados.telefone) { erro.textContent = 'Informe seu WhatsApp: é por ele que avisamos quando as direções ficarem prontas.'; $('o-tel').focus(); return; }
    if (!dados.aceite) { erro.textContent = 'É preciso concordar com o uso dos dados para receber as propostas.'; $('o-aceite').focus(); return; }
    if (!dados.telefone) delete dados.telefone;
    if (!dados.email) delete dados.email;
    erro.textContent = '';
    form.setAttribute('aria-busy', 'true');
    try { await API.contato(dados); }
    catch (e) { erro.textContent = mensagemDe(e); form.removeAttribute('aria-busy'); return; }
    form.removeAttribute('aria-busy');
    await gerarTodas();
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
  /* pede UMA direção. "em_andamento" = outro pedido tem a posse: não insiste (a espera de 5 s acompanha);
     tenta de novo só depois de um minuto, caso a posse tenha caído */
  async function pedirDirecao(id) {
    if (pedindo[id] && pedindo[id] > Date.now()) return;
    pedindo[id] = Infinity;
    inicioGeracao[id] = inicioGeracao[id] || Date.now();
    try {
      var r = await API.gerarDirecao(id);
      if (r.status === 'em_andamento') { pedindo[id] = Date.now() + REPEDIR_MS; esperar(); return; }
      pedindo[id] = 0;
      await recarregar().catch(function () {});
    } catch (e) {
      pedindo[id] = Date.now() + REPEDIR_MS;
      if (e.status === 429 || e.status === 503) avisar(mensagemDe(e));
      esperar();
    }
  }
  function tempo(id) {
    var s = Math.max(0, Math.round((Date.now() - (inicioGeracao[id] || Date.now())) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  /* FILA MANUAL (decisão do dono, 2026-10-08): as direções são feitas pela Beyon Zero em até 24 horas úteis e o aviso
     vai pelo WhatsApp; a página não pede a geração nem fica consultando: confere de novo quando a pessoa volta */
  var manual = function () { return !!E && E.modo_direcoes === 'manual'; };
  var TEXTOS_MANUAL = {
    contato: 'Com o seu contato, a Beyon Zero desenha três direções de site para o seu negócio: uma focada em conversão, uma em autoridade e uma em experiência. Ficam prontas em até 24 horas úteis, e avisamos pelo seu WhatsApp.',
    direcoes: 'Mesmo briefing, três estratégias. Ficam prontas em até 24 horas úteis e avisamos pelo seu WhatsApp; é só voltar a esta página, neste aparelho, para abrir, comparar e escolher.',
    prontas: 'Mesmo briefing, três estratégias. Abra cada uma, compare e escolha a que mais tem a cara do seu negócio.'
  };
  function textosDoModo() {
    if (!manual() || !mudou('modo', 'manual')) return;
    $('o-contato-lead').textContent = TEXTOS_MANUAL.contato;
    var opcional = document.querySelector('label[for="o-email"] .orc-opcional');
    if (opcional) opcional.textContent = '(opcional)';
    $('o-tel').required = true;
  }
  var podeEscolher = function () { return E && (E.conversa.etapa === 'direcoes' || E.conversa.etapa === 'escolhida'); };   /* (o servidor trava a troca depois do 1º ajuste) */
  var podeGerar = function () { return E && ['contato', 'estimativa', 'direcoes', 'escolhida'].indexOf(E.conversa.etapa) >= 0; };   /* (= app.vendas_iniciar_geracao) */
  var escolhidaId = function () { return E && E.escolha ? E.escolha.direcao_id : null; };

  function botao(classe, texto, aoClicar) { var b = el('button', classe, texto); b.type = 'button'; b.addEventListener('click', aoClicar); return b; }
  function cartaoDirecao(d) {
    var li = el('li', 'dir');
    var escolhida = escolhidaId() === d.id;
    if (escolhida) li.classList.add('is-escolhida');
    var mini = el('div', 'dir__mini');
    var corpo = el('div', 'dir__corpo');
    corpo.appendChild(el('p', 'dir__estrategia', String(d.numero).padStart(2, '0') + ' · ' + (NOMES[d.estrategia] || d.estrategia)));
    if (d.status === 'pronta' && d.conteudo) {
      var tela = el('div', 'pv-tela');
      tela.appendChild(PV.desenhar(d.conteudo));
      mini.appendChild(tela);
      mini.setAttribute('aria-hidden', 'true');
      mini.addEventListener('click', function () { visor.abrir(d.id); });
      corpo.appendChild(el('h3', 'dir__nome', d.conteudo.nome_conceito));
      corpo.appendChild(el('p', 'dir__resumo', d.conteudo.resumo));
      var acoes = el('div', 'dir__acoes');
      var abrir = botao('btn btn--sm', 'Abrir prévia', function () { visor.abrir(d.id); });
      abrir.setAttribute('data-abrir', d.id);
      acoes.appendChild(abrir);
      if (escolhida) acoes.appendChild(el('span', 'dir__selo', 'Escolhida'));
      else if (podeEscolher()) acoes.appendChild(botao('btn btn--sm btn--primary', 'Escolher esta', function () { escolher(d.id); }));
      corpo.appendChild(acoes);
    } else if (d.status === 'falhou') {
      var p = el('div', 'dir__progresso');
      p.appendChild(el('p', '', 'Esta direção não saiu desta vez.'));
      mini.appendChild(p);
      if (podeGerar()) {
        corpo.appendChild(el('p', 'dir__resumo', 'Você pode gerar as três de novo ou seguir com as que ficaram prontas.'));
        corpo.appendChild(botao('btn btn--sm', 'Gerar de novo', gerarTodas));
      } else corpo.appendChild(el('p', 'dir__resumo', 'Os ajustes seguem sobre a direção escolhida.'));
    } else if (manual()) {
      var f = el('div', 'dir__progresso');
      f.appendChild(el('p', '', 'Na fila: a direção de ' + (NOMES[d.estrategia] || '').toLowerCase() + ' fica pronta em até 24 horas úteis.'));
      mini.appendChild(f);
      corpo.appendChild(el('p', 'dir__resumo', 'Avisamos pelo seu WhatsApp. O progresso fica salvo neste aparelho.'));
      corpo.appendChild(botao('btn btn--sm', 'Conferir agora', function () { recarregar().catch(function () {}); }));   /* (sem consulta automática: a pessoa confere quando quiser) */
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
  function encaixarMinis() { [].forEach.call(document.querySelectorAll('.dir__mini'), function (m) { var t = m.querySelector('.pv-tela'); if (t) PV.encaixar(m, t, 390); }); }
  var adiado = null;
  window.addEventListener('resize', function () { clearTimeout(adiado); adiado = setTimeout(encaixarMinis, 150); });
  /* o relógio dos cartões em geração: só roda enquanto há geração */
  function relogioDosCartoes(ligar) {
    if (ligar && !relogio) relogio = setInterval(function () { [].forEach.call(document.querySelectorAll('[data-tempo]'), function (t) { t.textContent = tempo(t.getAttribute('data-tempo')); }); }, 1000);
    if (!ligar && relogio) { clearInterval(relogio); relogio = null; }
  }

  async function escolher(id) {
    limparAviso();
    try { await API.escolher(id); visor.fechar(); await recarregar(); $('o-ajustes').scrollIntoView({ block: 'start' }); }
    catch (e) { avisar(mensagemDe(e), e.status === 409 ? null : function () { escolher(id); }); }
  }

  var visor = window.BZVisor.criar({
    lista: function () {
      var l = E ? E.direcoes.filter(function (d) { return d.status === 'pronta' && d.conteudo; }) : [];
      if (E && E.versao_final) l = l.concat([{ id: 'final', numero: 0, estrategia: 'final', conteudo: E.versao_final }]);
      return l;
    },
    podeEscolher: podeEscolher,
    escolhida: escolhidaId,
    aoEscolher: escolher
  });

  /* ---------- ajustes ---------- */
  $('o-aj-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var form = this, pedido = $('o-aj-texto').value.trim();
    if (!pedido || form.getAttribute('aria-busy') === 'true') return;
    form.setAttribute('aria-busy', 'true');
    limparAviso();
    $('o-aj-resposta').textContent = 'Aplicando…';
    try {
      var r = await API.alterar(pedido.slice(0, 2000));
      $('o-aj-texto').value = '';
      $('o-aj-resposta').textContent = r.resposta || '';
      if (r.estimativa) investimento(r.estimativa, true);
      if (r.diagnostico) mostrar('o-diagnostico', true);
      await recarregar().catch(function () {});
    } catch (e) { $('o-aj-resposta').textContent = ''; avisar(mensagemDe(e)); }
    finally { form.removeAttribute('aria-busy'); }
  });
  var OPERACOES = { usar_paleta_de: 'Cores de outra direção', usar_tipografia_de: 'Fontes de outra direção', cor: 'Cor trocada', tipografia: 'Fontes trocadas', tema: 'Tema claro/escuro', mover_antes_de: 'Seção movida', mover_depois_de: 'Seção movida', remover_secao: 'Seção removida', adicionar_secao: 'Seção adicionada', trocar_texto: 'Texto trocado', trocar_cta_menu: 'Botão do menu trocado', adicional: 'Item adicionado ao escopo', paginas: 'Número de páginas', outro: 'Pedido' };
  function mudancas() {
    if (!mudou('mudancas', [E.alteracoes, !!E.versao_final])) return;
    var ul = $('o-mudancas');
    ul.textContent = '';
    E.alteracoes.forEach(function (a) {
      (a.mudancas || []).forEach(function (m) {
        ul.appendChild(el('li', m.aplicada ? 'is-ok' : 'is-nao', (OPERACOES[m.operacao] || m.operacao) + (m.aplicada ? '' : ': ' + (m.motivo || 'não foi possível'))));
      });
    });
    var v = $('o-versao');
    v.textContent = '';
    if (E.versao_final) {
      var b = botao('btn btn--sm', 'Abrir a sua versão', function () { visor.abrir('final'); });
      b.setAttribute('data-abrir', 'final');
      v.appendChild(b);
    }
  }
  $('o-fechar-escopo').addEventListener('click', async function () {
    limparAviso();
    try { await API.escopo(); await recarregar(); $('o-escopo').scrollIntoView({ block: 'start' }); }
    catch (e) { avisar(mensagemDe(e), e.status === 409 ? function () { $('o-fechar-escopo').click(); } : null); }
  });

  /* ---------- escopo e confirmação ---------- */
  $('o-esc-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var form = this, erro = $('o-esc-erro');
    if (form.getAttribute('aria-busy') === 'true') return;
    if (!$('o-confirmo').checked) { erro.textContent = 'Marque a confirmação do escopo.'; $('o-confirmo').focus(); return; }
    erro.textContent = '';
    form.setAttribute('aria-busy', 'true');
    try { await API.confirmar(E.proposta.id, $('o-inicio').checked); await recarregar(); $('o-pagamento').scrollIntoView({ block: 'start' }); }
    catch (e) { erro.textContent = mensagemDe(e); }
    finally { form.removeAttribute('aria-busy'); }
  });

  /* ---------- pagamento do sinal (js/orcamento-pagamento.js: Pix e cartão no próprio site) ---------- */
  var telaPagamento = window.BZPagamentoTela ? window.BZPagamentoTela.criar({ API: API, dinheiro: dinheiro, aoPagar: function () { recarregar().catch(function () {}); } }) : null;
  var recibo = window.BZRecibo ? window.BZRecibo.criar({ API: API, dinheiro: dinheiro }) : null;
  var viuAguardando = false;   /* a etapa "aguardando pagamento" foi vista nesta tela: a confirmação chega ao vivo e o recibo anima */
  function sinalPct(pr) { return pr.sinal_percentual == null ? 50 : Number(pr.sinal_percentual); }   /* (o servidor usa 50 quando falta: app.vendas_*) */
  function dias(n) { return n + (Number(n) === 1 ? ' dia' : ' dias'); }
  /* o sinal: o registro PAGO quando houver; senão o último criado; sem nenhum, o combinado na proposta */
  function valorDoSinal(pr) {
    var sinais = E.pagamentos.filter(function (p) { return p.parcela === 'sinal'; });
    var pagos = sinais.filter(function (p) { return p.status === 'pago'; });
    var ultimo = pagos[pagos.length - 1] || sinais[sinais.length - 1];
    return ultimo ? Number(ultimo.valor) : Math.round(Number(pr.valor_total) * sinalPct(pr)) / 100;
  }
  function pagamento() {
    var pr = E.proposta;
    if (!pr) return;
    var sinal = valorDoSinal(pr);
    if (mudou('pagamento', [pr, sinal])) {
      $('o-pag-lead').textContent = 'Escopo confirmado: ' + dinheiro(pr.valor_total) + ' em até ' + dias(pr.prazo_dias) + '. Para começar, o sinal de ' + sinalPct(pr) + '%: ' + dinheiro(sinal) + '. O restante na entrega.';
      $('o-pag-escopo').textContent = pr.escopo || '';
      if (telaPagamento) telaPagamento.mostrar(sinal);
    }
  }

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
    if (!mudou('etapas', atual)) return;
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
  function direcoes() {
    var et = E.conversa.etapa;
    var temDirecoes = E.direcoes.length > 0;
    mostrar('o-direcoes', temDirecoes || (E.conversa.tem_contato && et === 'contato'));
    var resumo = E.direcoes.map(function (d) { return [d.id, d.status, d.conteudo]; });
    if (mudou('direcoes', [resumo, escolhidaId(), podeEscolher(), podeGerar(), E.conversa.tem_contato])) {
      var ul = $('o-dirs');
      ul.textContent = '';
      if (temDirecoes) { E.direcoes.forEach(function (d) { ul.appendChild(cartaoDirecao(d)); }); encaixarMinis(); }
      else if (E.conversa.tem_contato) ul.appendChild(botao('btn btn--primary', 'Gerar as três direções', gerarTodas));
    }
    if (manual()) $('o-dir-lead').textContent = E.direcoes.some(function (d) { return d.status === 'gerando'; }) || !temDirecoes ? TEXTOS_MANUAL.direcoes : TEXTOS_MANUAL.prontas;
    var emGeracao = manual() ? [] : E.direcoes.filter(function (d) { return d.status === 'gerando'; });   /* (fila manual: nada a pedir) */
    relogioDosCartoes(emGeracao.length > 0);
    emGeracao.forEach(function (d) { pedirDirecao(d.id); });
  }
  function render() {
    var et = E.conversa.etapa;
    textosDoModo();
    etapas();
    if (E.estimativa) investimento(E.estimativa, false);
    var aberta = CONVERSA_ABERTA.indexOf(et) >= 0;
    mostrar('o-form', aberta);
    mostrar('o-conversa-fechada', !aberta);
    if (!aberta) $('o-atalhos').hidden = true;
    mostrar('o-contato', !E.conversa.tem_contato && !!E.estimativa);
    direcoes();
    mostrar('o-ajustes', et === 'escolhida' || et === 'alteracoes');
    mudancas();
    var temProposta = !!(E.proposta && et === 'escopo');
    mostrar('o-escopo', temProposta);
    if (temProposta && mudou('escopo', E.proposta.escopo)) $('o-esc-texto').textContent = E.proposta.escopo;
    mostrar('o-pagamento', et === 'aguardando_pagamento');
    if (et === 'aguardando_pagamento') { viuAguardando = true; pagamento(); }
    var pronto = et === 'em_producao', chegou = pronto && $('o-pronto').hidden && viuAguardando;
    mostrar('o-pronto', pronto);
    if (pronto) {
      pararEspera(); if (telaPagamento) telaPagamento.parar();
      var pr = E.proposta;
      if (recibo) recibo.desenhar(pr ? { id: pr.id, total: Number(pr.valor_total), sinal: valorDoSinal(pr), prazo: pr.prazo_dias } : null, chegou);
    }
    visor.atualizar();
  }
  /* uma leitura por vez; resposta de uma leitura mais velha que a última desenhada é descartada */
  async function recarregar() {
    if (!API.temSessao()) return null;
    var minha = ++seq;
    var p = API.estado();
    emVoo = p;
    var novo;
    try { novo = await p; } finally { if (emVoo === p) emVoo = null; }
    if (minha !== seq) return E;
    E = novo;
    render();
    if (E.conversa.etapa === 'gerando' && !manual()) esperar();   /* (no pagamento, quem consulta é js/orcamento-pagamento.js; na fila manual, só ao voltar à aba) */
    return E;
  }

  /* espera pelo que acontece fora desta aba (direção feita por outro pedido, aviso do pagamento) */
  function esperar() {
    if (espera) return;
    var inicio = Date.now();
    espera = setInterval(async function () {
      if (document.hidden || emVoo) return;
      if (Date.now() - inicio > ESPERA_MAX_MS) { pararEspera(); recarregar().catch(function () {}); return; }   /* (uma última olhada) */
      try {
        await recarregar();
        if (E.conversa.etapa !== 'gerando' && E.conversa.etapa !== 'aguardando_pagamento') pararEspera();
      } catch (e) { /* tenta na próxima */ }
    }, ESPERA_MS);
  }
  function pararEspera() { clearInterval(espera); espera = null; }
  /* voltou para a aba (do WhatsApp, do pagamento): olha de novo e retoma a espera se ainda for o caso */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !E || !API.temSessao()) return;
    if (E.conversa.etapa === 'gerando' || E.conversa.etapa === 'aguardando_pagamento') recarregar().catch(function () {});
  });

  /* ---------- começo: retoma a conversa salva neste aparelho ---------- */
  async function retomar() {
    if (!API.temSessao()) return;
    try {
      await recarregar();
      conversa();
      var BLOCOS = { direcoes: 'o-direcoes', ajustes: 'o-ajustes', escopo: 'o-escopo', pagamento: E.conversa.etapa === 'em_producao' ? 'o-pronto' : 'o-pagamento' };
      var alvo = BLOCOS[passoAtual()];
      if (alvo && !$(alvo).hidden) $(alvo).scrollIntoView({ block: 'start' });   /* quem volta cai na etapa em que parou */
    } catch (e) {
      /* conversa que não existe mais (ou sessão que o servidor recusou de vez): começa limpo.
         Falha de rede ou do servidor: a sessão fica, e o aviso oferece tentar de novo */
      if (e.status === 404 || e.status === 400 || !API.temSessao()) { API.esquecer(); return; }
      avisar(mensagemDe(e), retomar);
    }
  }
  retomar();
})();
