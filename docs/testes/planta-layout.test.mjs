/* O LAYOUT DA PLANTA VIVA (PR 2b; spec §1.4 e §4.4): geometria pura, sem DOM, testada em Node. O que se prova, em TODAS as formas válidas
   (8 e 9 caixas nas três topologias, ver docs/testes/planta-formas.mjs) e em 8 larguras: nada se sobrepõe, tudo cabe na largura e na altura,
   as rotas ligam caixas que existem e saem/chegam na borda delas, a ordem da luz é total, e sobretudo H === alturaReservada(largura): a
   altura só depende da largura, nunca do plano (é isso que zera o CLS da faixa: o quadro nasce com a altura final).
   node --test docs/testes/planta-layout.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import F from '../../js/orcamento-planta-forma.js';
import L from '../../js/planta-layout.js';
import { todasAsFormas, laco, bifurca, espinha } from './planta-formas.mjs';

const LARGURAS = [320, 360, 390, 430, 768, 1024, 1072, 1280];
const FORMAS = todasAsFormas();
const caixas = (g) => g.nos.filter((n) => !n.ponta);
const nosTodos = (g) => g.nos;
const clone = (o) => JSON.parse(JSON.stringify(o));
const fonte = fs.readFileSync(new URL('../../js/planta-layout.js', import.meta.url), 'utf8');

const cruza = (a, b, folga) => a.x < b.x + b.w - folga && b.x < a.x + a.w - folga && a.y < b.y + b.h - folga && b.y < a.y + a.h - folga;
const naBorda = (p, n, tol) => {
  const dentroX = p[0] >= n.x - tol && p[0] <= n.x + n.w + tol, dentroY = p[1] >= n.y - tol && p[1] <= n.y + n.h + tol;
  const sobreV = Math.abs(p[0] - n.x) <= tol || Math.abs(p[0] - (n.x + n.w)) <= tol, sobreH = Math.abs(p[1] - n.y) <= tol || Math.abs(p[1] - (n.y + n.h)) <= tol;
  return dentroX && dentroY && (sobreV || sobreH);
};

test('as formas geradas são todas válidas pelo módulo de forma (se o gerador errar, o teste de layout não vale)', () => {
  assert.ok(FORMAS.length >= 30, 'cobertura das formas: ' + FORMAS.length);
  for (const { nome, plano } of FORMAS) assert.equal(F.validarFormaPlano(plano).ok, true, nome);
});

test('alturaReservada: paisagem é sempre 456; retrato depende só da largura; nunca devolve zero', () => {
  assert.equal(L.ALTURA_PAISAGEM, 456);
  for (const W of LARGURAS) {
    const h = L.alturaReservada(W);
    assert.ok(Number.isInteger(h) && h > 100, 'altura inteira e grande em ' + W + ': ' + h);
    if (W >= L.LARGURA_PAISAGEM) assert.equal(h, 456, 'paisagem fixa em ' + W);
    else assert.ok(h > 456, 'retrato é mais alto que a paisagem em ' + W);
  }
  assert.ok(L.LARGURA_PAISAGEM <= 1072, 'a paisagem tem de caber na faixa da página de orçamento (1.200 - 2 x 64 = 1.072 px)');
  /* a mesma largura, a mesma altura (puro) */
  assert.equal(L.alturaReservada(390), L.alturaReservada(390));
});

test('retrato com 9 caixas: ≤ 940 px em 390 e ≤ 1.020 px em 320 (spec §1.4)', () => {
  const nove = FORMAS.filter((f) => f.plano.etapas.length === 8);
  assert.ok(nove.length > 10);
  assert.ok(L.alturaReservada(390) <= 940, 'reservada em 390: ' + L.alturaReservada(390));
  assert.ok(L.alturaReservada(320) <= 1020, 'reservada em 320: ' + L.alturaReservada(320));
  for (const { nome, plano } of nove) {
    assert.ok(L.montarGeometria(plano, 390).H <= 940, nome + ' em 390');
    assert.ok(L.montarGeometria(plano, 320).H <= 1020, nome + ' em 320');
  }
});

