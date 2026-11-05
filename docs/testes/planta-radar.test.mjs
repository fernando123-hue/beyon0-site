/* O RADAR "COMO LEMOS O SEU CASO" (PR 2d-front; spec §3, plano "PR 2d-front"). js/planta-radar.js: pentágono de 5 eixos, 3 anéis, polígono,
   rótulos fixos, lista <dl> acessível. Aqui: a geometria e a escala em funções puras, a montagem com um DOM de mentira
   (docs/testes/planta-radar-dom.mjs), o movimento (laço único BEYON.add, salto sem BEYON ou em movimento reduzido) e as varreduras do
   código (ES5, nada de innerHTML, nada de requestAnimationFrame).  node --test docs/testes/planta-radar.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import F from '../../js/orcamento-planta-forma.js';
import R from '../../js/planta-radar.js';
import { carregarRadar, beyonDeMentira } from './planta-radar-dom.mjs';

const ARQ = new URL('../../js/planta-radar.js', import.meta.url);
const fonte = fs.readFileSync(ARQ, 'utf8');
const lerJson = (rel) => JSON.parse(fs.readFileSync(new URL('./fixtures/radar/' + rel, import.meta.url), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const NICHOS = ['clinica', 'embalagens', 'loja'];
const LARGURAS = [320, 360, 390, 414, 600, 768, 1280];
const nivelTodos = (nivel) => ({ eixos: F.EIXOS.map((e) => ({ eixo: e, nivel })) });

/* monta um radar num contêiner de mentira com a largura dada */
function montado(leitura, opcoes = {}, largura = 390) {
  const m = carregarRadar(opcoes);
  const alvo = m.documento.createElement('div');
  alvo.largura = largura;
  const inst = m.radar.montar(alvo, leitura);
  return Object.assign(m, { alvo, inst });
}
const pontosDe = (alvo) => alvo.porClasse('plr-leitura')[0].getAttribute('points');
const linhas = (alvo) => alvo.porClasse('plr-linha');

/* ---------- 1. escala e rótulos fixos ---------- */
test('os 5 eixos e os 3 níveis são exatamente os do módulo de forma (mesma ordem), com rótulos fixos escritos pelo código', () => {
  assert.deepEqual([...R.EIXOS], [...F.EIXOS]);
  assert.deepEqual(Object.keys(R.NIVEL_RAIO), [...F.NIVEIS]);
  assert.deepEqual(Object.keys(R.PALAVRAS_NIVEL), [...F.NIVEIS]);
  assert.deepEqual(R.EIXOS.map((e) => R.ROTULOS[e]), ['Volume', 'Repetição', 'Urgência', 'Depende de pessoas', 'Informação espalhada']);
  assert.deepEqual(Object.values(R.PALAVRAS_NIVEL), ['não falou', 'comentou', 'deixou claro']);
});

test('escala dos níveis: raio 0,15 / 0,5 / 0,85; o mínimo não é zero; nível desconhecido cai no mais baixo', () => {
  assert.equal(R.raioDoNivel('nao_falou'), 0.15);
  assert.equal(R.raioDoNivel('comentou'), 0.5);
  assert.equal(R.raioDoNivel('deixou_claro'), 0.85);
  assert.ok(R.raioDoNivel('nao_falou') > 0);
  for (const x of ['', 'alto', 3, null, undefined, '__proto__', 'constructor', 'toString']) assert.equal(R.raioDoNivel(x), 0.15, String(x));
});

test('fatoresDaLeitura: lista de 5 raios na ordem canônica, mesmo se a leitura vier embaralhada', () => {
  const l = lerJson('clinica.json');
  assert.deepEqual(R.fatoresDaLeitura(l), [0.5, 0.85, 0.15, 0.85, 0.5]);
  const embaralhada = { eixos: l.eixos.slice().reverse() };
  assert.deepEqual(R.fatoresDaLeitura(embaralhada), [0.5, 0.85, 0.15, 0.85, 0.5]);
  assert.deepEqual(R.fatoresDaLeitura(null), [0.15, 0.15, 0.15, 0.15, 0.15]);
});

