/* A LIGAÇÃO DO RADAR NA PÁGINA DE ORÇAMENTO (PR 2d-ligação; spec §3.5; plano "Decisões do 2d-front"). js/orcamento-radar.js (BZOrcRadar) recebe o `estado` a cada render(), e SÓ com
   E.leitura carrega sob demanda (lista CONSTANTE de URLs) o módulo do radar e o CSS, monta o radar no contêiner #o-radar (na coluna do painel, abaixo do cartão de investimento) e o
   atualiza a cada leitura nova. Falha fechada e silenciosa. Sem E.leitura (flag desligada) a página é a de hoje: nada baixado, nada criado, nada ouvido.
   Num DOM de mentira (docs/testes/planta-dom-falso.mjs), com o módulo REAL do radar onde importa.  node --test docs/testes/planta-leitura-front.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import vm from 'node:vm';
import Forma from '../../js/orcamento-planta-forma.js';
import Ligacao from '../../js/orcamento-radar.js';
import { criarJanela } from './planta-dom-falso.mjs';

const lerFonte = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');   /* (Windows: autocrlf; o CI roda em LF) */
const leitura = (nivel = 'comentou') => ({ eixos: [
  { eixo: 'volume', nivel: 'deixou_claro', evidencia: 'muita procura' }, { eixo: 'repeticao', nivel },
  { eixo: 'urgencia', nivel: 'nao_falou' }, { eixo: 'pessoas', nivel: 'nao_falou' }, { eixo: 'informacao', nivel: 'nao_falou' }] });
/* o radar de verdade, carregado como o navegador o faz (script clássico que lê window): a janela de mentira é o `window` do módulo */
const carregarRadar = (w) => vm.runInNewContext(lerFonte('js/planta-radar.js'), { window: w });
const porClasse = (no, c) => no.achar((n) => (n.attrs['class'] || '').split(/[ ]+/).indexOf(c) >= 0);
const FORMA = 'js/orcamento-planta-forma.js', RADAR = 'js/planta-radar.js', CSS = 'css/orcamento-radar.css';

/* o radar de espia (registra o que a ligação pede) */
function espia() {
  const e = { montar: [], atualizar: [], desmontar: 0, falha: false, nulo: false };
  e.api = {
    montar(raiz, l) { e.montar.push({ raiz, l }); if (e.falha) throw new Error('boom'); if (e.nulo) return null; return { atualizar(x) { e.atualizar.push(x); return true; }, desmontar() { e.desmontar++; } }; }
  };
  return e;
}

function ambiente({ radar = 'espia', formaPronta = false, falhaDe = null, largura = 390 } = {}) {
  const w = criarJanela({ reduzido: true, largura, beyon: true });
  const doc = w.document;
  const ids = {};
  const novo = (tag, id) => { const n = doc.createElement(tag); if (id) { n.attrs.id = id; ids[id] = n; } return n; };
  doc.getElementById = (id) => ids[id] || null;
  doc.head = novo('head');
  const aside = novo('aside'), est = novo('div', 'o-est'), caixa = novo('section', 'o-radar');
  caixa.hidden = true; caixa.clientWidth = largura;
  aside.appendChild(est); aside.appendChild(caixa);
  if (formaPronta) w.BZPlantaForma = Forma;
  const espiao = radar === 'espia' ? espia() : null;
  const baixados = [];
  const falhas = { ...(falhaDe ? { [falhaDe]: true } : {}) };
  const fonte = { [FORMA]: () => { w.BZPlantaForma = Forma; }, [RADAR]: () => { if (radar === 'real') carregarRadar(w); else w.BZRadar = espiao.api; } };
  const anexar = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = (s) => {
    anexar(s);
    const tag = String(s.tagName).toLowerCase();
    const url = tag === 'link' ? s.href : s.src;
    baixados.push(url);
    w.setTimeout(() => {
      if (falhas[url]) { s.disparar('error'); return; }
      if (tag === 'script') fonte[url]();
      s.disparar('load');
    }, 0);
    return s;
  };
  const avisos = [];
  w.console = { warn: (...a) => avisos.push(a.join(' ')), log() {}, error: (...a) => avisos.push(a.join(' ')) };
  const L = Ligacao.criar(w);
  return { w, doc, L, caixa, aside, est, espiao, baixados, avisos, falhas, ids };
}
const prontos = (amb) => amb.w.avancar(50);
const E = (l = leitura()) => ({ conversa: { etapa: 'estimativa' }, mensagens: [], leitura: l });

