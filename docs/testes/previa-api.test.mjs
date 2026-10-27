/* A API DA PRÉVIA E DO RESTANTE (PR 3b-3; spec §3, §5, §8): a lista de ajustes (redigida, sem CPF, no máximo 1.500 caracteres, 2 listas), aprovar (só o
   cliente), o pagamento do restante (só Pix, só com o site no ar, valor do banco) e o interruptor. Banco real (PGlite) e armazém local.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { criarCenario, BASE } from './_ajustes.mjs';
import { ateEntregaCriada } from './_entrega.mjs';
import { forcarEntrega, PREVIA, SITE, CLIENTE } from './_previa.mjs';
import { ACOES } from '../../api/vendas.mjs';
import { receber } from '../../api/pagamentos.mjs';
import { FRASE_DESLIGADA } from '../../api/_material/interruptor.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';

let local, cen;
before(async () => { local = await montarLocal({ base: BASE }); cen = criarCenario(local); });
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '52998224725' };
const agora = () => new Date().toISOString();
const PRAZO = () => JSON.stringify({ entrada_em: agora(), numero_em: agora(), conta_desde: agora(), pausas: [{ desde: agora(), ate: null }] });
/* leva a entrega criada pela API ao passo pedido (a publicação do dono é da Task 8) */
async function noPasso(deps, passo, extra = {}) {   /* deps: { env: {} } desliga o interruptor; {} deixa ligado (o padrão do cenário) */
  const { n, c } = await ateEntregaCriada(cen, local, deps);
  await forcarEntrega(local.db, { conversa_id: c }, { passo, cliente_captacao: CLIENTE, entrega_ate: '2026-12-01', prazo: PRAZO(), previa_url: PREVIA, previa_em: agora(),
    ...(['no_ar', 'suspensa'].includes(passo) ? { site_url: SITE, no_ar_em: agora() } : {}), ...extra });
  await local.db.query("update app.materiais m set status = 'enviado', enviado_em = now() from app.entregas e where e.id = m.entrega_id and e.conversa_id = $1", [c]);
  return { n, c };
}
const doBanco = async (c, col) => (await local.db.query(`select ${col} as v from app.entregas where conversa_id = $1`, [c])).rows[0].v;
const ajustesDe = async c => (await local.db.query('select a.* from app.entrega_ajustes a join app.entregas e on e.id = a.entrega_id where e.conversa_id = $1', [c])).rows;
const estornarEntrada = c => local.db.query("update app.pagamentos set status = 'estornado' where parcela = 'sinal' and proposta_id = (select proposta_id from app.entregas where conversa_id = $1)", [c]);
/* um banco que roda `antes` quando a função `nome` é chamada (a corrida entre a leitura da tela e a gravação) ou devolve o que o teste manda */
const bancoCom = (nome, { antes, devolve } = {}) => async (fn, p) => {
  if (fn === nome) { if (antes) await antes(p); if (devolve) return devolve; }
  return local.rpc(fn, p);
};
/* a frase que a pessoa lê nunca é a mensagem crua do banco */
const semCru = corpo => assert.ok(!/55000|40001|22023|P0002|exception|passo atual|sinal não está|parâmetros|relógio|rpc /i.test(JSON.stringify(corpo)), JSON.stringify(corpo));

test('as ações existem, são POST, e nenhuma aprova ou publica por conta própria', () => {
  for (const a of ['previa-ajustes', 'previa-aprovar']) assert.ok(Object.hasOwn(ACOES.POST, a), a);
  assert.deepEqual(Object.keys(ACOES.GET).filter(k => /previa|aprov|no-ar|ajuste/.test(k)), []);
  assert.deepEqual(Object.keys(ACOES.POST).filter(k => /^(auto|publicar|no-ar|expirar|aprovar-auto)/.test(k)), [], 'D5: nenhuma ação de aprovação automática');
});

