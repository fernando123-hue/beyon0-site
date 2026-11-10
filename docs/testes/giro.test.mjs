/* O GIRO do h1 da home (dono 09/11: "vamos usar o efeito de glitch para o hero ir mudando com o tempo").
   Contrato estático: a 1ª frase é a do leitor de tela e de quem está sem JS ou com menos movimento; as outras
   são só visuais; o efeito não usa desfoque e para com o interruptor de movimento. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RAIZ = new URL('../../', import.meta.url);
const ler = (arquivo) => readFileSync(new URL(arquivo, RAIZ), 'utf8');

test('giro: três frases no h1, a 1ª à mostra e lida; as outras escondidas do leitor de tela', () => {
  const h1 = ler('index.html').match(/<h1 class="hero__title hero__title--giro"[^>]*>([\s\S]*?)<\/h1>/);
  assert.ok(h1, 'index.html: o h1 do giro sumiu');
  const frases = [...h1[1].matchAll(/<span class="giro__frase( is-ativa)?"( aria-hidden="true")?>/g)];
  assert.equal(frases.length, 3, 'o h1 deve ter as 3 frases escolhidas pelo dono');
  assert.ok(frases[0][1] && !frases[0][2], 'a 1ª frase nasce à mostra e é a lida pelo leitor de tela');
  for (const f of frases.slice(1)) assert.ok(!f[1] && f[2], 'as outras frases nascem escondidas e com aria-hidden');
});

test('giro: com outra frase à mostra, a 1ª continua na árvore de acessibilidade (o h1 nunca fica sem nome)', () => {
  const css = ler('css/base.css');
  /* visibility: hidden ou display: none tiram a 1ª frase do leitor de tela enquanto a 2ª/3ª (aria-hidden) aparece */
  const esconde = [...css.matchAll(/([^{}]*\.giro__frase[^{}]*)\{([^}]*)\}/g)]
    .filter(([, seletor, corpo]) => /:not\(\.is-ativa\)/.test(seletor) && /visibility:\s*hidden|display:\s*none/.test(corpo));
  assert.ok(esconde.length >= 1, 'css/base.css: as frases inativas precisam sumir da tela');
  for (const [, seletor] of esconde) assert.match(seletor, /:not\(:first-child\)/, 'css/base.css: a regra "' + seletor.trim() + '" tira a 1ª frase do leitor de tela');
  assert.match(css, /\.giro__frase:first-child:not\(\.is-ativa\)\s*\{[^}]*opacity:\s*0/, 'css/base.css: a 1ª frase inativa deve sumir só da vista (opacity), não da árvore');
});

test('giro: só transform e opacity, sem desfoque, e para com o interruptor, a aba oculta e fora da tela', () => {
  const js = ler('js/giro.js');
  assert.ok(!/blur|\bfilter\s*:|'filter'/i.test(js.replace(/\/\*[\s\S]*?\*\//g, '')), 'js/giro.js: nada de desfoque (regra do dono)');
  assert.match(js, /menos-movimento/, 'js/giro.js: não respeita o interruptor de movimento');
  assert.match(js, /B\.reduced/, 'js/giro.js: não respeita o movimento reduzido');
  assert.match(js, /document\.hidden/, 'js/giro.js: segue girando com a aba oculta');
  assert.match(js, /IntersectionObserver/, 'js/giro.js: segue girando fora da tela');
  assert.match(js, /setAttribute\('aria-hidden', 'true'\)/, 'js/giro.js: as camadas do glitch seriam lidas pelo leitor de tela');
  const html = ler('index.html');
  assert.match(html, /<script src="js\/giro\.js" defer><\/script>/, 'index.html: o giro deve carregar com defer');
});
