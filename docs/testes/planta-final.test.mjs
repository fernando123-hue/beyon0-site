/* A RODADA FINAL DO PR 2a: o cache do estado (tamanho, expulsão, chave com nome e nicho), a reserva de custo do turno da planta e a posição da fala numa conversa de
   mais de 30 turnos, ponta a ponta. node --test docs/testes/planta-final.test.mjs */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarPlanta, limparCacheDaPlanta, estatisticasDoCache } from '../../api/_vendas/planta.mjs';
import { planoPadrao } from '../../api/_vendas/planta-padrao.mjs';
import { RESERVA_USD, reservaUsd } from '../../api/_ia/config.mjs';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { LIMITES_DE_TESTE } from './_pedido.mjs';

const clone = o => JSON.parse(JSON.stringify(o));
const fx = n => clone(JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8')));
const gravada = (plano, extra = {}) => ({ negocio: { nome: 'Clínica Aurora', segmento: 'clínica' }, ...extra, planta: { v: 1, versao: 1, origem: 'modelo', motivos: [], tentativas: 1, n_mensagens: 1, plano } });

/* ---------- o cache do estado ---------- */
test('cache: guarda no máximo 64 planos e expulsa o mais antigo; o mais recente continua em cache', () => {
  limparCacheDaPlanta();
  const variar = i => { const p = fx('clinica'); p.etapas[0].titulo = 'Uma página para o tratamento ' + 'abcdefghijklmnopqrstuvwxyz'[i % 26] + 'abcdefghijklmnopqrstuvwxyz'[Math.floor(i / 26)]; return p; };
  for (let i = 0; i < 70; i++) assert.ok(montarPlanta(gravada(variar(i))), 'plano ' + i);
  const e = estatisticasDoCache();
  assert.equal(e.max, 64);
  assert.equal(e.tamanho, 64, 'o cache não passa de 64');
  assert.equal(e.falhas, 70);
  montarPlanta(gravada(variar(69)));
  assert.equal(estatisticasDoCache().acertos, 1, 'o mais recente ficou');
  montarPlanta(gravada(variar(0)));
  assert.equal(estatisticasDoCache().falhas, 71, 'o mais antigo foi expulso e foi refeito');
  montarPlanta(gravada(variar(5)));
  assert.equal(estatisticasDoCache().falhas, 72, 'os outros 5 primeiros também saíram');
  assert.equal(estatisticasDoCache().tamanho, 64);
});

test('cache: a chave leva o NOME do negócio e o NICHO regulado (mesmo plano, resultados diferentes, sem vazar de uma conversa para a outra)', () => {
  const plano = fx('clinica');
  plano.chegada.frase = 'A pessoa chega à Clínica Aurora pela busca, pelo mapa ou por indicação.';
  const ler = nome => montarPlanta(gravada(plano, { negocio: { nome } }));
  for (const ordem of [['Clínica Aurora', 'Outra Clínica'], ['Outra Clínica', 'Clínica Aurora']]) {
    limparCacheDaPlanta();
    const r = ordem.map(ler);
    const porNome = Object.fromEntries(ordem.map((n, i) => [n, r[i]]));
    assert.equal(porNome['Clínica Aurora'].origem, 'modelo', 'com o nome dado, o plano vale');
    assert.equal(porNome['Outra Clínica'].origem, 'padrao', 'com outro nome, "Clínica Aurora" é marca e vira o padrão');
  }
  const depoimento = fx('clinica');
  depoimento.etapas[5].frase = 'Quem ficou com dúvida lê depoimentos de pacientes e volta à conversa.';
  limparCacheDaPlanta();
  assert.equal(montarPlanta(gravada(depoimento), { regulado: false }).origem, 'modelo');
  assert.equal(montarPlanta(gravada(depoimento), { regulado: true }).origem, 'padrao', 'o nicho regulado não herda o resultado de quem não é');
  limparCacheDaPlanta();
  assert.equal(montarPlanta(gravada(depoimento), { regulado: true }).origem, 'padrao');
  assert.equal(montarPlanta(gravada(depoimento), { regulado: false }).origem, 'modelo');
});

test('cache: o resultado de um plano inválido também vale (e vira o padrão do nicho do briefing, não o de outro)', () => {
  limparCacheDaPlanta();
  const ruim = fx('loja');
  ruim.etapas[0].titulo = 'Passo 1 da vitrine';
  const a = montarPlanta(gravada(ruim, { negocio: { nome: 'x', segmento: 'loja de roupas femininas' } }));
  const b = montarPlanta(gravada(ruim, { negocio: { nome: 'x', segmento: 'clínica odontológica' } }));
  assert.deepEqual(a.plano, planoPadrao('loja_online'));
  assert.deepEqual(b.plano, planoPadrao('saude_agenda'), 'o mesmo plano ruim cai no padrão de cada nicho');
  assert.equal(estatisticasDoCache().acertos, 1, 'o segundo veio do cache da validação, não da escolha do nicho');
});

/* ---------- a reserva de custo e a posição da fala, pela API ---------- */
let local, deps;
const reservas = [];
const BASE = 'http://127.0.0.1:8899';
const LIGADA = { BZ_PLANTA: 'ligada' };
let ipSeq = 300;
before(async () => {
  local = await montarLocal({ base: BASE });
  const banco = (nome, args) => { if (nome === 'vendas_reservar_custo') reservas.push(args.valor_usd); return local.rpc(nome, args); };
  deps = { banco, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}) }) };
});
function navegador(env) {
  const ip = '198.51.100.' + (++ipSeq);
  let token;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), env, metodo, deps);
    return r.json();
  };
  return { chamar, async iniciar() { const s = await chamar('POST', 'sessao', {}); token = s.token; return s.conversa_id; } };
}
const FALA = 'Tenho uma clínica odontológica em Niterói e quero um site mais profissional porque hoje só tenho Instagram. Quero mais agendamentos.';

