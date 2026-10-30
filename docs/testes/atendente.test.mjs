/* A PÁGINA DO ATENDENTE E O SITE SEM WHATSAPP (PR "atendente"; Decisões 28/10 e 29/10): /automacao vira a página do atendente de IA no
   site do cliente (sem diagnóstico, sem capacidades, sem teste grátis, sem atendente no WhatsApp, sem plano nem limite de conversas);
   nenhuma página de venda tem botão, link ou número de WhatsApp da Beyon; o contato é o orçamento ou o recado, e as páginas com recado
   carregam js/recado.js e liberam o Turnstile na CSP.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lerHeaders, cabecalhosPara } from '../../cloudflare/cabecalhos.mjs';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = h => h.replace(/<!--[\s\S]*?-->/g, '');
const VENDA = ['index.html', 'sites.html', 'automacao.html', 'orcamento.html', 'resumo.html'];
const COM_RECADO = ['index.html', 'sites.html', 'automacao.html'];
const TURNSTILE = 'https://challenges.cloudflare.com';
const diretivas = csp => Object.fromEntries(String(csp || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const [k, ...v] = x.split(/\s+/); return [k, v]; }));
/* o que fica de propósito no orçamento: a confirmação do pedido pelo dono (passo 3), a linha legal do vendedor (passo 4) e a opção de objetivo
   "receber pedidos pelo WhatsApp", que é do site DO CLIENTE */
const semExcecoes = h => semComentarios(h)
  .replace(/<a[^>]*id="o-confirmar-wa"[\s\S]*?<\/a>/g, '')
  .replace(/<p[^>]*id="o-vendedor"[\s\S]*?<\/p>/g, '')
  .replace(/<button[^>]*data-objetivo="pedidos_whatsapp"[\s\S]*?<\/button>/g, '');

test('nenhuma página de venda tem link, botão ou número de WhatsApp da Beyon (só o orçamento mantém a confirmação do dono)', () => {
  for (const p of VENDA) {
    const h = semExcecoes(ler(p));
    assert.doesNotMatch(h, /wa\.me\/\d/, p + ': link wa.me com número');
    assert.doesNotMatch(h, /\sdata-wa(=|\s|>)/, p + ': data-wa');
    assert.doesNotMatch(h, /data-wa-padrao/, p + ': data-wa-padrao');
    assert.doesNotMatch(h, /class="(wa|barra__wa)"/, p + ': botão de WhatsApp flutuante ou da barra');
    assert.doesNotMatch(h, /5521977167944|97716-7944/, p + ': o número do dono');
    assert.doesNotMatch(h, /<(a|button)\b[^>]*>[^<]*WhatsApp[^<]*<\/(a|button)>/, p + ': link ou botão que fala de WhatsApp');
  }
});

test('o JS das páginas sem WhatsApp não monta link para o WhatsApp da Beyon', () => {
  const pagina = ler('js/pagina.js');
  assert.doesNotMatch(pagina, /linkWA|BEYON_TEL|wa\.me\/' \+ FONE/, 'js/pagina.js ainda monta o link do WhatsApp da Beyon');
  for (const p of ['index.html', 'sites.html', 'automacao.html', 'resumo.html']) assert.doesNotMatch(ler(p), /js\/tel\.js/, p + ': carrega o telefone do dono sem precisar');
  assert.ok(!fs.existsSync(new URL('../../js/lead-form.js', import.meta.url)), 'o modal "antes do WhatsApp" saiu junto com o diagnóstico');
});

test('o menu e o rodapé dizem "Atendente de IA" onde antes diziam "Automação & IA" (a URL /automacao continua)', () => {
  for (const p of ['index.html', 'sites.html', 'automacao.html', 'orcamento.html', '404.html']) {
    const h = semComentarios(ler(p));
    assert.doesNotMatch(h, /<a[^>]*>\s*Automação (&amp;|&) IA\s*<\/a>/, p + ': rótulo antigo');
    assert.doesNotMatch(h, /<h3[^>]*>\s*Automação (&amp;|&) IA/, p + ': cartão antigo');
  }
  for (const p of ['index.html', 'sites.html', 'orcamento.html']) {
    assert.match(semComentarios(ler(p)), /<nav class="nav__links"[\s\S]*?<a href="\/automacao">Atendente de IA<\/a>/, p + ': o menu sem "Atendente de IA"');
  }
  assert.match(semComentarios(ler('index.html')), /<a href="\/automacao">Atendente de IA<\/a>[\s\S]*<\/footer>/, 'rodapé do Início');
});

test('/automacao é a página do atendente: título, descrição, JSON-LD e FAQ falam do atendente no site', () => {
  const h = ler('automacao.html');
  assert.match(h, /<title>[^<]*Atendente de IA[^<]*<\/title>/);
  assert.match(h, /<meta name="description" content="[^"]*atendente[^"]*"/i);
  assert.match(h, /<meta property="og:title" content="[^"]*Atendente de IA/);
  const blocos = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const servico = blocos.find(b => b['@type'] === 'Service');
  assert.ok(servico && /atendente/i.test(servico.name), 'JSON-LD Service sem o atendente');
  assert.doesNotMatch(JSON.stringify(blocos), /Diagnóstico de IA|Agentes de IA|Inteligência sobre dados|Sistemas e interfaces/);
});

