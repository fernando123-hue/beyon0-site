/* OS EXTRAS NA CONVERSA COM O ZERO pela API (dono, 24/11, opção A): logo depois do preço do Zero, 2 ou 3 extras como cartões; um toque
   inclui, outro tira, e o preço que vale para o pedido é o novo. Banco real (PGlite + migrations) e IA simulada.
   O preço é SEMPRE do servidor: a tela manda só a chave do extra e se quer incluir; o servidor confere a chave contra as sugestões
   que ele mesmo montou para esta conversa (ramo e formato da estimativa gravada), calcula pelo motor e regrava a estimativa. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { LIMITES_DE_TESTE, detalhesEConfirmar } from './_pedido.mjs';

const R = createRequire(import.meta.url)('../../js/orcamento-rotulos.js');
let local, deps, ipSeq = 0;
let duranteOTurno = null;   /* (a corrida: o que acontece enquanto o modelo pensa, no meio do turno do Zero) */
const BASE = 'http://127.0.0.1:8899';
before(async () => {
  local = await montarLocal({ base: BASE });
  const sim = criarSimulada();
  const ia = { ...sim, mensagem: async p => { if (duranteOTurno) { const f = duranteOTurno; duranteOTurno = null; await f(); } return sim.mensagem(p); } };
  deps = { banco: local.rpc, visitantes: local.auth, ia, direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE };
});
function navegador() {
  const ip = '198.51.100.' + (10 + (++ipSeq));
  let token = null;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}
const TOQUES = { ramo: 'saude', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'parte' };
/* (a dor tocada faz do 1º turno o do valor: o Zero simulado estima o institucional, sem extras, R$ 7.900 na tabela local) */
async function comPrecoDoZero(n, toques = TOQUES) {
  const c = await n.iniciar();
  const t = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Pelo Instagram; Respondo preço e horário na mão', respostas: { ...toques, situacao: ['instagram', 'responde_na_mao'], responde: 'dor' } });
  assert.equal(t.status, 200, JSON.stringify(t.corpo));
  assert.ok(t.corpo.estimativa, 'o Zero deu o preço');
  return c;
}
const estadoDe = async (n, c) => (await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo;
const listar = (n, c) => n.chamar('POST', 'extras-sugeridos', { conversa_id: c });
const alternar = (n, c, corpo) => n.chamar('POST', 'alternar-extra', { conversa_id: c, ...corpo });

test('as sugestões: 2 ou 3 extras do ramo, com o quanto cada um soma ao total (calculado pelo motor), e o total de agora', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const r = await listar(n, c);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.extras.map(x => x.chave), ['agendamento', 'textos', 'imagens'], 'saúde: agendamento, textos e imagens (as sugestões do catálogo)');
  assert.equal(r.corpo.total, 7900);
  assert.equal(Number(r.corpo.entrada), 3160, 'a entrada de agora (40%) vem junto do total, calculada pelo servidor');
  const por =Object.fromEntries(r.corpo.extras.map(x => [x.chave, x]));
  assert.equal(por.agendamento.valor, 450);
  assert.equal(por.imagens.valor, 250);
  assert.equal(por.textos.valor, 1750, 'textos são por página: as 5 do institucional, o que de fato soma ao total');
  assert.ok(r.corpo.extras.every(x => x.incluido === false && typeof x.nome === 'string' && x.nome && typeof x.frase === 'string'));
  assert.equal(por.agendamento.indicado, true, 'o do ramo vem indicado');
  assert.equal(por.textos.indicado, false);
  assert.ok(typeof r.corpo.versao === 'string' || typeof r.corpo.versao === 'number');
});

test('quem já tem os textos não recebe a sugestão de textos', async () => {
  const n = navegador(), c = await comPrecoDoZero(n, { ...TOQUES, material: 'tenho' });
  const r = await listar(n, c);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.extras.map(x => x.chave), ['agendamento', 'imagens']);
});