/* ---------- 2. altura própria, constante por largura ---------- */
test('alturaRadar: 300 em 390; constante por largura; inteira; nunca decresce; limitada a 240..320', () => {
  assert.equal(R.alturaRadar(390), 300);
  for (const l of LARGURAS) {
    const a = R.alturaRadar(l);
    assert.equal(a, R.alturaRadar(l), 'a mesma largura devolve sempre a mesma altura');
    assert.ok(Number.isInteger(a) && a >= 240 && a <= 320, l + ' -> ' + a);
  }
  let antes = 0;
  for (let l = 200; l <= 2000; l += 7) { const a = R.alturaRadar(l); assert.ok(a >= antes, 'cresce com a largura, sem voltar: ' + l); antes = a; }
  assert.equal(R.alturaRadar(320), 246);
  assert.equal(R.alturaRadar(1280), 320);
  for (const x of [0, -5, NaN, undefined, null, 'x', Infinity]) assert.equal(R.alturaRadar(x), 300, 'sem largura medida usa a de 390: ' + String(x));
});

/* ---------- 3. geometria ---------- */
test('geometria: caixa com a altura reservada, 5 vértices dentro dela, rótulos dentro e sem encostar um no outro', () => {
  for (const l of LARGURAS) {
    const g = R.geometria(l);
    assert.equal(g.largura, l); assert.equal(g.altura, R.alturaRadar(l)); assert.equal(g.cx, l / 2);
    assert.ok(g.raio > 30, l + ': raio ' + g.raio);
    assert.equal(g.rotulos.length, 5);
    for (let i = 0; i < 5; i++) {
      const v = R.vertice(g, i, 0.85);   /* o anel de fora */
      assert.ok(v.x >= 0 && v.x <= l && v.y >= 0 && v.y <= g.altura, l + ' vértice ' + i);
      const r = g.rotulos[i];
      assert.ok(r.x >= 0 && r.x <= l && r.y >= 0 && r.y <= g.altura, l + ' âncora do rótulo ' + i);
      assert.ok(r.max >= 56, l + ' rótulo ' + i + ' tem ao menos 56 px: ' + r.max);
      /* o retângulo que o rótulo pode ocupar cabe na caixa */
      const [x0, x1] = r.ancora === 'cima' ? [r.x - r.max / 2, r.x + r.max / 2] : r.ancora === 'direita' || r.ancora === 'baixo-dir' ? [r.x, r.x + r.max] : [r.x - r.max, r.x];
      assert.ok(x0 >= -0.5 && x1 <= l + 0.5, l + ' rótulo ' + i + ' [' + x0 + ',' + x1 + ']');
    }
    /* os dois de baixo não se sobrepõem */
    const [b1, b2] = [g.rotulos[2], g.rotulos[3]];
    assert.equal(b1.ancora, 'baixo-dir'); assert.equal(b2.ancora, 'baixo-esq');
    assert.ok(b2.x < b1.x, l + ': o de baixo à esquerda termina antes de o da direita começar');
    /* o de cima não invade os laterais */
    assert.ok(g.rotulos[0].y <= g.rotulos[1].y);
    /* os anéis são os três níveis */
    assert.deepEqual(g.aneis.map((a) => +(a / g.raio).toFixed(4)), [+(0.15 / 0.85).toFixed(4), +(0.5 / 0.85).toFixed(4), 1]);
  }
});