test('custo: todo turno com a flag ligada e o preço aberto (C4: a planta e a leitura, que pode vir já no 1º turno, dividem as rodadas) reserva o pior caso de 4 chamadas; flag desligada reserva 0,05 de sempre', async () => {
  assert.equal(RESERVA_USD.conversa, 0.05);
  assert.equal(reservaUsd('conversa'), 0.05);
  assert.equal(reservaUsd('conversa_planta'), 0.2);
  reservas.length = 0;
  const on = navegador(LIGADA);
  const c = await on.iniciar();
  await on.chamar('POST', 'mensagem', { conversa_id: c, texto: FALA });
  assert.deepEqual(reservas, [0.2], '1º turno: sem estimativa ainda, mas a leitura e o estimar dividem as rodadas: reserva o pior caso');
  await on.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Me conta mais' });
  assert.deepEqual(reservas, [0.2, 0.2], '2º turno: com a estimativa feita e a flag ligada');
  reservas.length = 0;
  const off = navegador({});
  const c2 = await off.iniciar();
  await off.chamar('POST', 'mensagem', { conversa_id: c2, texto: FALA });
  await off.chamar('POST', 'mensagem', { conversa_id: c2, texto: 'Me conta mais' });
  assert.deepEqual(reservas, [0.05, 0.05], 'flag desligada: a reserva é a de hoje');
});

test('posição da fala numa conversa de mais de 30 turnos: o turno grava a posição absoluta (2 * turnos + 1) e o estado a devolve na janela de 60', async () => {
  const n = navegador(LIGADA);
  const c = await n.iniciar();
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: FALA });
  await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Me conta mais' });
  assert.equal((await local.db.query('select briefing from app.conversas where id = $1', [c])).rows[0].briefing.planta_pedidos, 1);
  /* a conversa chega a 35 turnos (70 mensagens: 4 já existem, entram 66) */
  await local.db.query(`insert into app.mensagens (org_id, conversa_id, papel, conteudo) select cv.org_id, cv.id, case when g % 2 = 0 then 'visitante' else 'agente' end, 'x' from app.conversas cv, generate_series(1, 66) g where cv.id = $1`, [c]);
  await local.db.query('update app.conversas set turnos = 35 where id = $1', [c]);
  const r = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'E depois, o que acontece?' });
  assert.ok(r.resposta, JSON.stringify(r));
  const b = (await local.db.query('select briefing from app.conversas where id = $1', [c])).rows[0].briefing;
  assert.equal(b.planta.origem, 'padrao');
  assert.deepEqual(b.planta.motivos, ['nao_chamou']);
  assert.equal(b.planta.n_mensagens, 71, 'o fim do turno (nao_chamou) grava 2 * 35 + 1, não o tamanho da lista de 60 mais 1');
  const e = await n.chamar('GET', 'estado', undefined, '&conversa=' + c);
  assert.equal(e.mensagens.length, 60);
  assert.equal(e.planta.n_mensagens, 59, 'a última fala da janela de 60');
});
