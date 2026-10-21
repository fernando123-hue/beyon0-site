/* Testes das métricas próprias (api/): node --test docs/testes/  (npm run testar) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarPacote, validarMudanca, normalizarPagina, ehRobo } from '../../api/_valida.mjs';
import { resumir, csvGoogleAds } from '../../api/_resumo.mjs';
import { receber } from '../../api/evento.mjs';
import { ler, mudar } from '../../api/painel.mjs';

const AGORA = Date.now();
const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36';
const CHAVE = 'chave-de-teste-local-com-32-caracteres!!';
const ENV = { BZ_LOCAL: '1', PAINEL_CHAVE: CHAVE };
const base = (extra = {}) => Object.assign({ id: 'pv-aaaaaaaa', visita: 'vi-aaaaaaaa', codigo: 'K7Q4M', pagina: '/sites.html', inicio: AGORA, entrada: true, fonte: 'google', meio: 'anuncio', campanha: 'sites-rj', termo: 'criação de site', dispositivo: 'celular', largura: 390, secoes: ['servicos', 'prova'], rolagem: 80, ativo_s: 42 }, extra);
const pedido = (corpo, cab = {}) => new Request('http://127.0.0.1:8899/api/evento', { method: 'POST', headers: Object.assign({ origin: 'http://127.0.0.1:8899', 'user-agent': UA, 'content-type': 'application/json' }, cab), body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
const comChave = (extra = {}) => Object.assign({ headers: { authorization: 'Bearer ' + CHAVE } }, extra);
const painel = (caminho, opcoes) => new Request('http://127.0.0.1:8899/api/painel' + caminho, opcoes || comChave());
const marcar = corpo => painel('', comChave({ method: 'POST', body: JSON.stringify(corpo) }));

test('caminho vira a forma limpa', () => {
  assert.equal(normalizarPagina('/sites.html'), '/sites');
  assert.equal(normalizarPagina('/index.html'), '/');
  assert.equal(normalizarPagina('/'), '/');
  assert.equal(normalizarPagina('/automacao/?x=1#a'), '/automacao');
  assert.equal(normalizarPagina('javascript:alert(1)'), null);
});

test('pacote válido passa e campos estranhos saem', () => {
  const r = validarPacote(base({ ip: '1.2.3.4', nome: 'Maria', contato: 'barra', gclid: 'Cj0KCQ-teste_123' }), AGORA);
  assert.equal(r.pagina.pagina, '/sites');
  assert.equal(r.pagina.ip, undefined);
  assert.equal(r.pagina.nome, undefined);
  assert.equal(r.contato.codigo, 'K7Q4M');
  assert.equal(r.contato.gclid, 'Cj0KCQ-teste_123');
});

test('pacote inválido é recusado', () => {
  assert.equal(validarPacote(base({ codigo: 'abc' }), AGORA), null);
  assert.equal(validarPacote(base({ id: '<script>' }), AGORA), null);
  assert.equal(validarPacote(base({ inicio: AGORA - 3 * 864e5 }), AGORA), null);
  assert.equal(validarPacote([], AGORA), null);
  const r = validarPacote(base({ secoes: ['ok', 'NÃO', '<x>', 'ok'], rolagem: 500, dispositivo: 'geladeira', campanha: '<b>x</b>' }), AGORA);
  assert.deepEqual(r.pagina.secoes, ['ok']);
  assert.equal(r.pagina.rolagem, 100);
  assert.equal(r.pagina.dispositivo, 'computador');
  assert.equal(r.pagina.campanha, 'bx/b');
});

test('mudança do painel: só status conhecido e valor numérico', () => {
  assert.equal(validarMudanca({ codigo: 'K7Q4M', status: 'hackeado' }), null);
  assert.equal(validarMudanca({ codigo: 'K7Q4M', valor: -5 }), null);
  assert.equal(validarMudanca({ codigo: 'K7Q4M' }), null);
  assert.equal(validarMudanca({ codigo: 'K7Q4M', status: 'cliente', valor: '1500.5' }).mudanca.valor, 1500.5);
});

test('robôs declarados não contam', () => {
  assert.ok(ehRobo('Mozilla/5.0 HeadlessChrome/130'));
  assert.ok(ehRobo('Googlebot/2.1'));
  assert.ok(ehRobo(''));
  assert.ok(!ehRobo(UA));
});

test('endpoint: origem de fora, robô, lixo e banco desligado', async () => {
  assert.equal((await receber(pedido(base(), { origin: 'https://malicioso.com' }), ENV)).status, 403);
  assert.equal((await receber(pedido(base(), { origin: '' }), ENV)).status, 403);
  assert.equal((await receber(pedido(base(), { 'user-agent': 'HeadlessChrome' }), ENV)).status, 204);
  assert.equal((await receber(pedido('{nao é json'), ENV)).status, 400);
  assert.equal((await receber(pedido('x'.repeat(5000)), ENV)).status, 413);
  assert.equal((await receber(pedido(base()), {})).status, 204);   /* sem banco: não grava, não quebra */
});

