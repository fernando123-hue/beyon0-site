/* A POLÍTICA DE SEGURANÇA (CSP) de cada página existe em DOIS lugares: o header do vercel.json e o <meta> do próprio
   HTML (o navegador aplica os dois). Em 2026-10-07 o widget do Turnstile foi bloqueado porque só o vercel.json tinha
   sido atualizado (PR #8). Este teste prende os dois juntos e garante que o /orcamento não libera origem que a página
   não usa (revisão de segurança do PR #1, B4: domínios do Google sem uso).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = new URL('../../', import.meta.url);
const HEADERS = JSON.parse(readFileSync(new URL('vercel.json', RAIZ), 'utf8')).headers || [];
/* diretivas que o <meta> não aceita (só valem no header) */
const SO_NO_HEADER = new Set(['frame-ancestors', 'upgrade-insecure-requests', 'report-uri', 'report-to', 'sandbox']);

const diretivas = csp => Object.fromEntries(csp.split(';').map(x => x.trim()).filter(Boolean)
  .map(x => { const [k, ...v] = x.split(/\s+/); return [k, v.sort().join(' ')]; }));
/* o header que a Vercel aplica a um caminho (mesma conversão do docs/servidor.mjs: a última regra que casa vence) */
function cspDoHeader(caminho) {
  let valor = null;
  for (const regra of HEADERS) {
    const re = new RegExp('^' + regra.source.replace(/\(\.\*\)/g, '(.*)') + '$');
    if (!re.test(caminho)) continue;
    const h = regra.headers.find(x => x.key.toLowerCase() === 'content-security-policy');
    if (h) valor = h.value;
  }
  return valor;
}
const paginas = readdirSync(RAIZ).filter(f => f.endsWith('.html'));

test('CSP: o <meta> de cada página é igual ao header do vercel.json (fora as diretivas só de header)', () => {
  assert.ok(paginas.includes('orcamento.html'));
  for (const arquivo of paginas) {
    const html = readFileSync(new URL(arquivo, RAIZ), 'utf8');
    const meta = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/) || [])[1];
    if (!meta) continue;
    const caminho = '/' + arquivo.replace(/\.html$/, '').replace(/^index$/, '');
    const header = cspDoHeader(caminho);
    assert.ok(header, arquivo + ': tem <meta> de CSP mas nenhum header no vercel.json para ' + caminho);
    const h = diretivas(header), m = diretivas(meta);
    for (const k of SO_NO_HEADER) delete h[k];
    assert.deepEqual(m, h, arquivo + ' (' + caminho + '): <meta> e header divergem');
  }
});

test('CSP do /orcamento: sem origem que a página não usa (Google), com Mercado Pago e Cloudflare', () => {
  const csp = cspDoHeader('/orcamento');
  assert.ok(!/google|doubleclick|googlesyndication|googleadservices|googletagmanager/i.test(csp), 'sem Google: ' + csp);
  const html = readFileSync(new URL('orcamento.html', RAIZ), 'utf8');
  assert.ok(!/googletagmanager/.test(html), 'a página não carrega o Google');
  /* a medição entra só para decidir o que é contato (métricas próprias), sem o Google: data-sem-google */
  const scripts = html.match(/<script[^>]*medicao\.js[^>]*>/g) || [];
  assert.equal(scripts.length, 1, 'o orçamento carrega a medição uma vez (sem ela, o WhatsApp de lá deixa de contar)');
  assert.ok(scripts.every(s => /\sdata-sem-google[\s>]/.test(s)), 'medicao.js no orçamento só com data-sem-google: ' + scripts.join(' '));
  const d = diretivas(csp);
  for (const origem of ['https://sdk.mercadopago.com', 'https://challenges.cloudflare.com']) assert.ok(d['script-src'].includes(origem), origem);
  for (const origem of ['https://secure-fields.mercadopago.com', 'https://challenges.cloudflare.com']) assert.ok(d['frame-src'].includes(origem), origem);
});

/* (auditoria 2026-10-09, segurança 1) o .vercelignore pode não valer num deploy feito pelo Git: o que é do repositório
   e não é página nem asset tem de ter uma regra no vercel.json que o tire do ar (o mesmo padrão de /docs e /supabase:
   redirect para a página inicial). A lista vem do próprio git: um arquivo ou pasta novo na raiz sem regra falha aqui. */
