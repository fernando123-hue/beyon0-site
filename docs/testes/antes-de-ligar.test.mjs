/* O VERIFICADOR "ANTES DE LIGAR" (PR 3b-3; spec §13, "Mesclar não é ir ao ar"): só deixa liberar o BZ_ENTREGA quando as CSPs de /orcamento (vercel.json, a <meta> e o
   _headers da Cloudflare) trazem o endereço EXATO do Supabase e o blob:, a captação (condicoes_versao, 3 dias e lembretes 2 e 3) fala o que o site promete, a privacidade
   do 3b-2 está mesclada, as 10 migrations estão no repositório e nenhum arquivo de deploy liga a entrega. O que um arquivo não prova vira CONFIRMAR para o dono.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verificar, temFalta, cspsDoOrcamento, formatar, MIGRATIONS } from '../../scripts/antes-de-ligar.mjs';

const EXATO = 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/upload/sign/';
const CURINGA = 'https://*.supabase.co/storage/v1/object/upload/sign/';
const csp = ({ supabase = EXATO, blob = true } = {}) => "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:" + (blob ? ' blob:' : '') + "; connect-src 'self' https://api.mercadopago.com " + supabase + "; object-src 'none'";
const headersCom = cspDoOrcamento => '/*\n  X-Frame-Options: DENY\n\n/orcamento\n  ! Content-Security-Policy\n  Content-Security-Policy: ' + cspDoOrcamento + '\n\n/painel\n  X: y\n';
const CAPTACAO_OK = { condicoes_versao: '2026-10-22', restante_fora_do_ar_dias: 3, lembretes_restante: [2, 3] };

function mundo({ cspVercel = csp(), cspMeta = csp(), cspHeaders = csp(), vercel = true, headers = true, privacidade = true, versaoPagina = '2026-10-22',
  captacao = CAPTACAO_OK, migrations = MIGRATIONS, extra = {}, falham = [], base = 'https://beyonzero.com.br' } = {}) {
  const arquivos = {
    'orcamento.html': '<meta http-equiv="Content-Security-Policy" content="' + cspMeta + '">',
    'condicoes.html': '<p class="priv__data">Última atualização: ' + Number(versaoPagina.slice(8)) + ' de outubro de ' + versaoPagina.slice(0, 4) + '</p>',
    'package.json': '{"scripts":{}}', '.env.example': '# a entrega\nBZ_ENTREGA=\n', ...extra
  };
  if (vercel && !extra['vercel.json']) arquivos['vercel.json'] = JSON.stringify({ headers: [{ source: '/orcamento', headers: [{ key: 'Content-Security-Policy', value: cspVercel }] }] });
  if (headers) { if (!('_headers' in extra)) arquivos._headers = headersCom(cspHeaders); arquivos['docs/testes/cabecalhos.test.mjs'] = '// existe'; }
  for (const m of migrations) arquivos['supabase/migrations/' + m] = '-- ok';
  if (privacidade) arquivos['docs/testes/privacidade-material.test.mjs'] = '// existe';
  const doDono = captacao && { 'config/entrega.json': typeof captacao === 'string' ? captacao : JSON.stringify(captacao) };
  return {
    ler: f => { if (!(f in arquivos)) throw new Error('sem ' + f); return arquivos[f]; }, existe: f => f in arquivos,
    listar: pasta => Object.keys(arquivos).filter(a => a.startsWith(pasta + '/') && !a.slice(pasta.length + 1).includes('/')).map(a => a.slice(pasta.length + 1)),
    rodar: f => (f in arquivos && !falham.includes(f) ? 0 : 1),
    captacao: doDono && (f => { if (!(f in doDono)) throw new Error('sem ' + f); return doDono[f]; }), base
  };
}
const falta = itens => itens.filter(i => i.estado === 'FALTA').map(i => i.texto);
const confirmar = itens => itens.filter(i => i.estado === 'CONFIRMAR').map(i => i.texto).join('\n');
const ok = itens => itens.filter(i => i.estado === 'OK').map(i => i.texto).join('\n');

test('tudo pronto nos arquivos: nenhum FALTA; o que não é arquivo vira CONFIRMAR para o dono', () => {
  const r = verificar(mundo());
  assert.equal(temFalta(r), false, falta(r).join(' | '));
  const conf = confirmar(r);
  for (const palavra of [/aplicadas no Supabase/, /balde/, /tabela ativa/, /valores da tabela normal/, /ensaio/, /material parado/, /3 dias/, /staging/, /beyon0-site\.vercel\.app/]) assert.match(conf, palavra);
  assert.match(ok(r), /10 migrations/);
});

test('o curinga do Supabase na CSP (em qualquer um dos três lugares) é FALTA; o endereço exato passa; sem blob: (miniaturas) também é FALTA', () => {
  assert.ok(falta(verificar(mundo({ cspVercel: csp({ supabase: CURINGA }) }))).some(t => /vercel\.json/.test(t) && /EXATO/.test(t)));
  assert.ok(falta(verificar(mundo({ cspMeta: csp({ supabase: '' }) }))).some(t => /meta/.test(t)));
  assert.ok(falta(verificar(mundo({ cspMeta: csp({ blob: false }) }))).some(t => /blob:/.test(t)));
  assert.ok(falta(verificar(mundo({ cspHeaders: csp({ supabase: CURINGA }) }))).some(t => /_headers/.test(t) && /EXATO/.test(t)), 'o _headers da Cloudflare também é conferido');
  assert.ok(falta(verificar(mundo({ cspHeaders: csp({ blob: false }) }))).some(t => /_headers/.test(t) && /blob:/.test(t)));
  assert.equal(temFalta(verificar(mundo({ cspVercel: csp(), cspMeta: csp(), cspHeaders: csp() }))), false);
  assert.deepEqual(cspsDoOrcamento(mundo()).map(c => c[0]), ['vercel.json', 'orcamento.html (meta)', '_headers (Cloudflare)']);
  assert.deepEqual(cspsDoOrcamento(mundo({ vercel: false })).map(c => c[0]), ['orcamento.html (meta)', '_headers (Cloudflare)'], 'sem o vercel.json (o PR que o apaga) continua valendo');
});

test('o _headers é lido também com fim de linha do Windows', () => {
  const m = mundo();
  const lerWin = f => (f === '_headers' ? m.ler(f).replace(/\n/g, '\r\n') : m.ler(f));
  const r = cspsDoOrcamento({ ler: lerWin, existe: m.existe }).find(c => c[0].startsWith('_headers'));
  assert.ok(r && /^default-src/.test(r[1]) && !/\r/.test(r[1]));
});

test('o teste de paridade dos cabeçalhos (cabecalhos.test.mjs) é rodado: se falhar, FALTA; sem o _headers é CONFIRMAR e cita esse teste', () => {
  const m = mundo({ falham: ['docs/testes/cabecalhos.test.mjs'] });
  assert.ok(falta(verificar(m)).some(t => /cabecalhos\.test\.mjs/.test(t)));
  assert.match(ok(verificar(mundo())), /cabecalhos\.test\.mjs/);
  const sem = verificar(mundo({ headers: false }));
  assert.equal(temFalta(sem), false);
  assert.ok(sem.some(i => i.estado === 'CONFIRMAR' && /_headers/.test(i.texto) && /cabecalhos\.test\.mjs/.test(i.texto)));
});

test('a captação ao lado é CONFERIDA: condicoes_versao igual à data da página, 3 dias para o restante e lembretes no 2º e 3º dia; qualquer diferença é FALTA', () => {
  const certa = verificar(mundo());
  assert.match(ok(certa), /condicoes_versao da captação = 2026-10-22/);
  assert.match(ok(certa), /3 dias/);
  assert.match(ok(certa), /\[2, 3\]/);
  assert.ok(falta(verificar(mundo({ captacao: { ...CAPTACAO_OK, condicoes_versao: '2026-10-21' } }))).some(t => /condicoes_versao/.test(t) && /2026-10-22/.test(t)));
  assert.ok(falta(verificar(mundo({ captacao: { ...CAPTACAO_OK, restante_fora_do_ar_dias: 10 } }))).some(t => /restante_fora_do_ar_dias/.test(t) && /10/.test(t)));
  assert.ok(falta(verificar(mundo({ captacao: { ...CAPTACAO_OK, lembretes_restante: [3, 7] } }))).some(t => /lembretes_restante/.test(t) && /\[3, 7\]/.test(t)));
  assert.ok(falta(verificar(mundo({ captacao: { condicoes_versao: '2026-10-22' } }))).some(t => /restante_fora_do_ar_dias/.test(t)), 'campo que não existe é FALTA, não passa calado');
  assert.ok(falta(verificar(mundo({ captacao: '{ isto não é json' }))).some(t => /entrega\.json/.test(t)));
});

test('sem a captação ao lado, nada é FALTA: os três valores viram CONFIRMAR', () => {
  const sem = verificar(mundo({ captacao: null }));
  assert.equal(temFalta(sem), false);
  const conf = confirmar(sem);
  assert.match(conf, /condicoes_versao/);
  assert.match(conf, /restante_fora_do_ar_dias/);
  assert.match(conf, /lembretes_restante/);
});

test('a privacidade do 3b-2 mesclada (o teste dela existe e passa) e as 10 migrations do 3b no repositório; faltando, FALTA', () => {
  assert.ok(falta(verificar(mundo({ privacidade: false }))).some(t => /privacidade/.test(t)));
  assert.ok(falta(verificar(mundo({ falham: ['docs/testes/privacidade-material.test.mjs'] }))).some(t => /privacidade/.test(t)));
  assert.ok(falta(verificar(mundo({ migrations: MIGRATIONS.slice(0, 5) }))).some(t => /migrations/.test(t) && /pr3b3_esquema/.test(t) && /pr3b3_lista/.test(t)));
  assert.equal(MIGRATIONS.length, 10);
  assert.deepEqual([...MIGRATIONS].sort(), [...MIGRATIONS], 'a ordem de aplicação é a do nome');
});

test('a lista MIGRATIONS é a pasta de verdade: toda migration do 3b-1 em diante está nela (uma migration nova sem entrar na lista deixa este teste vermelho)', () => {
  const reais = fs.readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(f => f.endsWith('.sql') && f >= '20261022').sort();
  assert.deepEqual(MIGRATIONS, reais);
});

test('nenhum arquivo de deploy liga o BZ_ENTREGA: se algum ligar, FALTA (jsonc, json, toml, package.json, .env.example); comentário e vazio não contam', () => {
  const liga = extra => falta(verificar(mundo({ extra })));
  assert.ok(liga({ 'wrangler.jsonc': '{ "vars": { "BZ_ENTREGA": "ligada" } }' }).some(t => /BZ_ENTREGA/.test(t) && /wrangler\.jsonc/.test(t)));
  assert.ok(liga({ 'wrangler.jsonc': '{ "env": { "previa": { "previews": { "vars": { "BZ_ENTREGA": "ligada" } } } } }' }).some(t => /wrangler\.jsonc/.test(t)), 'também nas prévias');
  assert.ok(liga({ 'wrangler.toml': 'BZ_ENTREGA = "ligada"' }).some(t => /wrangler\.toml/.test(t)));
  assert.ok(liga({ 'package.json': '{"scripts":{"x":"BZ_ENTREGA=ligada node a"}}' }).some(t => /package\.json/.test(t)));
  assert.ok(liga({ '.env.example': 'BZ_ENTREGA=ligada\n' }).some(t => /\.env\.example/.test(t)));
  assert.ok(liga({ 'vercel.json': '{"env":{"BZ_ENTREGA":"ligada"}}' }).some(t => /vercel\.json/.test(t)));
  assert.deepEqual(liga({ 'wrangler.jsonc': '{\n  // BZ_ENTREGA=ligada só pelo dono, no painel\n  "vars": { "BZ_AMBIENTE": "producao" }\n}' }).filter(t => /BZ_ENTREGA/.test(t)), []);
  assert.deepEqual(liga({ 'wrangler.jsonc': '{ "vars": { "BZ_ENTREGA": "" } }' }).filter(t => /BZ_ENTREGA/.test(t)), []);
  assert.match(ok(verificar(mundo())), /nenhum arquivo de deploy liga o BZ_ENTREGA/);
});

test('o wrangler.jsonc e o .env.example DE VERDADE deste repositório não ligam a entrega', () => {
  const real = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
  const itens = verificar({ ...mundo(), ler: f => (fs.existsSync(new URL('../../' + f, import.meta.url)) ? real(f) : mundo().ler(f)), existe: f => fs.existsSync(new URL('../../' + f, import.meta.url)) || mundo().existe(f),
    listar: pasta => (fs.existsSync(new URL('../../' + pasta, import.meta.url)) ? fs.readdirSync(new URL('../../' + pasta, import.meta.url)) : []) });   /* (os workflows e o Worker de verdade também são varridos) */
  assert.deepEqual(falta(itens).filter(t => /BZ_ENTREGA/.test(t)), []);
});

