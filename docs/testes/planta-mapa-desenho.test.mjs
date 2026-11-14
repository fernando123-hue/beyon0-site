/* O MAPA DO CASO NA TELA (js/mapa-desenho.js; PR 5b, tarefa 3): o quadro num DOM de mentira (docs/testes/planta-dom-falso.mjs: innerHTML LANÇA).
   Monta as 5 estruturas; o texto do plano entra só por textContent; a leitura oculta tem um item por nó, o objetivo e cada seta; o movimento
   reduzido dá o quadro final (aceso, ouro) e libera o valor (bz:planta-pronta); a entrada animada termina no ouro e libera o valor; atualizar com o
   mesmo plano não refaz, com outro refaz, com um inválido recusa e mantém; parar limpa. As regras de fonte do módulo (ES5, sem HTML) também. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { criarJanela } from './planta-dom-falso.mjs';
import { planoDoCaso } from '../../api/_vendas/mapa-padrao.mjs';

const require = createRequire(import.meta.url);
const Desenho = require('../../js/mapa-desenho.js');
const Layout = require('../../js/mapa-layout.js');
const Forma = require('../../js/orcamento-mapa-forma.js');
const Pecas = require('../../js/planta-pecas.js');
const Relogio = require('../../js/planta-relogio.js');
const Saber = require('../../js/mapa-saber.js');

const janela = {};
vm.runInNewContext(fs.readFileSync(new URL('../lab-estruturas-casos.js', import.meta.url), 'utf8'), { window: janela });
const CASO = janela.LAB_ESTRUTURAS_CASOS.clinica;
const planoDe = (est) => JSON.parse(JSON.stringify({ estrutura: est, hoje: CASO.hoje, nos: CASO.estruturas[est].nos, setas: CASO.estruturas[est].setas, objetivo: CASO.objetivo, fecho: CASO.fecho }));
const ESTRUTURAS = ['caminho', 'antes_depois', 'ramos', 'ciclo', 'mapa'];

function ambiente({ reduzido = true, largura = 390 } = {}) {
  const w = criarJanela({ reduzido, largura });
  Object.assign(w, { BZMapaForma: Forma, BZMapaLayout: Layout, BZPlantaPecas: Pecas, BZPlantaRelogio: Relogio.para(w), BZMapaSaber: Saber });
  const prontas = [];
  w.CustomEvent = function (tipo) { this.type = tipo; };
  w.document.dispatchEvent = (ev) => { prontas.push(ev.type); return true; };
  const avisos = [];
  w.console = { warn: (...a) => avisos.push(a.join(' ')), log() {}, error: (...a) => avisos.push(a.join(' ')) };
  const D = Desenho.para(w);
  const raiz = w.raiz(largura);
  return { w, D, raiz, prontas, avisos };
}
/* no DOM falso a classe de elemento SVG fica no atributo (sv() usa setAttribute('class')) */
const svgDe = (no, c) => no.achar((n) => n.nodeType === 1 && (n.getAttribute('class') || '').split(' ').includes(c));
const textos = (no) => no.achar((n) => n.nodeType === 1 && n.filhos.some((f) => f.nodeType === 3)).map((n) => n.textContent);

test('monta as 5 estruturas no celular e no computador: ok, um nó por id do plano mais o objetivo, uma seta por seta, nenhum aviso', () => {
  for (const largura of [390, 1280]) for (const est of ESTRUTURAS) {
    const a = ambiente({ largura });
    const p = planoDe(est);
    const r = a.D.montar(a.raiz, p);
    assert.equal(r.ok, true, est + ' ' + largura + ': ' + JSON.stringify(r));
    assert.equal(a.raiz.porClasse('mpc-no').length, p.nos.length + 1, est);
    assert.equal(svgDe(a.raiz, 'mpc-seta').length, p.setas.length, est);
    assert.equal(a.raiz.porClasse('mpc-rot').length, p.setas.length, est);
    assert.equal(a.raiz.porClasse('mpc-cab').length, est === 'antes_depois' ? 2 : 0, est);
    assert.equal(a.raiz.querySelector('h2').textContent, 'O mapa do seu caso');
    assert.deepEqual(a.avisos, []);
  }
});

test('o texto do plano entra só como texto: um título com <img onerror> aparece literal (o DOM falso lança em innerHTML)', () => {
  const a = ambiente();
  const p = planoDe('caminho');
  p.nos[0].titulo = 'Oi <b>teste</b>';
  const r = a.D.montar(a.raiz, p);
  assert.equal(r.ok, false, 'a forma recusa < e > antes de chegar ao desenho');
  const p2 = planoDe('caminho');
  p2.nos[0].titulo = 'Vê o perfil & chama';
  assert.equal(a.D.montar(a.raiz, p2).ok, true);
  assert.ok(textos(a.raiz).includes('Vê o perfil & chama'));
});