test('a lista de ajustes: 200, a rodada 1, o prazo volta a correr (data nova do servidor) e o texto é REDIGIDO (telefone e e-mail viram marcador)', async () => {
  const { n, c } = await noPasso({}, 'previa');
  const r = await n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 0, texto: 'Trocar a foto da capa. Meu telefone é (21) 99999-0001 e o e-mail a@b.com.' });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.rodada, 1); assert.match(r.corpo.entrega_ate, /^\d{4}-\d{2}-\d{2}$/);
  const gravado = (await ajustesDe(c))[0].texto;
  assert.match(gravado, /Trocar a foto da capa/); assert.ok(!/99999-0001|a@b\.com/.test(gravado), gravado);
  assert.equal(await doBanco(c, 'passo'), 'ajustes');
  const est = (await cen.estado(n, c)).entrega;
  assert.equal(est.passo, 'ajustes'); assert.deepEqual(est.rodadas, { usadas: 1, max: 2 });
  assert.ok(!JSON.stringify(est).includes('Trocar a foto'), 'o texto não volta à tela');
});

test('M3: quem digita exatamente 1.500 caracteres com e-mails no meio não leva 422 (o limite é medido ANTES de redigir) e o gravado nunca passa de 1.500', async () => {
  const { n, c } = await noPasso({}, 'previa');
  const texto = 'Troque a@b.com '.repeat(100).slice(0, 1500);   /* 1.500 caracteres com 100 e-mails curtos: depois de redigir passa de 1.500 */
  assert.equal(texto.length, 1500);
  const r = await n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 0, texto });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const gravado = (await ajustesDe(c))[0].texto;
  assert.ok(gravado.length <= 1500 && /\[e-mail\]/.test(gravado) && !/a@b\.com/.test(gravado), 'redigido e dentro do limite do banco');
});

test('recusas da lista: CPF (422), vazio e longo demais (422), chave a mais (400), rodada que a tela não viu (409), passo errado (409)', async () => {
  const { n, c } = await noPasso({}, 'previa');
  const lista = corpo => n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 0, texto: 'Trocar a cor.', ...corpo });
  const cpf = await lista({ texto: 'meu CPF é 123.456.789-09' });
  assert.equal(cpf.status, 422); assert.match(cpf.corpo.erro, /CPF/);
  assert.equal((await lista({ texto: '   ' })).status, 422);
  assert.equal((await lista({ texto: 'x'.repeat(1501) })).status, 422);
  assert.equal((await lista({ extra: 1 })).status, 400);
  const velha = await lista({ rodada_base: 1 });
  assert.equal(velha.status, 409); assert.match(velha.corpo.erro, /mudou/);
  assert.equal(await doBanco(c, 'passo'), 'previa', 'nada foi gravado');
  const { n: n2, c: c2 } = await noPasso({}, 'producao');
  assert.equal((await n2.chamar('POST', 'previa-ajustes', { conversa_id: c2, rodada_base: 0, texto: 'x' })).status, 409, 'em produção ainda não há prévia');
});

test('texto grande demais (mais de 2.000 caracteres, que o limpador de mensagem descartaria) é 422 mesmo com o contato do site: nunca vira "só o contato" em silêncio', async () => {
  const { n, c } = await noPasso({}, 'previa');
  for (const tam of [1501, 2001, 9000]) {
    const r = await n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 0, texto: 'x'.repeat(tam), whatsapp: '(21) 97716-7944', autorizo: true });
    assert.equal(r.status, 422, 'tam ' + tam); assert.match(r.corpo.erro, /1\.500/);
  }
  assert.equal((await ajustesDe(c)).length, 0, 'nada foi gravado');
});

test('caracteres que o banco não aceita (nulo, substituto solto, uso privado) não dão 500: saem do texto', async () => {
  const { n, c } = await noPasso({}, 'previa');
  const r = await n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 0, texto: 'Trocar\u0000 a cor\ud800 do botão.' });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal((await ajustesDe(c))[0].texto, 'Trocar a cor do botão.');
});

