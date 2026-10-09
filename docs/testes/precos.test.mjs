/* Motor de regras comerciais (api/_vendas/precos.mjs) contra a tabela-rascunho v1. O preço sai só daqui. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { estimar, validarRegras, validarFatores } from '../../api/_vendas/precos.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const copia = () => JSON.parse(JSON.stringify(REGRAS));

test('a tabela-rascunho é válida, e tabela quebrada é recusada', () => {
  assert.deepEqual(validarRegras(REGRAS), { ok: true });
  const r = copia(); r.formatos.landing_page.piso = 99999; r.sinal_percentual = 150; delete r.adicionais.pagina_extra;
  const e = validarRegras(r).erros;
  assert.ok(e.some(x => x.includes('piso')) && e.some(x => x.includes('sinal_percentual')) && e.some(x => x.includes('pagina_extra')));
  assert.throws(() => estimar({ formato: 'landing_page' }, r), /regras inválidas/);
});

test('sinal: só porcentagem inteira (a proposta guarda inteiro; fração dava um valor no cartão e outro no Pix) — revisão do PR 1, técnica B3', () => {
  for (const p of [33.5, 0.5, 49.99, 0]) {   /* (0: a cobrança exige valor > 0 — revisão de segurança do PR 12) */
    const e = validarRegras({ ...REGRAS, sinal_percentual: p }).erros || [];
    assert.ok(e.some(x => /sinal_percentual/.test(x)), p + ': recusado — ' + JSON.stringify(e));
  }
  for (const p of [1, 30, 50, 100]) assert.deepEqual(validarRegras({ ...REGRAS, sinal_percentual: p }), { ok: true }, p + ': aceito');
  /* o passo de arredondamento também inteiro: com 3,3 o motor mostrava 1 centavo a menos que o banco cobrava */
  assert.ok((validarRegras({ ...REGRAS, arredondamento: 3.3 }).erros || []).some(x => /arredondamento/.test(x)), 'arredondamento 3,3: recusado');
});

test('casos de referência (os números do REGRAS-RASCUNHO.md)', () => {
  const l = estimar({ formato: 'landing_page' }, REGRAS);
  assert.deepEqual([l.valor_total, l.sinal, l.prazo_dias, l.fase], [1500, 750, 5, 'unica']);
  const i = estimar({ formato: 'institucional', paginas: 7, adicionais: { textos: 7, agendamento: 1 } }, REGRAS);
  assert.deepEqual([i.valor_total, i.sinal, i.prazo_dias, i.fase], [5200, 2600, 10, 'fase1']);
  assert.deepEqual(i.itens.map(x => x.chave + 'x' + x.qtd), ['pagina_extrax2', 'textosx4'], 'páginas antes dos textos, até o teto');
  assert.deepEqual(i.fase_seguinte.itens.map(x => x.chave + 'x' + x.qtd), ['textosx3', 'agendamentox1']);
  assert.equal(i.fase_seguinte.valor_estimado, 1200);   /* 3 textos × 250 + agendamento 450 */
  const g = estimar({ formato: 'institucional', paginas: 10, adicionais: { blog: 1, catalogo: 1 } }, REGRAS);
  assert.deepEqual([g.valor_total, g.prazo_dias, g.fase, g.fase_seguinte.valor_estimado], [4900, 10, 'fase1', 2750]);
  const u = estimar({ formato: 'landing_page', urgencia: true }, REGRAS);
  assert.deepEqual([u.valor_total, u.prazo_dias], [1950, 3]);
  assert.equal(estimar({ formato: 'sob_medida', complexidade: 'alta' }, REGRAS).valor_total, 11130);   /* 8900 × 1,25 = 11125, arredondado de 10 em 10 */
});