/* ---------- 1. sem leitura, a página é a de hoje ---------- */
test('sem E.leitura (flag desligada, estado vazio ou lixo): nada é baixado, criado nem ouvido; o contêiner fica escondido', () => {
  const amb = ambiente();
  const antes = amb.doc.todos.length;
  const lixos = [null, undefined, {}, E(null), ({ leitura: undefined }), E('x'), E([]), E({}), E({ eixos: 'x' }), E({ eixos: [] }), E({ eixos: [{ eixo: 'volume' }] }), E(7)];
  for (const estado of lixos) assert.doesNotThrow(() => amb.L.atualizar(estado));
  prontos(amb);
  assert.equal(amb.caixa.hidden, true);
  assert.equal(amb.baixados.length, 0);
  assert.equal(amb.doc.todos.length, antes, 'nenhum elemento criado');
  assert.equal(Object.keys(amb.w.ouvintes).length, 0, 'nenhum ouvinte na janela');
  assert.equal(Object.keys(amb.doc.ouvintes).length, 0);
  assert.equal(amb.w.pendentes(), 0);
  assert.equal(amb.avisos.length, 0);
});

/* ---------- 2. leitura válida ---------- */
test('leitura válida: baixa forma, radar e CSS pela lista constante, UMA vez, nessa ordem de scripts; só depois de tudo chegar o contêiner sai de hidden e o radar é montado nele', () => {
  const amb = ambiente();
  amb.L.atualizar(E());
  assert.equal(amb.caixa.hidden, true, 'enquanto baixa, nada aparece (nunca sem estilo)');
  assert.deepEqual(amb.baixados.filter((u) => /\.js$/.test(u)), [FORMA, RADAR]);
  assert.deepEqual(amb.baixados.filter((u) => /\.css$/.test(u)), [CSS]);
  assert.deepEqual(amb.doc.head.porTag('script').map((s) => s['async']), [false, false], 'scripts em ordem (async = false)');
  amb.L.atualizar(E()); amb.L.atualizar(E());
  assert.equal(amb.baixados.length, 3, 'o download não se repete enquanto o lote não chegou');
  prontos(amb);
  assert.equal(amb.caixa.hidden, false);
  assert.equal(amb.espiao.montar.length, 1);
  assert.equal(amb.espiao.montar[0].raiz, amb.caixa);
  assert.deepEqual(amb.espiao.montar[0].l, leitura());
  assert.equal(amb.avisos.length, 0);
});

test('o módulo de forma que a planta já trouxe não é baixado de novo', () => {
  const amb = ambiente({ formaPronta: true });
  amb.L.atualizar(E()); prontos(amb);
  assert.deepEqual(amb.baixados.filter((u) => /\.js$/.test(u)), [RADAR]);
  assert.equal(amb.espiao.montar.length, 1);
});

test('mesma leitura não refaz nada; leitura nova só ATUALIZA (não monta de novo, não baixa de novo)', () => {
  const amb = ambiente();
  amb.L.atualizar(E()); prontos(amb);
  amb.L.atualizar(E()); amb.L.atualizar(E());
  assert.equal(amb.espiao.atualizar.length, 0);
  amb.L.atualizar(E(leitura('deixou_claro')));
  assert.equal(amb.espiao.atualizar.length, 1);
  assert.deepEqual(amb.espiao.atualizar[0], leitura('deixou_claro'));
  assert.equal(amb.espiao.montar.length, 1);
  assert.equal(amb.baixados.length, 3);
  assert.equal(amb.caixa.hidden, false);
});

test('a ordem dos eixos que o servidor manda não importa para decidir se mudou (a leitura é comparada pelo conteúdo)', () => {
  const amb = ambiente();
  amb.L.atualizar(E()); prontos(amb);
  const l = leitura(); l.eixos.reverse();
  amb.L.atualizar(E(l));
  assert.equal(amb.espiao.atualizar.length, 1, 'ordem diferente é só ordem: o radar ordena; a ligação não se importa');
});

