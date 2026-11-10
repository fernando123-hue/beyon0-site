/* O catálogo público (api/_vendas/catalogo.mjs): só o que a tela mostra, nada interno; extras por ramo e formato. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogoPublico, respostasParaBriefing, FRASES } from '../../api/_vendas/catalogo.mjs';
import { limparAtualizacao } from '../../api/_vendas/briefing.mjs';
import { comArea } from './_area-v2.mjs';
import { comFora } from './_fora-do-automatico.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));

test('nada interno sai: prioridade, prazo por item, piso, limites, descontos', () => {
  const c = catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' });
  const texto = JSON.stringify(c);
  for (const proibido of ['prioridade', 'prazo_dias', 'piso', 'valor_max', 'descontos', 'limites']) assert.ok(!texto.includes(proibido), proibido);
  assert.ok(c.formatos.find(f => f.chave === 'institucional').inclui.length > 0, 'o que já vem no pacote');
});

test('"Já vem no pacote" do catálogo é a mesma lista gravada com a estimativa (a tela não muda ao recarregar), já limpa', async () => {
  const { estimar } = await import('../../api/_vendas/precos.mjs');
  const r = JSON.parse(JSON.stringify(REGRAS));
  r.formatos.institucional.inclui = [' Até 5 páginas ', 7, '', 'x'.repeat(500), 'Celular primeiro'];
  const cat = catalogoPublico(r, { formato: 'institucional', ramo: 'saude' }).formatos.find(f => f.chave === 'institucional').inclui;
  assert.deepEqual(cat, ['Até 5 páginas', 'Celular primeiro']);
  assert.deepEqual(estimar({ formato: 'institucional' }, r).formato.no_pacote, cat);
  const sem = JSON.parse(JSON.stringify(REGRAS)); delete sem.formatos.institucional.inclui;
  assert.deepEqual(catalogoPublico(sem, { formato: 'institucional', ramo: 'saude' }).formatos.find(f => f.chave === 'institucional').inclui, [], 'sem lista: vazia, como antes');
});

test('extras: os do ramo nos principais; os da loja só com a loja; dependentes com requer; fora do automático = fale comigo', () => {
  const saude = catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' });
  const chaves = l => l.map(e => e.chave);
  assert.ok(chaves(saude.extras.principais).includes('agendamento'));
  assert.ok(!chaves(saude.extras.principais).includes('catalogo'));
  assert.ok(!chaves([...saude.extras.principais, ...saude.extras.mais]).includes('marketplace'), 'extra da loja fora da loja');
  assert.ok(chaves(catalogoPublico(REGRAS, { formato: 'loja_plataforma', ramo: 'comercio' }).extras.principais).includes('marketplace'));
  /* 2026-10-28 (dono): área restrita, sistema e loja do zero saíram da venda; a tabela real não tem "fale comigo" */
  assert.deepEqual([...saude.extras.principais, ...saude.extras.mais].filter(e => e.fale_comigo).map(e => e.chave), [], 'nenhum fale comigo na tabela real');
  /* numa tabela antiga (fora do automático desde 2026-10-14): vira fale comigo, sem valor, e sem os dependentes */
  const antiga = catalogoPublico(comFora(REGRAS), { formato: 'institucional', ramo: 'saude' });
  assert.ok(chaves(antiga.extras.mais).includes('area_restrita'));
  const area = antiga.extras.mais.find(e => e.chave === 'area_restrita');
  assert.deepEqual([area.fale_comigo, area.valor], [true, null]);
  assert.ok(!chaves(antiga.extras.mais).some(k => k.startsWith('area_') && k !== 'area_restrita'), 'dependente da área sem a área no automático');
  /* o mecanismo dos dependentes, com a área automática da v2 */
  const v2 = catalogoPublico(comArea(REGRAS), { formato: 'institucional', ramo: 'saude' });
  assert.deepEqual(v2.extras.mais.find(e => e.chave === 'area_documentos').requer, ['area_restrita']);
  const fora = antiga.extras.mais.find(e => e.chave === 'sistema_sob_medida');
  assert.equal(fora.fale_comigo, true);
  assert.equal(fora.valor, null);
  for (const e of [...saude.extras.principais, ...saude.extras.mais, ...antiga.extras.mais]) assert.ok(e.frase && !/sob medida/i.test(e.frase), e.chave);
});

/* os dois cenários juntos cobrem todos os adicionais da tabela (os da loja só aparecem com a loja) */
function todosOsExtras() {
  const cenarios = [{ formato: 'institucional', ramo: 'saude' }, { formato: 'loja_plataforma', ramo: 'comercio' }];
  const porChave = new Map();
  for (const cenario of cenarios) {
    const c = catalogoPublico(REGRAS, cenario);
    for (const e of [...c.extras.principais, ...c.extras.mais]) porChave.set(e.chave, e);
  }
  return { extras: [...porChave.values()], formatos: catalogoPublico(REGRAS, cenarios[0]).formatos };
}