test('M3 (22/10): o WhatsApp e o e-mail do site em campos PRÓPRIOS: normalizados, só com a autorização, gravados à parte do texto; o telefone escrito no texto livre continua apagado', async () => {
  const { n, c } = await noPasso({}, 'previa');
  const r = await n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 0, texto: 'Trocar a foto. Ligue (21) 99999-0001.', whatsapp: '(21) 97716-7944', email: ' Contato@ClinicaSol.com.br ', autorizo: true });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const a = (await ajustesDe(c))[0];
  assert.deepEqual([a.contato_whatsapp, a.contato_email, a.contato_autorizacao_versao], ['+5521977167944', 'contato@clinicasol.com.br', ESQ.AUTORIZACAO.versao]);
  assert.ok(!/99999-0001|97716/.test(a.texto) && /\[telefone\]/.test(a.texto), 'o telefone escrito no texto livre continua apagado: o lugar dele são os campos próprios');
  assert.ok(!/97716|clinicasol/.test(JSON.stringify(await cen.estado(n, c))), 'o contato do site não volta à tela');
});

test('M3: só o contato do site, sem texto, vale; o contato exige autorizo:true (422); formato ou tamanho ruim, 422; tipo errado, 400; nada é gravado', async () => {
  const { n, c } = await noPasso({}, 'previa');
  const lista = corpo => n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 0, texto: 'Trocar a cor.', ...corpo });
  const semAut = await lista({ whatsapp: '(21) 97716-7944' });
  assert.equal(semAut.status, 422); assert.match(semAut.corpo.erro, /autorização/i);
  assert.equal((await lista({ email: 'contato@clinicasol.com.br', autorizo: false })).status, 422);
  for (const ruim of [{ whatsapp: 'abc' }, { whatsapp: '21 87716-7944' }, { whatsapp: 'x'.repeat(200) }, { email: 'a@b' }, { email: 'a b@c.com' }, { email: 'x'.repeat(200) + '@a.com' }]) {
    const r = await lista({ ...ruim, autorizo: true });
    assert.equal(r.status, 422, JSON.stringify(ruim).slice(0, 40)); assert.match(r.corpo.erro, /WhatsApp|e-mail/);
  }
  for (const tipo of [{ whatsapp: 21977167944 }, { email: ['a@b.com'] }, { autorizo: 'sim' }]) assert.equal((await lista(tipo)).status, 400, JSON.stringify(tipo));
  assert.equal((await lista({ texto: '   ' })).status, 422, 'sem texto e sem contato');
  assert.equal(await doBanco(c, 'passo'), 'previa', 'nada foi gravado');
  const so = await lista({ texto: '', whatsapp: '(21) 3333-4444', autorizo: true });
  assert.equal(so.status, 200, JSON.stringify(so.corpo));
  assert.equal((await ajustesDe(c))[0].contato_whatsapp, '+552133334444');
});

test('tipos do corpo: conversa que não é uuid, rodada negativa ou fracionária, texto que não é texto: 400', async () => {
  const { n, c } = await noPasso({}, 'previa');
  const base = { conversa_id: c, rodada_base: 0, texto: 'Trocar a cor.' };
  for (const ruim of [{ conversa_id: 'x' }, { rodada_base: -1 }, { rodada_base: 0.5 }, { rodada_base: '0' }, { texto: 42 }, { texto: null }]) {
    assert.equal((await n.chamar('POST', 'previa-ajustes', { ...base, ...ruim })).status, 400, JSON.stringify(ruim));
  }
  assert.equal((await n.chamar('POST', 'previa-aprovar', { conversa_id: c, extra: 1 })).status, 400);
  assert.equal((await n.chamar('POST', 'previa-aprovar', { conversa_id: 'x' })).status, 400);
  assert.equal(await doBanco(c, 'passo'), 'previa');
});

test('D2: a 3ª lista é recusada com a frase das duas listas e a saída "Outra dúvida?"', async () => {
  const { n, c } = await noPasso({}, 'previa');
  assert.equal((await n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 0, texto: 'Primeira lista.' })).status, 200);
  await forcarEntrega(local.db, { conversa_id: c }, { passo: 'previa' });
  assert.equal((await n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 1, texto: 'Segunda lista.' })).status, 200);
  await forcarEntrega(local.db, { conversa_id: c }, { passo: 'previa' });
  const terceira = await n.chamar('POST', 'previa-ajustes', { conversa_id: c, rodada_base: 2, texto: 'Terceira lista.' });
  assert.equal(terceira.status, 409); assert.match(terceira.corpo.erro, /duas listas.*orçado à parte/i); assert.equal(terceira.corpo.whatsapp, true);
});

