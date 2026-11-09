/* Motor de regras comerciais (api/_vendas/precos.mjs). O preço sai só daqui.
   Até o fim de "TABELA v3" os testes rodam contra a v3 ARQUIVADA (docs/fase2/regras-v3-atelier-arquivada.json, com o Atelier e o incluso_em):
   o código continua lendo as tabelas v1 a v3 e os pedidos gravados com elas. A tabela-rascunho atual (v4, sem o Atelier; dono 2026-11-08)
   tem os testes próprios no fim do arquivo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { estimar, validarRegras, validarFatores, listaDoPacote } from '../../api/_vendas/precos.mjs';
import { comArea } from './_area-v2.mjs';
import { comFases } from './_motor-fases.mjs';
import { comFora } from './_fora-do-automatico.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-v3-atelier-arquivada.json', import.meta.url), 'utf8'));
const V4 = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const copia = () => JSON.parse(JSON.stringify(REGRAS));
/* a tabela com o teto de 10 dias e os limites antigos (ver _motor-fases.mjs): a lógica de fases e limites do motor */
const MOTOR = comFases(REGRAS);
/* o mecanismo de dependentes (requer), prioridade e fase seguinte, com a área restrita automática da v2 (a tabela de
   2026-10-14 a tirou do automático; ver _area-v2.mjs), sobre o motor com teto */
const AREA = comArea(MOTOR);
const copiaArea = () => comArea(MOTOR);

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

/* decisões do dono de 2026-10-28 (01 Empresa/Decisões.md, "subir todos os preços com base em dados"): landing 2.900,
   institucional 7.900, experiência 19.900, loja 8.900; adicionais sem mudança (textos a R$ 350, de 2026-10-14); área
   restrita continua fora do automático (2026-10-14) */
test('tabela de 2026-10-28: landing 2.900, institucional 7.900, experiência 19.900, loja 8.900, textos 350', () => {
  assert.deepEqual([REGRAS.formatos.landing_page.base, REGRAS.formatos.institucional.base, REGRAS.adicionais.textos.valor], [2900, 7900, 350]);
  assert.deepEqual([REGRAS.formatos.loja_plataforma.base, REGRAS.formatos.sob_medida.base], [8900, 20000]);   /* (Atelier, v3 de 2026-11-03; era 19.900) */
  assert.deepEqual(Object.values(REGRAS.formatos).map(f => f.piso), [1500, 4500, 15000, 6500], 'pisos de landing, institucional, Atelier e loja');
});

/* dono, 2026-10-28 (Decisões.md): saem da venda a área restrita, o sistema sob medida e a loja em código próprio */
test('tabela de 2026-10-28: nada fora do automático; área restrita, sistema e loja do zero não existem na tabela', () => {
  assert.deepEqual(Object.keys(REGRAS.adicionais).filter(k => REGRAS.adicionais[k].fora_do_automatico), [], 'nenhum item fora do automático');
  assert.deepEqual(Object.keys(REGRAS.adicionais).filter(k => /^area_|sistema|loja_virtual/.test(k)), [], 'nem a área, nem os dependentes dela, nem o sistema, nem a loja do zero');
  for (const k of ['area_restrita', 'sistema_sob_medida', 'loja_virtual']) {
    const e = estimar({ formato: 'institucional', adicionais: { [k]: 1 } }, REGRAS);
    assert.deepEqual([e.erros, e.encaminhar_diagnostico, e.valor_total], [['adicional desconhecido: ' + k], undefined, undefined], k + ': recusado, sem preço e sem diagnóstico');
  }
  assert.match(V4._status, /área restrita, o sistema sob medida e a loja em código próprio/);
});

test('casos de referência (os números do REGRAS-RASCUNHO.md)', () => {
  const l = estimar({ formato: 'landing_page' }, REGRAS);
  assert.deepEqual([l.valor_total, l.sinal, l.prazo_dias, l.fase], [2900, 1160, 5, 'unica']);
  /* 7900 + 2 páginas × 350 + 7 textos × 350 + agendamento 450 = 11500; 8 + 2 × 0,5 + 7 × 0,25 + 1 = 11,75 → 12 dias, numa entrega só */
  const i = estimar({ formato: 'institucional', paginas: 7, adicionais: { textos: 7, agendamento: 1 } }, REGRAS);
  assert.deepEqual([i.valor_total, i.sinal, i.prazo_dias, i.fase, i.fase_seguinte], [11500, 4600, 12, 'unica', null]);
  assert.deepEqual(i.itens.map(x => x.chave + 'x' + x.qtd), ['pagina_extrax2', 'textosx7', 'agendamentox1']);
  /* 7900 + 5 páginas × 350 + blog 900 + catálogo 1500 = 12050; 8 + 2,5 + 2 + 3 = 15,5 → 16 dias */
  const g = estimar({ formato: 'institucional', paginas: 10, adicionais: { blog: 1, catalogo: 1 } }, REGRAS);
  assert.deepEqual([g.valor_total, g.sinal, g.prazo_dias, g.fase, g.fase_seguinte], [12050, 4820, 16, 'unica', null]);
  const u = estimar({ formato: 'landing_page', urgencia: true }, REGRAS);
  assert.deepEqual([u.valor_total, u.prazo_dias], [3770, 3]);   /* 2900 × 1,3; 5 × 0,6 */
  assert.equal(estimar({ formato: 'sob_medida', complexidade: 'alta' }, REGRAS).valor_total, 25000);   /* Atelier: 20000 × 1,25 */
});