/* ---------- 3. falhas: fechadas e silenciosas ---------- */
test('download falhou: nada aparece, um aviso só no console, a página segue; a próxima leitura tenta de novo só o que faltou', () => {
  const amb = ambiente({ falhaDe: RADAR });
  amb.L.atualizar(E()); prontos(amb);
  assert.equal(amb.caixa.hidden, true);
  assert.equal(amb.espiao.montar.length, 0);
  assert.equal(amb.avisos.length, 1);
  assert.match(amb.avisos[0], /\[beyon\] radar/);
  amb.L.atualizar(E()); prontos(amb);
  assert.equal(amb.baixados.length, 3, 'a mesma leitura não insiste');
  amb.falhas[RADAR] = false;
  amb.L.atualizar(E(leitura('deixou_claro'))); prontos(amb);
  assert.deepEqual(amb.baixados.slice(3), [RADAR], 'só o módulo que falhou volta');
  assert.equal(amb.caixa.hidden, false);
  assert.equal(amb.espiao.montar.length, 1);
  assert.equal(amb.avisos.length, 1);
});

test('forma recusada (4 eixos): esconde e não monta; radar que lança ou devolve nulo: esconde, avisa uma vez e não tenta a cada render', () => {
  const a = ambiente();
  const quatro = { eixos: leitura().eixos.slice(0, 4) };
  a.L.atualizar(E(quatro)); prontos(a);
  assert.equal(a.caixa.hidden, true);
  assert.equal(a.espiao.montar.length, 0);
  const b = ambiente(); b.espiao.falha = true;
  b.L.atualizar(E()); prontos(b);
  assert.equal(b.caixa.hidden, true);
  for (let i = 0; i < 5; i++) b.L.atualizar(E());
  assert.equal(b.espiao.montar.length, 1, 'não insiste com a mesma leitura');
  assert.equal(b.avisos.length, 1);
  const c = ambiente(); c.espiao.nulo = true;
  c.L.atualizar(E()); prontos(c);
  assert.equal(c.caixa.hidden, true);
});

/* ---------- 4. ciclo de vida ---------- */
test('a leitura some do estado: desmonta (tira do laço), esconde e esquece; quando volta, monta de novo', () => {
  const amb = ambiente();
  amb.L.atualizar(E()); prontos(amb);
  amb.L.atualizar({ conversa: {}, mensagens: [] });
  assert.equal(amb.espiao.desmontar, 1);
  assert.equal(amb.caixa.hidden, true);
  amb.L.atualizar({}); amb.L.atualizar(null);
  assert.equal(amb.espiao.desmontar, 1, 'desmonta uma vez só');
  amb.L.atualizar(E());
  assert.equal(amb.espiao.montar.length, 2);
  assert.equal(amb.caixa.hidden, false);
  assert.equal(amb.baixados.length, 3, 'o que já veio não é baixado de novo');
});

test('troca de página/aba (pagehide): desmonta o radar, que sai do laço único e solta o observador', () => {
  const amb = ambiente();
  amb.L.atualizar(E()); prontos(amb);
  amb.w.disparar('pagehide');
  assert.equal(amb.espiao.desmontar, 1);
});

test('se a leitura some enquanto os módulos ainda baixam, nada é montado quando eles chegam', () => {
  const amb = ambiente();
  amb.L.atualizar(E());
  amb.L.atualizar({});
  prontos(amb);
  assert.equal(amb.espiao.montar.length, 0);
  assert.equal(amb.caixa.hidden, true);
});

/* ---------- 5. com o módulo REAL do radar ---------- */
test('com o radar de verdade: monta o grupo no contêiner, a lista tem os 5 eixos por extenso e a leitura nova muda o texto; desmontar limpa o contêiner e o laço', () => {
  const amb = ambiente({ radar: 'real', formaPronta: true });
  amb.L.atualizar(E()); prontos(amb);
  assert.equal(amb.caixa.hidden, false);
  assert.equal(porClasse(amb.caixa, 'plr').length, 1);
  assert.equal(porClasse(amb.caixa, 'plr-linha').length, 5);
  assert.match(amb.caixa.textContent, /deixou claro/);
  assert.match(amb.caixa.textContent, /“muita procura”/);
  amb.L.atualizar(E(leitura('deixou_claro')));
  assert.deepEqual(amb.avisos, []);
  assert.equal(porClasse(amb.caixa, 'plr-nivel--deixou_claro').length, 2);
  amb.L.atualizar({});
  assert.equal(amb.caixa.filhos.length, 0);
  assert.equal(amb.caixa.hidden, true);
});