test('caminho inteiro: visita, contato, painel, cliente, CSV do Ads', async () => {
  const sem = { campanha: null, termo: null };
  assert.equal((await receber(pedido(base({ id: 'pv-11111111', visita: 'vi-11111111', codigo: 'AAAAA' })), ENV)).status, 204);
  assert.equal((await receber(pedido(base(Object.assign({ id: 'pv-22222222', visita: 'vi-22222222', codigo: 'CCCCC', meio: 'busca' }, sem))), ENV)).status, 204);
  assert.equal((await receber(pedido(base(Object.assign({ id: 'pv-22222222', visita: 'vi-22222222', codigo: 'CCCCC', meio: 'busca', contato: 'hero', rolagem: 95 }, sem))), ENV)).status, 204);
  assert.equal((await receber(pedido(base({ id: 'pv-33333333', visita: 'vi-33333333', codigo: 'DDDDD', contato: 'barra', gclid: 'Cj0KCQ-gclid_teste' })), ENV)).status, 204);

  assert.equal((await ler(painel('?dias=30', { headers: { authorization: 'Bearer errada' } }), ENV)).status, 401);
  assert.equal((await ler(painel('?dias=30'), { BZ_LOCAL: '1', PAINEL_CHAVE: 'curta' })).status, 503);

  const r1 = await (await ler(painel('?dias=30'), ENV)).json();
  assert.ok(r1.total.visitas >= 3);
  assert.ok(r1.total.contatos >= 2);
  const busca = r1.origens.find(o => o.chave === 'busca');
  assert.ok(busca.visitas >= 1 && busca.contatos >= 1);
  assert.ok(r1.paginas.find(p => p.pagina === '/sites').rolagemMedia > 0);

  assert.equal((await mudar(marcar({ codigo: 'DDDDD', status: 'cliente', valor: 2500 }), ENV)).status, 200);
  assert.equal((await mudar(marcar({ codigo: 'XXXXX', status: 'cliente' }), ENV)).status, 404);

  const r2 = await (await ler(painel('?dias=30'), ENV)).json();
  assert.ok(r2.total.clientes >= 1);
  assert.ok(r2.total.valor >= 2500);
  const csv = await (await ler(painel('?csv=ads&nome=Cliente%20fechado'), ENV)).text();
  assert.match(csv, /Cj0KCQ-gclid_teste,"Cliente fechado",\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,2500,BRL/);
});

test('resumo: visita conta uma vez e a origem é a da entrada', () => {
  const t = new Date(AGORA).toISOString();
  const pags = [
    { id: 'a', visita: 'v1', pagina: '/', inicio: t, entrada: true, meio: 'anuncio', campanha: 'c1', termo: 't1', dispositivo: 'celular', secoes: [], ativo_s: 10, rolagem: 50 },
    { id: 'b', visita: 'v1', pagina: '/sites', inicio: t, entrada: false, meio: 'direto', dispositivo: 'celular', secoes: [], ativo_s: 20, rolagem: 90, contato: 'barra' }
  ];
  const r = resumir(pags, [{ codigo: 'AAAAA', visita: 'v1', status: 'conversa', meio: 'anuncio', quando: t }], { dias: 30 });
  assert.equal(r.total.visitas, 1);
  assert.equal(r.origens[0].chave, 'anuncio');
  assert.equal(r.origens[0].conversas, 1);
  assert.equal(r.campanhas[0].chave, 'c1 · t1');
  assert.equal(r.tempoMediano_s, 30);
  assert.equal(csvGoogleAds([{ status: 'conversa', gclid: 'x' }], 'N').split('\n').length, 3);
});