test('a BZ_BASE do dono é conferida contra scripts/direcoes.mjs; a de um domínio parecido ou sem https é FALTA', () => {
  assert.match(ok(verificar(mundo())), /BZ_BASE/);
  for (const ruim of ['https://beyonzero.com.br.evil.com', 'http://beyonzero.com.br', 'https://beyonzero.com.br@evil.com', 'https://evil.com']) {
    assert.ok(falta(verificar(mundo({ base: ruim }))).some(t => /BZ_BASE/.test(t)), ruim);
  }
});

test('a lista de hosts: o staging (SUB_CONTA) e a retirada do beyon0-site.vercel.app são CONFIRMAR enquanto o vercel.json existir; sem o vercel.json o host da Vercel ainda na lista é FALTA', () => {
  const r = verificar(mundo());
  assert.ok(r.some(i => i.estado === 'CONFIRMAR' && /staging/.test(i.texto) && /acesso\.mjs/.test(i.texto)), 'o host do staging e onde dizer o subdomínio');
  assert.ok(r.some(i => i.estado === 'CONFIRMAR' && /beyon0-site\.vercel\.app/.test(i.texto)));
  assert.ok(falta(verificar(mundo({ vercel: false }))).some(t => /beyon0-site\.vercel\.app/.test(t) && /HOSTS_VERCEL/.test(t)), 'o PR que apaga o vercel.json tem de tirar o host da lista');
});