test('vertice e pontos: ângulos de pentágono, volume no topo, em sentido horário; nível mais alto fica mais longe do centro', () => {
  const g = R.geometria(390);
  const topo = R.vertice(g, 0, 0.85);
  assert.equal(topo.x, g.cx); assert.ok(topo.y < g.cy);
  assert.ok(R.vertice(g, 1, 0.85).x > g.cx && R.vertice(g, 4, 0.85).x < g.cx);
  assert.ok(R.vertice(g, 2, 0.85).y > g.cy && R.vertice(g, 3, 0.85).y > g.cy);
  const d = (v) => Math.hypot(v.x - g.cx, v.y - g.cy);
  for (let i = 0; i < 5; i++) assert.ok(d(R.vertice(g, i, 0.85)) > d(R.vertice(g, i, 0.5)) && d(R.vertice(g, i, 0.5)) > d(R.vertice(g, i, 0.15)) && d(R.vertice(g, i, 0.15)) > 0);
  assert.ok(Math.abs(d(R.vertice(g, 3, 0.85)) - g.raio) < 1e-9, 'o anel de fora tem o raio da geometria');
  const p = R.pontos(g, [0.5, 0.85, 0.15, 0.85, 0.5]);
  assert.match(p, /^(-?\d+(\.\d)?,-?\d+(\.\d)? ){4}-?\d+(\.\d)?,-?\d+(\.\d)?$/);
  assert.notEqual(p, R.pontos(g, [0.85, 0.85, 0.85, 0.85, 0.85]));
});

test('interpolar e suave: pontas exatas, meio entre as pontas, t fora de 0..1 é preso, nunca lança', () => {
  assert.deepEqual(R.interpolar([0.15, 0.5], [0.85, 0.5], 0), [0.15, 0.5]);
  assert.deepEqual(R.interpolar([0.15, 0.5], [0.85, 0.15], 1), [0.85, 0.15]);
  const meio = R.interpolar([0.15, 0.5], [0.85, 0.15], 0.5);
  assert.ok(meio[0] > 0.15 && meio[0] < 0.85 && meio[1] < 0.5 && meio[1] > 0.15);
  assert.deepEqual(R.interpolar([0.2], [0.8], -3), [0.2]);
  assert.deepEqual(R.interpolar([0.2], [0.8], 9), [0.8]);
  assert.equal(R.suave(0), 0); assert.equal(R.suave(1), 1);
  let a = 0; for (let t = 0; t <= 1.0001; t += 0.05) { const s = R.suave(t); assert.ok(s >= a); a = s; }
  assert.equal(R.DURACAO_MS, 450);
});

/* ---------- 4. montagem: o que aparece ---------- */
test('montar sem leitura: o estado inicial honesto (tudo "não falou", sem evidência), 5 linhas na ordem canônica, título e legenda fixos', () => {
  const m = montado();
  const ls = linhas(m.alvo);
  assert.equal(ls.length, 5);
  assert.deepEqual(m.alvo.porTag('dt').map((n) => n.textContent), ['Volume', 'Repetição', 'Urgência', 'Depende de pessoas', 'Informação espalhada']);
  assert.deepEqual(m.alvo.porClasse('plr-nivel').map((n) => n.textContent), Array(5).fill('não falou'));
  assert.equal(m.alvo.porClasse('plr-evidencia').length, 0);
  assert.match(m.alvo.textContent, /Como lemos o seu caso/);
  assert.match(m.alvo.textContent, /É o que você contou, não uma nota do seu negócio\./);
  assert.equal(m.alvo.porTag('dl').length, 1);
  assert.equal(m.alvo.porClasse('plr-rot').length, 5);
  assert.deepEqual(m.alvo.porClasse('plr-rot').map((n) => n.textContent), ['Volume', 'Repetição', 'Urgência', 'Depende de pessoas', 'Informação espalhada']);
});

