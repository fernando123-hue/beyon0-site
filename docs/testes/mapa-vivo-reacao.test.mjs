/* MAPA VIVO v2, fase 1a NA PÁGINA: js/orcamento-reacao.js (BZOrcReacao) num DOM de mentira, com o leitor REAL (js/mapa-vivo-ler.js) e as
   peças REAIS (js/planta-pecas.js). O que se prova:
   - flag desligada (sem planta_editavel) ou sem as peças/canais na página: nada é baixado, nada é criado, nenhum ouvinte (a tela é a de hoje);
   - flag ligada: a fileira nasce antes da caixa, escondida do leitor de tela; o leitor é baixado UMA vez, de URL constante;
   - digitar acende as peças depois da pausa de 250 ms; negação não acende; o que deixou de valer sai; caixa vazia apaga;
   - a flag que some tira a fileira e o ouvinte; falha de download não quebra nem repete;
   - fonte e página: ES5, sem innerHTML, o script antes do orcamento.js, a chamada no render, movimento reduzido no CSS.
   node --test docs/testes/mapa-vivo-reacao.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { criarJanela } from './planta-dom-falso.mjs';

const require = createRequire(import.meta.url);
const Pecas = require('../../js/planta-pecas.js');
const Saber = require('../../js/mapa-saber.js');
const Ler = require('../../js/mapa-vivo-ler.js');
const Reacao = require('../../js/orcamento-reacao.js');
const lerFonte = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function ambiente({ comPecas = true, falharDownload = false } = {}) {
  const w = criarJanela({ largura: 390 });
  const doc = w.document;
  const ids = {};
  const novo = (tag, id) => { const n = doc.createElement(tag); if (id) ids[id] = n; return n; };
  doc.getElementById = (id) => ids[id] || null;
  doc.head = novo('head');
  const coluna = novo('div');
  const atalhos = novo('div', 'o-atalhos'); coluna.appendChild(atalhos);
  const form = novo('form', 'o-form'); coluna.appendChild(form);
  const campo = novo('textarea', 'o-texto'); form.appendChild(campo);
  campo.value = '';
  const baixados = [], avisos = [];
  w.console = { warn: (...a) => avisos.push(a.join(' ')) };
  if (comPecas) { w.BZPlantaPecas = Pecas; w.BZMapaSaber = Saber; }
  const anexar = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = (s) => {
    anexar(s);
    baixados.push(s.src);
    if (falharDownload) s.onerror && s.onerror();
    else { w.BZMapaVivoLer = Ler; s.onload && s.onload(); }
    return s;
  };
  const api = Reacao.criar(w);
  const digitar = (t) => { campo.value = t; campo.disparar('input'); };
  const achar = () => coluna.children.find((n) => n.classList.contains('orc-reacao')) || null;
  const pecas = () => (achar() || doc.createElement('ul')).children.map((li) => li.getAttribute('data-codigo'));
  return { w, doc, ids, coluna, form, campo, api, baixados, avisos, digitar, pecas, fila: achar };
}
const LIGADA = { planta_editavel: true, mensagens: [] };

test('flag desligada ou sem as peças na página: nada baixado, nada criado, nenhum ouvinte', () => {
  const a = ambiente();
  a.api.atualizar({ mensagens: [] });
  a.api.atualizar(null);
  assert.equal(a.fila(), null);
  assert.equal(a.baixados.length, 0);
  assert.equal((a.campo.ouvintes.input || []).length, 0);
  const b = ambiente({ comPecas: false });
  b.api.atualizar(LIGADA);
  assert.equal(b.fila(), null, 'sem as peças do esboço, a tela é a de hoje');
  assert.equal(b.baixados.length, 0);
});

test('flag ligada: a fileira nasce antes da caixa, escondida do leitor de tela, e o leitor é baixado uma vez', () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.api.atualizar(LIGADA);
  const fila = a.fila();
  assert.ok(fila, 'a fileira existe');
  assert.ok(fila.nextSibling === a.form, 'logo antes da caixa');
  assert.equal(fila.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(a.baixados, ['js/mapa-vivo-ler.js'], 'uma vez, de URL constante');
  assert.equal((a.campo.ouvintes.input || []).length, 1, 'um ouvinte só');
});

test('digitar acende as peças depois de 250 ms; negação não acende; o que deixou de valer sai; caixa vazia apaga', () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.digitar('pelo instagram e whatsapp');
  a.w.avancar(200);
  assert.deepEqual(a.pecas(), [], 'ainda digitando');
  a.w.avancar(60);
  assert.deepEqual(a.pecas(), ['instagram', 'whatsapp']);
  const insta = a.fila().children[0];
  assert.ok(insta.classList.contains('is-nova'), 'a nova chega marcada');
  assert.ok(insta.porTag('path').length >= 2, 'com o desenho da peça');
  assert.equal(insta.textContent, 'Instagram');
  a.w.avancar(1300);
  assert.ok(!insta.classList.contains('is-nova'), 'e a marca sai depois');
  a.digitar('não uso instagram, mas o whatsapp sim; quero agenda');
  a.w.avancar(300);
  assert.deepEqual(a.pecas(), ['whatsapp', 'agenda'], 'instagram negado saiu, agenda entrou');
  a.campo.value = '';
  a.api.atualizar(LIGADA);
  assert.deepEqual(a.pecas(), [], 'enviou: a caixa vazia apaga a fileira');
});

test('a flag que some tira a fileira e o ouvinte; falha de download não quebra nem repete', () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.api.atualizar({ mensagens: [] });
  assert.equal(a.fila(), null);
  assert.equal((a.campo.ouvintes.input || []).length, 0);
  const b = ambiente({ falharDownload: true });
  b.api.atualizar(LIGADA);
  b.api.atualizar(LIGADA);
  assert.equal(b.baixados.length, 1, 'não tenta de novo a cada render');
  b.digitar('pelo instagram');
  b.w.avancar(300);
  assert.deepEqual(b.pecas(), [], 'sem o leitor, nada acende (e nada quebra)');
});

test('fonte e página: ES5, sem innerHTML, script antes do orcamento.js, chamada no render, movimento reduzido no CSS', () => {
  for (const arq of ['js/orcamento-reacao.js', 'js/mapa-vivo-ler.js']) {
    const fonte = lerFonte(arq).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/=>|\blet\b|\bconst\b|`|\bclass\s+[A-Za-z]/.test(fonte), arq + ' é ES5');
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(fonte), arq + ' sem HTML em texto');
  }
  const html = lerFonte('orcamento.html');
  const i = html.indexOf('<script src="js/orcamento-reacao.js" defer></script>');
  assert.ok(i > 0 && i < html.indexOf('<script src="js/orcamento.js" defer></script>'), 'o módulo vem antes do orcamento.js');
  assert.ok(!html.includes('js/mapa-vivo-ler.js'), 'o leitor vem sob demanda, não na página');
  assert.match(lerFonte('js/orcamento.js'), /if \(window\.BZOrcReacao\) window\.BZOrcReacao\.atualizar\(E\);/);
  const css = lerFonte('css/orcamento.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.orc-reacao\s*\{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.orc-reacao__peca\.is-nova[^}]*animation:\s*none/);
  assert.ok(!/\.orc-reacao[^{]*\{[^}]*(blur|shadow|filter)/.test(css), 'sem blur nem sombra');
  assert.match(css, /\.orc-reacao\s*\{[^}]*flex-wrap:\s*nowrap[^}]*height:\s*32px[^}]*overflow-x:\s*auto/, 'uma linha de altura fixa: a peça nova não empurra a caixa, nem a 2ª linha em 320 px (revisão do #265)');
  assert.match(css, /\.orc-reacao\[hidden\]\s*\{\s*display:\s*none/, 'o hidden vence o display: flex');
  assert.match(css, /html\.menos-movimento \.orc-reacao__peca\s*\{\s*transition:\s*none/);
});

test('as peças chegam DEPOIS do render (o esboço as baixa na mesma hora): a fileira nasce quando elas chegam, sem esperar outro turno', () => {
  const a = ambiente({ comPecas: false });
  a.api.atualizar(LIGADA);
  assert.equal(a.fila(), null, 'ainda sem as peças');
  a.w.BZPlantaPecas = Pecas; a.w.BZMapaSaber = Saber;
  a.w.avancar(1000);
  assert.ok(a.fila(), 'nasceu quando as peças chegaram');
  a.digitar('pelo instagram');
  a.w.avancar(300);
  assert.deepEqual(a.pecas(), ['instagram']);
  const b = ambiente({ comPecas: false });
  b.api.atualizar(LIGADA);
  b.w.avancar(30000);
  assert.equal(b.w.timers.length, 0, 'sem as peças, desiste depois de um tempo (nada fica rodando)');
  const c = ambiente({ comPecas: false });
  c.api.atualizar(LIGADA);
  c.api.atualizar({ mensagens: [] });
  c.w.BZPlantaPecas = Pecas; c.w.BZMapaSaber = Saber;
  c.w.avancar(2000);
  assert.equal(c.fila(), null, 'a flag sumiu antes de as peças chegarem: não nasce');
});

test('a caixa some (conversa fechada ou passo que recolhe a caixa): a fileira some junto e volta com ela (revisão do #265)', () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.digitar('pelo instagram');
  a.w.avancar(300);
  assert.deepEqual(a.pecas(), ['instagram']);
  a.form.hidden = true;
  a.api.atualizar({ ...LIGADA });
  assert.equal(a.fila().hidden, true, 'form escondido: fileira escondida');
  a.form.hidden = false;
  a.form.classList.add('is-recolhido');
  a.api.atualizar({ ...LIGADA });
  assert.equal(a.fila().hidden, true, 'caixa recolhida: fileira escondida');
  a.form.classList.remove('is-recolhido');
  a.api.atualizar({ ...LIGADA });
  assert.equal(a.fila().hidden, false, 'a caixa voltou: a fileira volta');
});

test('renders seguidos com estado novo (um por turno) não duplicam ouvinte nem fileira; os timers da peça nova saem com a fileira', () => {
  const a = ambiente();
  for (let i = 0; i < 6; i++) a.api.atualizar({ ...LIGADA });
  assert.equal((a.campo.ouvintes.input || []).length, 1);
  assert.equal(a.coluna.children.filter((n) => n.classList.contains('orc-reacao')).length, 1);
  a.digitar('pelo instagram e whatsapp');
  a.w.avancar(300);
  a.api.atualizar({ mensagens: [] });
  assert.equal(a.w.timers.length, 0, 'nenhum timer solto depois de tirar a fileira');
});

test('quando as peças não cabem numa linha (320 px), a fileira fica só com os ícones: nenhuma peça cortada na borda (revisão do #265, medido)', () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  const fila = a.fila();
  fila.clientWidth = 280;
  Object.defineProperty(fila, 'scrollWidth', { get: () => (fila.classList.contains('is-compacta') ? 200 : 318), configurable: true });
  a.digitar('pelo instagram e whatsapp, quero agenda');
  a.w.avancar(300);
  assert.ok(fila.classList.contains('is-compacta'), 'não coube: só ícones');
  assert.equal(fila.children[0].porClasse('orc-reacao__nome')[0].textContent, 'Instagram', 'o nome continua no nó (o CSS o esconde)');
  Object.defineProperty(fila, 'scrollWidth', { get: () => 150, configurable: true });
  a.digitar('pelo instagram');
  a.w.avancar(300);
  assert.ok(!fila.classList.contains('is-compacta'), 'coube de novo: os nomes voltam');
  const css = lerFonte('css/orcamento.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.orc-reacao\.is-compacta \.orc-reacao__nome\s*\{\s*display:\s*none/);
});

/* ---------- Fase 3, PR 2: o nó em esboço no mapa (plano docs/superpowers/plans/2026-11-28-mapa-vivo-fase3-pr2-desenho.md) ----------
   Com o mapa oficial (E.planta, forma v3) e o desenho na página, baixa js/oracao.js e js/mapa-ajuste.js (URL constante, uma vez, em ordem) e,
   ao digitar, pede ao desenho o esboço (atualizar com rascunho). Tudo local: nenhum fetch, nada vai ao servidor. */
