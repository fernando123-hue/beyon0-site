/* O FAQ de cada página existe em DOIS lugares: o FAQPage (JSON-LD, que o Google lê) e a seção #faq (o que o visitante
   lê). Os comentários das páginas pedem que sejam idênticos; em 2026-10-09 uma troca de texto deixou o visível com
   "RR$ nbsp;1.500" e o JSON-LD certo, e nada pegou (revisão de segurança do PR da copy). Este teste prende os dois:
   toda pergunta do JSON-LD aparece no FAQ visível com a mesma resposta, e vice-versa.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('../../', import.meta.url);
const ENTIDADES = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#8239;': ' ', '&lt;': '<', '&gt;': '>' };
const limpar = t => t.replace(/<[^>]+>/g, '').replace(/&[#a-z0-9]+;/gi, e => ENTIDADES[e] ?? e).replace(/\s+/g, ' ').trim();

function doJsonLd(html) {
  const pares = new Map();
  for (const [, bloco] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const dado = JSON.parse(bloco);
    if (dado['@type'] !== 'FAQPage') continue;
    for (const q of dado.mainEntity) pares.set(limpar(q.name), limpar(q.acceptedAnswer.text));
  }
  return pares;
}

function doVisivel(html) {
  const pares = new Map();
  for (const [, item] of html.matchAll(/<details[^>]*class="qa"[^>]*>([\s\S]*?)<\/details>/g)) {
    const q = item.match(/<span class="qa__q">([\s\S]*?)<\/span>/);
    const a = item.match(/<div class="qa__a">([\s\S]*?)<\/div>/);
    if (q && a) pares.set(limpar(q[1]), limpar(a[1]));
  }
  return pares;
}

const paginas = readdirSync(RAIZ).filter(f => f.endsWith('.html'))
  .map(f => ({ f, html: readFileSync(new URL(f, RAIZ), 'utf8') }))
  .filter(p => p.html.includes('"FAQPage"'));

test('há páginas com FAQPage para conferir', () => {
  assert.ok(paginas.length >= 2, 'esperava sites e automação: ' + paginas.map(p => p.f).join(', '));
});

for (const { f, html } of paginas) {
  test(f + ': o FAQ visível é o mesmo do JSON-LD, pergunta a pergunta', () => {
    const ld = doJsonLd(html), visto = doVisivel(html);
    assert.deepEqual([...visto.keys()].sort(), [...ld.keys()].sort(), 'as mesmas perguntas nos dois lugares');
    for (const [q, a] of ld) assert.equal(visto.get(q), a, f + ' — resposta diferente em: ' + q);
  });
}

/* enquanto o orçamento é sem IA (spec 2026-10-11 §1), nenhuma página promete o consultor de IA nem fala em "sob medida" */
test('nenhuma página promete o consultor de IA enquanto o orçamento é sem IA (spec 2026-10-11 §1)', () => {
  for (const pagina of ['index.html', 'sites.html', 'orcamento.html', 'privacidade.html', 'condicoes.html']) {
    const html = readFileSync(new URL('../../' + pagina, import.meta.url), 'utf8').replace(/<!--[^]*?-->/g, '');
    assert.ok(!/consultor de IA/i.test(html), pagina + ' ainda fala em "consultor de IA"');
    assert.ok(!/sob medida/i.test(html.replace(/sistema_sob_medida|sob_medida/g, '')), pagina + ' usa "sob medida"');
  }
});

/* o preço que o FAQ de sites.html cita sai da tabela: em 2026-10-14 o dono mudou landing e institucional, e nada ligava
   o texto à tabela (o orçamento mostraria um preço e o FAQ outro) */
test('sites.html: o FAQ de preço diz as bases da tabela, e a área restrita vai para a conversa', () => {
  const regras = JSON.parse(readFileSync(new URL('docs/fase2/regras-rascunho-v1.json', RAIZ), 'utf8'));
  const real = v => 'R$ ' + v.toLocaleString('pt-BR');
  const faq = [...doJsonLd(readFileSync(new URL('sites.html', RAIZ), 'utf8')).values()].find(r => r.startsWith('A landing page começa em'));
  assert.ok(faq, 'a resposta de preço sumiu do FAQ de sites.html');
  const f = regras.formatos;
  assert.ok(faq.includes('A landing page começa em ' + real(f.landing_page.base) + ', o site institucional em ' + real(f.institucional.base)
    + ', a loja virtual em ' + real(f.loja_plataforma.base) + ' e a experiência digital em ' + real(f.sob_medida.base) + '.'), faq);
  assert.equal(regras.adicionais.area_restrita.fora_do_automatico, true);
  assert.ok(faq.includes('Área restrita com login começa em R$ 4.500 e é orçada numa conversa, com o escopo escrito.'), faq);
});

/* os cartões de formato também citam preço (revisão do PR #42: sites.html e index.html ficaram com 1.500 e 3.500
   depois de a tabela mudar). Cada "A partir de R$ X" do cartão sai da base do formato do título dele. */
test('sites.html e index.html: o preço dos cartões de formato é a base da tabela', () => {
  const regras = JSON.parse(readFileSync(new URL('docs/fase2/regras-rascunho-v1.json', RAIZ), 'utf8'));
  const real = v => 'R$ ' + v.toLocaleString('pt-BR');
  const f = regras.formatos;
  const base = { 'Site institucional': f.institucional.base, 'Landing page': f.landing_page.base, 'Experiência digital': f.sob_medida.base,
    'Loja virtual': f.loja_plataforma.base, 'Sites': f.landing_page.base };
  let vistos = 0;
  for (const arquivo of ['sites.html', 'index.html']) {
    const html = readFileSync(new URL(arquivo, RAIZ), 'utf8');
    for (const [, titulo, para] of html.matchAll(/<h3 id="(?:formato|servico)-\d+-t">([^<]+)<\/h3>[\s\S]*?<span class="servico__para">([^<]*)<\/span>/g)) {
      const preco = limpar(para).match(/R\$ \d{1,3}(?:\.\d{3})*/);   /* (sem o ponto final da frase) */
      if (!preco || !(titulo in base)) continue;
      vistos++;
      assert.equal(preco[0], real(base[titulo]), arquivo + ': cartão "' + titulo + '"');
    }
  }
  assert.ok(vistos >= 4, 'esperava os cartões de preço de sites.html e o de Sites em index.html: ' + vistos);
});