test('as 3 leituras do cofre de fixtures: cada cliente tem o seu desenho, com nível por extenso e evidência', () => {
  const vistos = new Set();
  for (const n of NICHOS) {
    const l = lerJson(n + '.json');
    const m = montado(l);
    const pontos = pontosDe(m.alvo);
    vistos.add(pontos);
    const niveis = m.alvo.porClasse('plr-nivel').map((x) => x.textContent);
    assert.deepEqual(niveis, l.eixos.map((e) => ({ nao_falou: 'não falou', comentou: 'comentou', deixou_claro: 'deixou claro' })[e.nivel]), n);
    const evid = m.alvo.porClasse('plr-evidencia').map((x) => x.textContent);
    assert.deepEqual(evid, l.eixos.filter((e) => e.nivel !== 'nao_falou' && e.evidencia).map((e) => '“' + e.evidencia + '”'), n);
  }
  assert.equal(vistos.size, 3, 'três leituras, três polígonos diferentes');
});

test('nenhum número é exibido: nem no texto, nem no aria-label, nem em atributo de texto', () => {
  for (const n of NICHOS) {
    const m = montado(lerJson(n + '.json'));
    assert.doesNotMatch(m.alvo.textContent, /\d/, n + ': dígito no texto');
    assert.doesNotMatch(m.alvo.textContent, /%/, n);
    for (const no of m.alvo.todos((x) => x.tag !== '#texto')) for (const k of ['aria-label', 'title', 'alt', 'aria-valuenow', 'aria-valuetext']) if (no.hasAttribute(k)) assert.doesNotMatch(no.getAttribute(k), /\d|%/, k);
  }
});

test('a evidência do eixo "não falou" NÃO é desenhada, mesmo que venha na leitura', () => {
  const l = nivelTodos('nao_falou');
  l.eixos[0].evidencia = 'tem muita procura';
  const m = montado(l);
  assert.equal(m.alvo.porClasse('plr-evidencia').length, 0);
  assert.doesNotMatch(m.alvo.textContent, /muita procura/);
});

test('a evidência entra por textContent: HTML na evidência vira texto, nunca elemento', () => {
  /* a forma de verdade recusa "<"; aqui um validador que deixa passar tudo prova que o DESENHO também se protege */
  const frouxo = { EIXOS: F.EIXOS, NIVEIS: F.NIVEIS, validarFormaLeitura: (b) => ({ ok: true, leitura: b, motivos: [], erros: [] }) };
  const l = nivelTodos('comentou');
  l.eixos[1].evidencia = '<img src=x onerror=alert(1)>';
  l.eixos[2].evidencia = '&lt;b&gt;negrito&lt;/b&gt; <script>alert(2)</script>';
  const m = montado(l, { forma: frouxo });
  const evid = m.alvo.porClasse('plr-evidencia').map((x) => x.textContent);
  assert.ok(evid.includes('“<img src=x onerror=alert(1)>”'), evid.join('|'));
  assert.ok(evid.includes('“&lt;b&gt;negrito&lt;/b&gt; <script>alert(2)</script>”'));
  for (const no of m.registro.criados) assert.ok(!['img', 'script', 'b', 'iframe', 'svg:img'].includes(no.tag), 'elemento criado a partir de texto: ' + no.tag);
  for (const no of m.alvo.todos((x) => x.tag !== '#texto')) for (const k of Object.keys(no.atributos)) assert.doesNotMatch(k, /^on/i, 'atributo de evento: ' + k);
});

test('leitura inválida (as de fixtures/radar/invalidos): recusada, sem lançar, e o que está na tela não muda', () => {
  const arquivos = fs.readdirSync(new URL('./fixtures/radar/invalidos/', import.meta.url)).filter((n) => n.endsWith('.json'));
  assert.ok(arquivos.length >= 10);
  const m = montado(lerJson('clinica.json'));
  const antes = [pontosDe(m.alvo), m.alvo.textContent];
  for (const a of arquivos) {
    const inv = JSON.parse(fs.readFileSync(new URL('./fixtures/radar/invalidos/' + a, import.meta.url), 'utf8'));
    const bruto = inv.leitura !== undefined ? inv.leitura : inv;
    assert.equal(m.radar.atualizar(m.alvo, bruto), false, a);
    assert.deepEqual([pontosDe(m.alvo), m.alvo.textContent], antes, a + ': a tela mudou');
  }
  for (const x of [undefined, null, 7, 'x', [], { eixos: 'x' }]) assert.equal(m.radar.atualizar(m.alvo, x), false);
  assert.equal(m.radar.montar(null, lerJson('loja.json')), null, 'sem contêiner: devolve null, não lança');
});

