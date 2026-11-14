/* A GEOMETRIA DO MAPA DO CASO (js/mapa-layout.js; PR 5b, tarefa 2). Sem navegador: as medidas do texto vêm de um ESTIMADOR (caracteres por linha), e
   a conferência é a do laboratório (docs/lab-estruturas-fotos.mjs), que no navegador mede de verdade. Para os planos padrão de todos os nichos (com e
   sem trava, 1 e 2 origens), os 15 planos do laboratório e o caso "limites", nas duas peles, em 320, 390, 768 e 1280:
   caixas sem interseção; rótulo não cobre caixa nem rótulo; tudo dentro do quadro; celular com no máximo 440 px e o objetivo dentro; o ciclo com
   exatamente uma volta; a ordem da história termina no objetivo (no ciclo, a volta vem depois dele). Sabotar o vão do celular (M.celGapY) tem de ficar vermelho. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { planoDoCaso, CHAVES_DO_MAPA } from '../../api/_vendas/mapa-padrao.mjs';

const require = createRequire(import.meta.url);
const L = require('../../js/mapa-layout.js');
const F = require('../../js/orcamento-mapa-forma.js');

/* os planos */
const planos = [];
for (const chave of CHAVES_DO_MAPA) {
  planos.push(['padrão ' + chave, planoDoCaso(chave, {})]);
  planos.push(['padrão ' + chave + ' 2 origens', planoDoCaso(chave, { origens: ['instagram', 'indicacao'] })]);
  planos.push(['padrão ' + chave + ' trava', planoDoCaso(chave, { origens: ['whatsapp'], trava: 'pergunta_e_some', travaRotulo: 'Muita gente pergunta e some' })]);
  planos.push(['padrão ' + chave + ' mapa', planoDoCaso(chave, { origens: ['instagram', 'google_busca'], trava: 'responde_na_mao', travaRotulo: 'Respondo tudo na mão' })]);
}
const janela = {};
vm.runInNewContext(fs.readFileSync(new URL('../lab-estruturas-casos.js', import.meta.url), 'utf8'), { window: janela });
for (const [id, caso] of Object.entries(janela.LAB_ESTRUTURAS_CASOS)) {
  for (const [est, p] of Object.entries(caso.estruturas)) planos.push(['lab ' + id + ' ' + est, { estrutura: est, hoje: caso.hoje, nos: p.nos, setas: p.setas, objetivo: caso.objetivo, fecho: caso.fecho }]);
}
test('os planos do teste passam na forma do mapa (senão o teste mediria plano que a tela nunca recebe)', () => {
  assert.ok(planos.length >= 40, String(planos.length));
  for (const [nome, p] of planos) { const v = F.validarFormaMapa(p); assert.ok(v.ok, nome + ': ' + (v.motivos || []).join(',')); }
});

/* o estimador de texto (Sora 14-15 px, mono 11 px): linhas = caracteres x largura média / largura útil */
const linhas = (txt, larg, porLetra) => Math.max(1, Math.ceil(String(txt || '').length * porLetra / Math.max(20, larg)));
function medir(plano, pedidos, pele) {
  const nos = Object.create(null);
  for (const n of plano.nos) nos[n.id] = n;
  nos.objetivo = { id: 'objetivo', papel: 'objetivo', titulo: plano.objetivo.titulo, frase: plano.objetivo.frase };
  const m = {};
  for (const p of pedidos) {
    if (p.chave.startsWith('no:')) {
      const n = nos[p.id], extra = (n.papel === 'origem' ? 15 : 0) + (n.papel === 'ajustado' ? 15 : 0);
      if (p.celular) {
        const util = p.largura - (pele === 'trilho' ? 48 : 52);
        m[p.chave] = pele === 'trilho' ? Math.max(36, 8 + extra + linhas(n.titulo, util, 8) * 18) : 16 + extra + linhas(n.titulo, util, 8) * 18;
      } else {
        const util = p.largura - (pele === 'trilho' ? 0 : 24);
        m[p.chave] = (pele === 'trilho' ? 36 + 10 : 12 + 22 + 6) + extra + linhas(n.titulo, util, 8.5) * 20 + 4 + linhas(n.frase, util, 7.5) * 18 + (pele === 'trilho' ? 0 : 12);
      }
    } else {
      const largura = Math.min(String(p.texto).length * 6.8 + 8, p.larguraMax);
      m[p.chave] = { w: largura, h: linhas(p.texto, p.larguraMax - 8, 6.8) * 13 + 2 };
    }
  }
  return m;
}
const sob = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