const Forma = require('../../js/orcamento-mapa-forma.js');
const Oracao = require('../../js/oracao.js');
const Ajuste = require('../../js/mapa-ajuste.js');
const { planoDoCaso } = await import('../../api/_vendas/mapa-padrao.mjs');
const OFICIAL = planoDoCaso('saude_agenda', { origens: [], trava: null });
const comPlanta = (extra) => Object.assign({ planta_editavel: true, mensagens: [], planta: { plano: OFICIAL, versao: 1, n_mensagens: 2, origem: 'padrao' } }, extra || {});

function ambienteMapa({ falhar = false } = {}) {
  const a = ambiente();
  const chamadas = [];
  a.w.BZMapaForma = Forma;
  a.w.BZMapa = { atualizar: (plano, op) => { chamadas.push({ plano: JSON.parse(JSON.stringify(plano)), op: Object.assign({}, op) }); return { ok: true, refeita: false }; } };
  /* o carregador falso: cada URL publica o seu global (o leitor da fase 1a, a oração e o ajuste) */
  const head = a.doc.head, anexar = head.appendChild;
  head.appendChild = (s) => {
    a.baixados.push(s.src);
    if (falhar && s.src !== 'js/mapa-vivo-ler.js') { s.onerror && s.onerror(); return s; }
    if (s.src === 'js/mapa-vivo-ler.js') a.w.BZMapaVivoLer = Ler;
    if (s.src === 'js/oracao.js') a.w.BZOracao = Oracao;
    if (s.src === 'js/mapa-ajuste.js') a.w.BZMapaAjuste = Ajuste;
    s.onload && s.onload();
    return s;
  };
  void anexar;
  const ids = (p) => p.nos.map((n) => n.id);
  return Object.assign(a, { chamadas, ids });
}