test('nunca passa do teto de prazo, nunca fica abaixo do piso', () => {
  for (const formato of ['landing_page', 'institucional', 'sob_medida']) {
    for (const paginas of [1, 5, 12, 30]) {
      const e = estimar({ formato, paginas, adicionais: { blog: 1, idioma: 2, integracao: 3 }, urgencia: paginas > 10, complexidade: 'alta' }, REGRAS);
      if (e.encaminhar_diagnostico) continue;
      assert.ok(e.prazo_dias <= REGRAS.prazo_max_dias, formato + ' ' + paginas + ' páginas: ' + e.prazo_dias + ' dias');
      assert.ok(e.valor_total >= REGRAS.formatos[formato].piso);
      assert.equal(e.sinal, e.valor_total / 2);
    }
  }
  /* base abaixo do piso é tabela incoerente: recusada, em vez de calcular um preço que ninguém aprovou */
  const r = copia(); r.formatos.landing_page.base = 100;
  assert.throws(() => estimar({ formato: 'landing_page' }, r), /piso/);
});

test('fora do automático e valor alto vão para o diagnóstico, sem preço', () => {
  const loja = estimar({ formato: 'institucional', adicionais: { loja_virtual: 1 } }, REGRAS);
  assert.equal(loja.encaminhar_diagnostico, true);
  assert.equal(loja.valor_total, undefined, 'nenhum valor inventado');
  const r = copia(); r.limites.valor_max_automatico = 2000;
  assert.equal(estimar({ formato: 'institucional' }, r).encaminhar_diagnostico, true);
});

test('fatores: lista fechada; preço, desconto e quantidade fora da regra não entram', () => {
  assert.ok(validarFatores({ formato: 'landing_page', valor_total: 1 }, REGRAS).erros.some(e => e.includes('valor_total')), 'o modelo não manda preço');
  assert.ok(validarFatores({ formato: 'landing_page', desconto: 50 }, REGRAS).erros, 'nem desconto');
  assert.ok(validarFatores({ formato: 'site_gratis' }, REGRAS).erros);
  assert.ok(validarFatores({ formato: 'landing_page', adicionais: { brinde: 1 } }, REGRAS).erros, 'adicional inventado');
  assert.ok(validarFatores({ formato: 'landing_page', adicionais: { blog: -1 } }, REGRAS).erros, 'quantidade negativa');
  assert.ok(validarFatores({ formato: 'landing_page', paginas: 0.5 }, REGRAS).erros);
  assert.equal(validarFatores({ formato: 'landing_page', adicionais: { integracao: 99 } }, REGRAS).dados.adicionais.integracao, 3, 'limitado ao máximo da regra');
  assert.ok(estimar({ formato: 'landing_page', adicionais: { brinde: 1 } }, REGRAS).erros);
});

test('o mesmo pedido dá sempre o mesmo preço (determinístico)', () => {
  const f = { formato: 'institucional', paginas: 6, adicionais: { textos: 6, imagens: 1 } };
  assert.deepEqual(estimar(f, REGRAS), estimar(JSON.parse(JSON.stringify(f)), REGRAS));
});

test('tabela com adicional nulo ou que não é objeto: recusada com erro, não erro interno (a ativação é um insert manual)', () => {
  for (const ruim of [null, 5, 'texto', []]) {
    const r = copia(); r.adicionais.textos = ruim;
    let v;
    assert.doesNotThrow(() => { v = validarRegras(r); }, 'adicional ' + JSON.stringify(ruim) + ': não lança');
    assert.ok((v.erros || []).some(x => /adicionais\.textos/.test(x)), JSON.stringify(ruim) + ': recusado — ' + JSON.stringify(v));
  }
  for (const ruim of [null, 5]) {
    const r = copia(); r.formatos.landing_page = ruim;
    assert.ok((validarRegras(r).erros || []).some(x => /formatos\.landing_page/.test(x)), 'formato ' + ruim + ': recusado');
  }
});