test('sem o módulo de forma na página o radar não desenha leitura nenhuma (falha fechada), mas monta o quadro vazio', () => {
  const m = montado(lerJson('clinica.json'), { forma: false });
  assert.equal(linhas(m.alvo).length, 5);
  assert.equal(m.alvo.porClasse('plr-evidencia').length, 0);
  assert.deepEqual(m.alvo.porClasse('plr-nivel').map((n) => n.textContent), Array(5).fill('não falou'));
  assert.equal(m.radar.atualizar(m.alvo, lerJson('loja.json')), false);
});

test('atualizar troca níveis e evidências na lista, na ordem canônica, e devolve true', () => {
  const m = montado(lerJson('clinica.json'));
  const loja = lerJson('loja.json');
  assert.equal(m.radar.atualizar(m.alvo, loja), true);
  assert.deepEqual(m.alvo.porClasse('plr-evidencia').map((x) => x.textContent), loja.eixos.filter((e) => e.nivel !== 'nao_falou' && e.evidencia).map((e) => '“' + e.evidencia + '”'));
  assert.equal(linhas(m.alvo).length, 5);
  /* e volta ao vazio: a evidência sai */
  assert.equal(m.radar.atualizar(m.alvo, nivelTodos('nao_falou')), true);
  assert.equal(m.alvo.porClasse('plr-evidencia').length, 0);
});

test('montar de novo no mesmo contêiner não duplica nada', () => {
  const m = montado(lerJson('clinica.json'));
  m.radar.montar(m.alvo, lerJson('loja.json'));
  assert.equal(m.alvo.porTag('dl').length, 1);
  assert.equal(m.alvo.porClasse('plr-rot').length, 5);
});

/* ---------- 5. acessibilidade e altura ---------- */
test('o desenho é decorativo (aria-hidden) e a lista <dl> é o que o leitor de tela lê; o grupo tem nome', () => {
  const m = montado(lerJson('clinica.json'));
  const svg = m.alvo.porTag('svg')[0];
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.getAttribute('focusable'), 'false');
  for (const r of m.alvo.porClasse('plr-rot')) assert.equal(r.getAttribute('aria-hidden'), 'true');
  const raiz = m.alvo.porClasse('plr')[0];
  assert.equal(raiz.getAttribute('role'), 'group');
  const rotulo = raiz.getAttribute('aria-labelledby');
  assert.ok(rotulo && m.alvo.todos((n) => n.getAttribute && n.getAttribute('id') === rotulo).length === 1, 'aria-labelledby aponta para o título');
  for (const dt of m.alvo.porTag('dt')) assert.ok(dt.pai.tag === 'div' && dt.pai.pai.tag === 'dl');
});

