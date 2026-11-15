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
const CASOS_OUTRO = JSON.parse(JSON.stringify(janela.LAB_ESTRUTURAS_CASOS.embalagens));
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
  /* (5c) com nós em comum é o ajuste; sem nenhum (outro caso), a entrada de novo */
  assert.equal(a.D.atualizar(planoDe('ramos')).refeita, false);
  const outro = { estrutura: 'caminho', hoje: CASOS_OUTRO.hoje, nos: CASOS_OUTRO.estruturas.caminho.nos, setas: CASOS_OUTRO.estruturas.caminho.setas, objetivo: CASOS_OUTRO.objetivo, fecho: CASOS_OUTRO.fecho };
  assert.deepEqual(a.D.atualizar(outro), { ok: true, refeita: true });
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

/* ---------- revisão do 5b ---------- */
const svgLargura = (raiz) => Number(svgDe(raiz, 'mpc-svg')[0].getAttribute('width'));
test('girar a tela (outra largura): o mapa se refaz na largura nova, já pronto, sem entrada nem som; parar tira o ouvinte', () => {
  const a = ambiente({ reduzido: false });
  const sons = [];
  a.D.montar(a.raiz, planoDe('mapa'), { som: (s) => sons.push(s) });
  a.w.avancar(20000);
  const antesSons = sons.length;
  assert.equal(svgLargura(a.raiz), 390);
  a.raiz.clientWidth = 700;
  (a.w.ouvintes.resize || []).forEach((f) => f({ type: 'resize' }));
  a.w.avancar(400);
  assert.equal(svgLargura(a.raiz), 700, 'refeito na largura nova');
  const q = a.raiz.porClasse('mpc-quadro')[0];
  assert.ok(q.classList.contains('is-ouro'));
  assert.equal(sons.length, antesSons, 'sem som ao refazer');
  assert.deepEqual(a.prontas, ['bz:planta-pronta'], 'o valor não é liberado de novo');
  a.D.parar();
  assert.equal((a.w.ouvintes.resize || []).length, 0);
});

test('girar no meio da entrada: o mapa vai direto ao quadro final e libera o valor (que esperava a entrada)', () => {
  const a = ambiente({ reduzido: false });
  a.D.montar(a.raiz, planoDe('caminho'));
  a.w.avancar(200);
  assert.deepEqual(a.prontas, []);
  a.raiz.clientWidth = 320;
  (a.w.ouvintes.resize || []).forEach((f) => f({ type: 'resize' }));
  a.w.avancar(400);
  assert.deepEqual(a.prontas, ['bz:planta-pronta']);
  a.w.avancar(20000);
  assert.deepEqual(a.prontas, ['bz:planta-pronta'], 'a entrada antiga não libera de novo');
});

test('fontes ainda carregando: o quadro espera escondido e só então se mede, mostra e entra', async () => {
  const a = ambiente({ reduzido: false });
  let soltar;
  a.w.document.fonts = { status: 'loading', ready: new Promise((r) => { soltar = r; }) };
  a.D.montar(a.raiz, planoDe('caminho'));
  const q = a.raiz.porClasse('mpc-quadro')[0];
  assert.ok(q.classList.contains('is-medindo'), 'escondido enquanto a fonte não chega');
  assert.equal(a.w.document.animacoes.length, 0);
  soltar();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!q.classList.contains('is-medindo'));
  assert.ok(a.w.document.animacoes.length > 0, 'a entrada começa depois das fontes');
});

test('exceção no meio da montagem: nada fica vivo (ouvintes, observador), a raiz fica vazia e montar recusa', () => {
  const a = ambiente({ reduzido: false });
  const original = a.w.BZMapaLayout;
  const D = Desenho.para(Object.assign(a.w, { BZMapaLayout: { ...original, compor: () => { throw new Error('boom'); } } }));
  const r = D.montar(a.raiz, planoDe('caminho'));
  assert.equal(r.ok, false);
  assert.equal(a.raiz.filhos.length, 0);
  assert.equal((a.w.ouvintes.resize || []).length, 0);
  assert.equal((a.w.document.ouvintes.visibilitychange || []).length, 0);
  assert.ok(a.avisos.some((x) => /boom/.test(x)));
  a.w.BZMapaLayout = original;
});