/* ---------- tabela v2 (2026-10-09): loja em plataforma, área restrita, dependências, fase seguinte, limite do projeto ---------- */
test('loja em plataforma: base de R$ 4.800, adicionais de loja até o teto de 10 dias', () => {
  const l = estimar({ formato: 'loja_plataforma' }, REGRAS);
  assert.deepEqual([l.valor_total, l.sinal, l.prazo_dias, l.fase], [4800, 2400, 8, 'unica']);
  const m = estimar({ formato: 'loja_plataforma', adicionais: { produtos_lote_25: 2, frete_transportadora: 1 } }, REGRAS);
  assert.deepEqual([m.valor_total, m.prazo_dias, m.fase], [5900, 10, 'unica'], '4800 + 2×300 + 500, 8 + 1 + 1 dias');
});

test('o que depende de outro item não entra sem ele: o modelo recebe o motivo', () => {
  const sem = validarFatores({ formato: 'landing_page', adicionais: { area_tela_extra: 1 } }, REGRAS);
  assert.ok(sem.erros?.some(e => /area_tela_extra exige/.test(e) && /Área restrita/.test(e)), JSON.stringify(sem));
  assert.ok(validarFatores({ formato: 'institucional', adicionais: { frete_transportadora: 1 } }, REGRAS).erros?.some(e => /exige.*Loja virtual/.test(e)), 'extra de loja sem loja');
  assert.deepEqual(validarFatores({ formato: 'landing_page', adicionais: { area_restrita: 1, area_tela_extra: 2 } }, REGRAS).erros, undefined, 'com a base, entra');
  assert.ok(estimar({ formato: 'landing_page', adicionais: { area_cobranca_recorrente: 1 } }, REGRAS).erros, 'estimar também recusa');
});

test('área restrita que não cabe no prazo vai para a fase seguinte, levando junto o que depende dela', () => {
  const r = estimar({ formato: 'institucional', adicionais: { area_restrita: 1, area_importar_usuarios: 1 } }, REGRAS);
  assert.equal(r.fase, 'fase1');
  assert.deepEqual(r.itens, [], 'a importação (meio dia) caberia, mas sem a área ela não existe na fase 1');
  assert.deepEqual(r.fase_seguinte.itens.map(i => i.chave).sort(), ['area_importar_usuarios', 'area_restrita']);
  assert.deepEqual([r.valor_total, r.fase_seguinte.valor_estimado, r.fase_seguinte.prazo_dias], [3500, 4900, 5], '4500 + 400, 4 + 0,5 dias');
  const cabe = estimar({ formato: 'landing_page', adicionais: { area_restrita: 1, area_tela_extra: 1 } }, REGRAS);
  assert.deepEqual([cabe.valor_total, cabe.prazo_dias, cabe.fase], [6700, 10, 'unica'], 'landing 5 + área 4 + tela 1 = 10 dias');
});

test('limite do projeto: fase 1 + fase seguinte acima de valor_max_projeto vão para o diagnóstico', () => {
  const r = copia(); r.limites.valor_max_automatico = 5000; r.limites.valor_max_projeto = 8000;   /* (fase 1 de 3500 passa no teto da fase) */
  const e = estimar({ formato: 'institucional', adicionais: { area_restrita: 1, area_cobranca_recorrente: 1 } }, r);
  assert.equal(e.encaminhar_diagnostico, true, '3500 + 7000 > 8000');
  assert.equal(e.valor_total, undefined, 'sem valor');
  assert.equal(estimar({ formato: 'institucional', adicionais: { area_restrita: 1, area_cobranca_recorrente: 1 } }, REGRAS).fase_seguinte.valor_estimado, 7000, 'na tabela real (R$ 60.000) passa');
});

test('tabela com requer inválido é recusada', () => {
  for (const ruim of [['nao_existe'], [], 'area_restrita', ['loja_virtual'], ['area_tela_extra']]) {
    const r = copia(); r.adicionais.area_tela_extra.requer = ruim;
    assert.ok((validarRegras(r).erros || []).some(x => /area_tela_extra\.requer/.test(x)), JSON.stringify(ruim) + ': recusado');
  }
  const r = copia(); r.limites.valor_max_projeto = 100;
  assert.ok((validarRegras(r).erros || []).some(x => /valor_max_projeto/.test(x)), 'teto do projeto abaixo do teto da fase');
});
