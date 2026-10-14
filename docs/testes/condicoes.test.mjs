/* A PÁGINA DE CONDIÇÕES DO LANÇAMENTO (/condicoes): o texto foi aprovado pelo dono em 2026-10-12 (03 Projetos/captacao/
   docs/parte6/condicoes-lancamento.md). Este teste prende o que não pode derivar sem ninguém ver: marcador do texto
   (`{data_do_primeiro_envio}`) que sobrou na página, valor que não fecha (R$ 800 = 320 + 480; 40% + 60%), estilo
   embutido (a CSP bloqueia), a página fora do rodapé ou do sitemap.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('../../', import.meta.url);
const ler = arquivo => readFileSync(new URL(arquivo, RAIZ), 'utf8');
const html = ler('condicoes.html');
const visivel = html.replace(/<!--[^]*?-->/g, '').replace(/<script[^]*?<\/script>/g, '');
const texto = visivel.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

test('condições: nenhum marcador do texto aprovado sobrou na página', () => {
  assert.deepEqual(texto.match(/\{[a-z_]+\}/g) || [], [], 'marcador {…} sem preencher');
  assert.ok(!/\[[^\]]*(?:nome|número|endereço)[^\]]*\]/i.test(texto), 'campo [entre colchetes] sem preencher');
});

test('condições: CSP sem inline e página de texto sem script próprio', () => {
  assert.ok(!/<style|\sstyle="/.test(html), 'estilo embutido (a CSP bloqueia)');
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'script embutido (a CSP bloqueia)');
});

test('condições: preço, entrada e restante fecham, e a entrada é 40%', () => {
  const [, preco, entrada, restante] = texto.match(/R\$ (\d+) por site.*?R\$ (\d+) \(40%\) para começar.*?R\$ (\d+) \(60%\) quando o site estiver no ar/) || [];
  assert.ok(preco, 'não achei preço, entrada (40%) e restante (60%) no texto');
  assert.equal(Number(entrada) + Number(restante), Number(preco), 'entrada + restante diferem do preço');
  assert.equal(Number(entrada) / Number(preco), 0.4);
  const painel = [...html.matchAll(/<dd>R\$&nbsp;(\d+)/g)].map(m => Number(m[1]));
  assert.deepEqual(painel, [Number(preco), Number(entrada), Number(restante)], 'o painel de valores diverge do texto');
});

test('condições: meta, canonical e OG apontam para /condicoes no domínio vigente (decisão do dono, 2026-10-14)', () => {
  for (const re of [/rel="canonical" href="https:\/\/beyon0-site\.vercel\.app\/condicoes"/, /property="og:url" content="https:\/\/beyon0-site\.vercel\.app\/condicoes"/,
    /property="og:title"/, /property="og:image" content="https:\/\/beyon0-site\.vercel\.app\/assets\/og-cover\.jpg"/, /name="description"/, /<h1>Condições do lançamento<\/h1>/]) {
    assert.match(html, re);
  }
  assert.ok(!/https?:\/\/(?!beyon0-site\.vercel\.app|wa\.me|www\.w3\.org)/.test(visivel.replace(/http-equiv[^>]*>/, '')), 'domínio ou link externo fora do combinado');
});

test('condições: o rodapé de toda página com "Privacidade" leva também às condições, e o sitemap a lista', () => {
  const comRodape = readdirSync(RAIZ).filter(f => f.endsWith('.html') && ler(f).includes('footer__legal'));
  assert.ok(comRodape.length >= 4, 'esperava index, sites, automação e orçamento: ' + comRodape.join(', '));
  for (const f of comRodape) assert.match(ler(f), /<a href="\/privacidade">Privacidade<\/a>\s*<a href="\/condicoes">Condições do lançamento<\/a>/, f + ': sem o link das condições ao lado de Privacidade');
  assert.match(ler('sitemap.xml'), /<loc>https:\/\/beyon0-site\.vercel\.app\/condicoes<\/loc>/);
});