/* ---------- 6. o que a página tem ---------- */
test('orcamento.html: #o-radar é uma <section> escondida na coluna do painel, DEPOIS do cartão de investimento (#o-est) e dentro do aside; sem style, sem aria-live, sem o CSS no head', () => {
  const html = lerFonte('orcamento.html');
  const aside = html.slice(html.indexOf('<aside class="orc-painel"'), html.indexOf('</aside>'));
  assert.ok(aside.length > 100);
  const i = aside.indexOf('id="o-radar"');
  assert.ok(i > aside.indexOf('id="o-est"'), 'abaixo do cartão de investimento');
  assert.match(aside.slice(aside.lastIndexOf('<', i), aside.indexOf('>', i) + 1), /^<section\b[^>]*\bhidden\b/, 'section escondida (a regra .orc-painel > div é de cartão e daria borda dupla)');
  const tag = aside.slice(aside.lastIndexOf('<', i), aside.indexOf('>', i) + 1);
  assert.ok(!/\bstyle=|aria-live|role=/.test(tag), tag);
  assert.ok(!/orcamento-radar\.css|planta-radar\.js/.test(html), 'com a flag desligada a página não baixa nem bloqueia por causa do radar');
  assert.ok(!/<link[^>]*orcamento-radar/.test(html));
  assert.match(html, /<script src="js\/orcamento-radar\.js" defer><\/script>/);
  assert.ok(html.indexOf('js/orcamento-radar.js') < html.indexOf('js/orcamento.js"'), 'antes do orcamento.js, que o chama');
  assert.equal((html.match(/id="o-radar"/g) || []).length, 1);
});

test('js/orcamento.js chama o radar numa linha só, no render(), depois da planta', () => {
  const js = lerFonte('js/orcamento.js');
  const linhas = js.split('\n').filter((l) => /BZOrcRadar/.test(l));
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /if \(window\.BZOrcRadar\) window\.BZOrcRadar\.atualizar\(E\);/);
  assert.ok(js.indexOf('BZOrcRadar') > js.indexOf('BZOrcPlanta.atualizar'));
  assert.ok(js.indexOf('BZOrcRadar') < js.indexOf('BZPainel.atualizar'));
});

test('a ligação do radar: só texto de constantes no DOM, sem porta de HTML, sem região viva (a única é o #o-voz do chat), sem rAF, só BEYON via o módulo do radar', () => {
  const src = lerFonte('js/orcamento-radar.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const re of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\s*\.\s*write/, /\beval\s*\(/, /new\s+Function/, /setAttribute\s*\(\s*['"]style/, /requestAnimationFrame/, /aria-live/, /role['"]?\s*[:=,]\s*['"]status/, /o-voz/]) {
    assert.ok(!re.test(src), String(re));
  }
  /* as URLs são constantes: nenhuma é montada com dado do estado */
  assert.ok(!/\.(src|href)\s*=\s*[^;]*\+/.test(src));
  assert.equal((src.match(/'(?:js|css)\/[a-z-]+\.(?:js|css)'/g) || []).length, 3);
});

test('bytes: a ligação (baixada em toda visita, com a flag desligada também) no máximo 2.300 bytes com gzip -9; o radar segue dentro dos 8 KB', () => {
  const gz = (rel) => zlib.gzipSync(Buffer.from(lerFonte(rel)), { level: 9 }).length;
  assert.ok(gz('js/orcamento-radar.js') <= 2300, 'gzip -9 ' + gz('js/orcamento-radar.js'));
  assert.ok(gz('js/planta-radar.js') <= 8000, 'gzip -9 ' + gz('js/planta-radar.js'));
  assert.ok(gz('css/orcamento-radar.css') <= 2500, 'gzip -9 ' + gz('css/orcamento-radar.css'));
});

/* ---------- A2 (generalizado em B6, docs/testes/painel-foco.test.mjs): a regra do tabindex do painel que rola por dentro mora em js/orcamento-painel.js; o radar só avisa ---------- */
test('A2/B6: o radar avisa o painel (BZPainel.focavel) quando monta e quando some, e não mexe em tabindex nem ouve o resize', () => {
  const amb = ambiente();
  let avisos = 0;
  amb.w.BZPainel = { focavel: () => { avisos++; } };
  amb.L.atualizar(E()); prontos(amb);
  assert.ok(avisos >= 1, 'montou: o painel reavalia se passou a rolar');
  assert.equal(amb.aside.getAttribute('tabindex'), null, 'o radar não decide o tabindex');
  assert.equal((amb.w.ouvintes.resize || []).length, 0, 'o resize é do painel');
  const n = avisos;
  amb.L.atualizar({});
  assert.ok(avisos > n, 'sumiu: o painel reavalia de novo');
  const sem = ambiente();   /* sem o módulo do painel (página antiga) nada lança */
  assert.doesNotThrow(() => { sem.L.atualizar(E()); prontos(sem); sem.L.atualizar({}); });
});