test('o JS nunca dá altura ao radar (o CSS reserva); só posiciona rótulos e dimensiona o SVG por atributo', () => {
  const m = montado(lerJson('clinica.json'));
  for (const no of m.alvo.todos((n) => n.tag !== '#texto')) for (const k of ['height', 'minHeight', 'maxHeight', 'cssText']) assert.equal(no.style[k], undefined, k + ' em ' + no.tag);
  assert.doesNotMatch(fonte.replace(/\/\*[\s\S]*?\*\//g, ''), /style\.(height|minHeight|maxHeight|cssText)|\.style\s*=/);
  const svg = m.alvo.porTag('svg')[0];
  assert.equal(svg.getAttribute('width'), '390'); assert.equal(svg.getAttribute('height'), '300');
  assert.equal(svg.getAttribute('viewBox'), '0 0 390 300');
});

test('muda a largura do contêiner: o desenho se refaz (ResizeObserver) sem mudar o texto', () => {
  const m = montado(lerJson('clinica.json'), {}, 390);
  const obs = m.registro.observadores[0];
  assert.ok(obs && obs.alvos.length === 1, 'observa o quadro');
  const textoAntes = m.alvo.textContent;
  const quadro = obs.alvos[0];
  quadro.largura = 320;
  obs.fn([]);
  const svg = m.alvo.porTag('svg')[0];
  assert.equal(svg.getAttribute('width'), '320'); assert.equal(svg.getAttribute('height'), String(R.alturaRadar(320)));
  assert.equal(m.alvo.textContent, textoAntes);
});

test('largura 0 (contêiner escondido): usa a de 390 e não quebra', () => {
  const m = montado(lerJson('clinica.json'), {}, 0);
  assert.equal(m.alvo.porTag('svg')[0].getAttribute('width'), '390');
});

/* ---------- 6. movimento ---------- */
test('sem BEYON: salta direto para o polígono novo, sem laço e sem lançar', () => {
  const m = montado(nivelTodos('nao_falou'));
  const alvoPontos = (() => { const g = R.geometria(390); return R.pontos(g, R.fatoresDaLeitura(lerJson('clinica.json'))); })();
  assert.equal(m.radar.atualizar(m.alvo, lerJson('clinica.json')), true);
  assert.equal(pontosDe(m.alvo), alvoPontos);
});

test('movimento reduzido: BEYON.add NUNCA é chamado e o polígono salta; nenhuma animação WAAPI', () => {
  const b = beyonDeMentira(true);
  const m = montado(nivelTodos('nao_falou'), { beyon: b });
  m.radar.atualizar(m.alvo, lerJson('clinica.json'));
  m.radar.atualizar(m.alvo, lerJson('loja.json'));
  assert.equal(b.adds.length, 0);
  assert.equal(m.registro.animacoes.length, 0);
  assert.equal(pontosDe(m.alvo), R.pontos(R.geometria(390), R.fatoresDaLeitura(lerJson('loja.json'))));
});

test('com BEYON e movimento: interpola 450 ms pelo laço único (um add só, com nome plr-), termina exatamente no alvo e sai do laço', () => {
  const b = beyonDeMentira(false);
  const m = montado(nivelTodos('nao_falou'), { beyon: b });
  const g = R.geometria(390);
  const de = R.pontos(g, R.fatoresDaLeitura(nivelTodos('nao_falou')));
  const para = R.pontos(g, R.fatoresDaLeitura(lerJson('clinica.json')));
  m.relogio.t = 5000;
  assert.equal(m.radar.atualizar(m.alvo, lerJson('clinica.json')), true);
  assert.equal(b.adds.length, 1);
  assert.match(b.adds[0], /^plr-/);
  assert.equal(pontosDe(m.alvo), de, 'ainda não saiu do lugar antes do primeiro quadro');
  b.quadro(5000 + 225);
  const meio = pontosDe(m.alvo);
  assert.notEqual(meio, de); assert.notEqual(meio, para);
  b.quadro(5000 + 300);
  assert.notEqual(pontosDe(m.alvo), para);
  assert.equal(b.laco.length, 1, 'ainda no laço');
  b.quadro(5000 + 450);
  assert.equal(pontosDe(m.alvo), para);
  assert.equal(b.laco.length, 0, 'saiu do laço ao terminar');
  assert.deepEqual(b.removes, b.adds);
});

test('atualizar no meio da animação parte de onde o polígono está e mantém um único registro no laço', () => {
  const b = beyonDeMentira(false);
  const m = montado(nivelTodos('nao_falou'), { beyon: b });
  m.relogio.t = 100;
  m.radar.atualizar(m.alvo, lerJson('clinica.json'));
  b.quadro(100 + 300);
  const noMeio = pontosDe(m.alvo);
  m.relogio.t = 400;
  m.radar.atualizar(m.alvo, lerJson('loja.json'));
  assert.equal(b.laco.length, 1, 'um só registro no laço');
  assert.equal(pontosDe(m.alvo), noMeio, 'nada pulou');
  b.quadro(400 + 450);
  assert.equal(pontosDe(m.alvo), R.pontos(R.geometria(390), R.fatoresDaLeitura(lerJson('loja.json'))));
  assert.equal(b.laco.length, 0);
});

test('a mesma leitura de novo não anima nem registra nada no laço', () => {
  const b = beyonDeMentira(false);
  const m = montado(lerJson('clinica.json'), { beyon: b });
  const antes = b.adds.length;
  m.radar.atualizar(m.alvo, lerJson('clinica.json'));
  assert.equal(b.adds.length, antes);
});

test('com BEYON.iniciar disponível, o radar o chama ao entrar no laço (o laço do site só roda depois de iniciar)', () => {
  const b = beyonDeMentira(false); let chamadas = 0; b.iniciar = () => { chamadas++; };
  const m = montado(nivelTodos('nao_falou'), { beyon: b });
  m.radar.atualizar(m.alvo, lerJson('clinica.json'));
  assert.ok(chamadas >= 1);
});

test('a primeira leitura também cresce do mínimo (montar com BEYON registra o laço), e o texto já está inteiro antes do primeiro quadro', () => {
  const b = beyonDeMentira(false);
  const m = montado(lerJson('clinica.json'), { beyon: b });
  assert.equal(b.adds.length, 1);
  assert.match(m.alvo.textContent, /toda hora perguntam o horário/);
});

test('WAAPI: a linha que mudou pisca (animate com opacity); sem animate disponível não lança', () => {
  const b = beyonDeMentira(false);
  const m = montado(nivelTodos('nao_falou'), { beyon: b });
  m.radar.atualizar(m.alvo, lerJson('clinica.json'));
  assert.ok(m.registro.animacoes.length >= 1);
  const a = m.registro.animacoes[0];
  assert.ok(a.quadros.every((q) => Object.keys(q).every((k) => ['opacity', 'offset', 'easing', 'transform'].includes(k))), 'só opacity/transform');
  assert.ok(a.opcoes.duration <= 450);
  /* sem animate */
  const m2 = montado(nivelTodos('nao_falou'), { beyon: beyonDeMentira(false) });
  for (const n of m2.registro.criados) n.animate = undefined;
  assert.doesNotThrow(() => m2.radar.atualizar(m2.alvo, lerJson('loja.json')));
});

/* ---------- 7. o código ---------- */
function semComentariosEStrings(src) {
  let out = '', i = 0, ultimo = '';
  const abreRegex = (u) => u === '' || '(,=:[!&|?{};+-*%<>~^'.includes(u);
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; out += '""'; ultimo = '"'; continue; }
    if (c === '/' && abreRegex(ultimo)) {
      i++; let classe = false;
      while (i < src.length && (src[i] !== '/' || classe)) { if (src[i] === '\\') i++; else if (src[i] === '[') classe = true; else if (src[i] === ']') classe = false; i++; }
      i++; while (/[a-z]/.test(src[i] || '')) i++; out += '/r/'; ultimo = ')'; continue;
    }
    out += c; if (!/\s/.test(c)) ultimo = c; i++;
  }
  return out;
}
const limpo = semComentariosEStrings(fonte);
const textoPuro = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1');