test('a leitura oculta: um item por nó (com o nome da origem), o objetivo e cada seta; nada de aria-label com texto do plano', () => {
  const a = ambiente();
  const p = planoDe('mapa');
  a.D.montar(a.raiz, p);
  const ol = a.raiz.porClasse('mpc-sr')[0];
  assert.equal(ol.porTag('li').length, p.nos.length + 1 + p.setas.length);
  const origem = p.nos.find((n) => n.papel === 'origem');
  assert.ok(ol.textContent.includes(Saber.NOMES[origem.origem] + ': ' + origem.titulo));
  assert.ok(ol.textContent.includes('Objetivo: ' + p.objetivo.titulo));
  assert.equal(a.raiz.achar((n) => n.nodeType === 1 && n.hasAttribute('aria-label')).length, 0);
  /* o desenho todo é aria-hidden: quem lê é a lista */
  for (const n of a.raiz.porClasse('mpc-no')) assert.equal(n.getAttribute('aria-hidden'), 'true');
});

test('a linha "Hoje:" é posta pela tela, com as origens pelo nome da tabela (nunca o código)', () => {
  const a = ambiente();
  a.D.montar(a.raiz, planoDe('caminho'));
  const hoje = a.raiz.porClasse('mpc-hoje')[0];
  assert.ok(hoje.textContent.startsWith('Hoje:'));
  assert.ok(hoje.textContent.includes('Chegam por: Instagram, Indicação.'), hoje.textContent);
  assert.ok(!/google_|_/.test(hoje.porClasse('mpc-hoje__origens')[0].textContent));
  /* o plano padrão sem nada conhecido vai sem hoje (api/_vendas/mapa-padrao.mjs) */
  const semHoje = planoDoCaso('generico', {});
  assert.equal(semHoje.hoje, undefined);
  const b = ambiente();
  assert.equal(b.D.montar(b.raiz, semHoje).ok, true);
  assert.equal(b.raiz.porClasse('mpc-hoje').length, 0);
});

test('movimento reduzido: o quadro final já na montagem (aceso e ouro), sem animação, e o valor é liberado uma vez', () => {
  const a = ambiente({ reduzido: true });
  const r = a.D.montar(a.raiz, planoDe('ramos'));
  assert.equal(r.animada, false);
  const q = a.raiz.porClasse('mpc-quadro')[0];
  assert.ok(q.classList.contains('is-aceso') && q.classList.contains('is-ouro'));
  assert.equal(a.w.document.animacoes.length, 0);
  assert.deepEqual(a.prontas, ['bz:planta-pronta']);
});

test('entrada animada: tudo por animação (transform, opacity, stroke-dashoffset); o ouro chega e o valor é liberado no fim', () => {
  const a = ambiente({ reduzido: false });
  const r = a.D.montar(a.raiz, planoDe('ciclo'));
  assert.equal(r.animada, true);
  const q = a.raiz.porClasse('mpc-quadro')[0];
  assert.ok(!q.classList.contains('is-ouro'));
  assert.deepEqual(a.prontas, []);
  for (const an of a.w.document.animacoes) for (const kf of an.keyframes) for (const k of Object.keys(kf)) assert.ok(['transform', 'opacity', 'strokeDashoffset', 'offset'].includes(k), 'propriedade animada: ' + k);
  a.w.avancar(20000);
  assert.ok(q.classList.contains('is-ouro'));
  assert.deepEqual(a.prontas, ['bz:planta-pronta']);
});

test('atualizar: o mesmo plano não refaz; outro refaz; um inválido recusa e o desenho de antes fica; parar limpa', () => {
  const a = ambiente();
  a.D.montar(a.raiz, planoDe('caminho'));
  assert.deepEqual(a.D.atualizar(planoDe('caminho')), { ok: true, refeita: false });
  assert.deepEqual(a.D.atualizar(planoDe('ramos')), { ok: true, refeita: true });
  const ruim = planoDe('ramos'); ruim.nos[0].papel = 'constructor';
  assert.equal(a.D.atualizar(ruim).ok, false);
  assert.ok(a.raiz.porClasse('mpc-no').length > 0, 'o desenho de antes continua');
  a.D.parar();
  assert.equal(a.raiz.filhos.length, 0);
  assert.equal(a.D.atualizar(planoDe('caminho')).ok, false, 'sem faixa, atualizar recusa');
});

test('sem largura, montar recusa (a cola tenta de novo) e não deixa nada na raiz', () => {
  const a = ambiente();
  const raiz = a.w.raiz(0);
  assert.deepEqual(a.D.montar(raiz, planoDe('caminho')).motivos, ['sem_largura']);
  assert.equal(raiz.filhos.length, 0);
});

const FONTE = fs.readFileSync(new URL('../../js/mapa-desenho.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ');
test('fonte: nada de innerHTML, eval, estilo inline, rAF; classe só de literal ou tabela; nenhum id do plano vira atributo', () => {
  for (const [nome, re] of [['innerHTML', /\binnerHTML\b/], ['outerHTML', /\bouterHTML\b/], ['insertAdjacentHTML', /insertAdjacentHTML/], ['document.write', /document\s*\.\s*write/],
    ['eval', /\beval\s*\(/], ['new Function', /new\s+Function/], ['setAttribute style', /setAttribute\s*\(\s*['"]style/], ['cssText', /cssText/], ['rAF', /requestAnimationFrame/],
    ['data-id', /data-id|dataset/], ['setAttribute id', /setAttribute\s*\(\s*['"]id['"]/]]) assert.doesNotMatch(semComentarios, re, nome);
  for (const m of semComentarios.matchAll(/setAttribute\('class', ([^)]+)\)/g)) assert.match(m[1], /^cls$/, 'classe só pelo argumento de sv(), que recebe literal');
});
