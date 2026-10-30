/* O ATENDENTE DEPOIS DA RE-REVISÃO (R1 reserva devolvida em toda falha, R2/T1 preço por marca pela API, R4 contatos lotados, R5 interruptor
   fechado por padrão, R6 link do WhatsApp fixo e dado pessoal). PGlite real.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { atender } from '../../api/atendente.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { ErroIA } from '../../api/_ia/provedor.mjs';

let db, rpc, A, ia, ipSeq = 0;
const SITE = 'https://doceria-modelo.com.br';
const BASE = [
  { tipo: 'pergunta', pergunta: 'Qual o horário?', resposta: 'Atendemos de segunda a sexta, das 8h às 18h. Fica na Rua das Flores, 100.' },
  { tipo: 'preco', item: 'Limpeza', preco_centavos: 18000 },
  { tipo: 'preco', item: 'Implante', preco_centavos: 250000 },
  { tipo: 'preco', item: 'Gel', preco_centavos: 5000 }
];
const env = { BZ_LOCAL: '1' };
const prompts = [];
const iaCom = corpo => ({ nome: 'x', async mensagem(p) { prompts.push(p); return corpo(p); } });
const resp = (resposta, extra = {}) => ({ texto: '', json: { resposta, passar_para_pessoa: false, ...extra }, chamadas: [], parada: 'fim', modelo: 'x', uso: {}, custo_usd: 0.0004 });
const chamar = (corpo, { cliente = A, e = env, deps = {}, acao = 'mensagem', ipf } = {}) =>
  atender(new Request('https://beyonzero.com.br/api/atendente?c=' + cliente.publico + '&acao=' + acao, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, 'x-forwarded-for': ipf || '203.0.113.' + (++ipSeq % 250 + 1) }, body: JSON.stringify(corpo) }),
  e, { banco: rpc, ia, segredoFreio: 'seg', max: { ip_hora: 1000 }, ...deps }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
const gasto = async () => (await db.query('select usd, reservado from app.atendente_gasto where cliente_id = $1', [A.id])).rows[0];

before(async () => {
  db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db);
  A = await rpc('atendente_cliente_salvar', { org_slug: 'beyon-zero', nome: 'Doceria Modelo', whatsapp: '5521988887777', privacidade_url: 'https://doceria-modelo.com.br/privacidade',
    dominios: ['doceria-modelo.com.br'], base: BASE, teto_dia_usd: 50 });
  ia = criarSimulada();
});

test('T1/R2 pela API: a pergunta de preço vem pela marca, com qualquer frase em volta, e item de 3 letras funciona', async () => {
  for (const [fala, esperado] of [['quanto custa o gel?', /Gel: R\$ 50,00/], ['qual o valor da limpeza?', /Limpeza: R\$ 180,00/], ['quanto é o implante?', /Implante: R\$ 2\.500,00/]]) {
    const r = await chamar({ texto: fala });
    assert.match(r.j.resposta, esperado, fala);
    assert.equal(r.j.passar_para_pessoa, false, fala);
  }
  for (const frase of ['Custa [[preco:p1]].', 'O valor é [[preco:p1]].', 'Sai por [[preco:p3]].']) {
    const r = await chamar({ texto: 'quanto?' }, { deps: { ia: iaCom(() => resp(frase)) } });
    assert.equal(r.j.passar_para_pessoa, false, frase);
    assert.match(r.j.resposta, /R\$ \d/);
  }
});

test('R2 pela API: a IA que escreve o valor (certo ou errado) cai na resposta fixa com passagem para pessoa', async () => {
  for (const mente of ['O implante custa 180.', 'Implante: 180,00', 'A limpeza custa R$ 100.', 'Custa oito.', 'sem custo', 'Custa ٩٠.', 'ninety reais', 'Gel custa 50.', 'Custa R$ 180,00.']) {
    const r = await chamar({ texto: 'quanto?' }, { deps: { ia: iaCom(() => resp(mente)) } });
    assert.equal(r.j.passar_para_pessoa, true, mente);
    assert.doesNotMatch(r.j.resposta, /custa|180|sem custo/i, mente);
  }
});

test('o prompt enviado à IA não tem valor nenhum', async () => {
  prompts.length = 0;
  await chamar({ texto: 'quanto custa o gel?' }, { deps: { ia: iaCom(() => resp('[[preco:p3]]')) } });
  assert.doesNotMatch(JSON.stringify(prompts), /18000|180,00|2\.?500|50,00|5000|valor_reais/);
});

test('R1: a IA que falha devolve a reserva na hora (nada fica preso)', async () => {
  await db.query('delete from app.atendente_gasto');
  const quebra = iaCom(() => { throw new ErroIA('indisponivel', 'x', 0); });
  const r = await chamar({ texto: 'oi, tudo bem?' }, { deps: { ia: quebra } });
  assert.equal(r.j.passar_para_pessoa, true);
  const g = await gasto();
  assert.deepEqual([Number(g.reservado), Number(g.usd)], [0, 0]);
});

test('R1: a gravação que falha devolve a reserva (e responde 500 sem dado pessoal)', async () => {
  await db.query('delete from app.atendente_gasto');
  const chamadas = [];
  const bancoQuebra = async (nome, p) => { chamadas.push(nome); if (nome === 'atendente_turno_gravar') throw Object.assign(new Error('boom'), { code: 'XX000' }); return rpc(nome, p); };
  const r = await chamar({ texto: 'oi, tudo bem?' }, { deps: { banco: bancoQuebra } });
  assert.equal(r.status, 500);
  assert.ok(chamadas.includes('atendente_turno_desfazer'));
  assert.equal(Number((await gasto()).reservado), 0);
});

test('R5: o interruptor fecha por padrão: valor estranho, outra caixa ou "off" fecham; vazio e "ligado" abrem', async () => {
  for (const v of ['desligado', 'Desligado', 'off', 'OFF', '0', 'nao']) {
    const r = await chamar({}, { e: { ...env, ATENDENTE: v }, acao: 'config' });
    assert.equal(r.status, 404, v);
  }
  for (const v of [undefined, '', 'ligado', 'LIGADO']) {
    const r = await chamar({}, { e: { ...env, ...(v === undefined ? {} : { ATENDENTE: v }) }, acao: 'config' });
    assert.equal(r.status, 200, String(v));
  }
});

test('R6: o link do WhatsApp leva só o resumo fixo; CPF, RG, CEP e e-mail disfarçado não chegam à IA nem ao banco', async () => {
  prompts.length = 0;
  const cap = iaCom(() => resp('Essa eu não sei responder, vou chamar a equipe.', { passar_para_pessoa: true }));
  const r = await chamar({ texto: 'cpf 123  456  789  09, rg 12.345.678-9, cep 24020-000, ana @ gmail . com, tenho diabetes. Aceitam convênio?' }, { deps: { ia: cap } });
  const texto = decodeURIComponent(new URL(r.j.whatsapp_url).searchParams.get('text'));
  assert.equal(texto, 'Olá! Vim pelo site e conversei com o assistente virtual. Pode me ajudar?');
  const tudo = JSON.stringify(prompts) + (await db.query('select texto from app.atendente_mensagens where conversa_id = $1', [r.j.conversa_id])).rows.map(x => x.texto).join(' ');
  assert.doesNotMatch(tudo, /123\s+456|12\.345|24020|ana\s*@/);
});

test('R4: o dia de contatos lotou: o visitante ouve a verdade, o dono é avisado uma vez e o telefone não é aceito repetido sem freio', async () => {
  const avisos = [];
  const deps = { avisar: async (_e, t) => { avisos.push(t); return true; }, max: { ip_hora: 1000, contatos_dia: 2 } };
  const enviar = n => chamar({ nome: 'Fulano ' + n, telefone: '2198888' + String(1000 + n) }, { acao: 'contato', deps, ipf: '198.51.100.' + (30 + n) });
  assert.equal((await enviar(1)).status, 200);
  assert.equal((await enviar(2)).status, 200);
  const cheio = await enviar(3), cheio2 = await enviar(4);
  assert.equal(cheio.status, 429);
  assert.match(cheio.j.erro, /lotou/);
  assert.doesNotMatch(cheio.j.erro, /Você já deixou/);
  assert.equal(cheio2.status, 429);
  assert.deepEqual(avisos, ['atendente_contatos']);
});
