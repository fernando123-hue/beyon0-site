/* ==========================================================================
   BALÃO DO ATENDENTE (um <script> só, sem dependências) — cola-se no site do CLIENTE:
     <script src="https://…/js/atendente-balao.js" data-cliente="at_…" defer></script>
   • Sem segredo: o id do cliente é público; quem protege é o domínio cadastrado e os tetos da API (api/atendente.mjs).
   • Isolado do CSS da página: Shadow DOM fechado, estilos por CSSStyleSheet construído (a CSP do site do cliente não bloqueia o CSSOM).
   • Nenhum innerHTML: o texto do visitante e da IA entra só por textContent; o link do WhatsApp só se começar por https://wa.me/.
   • Sem desfoque e sem sombra: uma linha de 1px. Celular primeiro (tela cheia embaixo até 480px), alvos de 44px, fonte de 16px nos campos.
   • Acessível: botão com rótulo, diálogo com nome, lista de mensagens em role=log/aria-live, Esc fecha e devolve o foco, foco visível.
   ========================================================================== */
(function () {
  'use strict';
  var tag = document.currentScript;
  if (!tag || window.__bzAtendente) return;
  var id = tag.getAttribute('data-cliente') || '';
  if (!/^at_[0-9a-f]{32}$/.test(id)) return;
  window.__bzAtendente = true;
  var api = new URL(tag.src).origin + '/api/atendente?c=' + id;
  var COR = /^#[0-9a-f]{6}$/;
  var MAX = 1000;

  var CSS = [
    ':host{all:initial}',
    '*,*::before,*::after{box-sizing:border-box}',
    '.raiz{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a1a}',
    'button,input{font:inherit;color:inherit}',
    '.abrir{width:56px;height:56px;border-radius:50%;border:1px solid var(--cor-texto);background:var(--cor);color:var(--cor-texto);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
    '.abrir svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.painel{display:none;flex-direction:column;position:fixed;left:0;right:0;bottom:0;height:min(85dvh,640px);background:#fff;border:1px solid #1a1a1a;border-radius:12px 12px 0 0}',
    '.raiz.aberto .painel{display:flex}',
    '.raiz.aberto .abrir{display:none}',
    '@media (min-width:481px){.painel{position:absolute;left:auto;right:0;bottom:0;width:360px;height:min(560px,calc(100dvh - 32px));border-radius:12px}}',
    '.topo{background:var(--cor);color:var(--cor-texto);padding:10px 12px;display:flex;align-items:flex-start;gap:8px;border-radius:11px 11px 0 0}',
    '.topo-texto{flex:1;min-width:0}',
    '.etiqueta{font-weight:600;overflow-wrap:anywhere}',
    '.aviso{font-size:13px;opacity:.9}',
    '.aviso a{color:inherit;text-decoration:underline}',
    '.fechar{flex:none;width:44px;height:44px;margin:-6px -6px 0 0;border:0;background:transparent;color:inherit;cursor:pointer;font-size:24px;line-height:1}',
    '.msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}',
    '.m{max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #d0d0d0}',
    '.m.ia{align-self:flex-start;background:#f3f3f3}',
    '.m.eu{align-self:flex-end;background:var(--cor);color:var(--cor-texto);border-color:var(--cor)}',
    '.estado{font-size:13px;color:#555;padding:0 12px 4px;min-height:20px}',
    '.acoes{padding:0 12px 8px;display:flex;flex-direction:column;gap:8px}',
    '.acoes[hidden]{display:none}',
    '.btn{display:flex;align-items:center;justify-content:center;min-height:44px;padding:8px 14px;border-radius:8px;border:1px solid #1a1a1a;background:#fff;cursor:pointer;text-decoration:none;text-align:center}',
    '.btn.forte{background:var(--cor);color:var(--cor-texto);border-color:var(--cor)}',
    '.contato{display:flex;flex-direction:column;gap:8px}',
    '.contato[hidden]{display:none}',
    '.form{display:flex;gap:8px;padding:8px 12px 12px;border-top:1px solid #d0d0d0}',
    'input{flex:1;min-width:0;min-height:44px;padding:8px 10px;border:1px solid #1a1a1a;border-radius:8px;background:#fff}',
    '.form .btn{flex:none}',
    ':focus-visible{outline:3px solid #0b57d0;outline-offset:2px}',
    '.so-leitor{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
  ].join('\n');

  function el(nome, props, filhos) {
    var e = document.createElement(nome);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'texto') e.textContent = props[k];
      else if (k === 'classe') e.className = props[k];
      else e.setAttribute(k, props[k]);
    });
    (filhos || []).forEach(function (f) { e.appendChild(f); });
    return e;
  }
  function icone() {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z');
    s.appendChild(p);
    return s;
  }
  function guardar(chave, valor) { try { if (valor === undefined) return sessionStorage.getItem(chave); sessionStorage.setItem(chave, valor); } catch (e) { return null; } return null; }

  var cfg = { nome: 'o negócio', saudacao: null, cor: '#1a1a1a', cor_texto: '#ffffff', privacidade_url: null };
  var conversa = guardar('bz-atendente-' + id);
  var ocupado = false;

  var host = document.createElement('div');
  host.setAttribute('data-bz-atendente', '');
  var sombra = host.attachShadow({ mode: 'closed' });
  try { var folha = new CSSStyleSheet(); folha.replaceSync(CSS); sombra.adoptedStyleSheets = [folha]; }
  catch (e) { var st = document.createElement('style'); st.textContent = CSS; sombra.appendChild(st); }

  var raiz = el('div', { classe: 'raiz' });
  var abrir = el('button', { type: 'button', classe: 'abrir', 'aria-label': 'Abrir o atendimento virtual', 'aria-expanded': 'false' }, [icone()]);
  var etiqueta = el('div', { classe: 'etiqueta', texto: 'Assistente virtual' });
  var aviso = el('div', { classe: 'aviso', texto: 'As conversas ficam guardadas.' });
  var fechar = el('button', { type: 'button', classe: 'fechar', 'aria-label': 'Fechar o atendimento', texto: '×' });
  var painel = el('div', { classe: 'painel', role: 'dialog', 'aria-label': 'Atendimento virtual' }, [
    el('div', { classe: 'topo' }, [el('div', { classe: 'topo-texto' }, [etiqueta, aviso]), fechar])
  ]);
  var msgs = el('div', { classe: 'msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa' });
  var estado = el('div', { classe: 'estado', role: 'status' });
  var acoes = el('div', { classe: 'acoes' });
  acoes.hidden = true;
  var form = el('form', { classe: 'form' });
  var rotulo = el('label', { for: 'bz-texto', classe: 'so-leitor', texto: 'Sua mensagem' });
  var campo = el('input', { id: 'bz-texto', type: 'text', maxlength: String(MAX), autocomplete: 'off', placeholder: 'Escreva sua dúvida' });
  var enviar = el('button', { type: 'submit', classe: 'btn forte', texto: 'Enviar' });
  [rotulo, campo, enviar].forEach(function (n) { form.appendChild(n); });
  [msgs, estado, acoes, form].forEach(function (n) { painel.appendChild(n); });
  raiz.appendChild(abrir); raiz.appendChild(painel);
  sombra.appendChild(raiz);

  function cores() {
    var c = COR.test(cfg.cor) ? cfg.cor : '#1a1a1a', t = COR.test(cfg.cor_texto) ? cfg.cor_texto : '#ffffff';
    raiz.style.setProperty('--cor', c); raiz.style.setProperty('--cor-texto', t);
  }
  function mostrarTopo() {
    etiqueta.textContent = 'Assistente virtual · ' + cfg.nome;
    aviso.textContent = 'As conversas ficam guardadas.';
    if (/^https:\/\//.test(cfg.privacidade_url || '')) {
      aviso.appendChild(document.createTextNode(' '));
      aviso.appendChild(el('a', { href: cfg.privacidade_url, target: '_blank', rel: 'noopener noreferrer', texto: 'Privacidade' }));
    }
  }
  function bolha(quem, texto) {
    msgs.appendChild(el('div', { classe: 'm ' + quem, texto: texto }));
    msgs.scrollTop = msgs.scrollHeight;
  }
  function limparAcoes() { while (acoes.firstChild) acoes.removeChild(acoes.firstChild); acoes.hidden = true; }

  function passagem(url) {
    limparAcoes();
    if (typeof url === 'string' && url.indexOf('https://wa.me/') === 0) {
      acoes.appendChild(el('a', { classe: 'btn forte', href: url, target: '_blank', rel: 'noopener noreferrer', texto: 'Continuar no WhatsApp' }));
    }
    var abrirContato = el('button', { type: 'button', classe: 'btn', texto: 'Prefiro deixar meu contato' });
    var nome = el('input', { type: 'text', 'aria-label': 'Seu nome', placeholder: 'Seu nome', maxlength: '80', autocomplete: 'name' });
    var tel = el('input', { type: 'tel', 'aria-label': 'Seu telefone com DDD', placeholder: 'Telefone com DDD', maxlength: '20', autocomplete: 'tel' });
    var ok = el('button', { type: 'button', classe: 'btn forte', texto: 'Enviar contato' });
    var caixa = el('div', { classe: 'contato' }, [nome, tel, ok]);
    caixa.hidden = true;
    abrirContato.addEventListener('click', function () { caixa.hidden = false; abrirContato.hidden = true; nome.focus(); });
    ok.addEventListener('click', function () {
      var dig = tel.value.replace(/\D/g, '');
      if (!nome.value.trim() || dig.length < 10) { estado.textContent = 'Confira o nome e o telefone com DDD.'; return; }
      ok.disabled = true;
      chamar('contato', { conversa_id: conversa, nome: nome.value.trim(), telefone: tel.value }).then(function () {
        limparAcoes(); bolha('ia', 'Pronto, deixei seu contato para a equipe. Ela vai te chamar.'); estado.textContent = '';
      }).catch(function () { ok.disabled = false; estado.textContent = 'Não consegui enviar o contato agora. Tente de novo.'; });
    });
    acoes.appendChild(abrirContato); acoes.appendChild(caixa);
    acoes.hidden = false;
  }

  function chamar(acao, corpo) {
    return fetch(api + '&acao=' + acao, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(String(r.status)); return j; }); });
  }

  function enviarMensagem(texto) {
    ocupado = true; enviar.disabled = true; limparAcoes();
    bolha('eu', texto); estado.textContent = 'Escrevendo…';
    var corpo = { texto: texto }; if (conversa) corpo.conversa_id = conversa;
    chamar('mensagem', corpo).then(function (j) {
      if (typeof j.conversa_id === 'string') { conversa = j.conversa_id; guardar('bz-atendente-' + id, conversa); }
      estado.textContent = '';
      bolha('ia', String(j.resposta || ''));
      if (j.passar_para_pessoa) passagem(j.whatsapp_url);
    }).catch(function () {
      estado.textContent = 'Não consegui enviar agora. Confira a conexão e tente de novo.';
    }).then(function () { ocupado = false; enviar.disabled = false; campo.focus(); });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = campo.value.trim();
    if (!t || ocupado) return;
    campo.value = '';
    enviarMensagem(t.slice(0, MAX));
  });
  function abrirPainel() {
    raiz.classList.add('aberto'); abrir.setAttribute('aria-expanded', 'true');
    if (!msgs.firstChild) bolha('ia', cfg.saudacao || 'Oi! Posso ajudar com dúvidas sobre ' + cfg.nome + '. Sou um assistente virtual.');
    campo.focus();
  }
  function fecharPainel() { raiz.classList.remove('aberto'); abrir.setAttribute('aria-expanded', 'false'); abrir.focus(); }
  abrir.addEventListener('click', abrirPainel);
  fechar.addEventListener('click', fecharPainel);
  painel.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fecharPainel(); } });

  cores();
  fetch(api + '&acao=config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (j) {
      cfg = { nome: String(j.nome || cfg.nome), saudacao: j.saudacao ? String(j.saudacao) : null, cor: j.cor, cor_texto: j.cor_texto, privacidade_url: j.privacidade_url };
      cores(); mostrarTopo();
      document.body.appendChild(host);   /* só aparece se a API reconhece o cliente e o domínio: senão, nada na página */
    }).catch(function () { /* domínio não cadastrado ou API fora: o site do cliente segue sem balão */ });
})();
