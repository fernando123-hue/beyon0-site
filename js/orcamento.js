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
  var $ = function (id) { return document.getElementById(id); };
  /* um script não chegou (rede, bloqueador): sem isso a página ficava morta sem dizer nada (auditoria 2026-10-09, F19) */
  if (!API || !PV || !window.BZVisor || !window.BZPerguntas) { semScripts(); return; }
  function semScripts() {
    var aviso = $('o-aviso');
    if (!aviso) return;
    $('o-aviso-texto').textContent = 'Parte desta página não carregou. Recarregue para tentar de novo ou continue pelo WhatsApp.';
    $('o-tentar').textContent = 'Recarregar';
    $('o-tentar').addEventListener('click', function () { location.reload(); });
    $('o-form').hidden = true;
    $('o-atalhos').hidden = true;
    aviso.hidden = false;
  }
  var RECUPERACAO = 'Não consegui concluir a análise neste momento. Suas informações foram preservadas. Vamos continuar de onde paramos.';
  var NOMES = { conversao: 'Conversão', autoridade: 'Autoridade', experiencia: 'Experiência' };
  /* até o sinal; no escopo e no sinal, só para dúvidas (api/_vendas/consultor.mjs, ETAPAS_SO_DUVIDAS) */
  var CONVERSA_ABERTA = ['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes', 'escopo', 'aguardando_pagamento'];
  /* (perto do pagamento, o lembrete de não colar dados do cartão vai na própria caixa: revisão de segurança do PR 34) */
  var DICA_DUVIDA = { escopo: 'Ex.: o domínio já vem incluído? (não escreva dados de cartão)', aguardando_pagamento: 'Ex.: quando eu pago o restante? (não escreva dados de cartão)' };
  var ESPERA_MS = 5000, ESPERA_MAX_MS = 15 * 60e3, REPEDIR_MS = 60e3;
  var E = null;                 /* o último estado do servidor */
  var seq = 0, emVoo = null;    /* respostas fora de ordem: só a mais nova vale */
  var pedindo = {};             /* direção → até quando NÃO pedir de novo (posse de outro pedido) */
  var inicioGeracao = {};
  var assinaturas = {};         /* bloco → o que foi desenhado (não refaz o que não mudou) */
  var ultimaAcao = null, espera = null, relogio = null, enviando = false;

  /* ---------- orçamento sem IA (spec 2026-10-11): as perguntas são o núcleo; a conversa só existe quando há consultor ----------
     A conversa aparece se o servidor diz que há consultor E a pessoa abriu "Prefere conversar?" (ou a conversa já tem
     mensagens). Sem configuração (rede), segue sem consultor: as perguntas bastam */
  var temConsultor = false, abriuConversa = false, perguntasIniciadas = false;
  function verConversa() {
    var aberta = !E || CONVERSA_ABERTA.indexOf(E.conversa.etapa) >= 0;
    mostrar('o-conversa', temConsultor && (abriuConversa || (!!E && E.mensagens.length > 0)));
    mostrar('o-conversar', temConsultor && aberta && $('o-conversa').hidden);
    [].forEach.call(document.querySelectorAll('.orc-perguntar'), function (p) { p.hidden = !temConsultor; });
  }
  function abrirConversa() { abriuConversa = true; verConversa(); }
  API.sessaoConfig().then(function (cfg) { temConsultor = !!(cfg && cfg.consultor); verConversa(); })
    .catch(function () { /* sem configuração: segue sem consultor */ });
  $('o-conversar').addEventListener('click', function () {
    abrirConversa();
    $('o-conversa').scrollIntoView({ block: 'start' });
    $('o-texto').focus({ preventScroll: true });
  });
  /* uma conversa nova (sem mensagens nem preço gravado) começa pelas perguntas, uma vez */
  function iniciarPerguntas() {
    if (perguntasIniciadas || !window.BZPerguntas) return;
    perguntasIniciadas = true;
    window.BZPerguntas.iniciar();
  }
  /* o preço ao vivo das perguntas (js/orcamento-perguntas.js) usa o mesmo cartão; a voz anuncia o valor novo */
  var precoNaTela = false;
  document.addEventListener('bz:preco', function (ev) {
    var valorNovo = ev.detail.estimativa ? investimento(ev.detail.estimativa, true) : '';
    if (valorNovo) anunciar('Preço: ' + valorNovo + '.');
    mostrar('o-diagnostico', !!ev.detail.diagnostico);
    precoNaTela = true; etapas();
  });
  /* "Mudar as respostas": a etapa volta para as perguntas */
  document.addEventListener('bz:perguntas', function () { precoNaTela = false; etapas(); });
  /* o pacote foi gravado: a tela segue o servidor (o contato aparece) e leva a pessoa até ele */
  document.addEventListener('bz:pacote-confirmado', function seguir() {
    recarregar().then(function () { if (!$('o-contato').hidden) irPara('o-contato'); })
      .catch(function (e) { falhou(e, function () { seguir(); }); });
  });

  var dinheiro = function (n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function mostrar(id, sim) { $(id).hidden = !sim; }
  function mudou(bloco, dados) { var s = JSON.stringify(dados); if (assinaturas[bloco] === s) return false; assinaturas[bloco] = s; return true; }

  /* ---------- aviso (falha, limite, recuperação): vai para a vista e recebe o foco ----------
     quieto: o aviso nasceu na carga (retomada), sem a pessoa ter feito nada: aparece no lugar, sem rolar nem
     tirar o foco (role=alert já o anuncia) */
  function avisar(msg, acao, rotulo, quieto) {
    ultimaAcao = acao || null;
    $('o-aviso-texto').textContent = msg;
    $('o-tentar').textContent = rotulo || 'Tentar de novo';
    $('o-tentar').hidden = !acao;
    mostrar('o-aviso', true);
    if (quieto) return;
    $('o-aviso').scrollIntoView({ block: 'center' });
    $('o-aviso').focus({ preventScroll: true });
  }
  function limparAviso() { mostrar('o-aviso', false); ultimaAcao = null; }

  /* ---------- a voz (A2): o leitor de tela ouve só o que importa ("Analisando…", a resposta, o investimento,
     a direção pronta), não a própria fala nem o histórico inteiro na retomada. Limpa e escreve no tique seguinte:
     a mesma frase duas vezes também é lida ---------- */
  var vozAdiada = null;
  function anunciar(texto) {
    var v = $('o-voz');
    clearTimeout(vozAdiada);
    v.textContent = '';
    if (texto) vozAdiada = setTimeout(function () { v.textContent = texto; }, 80);
  }
  /* uma etapa nova: rola até ela e o foco vai para o título (A3), sem anel no clique */
  function irPara(id) {
    var bloco = $(id);
    bloco.scrollIntoView({ block: 'start' });
    var h = bloco.querySelector('h2');
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }
  function mensagemDe(e) {
    if (e && e.status === 0) return e.dados && e.dados.tempo ? e.message + ' Tente de novo em instantes.' : e.message;
    /* instabilidade passageira (IA, Auth do Supabase): a frase do servidor, que já é humana; a sessão continua */
    if (e && e.status === 503 && e.dados && e.dados.recuperavel) return e.dados.erro || RECUPERACAO;
    /* erro do servidor: nunca o "Erro interno." cru; o código do ERRO (o request id, não o do pedido) deixa a
       equipe achar o caso no log (F7) */
    if (e && e.status === 500) {
      var cod = e.dados && typeof e.dados.pedido === 'string' ? e.dados.pedido.slice(0, 8) : '';
      return 'Não consegui concluir agora.' + (cod ? ' Código do erro: ' + cod + '.' : '') + ' Tente de novo em instantes ou fale com a Beyon Zero pelo WhatsApp.';
    }
    return (e && e.message) || RECUPERACAO;
  }
  /* rede ou servidor: vale oferecer "Tentar de novo" (recusa de regra, não) */
  var repetivel = function (e) { return !!e && (e.status === 0 || e.status >= 500); };
  /* a sessão existia e o servidor a recusou DE VERDADE (401; F5): "Recomeçar" em vez de um laço de "Tentar de
     novo". O 503 recuperável (Auth instável) não entra aqui: a sessão fica e o aviso oferece tentar de novo */
  var sessaoTerminou = function (e) { return API.perdeuSessao() || (!!E && !!e && e.status === 401 && !API.temSessao()); };
  function avisarSessao(quieto) {
    pararEspera();
    if (telaPagamento) telaPagamento.parar();
    var cod = API.codigoPerdido() || codigoMostrado;
    avisar('Sua sessão terminou. Recomece o orçamento por aqui' + (cod ? ' ou continue pelo WhatsApp citando o código do pedido ' + cod + '.' : ' ou continue pelo WhatsApp.'), recomecar, 'Recomeçar', quieto);
  }
  /* Recomeçar: esquece a sessão (nenhuma outra aba a grava de volta) e limpa os dados digitados antes de
     recarregar, para o navegador não os restaurar num aparelho compartilhado */
  var CAMPOS_PESSOAIS = ['o-texto', 'o-aj-texto', 'o-nome', 'o-tel', 'o-email', 'o-pag-nome', 'o-pag-sobrenome', 'o-pag-email', 'o-pag-doc', 'o-titular', 'o-pix-codigo'];
  function recomecar() {
    API.esquecer();
    CAMPOS_PESSOAIS.forEach(function (id) { if ($(id)) $(id).value = ''; });
    ['o-aceite', 'o-confirmo', 'o-inicio'].forEach(function (id) { if ($(id)) $(id).checked = false; });
    location.reload();
  }
  /* outra aba esqueceu a sessão (js/orcamento-api.js): avisa já, quieto, em vez de esperar a próxima ação */
  document.addEventListener('bz-orcamento:perdida', function () { avisarSessao(true); });
  function falhou(e, acao) {
    if (sessaoTerminou(e)) return avisarSessao();
    avisar(mensagemDe(e), acao);
  }
  $('o-tentar').addEventListener('click', function () { var a = ultimaAcao; limparAviso(); if (a) a(); });

  /* ---------- o código do pedido e o WhatsApp com ele (F1, F6) ----------
     Os links [data-wa] são montados por js/pagina.js; aqui só se acrescenta "(pedido XXXXXXXX)" ao assunto, no
     próprio data-wa (quem remontar os links depois, como js/metricas.js, leva o pedido junto) */
  var codigoMostrado = null;
  function identificar() {
    var c = API.codigo();
    if (!c || c === codigoMostrado) return;
    codigoMostrado = c;
    $('o-codigo-v').textContent = c;
    mostrar('o-codigo', true);
    var B = window.BEYON, padrao = document.body.getAttribute('data-wa-padrao') || '';
    if (!B || typeof B.linkWA !== 'function') return;
    [].forEach.call(document.querySelectorAll('[data-wa]'), function (a) {
      if (!a.hasAttribute('data-wa-base')) a.setAttribute('data-wa-base', a.getAttribute('data-wa') || padrao);
      var assunto = a.getAttribute('data-wa-base') + ' (pedido ' + c + ')';
      a.setAttribute('data-wa', assunto);
      a.href = B.linkWA(assunto);
    });
  }

  /* ---------- a conversa ---------- */
  function msg(papel, texto) {
    var li = el('li', 'msg msg--' + papel);
    li.appendChild(el('p', '', texto));
    $('o-log').appendChild(li);
    $('o-log-caixa').scrollTop = $('o-log-caixa').scrollHeight;   /* (quem rola é a caixa da conversa, não a lista) */
    return li;
  }
  /* (aria-disabled, não disabled: o botão desligado com o foco nele jogava o foco no body, A3; o "enviando" já protege) */
  function ocupado(sim) {
    enviando = sim; mostrar('o-pensando', sim); $('o-form').setAttribute('aria-busy', String(sim));
    if (sim) $('o-enviar').setAttribute('aria-disabled', 'true'); else $('o-enviar').removeAttribute('aria-disabled');
  }
  /* o chip de atalho some depois da 1ª mensagem: se o foco estava nele, passa antes para outro lugar (A3).
     Com mouse/teclado, a caixa de texto; no toque, a conversa (focar a caixa subiria o teclado por cima do
     "Analisando…") */
  var ponteiroFino = function () { return !!(window.matchMedia && matchMedia('(pointer: fine)').matches); };
  function esconderAtalhos() {
    if ($('o-atalhos').contains(document.activeElement)) {
      if (ponteiroFino() && !$('o-form').hidden) $('o-texto').focus({ preventScroll: true });
      else $('o-log-caixa').focus({ preventScroll: true });
    }
    $('o-atalhos').hidden = true;
  }
  var ultimaDoAgente = function () { var a = E ? E.mensagens.filter(function (m) { return m.papel === 'agente'; }) : []; return a.length ? a[a.length - 1].conteudo : ''; };

  var visitantesNoServidor = function () { return E ? E.mensagens.filter(function (m) { return m.papel !== 'agente'; }).length : 0; };

  async function enviar(texto) {
    if (enviando) return;   /* (Enter repetido não manda dois turnos) */
    limparAviso();
    var antes = visitantesNoServidor(), totalAntes = E ? E.mensagens.length : 0;
    var minha = msg('visitante', texto);
    esconderAtalhos();
    ocupado(true);
    anunciar('Analisando…');
    var r;
    try { r = await API.mensagem(texto); }
    catch (e) { await falhaNoEnvio(e, texto, minha, antes); return; }
    ocupado(false);
    /* a conversa no servidor agora tem +2 mensagens; se uma leitura de fundo já a redesenhou, não repete a resposta */
    var esperado = JSON.stringify(totalAntes + 2);
    if (assinaturas.conversa !== esperado) { assinaturas.conversa = esperado; msg('agente', r.resposta || 'Entendi.'); }
    var valorNovo = r.estimativa ? investimento(r.estimativa, true) : '';
    anunciar((r.resposta || 'Entendi.') + (valorNovo ? ' Investimento estimado: ' + valorNovo + '.' : ''));
    if (r.sugestoes_ia && r.sugestoes_ia.length) sugestao(r.sugestoes_ia[0]);
    if (r.diagnostico) mostrar('o-diagnostico', true);
    try { await recarregar(); } catch (e) { /* o turno já está gravado; a espera ou a próxima ação atualizam */ }
    if (r.pedir_contato && !$('o-contato').hidden) $('o-contato').scrollIntoView({ block: 'start' });   /* (sem tirar o foco: a resposta ainda está sendo lida) */
  }
  /* a rede caiu ou o tempo estourou com a IA respondendo (F2): o turno pode ter sido gravado mesmo assim. A tela
     segue o servidor: relê o estado (render redesenha a conversa se ela mudou) e só devolve o texto à caixa se o
     turno NÃO entrou */
  async function falhaNoEnvio(e, texto, minha, antes) {
    /* a tela segue ocupada DURANTE a releitura (que tem limite de 15 s, js/orcamento-api.js): um segundo envio
       nesse meio tempo poderia duplicar o turno se o primeiro tinha entrado */
    try { await recarregar(); } catch (x) { /* sem conexão: decide pelo que já se sabe */ }
    ocupado(false);
    var gravada = visitantesNoServidor() > antes;
    if (!gravada) {
      if (minha.isConnected) minha.remove();
      if (!$('o-texto').value) $('o-texto').value = texto;
    }
    if (sessaoTerminou(e)) { anunciar(''); return avisarSessao(); }
    if (gravada) { anunciar(ultimaDoAgente()); return; }   /* a resposta já está na conversa: nada a refazer */
    /* o sinal caiu enquanto o consultor respondia: a tela já mostra o projeto em produção; um erro ali só assustaria
       (revisões do PR 34) */
    if (E && CONVERSA_ABERTA.indexOf(E.conversa.etapa) < 0) { anunciar(''); return; }
    anunciar('');
    var respondendo = e.status === 409 && /respondendo/i.test(e.message || '');   /* (a mensagem anterior ainda está com a IA) */
    avisar(mensagemDe(e), repetivel(e) || respondendo ? function () { reenviar(texto, antes); } : null);
  }
  /* antes de mandar de novo, confere se o turno anterior chegou nesse meio-tempo (senão entraria duas vezes) */
  async function reenviar(texto, antes) {
    try { await recarregar(); } catch (x) { /* o envio diz se a rede voltou */ }
    if ($('o-texto').value === texto) $('o-texto').value = '';
    if (visitantesNoServidor() > antes) return;
    enviar(texto);
  }
  /* Safari < 16 não tem requestSubmit (F14): o clique no botão de envio faz o mesmo caminho */
  function submeter(form, botaoEnvio) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else botaoEnvio.click(); }
  $('o-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = $('o-texto').value.trim();
    if (!t || enviando) return;
    $('o-texto').value = '';
    enviar(t.slice(0, 2000));
  });
  $('o-texto').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); if (!enviando) submeter($('o-form'), $('o-enviar')); }
  });
  [].forEach.call(document.querySelectorAll('[data-atalho]'), function (b) {
    b.addEventListener('click', function () { enviar(b.getAttribute('data-atalho')); });
  });
  /* "Pergunte ao consultor" no escopo e no sinal: leva à caixa da conversa, que fica lá em cima */
  var dicaPadrao = $('o-texto').placeholder;
  [].forEach.call(document.querySelectorAll('[data-perguntar]'), function (a) {
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      abrirConversa();   /* (o link só aparece quando há consultor) */
      $('o-form').scrollIntoView({ block: 'center' });
      $('o-texto').focus({ preventScroll: true });
    });
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
  /* devolve o valor formatado quando o cartão mudou (a voz anuncia), '' quando não */
  function investimento(est, novo) {
    var c = cartaoDe(est);
    if (c.valor_total == null || !mudou('investimento', c)) return '';
    mostrar('o-est-vazio', false);
    mostrar('o-est-cheio', true);
    $('o-est-formato').textContent = c.formato || '';
    var v = $('o-est-valor');
    if (novo) { v.classList.remove('is-novo'); void v.offsetWidth; v.classList.add('is-novo'); }
    v.textContent = dinheiro(c.valor_total);
    $('o-est-prazo').textContent = dias(c.prazo_dias);
    $('o-est-sinal').textContent = dinheiro(c.sinal);
    $('o-est-resto').textContent = dinheiro(Number(c.valor_total) - Number(c.sinal));
    lista($('o-est-itens'), c.itens);
    var f = c.fase_seguinte;
    mostrar('o-est-fase', !!(f && f.itens && f.itens.length));
    if (f && f.itens) {
      lista($('o-est-fase-itens'), f.itens);
      $('o-est-fase-valor').textContent = 'Estimativa da fase seguinte: ' + dinheiro(f.valor_estimado) + '.';
    }
    return dinheiro(c.valor_total);
  }
  function sugestao(s) {
    $('o-sugestao-ideia').textContent = s.ideia;
    $('o-sugestao-motivo').textContent = s.motivo || '';
    mostrar('o-sugestao', true);
  }

  /* ---------- o erro ligado ao campo (A7) ----------
     Só o campo com erro ganha aria-invalid e aria-describedby (apontando para a mensagem); ao ser corrigido
     (input/change), ele perde os dois */
  function marcarCampo(id, saidaId) { $(id).setAttribute('aria-invalid', 'true'); $(id).setAttribute('aria-describedby', saidaId); }
  function desmarcarCampo(id) { $(id).removeAttribute('aria-invalid'); $(id).removeAttribute('aria-describedby'); }
  function erroNoCampo(campos, saida, id, texto) {
    saida.textContent = texto;
    campos.forEach(function (c) { if (c === id) marcarCampo(c, saida.id); else desmarcarCampo(c); });
  }
  function soltarAoCorrigir(campos) {
    campos.forEach(function (c) {
      var soltar = function () { if ($(c).getAttribute('aria-invalid') === 'true') desmarcarCampo(c); };
      $(c).addEventListener('input', soltar);
      $(c).addEventListener('change', soltar);
    });
  }

  /* ---------- o contato ---------- */
  var CAMPOS_CONTATO = ['o-nome', 'o-tel', 'o-email', 'o-aceite'];
  soltarAoCorrigir(CAMPOS_CONTATO.concat(['o-confirmo']));
  function validarContato(d) {
    if (d.nome.length < 2) return ['o-nome', 'Informe seu nome.'];
    if (!d.telefone && !d.email) return ['o-tel', 'Informe o WhatsApp ou o e-mail.'];
    if (manual() && !d.telefone) return ['o-tel', 'Informe seu WhatsApp: é por ele que avisamos quando as direções ficarem prontas.'];
    if (!d.aceite) return ['o-aceite', 'É preciso concordar com o uso dos dados para receber as propostas.'];
    return null;
  }
  $('o-contato-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var form = this, erro = $('o-contato-erro');
    if (form.getAttribute('aria-busy') === 'true') return;
    var dados = { nome: $('o-nome').value.trim(), telefone: $('o-tel').value.trim(), email: $('o-email').value.trim(), aceite: $('o-aceite').checked };
    var ruim = validarContato(dados);
    if (ruim) { erroNoCampo(CAMPOS_CONTATO, erro, ruim[0], ruim[1]); $(ruim[0]).focus(); return; }
    if (!dados.telefone) delete dados.telefone;
    if (!dados.email) delete dados.email;
    erroNoCampo(CAMPOS_CONTATO, erro, null, '');
    /* só gera se a conversa ainda está ANTES das direções (F20: um contato apagado aos 60 dias reaparecia o
       formulário mais adiante, e o envio pedia a geração fora da etapa) */
    var gerarDepois = !!E && ['contato', 'estimativa'].indexOf(E.conversa.etapa) >= 0;
    form.setAttribute('aria-busy', 'true');
    try { await API.contato(dados); }
    catch (e) {
      form.removeAttribute('aria-busy');
      if (sessaoTerminou(e)) { avisarSessao(); return; }
      /* (a recusa do servidor também aponta o campo, quando diz qual) */
      var m = mensagemDe(e), campo = /e-mail/i.test(m) ? 'o-email' : /whatsapp|telefone/i.test(m) ? 'o-tel' : /nome/i.test(m) ? 'o-nome' : null;
      erroNoCampo(CAMPOS_CONTATO, erro, campo, m);
      return;
    }
    form.removeAttribute('aria-busy');
    if (gerarDepois) await gerarTodas();
    else await recarregar().catch(function () {});
  });

  /* ---------- ações que mudam a etapa: uma por vez, botões desligados em voo (F10: duplo toque gerava 2 escopos) ---------- */
  var acaoEmVoo = false;
  function travarAcoes(sim) {
    acaoEmVoo = sim;
    [].forEach.call(document.querySelectorAll('[data-acao]'), function (b) { if (sim) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); });
  }
  async function umaAcao(fn) {
    if (acaoEmVoo) return;
    travarAcoes(true);
    try { await fn(); } finally { travarAcoes(false); }
  }

  /* ---------- as três direções ---------- */
  function gerarTodas() {
    return umaAcao(async function () {
      limparAviso();
      try {
        await API.gerar();
        await recarregar();
        irPara('o-direcoes');
      } catch (e) { falhou(e, e.status === 409 || e.status === 429 ? null : gerarTodas); }
    });
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
      if (sessaoTerminou(e)) { avisarSessao(); return; }
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
    contato: 'Com o seu contato, eu desenho três modelos de site para o seu negócio: um feito para trazer pedidos, um que passa confiança e um mais moderno e chamativo. Ficam prontos em até 24 horas úteis, e eu aviso pelo seu WhatsApp.',
    direcoes: 'Mesmo briefing, três estratégias. Ficam prontas em até 24 horas úteis e avisamos pelo seu WhatsApp; é só voltar a esta página, neste mesmo navegador, para abrir, comparar e escolher.',
    prontas: 'Mesmo briefing, três estratégias. Abra cada uma, compare e escolha a que mais tem a cara do seu negócio.'
  };
  function textosDoModo() {
    if (!manual() || !mudou('modo', 'manual')) return;
    $('o-contato-lead').textContent = TEXTOS_MANUAL.contato;
    var opcional = document.querySelector('label[for="o-email"] .orc-opcional');
    if (opcional) opcional.textContent = '(opcional)';
    $('o-tel-obrig').textContent = '(obrigatório)';   /* (A8: o rótulo diz, não só a validação) */
    $('o-tel').required = true;
    $('o-tel').setAttribute('aria-required', 'true');
  }
  var podeEscolher = function () { return E && (E.conversa.etapa === 'direcoes' || E.conversa.etapa === 'escolhida'); };   /* (o servidor trava a troca depois do 1º ajuste) */
  var podeGerar = function () { return E && ['contato', 'estimativa', 'direcoes', 'escolhida'].indexOf(E.conversa.etapa) >= 0; };   /* (= app.vendas_iniciar_geracao) */
  var escolhidaId = function () { return E && E.escolha ? E.escolha.direcao_id : null; };

  function botao(classe, texto, aoClicar) { var b = el('button', classe, texto); b.type = 'button'; b.addEventListener('click', aoClicar); return b; }
  /* botão de uma ação que muda a etapa (escolher, gerar): nasce desligado se outra está em voo */
  function botaoAcao(classe, texto, aoClicar) { var b = botao(classe, texto, aoClicar); b.setAttribute('data-acao', ''); if (acaoEmVoo) b.setAttribute('aria-disabled', 'true'); return b; }
  function cartaoDirecao(d) {
    var li = el('li', 'dir');
    li.setAttribute('data-id', d.id);
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
      else if (podeEscolher()) acoes.appendChild(botaoAcao('btn btn--sm btn--primary', 'Escolher esta', function () { escolher(d.id); }));
      corpo.appendChild(acoes);
    } else if (d.status === 'falhou') {
      var p = el('div', 'dir__progresso');
      p.appendChild(el('p', '', 'Esta direção não saiu desta vez.'));
      mini.appendChild(p);
      if (podeGerar()) {
        corpo.appendChild(el('p', 'dir__resumo', 'Você pode gerar as três de novo ou seguir com as que ficaram prontas.'));
        corpo.appendChild(botaoAcao('btn btn--sm', 'Gerar de novo', gerarTodas));
      } else corpo.appendChild(el('p', 'dir__resumo', 'Os ajustes seguem sobre a direção escolhida.'));
    } else if (manual()) {
      var f = el('div', 'dir__progresso');
      f.appendChild(el('p', '', 'Na fila: a direção de ' + (NOMES[d.estrategia] || '').toLowerCase() + ' fica pronta em até 24 horas úteis.'));
      mini.appendChild(f);
      corpo.appendChild(el('p', 'dir__resumo', 'Avisamos pelo seu WhatsApp. O progresso fica salvo neste navegador.'));
      var conf = botao('btn btn--sm', 'Conferir agora', function () { conferir(conf); });   /* (sem consulta automática: a pessoa confere quando quiser) */
      conf.setAttribute('data-conferir', '');
      corpo.appendChild(conf);
    } else {
      var g = el('div', 'dir__progresso');
      g.appendChild(el('p', '', 'Desenhando a direção de ' + (NOMES[d.estrategia] || '').toLowerCase() + '…'));
      g.appendChild(el('span', 'orc-pensando__fio'));
      var t = el('p', 'dir__tempo', tempo(d.id));
      t.setAttribute('data-tempo', d.id);
      g.appendChild(t);
      mini.appendChild(g);
      corpo.appendChild(el('p', 'dir__resumo', 'Pode sair: ao voltar a esta página, a geração continua.'));
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
    if (desistiu) ligar = false;   /* (a espera desistiu: o relógio para junto, não conta um tempo que ninguém acompanha) */
    if (ligar && !relogio) relogio = setInterval(function () { [].forEach.call(document.querySelectorAll('[data-tempo]'), function (t) { t.textContent = tempo(t.getAttribute('data-tempo')); }); }, 1000);
    if (!ligar && relogio) { clearInterval(relogio); relogio = null; }
  }

  /* fila manual: "Conferir agora" mostra que está conferindo e não engole o erro (F13) */
  async function conferir(b) {
    if (b.getAttribute('aria-disabled') === 'true') return;
    b.textContent = 'Conferindo…';
    b.setAttribute('aria-disabled', 'true');
    try { await recarregar(); }
    catch (e) { falhou(e, function () { var nb = document.querySelector('[data-conferir]'); if (nb) conferir(nb); }); }
    finally { if (b.isConnected) { b.textContent = 'Conferir agora'; b.removeAttribute('aria-disabled'); } }
  }

  function escolher(id) {
    return umaAcao(async function () {
      limparAviso();
      try { await API.escolher(id); visor.fechar(); await recarregar(); irPara('o-ajustes'); }
      catch (e) { visor.fechar(); falhou(e, e.status === 409 ? null : function () { escolher(id); }); }   /* (o aviso não fica atrás do fundo inerte do visor) */
    });
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
    var antes = E ? E.alteracoes.length : 0;
    try {
      var r = await API.alterar(pedido.slice(0, 2000));
      $('o-aj-texto').value = '';
      $('o-aj-resposta').textContent = r.resposta || '';
      if (r.estimativa) investimento(r.estimativa, true);
      if (r.diagnostico) mostrar('o-diagnostico', true);
      await recarregar().catch(function () {});
    } catch (e) {
      $('o-aj-resposta').textContent = '';
      /* (F2) a rede caiu com o ajuste em andamento: ele pode ter entrado. Relê antes de oferecer de novo, com o
         formulário ainda ocupado (a releitura tem limite de 15 s): um segundo ajuste igual não sai no meio */
      try { await recarregar(); } catch (x) { /* sem conexão */ }
      if (E && E.alteracoes.length > antes) { $('o-aj-texto').value = ''; return; }
      falhou(e, repetivel(e) ? function () { reajustar(antes); } : null);
    }
    finally { form.removeAttribute('aria-busy'); }
  });
  async function reajustar(antes) {
    try { await recarregar(); } catch (x) { /* o envio diz se a rede voltou */ }
    if (E && E.alteracoes.length > antes) { $('o-aj-texto').value = ''; return; }
    submeter($('o-aj-form'), $('o-aj-form').querySelector('[type="submit"]'));
  }
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
  function fecharEscopo() {
    return umaAcao(async function () {
      limparAviso();
      try { await API.escopo(); await recarregar(); irPara('o-escopo'); }
      catch (e) { falhou(e, e.status === 409 || repetivel(e) ? fecharEscopo : null); }
    });
  }
  $('o-fechar-escopo').addEventListener('click', fecharEscopo);

  /* ---------- escopo e confirmação ---------- */
  $('o-esc-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var form = this, erro = $('o-esc-erro');
    if (form.getAttribute('aria-busy') === 'true') return;
    if (!$('o-confirmo').checked) { erroNoCampo(['o-confirmo'], erro, 'o-confirmo', 'Marque a confirmação do escopo.'); $('o-confirmo').focus(); return; }
    erroNoCampo(['o-confirmo'], erro, null, '');
    form.setAttribute('aria-busy', 'true');
    try { await API.confirmar(E.proposta.id, $('o-inicio').checked); await recarregar(); irPara('o-pagamento'); }
    catch (e) { if (sessaoTerminou(e)) avisarSessao(); else erro.textContent = mensagemDe(e); }
    finally { form.removeAttribute('aria-busy'); }
  });

  /* ---------- pagamento do sinal (js/orcamento-pagamento.js: Pix e cartão no próprio site) ---------- */
  var telaPagamento = window.BZPagamentoTela ? window.BZPagamentoTela.criar({ API: API, dinheiro: dinheiro, aoPagar: function () { recarregar().catch(function () {}); } }) : null;
  var recibo = window.BZRecibo ? window.BZRecibo.criar({ API: API, dinheiro: dinheiro }) : null;
  var viuAguardando = false;   /* a etapa "aguardando pagamento" foi vista nesta tela: a confirmação chega ao vivo e o recibo anima */
  function sinalPct(pr) { return pr.sinal_percentual == null ? 50 : Number(pr.sinal_percentual); }   /* (o servidor usa 50 quando falta: app.vendas_*) */
  function dias(n) { return n + (Number(n) === 1 ? ' dia corrido' : ' dias corridos'); }   /* (corridos: decisão do dono, 2026-10-09; é o que o escopo diz) */
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
    var atual = E ? passoAtual() : 'conversa', passou = true;
    if (precoNaTela && atual === 'conversa') atual = 'estimativa';   /* (o preço das perguntas já está na tela, ainda sem gravar) */
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
    if (E.mensagens.length > 0) esconderAtalhos(); else $('o-atalhos').hidden = false;
  }
  function direcoes() {
    var et = E.conversa.etapa;
    var temDirecoes = E.direcoes.length > 0;
    mostrar('o-direcoes', temDirecoes || (E.conversa.tem_contato && et === 'contato'));
    var resumo = E.direcoes.map(function (d) { return [d.id, d.status, d.conteudo]; });
    anunciarProntas();
    if (mudou('direcoes', [resumo, escolhidaId(), podeEscolher(), podeGerar(), E.conversa.tem_contato])) {
      var ul = $('o-dirs');
      var foco = focoNaLista(ul);
      ul.textContent = '';
      if (temDirecoes) { E.direcoes.forEach(function (d) { ul.appendChild(cartaoDirecao(d)); }); encaixarMinis(); }
      else if (E.conversa.tem_contato && podeGerar()) ul.appendChild(botaoAcao('btn btn--primary', 'Gerar as três direções', gerarTodas));   /* (F20: só na etapa que gera) */
      devolverFocoNaLista(ul, foco);
    }
    if (manual()) $('o-dir-lead').textContent = E.direcoes.some(function (d) { return d.status === 'gerando'; }) || !temDirecoes ? TEXTOS_MANUAL.direcoes : TEXTOS_MANUAL.prontas;
    var emGeracao = manual() ? [] : E.direcoes.filter(function (d) { return d.status === 'gerando'; });   /* (fila manual: nada a pedir) */
    relogioDosCartoes(emGeracao.length > 0);
    emGeracao.forEach(function (d) { pedirDirecao(d.id); });
  }
  /* o foco estava num botão da lista que vai ser refeita: guarda qual (cartão + texto) para devolver depois */
  function focoNaLista(ul) {
    var a = document.activeElement;
    if (!a || !ul.contains(a)) return null;
    var li = a.closest('li[data-id]');
    return { id: li ? li.getAttribute('data-id') : null, texto: a.textContent };
  }
  function devolverFocoNaLista(ul, foco) {
    if (!foco) return;
    var li = foco.id ? ul.querySelector('li[data-id="' + foco.id + '"]') : null;
    var botoes = [].slice.call((li || ul).querySelectorAll('button'));
    var alvo = botoes.filter(function (b) { return b.textContent === foco.texto; })[0] || botoes[0];
    if (alvo) { alvo.focus({ preventScroll: true }); return; }
    var h = $('o-dir-titulo');
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }
  /* "Direção N pronta" só para o que ficou pronto COM a pessoa na página (a retomada não anuncia o que já estava) */
  var statusVisto = null;
  function anunciarProntas() {
    var agora = {}, prontas = [];
    E.direcoes.forEach(function (d) {
      agora[d.id] = d.status;
      if (statusVisto && statusVisto[d.id] && statusVisto[d.id] !== 'pronta' && d.status === 'pronta') prontas.push('Direção ' + d.numero + ' pronta.');
    });
    statusVisto = agora;
    if (prontas.length) anunciar(prontas.join(' '));
  }
  function render() {
    var et = E.conversa.etapa;
    textosDoModo();
    identificar();
    etapas();
    /* a conversa segue o servidor: redesenha quando o número de mensagens mudou (F2: resposta gravada com a rede caída) */
    if (mudou('conversa', E.mensagens.length)) conversa();
    verConversa();
    /* as perguntas: só numa conversa nova; com o preço gravado (ou a conversa já andando), ficam escondidas */
    if (!E.estimativa && E.mensagens.length === 0) iniciarPerguntas(); else mostrar('o-perguntas', false);
    if (E.estimativa) investimento(E.estimativa, false);
    var aberta = CONVERSA_ABERTA.indexOf(et) >= 0;
    mostrar('o-form', aberta);
    $('o-texto').placeholder = Object.prototype.hasOwnProperty.call(DICA_DUVIDA, et) ? DICA_DUVIDA[et] : dicaPadrao;
    mostrar('o-conversa-fechada', !aberta);
    if (!aberta) $('o-atalhos').hidden = true;
    mostrar('o-contato', !E.conversa.tem_contato && !!E.estimativa);
    direcoes();
    mostrar('o-ajustes', et === 'escolhida' || et === 'alteracoes');
    mudancas();
    var temProposta = !!(E.proposta && et === 'escopo');
    mostrar('o-escopo', temProposta);
    if (temProposta && mudou('escopo', E.proposta.escopo)) $('o-esc-texto').textContent = E.proposta.escopo;
    if (et === 'aguardando_pagamento' && $('o-pagamento').hidden) delete assinaturas.pagamento;   /* (reapareceu: a tela de pagamento confere de novo, inclusive a configuração) */
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

  /* espera pelo que acontece fora desta aba (direção feita por outro pedido, aviso do pagamento).
     Aos 15 min ela desiste (F12): para o relógio dos cartões e AVISA, com "Conferir agora" e o WhatsApp; volta a
     esperar quando a pessoa confere ou volta para a aba */
  var desistiu = false;
  function esperar() {
    if (espera || desistiu) return;
    var inicio = Date.now();
    espera = setInterval(async function () {
      if (document.hidden || emVoo) return;
      if (Date.now() - inicio > ESPERA_MAX_MS) { desistir(); return; }
      try {
        await recarregar();
        if (E.conversa.etapa !== 'gerando' && E.conversa.etapa !== 'aguardando_pagamento') pararEspera();
      } catch (e) { if (sessaoTerminou(e)) avisarSessao(); /* senão, tenta na próxima */ }
    }, ESPERA_MS);
  }
  function pararEspera() { clearInterval(espera); espera = null; }
  async function desistir() {
    pararEspera();
    desistiu = true;
    relogioDosCartoes(false);
    try { await recarregar(); } catch (e) { /* o aviso abaixo oferece conferir de novo */ }   /* (uma última olhada) */
    if (E && E.conversa.etapa === 'gerando') avisar('Está demorando mais que o normal. Confira de novo daqui a pouco ou fale com a Beyon Zero pelo WhatsApp.', conferirGeracao, 'Conferir agora');
  }
  function conferirGeracao() { desistiu = false; recarregar().catch(function (e) { falhou(e, conferirGeracao); }); }
  /* voltou para a aba (do WhatsApp, do pagamento): olha de novo e retoma a espera se ainda for o caso */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !E || !API.temSessao()) return;
    desistiu = false;
    if (E.conversa.etapa === 'gerando' || E.conversa.etapa === 'aguardando_pagamento') recarregar().catch(function () {});
  });

  /* chegando pela passagem (js/passagem.js), <main> ainda está se movendo: o scrollIntoView mediria a caixa em
     movimento e a rolagem pararia fora do lugar. Rola quando ela assenta ('passagem:chegou') */
  function rolarAte(el) {
    var Bp = window.BEYON;
    if (document.documentElement.classList.contains('passagem-chega') && Bp && Bp.on) {
      var feito = false;
      var uma = function () { if (feito) return; feito = true; Bp.off('passagem:chegou', uma); el.scrollIntoView({ block: 'start' }); };
      Bp.on('passagem:chegou', uma);
      setTimeout(uma, 3000);   /* a rede: o js/passagem.js não carregou (o evento não viria) */
    } else el.scrollIntoView({ block: 'start' });
  }

  /* ---------- começo: retoma a conversa salva neste aparelho ---------- */
  async function retomar() {
    if (!API.temSessao()) { iniciarPerguntas(); return; }   /* (primeira visita: as perguntas; a sessão nasce no "Ver o preço") */
    try {
      await recarregar();   /* (o render desenha a conversa salva) */
      var BLOCOS = { direcoes: 'o-direcoes', ajustes: 'o-ajustes', escopo: 'o-escopo', pagamento: E.conversa.etapa === 'em_producao' ? 'o-pronto' : 'o-pagamento' };
      var alvo = BLOCOS[passoAtual()];
      if (alvo && !$(alvo).hidden) rolarAte($(alvo));   /* quem volta cai na etapa em que parou */
    } catch (e) {
      /* conversa que não existe mais: começa limpo. Sessão que o servidor recusou de vez: avisa e oferece
         recomeçar (F5). Falha de rede ou do servidor: a sessão fica, e o aviso oferece tentar de novo */
      if (e.status === 404 || e.status === 400) { API.esquecer(); iniciarPerguntas(); return; }
      if (sessaoTerminou(e) || !API.temSessao()) { avisarSessao(true); return; }
      avisar(mensagemDe(e), retomar, null, true);
    }
  }
  retomar();
})();