test('o que o dono decidiu no 3b-3b entra como CONFIRMAR curto, uma linha cada; e não sobra marcador de decisão pendente', () => {
  const r = verificar(mundo());
  const conf = r.filter(i => i.estado === 'CONFIRMAR').map(i => i.texto);
  for (const palavra of [/entrada estornada/i, /recomeça/, /30 dias antes de apagar/, /autoriza\S+ completa/, /prova da autoriza/]) assert.ok(conf.some(t => palavra.test(t)), String(palavra));
  for (const i of r) assert.ok(!/\n/.test(i.texto), 'uma linha só: ' + i.texto.slice(0, 40));
  assert.ok(!r.some(i => /\bA2\b|\bI1\b|DECISÃO/.test(i.texto + ' ' + i.acao)), 'nenhum marcador de decisão pendente (A2, I1 e M3 foram decididas em 22/10)');
  assert.ok(conf.some(t => /captação/.test(t) && /material parado/.test(t) && /sem_material/.test(t)), 'o que só o código da captação prova continua CONFIRMAR');
});

/* ---- correções da revisão da 15b ---- */
const cspCom = ({ connect, img = "'self' data: blob:" }) => "default-src 'self'; script-src 'self'; img-src " + img + '; connect-src ' + connect + "; object-src 'none'";
const ATE_FALTA = (itens, ...palavras) => falta(itens).some(t => palavras.every(p => p.test(t)));