test('texto de tela: nenhum nome nem frase (extras e formatos) diz "sob medida" ou "briefing"', () => {
  const { extras, formatos } = todosOsExtras();
  /* (os em preparo, como o atendente de IA da v3, não aparecem na tela: a pessoa ainda não pode contratar) */
  assert.equal(extras.length, Object.values(REGRAS.adicionais).filter(a => a.em_preparo !== true).length, 'todos os extras foram conferidos');
  assert.ok(!extras.some(e => /^atendente_ia_/.test(e.chave)), 'o atendente em preparo não aparece no catálogo público');
  assert.deepEqual(extras.filter(e => /^interacao_/.test(e.chave)).map(e => e.chave).sort(), ['interacao_assinatura', 'interacao_leve'], 'as interações aparecem em todo formato');
  for (const item of [...extras, ...formatos]) {
    assert.ok(!/sob medida|briefing/i.test(item.nome), `nome de ${item.chave}: ${item.nome}`);
    if ('frase' in item) assert.ok(!/sob medida|briefing/i.test(item.frase), `frase de ${item.chave}`);
  }
});

test('todo adicional da tabela tem frase própria (chave nova não cai no nome cru da tabela)', () => {
  for (const chave of Object.keys(REGRAS.adicionais)) assert.ok(chave in FRASES, `falta frase para ${chave}`);
  for (const e of todosOsExtras().extras) assert.notEqual(e.frase, REGRAS.adicionais[e.chave].nome, e.chave);
});

test('urgência pública: acréscimo e prazo, sem o nome interno', () => {
  assert.deepEqual(catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' }).urgencia, { acrescimo_percentual: 30, prazo_fator: 0.6 });
});

test('respostas → briefing que o limparAtualizacao aceita inteiro', () => {
  const b = respostasParaBriefing({ ramo: 'saude', outro: '', cidade: 'Goiânia', objetivos: ['agendamentos', 'achado_google'], site_atual: 'instagram', material: 'nao', assumido: [] }, 'institucional');
  assert.deepEqual(limparAtualizacao(b), b);
  assert.deepEqual(b.objetivos, ['agendamentos', 'outro']);
  assert.equal(b.objetivo_detalhe, 'ser achado no Google');
  assert.equal(b.negocio.cidade, 'Goiânia');
  assert.equal(b.conteudo.textos, 'nao');
  assert.equal(b.projeto.formato, 'institucional');
});

test('respostas ruins não quebram nem deixam chave undefined no briefing', () => {
  let b;
  assert.doesNotThrow(() => { b = respostasParaBriefing({ ramo: 'x', objetivos: 'y', material: 'z', outro: '', cidade: '' }, 'institucional'); });
  assert.ok(!('objetivos' in b), 'objetivos que não é lista: sem objetivos');
  assert.ok(!b.negocio?.segmento, 'ramo desconhecido: sem segmento');
  assert.ok(!b.conteudo, 'material desconhecido: sem textos');
  assert.ok(!JSON.stringify(b).includes('undefined') && Object.values(b).every(v => v !== undefined));
  assert.deepEqual(limparAtualizacao(b), b);
});

/* revisão de segurança do PR 37: o texto livre (outro ramo, cidade) vai ao briefing; telefone e e-mail digitados ali
   são trocados por marcadores, como a privacidade promete para o que se escreve no orçamento */
test('texto livre do formulário: telefone e e-mail viram marcadores no briefing', () => {
  const b = respostasParaBriefing({ ramo: 'outro', outro: 'Doceria 11 98765-4321', cidade: 'fulano@exemplo.com', objetivos: [] }, 'landing_page');
  assert.ok(!/98765|fulano@/.test(JSON.stringify(b)), JSON.stringify(b.negocio));
  assert.match(b.negocio.segmento, /Doceria \[telefone\]/);
  assert.equal(b.negocio.cidade, '[e-mail]');
  assert.equal(respostasParaBriefing({ ramo: 'outro', outro: 'Doceria', cidade: 'Campo Grande', objetivos: [] }, 'landing_page').negocio.cidade, 'Campo Grande', 'texto comum fica igual');
});

/* tabela v4 (dono, 2026-11-08): o adicional que só existe num formato (visual exclusivo, só no institucional) aparece só nele, como principal;
   o filtro é o mesmo da loja, generalizado, e com a v3 arquivada (sem o adicional) o catálogo fica como era */
test('v4: o visual exclusivo aparece só no institucional, como principal; na landing, na loja e sem formato, some', () => {
  const todas = c => [...c.extras.principais, ...c.extras.mais].map(e => e.chave);
  const inst = catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'outro' });
  const visual = inst.extras.principais.find(e => e.chave === 'visual_exclusivo');
  assert.ok(visual, 'principal no institucional, em qualquer ramo');
  assert.deepEqual([visual.valor, visual.max, visual.requer, visual.frase], [3200, 1, ['institucional'], FRASES.visual_exclusivo]);
  for (const formato of ['landing_page', 'loja_plataforma', undefined]) {
    assert.ok(!todas(catalogoPublico(REGRAS, { formato, ramo: 'servicos' })).includes('visual_exclusivo'), String(formato));
  }
  assert.ok(!inst.formatos.some(f => f.chave === 'sob_medida'), 'o Atelier não é mais formato vizinho');
  /* a v3 arquivada: mesmos extras de antes (o filtro novo não muda a loja nem os outros) */
  const V3 = JSON.parse(fs.readFileSync(new URL('../fase2/regras-v3-atelier-arquivada.json', import.meta.url), 'utf8'));
  for (const [formato, ramo] of [['institucional', 'saude'], ['landing_page', 'comercio'], ['loja_plataforma', 'comercio'], ['sob_medida', 'servicos']]) {
    const c = catalogoPublico(V3, { formato, ramo });
    const daLoja = Object.entries(V3.adicionais).filter(([, a]) => a.requer?.includes('loja_plataforma')).map(([k]) => k);
    assert.equal(daLoja.every(k => todas(c).includes(k)), formato === 'loja_plataforma', formato + ': os da loja só na loja');
    assert.ok(daLoja.every(k => formato !== 'loja_plataforma' || c.extras.principais.some(e => e.chave === k)), formato + ': na loja, principais');
  }
  assert.ok(catalogoPublico(V3, { formato: 'institucional', ramo: 'saude' }).formatos.some(f => f.chave === 'sob_medida'), 'com a v3, o Atelier segue vizinho');
});

