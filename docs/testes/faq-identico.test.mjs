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

/* o site não escolhe para quem é o serviço nem diz a cidade (dono, 2026-10-28: "Nós não decidimos para quem é tal
   serviço"; "tire Rio de Janeiro do site"). A privacidade fica de fora: lá a identificação do controlador é exigência
   da LGPD. */
test('páginas de venda: sem cidade e sem público escolhido (sindicato, federação, cooperativa)', () => {
  for (const arquivo of ['index.html', 'sites.html', 'automacao.html', 'resumo.html', 'orcamento.html', '404.html']) {
    const html = readFileSync(new URL(arquivo, RAIZ), 'utf8').replace(/<!--[^]*?-->/g, '');
    const texto = limpar(html);
    assert.doesNotMatch(texto, /Rio de Janeiro|\bRJ\b/, arquivo + ': cidade na página');
    const publico = texto.match(/.{0,40}(sindicat|federaç|cooperativ).{0,40}/i);
    assert.equal(publico, null, arquivo + ': público escolhido: ' + (publico && publico[0]));
  }
});

/* os números da Prova são de pesquisas recentes (dono, 2026-10-28: "precisam estar mais recentes... as outras são de
   2010 e 2011, isso é preocupante"): toda fonte diz o ano, e o ano é 2024 ou depois */
test('Prova: toda fonte tem ano, e é de 2024 em diante', () => {
  for (const arquivo of ['index.html', 'sites.html']) {
    const html = readFileSync(new URL(arquivo, RAIZ), 'utf8');
    const fontes = [...html.matchAll(/<span class="prova__fonte">([^<]+)<\/span>/g)].map(m => limpar(m[1]));
    assert.ok(fontes.length >= 3, arquivo + ': esperava as 3 fontes da Prova');
    for (const f of fontes) {
      const ano = Number((f.match(/\b(19|20)\d{2}\b/) || [])[0]);
      assert.ok(ano >= 2024, arquivo + ': fonte velha ou sem ano: ' + f);
    }
  }
});
