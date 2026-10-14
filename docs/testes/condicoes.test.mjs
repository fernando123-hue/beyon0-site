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

test('condições: o rodapé de toda página com "Privacidade" leva também às condições', () => {
  const comRodape = readdirSync(RAIZ).filter(f => f.endsWith('.html') && ler(f).includes('footer__legal'));
  assert.ok(comRodape.length >= 4, 'esperava index, sites, automação e orçamento: ' + comRodape.join(', '));
  for (const f of comRodape) assert.match(ler(f), /<a href="\/privacidade">Privacidade<\/a>\s*<a href="\/condicoes">Condições do lançamento<\/a>/, f + ': sem o link das condições ao lado de Privacidade');
});

/* a oferta vence em 31/12/2026 ou no 10º cliente: a página é para quem recebe o link, não para o Google (decisão do coordenador, 2026-10-14) */
test('condições: fora do Google (noindex) e fora do sitemap', () => {
  assert.match(html, /<meta name="robots" content="noindex, follow" \/>/);
  assert.ok(!/condicoes/.test(ler('sitemap.xml')), 'a página está no sitemap');
});

test('condições: desistência diz os 7 dias (CDC art. 49), a devolução inteira e como pedir', () => {
  assert.match(texto, /Até 7 dias depois de aceitar.*entrada inteira \(Código de Defesa do Consumidor, art\. 49\)/);
  assert.match(texto, /Depois dos 7 dias, se eu ainda não comecei o site, devolvo a entrada inteira/);
  assert.match(texto, /Se eu já comecei, a entrada fica/);
  assert.match(html, /<a data-wa="[^"]*desistir[^"]*" href="https:\/\/wa\.me\/\d+">WhatsApp da Beyon Zero<\/a>/);
  assert.match(texto, /devolução é imediata, pelo mesmo meio do pagamento \(o Pix\), com o valor corrigido/);
  assert.match(texto, /orçamento automático do site segue a tabela normal/);
});

/* a política de privacidade cobre o que a captação faz (Decisões 2026-10-12; docs/lgpd/ da captação) */
test('privacidade: cobre o primeiro contato, o Pix direto e a indicação', () => {
  const priv = ler('privacidade.html').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  for (const trecho of ['Quando a Beyon Zero procura o seu negócio', 'cadastro público de empresas da Receita Federal', 'legítimo interesse (artigo 7º, inciso IX',
    'responda “não”', '90 dias depois do último envio', '12 meses', 'Pix direto', 'Quem indica um negócio']) assert.ok(priv.includes(trecho), 'privacidade sem: ' + trecho);
});