/* a lógica de fases continua no motor (uma tabela ativa pode ter teto): os mesmos pedidos com o teto de 10 dias */
test('com teto de 10 dias, o que não cabe vai para a fase seguinte, na ordem de prioridade', () => {
  const i = estimar({ formato: 'institucional', paginas: 7, adicionais: { textos: 7, agendamento: 1 } }, MOTOR);
  /* fase 1: 7900 + 2 × 350 + 4 × 350 = 10000; 8 + 1 + 1 = 10 dias */
  assert.deepEqual([i.valor_total, i.sinal, i.prazo_dias, i.fase], [10000, 4000, 10, 'fase1']);
  assert.deepEqual(i.itens.map(x => x.chave + 'x' + x.qtd), ['pagina_extrax2', 'textosx4'], 'páginas antes dos textos, até o teto');
  assert.deepEqual(i.fase_seguinte.itens.map(x => x.chave + 'x' + x.qtd), ['textosx3', 'agendamentox1']);
  assert.equal(i.fase_seguinte.valor_estimado, 1500);   /* 3 textos × 350 + agendamento 450 */
  const g = estimar({ formato: 'institucional', paginas: 10, adicionais: { blog: 1, catalogo: 1 } }, MOTOR);
  /* fase 1: 7900 + 4 páginas × 350 = 9300 (8 + 2 dias); seguinte: 1 página 350 + blog 900 + catálogo 1500 = 2750 */
  assert.deepEqual([g.valor_total, g.prazo_dias, g.fase, g.fase_seguinte.valor_estimado], [9300, 10, 'fase1', 2750]);
});

/* dono, 2026-10-28: "o objetivo é ser tudo 100% automático" e "se o trabalho não couber em 10 dias úteis, crie uma métrica
   para analisar e aumentar a quantidade de dias desde já" */
test('tabela de 2026-10-28: sem trava de prazo nem de valor, o projeto sai numa entrega só', () => {
  assert.equal(REGRAS.prazo_max_dias, 60, 'o máximo do validador e do banco (app.estimativas.prazo_dias de 1 a 60)');
  assert.deepEqual([REGRAS.limites.valor_max_automatico, REGRAS.limites.valor_max_projeto], [1e7, 1e7]);
  assert.match(V4._status, /sem trava de prazo/);
  /* experiência com 12 páginas, todos os adicionais gerais no máximo e complexidade alta: 19900 + 8 × 350 + 15 × 350 +
     250 + 3 × 300 + 450 + 900 + 1500 + 3 × 900 + 2 × 800 = 36250, × 1,25 = 45312,5 → 45310; prazo 10 + 4 + 3,75 + 0,5 +
     1,5 + 1 + 2 + 3 + 3 + 4 = 32,75 → 33 dias */
  const tudo = { formato: 'sob_medida', paginas: 12, complexidade: 'alta', adicionais: { textos: 15, imagens: 1, formulario_avancado: 3, agendamento: 1, blog: 1, catalogo: 1, integracao: 3, idioma: 2 } };
  const e = estimar(tudo, REGRAS);
  /* Atelier (v3 ajustada: 6 páginas, textos de todas, 1 imagem, 1 formulário, animações e 2 assinaturas já vêm incluídos; a quantidade pedida é o TOTAL):
     12 páginas = 6 extras × 350 = 2100; textos 15 = 9 pagos × 350 = 3150; imagens 1 = 0; formulário 3 = 2 × 300 = 600; agendamento 450; blog 900;
     catálogo 1500; integração 3 × 900 = 2700; idioma 2 × 800 = 1600; soma 20000 + 13000 = 33000, × 1,25 = 41250; prazo 15 + 3 + 2,25 + 1 + 1 + 2 + 3 + 3 + 4 = 34,25 → 35 */
  assert.deepEqual([e.valor_total, e.sinal, e.prazo_dias, e.fase, e.fase_seguinte], [41250, 16500, 35, 'unica', null]);
  assert.equal(estimar(tudo, MOTOR).encaminhar_diagnostico, true, 'com os limites antigos (R$ 15.000 por fase) ia para a conversa');
});

test('nunca passa do teto de prazo, nunca fica abaixo do piso', () => {
  for (const REGRAS of [comFases(copia()), copia()]) for (const formato of ['landing_page', 'institucional', 'sob_medida']) {
    for (const paginas of [1, 5, 12, 30]) {
      const e = estimar({ formato, paginas, adicionais: { blog: 1, idioma: 2, integracao: 3 }, urgencia: paginas > 10, complexidade: 'alta' }, REGRAS);
      if (e.encaminhar_diagnostico) continue;
      if (e.erros) { assert.ok(formato === 'landing_page' && paginas > 3, formato + ' ' + paginas + ': ' + e.erros); continue; }   /* (landing até 3 páginas) */
      assert.ok(e.prazo_dias <= REGRAS.prazo_max_dias, formato + ' ' + paginas + ' páginas: ' + e.prazo_dias + ' dias');
      assert.ok(e.valor_total >= REGRAS.formatos[formato].piso);
      assert.equal(e.sinal, Math.round(e.valor_total * REGRAS.sinal_percentual) / 100);   /* (o percentual da tabela, a mesma conta do motor; era total / 2 com o rascunho a 50%) */
    }
  }
  /* base abaixo do piso é tabela incoerente: recusada, em vez de calcular um preço que ninguém aprovou */
  const r = copia(); r.formatos.landing_page.base = 100;
  assert.throws(() => estimar({ formato: 'landing_page' }, r), /piso/);
});

