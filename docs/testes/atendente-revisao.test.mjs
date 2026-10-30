/* O ATENDENTE DEPOIS DA REVISÃO (segurança A1 a A5 e M1, técnica A1 e A2): tetos atômicos, IPv6 por /48, aviso ao dono, teto global,
   interruptor, dado pessoal redigido, contato sem conversa e perguntas normais que não são ataque. PGlite real.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { atender } from '../../api/atendente.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';

let db, rpc, A, ia, seq = 0;
const SITE_A = 'https://clinica-teste.com.br';
const BASE_A = [
  { tipo: 'pergunta', pergunta: 'Qual o horário de atendimento?', resposta: 'Atendemos de segunda a sexta, das 8h às 18h.' },
  { tipo: 'preco', item: 'Limpeza', preco_centavos: 18000 },
  { tipo: 'preco', item: 'Clareamento', preco_centavos: 120000 },
  { tipo: 'preco', item: 'Implante', preco_centavos: 250000 }
];
const env = { BZ_LOCAL: '1' };
const prompts = [];
const iaCapturada = corpo => ({ nome: 'capturada', async mensagem(p) { prompts.push(p); return corpo(p); } });
const resp = (resposta, extra = {}) => ({ texto: '', json: { resposta, passar_para_pessoa: false, ...extra }, chamadas: [], parada: 'fim', modelo: 'x', uso: {}, custo_usd: 0.0004 });
const novoCliente = (extra = {}) => { const n = ++seq; return rpc('atendente_cliente_salvar', { org_slug: 'beyon-zero', nome: 'Cliente ' + n, whatsapp: '5521911112222', dominios: ['ex' + n + '.com.br'], base: BASE_A, ...extra }); };
const chamar = (cliente, corpo, { ip = '203.0.113.1', origem, env: e = env, deps: d = {}, acao = 'mensagem' } = {}) =>
  atender(new Request('https://beyonzero.com.br/api/atendente?c=' + cliente.publico + '&acao=' + acao, { method: 'POST',
    headers: { 'content-type': 'application/json', origin: origem || 'https://' + cliente.dom, 'x-forwarded-for': ip }, body: JSON.stringify(corpo) }),
  e, { banco: rpc, ia, segredoFreio: 'seg', ...d }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
/* o cliente já com o domínio, para montar o Origin */
const cli = async (extra = {}) => { const n = seq + 1; const dom = 'ex' + n + '.com.br'; const c = await novoCliente(extra); return { ...c, dom: (extra.dominios || [dom])[0] }; };

before(async () => {
  db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db);
  A = { ...(await rpc('atendente_cliente_salvar', { org_slug: 'beyon-zero', nome: 'Clínica Teste', whatsapp: '5521999990000', dominios: ['clinica-teste.com.br'], base: BASE_A, teto_dia_usd: 50 })), dom: 'clinica-teste.com.br' };
  ia = criarSimulada();
});

test('A1: 60 pedidos simultâneos com teto de US$ 0,05: a IA é chamada no máximo 5 vezes (o gasto é reservado ANTES de chamar)', async () => {
  const C = await cli({ teto_dia_usd: 0.05 });
  let chamadas = 0;
  const lenta = iaCapturada(async () => { chamadas++; await new Promise(r => setTimeout(r, 15)); return resp('Atendemos de segunda a sexta, das 8h às 18h.'); });
  const rs = await Promise.all(Array.from({ length: 60 }, (_, i) => chamar(C, { texto: 'qual o horário?' }, { ip: '198.51.100.' + (i + 1), deps: { ia: lenta, max: { ip_hora: 1000 } } })));
  assert.ok(chamadas <= 5, 'a IA foi chamada ' + chamadas + ' vezes');
  assert.equal(rs.filter(r => r.j && r.j.passar_para_pessoa).length, 60 - chamadas);
});