test('incluir e tirar: o servidor recalcula, regrava a estimativa (a que o pedido usa) e devolve as sugestões atualizadas', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao } = (await listar(n, c)).corpo;
  const com = await alternar(n, c, { chave: 'agendamento', incluir: true, versao });
  assert.equal(com.status, 200, JSON.stringify(com.corpo));
  assert.equal(com.corpo.estimativa.valor_total, 8350);
  assert.equal(com.corpo.total, 8350);
  assert.equal(Number(com.corpo.entrada), Number(com.corpo.estimativa.sinal), 'a entrada do bloco é o sinal da estimativa nova');
  assert.equal(Number(com.corpo.entrada), 3340);
  assert.equal(com.corpo.extras.find(x => x.chave === 'agendamento').incluido, true);
  assert.equal(com.corpo.extras.find(x => x.chave === 'agendamento').valor, 450, 'o valor do incluído é o quanto ele pesa no total');
  const e1 = await estadoDe(n, c);
  assert.equal(Number(e1.estimativa.valor_total), 8350, 'a estimativa gravada é a nova');
  assert.equal(e1.estimativa.fatores.adicionais.agendamento, 1);
  assert.equal(e1.estimativa.fatores.formato, 'institucional', 'o formato do Zero fica');
  assert.deepEqual(com.corpo.fatores, e1.estimativa.fatores, 'a tela sabe que já está em dia com a estimativa gravada');
  const sem = await alternar(n, c, { chave: 'agendamento', incluir: false, versao });
  assert.equal(sem.status, 200, JSON.stringify(sem.corpo));
  assert.equal(sem.corpo.estimativa.valor_total, 7900);
  assert.equal((await estadoDe(n, c)).estimativa.fatores.adicionais.agendamento, undefined);
  const textos = await alternar(n, c, { chave: 'textos', incluir: true, versao });
  assert.equal(textos.corpo.estimativa.valor_total, 7900 + 1750, 'textos das 5 páginas');
  assert.equal((await estadoDe(n, c)).estimativa.fatores.adicionais.textos, 5);
});