test('/automacao não vende o que saiu: diagnóstico, capacidades, o fluxo "toque num pedido", teste grátis, atendente no WhatsApp, planos e áudio', () => {
  const h = semComentarios(ler('automacao.html'));
  const texto = h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(texto, /diagn[óo]stico/i, 'diagnóstico');
  assert.doesNotMatch(texto, /gr[áa]tis/i, 'grátis');
  assert.doesNotMatch(texto, /atendente[^.]{0,60}WhatsApp|WhatsApp[^.]{0,60}atendente/i, 'atendente no WhatsApp');
  assert.doesNotMatch(texto, /Essencial|Profissional|Avançado|conversas por mês/, 'planos e limites');
  assert.doesNotMatch(texto, /entende [áa]udio|\báudio\b/i, 'áudio');
  assert.doesNotMatch(texto, /R\$\s*\d/, 'preço');
  assert.doesNotMatch(h, /data-despacho|class="malha|class="celula|despacho__|lead-modal|peca-automacao/, 'sobrou peça ou seção da automação');
  for (const f of ['js/peca-automacao.js', 'css/peca-automacao.css']) assert.ok(!fs.existsSync(new URL('../../' + f, import.meta.url)), f + ' ficou morto');
});

test('/automacao é mínima e não rasa: o que é, o que resolve, como funciona, a peça, o FAQ e o fecho com orçamento e recado', () => {
  const h = semComentarios(ler('automacao.html'));
  for (const id of ['atendente', 'processo', 'faq', 'contato']) assert.match(h, new RegExp('<section[^>]*id="' + id + '"'), 'seção #' + id);
  assert.match(h, /data-plantao/, 'a peça do atendente (chat no canto de um site de exemplo)');
  assert.match(h, /<a[^>]*href="\/orcamento"[^>]*>[^<]*Monte seu orçamento/, 'CTA "Monte seu orçamento"');
  assert.match(h, /data-recado(-abrir)?[\s>=]/, 'um local de recado');
  const perguntas = [...h.matchAll(/<span class="qa__q">([^<]+)<\/span>/g)].map(m => m[1]);
  assert.ok(perguntas.length >= 5 && perguntas.length <= 8, 'FAQ curto: ' + perguntas.length);
  assert.ok(perguntas.some(q => /pessoa|equipe|dono/i.test(q)), 'o FAQ explica quando chama uma pessoa');
  assert.ok(perguntas.some(q => /IA|rob[ôo]/.test(q)), 'o FAQ diz que é IA');
});