for (const W of LARGURAS) {
  test('largura ' + W + ': toda forma válida tem H === alturaReservada, nada se sobrepõe, tudo cabe, rotas ligam caixas e a luz tem ordem total', () => {
    const H = L.alturaReservada(W);
    for (const { nome, plano } of FORMAS) {
      const g = L.montarGeometria(plano, W);
      const onde = nome + ' @' + W;
      assert.equal(g.W, W, onde);
      assert.equal(g.H, H, onde + ': H precisa ser a altura reservada');
      assert.equal(g.paisagem, W >= L.LARGURA_PAISAGEM, onde);
      const total = plano.etapas.length + 1;                              /* + a chegada */
      assert.equal(caixas(g).length, total, onde + ': uma caixa por etapa + a chegada');
      assert.ok(g.mapa.nucleo && g.mapa.led && g.mapa.chegada, onde);
      assert.equal(nosTodos(g).length, total + 2, onde + ': + núcleo e LED');
      /* dentro do quadro */
      for (const n of nosTodos(g)) {
        assert.ok(n.x >= -0.01 && n.y >= -0.01 && n.x + n.w <= W + 0.01 && n.y + n.h <= H + 0.01, onde + ': ' + n.id + ' fora do quadro ' + JSON.stringify([n.x, n.y, n.w, n.h]));
        assert.ok(Number.isFinite(n.x + n.y + n.w + n.h), onde);
      }
      for (const r of g.rotas) for (const p of r.pts) assert.ok(p[0] >= -0.01 && p[0] <= W + 0.01 && p[1] >= -0.01 && p[1] <= H + 0.01, onde + ': rota ' + r.id + ' sai do quadro ' + JSON.stringify(p));
      /* sem sobreposição (caixas e pontas) */
      const ns = nosTodos(g);
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) assert.ok(!cruza(ns[i], ns[j], 0.5), onde + ': ' + ns[i].id + ' sobrepõe ' + ns[j].id);
      /* os rótulos fixos (núcleo, LED, ramos, retorno) não cobrem caixa */
      const rotulos = [];
      for (const n of [g.mapa.nucleo, g.mapa.led]) if (n.rot) rotulos.push({ id: 'rótulo de ' + n.id, x: n.rot.x, y: n.rot.y, w: n.rot.w, h: n.rot.topo ? n.rot.h : 34 });
      for (const t of g.rots) rotulos.push({ id: 'rótulo "' + t.txt + '"', x: t.x, y: t.y, w: t.w, h: 16 });
      for (const rt of rotulos) {
        assert.ok(rt.x >= -0.01 && rt.x + rt.w <= W + 0.01 && rt.y >= -0.01 && rt.y + rt.h <= H + 0.01, onde + ': ' + rt.id + ' sai do quadro ' + JSON.stringify(rt));
        for (const c of caixas(g)) assert.ok(!cruza(rt, c, 0.5), onde + ': ' + rt.id + ' cobre a caixa ' + c.id);
      }
      /* as rotas ligam caixas que existem, partindo e chegando na borda delas */
      for (const r of g.rotas) {
        assert.ok(g.mapa[r.de] && g.mapa[r.a], onde + ': rota ' + r.id + ' liga caixa que não existe');
        assert.ok(r.pts.length >= 2, onde);
        assert.ok(naBorda(r.pts[0], g.mapa[r.de], 1), onde + ': rota ' + r.id + ' não parte da borda de ' + r.de + ' ' + JSON.stringify([r.pts[0], g.mapa[r.de]]));
        assert.ok(naBorda(r.pts[r.pts.length - 1], g.mapa[r.a], 1), onde + ': rota ' + r.id + ' não chega na borda de ' + r.a);
        /* só linhas retas, ortogonais */
        for (let k = 1; k < r.pts.length; k++) assert.ok(Math.abs(r.pts[k][0] - r.pts[k - 1][0]) < 0.51 || Math.abs(r.pts[k][1] - r.pts[k - 1][1]) < 0.51, onde + ': rota ' + r.id + ' em diagonal');
      }
      /* a ordem da luz: núcleo é 0, as ords são 0..N-1 sem buraco, e a chegada vem logo depois do núcleo */
      const ords = ns.map((n) => n.ord).sort((a, b) => a - b);
      assert.deepEqual(ords, ns.map((_, i) => i), onde + ': ords 0..N-1');
      assert.equal(g.mapa.nucleo.ord, 0, onde);
      assert.equal(g.mapa.chegada.ord, 1, onde);
      /* a luz vai do lado de quem parte ao lado de quem chega: nas rotas de ida a origem já está acesa quando o alvo acende */
      for (const r of g.rotas) {
        if (r.alvo && r.alvo !== 'nucleo' && r.tipo !== 'retorno') assert.ok(g.mapa[r.de].ord < g.mapa[r.alvo].ord, onde + ': ' + r.id + ' acende ' + r.alvo + ' antes de ' + r.de);
      }
      /* a numeração (01, 02...) só das caixas, na ordem da luz */
      const numeradas = caixas(g).slice().sort((a, b) => a.ord - b.ord).map((n) => n.num);
      assert.deepEqual(numeradas, numeradas.map((_, i) => i + 1), onde + ': 01..N na ordem da luz');
    }
  });
}