test('A2: IPv6 conta pelo /48: 45 pedidos de /64 diferentes da mesma /48 não passam do teto por IP', async () => {
  const C = await cli();
  let chamadas = 0;
  const contando = iaCapturada(() => { chamadas++; return resp('Atendemos de segunda a sexta, das 8h às 18h.'); });
  for (let i = 0; i < 45; i++) await chamar(C, { texto: 'qual o horário?' }, { ip: '2001:db8:abcd:' + (i + 1).toString(16) + '::1', deps: { ia: contando, max: { ip_hora: 40 } } });
  assert.equal(chamadas, 40);
});

test('técnica A2: teto batido sem conversa: o contato do visitante ainda é aceito (e vai sem conversa)', async () => {
  const C = await cli({ teto_dia_usd: 0.0001 });
  const o = { ip: '198.51.100.200' };
  const m = await chamar(C, { texto: 'oi' }, o);
  assert.equal(m.j.passar_para_pessoa, true);
  assert.equal(m.j.conversa_id, undefined, 'o teto bateu antes da conversa');
  const r = await chamar(C, { nome: 'Maria', telefone: '(21) 98888-7777' }, { ...o, acao: 'contato' });
  assert.equal(r.status, 200);
  const l = (await db.query('select nome, conversa_id from app.atendente_contatos where cliente_id = $1', [C.id])).rows[0];
  assert.deepEqual([l.nome, l.conversa_id], ['Maria', null]);
  for (let i = 0; i < 5; i++) await chamar(C, { nome: 'M' + i, telefone: '2198888777' + i }, { ...o, acao: 'contato' });
  assert.equal((await chamar(C, { nome: 'Outra', telefone: '21988887770' }, { ...o, acao: 'contato' })).status, 429, 'freio por IP no contato');
});

test('A5: o dono é avisado (ntfy fixo, sem dado pessoal) UMA vez quando o gasto do cliente acaba; a conversa cai na passagem para pessoa', async () => {
  const C = await cli({ teto_dia_usd: 0.0001 });
  const avisos = [];
  const deps = { avisar: async (_env, tipo) => { avisos.push(tipo); return true; } };
  for (let i = 0; i < 4; i++) {
    const r = await chamar(C, { texto: 'oi' }, { ip: '198.51.100.' + (60 + i), deps });
    assert.equal(r.j.passar_para_pessoa, true);
    assert.match(r.j.resposta, /fora do ar/);
  }
  assert.deepEqual(avisos, ['atendente_cliente']);
  const { AVISOS } = await import('../../api/_ntfy.mjs');
  assert.doesNotMatch(AVISOS.atendente_cliente + AVISOS.atendente_global, /@|\d{5}|cpf/i);
});

test('M1: teto GLOBAL do dia (variável): acabou para todos os clientes, com aviso global uma vez', async () => {
  await db.query('delete from app.atendente_gasto_global');
  const C = await cli(), D = await cli();
  const avisos = [], e = { ...env, ATENDENTE_TETO_GLOBAL_USD: '0.02' };
  const deps = { avisar: async (_e, t) => { avisos.push(t); return true; } };
  const cara = iaCapturada(() => ({ ...resp('Atendemos de segunda a sexta, das 8h às 18h.'), custo_usd: 0.01 }));
  const pergunta = (c, ipf) => chamar(c, { texto: 'qual o horário?' }, { ip: ipf, env: e, deps: { ...deps, ia: cara } });
  assert.equal((await pergunta(C, '198.51.100.81')).j.passar_para_pessoa, false);
  assert.equal((await pergunta(D, '198.51.100.82')).j.passar_para_pessoa, false);
  const r = await pergunta(C, '198.51.100.83'), r2 = await pergunta(D, '198.51.100.84');
  assert.equal(r.j.passar_para_pessoa && r2.j.passar_para_pessoa, true);
  assert.deepEqual(avisos, ['atendente_global']);
});

