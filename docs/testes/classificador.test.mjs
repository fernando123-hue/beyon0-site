/* O classificador (api/_classificador): a recomendação do pacote por tabela explícita (adaptador "regras") e o lugar
   do JEV, desligado, com recuo para as regras. Spec: docs/specs/2026-10-11-orcamento-sem-ia.md §2 e §8. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificar, configClassificador } from '../../api/_classificador/index.mjs';
import { validarRespostas } from '../../api/_classificador/contrato.mjs';

const TODOS = ['landing_page', 'institucional', 'sob_medida', 'loja_plataforma'];
const rec = async (respostas, formatos = TODOS) => (await classificar('recomendar_pacote', { respostas, formatos }, { cfg: { jev: false, prazoMs: 50 } })).dados;
const base = { ramo: 'saude', cidade: 'Goiânia', site_atual: 'instagram', material: 'tenho' };

test('respostas: lista fechada; "não sei" vira o padrão e fica registrado como assumido', () => {
  assert.ok(validarRespostas({ ...base, objetivos: ['inventado'] }).erros);
  assert.ok(validarRespostas({ ...base, ramo: 'x', objetivos: [] }).erros);
  const v = validarRespostas({ objetivos: [] });
  assert.deepEqual(v.dados.assumido.sort(), ['material', 'objetivos', 'ramo', 'site_atual']);
  assert.equal(validarRespostas({ ...base, outro: 'a'.repeat(200), objetivos: [] }).dados.outro.length, 60, 'texto curto');
  assert.equal(validarRespostas({ ...base, cidade: '<b>Goiânia</b>', objetivos: [] }).dados.cidade, 'bGoiânia/b', 'sem < > nem controles');
});

test('tabela explícita: um objetivo só NÃO leva à landing (a dentista que quer agendamentos)', async () => {
  const r = await rec({ ...base, objetivos: ['agendamentos'] });
  assert.equal(r.formato, 'institucional');
  assert.equal(r.alternativa, 'landing_page');
  assert.deepEqual(r.adicionais, { agendamento: 1 });
  assert.match(r.motivo, /agend/i);
  for (const o of ['pedidos_whatsapp', 'achado_google', 'apresentar'])
    assert.equal((await rec({ ...base, objetivos: [o] })).formato, 'institucional', o);
});

test('tabela explícita: só campanha → landing (institucional ao lado); vender online → loja', async () => {
  const c = await rec({ ...base, objetivos: ['campanha'] });
  assert.equal(c.formato, 'landing_page');
  assert.equal(c.alternativa, 'institucional');
  const v = await rec({ ...base, objetivos: ['vender_online', 'apresentar'] });
  assert.equal(v.formato, 'loja_plataforma');
  assert.equal(v.alternativa, null);
  /* tabela antiga sem a loja: institucional e o pedido de loja vai para "fale comigo" */
  const semLoja = await rec({ ...base, objetivos: ['vender_online'] }, ['landing_page', 'institucional', 'sob_medida']);
  assert.equal(semLoja.formato, 'institucional');
  assert.deepEqual(semLoja.fale_comigo, ['loja']);
});

test('nada de "sob medida" sugerido sozinho; sem textos → sugestão (não incluída) do tamanho do formato', async () => {
  for (const objetivos of [[], ['campanha'], ['agendamentos', 'apresentar'], ['vender_online']])
    assert.notEqual((await rec({ ...base, objetivos })).formato, 'sob_medida');
  const r = await rec({ ...base, material: 'nao', objetivos: ['apresentar'] });
  assert.deepEqual(r.sugestoes, [{ chave: 'textos', qtd: 5 }]);
  assert.equal(r.adicionais.textos, undefined, 'sugestão, não incluída');
});

test('"não sei" em tudo → institucional, com o que foi assumido', async () => {
  const r = await rec({ objetivos: [] });
  assert.equal(r.formato, 'institucional');
  assert.ok(r.assumido.includes('objetivos'));
});

test('o JEV: desligado por padrão; ligado mas indisponível ou lento → recua para as regras, sem quebrar', async () => {
  assert.equal(configClassificador({}).jev, false);
  assert.equal(configClassificador({ BZ_JEV: 'ligado' }).jev, true);
  const entrada = { respostas: { ...base, objetivos: ['agendamentos'] }, formatos: TODOS };
  const ligado = await classificar('recomendar_pacote', entrada, { cfg: { jev: true, prazoMs: 50 } });
  assert.equal(ligado.motor, 'regras', 'o adaptador real não existe: recua');
  const lento = await classificar('recomendar_pacote', entrada, { cfg: { jev: true, prazoMs: 20 },
    adaptadores: { jev: () => new Promise(r => setTimeout(() => r({ disponivel: true, dados: {} }), 200)) } });
  assert.equal(lento.motor, 'regras', 'passou do prazo: recua');
  await assert.rejects(classificar('tarefa_inventada', entrada), /tarefa/);
});