const PUBLICO = new Set(['api/', 'assets/', 'css/', 'js/', 'vendor/', 'robots.txt', 'sitemap.xml', 'favicon.ico']);   /* (favicon.ico: os navegadores e robôs pedem /favicon.ico por padrão) */
const ehPublico = nome => PUBLICO.has(nome) || /^[a-z0-9-]+\.(html|css)$/.test(nome);
const REDIRECTS = JSON.parse(readFileSync(new URL('vercel.json', RAIZ), 'utf8')).redirects || [];
/* a forma de caminho da Vercel (path-to-regexp): ":nome*" casa zero ou mais segmentos, ":nome" casa um trecho */
const casaRedirect = caminho => REDIRECTS.some(r => new RegExp('^' + r.source
  .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  .replace(/\/:[a-z]+\*/gi, '(?:/.*)?')
  .replace(/:[a-z]+\*/gi, '.*')
  .replace(/:[a-z]+/gi, '[^/]+') + '$').test(caminho));

const VERSIONADOS = execFileSync('git', ['ls-files'], { cwd: fileURLToPath(RAIZ), encoding: 'utf8' }).split('\n').filter(Boolean);
const LINHAS_IGNORE = readFileSync(new URL('.vercelignore', RAIZ), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
/* o que o .vercelignore tira do deploy, em caminho fixo ("/docs", "/js/nucleo/lab.js") */
const IGNORADOS = LINHAS_IGNORE.filter(l => !l.includes('*')).map(l => '/' + l.replace(/\/$/, ''));
const ignorado = arquivo => IGNORADOS.some(p => ('/' + arquivo).startsWith(p) && ['', '/'].includes(('/' + arquivo).slice(p.length, p.length + 1)))
  || (/\.log$/.test(arquivo) && LINHAS_IGNORE.includes('*.log'));

test('deploy: nada do repositório que não é página nem asset fica no ar (regra no vercel.json para cada um)', () => {
  const raiz = [...new Set(VERSIONADOS.map(f => (f.includes('/') ? f.split('/')[0] + '/' : f)))];
  assert.ok(raiz.includes('index.html') && raiz.includes('docs/'), 'leu a raiz do repositório: ' + raiz.join(' '));
  const internos = raiz.filter(n => !ehPublico(n));
  const sem = internos.filter(n => (n.endsWith('/') ? !(casaRedirect('/' + n.slice(0, -1)) && casaRedirect('/' + n + 'qualquer/coisa.md')) : !casaRedirect('/' + n)));
  assert.deepEqual(sem, [], 'sem regra no vercel.json (redirects): ' + sem.join(', '));
  /* o que o .vercelignore tira do deploy (caminho fixo, sem curinga) também tem a regra, para o caso de ele não valer */
  const semRegra = IGNORADOS.filter(p => !casaRedirect(p));
  assert.deepEqual(semRegra, [], 'no .vercelignore e sem regra no vercel.json: ' + semRegra.join(', '));
});

/* (revisão técnica do lote 1) o outro lado: nenhum redirect tira do ar um arquivo público versionado, e nenhuma regra fixa
   aponta para um arquivo que não existe (regra morta esconde erro de digitação na regra que importa) */
test('deploy: todo arquivo público versionado continua no ar; regra fixa só para arquivo que existe', () => {
  const publicos = VERSIONADOS.filter(f => ehPublico(f.includes('/') ? f.split('/')[0] + '/' : f) && !ignorado(f));
  assert.ok(publicos.includes('index.html') && publicos.some(f => f.startsWith('js/')) && publicos.some(f => f.startsWith('api/')), 'leu os públicos');
  const caminhos = publicos.flatMap(f => (/\.html$/.test(f) ? ['/' + f, '/' + f.replace(/\.html$/, '').replace(/^index$/, '')] : ['/' + f]));
  const pegos = caminhos.filter(p => casaRedirect(p) && !p.startsWith('/api/_'));   /* (/api/_* são módulos internos: a regra existe para eles) */
  assert.deepEqual(pegos, [], 'a regra tirou do ar um arquivo público: ' + pegos.join(', '));
  const fixas = REDIRECTS.map(r => r.source).filter(s => !s.includes(':'));
  const mortas = fixas.filter(s => !VERSIONADOS.includes(s.slice(1)) && !IGNORADOS.includes(s));
  assert.deepEqual(mortas, [], 'regra para arquivo que não existe no repositório: ' + mortas.join(', '));
});

/* (revisão final do PR 2a, B6) a CI grava no GITHUB_ENV valores gerados no próprio job (a chave do painel do E2E). O
   GitHub só esconde do log os segredos que ele conhece: o valor gerado vai mascarado (::add-mask::) ANTES de ser gravado,
   numa variável do shell, nunca por $(...) direto na linha que grava */
test('CI: todo valor gravado no GITHUB_ENV é mascarado antes (::add-mask::), sem $(...) na linha que grava', () => {
  const pasta = new URL('.github/workflows/', RAIZ);
  let gravacoes = 0;
  for (const arquivo of readdirSync(pasta).filter(f => /\.ya?ml$/.test(f))) {
    const linhas = readFileSync(new URL(arquivo, pasta), 'utf8').split(/\r?\n/);
    linhas.forEach((l, i) => {
      if (!/>>\s*"?\$GITHUB_ENV"?/.test(l)) return;
      gravacoes++;
      assert.ok(!l.includes('$('), arquivo + ':' + (i + 1) + ': valor calculado direto na linha que grava (o log não o esconde)');
      const v = /echo\s+"\w+=\$\{?(\w+)\}?"/.exec(l);
      assert.ok(v, arquivo + ':' + (i + 1) + ': grave a partir de uma variável do shell ("NOME=$VAR")');
      const mascara = linhas.slice(0, i).some(x => x.includes('echo "::add-mask::$' + v[1] + '"'));
      assert.ok(mascara, arquivo + ':' + (i + 1) + ': $' + v[1] + ' sem ::add-mask:: antes');
    });
  }
  assert.ok(gravacoes >= 1, 'a chave do painel do E2E é gravada no GITHUB_ENV (o teste tem o que provar)');
});

/* A LOGO (2026-10-12, 03 Projetos/marca/logo): entra como SVG no HTML. Pela CSP (style-src 'self') ela não pode
   trazer <style> nem style="", e não traz cor fixa: as cores vêm de css/tokens.css (.marca__*), para a logo
   acompanhar o evento ouro (js/ouro.js a tem entre os portadores). Nenhuma página fica com a marca escrita antiga. */
test('logo: as páginas usam a logo em SVG, sem estilo nem cor embutidos e com o nome acessível no link', () => {
  for (const arquivo of paginas) {
    const html = readFileSync(new URL(arquivo, RAIZ), 'utf8');
    assert.ok(!/class="wordmark|Beyon <b>Zero<\/b>/.test(html), arquivo + ': sobrou a marca escrita antiga');
    const logos = [...html.matchAll(/(<a [^>]*>)\s*(<svg[^>]*class="marca[ "][\s\S]*?<\/svg>)/g)];
    if (!/<a href="\/"/.test(html)) continue; // página sem link para o início não leva a logo
    assert.ok(logos.length >= 1, arquivo + ': sem a logo');
    for (const [, link, svg] of logos) {
      assert.ok(!/<style|style="/.test(svg), arquivo + ': estilo embutido na logo (a CSP bloqueia)');
      assert.ok(!/fill="#/.test(svg), arquivo + ': cor fixa na logo (o ouro não a alcançaria)');
      assert.match(svg, /aria-hidden="true"/, arquivo + ': a logo é desenho; o nome fica no link');
      assert.match(link, /aria-label="Beyon Zero — início"/, arquivo + ': link da logo sem nome acessível');
      /* o último "o" de Zero com o canal e a luz em toda logo, inclusive no topo (dono, 2026-10-14: "Quero essa parte da logo") */
      assert.match(svg, /class="marca__zero" d="[^"]*"\/>(<path class="marca__entrada" d="[^"]*"\/>)?<path class="marca__saida"/, arquivo + ': a logo sem a luz no "o" de Zero');
    }
    assert.ok((html.match(/id="marca-pulso"/g) || []).length <= 1, arquivo + ': o recorte da luz da logo repetido (id duplicado)');
  }
  const tokens = readFileSync(new URL('css/tokens.css', RAIZ), 'utf8');
  for (const peca of ['aro', 'lente', 'entrada', 'saida', 'nucleo', 'nome', 'zero']) assert.ok(tokens.includes('.marca__' + peca), 'tokens.css sem a cor de .marca__' + peca);
  /* no ouro (html.is-ouro, .is-brasa) e na volta (.is-frio) as duas cores próprias da logo trocam junto */
  for (const bloco of [/html\.is-ouro, \.is-brasa \{([^}]*)\}/, /\.is-frio \{([^}]*)\}/]) {
    const corpo = (tokens.match(bloco) || [])[1] || '';
    assert.match(corpo, /--logo-entrada:[^;]+;[\s\S]*--logo-nucleo:/, 'tokens.css: o ouro não alcança a entrada e o núcleo da logo em ' + bloco);
  }
  const ouro = readFileSync(new URL('js/ouro.js', RAIZ), 'utf8');
  assert.match(ouro.match(/var PORTADORES = '([^']*)'/)[1], /(^|, )\.marca(,|$)/, 'js/ouro.js: a logo fora dos portadores do ouro');
  /* a luz que passa pela logo some com movimento reduzido */
  const motion = readFileSync(new URL('css/motion.css', RAIZ), 'utf8');
  const reduzido = motion.slice(motion.search(/@media \(prefers-reduced-motion: reduce\) \{\r?\n/));
  assert.match(reduzido, /\.marca__pulso-in, \.marca__pulso-out \{ animation: none/, 'motion.css: a luz da logo não desliga com movimento reduzido');
});

/* A PLANTA (2026-10-14, a peça do cartão de Sites: docs/restructure/PECAS-SERVICOS.md). O visitante digita o
   nome do negócio dele: o nome entra na página só como texto (nada de innerHTML), nunca sai pela rede nem pela
   URL, e só vai ao orçamento (sessionStorage, nesta aba) se a pessoa clicar em "Quero o meu site". A peça segue a
   CSP (nenhum style="" no HTML) e funciona sem mouse: a régua é um slider com valor falado e as paradas são botões. */
/* O DESPACHO e O PLANTÃO (as peças de Automação e do Atendente): nenhum estilo embutido, texto só como texto,
   nada sai pela rede nem pela URL, o que vai a outra página só no clique de um botão de ação, e controles de
   verdade (botões; a régua de horas é um slider com valor falado). */
test('peças de Automação e do Atendente: CSP, nada sai da página e controles acessíveis', () => {
  const html = readFileSync(new URL('index.html', RAIZ), 'utf8');
  for (const [marca, js] of [['data-despacho', 'js/peca-automacao.js'], ['data-plantao', 'js/peca-atendente.js']]) {
    const peca = (html.match(new RegExp('<div class="[a-z]+" ' + marca + '[\\s\\S]*?<\\/article>')) || [])[0];
    assert.ok(peca, 'index.html: o cartão sem a peça ' + marca);
    assert.ok(!/style="/.test(peca), 'index.html: estilo embutido na peça ' + marca + ' (a CSP bloqueia)');
    assert.ok(/<button type="button"/.test(peca), 'a peça ' + marca + ' precisa de botões de verdade');
    const codigo = readFileSync(new URL(js, RAIZ), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(codigo), js + ': texto só como texto');
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|location\s*=|location\.href\s*=|history\.(push|replace)State|localStorage/.test(codigo), js + ': nada sai pela rede, pela URL nem fica guardado');
    const guardados = (codigo.match(/sessionStorage\.setItem/g) || []).length;
    const noClique = (codigo.match(/quero\.addEventListener\('click'[\s\S]*?\n  \}\);/) || [''])[0];
    assert.equal((noClique.match(/sessionStorage\.setItem/g) || []).length, guardados, js + ': só o clique do botão de ação guarda algo para a outra página');
  }
  const plantao = (html.match(/<div class="plantao__slider"[^>]*>/) || [''])[0];
  for (const a of ['role="slider"', 'tabindex="0"', 'aria-label=', 'aria-valuemin=', 'aria-valuemax=', 'aria-valuenow=', 'aria-valuetext=']) assert.ok(plantao.includes(a), 'régua de horas sem ' + a);
});

test('peça de Sites: o nome não sai da página, a CSP vale e a régua é acessível', () => {
  const html = readFileSync(new URL('index.html', RAIZ), 'utf8');
  const peca = (html.match(/<div class="planta" data-planta[\s\S]*?<\/article>/) || [])[0];
  assert.ok(peca, 'index.html: o cartão de Sites sem a peça');
  assert.ok(!/style="/.test(peca), 'index.html: estilo embutido na peça (a CSP bloqueia)');
  assert.ok(!/<style|\sstyle="|\son[a-z]+=/.test(html), 'index.html: <style>, style="" ou handler inline (a CSP bloqueia)');
  const slider = (peca.match(/<div class="planta__slider"[^>]*>/) || [''])[0];
  for (const a of ['role="slider"', 'tabindex="0"', 'aria-label=', 'aria-valuemin=', 'aria-valuemax=', 'aria-valuenow=', 'aria-valuetext=']) assert.ok(slider.includes(a), 'régua sem ' + a);
  assert.equal((peca.match(/<button type="button" class="planta__parada"/g) || []).length, 3, 'as três paradas da régua têm de ser botões');
  assert.match(peca, /<label class="planta__nome">[\s\S]*?<input[^>]*aria-describedby="planta-nota"[^>]*data-planta-campo/, 'o campo do nome sem rótulo ou sem a nota de privacidade');
  const js = readFileSync(new URL('js/peca-sites.js', RAIZ), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js), 'js/peca-sites.js: o nome tem de entrar como texto');
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|navigator\.sendBeacon|location\s*=|location\.href\s*=|history\.(push|replace)State/.test(js), 'js/peca-sites.js: o nome não pode sair pela rede nem pela URL');
  const usos = js.match(/sessionStorage\.setItem/g) || [];
  const noClique = (js.match(/quero\.addEventListener\('click'[\s\S]*?\n  \}\);/) || [''])[0];
  assert.ok(usos.length > 0 && (noClique.match(/sessionStorage\.setItem/g) || []).length === usos.length, 'js/peca-sites.js: o nome só pode ir para o sessionStorage no clique de "Quero o meu site"');
});