test('fonte da CSP que EXISTE mas não se deixa ler é FALTA, nunca ignorada em silêncio (um teste por fonte)', () => {
  /* vercel.json torto, e com source diferente */
  assert.ok(ATE_FALTA(verificar(mundo({ extra: { 'vercel.json': '{ torto' } })), /não encontrada/, /vercel\.json/));
  assert.ok(ATE_FALTA(verificar(mundo({ extra: { 'vercel.json': JSON.stringify({ headers: [{ source: '/orcamentos', headers: [{ key: 'Content-Security-Policy', value: csp() }] }] }) } })), /não encontrada/, /vercel\.json/));
  /* <meta> sem CSP, ou com a CSP vazia */
  assert.ok(ATE_FALTA(verificar(mundo({ extra: { 'orcamento.html': '<meta name="viewport" content="width=device-width">' } })), /não encontrada/, /meta/));
  /* _headers sem o bloco de /orcamento, com outra rota, ou o bloco sem CSP */
  assert.ok(ATE_FALTA(verificar(mundo({ extra: { _headers: '/*\n  X-Frame-Options: DENY\n' } })), /não encontrada/, /_headers/));
  assert.ok(ATE_FALTA(verificar(mundo({ extra: { _headers: '/orcamentos\n  Content-Security-Policy: ' + csp() + '\n' } })), /não encontrada/, /_headers/));
  assert.ok(ATE_FALTA(verificar(mundo({ extra: { _headers: '/orcamento\n  X-Frame-Options: DENY\n' } })), /não encontrada/, /_headers/));
  /* fonte que NÃO existe continua sendo ignorada (o vercel.json some no PR que o apaga) */
  assert.equal(falta(verificar(mundo({ vercel: false }))).some(t => /não encontrada/.test(t)), false);
});