test('sem o mapa oficial (ou sem o desenho na página): a oração e o ajuste não são baixados', () => {
  const a = ambienteMapa();
  a.api.atualizar(LIGADA);
  assert.ok(!a.baixados.includes('js/mapa-ajuste.js'));
  delete a.w.BZMapa;
  a.api.atualizar(comPlanta());
  assert.ok(!a.baixados.includes('js/mapa-ajuste.js'), 'sem BZMapa, nada');
});

test('com o mapa oficial: oracao.js e mapa-ajuste.js baixados UMA vez, nessa ordem; digitar o pedido põe o nó em esboço', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta());
  a.api.atualizar(comPlanta());
  const baixe = a.baixados.filter((s) => s === 'js/oracao.js' || s === 'js/mapa-ajuste.js');
  assert.deepEqual(baixe, ['js/oracao.js', 'js/mapa-ajuste.js']);
  a.digitar('quero também um formulário no site');
  a.w.avancar(300);
  const ult = a.chamadas[a.chamadas.length - 1];
  assert.deepEqual(ult.op, { rascunho: true });
  assert.ok(a.ids(ult.plano).includes('aj_form'), 'o nó do formulário');
  const n = a.chamadas.length;
  a.digitar('quero também um formulário no site.');
  a.w.avancar(300);
  assert.equal(a.chamadas.length, n, 'o mesmo esboço não é pedido de novo');
});