test('paisagem: laço em duas fileiras (pista); espinha com o tronco numa fileira e satélites em cima e embaixo; bifurca com ramos em duas alturas', () => {
  const W = 1280;
  for (const n of [7, 8]) {
    const g = L.montarGeometria(laco(n), W);
    const ys = new Set(caixas(g).map((c) => Math.round(c.y)));
    assert.equal(ys.size, 2, 'laço de ' + (n + 1) + ' caixas em exatamente duas fileiras');
    assert.ok(g.mapa.led.y > Math.min.apply(null, [...ys]) && g.mapa.led.y < Math.max.apply(null, [...ys]), 'o LED fica na curva da pista, entre as fileiras');
  }
  const e = L.montarGeometria(espinha(5, [{ host: 1, lado: 'cima' }, { host: 3, lado: 'baixo' }, { host: 4, lado: 'baixo' }]), W);
  const tronco = caixas(e).filter((c) => c.modo === 'topo');
  assert.equal(new Set(tronco.map((c) => Math.round(c.y))).size, 1, 'o tronco numa fileira só');
  const sats = caixas(e).filter((c) => c.modo === 'lado');
  assert.equal(sats.length, 3);
  assert.ok(sats.some((s) => s.y < tronco[0].y) && sats.some((s) => s.y > tronco[0].y), 'satélites dos dois lados');
  const b = L.montarGeometria(bifurca(1, 2, 2, 2), W);
  assert.ok(new Set(caixas(b).map((c) => Math.round(c.y))).size >= 3, 'bifurca: entrada/saída no meio e um ramo em cima e outro embaixo');
});

test('espinha na paisagem: o satélite do ÚLTIMO passo do tronco desce, para não cobrir o rótulo do objetivo', () => {
  const g = L.montarGeometria(espinha(5, [{ host: 1, lado: 'baixo' }, { host: 4, lado: 'cima' }]), 1280);
  const ultimo = g.mapa.e4, sat = caixas(g).find((c) => c.est && c.est.satelite_de === 'e4');
  assert.ok(sat.y > ultimo.y, 'o satélite pedido em cima desceu');
});

test('retrato: a caixa é compacta (68 px, vão 18 px, 80 em 320) e o retrato mais largo que 480 fica centrado, com a mesma altura do de 480', () => {
  const g = L.montarGeometria(laco(8), 390);
  const lado = caixas(g).filter((c) => c.modo === 'lado');
  assert.ok(lado.length >= 8);
  assert.ok(lado.every((c) => c.h === 68), 'caixa de lado com 68 px em 390');
  const g320 = L.montarGeometria(laco(8), 320);
  assert.ok(caixas(g320).every((c) => c.h === 80), 'caixa de lado com 80 px em 320 (o título pode ter 3 linhas)');
  const larga = L.montarGeometria(laco(8), 1024), estreita = L.montarGeometria(laco(8), L.LARGURA_RETRATO_MAX);
  assert.equal(larga.H, estreita.H, 'a altura do retrato para de crescer com a largura');
  const cx = caixas(larga).concat([larga.mapa.nucleo, larga.mapa.led]);
  const esq = Math.min.apply(null, cx.map((c) => c.x)), dir = Math.max.apply(null, cx.map((c) => c.x + c.w));
  assert.ok(Math.abs((esq + (1024 - dir)) / 2 - esq) < 40, 'o desenho está centrado no quadro');
});

test('as pontas: o núcleo e o LED existem, são redondos e têm rótulo', () => {
  for (const W of [390, 1280]) {
    const g = L.montarGeometria(laco(8), W);
    for (const id of ['nucleo', 'led']) {
      const n = g.mapa[id];
      assert.equal(n.w, n.h, id + ' é um círculo (caixa quadrada)');
      assert.ok(n.rot && n.rot.w > 40, id + ' tem rótulo');
      assert.equal(n.ponta, id);
    }
    assert.equal(g.mapa.led.est.titulo, laco(8).fim.titulo, 'o LED carrega o fim do plano');
  }
});