test('aprovar: só o cliente, só na prévia; a 2ª vez e o passo errado dão 409; outro visitante 404', async () => {
  const { n, c } = await noPasso({}, 'previa');
  const outro = cen.navegador({ env: { BZ_ENTREGA: 'ligada' } }); await outro.iniciar();
  assert.equal((await outro.chamar('POST', 'previa-aprovar', { conversa_id: c })).status, 404, 'outro aparelho, outra sessão');
  assert.equal(await doBanco(c, 'passo'), 'previa', 'nada mudou');
  assert.equal((await n.chamar('POST', 'previa-aprovar', { conversa_id: c })).status, 200);
  assert.equal(await doBanco(c, 'passo'), 'aprovada');
  assert.equal((await n.chamar('POST', 'previa-aprovar', { conversa_id: c })).status, 409);
  const { n: n2, c: c2 } = await noPasso({}, 'producao');
  assert.equal((await n2.chamar('POST', 'previa-aprovar', { conversa_id: c2 })).status, 409);
});

test('as recusas legíveis do banco viram frase em português: a prévia mudou entre a leitura e a gravação (40001) e a entrada estornada (55000), nunca 500 nem mensagem crua', async () => {
  const tocar = p => local.db.query('update app.entregas set updated_at = clock_timestamp() where conversa_id = $1', [p.conversa_id]);
  for (const [acao, fn, corpo] of [['previa-ajustes', 'vendas_previa_ajustes', { rodada_base: 0, texto: 'Trocar a cor.' }], ['previa-aprovar', 'vendas_previa_aprovar', {}]]) {
    const { n, c } = await noPasso({ banco: bancoCom(fn, { antes: tocar }) }, 'previa');
    const corrida = await n.chamar('POST', acao, { conversa_id: c, ...corpo });
    assert.equal(corrida.status, 409, acao); assert.match(corrida.corpo.erro, /mudou/); semCru(corrida.corpo);
    assert.equal(await doBanco(c, 'passo'), 'previa', 'nada foi gravado: ' + acao);
    /* a entrada estornada: o banco recusa (55000) e a pessoa lê uma frase, com a saída pelo WhatsApp */
    const { n: n2, c: c2 } = await noPasso({}, 'previa');
    await estornarEntrada(c2);
    const estornada = await n2.chamar('POST', acao, { conversa_id: c2, ...corpo });
    assert.equal(estornada.status, 409, acao); assert.equal(typeof estornada.corpo.erro, 'string'); assert.equal(estornada.corpo.whatsapp, true); semCru(estornada.corpo);
    assert.equal(await doBanco(c2, 'passo'), 'previa');
  }
});

test('um motivo de recusa que o servidor não conhece ({ ok: false, motivo }) vira 409 com frase, nunca 200 nem o motivo cru', async () => {
  for (const [acao, fn, corpo] of [['previa-ajustes', 'vendas_previa_ajustes', { rodada_base: 0, texto: 'Trocar a cor.' }], ['previa-aprovar', 'vendas_previa_aprovar', {}]]) {
    const { n, c } = await noPasso({ banco: bancoCom(fn, { devolve: { ok: false, motivo: 'cedo' } }) }, 'previa');
    const r = await n.chamar('POST', acao, { conversa_id: c, ...corpo });
    assert.equal(r.status, 409, acao); assert.equal(typeof r.corpo.erro, 'string'); assert.ok(!/cedo/.test(r.corpo.erro)); assert.ok(!r.corpo.ok);
  }
});

