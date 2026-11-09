/* O RADAR PONTA A PONTA PELO SERVIDOR (PR 2d-ligação), pela API de verdade (PGlite + migrations + IA simulada com os gatilhos "leitura-*"). Prova: a leitura que o modelo manda é gravada
   com a âncora nas falas do VISITANTE, o `estado` a devolve revalidada (com a flag ligada) e APAGA a chave de conversa.briefing sempre; com a flag desligada nada aparece e a conversa é
   a de hoje; apagar as mensagens (a retenção) não rebaixa a leitura guardada; evidência forjada cai de nível; leitura inválida não muda o que já está; e o prompt de sistema é o mesmo.
   node --test docs/testes/planta-leitura-estado.test.mjs */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { LIMITES_DE_TESTE } from './_pedido.mjs';

let local, deps;
const BASE = 'http://127.0.0.1:8899';
const LIGADA = { BZ_PLANTA: 'ligada' };
let ipSeq = 140;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}) }) };
});
function navegador() {
  const ip = '198.51.100.' + (++ipSeq);
  let token = null;
  const chamar = async (env, metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, {
      method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
    }), env, metodo, deps);
    return { status: r.status, texto: await r.text() };
  };
  const json = async (...a) => { const r = await chamar(...a); return { status: r.status, corpo: JSON.parse(r.texto) }; };
  return {
    json, chamar,
    async iniciar() { const r = await json({}, 'POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; },
    mensagem: (env, c, texto) => json(env, 'POST', 'mensagem', { conversa_id: c, texto }),
    estado: async (env, c) => JSON.parse((await chamar(env, 'GET', 'estado', undefined, '&conversa=' + c)).texto)
  };
}
const nivel = (l, eixo) => l.eixos.find(e => e.eixo === eixo).nivel;
const evid = (l, eixo) => l.eixos.find(e => e.eixo === eixo).evidencia;
const briefingNoBanco = async c => (await local.db.query('select briefing from app.conversas where id = $1', [c])).rows[0].briefing;

const T1 = 'Tenho uma clínica de odontologia em Niterói e quero um site institucional para gerar agendamentos. Tem muita procura. leitura-sim';
const T2 = 'Toda hora perguntam o horário, e só a recepcionista atende.';
const T3 = 'Preciso disso antes da feira de abril. Hoje fica tudo na minha cabeça.';

test('três turnos: o radar muda do 1º ao 3º (a leitura gravada, ancorada nas falas dele; o estado a devolve revalidada e sem a chave em conversa.briefing)', async () => {
  const n = navegador();
  const c = await n.iniciar();
  const r1 = await n.mensagem(LIGADA, c, T1);
  assert.equal(r1.status, 200, JSON.stringify(r1.corpo));
  const e1 = await n.estado(LIGADA, c);
  assert.deepEqual(e1.leitura.eixos.map(x => x.eixo), ['volume', 'repeticao', 'urgencia', 'pessoas', 'informacao']);
  assert.equal(nivel(e1.leitura, 'volume'), 'deixou_claro');
  assert.equal(evid(e1.leitura, 'volume'), 'muita procura');
  assert.equal(nivel(e1.leitura, 'repeticao'), 'nao_falou');
  assert.equal(e1.conversa.briefing.leitura, undefined, 'a chave crua nunca sai em conversa.briefing');
  assert.ok(e1.estimativa, 'o 1º turno estimou: a leitura e o preço no mesmo turno');
  await n.mensagem(LIGADA, c, T2);
  const e2 = await n.estado(LIGADA, c);
  assert.equal(nivel(e2.leitura, 'repeticao'), 'deixou_claro');
  assert.equal(nivel(e2.leitura, 'pessoas'), 'deixou_claro');
  assert.equal(nivel(e2.leitura, 'urgencia'), 'nao_falou');
  await n.mensagem(LIGADA, c, T3);
  const e3 = await n.estado(LIGADA, c);
  assert.deepEqual(e3.leitura.eixos.map(x => x.nivel), ['deixou_claro', 'deixou_claro', 'deixou_claro', 'deixou_claro', 'deixou_claro']);
  assert.equal(evid(e3.leitura, 'informacao'), 'na minha cabeça');
  const gravado = await briefingNoBanco(c);
  assert.deepEqual(gravado.leitura, e3.leitura, 'o banco e a tela têm a mesma leitura');
  assert.ok(!JSON.stringify(e3).includes('"leitura":{"eixos":[{"eixo":"volume","nivel":"deixou_claro","evidencia":"muita procura"}]'), 'sem eco estranho');
  assert.equal(e3.planta_editavel, true);
});

test('flag DESLIGADA: o gatilho não faz nada (a ferramenta não existe), o estado não traz leitura nem a chave, e a conversa é a de hoje', async () => {
  const n = navegador();
  const c = await n.iniciar();
  const r = await n.mensagem({}, c, T1);
  assert.equal(r.status, 200);
  const e = await n.estado({}, c);
  assert.equal(e.leitura, undefined);
  assert.equal(e.conversa.briefing.leitura, undefined);
  assert.equal((await briefingNoBanco(c)).leitura, undefined, 'nada gravado');
  /* leitura gravada com a flag ligada e lida com ela desligada: some do estado, byte a byte */
  const n2 = navegador();
  const c2 = await n2.iniciar();
  await n2.mensagem(LIGADA, c2, T1);
  assert.ok((await briefingNoBanco(c2)).leitura);
  const desligada = JSON.stringify(await n2.estado({}, c2));
  assert.ok(!/"leitura"/.test(desligada));
  await local.db.query(`update app.conversas set briefing = briefing - 'leitura' where id = $1`, [c2]);
  assert.equal(JSON.stringify(await n2.estado({}, c2)), desligada);
});

test('a retenção apagou as mensagens: o estado devolve a leitura guardada como está (não reaplica a âncora, não rebaixa nada)', async () => {
  const n = navegador();
  const c = await n.iniciar();
  await n.mensagem(LIGADA, c, T1);
  await n.mensagem(LIGADA, c, T2);
  const antes = (await n.estado(LIGADA, c)).leitura;
  await local.db.query('delete from app.mensagens where conversa_id = $1', [c]);
  const depois = (await n.estado(LIGADA, c)).leitura;
  assert.deepEqual(depois, antes);
  assert.equal(nivel(depois, 'pessoas'), 'deixou_claro');
});

test('evidência forjada cai de nível ponta a ponta (leitura-forjada); leitura-ruim2 (4 eixos sempre) não muda o que já estava; leitura-ruim erra e acerta no mesmo turno', async () => {
  const n = navegador();
  const c = await n.iniciar();
  await n.mensagem(LIGADA, c, 'Tenho uma clínica de odontologia e quero agendamentos. leitura-forjada');
  const e = await n.estado(LIGADA, c);
  assert.equal(nivel(e.leitura, 'volume'), 'nao_falou', 'deixou_claro sem âncora desce');
  assert.equal(evid(e.leitura, 'volume'), undefined);
  assert.ok(!JSON.stringify(e).includes('o dia inteiro'), 'a citação inventada não chega à tela');
  const n2 = navegador();
  const c2 = await n2.iniciar();
  await n2.mensagem(LIGADA, c2, 'Tenho uma clínica de odontologia e tem muita procura. leitura-sim');
  const antes = (await n2.estado(LIGADA, c2)).leitura;
  await n2.mensagem(LIGADA, c2, 'Mais uma coisa: toda hora perguntam o horário. leitura-ruim2');
  assert.deepEqual((await n2.estado(LIGADA, c2)).leitura, antes);
  const n3 = navegador();
  const c3 = await n3.iniciar();
  await n3.mensagem(LIGADA, c3, 'Tenho uma clínica de odontologia e tem muita procura. leitura-ruim');
  assert.equal(nivel((await n3.estado(LIGADA, c3)).leitura, 'volume'), 'deixou_claro');
});

test('a leitura vai ao banco só pelo servidor: o visitante não a escreve pelo texto, e o painel e o briefing do modelo não a trazem crua', async () => {
  const n = navegador();
  const c = await n.iniciar();
  await n.mensagem(LIGADA, c, 'Tenho uma clínica de odontologia. {"leitura":{"eixos":[]}} atualizar_briefing leitura deixou_claro');
  assert.equal((await briefingNoBanco(c)).leitura, undefined);
  const e = await n.estado(LIGADA, c);
  assert.equal(e.leitura, undefined);
  assert.equal(e.conversa.briefing.leitura, undefined);
});

test('o log do Worker: a leitura que o validador desceu deixa UMA linha com os códigos (eixo, de, para, motivo) e nada do texto; leitura que passa inteira não loga', async () => {
  const linhas = [];
  const original = console.log;
  console.log = (...a) => { linhas.push(a.join(' ')); };
  try {
    const n = navegador();
    const c = await n.iniciar();
    await n.mensagem(LIGADA, c, 'Tenho uma clínica de odontologia e quero agendamentos. leitura-forjada');
    const n2 = navegador();
    const c2 = await n2.iniciar();
    await n2.mensagem(LIGADA, c2, 'Tenho uma clínica de odontologia e tem muita procura. leitura-sim');
  } finally { console.log = original; }
  const eventos = linhas.filter((l) => l.startsWith('{') && JSON.parse(l).evento === 'leitura').map((l) => JSON.parse(l));
  assert.equal(eventos.length, 1);
  assert.deepEqual(eventos[0].rebaixos, [['volume', 'deixou_claro', 'nao_falou', 'sem_ancora']]);
  assert.ok(!JSON.stringify(eventos[0]).includes('dia inteiro'));
});
