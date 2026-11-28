/* MAPA VIVO v2, fase 1a NA PÁGINA: enquanto a pessoa digita, as peças do que ela conta (Instagram, WhatsApp, agenda, sinal...) acendem numa
   fileira logo acima da caixa, só no aparelho, sem rede e sem IA (especificação no cofre: 01 Empresa/Mapa vivo v2 - especificação
   2026-11-21.md, "Fase 1a"). js/orcamento.js chama BZOrcReacao.atualizar(E) a cada render().
   - Só com a flag BZ_PLANTA ligada (o estado traz planta_editavel; hoje só na prévia) e com as peças e o leitor de canais já na página (o
     esboço, js/orcamento-planta-esboco.js, os baixa depois da 1ª fala do Zero). Desligada, nada é baixado nem ouvido: a tela é a de hoje.
   - O leitor (js/mapa-vivo-ler.js) vem sob demanda, de URL CONSTANTE, uma vez.
   - A fileira é decoração do que a pessoa mesma escreveu: aria-hidden (o leitor de tela já lê a caixa).
   - Lê com 250 ms de pausa na digitação; caixa vazia (depois de enviar) apaga a fileira.
   - Falha fechada: qualquer erro tira a fileira, com aviso "[beyon] reacao". ES5.
   FASE 3, PR 2 (o nó em esboço; plano docs/superpowers/plans/2026-11-28-mapa-vivo-fase3-pr2-desenho.md): com o mapa oficial na página (E.planta
   de forma v3 e window.BZMapa), baixa js/oracao.js e js/mapa-ajuste.js (URL CONSTANTE, uma vez, em ordem; falhou: sem esboço, sem nova
   tentativa). Na mesma pausa da fileira, rotear(texto) + aplicarAjuste(oficial) viram BZMapa.atualizar(plano, { rascunho: true }); nada
   roteado com esboço na tela: o oficial volta (calado). O Enter (submit) firma o esboço; quando o Zero responde (+2 mensagens) com o MESMO
   plano oficial, o oficial volta; com plano novo, quem desenha é a cola da planta (js/orcamento-planta.js). Tudo local: nada sai do aparelho.
   Erro no esboço: ele desliga com aviso "[beyon] ajuste" e a fileira segue. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcReacao = api.criar(raiz);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var LEITOR = 'js/mapa-vivo-ler.js';
  /* o ajuste no aparelho, nesta ordem (o mapa-ajuste lê o BZOracao ao carregar); o BZMapaForma já veio com o mapa (js/orcamento-planta.js, v3) */
  var AJUSTE = [{ src: 'js/oracao.js', global: 'BZOracao' }, { src: 'js/mapa-ajuste.js', global: 'BZMapaAjuste' }];
  var ESPERA = 250, NOVA_MS = 1200;
  var NS = 'http://www.w3.org/2000/svg';
  var ehObjeto = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
  /* a flag: com ela ligada o estado sempre traz planta_editavel (api/_vendas/fluxo.mjs); desligada, a chave nem existe */
  var ligada = function (E) { return ehObjeto(E) && typeof E.planta_editavel === 'boolean'; };

  function criar(win) {
    var doc = win.document;
    var st = { carga: 'nao', fila: null, campo: null, timer: 0, ouvindo: false, falhou: false, E: null, espera: 0, tentativas: 0, novas: [] };
    /* o esboço: oficial (o plano validado de E.planta), esboco (o plano em esboço na tela), firme (o esboço firmado no Enter) e firmeEm (quantas
       mensagens havia no Enter) */
    var aj = { carga: 'nao', falhou: false, oficial: null, oficialJson: '', chave: '', esboco: null, esbocoJson: '', doServidor: '', firme: null, firmeEm: 0, form: null, ouveFalha: false };
    var $ = function (id) { return doc.getElementById(id); };

    function falhar(e) {
      st.falhou = true;
      tirar();
      if (win.console) win.console.warn('[beyon] reacao', e && e.message ? e.message : e);
    }
    function tirar() {
      if (st.fila && st.fila.parentNode) st.fila.parentNode.removeChild(st.fila);
      st.fila = null;
      if (st.campo && st.ouvindo) st.campo.removeEventListener('input', aoDigitar);
      st.ouvindo = false;
      win.clearTimeout(st.timer);
      st.novas.forEach(function (id) { win.clearTimeout(id); });   /* (os timers da peça nova saem com a fileira) */
      st.novas = [];
    }
    /* uma peça: o ícone de js/planta-pecas.js (traço) e o nome curto */
    function pecaEl(p) {
      var li = doc.createElement('li'), svg = doc.createElementNS(NS, 'svg');
      li.className = 'orc-reacao__peca';
      li.setAttribute('data-codigo', p.codigo);
      svg.setAttribute('viewBox', '0 0 40 40');
      svg.setAttribute('focusable', 'false');
      (win.BZPlantaPecas.desenhar(p.peca) || []).forEach(function (tr) {
        var path = doc.createElementNS(NS, 'path');
        path.setAttribute('d', tr.d);
        if (tr.ac) path.setAttribute('class', 'ac');
        svg.appendChild(path);
      });
      li.appendChild(svg);
      var nome = doc.createElement('span');
      nome.className = 'orc-reacao__nome';
      nome.textContent = p.nome;
      li.appendChild(nome);
      return li;
    }
    /* lê a caixa e acende o que é novo; o que deixou de valer sai */
    function reagir() {
      try {
        if (!st.fila || !win.BZMapaVivoLer) return;
        var agora = win.BZMapaVivoLer.ler(st.campo.value).pecas;
        var cods = agora.map(function (p) { return p.codigo; });
        var acesas = [];
        [].slice.call(st.fila.children).forEach(function (li) {
          var c = li.getAttribute('data-codigo');
          if (cods.indexOf(c) < 0) st.fila.removeChild(li); else acesas.push(c);
        });
        agora.forEach(function (p) {
          if (acesas.indexOf(p.codigo) >= 0) return;
          var li = pecaEl(p);
          li.classList.add('is-nova');
          st.fila.appendChild(li);
          var id = win.setTimeout(function () { li.classList.remove('is-nova'); st.novas = st.novas.filter(function (x) { return x !== id; }); }, NOVA_MS);
          st.novas.push(id);
        });
        caber();
      } catch (e) { falhar(e); }
    }
    /* numa linha só: se as peças com o nome não cabem (320 px com 3 ou mais), ficam só os ícones; nenhuma peça cortada na borda */
    function caber() {
      st.fila.classList.remove('is-compacta');
      if ((st.fila.scrollWidth || 0) > (st.fila.clientWidth || 0) + 1) st.fila.classList.add('is-compacta');
    }
    function aoDigitar() { win.clearTimeout(st.timer); st.timer = win.setTimeout(function () { reagir(); esbocar(); }, ESPERA); }

    function carregarLeitor() {
      if (win.BZMapaVivoLer) { st.carga = 'pronta'; return; }
      if (st.carga !== 'nao') return;
      st.carga = 'baixando';
      var s = doc.createElement('script');
      s.src = LEITOR;
      s.async = true;
      s.onload = function () { st.carga = win.BZMapaVivoLer ? 'pronta' : 'falhou'; if (st.carga === 'pronta') reagir(); };
      s.onerror = function () { st.carga = 'falhou'; };
      doc.head.appendChild(s);
    }

    /* ---------- o nó em esboço (Fase 3, PR 2) ---------- */
    function falharAjuste(e) {
      aj.falhou = true;
      aj.esboco = null; aj.esbocoJson = ''; aj.doServidor = ''; aj.firme = null;
      if (win.console) win.console.warn('[beyon] ajuste', e && e.message ? e.message : e);
    }
    /* o plano oficial que a tela mostra: o de E.planta, com a forma do mapa (v3) e o desenho na página; senão, nada de esboço */
    function oficialDe(E) {
      var p = ehObjeto(E) ? E.planta : null;
      if (!ehObjeto(p) || !ehObjeto(p.plano) || !win.BZMapa || !win.BZMapaForma) return null;
      var v = win.BZMapaForma.validarFormaMapa(p.plano);
      return v && v.ok ? v.plano : null;
    }
    function carregarAjuste() {
      if (aj.carga !== 'nao') return;
      aj.carga = 'baixando';
      (function proximo(k) {
        if (k >= AJUSTE.length) { aj.carga = win.BZMapaAjuste ? 'pronta' : 'falhou'; if (aj.carga === 'pronta' && st.campo && st.campo.value.trim()) esbocar(); return; }
        if (win[AJUSTE[k].global]) { proximo(k + 1); return; }
        var s = doc.createElement('script');
        s.src = AJUSTE[k].src;
        s.async = false;
        s.onload = function () { if (win[AJUSTE[k].global]) proximo(k + 1); else aj.carga = 'falhou'; };
        s.onerror = function () { aj.carga = 'falhou'; };
        doc.head.appendChild(s);
      })(0);
    }
    /* o mapa volta ao oficial, calado (sem status, sem luz): o esboço sai de cena */
    function voltarAoOficial() {
      aj.esboco = null; aj.esbocoJson = ''; aj.doServidor = ''; aj.firme = null;
      if (aj.oficial) win.BZMapa.atualizar(aj.oficial, { rascunho: true });
    }
    /* na pausa da digitação: o pedido dela vira o esboço; nada roteado (ou não coube) e havia esboço: o oficial volta */
    function esbocar() {
      /* (visto na página real) o desenho do mapa é baixado à parte e chega DEPOIS do render que trouxe o plano: confere de novo ao digitar */
      if (!aj.falhou && !aj.oficial && st.E) ajustar(st.E);
      if (aj.falhou || !aj.oficial || aj.carga !== 'pronta' || !st.campo) return;
      try {
        var texto = st.campo.value, pedido = texto.trim() ? win.BZMapaAjuste.rotear(texto) : null;
        var r = pedido ? win.BZMapaAjuste.aplicarAjuste(aj.oficial, pedido) : null;
        if (r && r.ok) { desenharEsboco(r.plano, ''); return; }
        /* (PR 3a) o esboço que veio da reação fica enquanto ela continua a MESMA frase (o texto de agora começa com o que foi lido) */
        if (!pedido && aj.doServidor && aj.esboco && texto.trim().indexOf(aj.doServidor) === 0 && !desdiz(texto.trim().slice(aj.doServidor.length))) return;
        if (aj.esboco || aj.firme) voltarAoOficial();   /* (revisão técnica) o firme também sai se ela troca ou apaga a frase */
      } catch (e) { falharAjuste(e); }
    }
    /* (revisão técnica 1) o que ela escreveu DEPOIS da frase lida: negação, desistência, condição ou pergunta tiram o esboço do servidor.
       (reconferência 2) estreito: "que eu tirei", "sem medo", "nem sempre" são continuação comum, não desdizer */
    var DESDIZ = /(?:^|[^a-z])(?:nao|nunca|esquec\w*|desist\w*|cancel\w*|talvez|deixa pra la|deixa para la)(?:[^a-z]|$)|\?/;
    function desdiz(resto) { return !!resto && DESDIZ.test(win.BZOracao && win.BZOracao.semAcento ? win.BZOracao.semAcento(resto) : String(resto).toLowerCase()); }
    function desenharEsboco(plano, doServidor) {
      var j = JSON.stringify(plano);
      if (j === aj.esbocoJson) { aj.doServidor = doServidor; return; }
      var x = win.BZMapa.atualizar(plano, { rascunho: true });
      if (x && x.ok) { aj.esboco = plano; aj.esbocoJson = j; aj.firme = null; aj.doServidor = doServidor; }
    }
    /* ---------- Fase 3, PR 3a: quando o aparelho não sabe, a reação (js/orcamento-anotacao.js) pergunta ao servidor ----------
       precisaDoServidor(texto): o mapa oficial está na tela, o ajuste carregou e o roteador daqui não decidiu: a chamada de reação leva mapa: true.
       ajusteDoServidor(ajuste, texto): a resposta só vale se a caixa ainda tem ESSE texto e o roteador daqui segue sem resposta (o local manda);
       o plano sai do mesmo aplicarAjuste (tabela fixa, revalidado), então o servidor só escolhe a peça, nunca o desenho */
    function prontoParaAjuste() { return !aj.falhou && !!aj.oficial && aj.carga === 'pronta' && !!st.campo && !!win.BZMapaAjuste && !!win.BZMapa; }
    function precisaDoServidor(texto) {
      try { return typeof texto === 'string' && !!texto.trim() && prontoParaAjuste() && !aj.firme && win.BZMapaAjuste.rotear(texto) === null; }
      catch (e) { falharAjuste(e); return false; }
    }
    function ajusteDoServidor(ajuste, texto) {
      try {
        if (!prontoParaAjuste() || aj.firme || typeof texto !== 'string') return false;
        var agora = st.campo.value.trim();
        if (!agora || agora !== texto.trim() || win.BZMapaAjuste.rotear(agora) !== null) return false;
        /* (revisão técnica 1) a reação da frase de AGORA voltou sem ajuste ("nada", trava, limite): o esboço do servidor que estava na tela sai */
        if (!ehObjeto(ajuste)) { if (aj.doServidor && aj.esboco) voltarAoOficial(); return false; }
        var r = win.BZMapaAjuste.aplicarAjuste(aj.oficial, { acao: ajuste.acao, peca: ajuste.peca });
        if (!r || !r.ok) return false;
        desenharEsboco(r.plano, agora);
        return aj.doServidor === agora;
      } catch (e) { falharAjuste(e); return false; }
    }
    /* o Enter dela: o esboço firma ("Ajustado", a luz) e espera a resposta do Zero. Ouvido na CAPTURA (antes do js/orcamento.js, que marca
       aria-busy ao aceitar o envio): ocupada (outro turno no meio) ou caixa vazia, o envio não sai, então nada firma. E o esboço é refeito do
       que está NA CAIXA agora (Enter antes da pausa de 250 ms não firma a frase velha) */
    function aoEnviar() {
      if (aj.falhou || !aj.form || aj.form.getAttribute('aria-busy') === 'true' || !st.campo || !st.campo.value.trim()) return;
      esbocar();
      if (aj.falhou || !aj.esboco) return;
      try {
        var plano = aj.esboco, n = st.E && Array.isArray(st.E.mensagens) ? st.E.mensagens.length : 0;
        aj.esboco = null; aj.esbocoJson = ''; aj.doServidor = '';
        win.BZMapa.atualizar(plano, { rascunho: false });
        aj.firme = plano; aj.firmeEm = n;
      } catch (e) { falharAjuste(e); }
    }
    /* (revisão técnica) o envio que não entrou (rede, servidor ocupado, releitura sem resposta): o js/orcamento.js avisa com
       bz:envio-nao-entrou (o texto volta à caixa) e o firme sai. Nada de relógio: a releitura lenta de um envio que deu certo não o desfaz */
    function aoNaoEntrar() { try { if (aj.firme) voltarAoOficial(); } catch (e) { falharAjuste(e); } }
    function ouvirEnvio() {
      var form = $('o-form');
      if (!aj.ouveFalha) { aj.ouveFalha = true; doc.addEventListener('bz:envio-nao-entrou', aoNaoEntrar); }
      if (aj.form === form) return;
      if (aj.form) aj.form.removeEventListener('submit', aoEnviar, true);
      aj.form = form;
      if (form) form.addEventListener('submit', aoEnviar, true);
    }
    /* a cada render: o oficial mudou (o Zero mandou plano novo): a cola da planta já o desenhou, o esboço só sai de cena. O mesmo oficial com a
       resposta do Zero depois do Enter: o oficial volta */
    function ajustar(E) {
      if (aj.falhou) return;
      try {
        var of = oficialDe(E);
        if (!of) { aj.oficial = null; aj.oficialJson = ''; aj.esboco = null; aj.esbocoJson = ''; aj.doServidor = ''; aj.firme = null; return; }
        /* (revisão técnica) a cola da planta redesenha o oficial também quando muda a versão, a origem ou o editável com o mesmo plano: o
           esboço na tela some, e a mesma frase tem de poder esboçar de novo */
        var j = JSON.stringify(of), p = E.planta, chave = p.versao + '|' + p.origem + '|' + E.planta_editavel, novo = j !== aj.oficialJson || chave !== aj.chave;
        if (novo) { aj.oficial = of; aj.oficialJson = j; aj.chave = chave; aj.esboco = null; aj.esbocoJson = ''; aj.doServidor = ''; aj.firme = null; }
        ouvirEnvio();
        carregarAjuste();   /* (depois do oficial: ao chegar, o ajuste já esboça o que estiver na caixa) */
        if (novo) return;
        var n = Array.isArray(E.mensagens) ? E.mensagens.length : 0;
        if (aj.firme && n >= aj.firmeEm + 2) voltarAoOficial();
      } catch (e) { falharAjuste(e); }
    }

    function montar() {
      var form = $('o-form');
      st.campo = $('o-texto');
      if (!form || !st.campo || !form.parentNode) return false;
      var ul = doc.createElement('ul');
      ul.className = 'orc-reacao';
      ul.id = 'o-reacao';
      ul.setAttribute('aria-hidden', 'true');
      form.parentNode.insertBefore(ul, form);
      st.fila = ul;
      st.campo.addEventListener('input', aoDigitar);
      st.ouvindo = true;
      return true;
    }

    /* as peças e os canais chegam pelo esboço, que os baixa no MESMO render da 1ª fala do Zero: com a flag ligada e sem eles ainda, confere de
       novo a cada ESPERA_PECAS ms, até TENTATIVAS vezes (~10 s); a flag que some no meio cancela */
    var ESPERA_PECAS = 400, TENTATIVAS = 25;
    function esperarPecas(E) {
      win.clearTimeout(st.espera);
      if (st.tentativas >= TENTATIVAS) return;
      st.tentativas++;
      st.espera = win.setTimeout(function () { if (st.E === E) atualizar(E); }, ESPERA_PECAS);
    }

    function atualizar(E) {
      if (st.falhou) return;
      if (E !== st.E) st.tentativas = 0;   /* um render novo (outro turno) ganha as tentativas de volta; a reconferência repete o mesmo E */
      st.E = E;
      try {
        if (!ligada(E)) { win.clearTimeout(st.espera); st.tentativas = 0; tirar(); return; }
        ajustar(E);
        /* precisa das peças e dos canais que o esboço traz; sem eles (ainda), a página de hoje */
        if (!win.BZPlantaPecas || !win.BZMapaSaber) { tirar(); esperarPecas(E); return; }
        win.clearTimeout(st.espera);
        /* a caixa refeita por outro código: a fileira e o ouvinte vão para a nova */
        if (st.fila && st.campo !== $('o-texto')) tirar();
        if (!st.fila && !montar()) return;
        carregarLeitor();
        /* a fileira acompanha a caixa: conversa fechada (form escondido) ou passo que recolhe a caixa (is-recolhido) a escondem */
        var form = $('o-form');
        var semCaixa = !form || form.hidden || form.classList.contains('is-recolhido');
        if (st.fila.hidden !== semCaixa) st.fila.hidden = semCaixa;
        if (semCaixa || !st.campo.value.trim()) { while (st.fila.firstChild) st.fila.removeChild(st.fila.firstChild); }
      } catch (e) { falhar(e); }
    }

    return { atualizar: atualizar, precisaDoServidor: precisaDoServidor, ajusteDoServidor: ajusteDoServidor, _estado: st, _reagir: reagir };
  }

  return { criar: criar, ESPERA: ESPERA, LEITOR: LEITOR, ligada: ligada };
});