test('formatos que o navegador e a Cloudflare aceitam continuam passando: <meta> com content antes do http-equiv, /orcamento/ com barra e cabeçalho em minúscula no _headers', () => {
  const meta = '<meta content="' + csp() + '" http-equiv="Content-Security-Policy">';
  const comMeta = verificar(mundo({ extra: { 'orcamento.html': meta } }));
  assert.equal(temFalta(comMeta), false);
  assert.match(ok(comMeta), /orcamento\.html \(meta\) com o endereço exato/, 'a meta foi LIDA, não ignorada');
  const h = '/orcamento/\n  ! content-security-policy\n  content-security-policy: ' + csp() + '\n';
  const comHeaders = verificar(mundo({ extra: { _headers: h } }));
  assert.equal(temFalta(comHeaders), false);
  assert.match(ok(comHeaders), /_headers \(Cloudflare\) com o endereço exato/, 'o _headers foi LIDO, não ignorado');
});

test('o endereço exato tem de estar no connect-src (não basta estar em outra diretiva): sem curinga, sem * solto, sem https: nem http: como fonte', () => {
  const cenarios = {
    'só no img-src': cspCom({ connect: "'self' https://api.mercadopago.com", img: "'self' data: blob: " + EXATO }),
    '* solto': cspCom({ connect: "* 'self' " + EXATO }),
    'só o *': cspCom({ connect: "* 'self'" }),
    'https: solto': cspCom({ connect: "'self' https: " + EXATO }),
    'http: solto': cspCom({ connect: "'self' http: " + EXATO }),
    'curinga ao lado do exato': cspCom({ connect: "'self' " + EXATO + ' ' + CURINGA }),
    'sem connect-src': "default-src 'self'; img-src 'self' blob:"
  };
  for (const [nome, ruim] of Object.entries(cenarios)) {
    assert.ok(ATE_FALTA(verificar(mundo({ cspMeta: ruim })), /meta/, /connect-src/), nome);
  }
  assert.equal(temFalta(verificar(mundo({ cspMeta: cspCom({ connect: "'self' https://api.mercadopago.com " + EXATO }) }))), false, 'o certo continua passando');
});

test('os três lugares têm de apontar para o MESMO projeto do Supabase; três projetos diferentes é FALTA', () => {
  const projeto = ref => 'https://' + ref + '.supabase.co/storage/v1/object/upload/sign/';
  const r = verificar(mundo({ cspVercel: csp({ supabase: projeto('aaaaaaaaaaaaaaaaaaaa') }), cspMeta: csp({ supabase: projeto('bbbbbbbbbbbbbbbbbbbb') }), cspHeaders: csp({ supabase: projeto('cccccccccccccccccccc') }) }));
  assert.ok(ATE_FALTA(r, /projetos? (diferentes|distintos)/, /vercel\.json/, /_headers/));
  assert.ok(ATE_FALTA(verificar(mundo({ cspHeaders: csp({ supabase: projeto('bbbbbbbbbbbbbbbbbbbb') }) })), /projetos? (diferentes|distintos)/), 'um só diferente já é FALTA');
  assert.equal(temFalta(verificar(mundo({ cspVercel: csp({ supabase: projeto('aaaaaaaaaaaaaaaaaaaa') }), cspMeta: csp({ supabase: projeto('aaaaaaaaaaaaaaaaaaaa') }), cspHeaders: csp({ supabase: projeto('aaaaaaaaaaaaaaaaaaaa') }) }))), false);
  assert.match(ok(verificar(mundo())), /mesmo projeto/);
});