test('a frase muda para outra coisa ou a caixa é apagada: o oficial volta, em esboço (calado); sem esboço, nada é pedido', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta());
  a.digitar('meu horário é de segunda a sexta');
  a.w.avancar(300);
  assert.equal(a.chamadas.length, 0, 'nada para desfazer');
  a.digitar('quero também um formulário');
  a.w.avancar(300);
  a.digitar('');
  a.w.avancar(300);
  const ult = a.chamadas[a.chamadas.length - 1];
  assert.deepEqual(ult, { plano: Forma.validarFormaMapa(OFICIAL).plano, op: { rascunho: true } });
});

test('Enter com esboço: firma (o mesmo plano, sem rascunho); o Zero responde sem plano novo: o oficial volta; com plano novo: não mexe', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  a.digitar('quero também um formulário');
  a.w.avancar(300);
  const esboco = a.chamadas[a.chamadas.length - 1].plano;
  a.form.disparar('submit');
  assert.deepEqual(a.chamadas[a.chamadas.length - 1], { plano: esboco, op: { rascunho: false } });
  const n = a.chamadas.length;
  a.campo.value = '';
  a.api.atualizar(comPlanta({ mensagens: [1, 2, 3] }));
  assert.equal(a.chamadas.length, n, 'só a fala dela entrou: o esboço firme espera o Zero');
  a.api.atualizar(comPlanta({ mensagens: [1, 2, 3, 4] }));
  assert.deepEqual(a.chamadas[a.chamadas.length - 1], { plano: Forma.validarFormaMapa(OFICIAL).plano, op: { rascunho: true } }, 'o Zero não ajustou: o oficial manda');
  /* outra rodada, agora o Zero manda um plano novo: quem desenha é a cola da planta, o esboço só sai de cena */
  a.digitar('quero também um formulário');
  a.w.avancar(300);
  a.form.disparar('submit');
  const m = a.chamadas.length;
  const novo = Ajuste.aplicarAjuste(OFICIAL, { acao: 'entra', peca: 'galeria' }).plano;
  a.api.atualizar(comPlanta({ mensagens: [1, 2, 3, 4, 5, 6], planta: { plano: novo, versao: 2, n_mensagens: 6, origem: 'modelo' } }));
  assert.equal(a.chamadas.length, m, 'o plano novo é da cola da planta');
});