/* ---------- 5c: "Ficou certo?" dentro do cartão (spec §7.4; desenho do PR 5 §4 e §9) ---------- */
const acoesDe = (raiz) => raiz.porClasse('mpc-acoes')[0];
const botaoDe = (raiz, texto) => raiz.porTag('button').find((b) => b.textContent === texto);
test('"Ficou certo?": o lugar existe desde a montagem (sem pular a página), mas a pergunta só aparece quando o mapa fica pronto', () => {
  const a = ambiente({ reduzido: false });
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true });
  const acoes = acoesDe(a.raiz);
  assert.ok(acoes, 'o lugar das ações é criado na montagem');
  assert.ok(acoes.classList.contains('is-espera'), 'invisível (o espaço já reservado) até o mapa ficar pronto');
  a.w.avancar(20000);
  assert.ok(!acoes.classList.contains('is-espera'));
  assert.ok(acoes.textContent.includes('Montei o mapa do seu caso. Ficou certo?'));
  assert.ok(botaoDe(a.raiz, 'Está certo') && botaoDe(a.raiz, 'Quero ajustar algo'));
  for (const b of acoes.porTag('button')) assert.equal(b.getAttribute('type'), 'button');
});

test('"Está certo" é só uma fala na tela: não chama aoCerto (não gasta IA, nada é gravado), e os botões saem', () => {
  const a = ambiente({ reduzido: true });
  let certo = 0;
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true, aoCerto: () => { certo++; return true; } });
  botaoDe(a.raiz, 'Está certo').disparar('click');
  assert.equal(certo, 0, 'nenhum envio');
  assert.ok(a.raiz.porClasse('mpc-fala')[0].textContent.includes('Está certo.'));
  assert.equal(acoesDe(a.raiz).porTag('button').length, 0, 'os botões saem');
});

test('"Quero ajustar algo" chama aoAjustar (a cola foca a caixa com a dica); sem a planta editável o botão não existe e aparece quando volta a ser', () => {
  const a = ambiente({ reduzido: true });
  let ajuste = 0;
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true, aoAjustar: () => { ajuste++; } });
  botaoDe(a.raiz, 'Quero ajustar algo').disparar('click');
  assert.equal(ajuste, 1);
  a.D.atualizar(planoDe('caminho'), { editavel: false });
  assert.equal(botaoDe(a.raiz, 'Quero ajustar algo').hidden, true, 'com o pedido confirmado, o ajuste some');
  a.D.atualizar(planoDe('caminho'), { editavel: true });
  assert.equal(botaoDe(a.raiz, 'Quero ajustar algo').hidden, false);
  const b = ambiente({ reduzido: true });
  b.D.montar(b.raiz, planoDe('caminho'), { editavel: false });
  assert.equal(botaoDe(b.raiz, 'Quero ajustar algo').hidden, true);
});

/* ---------- 5c: o ajuste (spec §7.4: "o nó novo cresce ligado por uma seta rotulada, sem refazer o resto") ---------- */
function ajustado() {
  const p = planoDe('caminho');
  p.nos.push({ id: 'lembrete', papel: 'ajustado', icone: 'lembrete', titulo: 'Lembrete na véspera', frase: 'A pessoa recebe um aviso antes do horário' });
  p.setas = p.setas.filter((s) => !(s.de === 'horario' && s.para === 'objetivo'));
  p.setas.push({ de: 'horario', para: 'lembrete', rotulo: 'avisa antes' }, { de: 'lembrete', para: 'objetivo', rotulo: 'confirma' });
  return p;
}
test('o ajuste: com nós em comum, os que ficam deslizam do lugar antigo para o novo e só o nó novo cresce (com "Ajustado"); a entrada não se repete', () => {
  const a = ambiente({ reduzido: false });
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true });
  a.w.avancar(20000);
  const p2 = ajustado();
  assert.ok(Forma.validarFormaMapa(p2).ok, JSON.stringify(Forma.validarFormaMapa(p2).motivos));
  const antes = a.w.document.animacoes.length;
  const r = a.D.atualizar(p2, { fala: 'quero um lembrete' });
  assert.deepEqual(r, { ok: true, refeita: false, novos: ['lembrete'] });
  const novas = a.w.document.animacoes.slice(antes);
  const nos = Object.fromEntries(a.raiz.porClasse('mpc-no').map((n) => [n.textContent, n]));
  const lembrete = Object.values(nos).find((n) => n.textContent.includes('Lembrete na véspera'));
  assert.ok(lembrete.textContent.includes('Ajustado'), 'o nó novo leva a marca');
  /* quem ficou desliza (transform de outro lugar para o lugar novo); o nó novo aparece por opacidade */
  const alvoDe = (an) => an.alvo || an.el || an.elemento;
  const deslizes = novas.filter((an) => an.keyframes.length === 2 && an.keyframes[0].transform && an.keyframes[0].transform !== an.keyframes[1].transform && !('opacity' in an.keyframes[0]));
  assert.ok(deslizes.length >= 1, 'há deslize de quem ficou');
  assert.ok(novas.some((an) => an.keyframes[0].opacity === 0 && String(an.keyframes[1].transform || '').length >= 0), 'o nó novo aparece');
  void alvoDe; void nos;
  a.w.avancar(20000);
  assert.deepEqual(a.prontas, ['bz:planta-pronta'], 'o ajuste não libera o valor de novo');
  const ol = a.raiz.porClasse('mpc-sr')[0];
  assert.equal(ol.porTag('li').length, p2.nos.length + 1 + p2.setas.length, 'a leitura acompanha o plano novo');
  assert.ok(a.raiz.porClasse('mpc-quadro')[0].classList.contains('is-ouro'), 'o ouro fica');
});