test('BZ_ENTREGA com espaços ao redor de "ligada" também liga (o código faz trim): é FALTA', () => {
  for (const valor of ['{ "vars": { "BZ_ENTREGA": " ligada " } }', '{ "vars": { "BZ_ENTREGA":"ligada" } }', 'BZ_ENTREGA=" ligada"', "BZ_ENTREGA = ' ligada '", 'BZ_ENTREGA= ligada']) {
    assert.ok(ATE_FALTA(verificar(mundo({ extra: { 'wrangler.toml': valor } })), /BZ_ENTREGA/, /wrangler\.toml/), valor);
  }
  assert.equal(falta(verificar(mundo({ extra: { 'wrangler.toml': 'BZ_ENTREGA = "ligadaa"' } }))).some(t => /BZ_ENTREGA/.test(t)), false, 'outro valor que não é "ligada" não liga');
});

test('a BZ_BASE recusada nunca imprime usuário nem senha: só o endereço (origem), ou que não é um endereço', () => {
  for (const base of ['https://usuario:segredo123@evil.com', 'https://beyonzero.com.br:senha456@evil.com/caminho?token=abc', 'segredo789 isto nem é endereço']) {
    const itens = verificar(mundo({ base }));
    const tudo = itens.map(i => i.texto + ' ' + i.acao).join('\n');
    assert.ok(falta(itens).some(t => /BZ_BASE/.test(t)), base);
    assert.doesNotMatch(tudo, /segredo|senha|usuario|token/, base);
  }
});

test('o que o agente concluiu sozinho tem UM cabeçalho de grupo (não um prefixo em cada linha), linhas curtas, e a prova do contato diz o que a tabela guarda', () => {
  const r = verificar(mundo());
  const grupo = r.filter(i => i.grupo === 'conclusoes');
  assert.equal(grupo.length, 5);
  for (const i of r) assert.doesNotMatch(i.texto, /o agente concluiu/i, 'o prefixo mora no cabeçalho do grupo');
  for (const i of grupo) assert.ok(i.texto.length <= 150, i.texto.length + ': ' + i.texto);
  const prova = grupo.find(i => /prova/.test(i.texto)).texto;
  for (const palavra of [/WhatsApp/, /e-mail/, /data/, /versão/]) assert.match(prova, palavra);
  assert.doesNotMatch(prova, /sem o nome|anônim/i, 'a tabela guarda contato de pessoa: não pode soar anonimizada');
  const linhas = formatar(r);
  assert.equal(linhas.filter(l => /o agente concluiu sozinho/i.test(l)).length, 1, 'o cabeçalho sai uma vez só');
  const iCab = linhas.findIndex(l => /o agente concluiu sozinho/i.test(l));
  assert.ok(linhas.slice(iCab + 1, iCab + 6).every(l => /^CONFIRMAR/.test(l)), 'as 5 linhas vêm logo depois do cabeçalho');
});

/* ---- correções da revisão final de segurança do 3b-3c (B2 e B3) ---- */
const MP = 'https://api.mercadopago.com https://secure-fields.mercadopago.com';
const cspTotal = ({ connect = "'self' " + MP + ' ' + EXATO, script = "'self' https://challenges.cloudflare.com https://sdk.mercadopago.com", style = "'self'", padrao = "'self'" } = {}) =>
  'default-src ' + padrao + '; script-src ' + script + '; style-src ' + style + "; img-src 'self' data: blob:; connect-src " + connect + "; object-src 'none'";