test('interruptor desligado: a lista, a aprovação e o pagamento do restante dão 503 com a saída pelo WhatsApp', async () => {
  const { n, c } = await noPasso({ env: {} }, 'previa');
  for (const acao of ['previa-ajustes', 'previa-aprovar']) {
    const r = await n.chamar('POST', acao, { conversa_id: c, rodada_base: 0, texto: 'x' });
    assert.equal(r.status, 503, acao); assert.equal(r.corpo.erro, FRASE_DESLIGADA); assert.equal(r.corpo.whatsapp, true);
  }
  assert.equal(await doBanco(c, 'passo'), 'previa', 'nada foi gravado');
  const { n: n2, c: c2 } = await noPasso({ env: {} }, 'no_ar');
  const pg = await n2.chamar('POST', 'pagar', { conversa_id: c2, metodo: 'pix', pagador: PAGADOR });
  assert.equal(pg.status, 503); assert.equal(pg.corpo.erro, FRASE_DESLIGADA);
});

test('o restante: só com o site no ar (409 antes), só por Pix (400 com cartão), valor = total − entrada; paga → pedido concluído, conversa encerrada', async () => {
  const { n, c } = await noPasso({}, 'aprovada');
  const antes = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR });
  assert.equal(antes.status, 409); assert.match(antes.corpo.erro, /site estiver no ar/);
  await forcarEntrega(local.db, { conversa_id: c }, { passo: 'no_ar', site_url: SITE, no_ar_em: agora() });
  const cartao = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'cartao', pagador: PAGADOR });
  assert.equal(cartao.status, 400, 'o restante é só Pix'); assert.match(cartao.corpo.erro, /Pix/, 'a frase é a do servidor (o banco também recusa, mas com "Dados inválidos")');
  /* a parcela e o valor são do banco: o que o navegador mandar a mais não conta */
  const pg = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR, parcela: 'sinal', valor: 1 });
  assert.equal(pg.status, 200, JSON.stringify(pg.corpo));
  assert.equal(pg.corpo.pagamento.parcela, 'saldo');
  const q = (await local.db.query("select (pr.valor_total - s.valor) as saldo from app.propostas pr join app.pagamentos s on s.proposta_id = pr.id and s.parcela = 'sinal' join app.conversas cv on cv.id = pr.conversa_id where cv.id = $1", [c])).rows[0];
  assert.equal(Number(pg.corpo.pagamento.valor), Number(q.saldo), 'o valor é do banco: total − entrada');
  await receber(new Request(BASE + '/api/pagamentos?acao=simular', { method: 'POST', body: JSON.stringify({ tentativa_id: pg.corpo.tentativa.id }), headers: { 'content-type': 'application/json' } }), {}, { banco: local.rpc });
  const est = await cen.estado(n, c);
  assert.equal(est.entrega.passo, 'concluida'); assert.equal(est.conversa.etapa, 'encerrada');
});

test('o restante com a entrega ENCERRADA (desistência) não abre: a frase é a do pedido encerrado, nada é cobrado; suspensa cobra como no ar', async () => {
  const { n, c } = await noPasso({}, 'encerrada', { encerrada_em: agora(), encerrada_motivo: 'desistencia' });
  const r = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR });
  assert.equal(r.status, 409); assert.match(r.corpo.erro, /encerrado/); assert.equal(r.corpo.whatsapp, true); assert.ok(!/site estiver no ar/.test(r.corpo.erro));
  assert.equal((await local.db.query("select count(*)::int n from app.pagamentos where parcela = 'saldo' and proposta_id = (select proposta_id from app.entregas where conversa_id = $1)", [c])).rows[0].n, 0, 'nada foi cobrado');
  const { n: n2, c: c2 } = await noPasso({}, 'suspensa', { suspensa_em: agora() });
  const s = await n2.chamar('POST', 'pagar', { conversa_id: c2, metodo: 'pix', pagador: PAGADOR });
  assert.equal(s.status, 200, JSON.stringify(s.corpo)); assert.equal(s.corpo.pagamento.parcela, 'saldo');
});

test('o restante com a entrada estornada não abre e a pessoa lê uma frase (não a mensagem do banco)', async () => {
  const { n, c } = await noPasso({}, 'no_ar');
  await estornarEntrada(c);
  const r = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: PAGADOR });
  assert.equal(r.status, 409); assert.equal(typeof r.corpo.erro, 'string'); semCru(r.corpo);
});