test('falha ao baixar o ajuste: sem esboço, sem nova tentativa, a fileira da fase 1a segue', () => {
  const a = ambienteMapa({ falhar: true });
  a.api.atualizar(comPlanta());
  a.api.atualizar(comPlanta({ mensagens: [1] }));
  assert.equal(a.baixados.filter((s) => s === 'js/oracao.js').length, 1);
  assert.ok(!a.baixados.includes('js/mapa-ajuste.js'), 'parou no 1º que falhou');
  a.digitar('quero também um formulário');
  a.w.avancar(300);
  assert.equal(a.chamadas.length, 0);
  assert.ok(a.fila(), 'a fileira continua');
});

test('o desenho lança: o esboço desliga (aviso), a fileira da fase 1a segue; nenhum fetch em todo o caminho', () => {
  const a = ambienteMapa();
  let fetches = 0;
  a.w.fetch = () => { fetches++; return Promise.resolve(); };
  a.api.atualizar(comPlanta());
  a.w.BZMapa.atualizar = () => { throw new Error('quebrou'); };
  a.digitar('quero também um formulário');
  a.w.avancar(300);
  assert.ok(a.avisos.some((x) => x.includes('[beyon] ajuste')));
  assert.ok(a.fila(), 'a fileira continua');
  a.form.disparar('submit');
  assert.equal(fetches, 0);
});

test('o desenho do mapa chega DEPOIS do render (é baixado à parte): ao digitar, o ajuste confere de novo, baixa e põe o esboço', () => {
  const a = ambienteMapa();
  const mapa = a.w.BZMapa;
  delete a.w.BZMapa;
  a.api.atualizar(comPlanta());
  assert.ok(!a.baixados.includes('js/mapa-ajuste.js'), 'sem o desenho, nada');
  a.w.BZMapa = mapa;
  a.digitar('quero também um formulário');
  a.w.avancar(300);
  assert.deepEqual(a.baixados.filter((s) => s === 'js/oracao.js' || s === 'js/mapa-ajuste.js'), ['js/oracao.js', 'js/mapa-ajuste.js']);
  const ult = a.chamadas[a.chamadas.length - 1];
  assert.ok(ult && ult.op.rascunho === true && a.ids(ult.plano).includes('aj_form'), 'o esboço sai na mesma pausa, quando o ajuste chega');
});

/* ---------- revisão técnica do PR 2 (achados 1, 2, 3 e 5) ---------- */
const OFICIAL_V = () => Forma.validarFormaMapa(OFICIAL).plano;
const pensando = (a, ativo) => (a.doc.ouvintes['bz:pensando'] || []).forEach((f) => f({ type: 'bz:pensando', detail: { ativo } }));
const esbocado = (a) => { a.digitar('quero também um formulário'); a.w.avancar(300); };

test('(1) o envio não entrou (o js/orcamento.js avisa bz:envio-nao-entrou): o firme sai e o oficial volta', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  esbocado(a);
  a.form.disparar('submit');
  a.doc.disparar('bz:envio-nao-entrou');
  assert.deepEqual(a.chamadas[a.chamadas.length - 1], { plano: OFICIAL_V(), op: { rascunho: true } });
  const fonte = lerFonte('js/orcamento.js');
  assert.equal((fonte.match(/new CustomEvent\('bz:envio-nao-entrou'\)/g) || []).length, 2, 'a falha do envio e a releitura sem resposta avisam');
});

test('(reconferência) o envio que DEU certo com releitura lenta: o fim do "pensando" sem a resposta ainda no estado NÃO desfaz o firme', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  esbocado(a);
  a.form.disparar('submit');
  const n = a.chamadas.length;
  pensando(a, true);
  pensando(a, false);
  a.w.avancar(20000);
  assert.equal(a.chamadas.length, n, 'o firme fica até a resposta');
  a.api.atualizar(comPlanta({ mensagens: [1, 2, 3, 4] }));
  assert.deepEqual(a.chamadas[a.chamadas.length - 1], { plano: OFICIAL_V(), op: { rascunho: true } }, 'a resposta sem plano novo devolve o oficial');
});