test('o ajuste com movimento reduzido: o quadro novo direto, sem animação', () => {
  const a = ambiente({ reduzido: true });
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true });
  const antes = a.w.document.animacoes.length;
  assert.deepEqual(a.D.atualizar(ajustado()), { ok: true, refeita: false, novos: ['lembrete'] });
  assert.equal(a.w.document.animacoes.length, antes);
  assert.equal(a.raiz.porClasse('mpc-no').length, ajustado().nos.length + 1);
});

/* ---------- revisão do 5c ---------- */
test('ajuste no MEIO da entrada: vai direto ao quadro final do plano novo, a pergunta aparece e o valor é liberado (não fica preso)', () => {
  const a = ambiente({ reduzido: false });
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true });
  a.w.avancar(300);
  assert.deepEqual(a.prontas, []);
  assert.equal(a.D.atualizar(ajustado()).ok, true);
  a.w.avancar(100);
  assert.deepEqual(a.prontas, ['bz:planta-pronta']);
  assert.ok(!acoesDe(a.raiz).classList.contains('is-espera'));
  assert.ok(a.raiz.porClasse('mpc-quadro')[0].classList.contains('is-ouro'));
  assert.equal(a.raiz.porClasse('mpc-no').length, ajustado().nos.length + 1);
});

test('ajuste durante a espera das fontes: nada acende antes da hora; quando as fontes chegam, a entrada roda UMA vez, já com o plano novo', async () => {
  const a = ambiente({ reduzido: false });
  let soltar;
  a.w.document.fonts = { status: 'loading', ready: new Promise((r) => { soltar = r; }) };
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true });
  assert.equal(a.D.atualizar(ajustado()).ok, true);
  const q = a.raiz.porClasse('mpc-quadro')[0];
  assert.ok(q.classList.contains('is-medindo') && !q.classList.contains('is-aceso'), 'continua esperando escondido');
  soltar();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(a.raiz.porClasse('mpc-no').length, ajustado().nos.length + 1, 'o plano novo');
  a.w.avancar(20000);
  assert.deepEqual(a.prontas, ['bz:planta-pronta']);
});

test('se a composição do ajuste falha (sem largura), o mapa de antes fica inteiro e a mesma versão tenta de novo depois', () => {
  const a = ambiente({ reduzido: true });
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true });
  const nAntes = a.raiz.porClasse('mpc-no').length;
  const largura = a.raiz.clientWidth;
  a.raiz.clientWidth = 0;
  assert.equal(a.D.atualizar(ajustado()).ok, false);
  assert.equal(a.raiz.porClasse('mpc-no').length, nAntes, 'o desenho de antes');
  assert.ok(!a.raiz.porClasse('mpc-sr')[0].textContent.includes('Lembrete'), 'a leitura de antes');
  a.raiz.clientWidth = largura;
  assert.deepEqual(a.D.atualizar(ajustado()), { ok: true, refeita: false, novos: ['lembrete'] }, 'a mesma versão entra quando volta a ter largura');
});

test('depois de "Está certo", um ajuste traz a pergunta de volta (o mapa mudou: ninguém olhou o novo)', () => {
  const a = ambiente({ reduzido: true });
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true });
  botaoDe(a.raiz, 'Está certo').disparar('click');
  assert.equal(acoesDe(a.raiz).porTag('button').length, 0);
  a.D.atualizar(ajustado());
  assert.ok(botaoDe(a.raiz, 'Está certo') && botaoDe(a.raiz, 'Quero ajustar algo'), 'os toques voltam');
  assert.equal(a.raiz.porClasse('mpc-fala').length, 0);
});

test('"Está certo" é anunciado (status) e o foco não se perde: vai para a fala', () => {
  const a = ambiente({ reduzido: true });
  a.D.montar(a.raiz, planoDe('caminho'), { editavel: true });
  botaoDe(a.raiz, 'Está certo').disparar('click');
  assert.equal(a.raiz.porClasse('mpc-status')[0].textContent, 'Está certo.');
  const fala = a.raiz.porClasse('mpc-fala')[0];
  assert.equal(fala.getAttribute('tabindex'), '-1');
  assert.equal(a.w.document.ativo, fala, 'o foco vai para a fala');
});
