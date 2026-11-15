/* O VIGIA (spec 2026-11-15-auto-reparo): confere o site sem IA e avisa o dono sem repetir.
   Aqui: a decisão pura (api/_vigia/decidir.mjs), as conferências do Worker (api/_vigia/conferir.mjs) e a ronda de ponta a ponta
   com o banco local e um canal de e-mail falso (api/_vigia/rondar.mjs).  node --test docs/testes/vigia.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITENS, ESTREIA, BANCO_FORA, achadosDe, decidir, decidirSemBanco, lembrarSemBanco } from '../../api/_vigia/decidir.mjs';

const H = 3600e3;
const AGORA = Date.UTC(2026, 10, 15, 13, 23);
const iso = ms => new Date(ms).toISOString();
const LEITURA_OK = { estado: {}, estreia_em: iso(AGORA - 100 * H), falhas_ia_hora: 0, conversas_falha_hora: 0, ultima_falha_conta_em: null,
  ultima_ok_ia_em: iso(AGORA - H), ultima_falha_ia_em: null, ultima_reconciliacao_em: iso(AGORA - H), ultima_diaria_em: iso(AGORA - 7 * H), urgentes: 0 };
const CONF_OK = { paginas: true, configuracao: [], pagamentosLigados: true };
const ativos = a => Object.keys(a).filter(k => a[k]).sort();

/* ---- achadosDe: o que está quebrado agora ---- */
test('achados: tudo em ordem → nada quebrado', () => {
  assert.deepEqual(ativos(achadosDe(LEITURA_OK, CONF_OK, AGORA)), []);
});

test('achados: cada item quebra pelo motivo dele, com texto fixo', () => {
  const a = achadosDe({ ...LEITURA_OK, ultima_reconciliacao_em: iso(AGORA - 7 * H), ultima_diaria_em: iso(AGORA - 27 * H), urgentes: 2,
    falhas_ia_hora: 3, conversas_falha_hora: 2, ultima_falha_ia_em: iso(AGORA - 60e3), ultima_falha_conta_em: iso(AGORA - 30e3) },
  { paginas: false, configuracao: ['anthropic', 'cron'], pagamentosLigados: true }, AGORA);
  assert.deepEqual(ativos(a), ['alertas_urgentes', 'configuracao', 'ia_conta', 'ia_falhando', 'pagamentos', 'paginas', 'rotina_diaria']);
  assert.equal(a.paginas, ITENS.paginas.quebrou);
  assert.match(a.configuracao, /chave da IA, segredo das rotinas\.$/);
  assert.match(a.alertas_urgentes, /^Há 2 alertas urgentes no painel/);
  for (const t of Object.values(a)) assert.ok(!/@|BZ-|\+55/.test(t), t);
});

test('achados: os prazos das rotinas contam a partir da estreia do vigia (sem alarme falso no 1º dia)', () => {
  const recemLigado = { ...LEITURA_OK, estreia_em: iso(AGORA - 2 * H), ultima_reconciliacao_em: null, ultima_diaria_em: null };
  assert.deepEqual(ativos(achadosDe(recemLigado, CONF_OK, AGORA)), []);
  assert.deepEqual(ativos(achadosDe({ ...recemLigado, estreia_em: null }, CONF_OK, AGORA)), [], 'a 1ª ronda (sem estreia) também não');
  assert.deepEqual(ativos(achadosDe({ ...recemLigado, estreia_em: iso(AGORA - 30 * H) }, CONF_OK, AGORA)), ['pagamentos', 'rotina_diaria']);
  assert.deepEqual(ativos(achadosDe({ ...LEITURA_OK, ultima_reconciliacao_em: iso(AGORA - 6.4 * H) }, CONF_OK, AGORA)), [], '6 h 24: uma perdida não alarma');
});

