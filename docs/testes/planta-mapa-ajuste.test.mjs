/* O AJUSTE DO MAPA NO APARELHO (Mapa vivo v2, Fase 3, PR 1; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 3";
   plano docs/superpowers/plans/2026-11-28-mapa-vivo-fase3-pr1-ajuste.md). js/mapa-ajuste.js: a tabela fixa das peças (opção A), o roteador
   por palavras e aplicarAjuste(plano, ajuste), que devolve um plano NOVO revalidado pela forma, ou não devolve nada (o Zero decide no turno).
   Aceites da spec cobertos aqui: 1 (não muta, sai válido), 2 (estouro = sem rascunho), 3 (entra e sai, sem seta solta), 4 (peça fora da
   lista não vira nó), 6 (texto sem número, preço, prazo ou promessa: o validador do servidor com as travas, regulado ou não), 8 (mutação). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { planoDoCaso, CHAVES_DO_MAPA } from '../../api/_vendas/mapa-padrao.mjs';
import { validarPlano } from '../../api/_vendas/planta-esquema.mjs';

const require = createRequire(import.meta.url);
const A = require('../../js/mapa-ajuste.js');
const F = require('../../js/orcamento-mapa-forma.js');

const congelarFundo = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(congelarFundo); Object.freeze(o); } return o; };
const SABERES = [{ origens: [], trava: null }, { origens: ['instagram'], trava: null }, { origens: ['google_busca', 'indicacao'], trava: null }];
const PECAS = Object.keys(A.PECAS);

test('a tabela: só peças vendáveis (nunca área restrita, loja, IA, automação, integração, idioma nem depoimentos), ícones e ids da forma', () => {
  assert.deepEqual(PECAS, ['whatsapp', 'formulario', 'agendamento', 'mapa', 'catalogo', 'galeria', 'blog']);
  for (const k of PECAS) {
    const p = A.PECAS[k];
    assert.ok(F.ICONES.includes(p.icone), k + ': ícone da forma');
    assert.match(p.id, /^aj_[a-z0-9_]{1,9}$/, k + ': id curto e próprio do ajuste');
    assert.ok(Array.isArray(p.icones) && p.icones.includes(p.icone), k + ': os ícones que a peça reconhece no mapa');
  }
  for (const fora of ['area_restrita', 'loja', 'ia', 'automacao', 'integracao', 'idioma', 'depoimentos', '__proto__', 'constructor']) {
    assert.equal(A.aplicarAjuste(planoDoCaso('saude_agenda', SABERES[0]), { acao: 'entra', peca: fora }).ok, false, fora);
  }
});

test('aplicarAjuste não muta o plano de entrada e só devolve plano que a forma aceita; o nó novo leva o papel ajustado', () => {
  let entrou = 0;
  for (const chave of CHAVES_DO_MAPA) for (const saber of SABERES) for (const peca of PECAS) {
    const p = congelarFundo(planoDoCaso(chave, saber));
    const antes = JSON.stringify(p);
    const r = A.aplicarAjuste(p, { acao: 'entra', peca });
    assert.equal(JSON.stringify(p), antes, 'o plano de entrada não muda');
    if (!r.ok) { assert.ok(['ja_tem', 'nao_cabe'].includes(r.motivo), chave + ' ' + peca + ': ' + r.motivo); continue; }
    entrou++;
    assert.equal(F.validarFormaMapa(r.plano).ok, true, chave + ' ' + peca);
    const novos = r.plano.nos.filter((n) => !p.nos.some((x) => x.id === n.id));
    assert.equal(novos.length, 1);
    assert.equal(novos[0].papel, 'ajustado');
    assert.deepEqual(r.mudou, [novos[0].id]);
  }
  assert.ok(entrou >= CHAVES_DO_MAPA.length * SABERES.length * 3, 'a maioria dos ajustes cabe (' + entrou + ')');
});

test('o texto da tabela passa no validador do servidor com as travas, regulado ou não (sem número, preço, prazo, marca nem promessa)', () => {
  for (const chave of CHAVES_DO_MAPA) for (const peca of PECAS) for (const regulado of [false, true]) {
    const r = A.aplicarAjuste(planoDoCaso(chave, SABERES[1]), { acao: 'entra', peca });
    if (!r.ok) continue;
    const v = validarPlano(r.plano, { versoes: ['v3'], regulado });
    assert.equal(v.ok, true, chave + ' ' + peca + (regulado ? ' regulado' : '') + ': ' + JSON.stringify(v.erros));
  }
});

test('peça que já está no mapa não entra de novo; "sai" tira o nó e reencaixa as setas, sem seta solta', () => {
  const p = congelarFundo(planoDoCaso('saude_agenda', SABERES[1]));
  assert.deepEqual(A.aplicarAjuste(p, { acao: 'entra', peca: 'agendamento' }), { ok: false, motivo: 'ja_tem' });
  const r = A.aplicarAjuste(p, { acao: 'sai', peca: 'agendamento' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(!r.plano.nos.some((n) => n.icone === 'agenda'), 'o nó da agenda saiu');
  const ids = r.plano.nos.map((n) => n.id).concat('objetivo');
  assert.ok(r.plano.setas.every((s) => ids.includes(s.de) && ids.includes(s.para)), 'nenhuma seta aponta para o nó que saiu');
  assert.equal(F.validarFormaMapa(r.plano).ok, true);
  assert.deepEqual(r.mudou, ['horario']);
  assert.deepEqual(A.aplicarAjuste(p, { acao: 'sai', peca: 'galeria' }), { ok: false, motivo: 'nao_tem' });
});

test('"sai" nunca tira o nó do site, do hoje, da trava nem da origem (só ação, conversa, volta e ajustado)', () => {
  for (const chave of CHAVES_DO_MAPA) for (const peca of PECAS) {
    const p = planoDoCaso(chave, SABERES[2]);
    const r = A.aplicarAjuste(p, { acao: 'sai', peca });
    if (!r.ok) continue;
    const saiu = p.nos.filter((n) => !r.plano.nos.some((x) => x.id === n.id));
    assert.equal(saiu.length, 1);
    assert.ok(['acao', 'conversa', 'volta', 'ajustado'].includes(saiu[0].papel), chave + ' ' + peca + ': ' + saiu[0].papel);
  }
});

test('o que estouraria os limites não vira rascunho: 6 nós, 5 camadas, 2 ajustados (o Zero assume no turno)', () => {
  const no = (id, papel, icone) => ({ id, papel, icone, titulo: 'Passo ' + id, frase: 'Uma frase de teste com o tamanho certo' });
  /* um caminho de 4 nós = 5 camadas com o objetivo: qualquer nó novo no meio faria 6 */
  const cinco = congelarFundo({
    estrutura: 'caminho', nos: [no('a', 'site', 'pagina'), no('b', 'acao', 'formulario'), no('c', 'acao', 'agenda'), no('d', 'acao', 'mensagem')],
    setas: [{ de: 'a', para: 'b', rotulo: 'segue' }, { de: 'b', para: 'c', rotulo: 'segue' }, { de: 'c', para: 'd', rotulo: 'segue' }, { de: 'd', para: 'objetivo', rotulo: 'chega' }],
    objetivo: { titulo: 'Pedido feito', frase: 'O pedido chega completo para quem atende' }, fecho: 'Um fecho de teste com o tamanho mínimo certo.'
  });
  assert.equal(F.validarFormaMapa(cinco).ok, true, 'o plano de partida é válido');
  assert.deepEqual(A.aplicarAjuste(cinco, { acao: 'entra', peca: 'galeria' }), { ok: false, motivo: 'nao_cabe' });
  let p = planoDoCaso('servico_orcamento', SABERES[0]);
  const r1 = A.aplicarAjuste(p, { acao: 'entra', peca: 'galeria' });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  const r2 = A.aplicarAjuste(r1.plano, { acao: 'entra', peca: 'mapa' });
  if (r2.ok) assert.deepEqual(A.aplicarAjuste(r2.plano, { acao: 'entra', peca: 'blog' }).ok, false, 'no máximo 2 ajustados');
});

