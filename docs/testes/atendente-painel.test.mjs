/* O PAINEL DO ATENDENTE (api/_atendente/painel.mjs + api/painel.mjs): criar cliente, editar base e domínios, ler conversas e contatos.
   Validação no servidor (domínio sem curinga, cor, número, preço em reais), isolamento por cliente e saída como texto puro (JSON, nunca HTML).
   Banco PGlite real.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './_banco.mjs';
import { rpcDe, prepararOrg } from './_entrega.mjs';
import { criarAcoesAtendente, validarCliente } from '../../api/_atendente/painel.mjs';
import { ACOES_PAINEL } from '../../api/painel.mjs';

let db, rpc, acoes;
const lerJ = async r => ({ status: r.status, j: await r.json() });
const valido = (extra = {}) => ({ nome: 'Padaria Teste', whatsapp: '(21) 99999-0000', dominios: ['Padaria.com.br', 'www.padaria.com.br'],
  cor: '#112233', cor_texto: '#ffffff', teto_dia_usd: 2, ativo: true,
  base: [{ tipo: 'pergunta', pergunta: 'Abre domingo?', resposta: 'Sim, até meio-dia.' }, { tipo: 'preco', item: 'Pão de queijo', valor: '4,50' }], ...extra });
before(async () => { db = await novoBanco(); rpc = rpcDe(db); await prepararOrg(db); acoes = criarAcoesAtendente(rpc, 'beyon-zero'); });

test('as ações do painel estão na lista conferida pelos testes de CPU', () => {
  for (const k of ['fila-atendente', 'atendente', 'atendente-conversas']) assert.ok(ACOES_PAINEL.GET.includes(k), k);
  assert.ok(ACOES_PAINEL.POST.includes('atendente_salvar'));
});

test('validarCliente normaliza (domínio minúsculo, só dígitos no número, preço em reais para centavos) e recusa o resto', () => {
  const v = validarCliente(valido());
  assert.equal(v.erro, undefined);
  assert.deepEqual(v.dados.dominios, ['padaria.com.br', 'www.padaria.com.br']);
  assert.equal(v.dados.whatsapp, '21999990000');
  assert.equal(v.dados.base[1].preco_centavos, 450);
  const ruins = [{ nome: '' }, { nome: 'x'.repeat(81) }, { dominios: ['*.com'] }, { dominios: ['https://a.com'] }, { dominios: ['a.com/x'] }, { dominios: Array(11).fill('a.com') },
    { cor: 'red' }, { cor: '#12345' }, { whatsapp: '123' }, { teto_dia_usd: -1 }, { teto_dia_usd: 1000 }, { teto_dia_usd: 'x' },
    { privacidade_url: 'http://a.com/p' }, { privacidade_url: 'javascript:alert(1)' },
    { base: [{ tipo: 'preco', item: 'X', valor: 'barato' }] }, { base: [{ tipo: 'preco', item: 'X', valor: '-5' }] }, { base: [{ tipo: 'pergunta', pergunta: '', resposta: 'a' }] },
    { base: [{ tipo: 'outro' }] }, { base: 'texto' }, { id: 'nao-uuid' }, { ativo: 'sim' }];
  for (const r of ruins) assert.ok(validarCliente(valido(r)).erro, JSON.stringify(r).slice(0, 50));
});

test('criar, listar, editar e ler o cliente; o id público vem no resultado', async () => {
  const c = await lerJ(await acoes.salvar(valido()));
  assert.equal(c.status, 200);
  assert.match(c.j.publico, /^at_[0-9a-f]{32}$/);
  const lista = await lerJ(await acoes.lista());
  assert.ok(lista.j.itens.some(i => i.id === c.j.id && i.nome === 'Padaria Teste'));
  const ed = await lerJ(await acoes.cliente(c.j.id));
  assert.deepEqual(ed.j.dominios, ['padaria.com.br', 'www.padaria.com.br']);
  assert.equal(ed.j.base.find(b => b.tipo === 'preco').preco_centavos, 450);
  const novo = await lerJ(await acoes.salvar({ ...valido({ nome: 'Padaria Nova', dominios: ['nova.com.br'], base: [] }), id: c.j.id }));
  assert.equal(novo.j.publico, c.j.publico, 'o id público não muda ao editar');
  const dep = await lerJ(await acoes.cliente(c.j.id));
  assert.deepEqual([dep.j.nome, dep.j.dominios, dep.j.base], ['Padaria Nova', ['nova.com.br'], []]);
});

test('cliente inexistente: 404; id malformado: 400', async () => {
  assert.equal((await acoes.cliente('00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await acoes.cliente('x')).status, 400);
  assert.equal((await acoes.conversas('x')).status, 400);
});

test('conversas e contatos do cliente: texto puro, sem vazar o de outro cliente, com id curto', async () => {
  const a = await lerJ(await acoes.salvar(valido({ nome: 'Cliente A', dominios: ['a.com.br'] })));
  const b = await lerJ(await acoes.salvar(valido({ nome: 'Cliente B', dominios: ['b.com.br'] })));
  const t = await rpc('atendente_turno_abrir', { publico: a.j.publico, chave_ip: 'c'.repeat(64) });
  await rpc('atendente_turno_gravar', { publico: a.j.publico, conversa_id: t.conversa_id, texto_visitante: '<img src=x onerror=alert(1)> oi', texto_atendente: 'olá', custo_usd: 0.002 });
  await rpc('atendente_contato_criar', { publico: a.j.publico, conversa_id: t.conversa_id, nome: 'Ana', telefone: '21999990000' });
  const ca = await lerJ(await acoes.conversas(a.j.id));
  assert.equal(ca.j.conversas.length, 1);
  assert.equal(ca.j.conversas[0].id.length, 8);
  assert.equal(ca.j.conversas[0].mensagens[0].texto, '<img src=x onerror=alert(1)> oi', 'devolvido cru: a tela só usa textContent');
  assert.equal(ca.j.contatos[0].telefone, '21999990000');
  const cb = await lerJ(await acoes.conversas(b.j.id));
  assert.deepEqual([cb.j.conversas, cb.j.contatos], [[], []]);
});

test('a tela do painel não usa innerHTML e o HTML traz os campos que o script lê', async () => {
  const fs = await import('node:fs');
  const js = fs.readFileSync(new URL('../../js/painel-atendente.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  const html = fs.readFileSync(new URL('../../painel.html', import.meta.url), 'utf8');
  for (const id of new Set([...js.matchAll(/\$\('([a-z-]+)'\)/g)].map(m => m[1]))) assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.match(html, /js\/painel-atendente\.js/);
});