test('proteções da revisão de segurança', async () => {
  const { freado } = await import('../../api/evento.mjs');
  let barrou = false;
  for (let i = 0; i < 61; i++) barrou = freado('9.9.9.9', 1000);
  assert.ok(barrou, '61º pedido no mesmo minuto é freado');
  assert.ok(!freado('9.9.9.9', 1000 + 61e3), 'minuto seguinte libera');
  assert.equal(validarPacote(base({ codigo: ['K7Q4M'] }), AGORA), null, 'lista não passa como código');
  const r = validarPacote(base({ campanha: 'promo-maria@gmail.com', termo: '21 97716-7944', fonte: 'news' }), AGORA);
  assert.equal(r.pagina.campanha, null, 'e-mail na campanha é descartado');
  assert.equal(r.pagina.termo, null, 'telefone no termo é descartado');
  assert.equal(r.pagina.fonte, 'news');
  assert.equal(validarPacote(base({ meio: 'constructor' }), AGORA).pagina.meio, 'constructor');
  assert.equal(resumir([{ id: 'x', visita: 'v', pagina: '/', inicio: new Date(AGORA).toISOString(), entrada: true, meio: 'constructor', dispositivo: 'celular', secoes: [] }], [], { dias: 7 }).origens[0].nome, 'constructor');
  /* excluir a pedido do titular */
  assert.equal((await receber(pedido(base({ id: 'pv-44444444', visita: 'vi-44444444', codigo: 'EEEEE', contato: 'menu' })), ENV)).status, 204);
  assert.equal((await mudar(marcar({ codigo: 'EEEEE', excluir: true }), ENV)).status, 200);
  assert.equal((await mudar(marcar({ codigo: 'EEEEE', excluir: true }), ENV)).status, 404);
  /* chave curta demais não abre o painel */
  assert.equal((await ler(painel('?dias=7'), { BZ_LOCAL: '1', PAINEL_CHAVE: 'x'.repeat(31) })).status, 503);
  /* na Vercel o banco de memória nunca liga */
  assert.equal((await receber(pedido(base()), { BZ_LOCAL: '1', VERCEL: '1' })).status, 204);
});

/* (revisão técnica do lote 1 da auditoria de 2026-10-09) o freio de tentativas da chave do painel conta o IPv6 pelo /64,
   como os outros freios (ipDe em api/_freio.mjs): trocar o fim do endereço não dá 10 tentativas novas */
test('painel: tentativas de chave errada contam o IPv6 pelo prefixo /64', async () => {
  const errada = n => painel('?dias=7', { headers: { authorization: 'Bearer errada', 'x-forwarded-for': '2001:db8:77:1::' + n.toString(16) } });
  const respostas = await Promise.all(Array.from({ length: 10 }, (_, i) => ler(errada(i + 1), ENV)));
  assert.ok(respostas.every(r => r.status === 401), '10 chaves erradas: 401');
  assert.equal((await ler(errada(99), ENV)).status, 429, 'a 11ª, de outro fim do mesmo /64: freada');
  assert.equal((await ler(painel('?dias=7', { headers: { authorization: 'Bearer errada', 'x-forwarded-for': '2001:db8:77:2::1' } }), ENV)).status, 401, 'outro /64 não é afetado');
});

/* A9 (migração para a Cloudflare): o painel GET respeita o orçamento de CPU e de subpedidos. Uma tabela cheia (1.000 linhas por
   página) não é lida até o fim: no máximo MAX_PAGINAS_POR_TABELA páginas por tabela, e o resultado diz que foi cortado. */
test('painel: tabelas cheias são lidas em no máximo 2 páginas cada, o resumo avisa o corte e faz no máximo 5 subpedidos', async () => {
  const { banco, MAX_PAGINAS_POR_TABELA } = await import('../../api/_banco.mjs');
  assert.equal(MAX_PAGINAS_POR_TABELA, 2);
  const ENV_REAL = { PAINEL_CHAVE: CHAVE, SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_CHAVE_SECRETA: 'sb_secret_teste' };
  const salvo = globalThis.fetch;
  const vistos = [];
  const linha = (i, campo) => ({ id: 'pv-' + i, visita: 'vi-' + i, codigo: 'K' + String(i).padStart(4, '0'), pagina: '/sites', [campo]: new Date(AGORA - i * 1000).toISOString(), entrada: true,
    fonte: 'direto', meio: 'direto', campanha: null, termo: null, rolagem: 10, status: 'clicou' });
  globalThis.fetch = async url => {
    const u = String(url);
    vistos.push(u);
    const tabela = /\/rest\/v1\/(paginas|contatos)\?/.exec(u);
    if (!tabela) return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });   /* (a saúde, uma RPC) */
    const campo = tabela[1] === 'paginas' ? 'inicio' : 'quando';
    return new Response(JSON.stringify(Array.from({ length: 1000 }, (_, i) => linha(i, campo))), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const lidas = await banco(ENV_REAL).listar('paginas', 'inicio', new Date(AGORA - 864e5).toISOString());
    assert.equal(vistos.filter(u => u.includes('/paginas?')).length, MAX_PAGINAS_POR_TABELA, 'no máximo 2 páginas da tabela');
    assert.equal(lidas.length, 2000);
    assert.equal(lidas.cortado, true);
    vistos.length = 0;
    const r = await ler(painel('?dias=30'), ENV_REAL);
    assert.equal(r.status, 200);
    const corpo = await r.json();
    assert.ok(vistos.length <= 5, 'subpedidos: ' + vistos.length);
    assert.equal(corpo.aviso, 'período grande demais; mostrando os mais recentes');
  } finally { globalThis.fetch = salvo; }
});
