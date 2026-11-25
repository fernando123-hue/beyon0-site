/* AS ESCOLHAS DELA PELOS CARTÕES DE EXTRAS (api/_vendas/escolhas-extras.mjs; dono, 24/11): o que ela incluiu ou tirou vale por cima do que o Zero
   pedir no estimar; só chaves da tabela que se contratam; o "requer" e os órfãos como em todo cálculo; o modelo lê os NOMES e a regra. O caminho
   inteiro (cartão → estimativa nova do Zero) está em orcamento-extras-zero-api.test.mjs, com o banco real. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { escolhasDe, aplicarEscolhas, comEscolha, comEscolhasGravadas, escolhasParaOModelo } from '../../api/_vendas/escolhas-extras.mjs';
import { estadoParaModelo } from '../../api/_vendas/agente.mjs';
import { estimar } from '../../api/_vendas/precos.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const chaveEmPreparo = Object.keys(REGRAS.adicionais).find(k => REGRAS.adicionais[k].em_preparo === true);
const chaveDaLoja = Object.keys(REGRAS.adicionais).find(k => Array.isArray(REGRAS.adicionais[k].requer) && REGRAS.adicionais[k].requer.includes('loja_plataforma'));

test('escolhasDe: só sim/não de chave da tabela que se contrata; lê do banco (detalhes) e do mesmo turno', () => {
  const bruto = { agendamento: true, imagens: false, __proto__x: true, nao_existe: true, textos: 'sim', ...(chaveEmPreparo ? { [chaveEmPreparo]: true } : {}) };
  assert.deepEqual(escolhasDe({ detalhes: { escolhas_cliente: bruto } }, REGRAS), { agendamento: true, imagens: false });
  assert.deepEqual(escolhasDe({ escolhas_cliente: { blog: true } }, REGRAS), { blog: true });
  assert.deepEqual(escolhasDe(null, REGRAS), {});
  assert.deepEqual(escolhasDe({ detalhes: { escolhas_cliente: ['agendamento'] } }, REGRAS), {});
  assert.deepEqual(escolhasDe({ detalhes: { escolhas_cliente: { agendamento: true } } }, null), {});
});

test('aplicarEscolhas: a incluída entra (por página, nas páginas do pacote), a tirada sai, o resto do pedido do Zero fica', () => {
  const pedido = { formato: 'institucional', adicionais: { blog: 1, imagens: 1 }, urgencia: true };
  const f = aplicarEscolhas(pedido, { agendamento: true, imagens: false, textos: true }, REGRAS);
  assert.deepEqual(f.adicionais, { blog: 1, agendamento: 1, textos: REGRAS.formatos.institucional.paginas_incluidas });
  assert.equal(f.urgencia, true, 'urgência, formato e o que mais o Zero pediu ficam');
  assert.deepEqual(pedido.adicionais, { blog: 1, imagens: 1 }, 'sem mexer no pedido original');
  const e = estimar(f, REGRAS);
  assert.ok(!e.erros && e.itens.some(i => i.chave === 'agendamento') && !e.itens.some(i => i.chave === 'imagens'));
});

test('aplicarEscolhas: o extra que exige outro formato não entra (órfão); pedido malformado segue como veio, para o motor recusar', () => {
  if (chaveDaLoja) assert.deepEqual(aplicarEscolhas({ formato: 'institucional', adicionais: {} }, { [chaveDaLoja]: true }, REGRAS).adicionais, {});
  assert.equal(aplicarEscolhas('x', { agendamento: true }, REGRAS), 'x');
  const semFormato = { formato: 'nao_existe', adicionais: {} };
  assert.equal(aplicarEscolhas(semFormato, { agendamento: true }, REGRAS), semFormato);
  const semEscolha = { formato: 'institucional', adicionais: { blog: 1 } };
  assert.equal(aplicarEscolhas(semEscolha, {}, REGRAS), semEscolha, 'sem escolhas, o MESMO pedido');
});

test('a escolha segue com a estimativa; sem escolhas, a MESMA estimativa; a última escolha de cada chave vale', () => {
  const e = { valor_total: 1 };
  assert.equal(comEscolhasGravadas(e, {}), e);
  assert.deepEqual(comEscolhasGravadas(e, { agendamento: true }), { valor_total: 1, escolhas_cliente: { agendamento: true } });
  assert.deepEqual(comEscolha(comEscolha({}, 'agendamento', true), 'agendamento', false), { agendamento: false });
});

test('o modelo lê os nomes da tabela e a regra (no ESTADO), e nada quando ela não escolheu', () => {
  const para = escolhasParaOModelo({ agendamento: true, imagens: false }, REGRAS);
  assert.deepEqual(para.incluidos, [REGRAS.adicionais.agendamento.nome]);
  assert.deepEqual(para.tirados, [REGRAS.adicionais.imagens.nome]);
  assert.match(para.regra, /tocar no cartão/);
  assert.equal(escolhasParaOModelo({}, REGRAS), null);
  const comEscolhas = estadoParaModelo({ briefing: {}, etapa: 'estimativa', regras: REGRAS, estimativa: { prazo_dias: 13, fase: 'unica', detalhes: { itens: [], escolhas_cliente: { agendamento: true } } } });
  assert.ok(comEscolhas.includes('extras_escolhidos_na_tela') && comEscolhas.includes(REGRAS.adicionais.agendamento.nome));
  assert.ok(!comEscolhas.includes('escolhas_cliente'), 'a chave interna não vai ao modelo');
  const sem = estadoParaModelo({ briefing: {}, etapa: 'estimativa', regras: REGRAS, estimativa: { prazo_dias: 13, fase: 'unica', detalhes: { itens: [] } } });
  assert.ok(!sem.includes('extras_escolhidos_na_tela'), 'sem escolha, o ESTADO de hoje');
});
