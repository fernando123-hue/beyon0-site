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

/* preço só no orçamento/consultor (dono, 2026-10-28: "Os cards não podem mostrar o preço"; "Preços ficam
   exclusivamente com o consultor e vendedor de IA do site"). Nenhuma página de venda mostra valor em reais: nem cartão,
   nem plano, nem FAQ (o visível e o JSON-LD). Antes este arquivo conferia os preços do FAQ e dos cartões contra a tabela
   (2026-10-14, PR #42); com o preço fora das páginas, o texto não pode mais divergir da tabela. */
test('index, sites e automação: nenhum preço em reais na página (cartões, planos, FAQ)', () => {
  for (const arquivo of ['index.html', 'sites.html', 'automacao.html']) {
    const html = readFileSync(new URL(arquivo, RAIZ), 'utf8').replace(/<!--[^]*?-->/g, '');
    const achado = limpar(html).match(/.{0,60}R\$.{0,40}/);
    assert.equal(achado, null, arquivo + ': preço na página: ' + (achado && achado[0]));
  }
});