test('o texto nunca entra por HTML: nada de innerHTML, outerHTML, insertAdjacentHTML, document.write, DOMParser, createContextualFragment, eval', () => {
  for (const proibido of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'DOMParser', 'createContextualFragment', 'srcdoc', 'eval(', 'new Function', 'setAttribute(\'on', 'setAttribute("on']) {
    assert.ok(!textoPuro.includes(proibido), 'o radar usa ' + proibido);
  }
  assert.match(limpo, /createTextNode|textContent/, 'e usa textContent/createTextNode');
});

test('nenhum requestAnimationFrame, setInterval nem setTimeout: o único laço é o window.BEYON.add', () => {
  assert.doesNotMatch(textoPuro, /requestAnimationFrame|cancelAnimationFrame|setInterval|setTimeout/);
  assert.match(limpo, /\.add\(/);
});

test('nenhuma variável de CSS escrita por JS (regra 1 do CLAUDE.md) e nada de estilo embutido por texto', () => {
  assert.doesNotMatch(limpo, /setProperty|cssText|\.style\.setProperty|setAttribute\(\s*""\s*,\s*[^)]*\)\s*;?\s*\/\/ style/);
  assert.ok(!/setAttribute\('style'|setAttribute\("style"/.test(textoPuro));
});

const PROIBIDOS_ES5 = [
  [/=>/, 'seta'], [/\bconst\b/, 'const'], [/\blet\b/, 'let'], [/`/, 'crase'], [/\bclass\b/, 'class'], [/\.\.\./, 'espalhar'],
  [/Object\.(values|entries|assign)/, 'Object.values/entries/assign'], [/Array\.from/, 'Array.from'], [/\.(includes|startsWith|endsWith|find|findIndex)\(/, 'método ES6 de lista/texto'],
  [/\basync\b|\bawait\b|\bPromise\b|\bSymbol\b|\bnew Map\b|\bnew Set\b|\bWeakMap\b|\bProxy\b/, 'ES6+'], [/\?\.(?!\d)/, '?.'], [/\?\?/, '??'], [/\*\*/, '**'],
  [/\bfor\s*\([^;()]*\sof\s/, 'for...of'], [/\b(?:var|let|const)\s*[\[{]/, 'desestruturação'], [/\bfunction\s*[\w$]*\s*\([^)]*=[^)]*\)/, 'parâmetro padrão'],
  [/Math\.(hypot|trunc|sign|cbrt)\b/, 'Math ES6'], [/Number\.(isInteger|isFinite|isNaN)\b/, 'Number ES6'], [/\.padStart\(|\.padEnd\(|\.repeat\(/, 'texto ES6']
];
test('ES5 puro: a varredura não acha nada que um navegador antigo não leia', () => {
  const achados = PROIBIDOS_ES5.filter(([re]) => re.test(limpo)).map(([, n]) => n);
  assert.deepEqual(achados, []);
  assert.match(fonte, /'use strict'/);
  /* e a varredura enxerga o que deve */
  const via = (s) => PROIBIDOS_ES5.filter(([re]) => re.test(semComentariosEStrings(s))).map(([, n]) => n);
  assert.deepEqual(via('var a = (x) => x;'), ['seta']);
  assert.deepEqual(via('var a = "=> const"; // let'), []);
});

test('o arquivo carrega como script clássico (window.BZRadar) e como CommonJS, com a mesma API, sem tocar na página ao carregar', () => {
  const m = carregarRadar();
  assert.deepEqual(Object.keys(m.radar).sort(), Object.keys(R).sort());
  for (const k of ['montar', 'atualizar', 'alturaRadar']) assert.equal(typeof m.radar[k], 'function', k);
  assert.equal(m.registro.criados.length, 0, 'carregar não cria elemento');
  assert.equal(m.registro.observadores.length, 0);
});

test('peso: ≤ 8 KB gzip -9 (o radar pode usar até 8 dos 20 KB do orçamento dividido com o 2b)', () => {
  const gz = zlib.gzipSync(fs.readFileSync(ARQ), { level: 9 }).length;
  assert.ok(gz <= 8 * 1024, 'gzip -9: ' + gz + ' bytes');
});