test('páginas com recado carregam js/recado.js e liberam o Turnstile (script, frame e connect) na <meta> e nos cabeçalhos', () => {
  const regras = lerHeaders(fs.readFileSync(RAIZ + '/_headers', 'utf8'));
  const vercel = JSON.parse(fs.readFileSync(RAIZ + '/vercel.json', 'utf8')).headers;
  for (const p of VENDA.filter(x => /data-recado/.test(ler(x)) && x !== 'orcamento.html')) assert.ok(COM_RECADO.includes(p), p + ' tem recado mas não está na lista de páginas com Turnstile');
  for (const p of COM_RECADO) {
    const h = ler(p);
    assert.match(h, /data-recado(-abrir)?[\s>=]/, p + ': sem local de recado');
    assert.match(h, /<script src="js\/recado\.js" defer><\/script>/, p + ': sem js/recado.js');
    const caminho = '/' + p.replace(/\.html$/, '').replace(/^index$/, '');
    const meta = diretivas((h.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/) || [])[1]);
    const header = diretivas(cabecalhosPara(regras, caminho).get('content-security-policy'));
    let vz = null;
    for (const r of vercel) if (new RegExp('^' + r.source + '$').test(caminho)) vz = (r.headers.find(x => x.key === 'Content-Security-Policy') || {}).value || vz;
    for (const [onde, d] of [['meta', meta], ['_headers', header], ['vercel.json', diretivas(vz)]]) {
      for (const dir of ['script-src', 'frame-src', 'connect-src']) assert.ok(d[dir] && d[dir].includes(TURNSTILE), p + ' (' + onde + '): ' + dir + ' sem o Turnstile');
      assert.ok(!/'unsafe-inline'|'unsafe-eval'/.test(JSON.stringify(d)), p + ' (' + onde + '): nada de inline nem eval');
    }
  }
  /* o resto do site não ganha o Turnstile à toa */
  for (const caminho of ['/privacidade', '/condicoes', '/resumo', '/qualquer-coisa']) {
    assert.ok(!cabecalhosPara(regras, caminho).get('content-security-policy').includes(TURNSTILE), caminho + ': não usa o recado');
  }
});

test('as medições contam recado e orçamento, não clique de WhatsApp da Beyon', () => {
  const m = ler('js/medicao.js');
  assert.match(m, /data-recado-abrir/, 'o clique em "Deixar um recado" é um contato');
  assert.doesNotMatch(m.replace(/\/\*[\s\S]*?\*\//g, ''), /lead-modal/, 'o modal do diagnóstico saiu');
});

test('limpeza do #65 (MEDIUM): sem sessionStorage "bz-formato" sem leitor, sem --luz-x/--luz-w mortos, o Início fala dos 4 formatos de /sites', () => {
  const sites = ler('js/peca-sites.js');
  assert.doesNotMatch(sites, /bz-formato/);
  assert.doesNotMatch(ler('css/cartoes.css'), /--luz-x|--luz-w/);
  const inicio = semComentarios(ler('index.html'));
  assert.match(inicio, /<ul class="servico__formatos"[\s\S]*?<\/ul>/);
  assert.equal((inicio.match(/<ul class="servico__formatos"[\s\S]*?<\/ul>/)[0].match(/<li>/g) || []).length, 4, 'os 4 formatos de /sites');
});

test('a página do atendente não promete o valor "no orçamento" (o orçamento só calcula sites) e o botão principal abre o recado', () => {
  const html = fs.readFileSync(new URL('../../automacao.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /valor aparece no orçamento|O valor sai do orçamento|veja o valor antes de pagar/i);
  const botoes = html.match(/<button[^>]*class="btn btn--primary[^"]*"[^>]*>/g) || [];
  assert.ok(botoes.length >= 3 && botoes.every(b => /data-recado-abrir/.test(b)), 'hero, conversa e barra do celular abrem o recado');
});

test('erros do orçamento não mandam mais falar pelo WhatsApp (a saída é o recado)', () => {
  for (const f of ['js/orcamento-pagamento.js', 'js/orcamento-detalhes.js']) {
    assert.doesNotMatch(fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8'), /fale com a Beyon Zero pelo WhatsApp/, f);
  }
});

test('o e-mail da empresa é o canal escrito (Decreto 7.962): rodapé, orçamento sem JS, condições e privacidade, sem wa.me', () => {
  const MAILTO = 'href="mailto:contato.beyon.zero@gmail.com"';
  for (const p of ['index.html', 'sites.html', 'automacao.html']) assert.match(ler(p).match(/<p class="footer__contato">.*<\/p>/)[0], new RegExp(MAILTO), p);
  assert.match(ler('orcamento.html').match(/<noscript><p class="orc-aviso[\s\S]*?<\/noscript>/)[0], new RegExp(MAILTO), 'orçamento sem JS');
  for (const p of ['condicoes.html', 'privacidade.html']) {
    assert.match(ler(p), new RegExp(MAILTO), p);
    assert.doesNotMatch(ler(p), /wa\.me/, p);
  }
});
