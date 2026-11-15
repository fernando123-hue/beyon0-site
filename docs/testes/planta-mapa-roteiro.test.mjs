/* O MOVIMENTO DE CADA ESTRUTURA (js/mapa-desenho.js roteiro(); PR 5b, tarefa 4; desenho do PR 5 §5). O roteiro é puro: do plano e da geometria saem os
   instantes em que cada nó acende, cada seta corre, a trava pulsa e o objetivo vira ouro. A tabela do desenho:
     caminho      um nó por vez, na ordem;
     antes_depois a faixa "Hoje" inteira antes da "Com o site"; a trava pulsa uma vez;
     ramos        os dois filhos do nó que se divide acendem no MESMO instante;
     ciclo        o objetivo vira ouro antes de a luz correr a volta;
     mapa         as origens acendem juntas. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { criarJanela } from './planta-dom-falso.mjs';

const require = createRequire(import.meta.url);
const Layout = require('../../js/mapa-layout.js');
const Desenho = require('../../js/mapa-desenho.js');
const w = criarJanela({ reduzido: true, largura: 390 });
Object.assign(w, { BZMapaForma: require('../../js/orcamento-mapa-forma.js'), BZMapaLayout: Layout, BZPlantaPecas: require('../../js/planta-pecas.js'), BZPlantaRelogio: require('../../js/planta-relogio.js').para(w), BZMapaSaber: require('../../js/mapa-saber.js') });
const D = Desenho.para(w);

const janela = {};
vm.runInNewContext(fs.readFileSync(new URL('../lab-estruturas-casos.js', import.meta.url), 'utf8'), { window: janela });
const CASOS = janela.LAB_ESTRUTURAS_CASOS;
const planoDe = (caso, est) => ({ estrutura: est, hoje: CASOS[caso].hoje, nos: CASOS[caso].estruturas[est].nos, setas: CASOS[caso].estruturas[est].setas, objetivo: CASOS[caso].objetivo, fecho: CASOS[caso].fecho });
const roteiroDe = (p, larg = 390) => {
  const med = {};
  for (const x of Layout.pedidos(p, larg, 'trilho')) med[x.chave] = x.chave.startsWith('no:') ? 40 : { w: 60, h: 15 };
  return D.roteiro(p, Layout.compor(p, larg, med, 'trilho'));
};

for (const caso of ['clinica', 'embalagens', 'loja']) {
  test(caso + ' / caminho: um nó por vez, na ordem da história; o ouro depois do objetivo', () => {
    const p = planoDe(caso, 'caminho'), r = roteiroDe(p);
    const ordem = [...p.nos.map((n) => n.id), 'objetivo'].sort((a, b) => r.quando[a] - r.quando[b]);
    const tempos = ordem.map((id) => r.quando[id]);
    for (let i = 1; i < tempos.length; i++) assert.ok(tempos[i] > tempos[i - 1], caso + ': ' + ordem.join(','));
    assert.ok(r.ouro > r.quando.objetivo);
    assert.ok(r.fim >= r.ouro);
  });

  test(caso + ' / antes_depois: a faixa "Hoje" inteira antes da "Com o site"; a trava pulsa uma vez', () => {
    const p = planoDe(caso, 'antes_depois'), r = roteiroDe(p);
    const papel = Object.fromEntries(p.nos.map((n) => [n.id, n.papel]));
    const hoje = p.nos.filter((n) => n.papel === 'hoje' || n.papel === 'trava').map((n) => n.id);
    const site = p.nos.filter((n) => !(n.papel === 'hoje' || n.papel === 'trava') && n.papel !== 'origem').map((n) => n.id);
    assert.ok(hoje.length && site.length);
    assert.ok(Math.max(...hoje.map((id) => r.quando[id])) < Math.min(...site.map((id) => r.quando[id])), caso + ': ' + JSON.stringify(r.quando));
    const travas = p.nos.filter((n) => papel[n.id] === 'trava').map((n) => n.id);
    assert.deepEqual(JSON.stringify(r.pulsos.map((x) => x.id)), JSON.stringify(travas));
    for (const x of r.pulsos) assert.ok(x.em >= r.quando[x.id]);
  });

  test(caso + ' / ramos: os dois filhos do nó que se divide acendem juntos', () => {
    const p = planoDe(caso, 'ramos'), r = roteiroDe(p);
    const saem = {};
    for (const s of p.setas) (saem[s.de] = saem[s.de] || []).push(s.para);
    const div = Object.keys(saem).find((id) => saem[id].length === 2);
    assert.ok(div);
    assert.equal(r.quando[saem[div][0]], r.quando[saem[div][1]]);
    assert.ok(r.quando[saem[div][0]] > r.quando[div]);
  });

  test(caso + ' / ciclo: o objetivo vira ouro antes de a luz correr a volta; a volta tem repouso', () => {
    const p = planoDe(caso, 'ciclo'), r = roteiroDe(p);
    const volta = r.setas.filter((s) => s.volta);
    assert.equal(volta.length, 1);
    assert.ok(r.ouro <= volta[0].em, 'ouro ' + r.ouro + ', volta ' + volta[0].em);
    assert.equal(r.repouso, volta[0].i, 'o ponto do repouso anda na seta da volta');
  });

  test(caso + ' / mapa: as origens acendem juntas, no começo', () => {
    const p = planoDe(caso, 'mapa'), r = roteiroDe(p);
    const origens = p.nos.filter((n) => n.papel === 'origem').map((n) => r.quando[n.id]);
    assert.ok(origens.length >= 1);
    assert.equal(new Set(origens).size, 1);
    assert.equal(origens[0], Math.min(...Object.values(r.quando)));
  });
}

test('toda seta corre depois que a origem dela acendeu, e o roteiro só tem números finitos', () => {
  for (const caso of Object.keys(CASOS)) for (const est of ['caminho', 'antes_depois', 'ramos', 'ciclo', 'mapa']) {
    const p = planoDe(caso, est), r = roteiroDe(p, 1280);
    for (const s of r.setas) { assert.ok(s.em >= r.quando[s.de], caso + ' ' + est); assert.ok(Number.isFinite(s.em) && Number.isFinite(s.dura)); }
    for (const v of Object.values(r.quando)) assert.ok(Number.isFinite(v) && v >= 0);
    assert.equal(r.repouso === null, est !== 'ciclo', caso + ' ' + est + ': repouso só no ciclo');
  }
});
