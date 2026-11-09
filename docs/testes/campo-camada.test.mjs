/* O ENGASGO DO CAMPO NO CELULAR (js/campo.js, 2026-11-07). Com o canvas do fundo em 1,5 px por px CSS, o traço de
   1 px tem 1,5 px do aparelho e o Skia deixa de tratá-lo como linha fina: um caminho curvo aberto ou com vários
   trechos vira uma máscara rasterizada pela CPU do processo da GPU e enviada como textura, A CADA QUADRO (rastreio:
   SurfaceDrawContext::internalDrawPath + GrGpu::writePixels; ~7 ms por quadro numa CPU de mesa, num processo que o
   "processador 4x mais lento" não alcança e que no celular é o gargalo: quadros de 0,5–1 s com o fio principal livre).
   Medidas em docs/hub-fps.mjs. Aqui fica a FORMA de desenhar que evita isso, sem mudar o desenho:
   - os anéis (que não mudam de forma) são traçados uma vez numa camada e carimbados por quadro;
   - cada traço reto é um caminho de um segmento (a GPU o desenha como retângulo), cada losango um caminho fechado;
   - a onda, com o reator na tela, é a elipse inteira fechada.
   node --test docs/testes/campo-camada.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const FONTE = fs.readFileSync(new URL('../../js/campo.js', import.meta.url), 'utf8');

/* um contexto 2D que só anota: cada stroke() leva os comandos do caminho desde o último beginPath() */
function contexto(nome) {
  const c = { nome, dpr: 1.5, cmds: [], tracos: [], carimbos: 0, lineWidth: 1, strokeStyle: '', fillStyle: '', globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const anota = (k) => function () { c.cmds.push(k); };
  Object.assign(c, {
    beginPath() { c.cmds = []; }, moveTo: anota('M'), lineTo: anota('L'), ellipse: anota('E'), closePath: anota('Z'), rect: anota('R'),
    stroke() { c.tracos.push(c.cmds.join('')); }, fill() {}, fillRect() {}, strokeRect() {}, clearRect() {}, clip() {},
    save() {}, restore() {}, setTransform() {}, drawImage() { c.carimbos++; }
  });
  return c;
}

function montar(op = {}) {
  const camadas = [];
  const documento = { createElement: () => { const cv = { width: 0, height: 0, getContext: () => { const k = contexto('camada'); camadas.push(k); return k; } }; return cv; } };
  const B = { tom: op.tom || ((c) => c), texto() {}, largura: () => 10 };
  const janela = { BEYON: B };
  vm.runInNewContext(FONTE, { window: janela, document: documento, Math });
  const ctx = contexto('pagina');
  ctx.__dpr = op.dpr || 1.5;
  const campo = B.campo({ ctx, cores: { AC: '73,229,221', AC2: '166,244,239', T1: '242,244,244', PRATA: '183,191,192' }, celular: true, livre: () => true, varre: false });
  const estado = { W: 390, H: op.H === undefined ? 844 : op.H, topo: 56, cursor: null, reduzido: false, rLimite: 24000 };
  const quadro = (oy, rotor) => { campo.origem(195, oy, 150, 0, rotor || 0); campo.passo(0.016, estado); campo.desenhar(0.9, true); };
  /* movimento reduzido (js/rede.js): enquadra e desenha um quadro parado, sem passo */
  const parado = (oy) => { campo.origem(195, oy, 150, 0, 0); campo.enquadrar(estado.W, estado.H, estado.topo); campo.desenhar(1, false); };
  return { campo, ctx, camadas, quadro, parado };
}
const curvas = (t) => t.filter((x) => x.includes('E'));

test('com a origem parada, os anéis são traçados uma vez na camada e cada quadro só os carimba', () => {
  const { ctx, camadas, quadro, campo } = montar();
  quadro(300);
  assert.equal(camadas.length, 1, 'uma camada');
  const naCamada = curvas(camadas[0].tracos).length;
  assert.ok(naCamada >= 5, 'a camada recebeu os anéis (' + naCamada + ')');
  ctx.tracos.length = 0; ctx.carimbos = 0;
  for (let i = 0; i < 9; i++) quadro(300, i * 0.002);
  assert.deepEqual(curvas(ctx.tracos), [], 'nenhum anel traçado de novo no canvas da página');
  assert.equal(ctx.carimbos, 9, 'um carimbo por quadro');
  assert.equal(curvas(camadas[0].tracos).length, naCamada, 'a camada não foi retraçada');
  assert.ok(campo.desenhados() >= 5, 'o verificador continua vendo os anéis');
});

test('rolando dentro da folga só carimba; passou da folga, retraça uma vez', () => {
  const { camadas, quadro } = montar();
  quadro(300);
  const uma = curvas(camadas[0].tracos).length;
  for (let y = 300; y >= 300 - 200; y -= 2) quadro(y);   /* 2 px por quadro: pixel inteiro do aparelho (3 px), dentro da folga de 211 px */
  assert.equal(curvas(camadas[0].tracos).length, uma, 'dentro da folga');
  quadro(300 - 260);
  assert.equal(curvas(camadas[0].tracos).length > uma, true, 'fora da folga, retraçou');
});

test('no canvas da página nenhum caminho reto tem mais de um segmento, e losango é caminho fechado', () => {
  const { ctx, quadro } = montar();
  for (let i = 0; i < 5; i++) quadro(300, i * 0.01);
  const retos = ctx.tracos.filter((t) => !t.includes('E'));
  assert.ok(retos.length > 20, 'raios, nós e marcas foram traçados (' + retos.length + ')');
  for (const t of retos) assert.ok(t === 'ML' || t === 'MLLLZ', 'caminho ' + t.slice(0, 40) + (t.length > 40 ? '… (' + t.length + ' comandos)' : ''));
});

test('a onda, com o reator na tela, é a elipse inteira fechada (sem moveTo, que a deixaria aberta)', () => {
  const { ctx, campo, quadro } = montar();
  quadro(300);
  campo.soltarOnda();
  ctx.tracos.length = 0;
  for (let i = 0; i < 30; i++) quadro(300);
  const anel = curvas(ctx.tracos);
  assert.ok(anel.length >= 30 * 3, 'a frente e os ecos foram traçados (' + anel.length + ')');
  for (const t of anel) assert.equal(t, 'EZ');
});

test('a cor mudando a cada quadro (ignição do ouro): traço direto, sem retraçar a camada a cada quadro', () => {
  let k = 0;
  const { ctx, camadas, quadro } = montar({ tom: (c) => c + '|' + k });
  quadro(300);
  const naCamada = curvas(camadas[0].tracos).length;
  ctx.tracos.length = 0;
  for (k = 1; k <= 6; k++) quadro(300);
  assert.equal(curvas(camadas[0].tracos).length, naCamada, 'a camada não foi retraçada a cada passo da cor');
  assert.ok(curvas(ctx.tracos).length >= 6 * 5, 'os anéis saíram direto no canvas da página');
  quadro(300); quadro(300);   /* a cor parou: volta a carimbar */
  assert.ok(curvas(camadas[0].tracos).length > naCamada, 'cor nova e parada: camada retraçada');
});

test('movimento reduzido: o quadro parado fora do pixel exato retraça na hora (não vem outro quadro para acertar)', () => {
  const { camadas, parado } = montar();
  parado(300);
  const uma = curvas(camadas[0].tracos).length;
  parado(301);   /* 1 px CSS = 1,5 px do aparelho: o carimbo cairia a meio pixel */
  assert.ok(curvas(camadas[0].tracos).length > uma, 'retraçou no lugar exato');
  const duas = curvas(camadas[0].tracos).length;
  parado(303);   /* 3 px do aparelho: pixel inteiro, só carimba */
  assert.equal(curvas(camadas[0].tracos).length, duas);
});

test('tela sem altura: nada lança, os anéis saem direto', () => {
  const { ctx, quadro } = montar({ H: 0 });
  assert.doesNotThrow(() => quadro(300));
  assert.equal(ctx.carimbos, 0);
});

test('com 1 px por px CSS (linha fina, já barata) o desenho segue o de antes: anéis direto, um caminho por passada', () => {
  const { ctx, camadas, quadro } = montar({ dpr: 1 });
  for (let i = 0; i < 3; i++) quadro(300, i * 0.01);
  assert.equal(camadas.length, 0, 'sem camada');
  assert.equal(ctx.carimbos, 0);
  assert.ok(ctx.tracos.some((t) => /^(ML){3,}$/.test(t)), 'raios num caminho só');
});
