/* ==========================================================================
   PAINEL — entra com a chave, lê /api/painel e entrega os dados às telas (painel.html).
   A chave fica só nesta aba (sessionStorage). Tudo que veio de visitante
   (campanha, termo) entra por textContent: nada de HTML montado com dado.
   As telas e os cartões do início ficam em js/painel-inicio.js (15/11): este arquivo cuida de
   entrar, sair, do período, dos contatos (marcar conversa/cliente/valor), dos alertas do sistema e do CSV do Google Ads.
   Cada parte avisa o início pelo "barramento" BZPainel.avisar(fonte, dados) → evento bz-painel:dados.
   ========================================================================== */
(function () {
  'use strict';
  var CHAVE = 'bz-painel-chave';
  var STATUS = [['clicou', 'Só clicou'], ['conversa', 'Conversa'], ['cliente', 'Cliente'], ['descartado', 'Descartado']];
  var ROTINA_PARADA_MS = 2.5 * 864e5;   /* rotina diária sem rodar há mais de 2 dias (e meio, pelo fuso) é alerta por si */
  var $ = function (id) { return document.getElementById(id); };
  var dias = 7;

  var chave = '';
  try { chave = sessionStorage.getItem(CHAVE) || ''; } catch (e) { chave = ''; }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
  }
  var data = function (iso) { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

  /* o barramento das telas: cada parte (resumo, saúde, fila, recados, lembretes, avisos) avisa o que leu ou que falhou */
  function avisar(fonte, dados) {
    try { document.dispatchEvent(new CustomEvent('bz-painel:dados', { detail: { fonte: fonte, dados: dados } })); } catch (e) { /* navegador muito antigo */ }
  }

  function pedir(caminho, opcoes) {
    opcoes = opcoes || {};
    opcoes.headers = Object.assign({ authorization: 'Bearer ' + chave }, opcoes.headers || {});
    return fetch('/api/painel' + caminho, opcoes).then(function (r) {
      if (r.ok) return r;
      return r.json().catch(function () { return {}; }).then(function (j) {
        var erro = new Error(j.erro || 'Erro ' + r.status);
        erro.status = r.status;
        throw erro;
      });
    });
  }

  /* ---------- os contatos do recado (na tela Vendas): um cartão por contato, para marcar conversa, cliente e valor ---------- */
  function contatos(r) {
    var caixa = $('contatos');
    caixa.textContent = '';
    if (!r.contatos.length) { caixa.appendChild(el('p', 'pn__vazio', 'Nenhum contato neste período.')); return; }
    r.contatos.forEach(function (c) {
      var art = el('article', 'pn__contato');
      art.setAttribute('data-status', c.status);
      var h = el('header');
      h.appendChild(el('span', 'pn__codigo', c.codigo));
      h.appendChild(el('span', 'pn__quando', data(c.quando)));
      art.appendChild(h);
      art.appendChild(el('p', null, 'Veio de: ' + c.origem + (c.campanha ? ' · ' + c.campanha : '')));
      art.appendChild(campos(c));
      caixa.appendChild(art);
    });
  }

  var serial = 0;
  function campos(c) {
    var id = 'c' + (++serial);
    var g = el('div', 'pn__campos');
    var rotulo = function (texto, para) { var l = el('label', null, texto); l.htmlFor = para; return l; };
    var st = el('select'); st.id = id + 's';
    STATUS.forEach(function (s) { var o = el('option', null, s[1]); o.value = s[0]; o.selected = s[0] === c.status; st.appendChild(o); });
    var valor = el('input'); valor.type = 'number'; valor.min = '0'; valor.step = '0.01'; valor.inputMode = 'decimal'; valor.id = id + 'v'; valor.value = c.valor === null || c.valor === undefined ? '' : c.valor;
    var nota = el('input'); nota.type = 'text'; nota.maxLength = 200; nota.id = id + 'n'; nota.value = c.nota || ''; nota.placeholder = 'Ex: quer loja virtual, retorno em 15 dias';
    var salvar = el('button', 'pn__btn pn__btn--fino', 'Salvar'); salvar.type = 'button';
    var excluir = el('button', 'pn__excluir', 'Excluir'); excluir.type = 'button';
    var aviso = el('p', 'pn__salvo'); aviso.setAttribute('role', 'status');
    var col = function (filhos, classe) { var d = el('div', classe); filhos.forEach(function (f) { d.appendChild(f); }); return d; };
    g.appendChild(col([rotulo('Situação', st.id), st]));
    g.appendChild(col([rotulo('Valor (R$)', valor.id), valor]));
    g.appendChild(col([rotulo('Nota', nota.id), nota], 'pn__nota'));
    g.appendChild(col([salvar, excluir, aviso], 'pn__campos-acoes'));
    /* pedido da pessoa para apagar os dados dela (LGPD): some do banco, não só da tela */
    excluir.addEventListener('click', function () {
      if (!window.confirm('Excluir o contato ' + c.codigo + ' do banco? Não dá para desfazer.')) return;
      excluir.disabled = true;
      pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: c.codigo, excluir: true }) })
        .then(function () { carregar(); })
        .catch(function (e) { aviso.textContent = e.message; excluir.disabled = false; });
    });
    salvar.addEventListener('click', function () {
      salvar.disabled = true; aviso.textContent = 'Salvando…';
      pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: c.codigo, status: st.value, valor: valor.value, nota: nota.value }) })
        .then(function () { aviso.textContent = 'Salvo'; g.parentNode.setAttribute('data-status', st.value); carregar('numeros'); })
        .catch(function (e) { aviso.textContent = e.message; })
        .then(function () { salvar.disabled = false; });
    });
    return g;
  }

  /* a saúde: alertas da rotina diária (com "resolvido") e a rotina parada há mais de 2 dias (silêncio não é saúde).
     Rotina em dia e sem alerta não ocupa a tela: conta zero e o bloco some (js/painel-inicio.js) */
  function saude(s) {
    var caixa = $('saude');
    caixa.textContent = '';
    if (!s) {
      caixa.appendChild(el('p', 'pn__alerta pn__alerta--urgente', 'Não deu para ler a saúde do sistema agora (banco das vendas indisponível ou não configurado).'));
      avisar('saude', { erro: true });
      return;
    }
    var ultima = s.ultima_rotina ? new Date(s.ultima_rotina + 'T12:00:00') : null;
    var parada = !ultima || (Date.now() - ultima.getTime()) > ROTINA_PARADA_MS;
    if (parada) caixa.appendChild(el('p', 'pn__alerta pn__alerta--urgente',
      ultima ? 'A rotina diária rodou pela última vez em ' + ultima.toLocaleDateString('pt-BR') + ' e está PARADA: confira o CRON_SECRET e o cron.' : 'A rotina diária ainda não rodou (confira o CRON_SECRET e o cron).'));
    var abertos = s.alertas.length;
    var contar = function () { avisar('saude', { n: abertos + (parada ? 1 : 0) }); };
    s.alertas.forEach(function (a) {
      var p = el('div', 'pn__alerta' + (a.nivel === 'urgente' ? ' pn__alerta--urgente' : ''));
      p.appendChild(el('p', null, a.dia.split('-').reverse().join('/') + ' · ' + a.mensagem));
      var b = el('button', 'pn__btn pn__btn--fino', 'Resolvido'); b.type = 'button';
      b.addEventListener('click', function () {
        b.disabled = true;
        pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resolver_alerta: a.id }) })
          .then(function () { p.remove(); abertos -= 1; contar(); })
          .catch(function (e) { b.disabled = false; $('estado').textContent = e.message; });
      });
      p.appendChild(b);
      caixa.appendChild(p);
    });
    contar();
  }

  function mostrar(r, modo) {
    saude(r.saude);
    if (modo !== 'numeros') contatos(r);
    avisar('resumo', r);
  }

  /* ---------- entrar, carregar, sair ---------- */
  function entrou(sim) {
    $('entrar').hidden = sim;
    $('titulo').classList.toggle('sr-only', sim);   /* (com os dados à mostra, o título segue para o leitor de tela) */
    $('dados').hidden = !sim;
    $('sair').hidden = !sim;
  }
  /* modo: nada = tudo (e as listas de ação recarregam pelo bz-painel:entrou); 'periodo' = números e contatos;
     'numeros' = depois de salvar um contato, só os totais (a lista de contatos fica como está) */
  function carregar(modo) {
    var soNumeros = modo === 'numeros' || modo === 'periodo';
    $('estado').textContent = 'Carregando…';
    return pedir('?dias=' + dias).then(function (r) { return r.json(); }).then(function (r) {
      entrou(true);
      mostrar(r, modo);
      if (!soNumeros) document.dispatchEvent(new CustomEvent('bz-painel:entrou'));
      $('estado').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.' + (r.aviso ? ' Atenção: ' + r.aviso + '.' : '');   /* (A9: o servidor leu só as páginas mais recentes de cada tabela) */
    }).catch(function (e) {
      if (recusada(e)) return;
      /* a chave não foi recusada, só as métricas falharam: o painel abre com o erro na linha das métricas e a fila
         de direções carrega assim mesmo (tem o próprio pedido e o próprio aviso de erro). Antes a fila só vinha
         junto com as métricas, e uma falha delas escondia pedidos esperando o prazo de 24 h (auditoria 2026-10-09) */
      var primeira = $('dados').hidden;
      /* sem resposta (rede caiu) ou erro que não é do servidor, na primeira entrada: volta à tela de entrar SEM apagar
         a chave guardada (o dono só tenta de novo); a mensagem diz o que houve */
      if (primeira && !(e.status >= 500)) { entrou(false); $('erroEntrar').hidden = false; $('erroEntrar').textContent = e.status ? e.message : 'Sem conexão com o servidor. Tente de novo.'; return; }
      entrou(true);
      $('estado').textContent = 'Não foi possível carregar as métricas: ' + e.message;
      avisar('resumo', null);
      avisar('saude', { erro: true });
      if (primeira && !soNumeros) document.dispatchEvent(new CustomEvent('bz-painel:entrou'));
    });
  }
  /* a chave foi recusada (401) ou o freio de tentativas segurou (429): volta para a entrada, com o motivo. true = tratado */
  function recusada(e) {
    if (!e || (e.status !== 401 && e.status !== 429)) return false;
    sair();
    $('erroEntrar').hidden = false;
    $('erroEntrar').textContent = e.message;
    return true;
  }
  function sair() {
    chave = '';
    try { sessionStorage.removeItem(CHAVE); } catch (e) { /* nada guardado */ }
    entrou(false);
    $('contatos').textContent = '';
    $('saude').textContent = '';
    document.dispatchEvent(new CustomEvent('bz-painel:saiu'));
  }

  $('entrar').addEventListener('submit', function (e) {
    e.preventDefault();
    chave = $('chave').value.trim();
    if (!chave) return;
    $('erroEntrar').hidden = true;
    try {
      sessionStorage.setItem(CHAVE, chave);
      /* o dono não entra nas próprias métricas (js/metricas.js lê isto) */
      if ($('naoContar').checked) localStorage.setItem('bz-nao-contar', '1');
      else localStorage.setItem('bz-nao-contar', '0');
    } catch (err) { /* sem armazenamento: vale só nesta página */ }
    $('chave').value = '';
    carregar();
  });
  $('sair').addEventListener('click', sair);
  $('atualizar').addEventListener('click', function () { carregar(); });
  document.querySelector('.pn__periodo').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-dias]');
    if (!b) return;
    dias = +b.getAttribute('data-dias');
    [].forEach.call(this.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    carregar('periodo');   /* (o período muda os números e os contatos, não as listas de ação) */
  });
  $('baixarCsv').addEventListener('click', function () {
    var nome = $('nomeConversao').value.trim() || 'Cliente fechado';
    var cortado = false;
    $('ads-estado').textContent = '';
    pedir('?csv=ads&nome=' + encodeURIComponent(nome)).then(function (r) { cortado = r.headers.get('x-bz-cortado') === '1'; return r.blob(); }).then(function (b) {
      var a = el('a');
      a.href = URL.createObjectURL(b);
      a.download = 'conversoes-google-ads.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      if (cortado) $('ads-estado').textContent = 'Atenção: o CSV tem só os 2.000 contatos mais recentes dos últimos 90 dias; os mais antigos ficaram de fora.';
    }).catch(function (e) { if (recusada(e)) return; $('ads-estado').textContent = e.message; });
  });
  try { $('naoContar').checked = localStorage.getItem('bz-nao-contar') !== '0'; } catch (e) { /* padrão: marcado */ }
  /* as listas (js/painel-fila.js e as outras) usam o mesmo pedido autenticado e o mesmo barramento */
  window.BZPainel = { pedir: pedir, el: el, data: data, recusada: recusada, avisar: avisar };
  if (chave) carregar();
})();