test('fora do automático e valor alto vão para o diagnóstico, sem preço', () => {
  /* (numa tabela antiga, que ainda traz itens fora do automático: ver _fora-do-automatico.mjs) */
  const loja = estimar({ formato: 'institucional', adicionais: { loja_virtual: 1 } }, comFora(REGRAS));
  assert.deepEqual([loja.encaminhar_diagnostico, loja.itens_diagnostico], [true, [{ chave: 'loja_virtual', nome: 'Loja feita do zero, em código próprio' }]]);
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

/* decisão do dono (2026-10-12): a landing vai até 3 páginas. A regra mora no motor, para valer em TODO caminho que
   calcula preço (formulário, consultor e ajuste depois de gravar), não só na tela do preço (re-revisão do 990a87e) */
test('landing com mais de 3 páginas é recusada pelo motor, por páginas ou por página extra', () => {
  const incluidas = REGRAS.formatos.landing_page.paginas_incluidas;
  assert.equal(estimar({ formato: 'landing_page', paginas: 3 }, REGRAS).erros, undefined, '3 páginas: cabe');
  assert.equal(estimar({ formato: 'landing_page', adicionais: { pagina_extra: 3 - incluidas } }, REGRAS).erros, undefined, 'até 3 pela página extra: cabe');
  assert.ok(validarFatores({ formato: 'landing_page', paginas: 4 }, REGRAS).erros?.some(e => /até 3 páginas/.test(e)), '4 páginas: recusada');
  assert.ok(estimar({ formato: 'landing_page', paginas: 12 }, REGRAS).erros?.some(e => /até 3 páginas/.test(e)), 'o ajuste "quero 12 páginas"');
  assert.ok(estimar({ formato: 'landing_page', adicionais: { pagina_extra: 4 - incluidas } }, REGRAS).erros?.some(e => /até 3 páginas/.test(e)), 'pela página extra também');
  assert.equal(estimar({ formato: 'institucional', paginas: 12 }, REGRAS).erros, undefined, 'o institucional não tem esse limite');
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
test('loja em plataforma: base de R$ 8.900, adicionais de loja somam valor e dias (até o teto, numa tabela com teto)', () => {
  const l = estimar({ formato: 'loja_plataforma' }, REGRAS);
  assert.deepEqual([l.valor_total, l.sinal, l.prazo_dias, l.fase], [8900, 3560, 8, 'unica']);
  const m = estimar({ formato: 'loja_plataforma', adicionais: { produtos_lote_25: 2, frete_transportadora: 1 } }, REGRAS);
  assert.deepEqual([m.valor_total, m.prazo_dias, m.fase], [10000, 10, 'unica'], '8900 + 2×300 + 500, 8 + 1 + 1 dias');
  const pedido = { formato: 'loja_plataforma', adicionais: { produtos_lote_25: 2, frete_transportadora: 1, migracao_loja: 1 } };
  const g = estimar(pedido, REGRAS);
  assert.deepEqual([g.valor_total, g.prazo_dias, g.fase], [11500, 12, 'unica'], '+ migração 1500 e 2 dias: 12 dias numa entrega só');
  const t = estimar(pedido, MOTOR);
  assert.deepEqual([t.valor_total, t.prazo_dias, t.fase, t.fase_seguinte.valor_estimado, t.fase_seguinte.prazo_dias], [10000, 10, 'fase1', 1500, 2], 'com teto de 10, a migração (prioridade 30) vai para a fase seguinte');
});

test('o que depende de outro item não entra sem ele: o modelo recebe o motivo', () => {
  const sem = validarFatores({ formato: 'landing_page', adicionais: { area_tela_extra: 1 } }, AREA);
  assert.ok(sem.erros?.some(e => /area_tela_extra exige/.test(e) && /Área restrita/.test(e)), JSON.stringify(sem));
  assert.ok(validarFatores({ formato: 'institucional', adicionais: { frete_transportadora: 1 } }, AREA).erros?.some(e => /exige.*Loja virtual/.test(e)), 'extra de loja sem loja');
  assert.deepEqual(validarFatores({ formato: 'landing_page', adicionais: { area_restrita: 1, area_tela_extra: 2 } }, AREA).erros, undefined, 'com a base, entra');
  assert.ok(estimar({ formato: 'landing_page', adicionais: { area_cobranca_recorrente: 1 } }, AREA).erros, 'estimar também recusa');
});

test('área restrita que não cabe no prazo vai para a fase seguinte, levando junto o que depende dela', () => {
  const r = estimar({ formato: 'institucional', adicionais: { area_restrita: 1, area_importar_usuarios: 1 } }, AREA);
  assert.equal(r.fase, 'fase1');
  assert.deepEqual(r.itens, [], 'a importação (meio dia) caberia, mas sem a área ela não existe na fase 1');
  assert.deepEqual(r.fase_seguinte.itens.map(i => i.chave).sort(), ['area_importar_usuarios', 'area_restrita']);
  assert.deepEqual([r.valor_total, r.fase_seguinte.valor_estimado, r.fase_seguinte.prazo_dias], [7900, 4900, 5], '4500 + 400, 4 + 0,5 dias');
  const cabe = estimar({ formato: 'landing_page', adicionais: { area_restrita: 1, area_tela_extra: 1 } }, AREA);
  assert.deepEqual([cabe.valor_total, cabe.prazo_dias, cabe.fase], [8100, 10, 'unica'], '2900 + 4500 + 700; landing 5 + área 4 + tela 1 = 10 dias');
  /* sem teto (a tabela de 2026-10-28), a mesma área entra na entrega única: 7900 + 4500 + 400, 8 + 4 + 0,5 = 12,5 → 13 dias */
  const semTeto = estimar({ formato: 'institucional', adicionais: { area_restrita: 1, area_importar_usuarios: 1 } }, comArea(REGRAS));
  assert.deepEqual([semTeto.valor_total, semTeto.prazo_dias, semTeto.fase, semTeto.fase_seguinte], [12800, 13, 'unica', null]);
});

test('limite do projeto: fase 1 + fase seguinte acima de valor_max_projeto vão para o diagnóstico', () => {
  const r = copiaArea(); r.limites.valor_max_automatico = 9000; r.limites.valor_max_projeto = 14000;   /* (fase 1 de 7900 passa no teto da fase) */
  const e = estimar({ formato: 'institucional', adicionais: { area_restrita: 1, area_cobranca_recorrente: 1 } }, r);
  assert.deepEqual([e.encaminhar_diagnostico, e.motivo], [true, 'projeto acima do limite automático'], '7900 + 7000 > 14000');
  assert.equal(e.valor_total, undefined, 'sem valor');
  assert.equal(estimar({ formato: 'institucional', adicionais: { area_restrita: 1, area_cobranca_recorrente: 1 } }, AREA).fase_seguinte.valor_estimado, 7000, 'com o limite antigo de R$ 60.000 passa');
});

test('tabela com requer inválido é recusada', () => {
  for (const ruim of [['nao_existe'], [], 'area_restrita', ['loja_virtual'], ['area_tela_extra']]) {
    const r = copiaArea(); r.adicionais.area_tela_extra.requer = ruim;
    assert.ok((validarRegras(r).erros || []).some(x => /area_tela_extra\.requer/.test(x)), JSON.stringify(ruim) + ': recusado');
  }
  const r = copiaArea(); r.limites.valor_max_projeto = 100;
  assert.ok((validarRegras(r).erros || []).some(x => /valor_max_projeto/.test(x)), 'teto do projeto abaixo do teto da fase');
});

test('tabela anterior, sem a loja, continua válida (o código pode subir antes de a v2 ser ativada)', () => {
  const r = copia(); delete r.formatos.loja_plataforma;
  for (const [k, x] of Object.entries(r.adicionais)) if (x.requer?.includes('loja_plataforma')) delete r.adicionais[k];
  assert.deepEqual(validarRegras(r), { ok: true });
  assert.equal(estimar({ formato: 'institucional' }, r).valor_total, 7900, 'os três formatos seguem');
  assert.ok(estimar({ formato: 'loja_plataforma' }, r).erros?.some(e => /formato: um de landing_page, institucional, sob_medida$/.test(e)), 'loja só existe se a tabela trouxer');
  const sem = copia(); delete sem.formatos.loja_plataforma;
  assert.ok((validarRegras(sem).erros || []).some(x => /produtos_lote_25\.requer/.test(x)), 'adicional que exige formato ausente é recusado');
});

/* tirar a base do automático sem tirar os dependentes (o caso de 2026-10-14) deixaria extras que nunca entram: a tabela
   é recusada (revisão do PR #42) */
test('dependente de uma base fora do automático é recusado', () => {
  const r = copiaArea(); r.adicionais.area_restrita = { nome: 'Área restrita com login', fora_do_automatico: true };
  assert.ok((validarRegras(r).erros || []).some(x => /area_tela_extra\.requer: formatos ou adicionais automáticos/.test(x)), JSON.stringify(validarRegras(r)));
});

test('dependência circular é recusada: A exige B e B exige A nunca chega a uma fase', () => {
  const r = copiaArea();
  r.adicionais.area_restrita.requer = ['area_tela_extra'];
  assert.ok((validarRegras(r).erros || []).some(x => /area_restrita\.requer: dependência circular/.test(x)), JSON.stringify(validarRegras(r)));
});

test('o dependente vem depois da base na prioridade (senão cairia na fase seguinte com a base cabendo)', () => {
  const r = copiaArea(); r.adicionais.area_tela_extra.prioridade = 5;   /* a base, área restrita, tem 12 */
  assert.ok((validarRegras(r).erros || []).some(x => /area_tela_extra\.prioridade: maior que a da base \(area_restrita\)/.test(x)), JSON.stringify(validarRegras(r)));
});

test('fase seguinte longa diz em quantas fases de até 10 dias ela se divide', async () => {
  const r = estimar({ formato: 'institucional', adicionais: { area_restrita: 1, area_tela_extra: 8, area_perfil_extra: 3, area_cobranca_recorrente: 1, area_documentos: 1 } }, AREA);
  /* 4 + 8×1 + 3×1,5 + 3 + 1 = 20,5 dias -> 21, em 3 fases de até 10 */
  assert.deepEqual([r.fase_seguinte.prazo_dias, r.fase_seguinte.fases, r.fase_seguinte.prazo_max_fase], [21, 3, 10]);
  const { montarEscopo } = await import('../../api/_vendas/escopo.mjs');
  const e = montarEscopo({ estimativa: r, direcao: { nome: 'Autoridade', secoes: [], paginas: [] }, briefing: { negocio: { descricao: 'x' } }, alteracoesAplicadas: [] });
  assert.ok(e.escopo.includes('prazo estimado de 21 dias úteis, em 3 fases de até 10 dias úteis cada'), 'o contrato não lê 21 dias como uma entrega só');
});

test('rascunho: a entrada é 40% (decisão do dono de 20/10, Decisões.md, "O site vende sozinho", 1 D; PR 3b-1). A tabela ativa o dono aplica', () => {
  assert.equal(REGRAS.sinal_percentual, 40);
  assert.match(V4._status, /40%/, 'o _status diz de onde veio o 40');
});

/* o consultor só fala de fase quando o motor ainda pode gerar uma (prazo_max_dias menor que a maior soma possível) */
test('prazo máximo possível por formato: a soma de tudo no máximo, a mesma que o motor faz', async () => {
  const { prazoMaximoPossivel, podeTerFaseSeguinte } = await import('../../api/_vendas/precos.mjs');
  /* loja: 8 + 55 páginas extras × 0,5 (até 60 páginas) + gerais 3,75 + 0,5 + 1,5 + 1 + 2 + 3 + 3 + 4 + loja 10 + 1 + 1 + 4 + 3 + 2 + interações (1 leve × 1 + 3 de assinatura × 2 = 7) = 82,25 */
  assert.equal(prazoMaximoPossivel(REGRAS, 'loja_plataforma'), 82.25);
  /* Atelier: 15 + 54 × 0,5 + 18,75 + 7 = 67,75 (das interações só se paga o que passa do incluso); landing: 5 + 2 páginas × 0,5 (até 3 páginas) + 18,75 + 7 = 31,75
     (o atendente em preparo não conta) */
  assert.equal(prazoMaximoPossivel(REGRAS, 'sob_medida'), 67.75);
  assert.equal(prazoMaximoPossivel(REGRAS, 'landing_page'), 31.75);
  const geral = { textos: 15, imagens: 1, formulario_avancado: 3, agendamento: 1, blog: 1, catalogo: 1, integracao: 3, idioma: 2 };
  const loja = estimar({ formato: 'loja_plataforma', paginas: 60, adicionais: { ...geral, produtos_lote_25: 20, pagamento_extra: 2, frete_transportadora: 1, integracao_erp: 2, marketplace: 2, migracao_loja: 1 } }, REGRAS);
  assert.equal(loja.fase, 'fase1', 'o motor confirma: a loja com tudo passa de 60 dias');
  /* Atelier com tudo (quantidades TOTAIS: 1 leve já incluída, 5 de assinatura = 3 pagas): 15 + 27 + 2,25 + 1 + 1 + 2 + 3 + 3 + 4 + 6 = 64,25 */
  const sob = estimar({ formato: 'sob_medida', paginas: 60, adicionais: { ...geral, interacao_leve: 1, interacao_assinatura: 5 } }, REGRAS);
  assert.deepEqual([sob.fase, sob.prazo_dias], ['fase1', 60], 'o Atelier (15 dias de base) com tudo também passa de 60: 64,25 (v3 de 2026-11-03; a experiência de 10 dias cabia em 57)');
  assert.equal(podeTerFaseSeguinte(REGRAS), true, 'a loja e o Atelier extremos chegam à fase seguinte');
  const semLoja = copia(); delete semLoja.formatos.loja_plataforma;
  for (const [k, x] of Object.entries(semLoja.adicionais)) if (x.requer?.includes('loja_plataforma')) delete semLoja.adicionais[k];
  assert.equal(podeTerFaseSeguinte(semLoja), true, 'sem a loja o Atelier ainda passa de 60 (15 dias de base mais tudo no máximo)');
  assert.ok(prazoMaximoPossivel(semLoja, 'landing_page') <= 60 && prazoMaximoPossivel(semLoja, 'institucional') > 60, 'a landing cabe em 60; o institucional com as interações e tudo no máximo não (61,25)');
  assert.equal(podeTerFaseSeguinte(MOTOR), true, 'com teto de 10, passa');
  assert.equal(prazoMaximoPossivel(REGRAS, 'nao_existe'), 0);
});

/* ==== TABELA v3 (dono, 2026-11-03, Decisões.md): o Atelier substitui a experiência digital (base R$ 20.000, sem acompanhamento) e nenhum item é
   exclusivo de um formato: as interações entram como adicionais em QUALQUER formato, e o atendente de IA no site (implantação mais mensalidade
   recorrente) está na tabela como "em preparo": o consultor sabe dele, o motor não o cobra até o produto existir. ==== */

test('v3: o Atelier substitui a experiência digital (id interno igual, para não mexer no banco)', () => {
  const b = REGRAS.formatos.sob_medida;
  assert.deepEqual([b.nome, b.base, b.piso, b.prazo_dias, b.paginas_incluidas], ['Atelier', 20000, 15000, 15, 6]);
  assert.ok(b.inclui.some(x => /2 interações de assinatura/i.test(x) && /animações de entrada e rolagem no site todo/i.test(x)), 'duas interações de assinatura e as animações do site todo já vêm na base');
  assert.ok(b.inclui.some(x => /textos/i.test(x) && /todas as páginas/i.test(x)) && b.inclui.some(x => /imagens/i.test(x) && /formulário/i.test(x)), 'textos de todas as páginas, imagens e formulário com etapas já vêm na base');
  assert.match(REGRAS.multiplicadores.complexidade_alta.descricao, /integrações ou regras de negócio/i, 'complexidade alta não cobra de novo as interações que o Atelier já inclui');
  assert.doesNotMatch(V4._status, /R\$ 300\/h/, 'o relatório Lucro real não define faixa por hora: a frase saiu');
  assert.ok(!b.inclui.some(x => /acompanhamento|suporte|manuten/i.test(x)), 'sem acompanhamento pós-entrega (dono, 03/11)');
  assert.ok(!JSON.stringify(REGRAS.formatos).includes('Experiência digital'), 'o nome antigo saiu da tabela');
  assert.deepEqual(validarRegras(REGRAS), { ok: true });
  assert.deepEqual([REGRAS.formatos.landing_page.base, REGRAS.formatos.institucional.base, REGRAS.formatos.loja_plataforma.base], [2900, 7900, 8900], 'os outros três preços aprovados não mudam');
});

test('v3: as interações são adicionais de QUALQUER formato (nenhuma exige loja nem outro formato)', () => {
  for (const k of ['interacao_leve', 'interacao_assinatura']) {
    assert.ok(REGRAS.adicionais[k] && !REGRAS.adicionais[k].requer && !REGRAS.adicionais[k].em_preparo, k + ' vale em todo formato');
    for (const formato of ['landing_page', 'institucional', 'sob_medida', 'loja_plataforma']) {
      /* no Atelier a quantidade é o total: uma além da incluída é que aparece como item pago */
      const q = 1 + (REGRAS.adicionais[k].incluso_em?.[formato] ?? 0);
      const e = estimar({ formato, adicionais: { [k]: q } }, REGRAS);
      assert.ok(!e.erros && e.itens.some(i => i.chave === k && i.qtd === 1), formato + ' aceita ' + k + ': ' + JSON.stringify(e.erros));
    }
  }
});

test('v3: a conta das interações é só a da tabela (valor × quantidade, mais o prazo de cada uma)', () => {
  /* landing 2900 + 1 animação do site todo × 900 = 3800; 5 + 1 = 6 dias */
  const l = estimar({ formato: 'landing_page', adicionais: { interacao_leve: 1 } }, REGRAS);
  assert.deepEqual([l.valor_total, l.sinal, l.prazo_dias, l.fase], [3800, 1520, 6, 'unica']);
  /* institucional 7900 + 1 assinatura × 2500 = 10400; 8 + 2 = 10 dias */
  const i = estimar({ formato: 'institucional', adicionais: { interacao_assinatura: 1 } }, REGRAS);
  assert.deepEqual([i.valor_total, i.prazo_dias], [10400, 10]);
  /* Atelier: 2 de assinatura já vêm na base, então pedir 1 total não muda nada (20000, 15 dias) e pedir 3 total cobra só a terceira (22500, 17 dias) */
  const b1 = estimar({ formato: 'sob_medida', adicionais: { interacao_assinatura: 1 } }, REGRAS);
  assert.deepEqual([b1.valor_total, b1.prazo_dias, b1.itens], [20000, 15, []]);
  const b3 = estimar({ formato: 'sob_medida', adicionais: { interacao_assinatura: 3 } }, REGRAS);
  assert.deepEqual([b3.valor_total, b3.prazo_dias], [22500, 17]);
  /* o máximo da tabela vale: pedir 99 vira 1 animação do site todo */
  assert.equal(estimar({ formato: 'landing_page', adicionais: { interacao_leve: 99 } }, REGRAS).itens.find(x => x.chave === 'interacao_leve').qtd, 1);
});

/* ==== incluso_em (ajuste do validador, 03/11): o que o formato já traz não se cobra de novo; a pessoa informa o TOTAL e o motor abate ==== */
test('incluso_em: no Atelier o incluso não é cobrado, só o que passa dele; em outro formato a mesma quantidade é cobrada inteira', () => {
  const tudoIncluso = { textos: 6, imagens: 1, formulario_avancado: 1, interacao_leve: 1, interacao_assinatura: 2 };
  const b = estimar({ formato: 'sob_medida', adicionais: tudoIncluso }, REGRAS);
  assert.deepEqual([b.valor_total, b.prazo_dias, b.itens], [20000, 15, []], 'tudo que a lista do Atelier inclui = o preço-base');
  /* 8 páginas = 2 extras × 350; textos 8 no total = 2 × 350; assinatura 3 total = 1 × 2500: 20000 + 700 + 700 + 2500 = 23900; prazo 15 + 1 + 0,5 + 2 = 18,5 → 19 */
  const mais = estimar({ formato: 'sob_medida', paginas: 8, adicionais: { ...tudoIncluso, textos: 8, interacao_assinatura: 3 } }, REGRAS);
  assert.deepEqual([mais.valor_total, mais.prazo_dias], [23900, 19]);
  assert.deepEqual(mais.itens.map(i => [i.chave, i.qtd]).sort(), [['interacao_assinatura', 1], ['pagina_extra', 2], ['textos', 2]]);
  /* o teto é o que se compra mais o incluso: assinatura 99 = 5 no total = 3 pagas (R$ 7500) */
  assert.equal(estimar({ formato: 'sob_medida', adicionais: { interacao_assinatura: 99 } }, REGRAS).valor_total, 27500);
  /* fora do Atelier nada é abatido: institucional 7900 + 6 textos × 350 = 10000 */
  assert.equal(estimar({ formato: 'institucional', adicionais: { textos: 6 } }, REGRAS).valor_total, 10000);
});

test('incluso_em: a tabela com o campo malformado é recusada (formato que não existe, quantidade fora do inteiro, item fora do automático, tipo errado)', () => {
  const com = incluso_em => { const r = copia(); r.adicionais.textos.incluso_em = incluso_em; return validarRegras(r); };
  assert.deepEqual(com({ sob_medida: 6 }), { ok: true });
  for (const [ruim, rotulo] of [[{ sob_medida: 0 }, 'zero'], [{ sob_medida: 1.5 }, 'fração'], [{ sob_medida: 101 }, 'acima de 100'], [{ sob_medida: '6' }, 'texto'], [{ nao_existe: 2 }, 'formato inexistente'],
    [{}, 'vazio'], [[6], 'lista'], ['6', 'texto solto'], [null, 'nulo'], [6, 'número']]) {
    const v = com(ruim);
    assert.ok(v.erros?.some(e => /adicionais\.textos\.incluso_em/.test(e)), rotulo + ': ' + JSON.stringify(v));
  }
  const semCume = copia(); delete semCume.formatos.loja_plataforma; semCume.adicionais.imagens.incluso_em = { loja_plataforma: 1 };
  assert.ok(validarRegras(semCume).erros?.some(e => /imagens\.incluso_em\.loja_plataforma: formato que a tabela traz/.test(e)), 'formato que a tabela não traz');
  const fora = copia(); fora.adicionais.area_restrita = { nome: 'Área restrita', fora_do_automatico: true, incluso_em: { sob_medida: 1 } };
  assert.ok(validarRegras(fora).erros?.some(e => /area_restrita\.incluso_em: item fora do automático/.test(e)), 'item fora do automático não tem preço para abater');
});

test('v3: o atendente de IA está na tabela em preparo (implantação e mensalidade), e o motor não o vende', () => {
  const nivel = { essencial: [2400, 590], profissional: [3900, 890], avancado: [4900, 1390] };   /* aprovados em 30/10 */
  for (const [n, [impl, mensal]] of Object.entries(nivel)) {
    const a = REGRAS.adicionais['atendente_ia_' + n];
    assert.deepEqual([a.valor, a.mensal, a.em_preparo], [impl, mensal, true], n);
    const e = estimar({ formato: 'landing_page', adicionais: { ['atendente_ia_' + n]: 1 } }, REGRAS);
    assert.ok(e.erros && /em preparo/.test(e.erros[0]) && e.valor_total === undefined && !e.encaminhar_diagnostico, n + ': sem preço, com o motivo para o modelo: ' + JSON.stringify(e));
  }
  /* nem o prazo máximo possível soma o que ainda não se vende */
  const sem = copia(); for (const k of Object.keys(sem.adicionais)) if (/^atendente_ia_/.test(k)) delete sem.adicionais[k];
  const mais = (r, f) => import('../../api/_vendas/precos.mjs').then(m => m.prazoMaximoPossivel(r, f));
  return Promise.all(['landing_page', 'institucional', 'sob_medida', 'loja_plataforma'].map(async f => assert.equal(await mais(REGRAS, f), await mais(sem, f), f)));
});

test('v3: mensalidade recorrente só vale em item em preparo (falha fechada: o motor ainda não sabe cobrar recorrência)', () => {
  const r = copia(); r.adicionais.atendente_ia_essencial.em_preparo = false;
  assert.ok((validarRegras(r).erros || []).some(x => /atendente_ia_essencial\.mensal.*em_preparo/.test(x)), 'ligar o item sem o suporte a recorrência é recusado');
  const sem = copia(); delete sem.adicionais.atendente_ia_essencial.em_preparo;
  assert.ok((validarRegras(sem).erros || []).some(x => /\.mensal/.test(x)));
  const ruim = copia(); ruim.adicionais.atendente_ia_essencial.em_preparo = 'sim';
  assert.ok((validarRegras(ruim).erros || []).some(x => /em_preparo: sim ou não/.test(x)));
  const negativa = copia(); negativa.adicionais.atendente_ia_essencial.mensal = -5;
  assert.ok((validarRegras(negativa).erros || []).some(x => /\.mensal/.test(x)));
});

test('v3: validarFatores explica ao modelo por que o item em preparo não entra (nunca preço sem a base)', () => {
  const v = validarFatores({ formato: 'institucional', adicionais: { atendente_ia_profissional: 1, textos: 2 } }, REGRAS);
  assert.ok(v.erros.length === 1 && /atendente_ia_profissional: ainda está em preparo/.test(v.erros[0]) && /só registre o interesse/.test(v.erros[0]), JSON.stringify(v));
  /* quantidade 0 não é pedido */
  assert.ok(validarFatores({ formato: 'institucional', adicionais: { atendente_ia_profissional: 0 } }, REGRAS).dados);
});

/* ---- achados das revisões técnica e de segurança do PR do Atelier (03/11) ---- */
test('incluso_em: o contrato diz o que o Atelier já inclui e quantos do item vieram no preço; outros formatos não mudam', async () => {
  const { montarEscopo } = await import('../../api/_vendas/escopo.mjs');
  const direcao = { nome_conceito: 'Clareza', estrategia: 'conversao', secoes: [{ tipo: 'hero' }] };
  const contrato = e => montarEscopo({ estimativa: e, direcao, alteracoesAplicadas: [], briefing: { negocio: { nome: 'Estúdio' } } }).escopo;
  const b = estimar({ formato: 'sob_medida', paginas: 8, adicionais: { textos: 8, interacao_assinatura: 3 } }, REGRAS);
  assert.deepEqual(b.itens.map(i => [i.chave, i.qtd, i.incluso ?? null]).sort(), [['interacao_assinatura', 1, 2], ['pagina_extra', 2, null], ['textos', 2, 6]]);
  assert.ok(b.formato.inclui.some(x => /2 interações de assinatura/.test(x)), 'o formato leva a lista do que inclui');
  const c = contrato(b);
  assert.match(c, /Já incluído em Atelier: Até 6 páginas/);
  assert.match(c, /Interação de assinatura[^\n]*\(3 no total, 2 já incluídos no preço do formato\)/);
  assert.match(c, /Textos escritos pela Beyon Zero \(por página\) \(8 no total, 6 já incluídos no preço do formato\)/);
  const i = estimar({ formato: 'institucional', adicionais: { textos: 3 } }, REGRAS);
  assert.equal(i.formato.inclui, undefined, 'só o formato que a tabela abate leva a lista');
  assert.ok(!/Já incluído em/.test(contrato(i)) && /Textos escritos pela Beyon Zero \(por página\) \(3\)/.test(contrato(i)));
  assert.ok(JSON.stringify(b).length < 16384, 'cabe no limite de 16 KB de app.estimativas.detalhes');
});

/* "Já vem no pacote" gravado com cada estimativa (dono, 07/11, opção A): a lista da tabela em todo formato, limitada; o contrato não muda */
test('no_pacote: todo formato leva a lista da tabela; formato.inclui (o do contrato) segue só no formato que a tabela abate', async () => {
  const { montarEscopo } = await import('../../api/_vendas/escopo.mjs');
  for (const [chave, fmt] of Object.entries(REGRAS.formatos)) {
    const e = estimar({ formato: chave }, REGRAS);
    if (e.encaminhar_diagnostico) continue;
    assert.ok(fmt.inclui.length > 0 && e.formato.no_pacote.length > 0, chave + ': a tabela real tem a lista');
    assert.deepEqual(e.formato.no_pacote, listaDoPacote(fmt.inclui), chave);
  }
  const i = estimar({ formato: 'institucional' }, REGRAS);
  assert.equal(i.formato.inclui, undefined, 'o contrato do institucional não ganha "Já incluído em"');
  const contrato = montarEscopo({ estimativa: i, direcao: { nome_conceito: 'Clareza', estrategia: 'conversao', secoes: [{ tipo: 'hero' }] }, alteracoesAplicadas: [], briefing: { negocio: { nome: 'Estúdio' } } }).escopo;
  assert.doesNotMatch(contrato, /Já incluído em/);
});

test('no_pacote: só texto, sem pontas, sem vazio, item longo demais sai inteiro (nunca cortado), no máximo PACOTE_MAX_ITENS; tabela sem lista: sem o campo', async () => {
  const { PACOTE_MAX_ITENS, PACOTE_MAX_CARACTERES } = await import('../../api/_vendas/precos.mjs');
  const r = copia();
  r.formatos.institucional.inclui = ['  Até 5 páginas  ', 42, null, '', '   ', { x: 1 }, ['a'], 'x'.repeat(PACOTE_MAX_CARACTERES + 1), 'x'.repeat(PACOTE_MAX_CARACTERES),
    ...Array.from({ length: 30 }, (_, n) => 'Item ' + n)];
  const lista = estimar({ formato: 'institucional' }, r).formato.no_pacote;
  assert.equal(lista.length, PACOTE_MAX_ITENS);
  assert.deepEqual(lista.slice(0, 3), ['Até 5 páginas', 'x'.repeat(PACOTE_MAX_CARACTERES), 'Item 0']);
  assert.ok(lista.every(t => typeof t === 'string' && t.length <= PACOTE_MAX_CARACTERES));
  for (const ruim of [undefined, 'Até 5 páginas', { 0: 'a' }, [], [1, null]]) {
    const s = copia(); s.formatos.institucional.inclui = ruim;
    assert.ok(!('no_pacote' in estimar({ formato: 'institucional' }, s).formato), JSON.stringify(ruim) + ': sem lista, sem o campo');
  }
  const cheia = copia(); cheia.formatos.sob_medida.inclui = Array.from({ length: 50 }, () => 'y'.repeat(PACOTE_MAX_CARACTERES));
  assert.ok(JSON.stringify(estimar({ formato: 'sob_medida', paginas: 60, adicionais: { textos: 60, interacao_assinatura: 3 } }, cheia)).length < 16384, 'no pior caso cabe nos 16 KB de app.estimativas.detalhes');
});

test('incluso_em: nunca em pagina_extra, e item que outro exige não pode ter incluso (iria para a fase seguinte)', () => {
  const pe = copia(); pe.adicionais.pagina_extra.incluso_em = { sob_medida: 2 };
  assert.ok(validarRegras(pe).erros?.some(e => /pagina_extra\.incluso_em: as páginas incluídas são paginas_incluidas/.test(e)));
  const dep = copia(); dep.adicionais.blog.requer = ['interacao_assinatura'];
  const v = validarRegras(dep);
  assert.ok(v.erros?.some(e => /blog\.requer: interacao_assinatura tem incluso_em/.test(e)), JSON.stringify(v));
  assert.deepEqual(validarRegras(REGRAS), { ok: true }, 'a tabela v3 como está continua válida');
});

/* ==== TABELA v4 (dono, 2026-11-08, Decisões.md: "Confirmo, pode excluir o Atelier."): o Atelier sai; a direção visual desenhada do zero vira
   o adicional visual_exclusivo do institucional, e nenhum formato abate adicional (nada é exclusivo de um plano: o cliente monta com adicionais) ==== */
test('v4: a tabela sem o Atelier é válida e o motor não aceita mais o formato', () => {
  assert.deepEqual(validarRegras(V4), { ok: true });
  assert.deepEqual(Object.keys(V4.formatos), ['landing_page', 'institucional', 'loja_plataforma']);
  const e = estimar({ formato: 'sob_medida' }, V4);
  assert.deepEqual(e.erros, ['formato: um de landing_page, institucional, loja_plataforma']);
  assert.deepEqual(Object.keys(V4.adicionais).filter(k => V4.adicionais[k].incluso_em), [], 'nenhum formato abate adicional');
  assert.match(V4._status, /Tabela v4/);
});

test('v4: tabela sem landing ou sem institucional continua recusada (o Atelier passou a ser opcional, como a loja)', () => {
  for (const k of ['landing_page', 'institucional']) {
    const r = JSON.parse(JSON.stringify(V4)); delete r.formatos[k];
    assert.ok(validarRegras(r).erros?.includes('formatos.' + k + ': falta'), k);
  }
});

test('v4: o visual exclusivo só existe no institucional e entra antes dos outros adicionais', () => {
  const v = V4.adicionais.visual_exclusivo;
  assert.deepEqual([v.valor, v.prazo_dias, v.max, v.requer], [3200, 3, 1, ['institucional']]);
  const i = estimar({ formato: 'institucional', adicionais: { visual_exclusivo: 1 } }, V4);
  assert.deepEqual([i.valor_total, i.prazo_dias, i.itens.map(x => x.chave)], [11100, 11, ['visual_exclusivo']]);
  for (const formato of ['landing_page', 'loja_plataforma']) {
    const e = estimar({ formato, adicionais: { visual_exclusivo: 1 } }, V4);
    assert.ok(e.erros?.some(x => /visual_exclusivo exige um destes: Site institucional/.test(x)), formato + ': ' + JSON.stringify(e.erros));
  }
  assert.equal(estimar({ formato: 'institucional', adicionais: { visual_exclusivo: 5 } }, V4).valor_total, 11100, 'no máximo 1');
});

test('v4: o institucional com tudo o que o Atelier trazia soma os mesmos R$ 20.000 (quem quer tudo chega lá somando)', () => {
  const tudo = estimar({ formato: 'institucional', paginas: 6, adicionais: { visual_exclusivo: 1, textos: 6, imagens: 1, formulario_avancado: 1, interacao_leve: 1, interacao_assinatura: 2 } }, V4);
  /* 7900 + 1 página 350 + 3200 + 6 × 350 + 250 + 300 + 900 + 2 × 2500 = 20000 */
  assert.equal(tudo.valor_total, 20000);
  assert.equal(tudo.formato.inclui, undefined, 'sem abatimento, o contrato não ganha "Já incluído em"');
  const v3 = estimar({ formato: 'sob_medida' }, REGRAS);
  assert.equal(tudo.valor_total, v3.valor_total, 'o mesmo valor do Atelier da v3');
});

test('v4: o pedido gravado com o Atelier (tabela v3) continua calculando igual: o código lê as duas tabelas', () => {
  const b = estimar({ formato: 'sob_medida', adicionais: { interacao_assinatura: 3 } }, REGRAS);
  assert.deepEqual([b.formato.nome, b.valor_total], ['Atelier', 22500]);
});

test('v4: o SQL de ativação arquiva a v3, grava a v4 como ativa e é o mesmo que o gerador monta hoje (Postgres real)', async () => {
  const { novoBanco } = await import('./_banco.mjs');
  const { sqlDeAtivacao } = await import('../fase2/gerar-ativar-sql.mjs');
  const sql = fs.readFileSync(new URL('../fase2/regras-v4-ativar.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const json = fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim();
  assert.equal(sql, sqlDeAtivacao(json, 'aprovada pelo dono em 2026-11-08 (chat): Confirmo, pode excluir o Atelier.'), 'o arquivo não ficou para trás da tabela-rascunho');
  assert.throws(() => sqlDeAtivacao(JSON.stringify({ moeda: 'BRL' }), 'x'), /Tabela inválida/);
  assert.throws(() => sqlDeAtivacao(json, "o dono's"), /aspas simples/);
  for (const ruim of ['a\\b', 'a\nb', 'a\rb', '']) assert.throws(() => sqlDeAtivacao(json, ruim), /Fontes/, JSON.stringify(ruim));
  assert.doesNotMatch(sql, /fundador|11º cliente|Decisões\.md/, 'o histórico longo do _status não vai para o SQL público nem para o banco');
  const db = await novoBanco();
  const { erroDe } = await import('./_banco.mjs');
  assert.match((await erroDe(db.exec(sql)))?.msg || '', /beyon-zero não existe/, 'sem a organização, aborta');
  const ORG = '99999999-0000-4000-8000-000000000099';
  await db.query(`insert into app.organizacoes (id, slug, nome) values ($1, 'beyon-zero', 'Beyon Zero')`, [ORG]);
  await db.query(`insert into app.regras_comerciais (org_id, versao, status, regras, aprovada_em) values ($1, 3, 'ativa', $2::jsonb, now())`, [ORG, JSON.stringify(REGRAS)]);
  await db.exec(sql);
  assert.match((await erroDe(db.exec(sql)))?.msg || '', /já está ativa/, 'rodar de novo aborta sem gravar outra versão');
  const linhas = (await db.query(`select versao, status, regras -> 'formatos' ? 'sob_medida' as atelier, regras from app.regras_comerciais order by versao`)).rows;
  assert.deepEqual(linhas.map(l => [l.versao, l.status, l.atelier]), [[3, 'arquivada', true], [4, 'ativa', false]]);
  assert.deepEqual(validarRegras(linhas[1].regras), { ok: true }, 'o que ficou no banco passa na validação do servidor');
});