function conferir(nome, plano, larg, pele) {
  const med = medir(plano, L.pedidos(plano, larg, pele), pele);
  const g = L.compor(plano, larg, med, pele);
  const erros = [];
  const caixas = Object.entries(g.caixas);
  const rots = g.setas.map((s) => ({ x: s.rot.left, y: s.rot.top, w: s.rot.w, h: s.rot.h, i: s.i }));
  caixas.forEach(([id, c], i) => {
    if (c.x < -1 || c.y < -1 || c.x + c.w > g.W + 1 || c.y + c.h > g.H + 1) erros.push(id + ' sai do quadro');
    caixas.slice(i + 1).forEach(([id2, c2]) => { if (sob(c, c2)) erros.push(id + ' × ' + id2); });
  });
  rots.forEach((r, i) => {
    if (r.x < -1 || r.y < -1 || r.x + r.w > g.W + 1 || r.y + r.h > g.H + 1) erros.push('rótulo ' + r.i + ' sai do quadro');
    caixas.forEach(([id, c]) => { if (sob(r, c)) erros.push('rótulo ' + r.i + ' cobre ' + id); });
    rots.slice(i + 1).forEach((r2) => { if (sob(r, r2)) erros.push('rótulos ' + r.i + ' e ' + r2.i); });
  });
  if (g.celular) {
    if (g.H > 440) erros.push('altura ' + g.H);
    const o = g.caixas.objetivo;
    if (!o || o.y + o.h > g.H + 1) erros.push('objetivo fora');
  }
  const voltas = g.setas.filter((s) => s.volta).length;
  if (plano.estrutura === 'ciclo' ? voltas !== 1 : voltas !== 0) erros.push(voltas + ' voltas');
  /* a história termina no objetivo; no ciclo, o que vem depois dele (a volta) também é contado, e ele fica na ordem */
  if (plano.estrutura === 'ciclo' ? !g.ordem.includes('objetivo') : g.ordem[g.ordem.length - 1] !== 'objetivo') erros.push('a ordem não termina no objetivo');
  return erros.map((e) => nome + ' ' + pele + ' ' + larg + ': ' + e);
}

for (const pele of ['caixa', 'trilho']) {
  test('pele ' + pele + ': nada se sobrepõe, nada sai do quadro, celular em 440 px com o objetivo dentro, em 320/390/768/1280', () => {
    const erros = [];
    for (const [nome, p] of planos) for (const larg of [320, 390, 768, 1280]) erros.push(...conferir(nome, p, larg, pele));
    assert.deepEqual(erros, []);
  });
}

test('pedidos: a largura dos nós e dos rótulos não depende da altura do texto (o desenho mede em lote, uma vez)', () => {
  const p = planos[0][1];
  const a = L.pedidos(p, 390, 'trilho'), b = L.pedidos(p, 390, 'trilho');
  assert.deepEqual(a, b);
  assert.ok(a.some((x) => x.chave === 'no:objetivo'));
  assert.equal(a.filter((x) => x.chave.startsWith('rot:')).length, p.setas.length);
  for (const x of a) if (x.chave.startsWith('rot:')) assert.ok(x.larguraMax >= 48);
});

test('celular abaixo de 640 px, ou com coluna estreita demais no computador; computador na largura larga', () => {
  const p = planoDoCaso('saude_agenda', {});
  assert.equal(L.compor(p, 390, medir(p, L.pedidos(p, 390, 'caixa'), 'caixa'), 'caixa').celular, true);
  assert.equal(L.compor(p, 1280, medir(p, L.pedidos(p, 1280, 'caixa'), 'caixa'), 'caixa').celular, false);
});

test('amostrar: a luz anda pela curva e pela polilinha, do começo ao fim', () => {
  const pts = L.amostrar({ linha: [[0, 0], [10, 0], [10, 10]] }, 4);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[4], [10, 10]);
  const c = L.amostrar({ curva: [[0, 0], [5, 0], [5, 10], [10, 10]] }, 2);
  assert.deepEqual(c[0], [0, 0]); assert.deepEqual(c[2], [10, 10]);
});