test('o mesmo pedido de novo (duplo toque) não grava outra estimativa', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao } = (await listar(n, c)).corpo;
  await alternar(n, c, { chave: 'imagens', incluir: true, versao });
  const antes = (await local.db.query('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).rows[0].n;
  const de2 = await alternar(n, c, { chave: 'imagens', incluir: true, versao });
  assert.equal(de2.status, 200, JSON.stringify(de2.corpo));
  assert.equal(de2.corpo.estimativa.valor_total, 8150);
  assert.equal((await local.db.query('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).rows[0].n, antes);
});

test('a borda: só uma chave das sugestões desta conversa, "incluir" sim ou não, a versão da tabela que a tela viu', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao } = (await listar(n, c)).corpo;
  for (const chave of ['blog', '__proto__', 'constructor', 'loja_virtual', 'atendente_ia_essencial', 'nao_existe', '', 42, null, { a: 1 }, ['agendamento']]) {
    const r = await alternar(n, c, { chave, incluir: true, versao });
    assert.equal(r.status, 400, 'chave ' + JSON.stringify(chave) + ': ' + JSON.stringify(r.corpo));
  }
  for (const incluir of ['sim', 1, null, undefined]) {
    const r = await alternar(n, c, { chave: 'agendamento', incluir, versao });
    assert.equal(r.status, 400, 'incluir ' + JSON.stringify(incluir));
  }
  const velha = await alternar(n, c, { chave: 'agendamento', incluir: true, versao: 'outra' });
  assert.equal(velha.status, 409);
  assert.ok(velha.corpo.versao_nova !== undefined, 'a versão de agora vai junto, para a tela listar de novo');
  assert.equal(Number((await estadoDe(n, c)).estimativa.valor_total), 7900, 'nada gravado nas recusas');
  const conversaInvalida = await n.chamar('POST', 'alternar-extra', { conversa_id: 'x', chave: 'agendamento', incluir: true, versao });
  assert.equal(conversaInvalida.status, 400);
});

test('sem o preço do Zero ainda, ou na conversa de outro visitante: nada', async () => {
  const n = navegador(), c = await n.iniciar();
  assert.equal((await listar(n, c)).status, 409);
  assert.equal((await alternar(n, c, { chave: 'agendamento', incluir: true, versao: 1 })).status, 409);
  const dono = navegador(), cDono = await comPrecoDoZero(dono);
  const outro = navegador(); await outro.iniciar();
  assert.equal((await listar(outro, cDono)).status, 404);
  assert.equal((await alternar(outro, cDono, { chave: 'agendamento', incluir: true, versao: 1 })).status, 404);
});

/* (dinheiro transparente) o que ELA escolheu pelos cartões vale até ela tocar de novo: uma estimativa nova do Zero (outra mensagem) não tira o
   extra que ela incluiu nem põe de volta o que ela tirou. O valor que o Zero escreve (os marcadores) já sai com a escolha dela */
test('o extra que ela incluiu pelos cartões não some quando o Zero estima de novo', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao } = (await listar(n, c)).corpo;
  assert.equal((await alternar(n, c, { chave: 'agendamento', incluir: true, versao })).corpo.estimativa.valor_total, 8350);
  const t = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Fica em Niterói' });
  assert.equal(t.status, 200, JSON.stringify(t.corpo));
  assert.ok(t.corpo.estimativa, 'o Zero simulado estimou de novo (sem o agendamento, pelo que ele leu)');
  assert.equal(t.corpo.estimativa.valor_total, 8350, 'o agendamento que ela incluiu continua');
  const e = await estadoDe(n, c);
  assert.equal(e.estimativa.fatores.adicionais.agendamento, 1);
  assert.equal((await listar(n, c)).corpo.extras.find(x => x.chave === 'agendamento').incluido, true, 'o cartão segue marcado');
});

test('o extra que ela tirou pelos cartões não volta quando o Zero estima de novo com ele', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  /* (o Zero simulado põe o agendamento quando a conversa fala dele) */
  const t1 = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Preciso de agendamento online pelo site' });
  assert.equal(t1.corpo.estimativa.valor_total, 8350, 'o Zero incluiu o agendamento');
  const { versao } = (await listar(n, c)).corpo;
  assert.equal((await alternar(n, c, { chave: 'agendamento', incluir: false, versao })).corpo.estimativa.valor_total, 7900);
  const t2 = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Fica em Niterói' });
  assert.equal(t2.status, 200, JSON.stringify(t2.corpo));
  assert.equal(t2.corpo.estimativa.valor_total, 7900, 'o agendamento que ela tirou não volta');
  assert.equal((await estadoDe(n, c)).estimativa.fatores.adicionais.agendamento, undefined);
});

test('depois dos detalhes do pedido, o pacote está fechado: os extras não mudam mais o preço', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao } = (await listar(n, c)).corpo;
  assert.equal((await alternar(n, c, { chave: 'agendamento', incluir: true, versao })).status, 200);
  await detalhesEConfirmar(n.chamar, local.rpc, c, { aceite_versao: R.ACEITE.versao });
  const e = await estadoDe(n, c);
  assert.equal(Number(e.estimativa.valor_total), 8350, 'o pedido foi com o preço dos extras');
  const depois = await alternar(n, c, { chave: 'agendamento', incluir: false, versao });
  assert.equal(depois.status, 409);
  assert.match(depois.corpo.erro, /pedido já foi feito/i, 'o recado certo: o pedido já foi feito, os extras ficaram como estavam');
  const lista = await listar(n, c);
  assert.equal(lista.status, 409);
  assert.match(lista.corpo.erro, /pedido já foi feito/i);
});