test('achados: pagamentos desligados não alarmam a reconciliação (uma causa, um item: só a configuração)', () => {
  const a = achadosDe({ ...LEITURA_OK, ultima_reconciliacao_em: iso(AGORA - 50 * H) }, { paginas: true, configuracao: ['pagamentos'], pagamentosLigados: false }, AGORA);
  assert.deepEqual(ativos(a), ['configuracao']);
});

test('achados: IA falhando só com 3+ falhas na hora de 2+ conversas; e só volta com uma chamada que deu certo depois', () => {
  const falhas = { ...LEITURA_OK, falhas_ia_hora: 5, conversas_falha_hora: 1, ultima_falha_ia_em: iso(AGORA - 60e3) };
  assert.equal(achadosDe(falhas, CONF_OK, AGORA).ia_falhando, null, 'um visitante sozinho não dispara');
  assert.ok(achadosDe({ ...falhas, conversas_falha_hora: 2 }, CONF_OK, AGORA).ia_falhando);
  const jaAtivo = { ia_falhando: { ativo: true, desde: iso(AGORA - 3 * H), avisado_em: iso(AGORA - 3 * H) } };
  const quieto = { ...LEITURA_OK, estado: jaAtivo, falhas_ia_hora: 0, conversas_falha_hora: 0, ultima_falha_ia_em: iso(AGORA - 2 * H), ultima_ok_ia_em: iso(AGORA - 5 * H) };
  assert.ok(achadosDe(quieto, CONF_OK, AGORA).ia_falhando, 'sem conversa nenhuma depois da falha: continua quebrado');
  assert.equal(achadosDe({ ...quieto, ultima_ok_ia_em: iso(AGORA - H) }, CONF_OK, AGORA).ia_falhando, null, 'uma chamada boa depois: voltou');
});

test('achados: conta da IA recusada fica até uma chamada dar certo depois dela', () => {
  assert.ok(achadosDe({ ...LEITURA_OK, ultima_falha_conta_em: iso(AGORA - 50 * H), ultima_ok_ia_em: iso(AGORA - 60 * H) }, CONF_OK, AGORA).ia_conta);
  assert.equal(achadosDe({ ...LEITURA_OK, ultima_falha_conta_em: iso(AGORA - 50 * H), ultima_ok_ia_em: iso(AGORA - 40 * H) }, CONF_OK, AGORA).ia_conta, null);
  assert.ok(achadosDe({ ...LEITURA_OK, ultima_falha_conta_em: iso(AGORA - H), ultima_ok_ia_em: null }, CONF_OK, AGORA).ia_conta);
});

/* ---- decidir: quando escrever ---- */
const NADA = Object.fromEntries(Object.keys(ITENS).map(k => [k, null]));
const ESTRELADO = { estreia: { ativo: false, desde: iso(AGORA - 100 * H), avisado_em: iso(AGORA - 100 * H) } };

test('decidir: a 1ª ronda manda a estreia (o alerta de teste) e grava o item estreia junto do e-mail', () => {
  const d = decidir({}, NADA, AGORA);
  assert.deepEqual(d.linhas, [ESTREIA]);
  assert.deepEqual(d.itens, [{ item: 'estreia', ativo: false, desde: iso(AGORA), avisado_em: iso(AGORA), noEmail: true }]);
});

test('decidir: sem novidade, nenhuma linha e nada a gravar', () => {
  assert.deepEqual(decidir(ESTRELADO, NADA, AGORA), { linhas: [], itens: [] });
});