/* ---------- 2026-11-10: os adicionais "Recomendados no painel" (dono: "os nossos adicionais estão muito mal colocados,
   é um amontoado de letras [...] o botão que leva a eles chama bem menos atenção"; escolheu a opção A). Até 3 sugestões
   pelo ramo e pelo formato, cada uma com nome curto e o benefício numa frase. Pelo ramo, nunca "mais vendido" inventado ---------- */
test('sugestões: até 3, pelo ramo e pelo formato, só do que dá para contratar agora', () => {
  const de = (formato, ramo) => catalogoPublico(REGRAS, { formato, ramo });
  const saude = de('institucional', 'saude');
  assert.deepEqual(saude.recomendados, ['agendamento', 'textos', 'imagens'], 'saúde: o agendamento primeiro');
  assert.deepEqual(de('institucional', 'comercio').recomendados, ['catalogo', 'textos', 'imagens'], 'comércio: o catálogo primeiro');
  assert.deepEqual(de('landing_page', 'outro').recomendados, ['textos', 'imagens', 'interacao_leve'], 'sem ramo que pese: conteúdo e movimento');
  assert.deepEqual(de('landing_page', undefined).recomendados, ['textos', 'imagens', 'interacao_leve']);
  assert.equal(de('loja_plataforma', 'comercio').recomendados[0], 'frete_transportadora', 'loja: o frete primeiro');
  for (const [f, ramo] of [['institucional', 'saude'], ['loja_plataforma', 'comercio'], ['landing_page', 'beleza'], ['institucional', 'associacao']]) {
    const c = de(f, ramo), ok = new Map(c.extras.principais.concat(c.extras.mais).map(x => [x.chave, x]));
    assert.ok(c.recomendados.length > 0 && c.recomendados.length <= 3, f + '/' + ramo);
    for (const k of c.recomendados) {
      const x = ok.get(k);
      assert.ok(x, k + ' sugerido sem estar no catálogo de ' + f);
      assert.ok(x.valor != null && !x.fale_comigo, k + ': sugestão sem preço automático');
    }
  }
  /* o que está em preparo (o atendente de IA) nunca é sugerido */
  assert.ok(!de('institucional', 'servicos').recomendados.some(k => /^atendente_ia/.test(k)));
  /* o ramo vem do visitante (?ramo=): nome de propriedade do Object não derruba a rota, cai no "sem ramo" (revisão do #127) */
  for (const ramo of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.deepEqual(de('landing_page', ramo).recomendados, ['textos', 'imagens', 'interacao_leve'], 'ramo ' + ramo);
  }
});

test('cada extra tem nome curto e benefício para o cartão; o nome da tabela segue como estava', () => {
  const c = catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' });
  const todos = c.extras.principais.concat(c.extras.mais);
  for (const x of todos) {
    assert.ok(typeof x.curto === 'string' && x.curto.length > 0 && x.curto.length <= 34, x.chave + ': curto "' + x.curto + '"');
    assert.ok(typeof x.beneficio === 'string' && x.beneficio.length > 0 && x.beneficio.length <= 70, x.chave + ': benefício');
    assert.ok(typeof x.grupo === 'string' && x.grupo.length > 0, x.chave + ': grupo');
  }
  const textos = todos.find(x => x.chave === 'textos');
  assert.equal(textos.curto, 'Nós escrevemos os textos');
  assert.equal(textos.por_pagina, true, 'textos é por página: o cartão diz');
  assert.match(textos.nome, /Textos/, 'o nome da tabela não muda');
});