test('(1) com o firme na tela, apagar ou trocar a frase devolve o oficial', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  esbocado(a);
  a.form.disparar('submit');
  a.digitar('meu horário é de segunda a sexta');
  a.w.avancar(300);
  assert.deepEqual(a.chamadas[a.chamadas.length - 1], { plano: OFICIAL_V(), op: { rascunho: true } });
});

test('(2) Enter com a conversa ocupada (aria-busy) ou com a caixa vazia não firma', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  esbocado(a);
  const n = a.chamadas.length;
  a.form.setAttribute('aria-busy', 'true');
  a.form.disparar('submit');
  assert.equal(a.chamadas.length, n, 'ocupada: nada firmado');
  a.form.setAttribute('aria-busy', 'false');
  a.campo.value = '   ';
  a.form.disparar('submit');
  assert.ok(!a.chamadas.slice(n).some((c) => c.op.rascunho === false), 'vazia: nada firmado');
});

test('(3) Enter antes da pausa de 250 ms firma o que está NA CAIXA, não o esboço velho', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  esbocado(a);
  a.campo.value = 'quero também uma galeria de fotos';
  a.form.disparar('submit');
  const ult = a.chamadas[a.chamadas.length - 1];
  assert.equal(ult.op.rascunho, false);
  assert.ok(a.ids(ult.plano).includes('aj_galeria') && !a.ids(ult.plano).includes('aj_form'), 'firmou a galeria: ' + a.ids(ult.plano));
  const b = ambienteMapa();
  b.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  esbocado(b);
  b.campo.value = 'meu horário é de segunda a sexta';
  b.form.disparar('submit');
  assert.ok(!b.chamadas.some((c) => c.op.rascunho === false), 'a frase nova não pede peça: nada firmado');
  assert.deepEqual(b.chamadas[b.chamadas.length - 1], { plano: OFICIAL_V(), op: { rascunho: true } }, 'e o esboço velho sai');
});

test('(5) a cola da planta redesenhou o oficial (outra origem ou editável, mesmo plano): a mesma frase esboça de novo', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  esbocado(a);
  const n = a.chamadas.length;
  a.api.atualizar(comPlanta({ mensagens: [1, 2], planta_editavel: false }));
  a.digitar('quero também um formulário.');
  a.w.avancar(300);
  assert.equal(a.chamadas.length, n + 1, 'o esboço é pedido de novo');
  assert.ok(a.ids(a.chamadas[n].plano).includes('aj_form'));
});

/* ---------- Fase 3, PR 3a: o ajuste que vem da reação (plano docs/superpowers/plans/2026-11-28-mapa-vivo-fase3-pr3-servidor.md) ---------- */
const SEM_ROTA = 'bota um lugar pra ver as fotos dos trabalhos que a gente faz';
const GALERIA = { acao: 'entra', peca: 'galeria' };

test('PR 3a: precisaDoServidor só com o mapa oficial, o ajuste carregado e o roteador daqui sem resposta', () => {
  const sem = ambienteMapa();
  sem.api.atualizar(LIGADA);
  assert.equal(sem.api.precisaDoServidor(SEM_ROTA), false, 'sem mapa oficial');
  const a = ambienteMapa();
  a.api.atualizar(comPlanta());
  assert.equal(Ajuste.rotear(SEM_ROTA), null);
  assert.equal(a.api.precisaDoServidor(SEM_ROTA), true);
  assert.equal(a.api.precisaDoServidor('quero também um formulário'), false, 'o roteador daqui já sabe');
  assert.equal(a.api.precisaDoServidor('   '), false);
  assert.equal(a.api.precisaDoServidor(null), false);
});