test('decidir: falha nova entra no e-mail; continua por menos de 24 h fica quieta; depois de 24 h lembra', () => {
  const nova = decidir(ESTRELADO, { ...NADA, paginas: ITENS.paginas.quebrou }, AGORA);
  assert.deepEqual(nova.linhas, [ITENS.paginas.quebrou]);
  assert.deepEqual(nova.itens, [{ item: 'paginas', ativo: true, desde: iso(AGORA), avisado_em: iso(AGORA), noEmail: true }]);
  const estado = { ...ESTRELADO, paginas: { ativo: true, desde: iso(AGORA - 5 * H), avisado_em: iso(AGORA - 5 * H) } };
  const quieta = decidir(estado, { ...NADA, paginas: ITENS.paginas.quebrou }, AGORA);
  assert.deepEqual(quieta, { linhas: [], itens: [] }, 'nada mudou: não regrava');
  const lembra = decidir({ ...estado, paginas: { ...estado.paginas, avisado_em: iso(AGORA - 24 * H) } }, { ...NADA, paginas: ITENS.paginas.quebrou }, AGORA);
  assert.deepEqual(lembra.linhas, [ITENS.paginas.quebrou]);
  assert.equal(lembra.itens[0].desde, iso(AGORA - 5 * H), 'o "desde" é o do começo da falha');
});

test('decidir: voltou ao normal depois de avisado → uma linha; a falha que nunca foi avisada volta calada; os alertas do painel voltam calados', () => {
  const estado = { ...ESTRELADO, paginas: { ativo: true, desde: iso(AGORA - 5 * H), avisado_em: iso(AGORA - 5 * H) },
    pagamentos: { ativo: true, desde: iso(AGORA - 2 * H), avisado_em: null },
    alertas_urgentes: { ativo: true, desde: iso(AGORA - 9 * H), avisado_em: iso(AGORA - 9 * H) } };
  const d = decidir(estado, NADA, AGORA);
  assert.deepEqual(d.linhas, [ITENS.paginas.voltou]);
  assert.deepEqual(d.itens.map(i => [i.item, i.ativo, i.desde, i.avisado_em, i.noEmail]).sort(), [
    ['alertas_urgentes', false, null, null, false], ['pagamentos', false, null, null, false], ['paginas', false, null, null, true]]);
  assert.equal(ITENS.alertas_urgentes.voltou, null);
});

test('decidir: falha de novo depois de ter voltado é falha nova (avisa na hora)', () => {
  const estado = { ...ESTRELADO, paginas: { ativo: false, desde: null, avisado_em: null } };
  assert.deepEqual(decidir(estado, { ...NADA, paginas: ITENS.paginas.quebrou }, AGORA).linhas, [ITENS.paginas.quebrou]);
});

test('decidir: várias novidades numa ronda viram um e-mail só, urgentes primeiro', () => {
  const d = decidir(ESTRELADO, { ...NADA, rotina_diaria: ITENS.rotina_diaria.quebrou, ia_conta: ITENS.ia_conta.quebrou }, AGORA);
  assert.deepEqual(d.linhas, [ITENS.ia_conta.quebrou, ITENS.rotina_diaria.quebrou]);
});

/* ---- banco fora: sem memória, regra fixa ---- */
test('banco fora: só nas rondas das 01, 07, 13 e 19 UTC e nunca duas vezes em 24 h no mesmo isolado', () => {
  const memoria = new Map();
  const as = h => Date.UTC(2026, 10, 15, h, 23);
  assert.deepEqual(decidirSemBanco(as(2), memoria, ['x']), []);
  assert.deepEqual(decidirSemBanco(as(13), memoria, ['x']), [BANCO_FORA, 'x']);
  assert.deepEqual(decidirSemBanco(as(19), memoria, ['x']), [BANCO_FORA, 'x'], 'o e-mail não saiu (não lembrou): tenta de novo no horário');
  lembrarSemBanco(memoria, as(13));
  assert.deepEqual(decidirSemBanco(as(19), memoria, ['x']), [], 'mesmo isolado, menos de 24 h');
  assert.deepEqual(decidirSemBanco(as(13) + 24 * H, memoria, []), [BANCO_FORA]);
  assert.deepEqual(decidirSemBanco(as(7), new Map(), []), [BANCO_FORA], 'isolado novo: sem memória, vale o horário');
});
