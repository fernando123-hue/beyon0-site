/* ==========================================================================
   PAINEL › ATENDENTE DO SITE DO CLIENTE: criar cliente, editar base (perguntas e tabela de preços), domínios e cores, e ler as conversas
   e os contatos. Lê GET /api/painel?fila=atendente | ?atendente=<id> | ?atendente-conversas=<id> e grava com POST {atendente_salvar: {...}}.
   Tudo o que vem do banco (nome, base, conversas) é de terceiros: entra SEMPRE por textContent/value, nunca innerHTML.
   ========================================================================== */
(function () {
  var P = window.BZPainel;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !$('atendente')) return;
  var el = P.el;
  var editando = null;   /* o cliente aberto no formulário: { id, publico } ou null (novo) */

  /* "P: pergunta / R: resposta" em blocos separados por linha em branco; "Item | 180,00" uma por linha */
  function lerBase() {
    var base = [], erro = null;
    $('at-perguntas').value.split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean).forEach(function (b) {
      var m = /^P:\s*([\s\S]+?)\s*\n\s*R:\s*([\s\S]+)$/.exec(b);
      if (!m) { erro = 'Cada pergunta precisa de "P:" numa linha e "R:" na linha de baixo.'; return; }
      base.push({ tipo: 'pergunta', pergunta: m[1].trim(), resposta: m[2].trim() });
    });
    $('at-precos').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (l) {
      var i = l.lastIndexOf('|');
      if (i < 1) { erro = 'Cada preço vai numa linha: "Nome do serviço | 180,00".'; return; }
      base.push({ tipo: 'preco', item: l.slice(0, i).trim(), valor: l.slice(i + 1).trim() });
    });
    return { base: base, erro: erro };
  }
  function textoDaBase(base) {
    var q = [], p = [];
    base.forEach(function (b) {
      if (b.tipo === 'pergunta') q.push('P: ' + b.pergunta + '\nR: ' + b.resposta);
      else p.push(b.item + ' | ' + (b.preco_centavos / 100).toFixed(2).replace('.', ','));
    });
    return { perguntas: q.join('\n\n'), precos: p.join('\n') };
  }

  function preencher(c) {
    editando = c ? { id: c.id, publico: c.publico } : null;
    $('at-titulo-form').textContent = c ? 'Editar: ' + c.nome : 'Novo cliente';
    $('at-nome').value = c ? c.nome : '';
    $('at-whatsapp').value = c && c.whatsapp ? c.whatsapp : '';
    $('at-privacidade').value = c && c.privacidade_url ? c.privacidade_url : '';
    $('at-saudacao').value = c && c.saudacao ? c.saudacao : '';
    $('at-cor').value = c ? c.cor : '#1a1a1a';
    $('at-cor-texto').value = c ? c.cor_texto : '#ffffff';
    $('at-teto').value = c ? c.teto_dia_usd : '1';
    $('at-ativo').checked = c ? c.ativo : true;
    $('at-dominios').value = c ? c.dominios.join('\n') : '';
    var t = textoDaBase(c ? c.base : []);
    $('at-perguntas').value = t.perguntas; $('at-precos').value = t.precos;
    mostrarCodigo();
  }
  function mostrarCodigo() {
    var alvo = $('at-codigo');
    alvo.textContent = editando ? '<script src="' + location.origin + '/js/atendente-balao.js" charset="utf-8" data-cliente="' + editando.publico + '" defer></script>' : '';
    $('at-codigo-bloco').hidden = !editando;
  }

  function salvar() {
    var b = lerBase();
    if (b.erro) { $('at-estado').textContent = b.erro; return; }
    var corpo = {
      nome: $('at-nome').value, whatsapp: $('at-whatsapp').value, privacidade_url: $('at-privacidade').value.trim(), saudacao: $('at-saudacao').value,
      cor: $('at-cor').value, cor_texto: $('at-cor-texto').value, teto_dia_usd: $('at-teto').value.trim() === '' ? 1 : Number($('at-teto').value.replace(',', '.')), ativo: $('at-ativo').checked,
      dominios: $('at-dominios').value.split('\n').map(function (d) { return d.trim(); }).filter(Boolean), base: b.base
    };
    if (editando) corpo.id = editando.id;
    $('at-salvar').disabled = true;
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ atendente_salvar: corpo }) })
      .then(function (x) { return x.json(); })
      .then(function (r) { editando = { id: r.id, publico: r.publico }; mostrarCodigo(); $('at-estado').textContent = 'Salvo.'; $('at-salvar').disabled = false; carregarLista(); })
      .catch(function (e) { $('at-salvar').disabled = false; if (P.recusada(e)) return; $('at-estado').textContent = e.message; });
  }

  function botao(texto, fn) { var b = el('button', 'pn__btn pn__btn--fino', texto); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function abrir(id) {
    $('at-estado').textContent = 'Abrindo…';
    P.pedir('?atendente=' + encodeURIComponent(id)).then(function (x) { return x.json(); })
      .then(function (c) { preencher(c); $('at-estado').textContent = ''; $('at-form').hidden = false; $('at-nome').focus(); })
      .catch(function (e) { if (!P.recusada(e)) $('at-estado').textContent = e.message; });
  }
  function conversas(c) {
    $('at-estado').textContent = 'Carregando as conversas…';
    P.pedir('?atendente-conversas=' + encodeURIComponent(c.id)).then(function (x) { return x.json(); }).then(function (r) {
      var alvo = $('at-conversas'); alvo.textContent = '';
      alvo.appendChild(el('h3', null, 'Conversas de ' + c.nome + ' (gasto de hoje: US$ ' + Number(r.gasto_hoje_usd).toFixed(4) + ')'));
      if (!r.conversas.length) alvo.appendChild(el('p', 'pn__ajuda', 'Nenhuma conversa ainda.'));
      r.conversas.forEach(function (v) {
        var caixa = el('div', 'pn__alerta pn__fila');
        var t = el('div', 'pn__fila-texto');
        t.appendChild(el('p', 'pn__fila-meta', 'Conversa ' + v.id + ' · ' + P.data(v.criado_em)));
        v.mensagens.forEach(function (m) { t.appendChild(el('p', 'pn__dado', (m.papel === 'visitante' ? 'Visitante: ' : 'Atendente: ') + m.texto)); });
        caixa.appendChild(t); alvo.appendChild(caixa);
      });
      alvo.appendChild(el('h3', null, 'Contatos deixados'));
      if (!r.contatos.length) alvo.appendChild(el('p', 'pn__ajuda', 'Nenhum contato ainda.'));
      r.contatos.forEach(function (k) { alvo.appendChild(el('p', 'pn__dado', P.data(k.criado_em) + ' · ' + k.nome + ' · ' + k.telefone)); });
      $('at-estado').textContent = '';
    }).catch(function (e) { if (!P.recusada(e)) $('at-estado').textContent = e.message; });
  }

  var vez = 0;
  function carregarLista() {
    var minha = ++vez;
    P.pedir('?fila=atendente').then(function (x) { return x.json(); }).then(function (r) {
      if (minha !== vez) return;
      var alvo = $('at-lista'); alvo.textContent = '';
      $('atendente').hidden = false;
      r.itens.forEach(function (c) {
        var caixa = el('div', 'pn__alerta pn__fila');
        var t = el('div', 'pn__fila-texto');
        t.appendChild(el('p', 'pn__fila-meta', (c.ativo ? 'Ativo' : 'Desligado') + ' · ' + c.conversas + ' conversas · ' + c.contatos + ' contatos'));
        t.appendChild(el('p', 'pn__dado', c.nome));
        caixa.appendChild(t);
        var a = el('div', 'pn__fila-acoes');
        a.appendChild(botao('Editar', function () { abrir(c.id); }));
        a.appendChild(botao('Conversas e contatos', function () { conversas(c); }));
        caixa.appendChild(a); alvo.appendChild(caixa);
      });
      if (!r.itens.length) alvo.appendChild(el('p', 'pn__ajuda', 'Nenhum cliente ainda.'));
    }).catch(function (e) { if (minha !== vez || P.recusada(e)) return; $('atendente').hidden = false; $('at-estado').textContent = e.message; });
  }
  /* saiu do painel: nada de conversa nem de número fica na página */
  function esvaziar() { vez++; ['at-lista', 'at-conversas'].forEach(function (i) { $(i).textContent = ''; }); preencher(null); $('at-form').hidden = true; $('at-estado').textContent = ''; $('atendente').hidden = true; }

  $('at-novo').addEventListener('click', function () { preencher(null); $('at-form').hidden = false; $('at-nome').focus(); });
  $('at-salvar').addEventListener('click', salvar);
  $('at-atualizar').addEventListener('click', carregarLista);
  document.addEventListener('bz-painel:entrou', carregarLista);
  document.addEventListener('bz-painel:saiu', esvaziar);
})();