test('o laço: a última etapa (retorno) fica depois do LED e a rota de volta chega no núcleo; o rótulo do retorno aparece', () => {
  for (const W of [390, 1280]) {
    const p = laco(8), g = L.montarGeometria(p, W);
    const ret = g.mapa[p.etapas[7].id];
    assert.ok(g.mapa.led.ord < ret.ord, 'o retorno acende depois do objetivo @' + W);
    const volta = g.rotas.filter((r) => r.alvo === 'nucleo');
    assert.equal(volta.length, 1);
    assert.equal(volta[0].de, ret.id);
    assert.ok(g.rots.some((t) => t.txt === 'o site continua'), 'rótulo do retorno @' + W);
  }
});

test('a bifurca: os dois ramos saem da decisão e se juntam na primeira etapa de saída; os rótulos dos ramos aparecem', () => {
  for (const W of [390, 1280]) {
    const p = bifurca(2, 2, 1, 2), g = L.montarGeometria(p, W);
    const dec = p.etapas[1].id, a0 = p.etapas[2].id, b0 = p.etapas[4].id, s0 = p.etapas[5].id;
    const ids = g.rotas.map((r) => r.de + '>' + r.a);
    assert.ok(ids.includes(dec + '>' + a0) && ids.includes(dec + '>' + b0), 'a decisão alimenta os dois ramos @' + W);
    assert.ok(ids.includes(p.etapas[3].id + '>' + s0) && ids.includes(b0 + '>' + s0), 'os dois ramos entram na saída @' + W);
    assert.ok(g.rots.some((t) => t.txt === 'caminho da esquerda') && g.rots.some((t) => t.txt === 'caminho da direita'), 'rótulos dos ramos @' + W);
  }
});

test('a espinha: a ordem do array não importa (satélite antes do tronco) e o laço do satélite tem duas rotas', () => {
  for (const W of [390, 1280]) {
    const sats = [{ host: 1, lado: 'cima' }, { host: 3, lado: 'baixo', laco: true }];
    const a = L.montarGeometria(espinha(5, sats, false), W), b = L.montarGeometria(espinha(5, sats, true), W);
    const chave = (g) => caixas(g).map((c) => c.id + '@' + [c.x, c.y, c.w, c.h].join(',')).sort().join('|');
    assert.equal(chave(a), chave(b), 'a geometria não depende da posição no array @' + W);
    assert.equal(a.rotas.filter((r) => r.de === 'e3' && r.a === 'e101').length + a.rotas.filter((r) => r.de === 'e101' && r.a === 'e3').length, 2, 'ida e volta do satélite com laço @' + W);
  }
});

test('determinismo: a mesma entrada dá exatamente a mesma geometria, e o plano de entrada não é alterado', () => {
  for (const { plano } of FORMAS.slice(0, 12)) {
    const antes = JSON.stringify(plano);
    const a = L.montarGeometria(plano, 390), b = L.montarGeometria(clone(plano), 390);
    assert.equal(JSON.stringify(a, (k, v) => (k === 'est' ? v && v.id : v)), JSON.stringify(b, (k, v) => (k === 'est' ? v && v.id : v)));
    assert.equal(JSON.stringify(plano), antes, 'o layout não muda o plano');
  }
});

test('ids de etapa só entram como chave segura: um id "constructor" ou "__proto__" (recusado pela forma) não derruba nem polui o layout', () => {
  const p = laco(7);
  p.etapas[2].id = '__proto__';
  const g = L.montarGeometria(p, 390);
  assert.equal(Object.getPrototypeOf({}).x, undefined);
  assert.ok(g === null || Array.isArray(g.nos));
});

test('o módulo não usa DOM nem tempo (é puro): nada de document, window, Date, Math.random', () => {
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace("typeof window !== 'undefined' ? window : null", '');   /* (o invólucro que expõe window.BZPlantaLayout) */
  assert.ok(!/\bdocument\b|\bwindow\b|Date\.now|new Date|Math\.random|\bsetTimeout\b|requestAnimationFrame/.test(semComentarios));
});

test('nunca devolve altura diferente da reservada mesmo para largura estranha (0, negativa, NaN, enorme): cai numa largura segura', () => {
  for (const W of [0, -5, NaN, undefined, 100, 5000]) {
    const h = L.alturaReservada(W);
    assert.ok(Number.isInteger(h) && h > 100, 'altura para ' + W + ': ' + h);
    const g = L.montarGeometria(laco(8), W);
    assert.equal(g.H, h);
    assert.ok(Number.isFinite(g.W) && g.W > 0);
  }
});