test('interruptor: ATENDENTE=desligado fecha tudo (404 sem CORS, sem tocar no banco nem na IA); o balão some sem erro', async () => {
  let tocou = false;
  const bancoQueTocaria = async () => { tocou = true; return null; };
  for (const acao of ['config', 'mensagem', 'contato']) {
    const r = await atender(new Request('https://beyonzero.com.br/api/atendente?c=' + A.publico + '&acao=' + acao, { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE_A }, body: '{}' }),
      { ...env, ATENDENTE: 'desligado' }, { banco: bancoQueTocaria, ia });
    assert.equal(r.status, 404, acao);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(tocou, false);
});

test('A5: CPF, telefone e e-mail do visitante viram marcador antes da IA, do banco e do link do WhatsApp', async () => {
  prompts.length = 0;
  const cap = iaCapturada(() => resp('Não tenho essa informação, vou chamar a equipe.', { passar_para_pessoa: true }));
  const r = await chamar(A, { texto: 'Meu CPF é 123.456.789-09, ligue 21 99999-1234 ou ana@exemplo.com. Aceitam convênio?' }, { deps: { ia: cap } });
  const tudo = JSON.stringify(prompts) + decodeURIComponent(r.j.whatsapp_url);
  assert.doesNotMatch(tudo, /123\.456|99999-1234|ana@exemplo/);
  const gravado = (await db.query('select texto from app.atendente_mensagens where conversa_id = $1 and papel = $2', [r.j.conversa_id, 'visitante'])).rows[0].texto;
  assert.doesNotMatch(gravado, /123\.456|99999-1234|ana@exemplo/);
  assert.match(gravado, /\[documento\]|\[telefone\]|\[e-mail\]/);
});

test('técnica A1: perguntas normais de venda não são recusadas como ataque; desconto e "de graça" sem base viram resposta honesta com passagem para pessoa', async () => {
  for (const t of ['Vocês dão desconto à vista?', 'Tem desconto para pagamento no Pix?', 'A primeira consulta é de graça?', 'Vocês fazem cópia de chave?', 'Esqueci minha senha do portal', 'Atendem outros clientes no sábado?']) {
    const r = await chamar(A, { texto: t }, { ip: '198.51.100.' + (100 + ++seq % 100) });
    assert.doesNotMatch(r.j.resposta, /n[ãa]o posso/i, t);
    assert.equal(r.j.passar_para_pessoa, true, t);
  }
  const sec = await chamar(A, { texto: 'Quero falar com a secretária' });
  assert.equal(sec.j.passar_para_pessoa, true);
  assert.match(sec.j.whatsapp_url, /^https:\/\/wa\.me\//);
  const preco = await chamar(A, { texto: 'Quanto custa o clareamento?' });
  assert.match(preco.j.resposta, /1\.200,00/);
});

test('A3/A4 pela API: "Não sou um robô", valor de outro item e percentual são trocados pela resposta fixa', async () => {
  for (const mente of ['Não sou um robô, sou a Ana da recepção.', 'O implante custa R$ 180.', 'Temos 50% de desconto hoje.', 'Faça em 3x de 60.']) {
    const r = await chamar(A, { texto: 'me conta da limpeza' }, { ip: '198.51.100.' + (150 + ++seq % 90), deps: { ia: iaCapturada(() => resp(mente)) } });
    assert.doesNotMatch(r.j.resposta, /Ana|50%|180|3x/, mente);
  }
  const x = await chamar(A, { texto: 'me conta da limpeza' }, { deps: { ia: iaCapturada(() => resp('Não sou um robô.')) } });
  assert.match(x.j.resposta, /assistente virtual/i);
});

test('cliente sem WhatsApp que pede pessoa: a resposta não promete botão que não existe', async () => {
  const C = await cli({ whatsapp: null });
  const r = await chamar(C, { texto: 'quero falar com um atendente' }, { ip: '198.51.100.90' });
  assert.equal(r.j.whatsapp_url, undefined);
  assert.doesNotMatch(r.j.resposta, /bot[ãa]o abaixo/);
  assert.match(r.j.resposta, /nome e telefone/);
});