test('entrada ruim nunca lança: plano inválido, ajuste sem forma, ação fora da lista', () => {
  const p = planoDoCaso('educacao', SABERES[0]);
  for (const [plano, ajuste] of [[null, { acao: 'entra', peca: 'mapa' }], [{}, { acao: 'entra', peca: 'mapa' }], [p, null], [p, { acao: 'troca', peca: 'mapa' }],
    [p, { acao: 'entra' }], [p, { acao: 'entra', peca: ['mapa'] }], [p, 'entra mapa']]) {
    const r = A.aplicarAjuste(plano, ajuste);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalido');
  }
});

test('rotear: palavras viram { acao, peca } só quando há UMA peça e nada ambíguo; o resto fica com o Zero (null)', () => {
  const casos = [
    ['quero também um formulário de pedido', { acao: 'entra', peca: 'formulario' }],
    ['Dá pra colocar a agenda online?', { acao: 'entra', peca: 'agendamento' }],
    ['põe o mapa de como chegar', { acao: 'entra', peca: 'mapa' }],
    ['quero um catálogo com as peças', { acao: 'entra', peca: 'catalogo' }],
    ['uma galeria com os trabalhos', { acao: 'entra', peca: 'galeria' }],
    ['tira o agendamento', { acao: 'sai', peca: 'agendamento' }],
    ['pode remover o formulário', { acao: 'sai', peca: 'formulario' }],
    ['não preciso de agenda', { acao: 'sai', peca: 'agendamento' }],
    ['quero o site sem blog', { acao: 'sai', peca: 'blog' }],
    ['quero cobrar um sinal pelo Pix', null],
    ['quero uma área restrita para alunos', null],
    ['quero agenda e formulário', null],
    ['tenho uma barbearia no centro', null],
    ['', null]
  ];
  for (const [texto, esperado] of casos) assert.deepEqual(A.rotear(texto), esperado, texto);
  for (const ruim of [null, 7, {}, ['agenda']]) assert.equal(A.rotear(ruim), null);
});