/* (revisão de segurança M1) cada toque grava uma estimativa e o banco aceita no máximo 30 por conversa: o freio dos toques fica bem abaixo, para
   sobrar para o Zero e para o pacote, e o teto do banco vira um recado humano */
test('o freio dos toques: 12 por hora por conversa, abaixo do teto de 30 estimativas do banco', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao } = (await listar(n, c)).corpo;
  for (let i = 0; i < 12; i++) {
    const r = await alternar(n, c, { chave: 'agendamento', incluir: i % 2 === 0, versao });
    assert.equal(r.status, 200, 'toque ' + (i + 1) + ': ' + JSON.stringify(r.corpo));
  }
  const r13 = await alternar(n, c, { chave: 'agendamento', incluir: true, versao });
  assert.equal(r13.status, 429);
  assert.match(r13.corpo.erro, /Muitos toques/);
  const t = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Fica em Niterói' });
  assert.equal(t.status, 200, 'o Zero ainda consegue estimar: ' + JSON.stringify(t.corpo));
  assert.ok(t.corpo.estimativa);
});

test('o teto de estimativas do banco (30 por conversa) vira um recado curto, não erro genérico', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao } = (await listar(n, c)).corpo;
  await local.db.query(`insert into app.estimativas (org_id, conversa_id, regras_id, fatores, valor_total, sinal, prazo_dias, fase, detalhes)
    select e.org_id, e.conversa_id, e.regras_id, e.fatores, e.valor_total, e.sinal, e.prazo_dias, e.fase, e.detalhes
    from app.estimativas e cross join generate_series(1, 29) where e.conversa_id = $1`, [c]);
  const r = await alternar(n, c, { chave: 'agendamento', incluir: true, versao });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.match(r.corpo.erro, /recado/i);
  assert.doesNotMatch(r.corpo.erro, /Limite atingido para esta conversa/);
  assert.equal(r.corpo.recado, true, 'o botão do recado aparece');
});

/* (revisões técnica 1 e de segurança B1) o toque que entra ENQUANTO o Zero pensa não se perde: ao gravar a estimativa do turno, o servidor relê as
   escolhas de agora (não as do começo do turno) */
test('a corrida: o toque no meio do turno do Zero vale na estimativa que o turno grava', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao } = (await listar(n, c)).corpo;
  duranteOTurno = async () => {
    const r = await alternar(n, c, { chave: 'agendamento', incluir: true, versao });
    assert.equal(r.status, 200, 'o toque entrou no meio do turno: ' + JSON.stringify(r.corpo));
  };
  const t = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Fica em Niterói' });
  assert.equal(duranteOTurno, null, 'o toque aconteceu durante o turno');
  assert.equal(t.status, 200, JSON.stringify(t.corpo));
  assert.equal(t.corpo.estimativa.valor_total, 8350, 'a estimativa do turno já leva o toque');
  const e = await estadoDe(n, c);
  assert.equal(e.estimativa.fatores.adicionais.agendamento, 1, 'o agendamento que ela tocou continua gravado');
  assert.equal((await listar(n, c)).corpo.extras.find(x => x.chave === 'agendamento').incluido, true);
});

/* (revisão de segurança B2) o que está em preparo nunca vira sugestão nem passa no alternar, e nada é gravado */
test('chave em preparo: nem sugestão, nem toque; nada gravado', async () => {
  const n = navegador(), c = await comPrecoDoZero(n);
  const { versao, extras } = (await listar(n, c)).corpo;
  const emPreparo = ['atendente_ia_essencial', 'atendente_ia_profissional', 'atendente_ia_avancado'];
  assert.ok(extras.every(x => !emPreparo.includes(x.chave)));
  const antes = (await local.db.query('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).rows[0].n;
  for (const chave of emPreparo) assert.equal((await alternar(n, c, { chave, incluir: true, versao })).status, 400, chave);
  assert.equal((await local.db.query('select count(*)::int n from app.estimativas where conversa_id = $1', [c])).rows[0].n, antes);
});