test('PR 3a: o ajuste do servidor vira o esboço da tabela quando a caixa ainda tem a MESMA frase; frase trocada ou peça fora da lista, nada', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta());
  a.digitar(SEM_ROTA);
  a.w.avancar(300);
  assert.equal(a.chamadas.length, 0, 'o aparelho não soube');
  assert.equal(a.api.ajusteDoServidor({ acao: 'entra', peca: 'loja' }, SEM_ROTA), false, 'peça fora da tabela');
  assert.equal(a.api.ajusteDoServidor('entra galeria', SEM_ROTA), false);
  assert.equal(a.api.ajusteDoServidor(GALERIA, 'outra frase qualquer'), false, 'a caixa já mudou');
  assert.equal(a.chamadas.length, 0);
  assert.equal(a.api.ajusteDoServidor(GALERIA, SEM_ROTA), true);
  const ult = a.chamadas[a.chamadas.length - 1];
  assert.deepEqual(ult, { plano: Ajuste.aplicarAjuste(OFICIAL, GALERIA).plano, op: { rascunho: true } }, 'o mesmo plano do roteador daqui');
});

test('PR 3a: o esboço do servidor fica enquanto ela continua a frase; trocar ou apagar devolve o oficial; o roteador daqui manda', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta());
  a.digitar(SEM_ROTA);
  a.w.avancar(300);
  a.api.ajusteDoServidor(GALERIA, SEM_ROTA);
  const n = a.chamadas.length;
  a.digitar(SEM_ROTA + ' aqui na oficina');
  a.w.avancar(300);
  assert.equal(a.chamadas.length, n, 'continuar a frase não tira o esboço');
  a.digitar('meu horário é de segunda a sexta');
  a.w.avancar(300);
  assert.deepEqual(a.chamadas[a.chamadas.length - 1], { plano: OFICIAL_V(), op: { rascunho: true } }, 'outra frase: o oficial volta');
  /* o roteador daqui decide: a resposta do servidor que chega depois não passa por cima */
  a.digitar('quero também um formulário');
  a.w.avancar(300);
  const m = a.chamadas.length;
  assert.equal(a.api.ajusteDoServidor(GALERIA, 'quero também um formulário'), false);
  assert.equal(a.chamadas.length, m);
});

test('PR 3a: Enter com o esboço do servidor firma o mesmo plano; com o firme na tela, nada de novo pedido ao servidor', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta({ mensagens: [1, 2] }));
  a.digitar(SEM_ROTA);
  a.w.avancar(300);
  a.api.ajusteDoServidor(GALERIA, SEM_ROTA);
  const esboco = a.chamadas[a.chamadas.length - 1].plano;
  a.form.disparar('submit');
  assert.deepEqual(a.chamadas[a.chamadas.length - 1], { plano: esboco, op: { rascunho: false } });
  assert.equal(a.api.precisaDoServidor(SEM_ROTA), false, 'firme: espera o Zero');
});

test('PR 3a (revisão técnica 1): a continuação que desdiz tira o esboço do servidor; a resposta "nada" para a frase de agora também', () => {
  const a = ambienteMapa();
  a.api.atualizar(comPlanta());
  a.digitar(SEM_ROTA);
  a.w.avancar(300);
  a.api.ajusteDoServidor(GALERIA, SEM_ROTA);
  a.digitar(SEM_ROTA + ', ah na verdade não quero');
  a.w.avancar(300);
  assert.deepEqual(a.chamadas[a.chamadas.length - 1], { plano: OFICIAL_V(), op: { rascunho: true } }, 'negação na continuação: o oficial volta');
  /* a mesma frase continuada sem negação, e a reação lida dela volta sem ajuste ("nada"): o esboço sai */
  const b = ambienteMapa();
  b.api.atualizar(comPlanta());
  b.digitar(SEM_ROTA);
  b.w.avancar(300);
  b.api.ajusteDoServidor(GALERIA, SEM_ROTA);
  const mais = SEM_ROTA + ' e também atendo em casa';
  b.digitar(mais);
  b.w.avancar(300);
  const n = b.chamadas.length;
  assert.equal(b.api.ajusteDoServidor(null, mais), false);
  assert.equal(b.chamadas.length, n + 1);
  assert.deepEqual(b.chamadas[b.chamadas.length - 1], { plano: OFICIAL_V(), op: { rascunho: true } });
  /* sem esboço do servidor na tela, a resposta "nada" não redesenha nada */
  const c = ambienteMapa();
  c.api.atualizar(comPlanta());
  c.digitar(SEM_ROTA);
  c.w.avancar(300);
  assert.equal(c.api.ajusteDoServidor(null, SEM_ROTA), false);
  assert.equal(c.chamadas.length, 0);
});
