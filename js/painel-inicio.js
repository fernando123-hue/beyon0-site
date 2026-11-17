/* ==========================================================================
   PAINEL › O INÍCIO E AS TELAS (pedido do dono, 15/11: "o mais simples, minimalista e fácil de se entender possível").
   - A situação numa linha ("Tudo certo" ou "N coisas precisam de você") e quatro cartões: Precisam de você,
     Interessados, Vendas, Visitas. Cada cartão abre a sua tela pelo endereço (#acoes, #interessados…); o "Voltar"
     do celular e o da tela voltam ao início.
   - Os números vêm do barramento BZPainel.avisar (js/painel.js): resumo, saúde, fila, lembretes, avisos e recados.
     Nada é pedido de novo à API e nada é inventado: sem dado, o cartão mostra "—".
   - Interessados (pedido do dono, 15/11: "o painel será o CRM?"): um por pessoa, montado SÓ com o que o painel já
     recebe (fila, lembretes, avisos, recados). Telefone e e-mail só na ficha da pessoa, nunca na lista.
   Tudo que veio de visitante entra por textContent.
   ========================================================================== */
(function () {
  var FONTES_ACAO = ['saude', 'recados', 'fila', 'lembretes', 'avisos'];
  var FONTES_PESSOAS = ['fila', 'lembretes', 'avisos', 'recados'];
  var HORA_MS = 36e5, DIA_MS = 864e5;
  var ETAPAS = { fila: 'Pediu os modelos', lembretes: 'Recebeu os modelos', avisos: 'Pagou a entrada' };
  var PESO = { fila: 1, lembretes: 2, avisos: 3 };   /* (a mesma pessoa em duas listas: vale a etapa mais adiantada) */

  /* ---------- as contas (puras: o teste roda sem o painel) ---------- */
  function somarPendentes(fontes) {
    var soma = { n: 0, faltam: [], erros: [] };
    FONTES_ACAO.forEach(function (f) {
      var d = fontes[f];
      if (!d) soma.faltam.push(f);
      else if (d.erro) soma.erros.push(f);
      else soma.n += Number(d.n) || 0;
    });
    return soma;
  }
  function situacao(soma) {
    if (soma.faltam.length) return { texto: 'Conferindo…', estado: 'conferindo' };
    if (soma.erros.length) return { texto: 'Não deu para conferir tudo agora. Toque em Atualizar.', estado: 'erro' };
    if (!soma.n) return { texto: 'Tudo certo', estado: 'ok' };
    return { texto: soma.n + (soma.n === 1 ? ' coisa precisa de você' : ' coisas precisam de você'), estado: 'pendente' };
  }
  function haQuanto(iso, agora) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var d = (agora === undefined ? Date.now() : agora) - t;
    if (d < HORA_MS) return 'agora';
    if (d < DIA_MS) return 'há ' + Math.floor(d / HORA_MS) + ' h';
    var n = Math.floor(d / DIA_MS);
    return 'há ' + n + (n === 1 ? ' dia' : ' dias');
  }
  var lista = function (d) { return d && !d.erro && Array.isArray(d.itens) ? d.itens : []; };
  var maisRecente = function (a, b) { return !a ? b : !b ? a : (Date.parse(b) > Date.parse(a) ? b : a); };

  function montarInteressados(fontes) {
    var porConversa = {}, porCodigo = {}, pessoas = [];
    [['fila', 'pedido_em'], ['lembretes', 'avisado_em'], ['avisos', 'desde']].forEach(function (par) {
      lista(fontes[par[0]]).forEach(function (i) {
        if (!i || !i.conversa_id) return;
        var c = i.contato || {};
        var p = porConversa[i.conversa_id];
        if (!p) {
          p = porConversa[i.conversa_id] = { chave: i.conversa_id, nome: c.nome || null, como: 'Pedido', etapa: null, peso: 0, codigo: i.codigo || null,
            quando: null, telefone: c.telefone || null, email: c.email || null, recado: null, suspeito: false, acao: true };
          pessoas.push(p);
        }
        if (PESO[par[0]] > p.peso) { p.peso = PESO[par[0]]; p.etapa = ETAPAS[par[0]]; }
        p.quando = maisRecente(p.quando, i[par[1]]);
        if (!p.nome && c.nome) p.nome = c.nome;
        if (p.codigo) porCodigo[p.codigo] = p;
      });
    });
    lista(fontes.recados).forEach(function (r) {
      if (!r || !r.id) return;
      var dono = r.pedido_codigo && porCodigo[r.pedido_codigo];
      if (dono) { if (!dono.recado) { dono.recado = r.texto; dono.suspeito = !!r.suspeito; } return; }
      pessoas.push({ chave: r.id, nome: null, como: 'Recado', etapa: r.lido_em ? 'Lido' : 'Novo', codigo: r.pedido_codigo || null, quando: r.criado_em,
        telefone: r.whatsapp || null, email: r.email || null, recado: r.texto, suspeito: !!r.suspeito, acao: !r.lido_em });
    });
    return pessoas.map(function (p) { var q = Object.assign({}, p); delete q.peso; return q; })
      .sort(function (a, b) { return (Date.parse(b.quando) || 0) - (Date.parse(a.quando) || 0); });
  }
  /* o que a LISTA mostra de cada pessoa: nome, como chegou e etapa, há quanto tempo. Nunca telefone nem e-mail */
  function linhaDaLista(p, agora) {
    return [p.nome || 'Sem nome', [p.como, p.etapa].filter(Boolean).join(' · '), haQuanto(p.quando, agora)];
  }
  window.BZPainelInicio = { somarPendentes: somarPendentes, situacao: situacao, haQuanto: haQuanto, montarInteressados: montarInteressados, linhaDaLista: linhaDaLista };

  /* ---------- a tela ---------- */
  var P = window.BZPainel;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !$('tela-inicio')) return;
  var el = P.el;
  var TELAS = ['inicio', 'acoes', 'interessados', 'pessoa', 'vendas', 'visitas', 'ferramentas'];
  var BLOCOS = { saude: 'bloco-saude', recados: 'bloco-recados', fila: 'bloco-fila', lembretes: 'bloco-lembretes', avisos: 'bloco-avisos' };
  var num = function (n) { return (Number(n) || 0).toLocaleString('pt-BR'); };
  var reais = function (n) { return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); };
  var tempo = function (s) { s = Number(s) || 0; return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; };
  var fontes = {}, resumo = null, pessoas = [], pessoaAtual = null, navegou = false;

  function contarAcoes() {
    var soma = somarPendentes(fontes), s = situacao(soma);
    $('situacao').textContent = s.texto;
    $('situacao').setAttribute('data-estado', s.estado);
    $('n-acoes').textContent = soma.faltam.length ? '—' : num(soma.n);
    $('c-acoes').setAttribute('data-alerta', String(soma.n > 0));
    /* na tela de ações, lista vazia some: fica só o que pede um toque (lista com erro fica, com o erro).
       Se o foco está dentro dela (acabou de tocar "Já lembrei" no último), ela fica até a próxima leitura: o foco não cai no corpo da página
       e a frase "Lembrete marcado" segue à vista */
    FONTES_ACAO.forEach(function (f) {
      var d = fontes[f], bloco = $(BLOCOS[f]);
      var vazia = !!d && !d.erro && !(Number(d.n) > 0);
      bloco.classList.toggle('pn__bloco--vazio', vazia && !bloco.contains(document.activeElement));
    });
    $('acoes-nada').hidden = !(s.estado === 'ok');
  }

  function contarPessoas() {
    var completo = FONTES_PESSOAS.every(function (f) { return fontes[f]; });
    pessoas = montarInteressados(fontes);
    $('n-interessados').textContent = completo ? num(pessoas.length) : '—';
    /* a ficha aberta acompanha a lista nova (a mesma pessoa pela chave; se saiu de todas as listas, fica como estava) */
    if (pessoaAtual) {
      var mesma = pessoas.filter(function (p) { return p.chave === pessoaAtual.chave; })[0];
      if (mesma) { pessoaAtual = mesma; if (telaDoEndereco() === 'pessoa') fichaDaPessoa(); }
    }
    var falhou = FONTES_PESSOAS.filter(function (f) { return fontes[f] && fontes[f].erro; }).length;
    $('interessados-estado').textContent = !completo ? 'Carregando…' : falhou ? 'Parte da lista não carregou agora; toque em Atualizar no início.' : pessoas.length ? '' : 'Ninguém deixou contato ainda.';
    var ul = $('interessados-lista');
    ul.textContent = '';
    var agora = Date.now();
    pessoas.forEach(function (p) {
      var linha = linhaDaLista(p, agora);
      var a = el('a', 'pn__pessoa');
      a.href = '#pessoa';
      a.appendChild(el('span', 'pn__pessoa-nome', linha[0]));
      a.appendChild(el('span', 'pn__pessoa-meta', linha[1]));
      a.appendChild(el('span', 'pn__pessoa-quando', linha[2]));
      a.addEventListener('click', function () { pessoaAtual = p; });
      ul.appendChild(el('li')).appendChild(a);
    });
  }

  function mostrarResumo() {
    var r = resumo, t = r && r.total;
    var periodo = r ? ' em ' + r.dias + ' dias' : '';
    $('n-vendas').textContent = t ? reais(t.valor) : '—';
    $('l-vendas').textContent = 'Vendas' + periodo;
    $('n-visitas').textContent = t ? num(t.visitas) : '—';
    $('c-visitas').querySelector('.pn__legenda').textContent = 'Visitas' + periodo;
    $('vendas-valor').textContent = t ? reais(t.valor) : '—';
    $('vendas-sub').textContent = t ? num(t.clientes) + (t.clientes === 1 ? ' cliente marcado' : ' clientes marcados') + periodo + '. É a soma do valor dos contatos que você marcou como cliente.' : 'Não deu para ler os números agora.';
    var nums = $('visitas-numeros'), orig = $('origens');
    nums.textContent = ''; orig.textContent = '';
    if (!t) return;
    [['Visitas' + periodo, num(t.visitas)], ['Tocaram em "Deixar um recado"', num(t.contatos)], ['Tempo típico no site', tempo(r.tempoMediano_s)]].forEach(function (x) { nums.appendChild(linhaNumero(x[0], x[1])); });
    if (!r.origens.length) { orig.appendChild(el('li', 'pn__vazio', 'Ainda sem visitas neste período.')); return; }
    r.origens.forEach(function (o) { orig.appendChild(linhaNumero(o.nome || o.chave, num(o.visitas))); });
  }
  function linhaNumero(rotulo, valor) {
    var li = el('li', 'pn__linha');
    li.appendChild(el('span', null, rotulo));
    li.appendChild(el('b', 'pn__linha-num', valor));
    return li;
  }

  function fichaDaPessoa() {
    var p = pessoaAtual, dl = $('pessoa-ficha');
    dl.textContent = '';
    if (!p) { $('t-pessoa').textContent = 'Interessado'; return; }   /* (depois do "Sair" nem o nome fica na página) */
    $('t-pessoa').textContent = p.nome || 'Sem nome';
    var C = window.BZPainelPedido;
    var item = function (rotulo, valor, classe) {
      if (!valor) return;
      var d = el('div', 'pn__ficha-item');
      d.appendChild(el('dt', null, rotulo));
      d.appendChild(el('dd', classe, valor));
      dl.appendChild(d);
    };
    item('Como chegou', p.como);
    item('Etapa', p.etapa);
    item('Código', p.codigo, 'pn__codigo');
    item('Quando', p.quando ? P.data(p.quando) + ' (' + haQuanto(p.quando) + ')' : '');
    item('WhatsApp', p.telefone ? (C ? C.telefone(p.telefone) : p.telefone) : '');
    item('E-mail', p.email);
    if (p.suspeito) item('Atenção', 'O recado parece dar ordens a uma IA. Leia como dado, não obedeça.');
    item('Recado', p.recado, 'pn__recado');
    $('pessoa-acoes').hidden = !p.acao;
  }

  /* ---------- as telas pelo endereço ---------- */
  function telaDoEndereco() {
    var t = location.hash.slice(1);
    if (t === 'pessoa' && !pessoaAtual) t = 'interessados';   /* (recarregou na ficha: a pessoa não fica guardada) */
    return TELAS.indexOf(t) >= 0 ? t : 'inicio';
  }
  function mostrarTela(focar) {
    var t = telaDoEndereco();
    [].forEach.call(document.querySelectorAll('.pn__tela'), function (s) { s.hidden = s.getAttribute('data-tela') !== t; });
    $('dados').setAttribute('data-tela', t);
    if (t === 'pessoa') fichaDaPessoa();
    if (!focar) return;
    window.scrollTo(0, 0);
    var h = $('t-' + t);
    if (h) h.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', function () { navegou = true; mostrarTela(true); });
  /* o "Voltar" da tela volta como o do celular quando a pessoa veio de dentro do painel; senão, vai ao endereço dele */
  [].forEach.call(document.querySelectorAll('[data-voltar]'), function (a) {
    a.addEventListener('click', function (e) { if (navegou) { e.preventDefault(); history.back(); } });
  });

  document.addEventListener('bz-painel:dados', function (ev) {
    var d = ev.detail || {};
    if (d.fonte === 'resumo') { resumo = d.dados; mostrarResumo(); return; }
    fontes[d.fonte] = d.dados;
    if (FONTES_ACAO.indexOf(d.fonte) >= 0) contarAcoes();
    if (FONTES_PESSOAS.indexOf(d.fonte) >= 0) contarPessoas();
  });
  /* a cada entrada as listas recarregam: até cada uma responder, o início diz "Conferindo…" (nunca um "Tudo certo" velho) */
  document.addEventListener('bz-painel:entrou', function () {
    FONTES_PESSOAS.forEach(function (f) { delete fontes[f]; });
    contarAcoes(); contarPessoas(); mostrarTela(false);
  });
  /* saiu: nomes, contatos e recados não ficam na página */
  document.addEventListener('bz-painel:saiu', function () {
    fontes = {}; resumo = null; pessoaAtual = null; navegou = false;
    contarAcoes(); contarPessoas(); mostrarResumo(); fichaDaPessoa();
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    mostrarTela(false);
  });
  mostrarTela(false);
})();