test('B2: o connect-src é lista do que é PERMITIDO: qualquer outra fonte é FALTA e o texto cita a fonte', () => {
  const ruins = ['https://*', 'wss:', 'ws:', 'data:', 'blob:', '*.exemplo.com', 'https://cdn.exemplo.com', 'https://*.exemplo.com', 'wss://sockets.exemplo.com', 'http://api.mercadopago.com', 'https://api.mercadopago.com.evil.com'];
  for (const fonte of ruins) {
    for (const lugar of ['cspVercel', 'cspMeta', 'cspHeaders']) {
      const r = verificar(mundo({ [lugar]: cspTotal({ connect: "'self' " + MP + ' ' + EXATO + ' ' + fonte }) }));
      assert.ok(falta(r).some(t => /connect-src/.test(t) && t.includes(fonte)), lugar + ' deixou passar ' + fonte);
    }
  }
  assert.equal(temFalta(verificar(mundo({ cspMeta: cspTotal() }))), false, 'o conjunto legítimo (self, Mercado Pago, Supabase exato) passa');
  assert.equal(temFalta(verificar(mundo({ cspMeta: cspTotal({ connect: "'self' " + EXATO }) }))), false, 'menos fontes que o conjunto também passa');
  assert.equal(temFalta(verificar(mundo({ cspMeta: cspTotal({ connect: "'SELF' HTTPS://API.MERCADOPAGO.COM " + EXATO }) }))), false, 'caixa alta é a mesma fonte');
});

test('B2: script-src, style-src e default-src recusam unsafe-inline, unsafe-eval, * e esquemas soltos (e o que a CSP real precisa continua passando)', () => {
  const abertas = {
    'script-src': ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'http:', 'data:', 'blob:', 'https://*.exemplo.com'],
    'style-src': ["'unsafe-inline'", '*', 'https:', 'data:'],
    'default-src': ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'data:', 'blob:']
  };
  const opcao = { 'script-src': 'script', 'style-src': 'style', 'default-src': 'padrao' };
  const base = { 'script-src': "'self' https://challenges.cloudflare.com", 'style-src': "'self'", 'default-src': "'self'" };
  for (const [dir, fontes] of Object.entries(abertas)) {
    for (const fonte of fontes) {
      const r = verificar(mundo({ cspHeaders: cspTotal({ [opcao[dir]]: base[dir] + ' ' + fonte }) }));
      assert.ok(falta(r).some(t => /_headers/.test(t) && t.includes(dir) && t.includes(fonte)), dir + ' deixou passar ' + fonte);
    }
  }
  assert.equal(temFalta(verificar(mundo({ cspVercel: cspTotal(), cspMeta: cspTotal(), cspHeaders: cspTotal() }))), false);
});

test('B3: workflow com --var BZ_ENTREGA:ligada, Worker que liga com ??= e qualquer menção ao interruptor nesses arquivos é FALTA; a vizinhança limpa e os comentários não', () => {
  const liga = extra => falta(verificar(mundo({ extra })));
  const wf = '.github/workflows/deploy.yml';
  assert.ok(liga({ [wf]: 'jobs:\n  d:\n    steps:\n      - run: npx wrangler deploy --var BZ_ENTREGA:ligada\n' }).some(t => /BZ_ENTREGA/.test(t) && t.includes(wf)), 'workflow');
  assert.ok(liga({ [wf]: 'env:\n  BZ_ENTREGA: ligada\n' }).some(t => t.includes(wf)), 'env do workflow');
  assert.ok(liga({ 'cloudflare/worker.mjs': "export default { fetch(req, env) { env.BZ_ENTREGA ??= 'ligada'; } };" }).some(t => /BZ_ENTREGA/.test(t) && t.includes('cloudflare/worker.mjs')), '??= no Worker');
  assert.ok(liga({ 'cloudflare/novo.mjs': "const e = { ...env, BZ_ENTREGA: 'ligada' };" }).some(t => t.includes('cloudflare/novo.mjs')), 'objeto');
  assert.deepEqual(liga({ [wf]: '# BZ_ENTREGA=ligada só pelo dono\njobs: {}\n', 'cloudflare/worker.mjs': '/* BZ_ENTREGA = ligada: nunca aqui */\n// BZ_ENTREGA ligada\nexport default {};' }).filter(t => /BZ_ENTREGA/.test(t)), [], 'comentário não conta');
  assert.match(ok(verificar(mundo({ extra: { [wf]: 'jobs: {}\n', 'cloudflare/worker.mjs': 'export default {};' } }))), /\.github\/workflows/, 'o OK diz que varreu os workflows');
  assert.match(ok(verificar(mundo())), /cloudflare/, 'e o Worker');
});
