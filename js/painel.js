/* ==========================================================================
   PAINEL — mostra o que /api/painel devolve (painel.html).
   A chave fica só nesta aba (sessionStorage). Tudo que veio de visitante
   (campanha, termo) entra por textContent: nada de HTML montado com dado.
   ========================================================================== */
(function () {
  'use strict';
  var CHAVE = 'bz-painel-chave';
  var STATUS = [['clicou', 'Só clicou'], ['conversa', 'Conversa'], ['cliente', 'Cliente'], ['descartado', 'Descartado']];
  var BOTOES = { barra: 'Barra do celular', icone: 'Ícone do WhatsApp', menu: 'Menu', rodape: 'Rodapé', formulario: 'Formulário', 'formulario-direto': 'Link do formulário', pagina: 'Outro ponto da página' };
  var $ = function (id) { return document.getElementById(id); };
  var nomeBotao = function (b) { return Object.prototype.hasOwnProperty.call(BOTOES, b) ? BOTOES[b] : 'Seção ' + b; };
  var dias = 30;

  var chave = '';
  try { chave = sessionStorage.getItem(CHAVE) || ''; } catch (e) { chave = ''; }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
  }
  var num = function (n) { return (Number(n) || 0).toLocaleString('pt-BR'); };
  var reais = function (n) { return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); };
  var pct = function (n) { return (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; };
  var tempo = function (s) { s = Number(s) || 0; return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; };
  var data = function (iso) { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

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

  /* ---------- tabelas ---------- */
  function tabela(alvo, colunas, linhas) {
    var caixa = $(alvo);
    caixa.textContent = '';
    if (!linhas.length) { caixa.appendChild(el('p', 'pn__vazio', 'Ainda sem dados neste período.')); return; }
    var t = el('table'), cab = el('tr');
    colunas.forEach(function (c) { cab.appendChild(el('th', null, c[0])); });
    t.appendChild(el('thead')).appendChild(cab);
    var corpo = t.appendChild(el('tbody'));
    linhas.forEach(function (l) {
      var tr = el('tr');
      colunas.forEach(function (c) { tr.appendChild(el('td', null, c[1](l))); });
      corpo.appendChild(tr);
    });
    caixa.appendChild(t);
  }
  var COLS = function (nome) {
    return [[nome, function (l) { return l.nome || l.chave; }], ['Visitas', function (l) { return num(l.visitas); }],
      ['Clicaram', function (l) { return num(l.contatos); }], ['Taxa', function (l) { return pct(l.taxa); }],
      ['Conversas', function (l) { return num(l.conversas); }], ['Clientes', function (l) { return num(l.clientes); }],
      ['Valor', function (l) { return reais(l.valor); }]];
  };

  /* ---------- as partes ---------- */
  function resumo(r) {
    var k = $('kpis');
    k.textContent = '';
    var dl = el('dl', 'pn__kpis');
    [['Visitas', num(r.total.visitas)], ['Clicaram para conversar', num(r.total.contatos)], ['Conversas', num(r.total.conversas)],
      ['Clientes', num(r.total.clientes)], ['Valor fechado', reais(r.total.valor)], ['Tempo mediano', tempo(r.tempoMediano_s)]].forEach(function (p) {
      var d = el('div', 'pn__kpi');
      d.appendChild(el('dt', null, p[0]));
      d.appendChild(el('dd', null, p[1]));
      dl.appendChild(d);
    });
    k.appendChild(dl);
    var f = $('funil');
    f.textContent = '';
    var topo = Math.max(1, r.funil[0].n);
    r.funil.forEach(function (e, i) {
      var d = el('div', 'pn__etapa'), p = el('p');
      p.appendChild(el('span', null, e.etapa + (i ? ' (' + pct(e.pct) + ' da etapa anterior)' : '')));
      p.appendChild(el('b', null, num(e.n)));
      var barra = el('div', 'pn__barra'), i2 = el('i');
      i2.style.width = Math.round((e.n / topo) * 100) + '%';
      barra.appendChild(i2);
      d.appendChild(p); d.appendChild(barra);
      f.appendChild(d);
    });
  }

  function paginas(r) {
    var caixa = $('paginas');
    caixa.textContent = '';
    r.paginas.forEach(function (p) {
      var b = el('div', 'pn__pagina');
      b.appendChild(el('h3', null, 'Página ' + p.pagina));
      b.appendChild(el('p', null, num(p.vistas) + ' vistas · ' + num(p.contatos) + ' cliques para conversar (' + pct(p.taxa) + ') · rolaram em média ' + p.rolagemMedia + '% · tempo mediano ' + tempo(p.tempoMediano_s) + (p.cargaMediana_ms ? ' · apareceu em ' + (p.cargaMediana_ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' s' : '')));
      p.secoes.forEach(function (s) {
        var linha = el('div', 'pn__secao'), barra = el('div', 'pn__barra'), i = el('i');
        i.style.width = Math.min(100, s.pct) + '%';
        barra.appendChild(i);
        linha.appendChild(el('span', null, s.id));
        linha.appendChild(barra);
        linha.appendChild(el('span', null, pct(s.pct)));
        b.appendChild(linha);
      });
      caixa.appendChild(b);
    });
    if (!r.paginas.length) caixa.appendChild(el('p', 'pn__vazio', 'Ainda sem dados neste período.'));
  }

  function formularioEOuro(r) {
    var f = $('formulario'), fm = r.formulario;
    f.textContent = '';
    f.appendChild(el('p', null, num(fm.abriram) + ' abriram, ' + num(fm.enviaram) + ' enviaram (' + pct(fm.taxa) + ').'));
    if (fm.abandono.length) f.appendChild(el('p', null, 'Quem desistiu parou em: ' + fm.abandono.map(function (a) { return a.campo + ' (' + a.n + ')'; }).join(', ') + '.'));
    var o = $('ouro');
    o.textContent = '';
    o.appendChild(el('p', null, 'Visitas que viram o Ouro: ' + num(r.ouro.com.visitas) + ', das quais ' + pct(r.ouro.com.taxa) + ' clicaram para conversar. Sem o Ouro: ' + num(r.ouro.sem.visitas) + ', ' + pct(r.ouro.sem.taxa) + '.'));
  }

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
      var origem = c.origem + (c.fonte && c.fonte !== 'direto' ? ' · ' + c.fonte : '') + (c.campanha ? ' · ' + c.campanha : '') + (c.termo ? ' · "' + c.termo + '"' : '');
      art.appendChild(el('p', null, origem));
      art.appendChild(el('p', null, 'Página ' + c.pagina + ' · ' + nomeBotao(c.botao) + ' · ' + c.dispositivo + (c.temGclid ? ' · clique de anúncio identificado' : '')));
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
    g.appendChild(col([salvar, excluir, aviso]));
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
        .then(function () { aviso.textContent = 'Salvo'; g.parentNode.setAttribute('data-status', st.value); carregar(true); })
        .catch(function (e) { aviso.textContent = e.message; })
        .then(function () { salvar.disabled = false; });
    });
    return g;
  }

  /* a saúde: alertas da rotina diária (com "resolvido") e quando ela rodou bem pela última vez.
     Rotina parada há mais de 2 dias é alerta por si: silêncio não é saúde */
  function saude(s) {
    var caixa = $('saude');
    caixa.textContent = '';
    if (!s) { caixa.appendChild(el('p', 'pn__vazio', 'Não deu para ler a saúde do sistema agora (banco das vendas indisponível ou não configurado).')); return; }
    var ultima = s.ultima_rotina ? new Date(s.ultima_rotina + 'T12:00:00') : null;
    var parada = !ultima || (Date.now() - ultima.getTime()) > 2.5 * 864e5;
    caixa.appendChild(el('p', parada ? 'pn__alerta pn__alerta--urgente' : 'pn__vazio',
      ultima ? 'Rotina diária: rodou pela última vez em ' + ultima.toLocaleDateString('pt-BR') + (parada ? ' — PARADA: confira o CRON_SECRET e o cron da Vercel.' : '.') : 'Rotina diária: ainda não rodou (confira o CRON_SECRET e o cron da Vercel).'));
    var nenhum = function () { caixa.appendChild(el('p', 'pn__vazio', 'Nenhum alerta aberto.')); };
    if (!s.alertas.length) { nenhum(); return; }
    s.alertas.forEach(function (a) {
      var p = el('div', 'pn__alerta' + (a.nivel === 'urgente' ? ' pn__alerta--urgente' : ''));
      p.appendChild(el('p', null, a.dia.split('-').reverse().join('/') + ' · ' + a.mensagem));
      var b = el('button', 'pn__btn pn__btn--fino', 'Resolvido'); b.type = 'button';
      b.addEventListener('click', function () {
        b.disabled = true;
        pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resolver_alerta: a.id }) })
          .then(function () { p.remove(); if (!caixa.querySelector('div.pn__alerta')) nenhum(); })
          .catch(function (e) { b.disabled = false; $('estado').textContent = e.message; });
      });
      p.appendChild(b);
      caixa.appendChild(p);
    });
  }

  function mostrar(r, soNumeros) {
    saude(r.saude);
    resumo(r);
    if (!soNumeros) contatos(r);
    tabela('origens', COLS('Origem'), r.origens);
    tabela('campanhas', COLS('Campanha · termo'), r.campanhas);
    tabela('entradas', COLS('Página'), r.entradas);
    tabela('dispositivos', COLS('Aparelho'), r.dispositivos);
    tabela('botoes', [['Botão', function (l) { return nomeBotao(l.botao); }], ['Cliques', function (l) { return num(l.n); }]], r.botoes);
    tabela('dias', [['Dia', function (l) { return l.chave.split('-').reverse().join('/'); }], ['Visitas', function (l) { return num(l.visitas); }], ['Clicaram', function (l) { return num(l.contatos); }], ['Clientes', function (l) { return num(l.clientes); }]], r.dias_lista.slice().reverse());
    paginas(r);
    formularioEOuro(r);
  }

  /* ---------- entrar, carregar, sair ---------- */
  function entrou(sim) {
    $('entrar').hidden = sim;
    $('titulo').classList.toggle('sr-only', sim);   /* (com os dados à mostra, o título segue para o leitor de tela) */
    $('dados').hidden = !sim;
    $('sair').hidden = !sim;
  }
  /* soNumeros: depois de salvar um contato, refaz os totais e as tabelas, não a lista de contatos */
  function carregar(soNumeros) {
    $('estado').textContent = 'Carregando…';
    return pedir('?dias=' + dias).then(function (r) { return r.json(); }).then(function (r) {
      entrou(true);
      mostrar(r, soNumeros === true);
      if (!soNumeros) document.dispatchEvent(new CustomEvent('bz-painel:entrou'));
      $('estado').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.' + (r.aviso ? ' Atenção: ' + r.aviso + '.' : '');   /* (A9: o servidor leu só as páginas mais recentes de cada tabela) */
    }).catch(function (e) {
      if (recusada(e)) return;
      /* a chave não foi recusada, só as métricas falharam: o painel abre com o erro na linha das métricas e a fila
         de direções carrega assim mesmo (tem o próprio pedido e o próprio aviso de erro). Antes a fila só vinha
         junto com as métricas, e uma falha delas escondia pedidos esperando o prazo de 24 h (auditoria 2026-10-09) */
      var primeira = $('dados').hidden;
      /* sem resposta nenhuma (rede caiu) na primeira entrada, a chave nem foi conferida: fica na tela de entrar */
      /* sem resposta (rede caiu) ou erro que não é do servidor, na primeira entrada: volta à tela de entrar SEM apagar
         a chave guardada (o dono só tenta de novo); a mensagem diz o que houve */
      if (primeira && !(e.status >= 500)) { entrou(false); $('erroEntrar').hidden = false; $('erroEntrar').textContent = e.status ? e.message : 'Sem conexão com o servidor. Tente de novo.'; return; }
      entrou(true);
      $('estado').textContent = 'Não foi possível carregar as métricas: ' + e.message;
      if (primeira && soNumeros !== true) document.dispatchEvent(new CustomEvent('bz-painel:entrou'));
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
  document.querySelector('.pn__periodo').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-dias]');
    if (!b) return;
    dias = +b.getAttribute('data-dias');
    [].forEach.call(this.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    carregar();
  });
  $('baixarCsv').addEventListener('click', function () {
    var nome = $('nomeConversao').value.trim() || 'Cliente fechado';
    var cortado = false;
    pedir('?csv=ads&nome=' + encodeURIComponent(nome)).then(function (r) { cortado = r.headers.get('x-bz-cortado') === '1'; return r.blob(); }).then(function (b) {
      var a = el('a');
      a.href = URL.createObjectURL(b);
      a.download = 'conversoes-google-ads.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      if (cortado) $('estado').textContent = 'Atenção: o CSV tem só os 2.000 contatos mais recentes dos últimos 90 dias; os mais antigos ficaram de fora.';
    }).catch(function (e) { $('estado').textContent = e.message; });
  });
  try { $('naoContar').checked = localStorage.getItem('bz-nao-contar') !== '0'; } catch (e) { /* padrão: marcado */ }
  /* a fila manual das direções (js/painel-fila.js) usa o mesmo pedido autenticado */
  window.BZPainel = { pedir: pedir, el: el, data: data, recusada: recusada };
  if (chave) carregar();
})();
