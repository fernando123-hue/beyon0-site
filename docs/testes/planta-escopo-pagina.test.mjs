/* O RADAR DO ESCOPO NA PÁGINA: o HTML do painel, o CSS e a ligação (orcamento.html, css/orcamento-escopo.css, js/orcamento-escopo*.js,
   js/orcamento.js, js/orcamento-perguntas.js). O comportamento de verdade é provado no navegador por docs/e2e-escopo.mjs; aqui ficam as regras
   que não podem desandar sem ninguém ver: a ordem do painel (radar, ação principal, detalhes), os ids que o E2E do CI lê, nada inline (CSP),
   sem região viva nova, a altura reservada no CSS, sem desfoque/brilho/gradiente, nenhuma variável por quadro, movimento reduzido, o ouro só
   no confirmado, sem GSAP e sem preço calculado na tela.  node --test docs/testes/planta-escopo-pagina.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const html = ler('orcamento.html'), css = semComentarios(ler('css/orcamento-escopo.css'));
const aside = html.slice(html.indexOf('<aside class="orc-painel"'), html.indexOf('</aside>'));
const VIEW = semComentarios(ler('js/orcamento-escopo.js')), BARRA = semComentarios(ler('js/orcamento-escopo-barra.js'));

test('o painel abre pelo radar: #o-rde é o 1º filho do <aside>, depois a ação principal (#o-est-acoes), depois os detalhes (#o-est)', () => {
  const corpo = semComentarios(aside.slice(aside.indexOf('>') + 1)).trim();
  assert.match(corpo, /^<section class="rde" id="o-rde"/);
  const i = (id) => aside.indexOf('id="' + id + '"');
  assert.ok(i('o-rde') < i('o-est-acoes') && i('o-est-acoes') < i('o-est') && i('o-est') < i('o-peca'), 'ordem: radar, ações, detalhes, peças');
  assert.ok(i('o-quero-modelos') < i('o-vizinhos'), 'no 1.280 x 800 o "Quero os três modelos" vem antes dos vizinhos (cabe sem rolar o painel)');
  assert.match(html, /<aside class="orc-painel"[^>]*aria-labelledby="o-est-titulo"/);
  assert.match(aside, /<h2 id="o-est-titulo" class="rde__titulo">Radar do seu projeto<\/h2>/, 'o nome do painel é o título do radar (h2)');
  assert.equal((html.match(/id="o-radar"/g) || []).length, 0, 'o radar antigo saiu');
});

test('o cartão de investimento guarda TODOS os ids que o E2E do CI e o js/orcamento.js leem, dentro de #o-est', () => {
  const est = aside.slice(aside.indexOf('id="o-est"'), aside.indexOf('id="o-sugestao"'));
  for (const id of ['o-est-vazio', 'o-est-cheio', 'o-est-formato', 'o-est-valor', 'o-est-motivo', 'o-est-prazo', 'o-est-sinal', 'o-est-resto', 'o-est-assumido', 'o-est-itens',
    'o-est-fase', 'o-est-fase-itens', 'o-est-fase-valor', 'o-est-inclui-caixa', 'o-est-inclui', 'o-est-sem-risco', 'o-est-mais']) {
    assert.equal((est.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  }
  for (const id of ['o-est-acoes', 'o-vizinhos', 'o-est-erro', 'o-est-sugerido', 'o-quero-modelos', 'o-ajustar-abrir', 'o-p-refazer', 'o-diagnostico', 'o-sugestao', 'o-peca']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  }
});

test('acessível: "Ver como o valor é formado" é um <button> com aria-expanded e aria-controls; sem região viva no radar; os cantos são texto com o nível por extenso', () => {
  assert.match(aside, /<button class="rde-abrir[^"]*" type="button" id="o-rde-abrir" aria-expanded="false" aria-controls="o-est-mais"/);
  const rde = aside.slice(aside.indexOf('id="o-rde"'), aside.indexOf('id="o-est-acoes"'));
  assert.doesNotMatch(rde, /aria-live|role="status"|role="alert"/);
  for (const q of ['entrega', 'escopo', 'integracoes', 'prazo']) assert.match(rde, new RegExp('id="o-rde-' + q + '"><span class="rde-canto__nome">[^<]+</span> <span class="rde-canto__valor">A definir</span><span class="sr-only"> \\(pendente\\)</span>'));
  assert.match(rde, /<div class="rde-miolo" aria-hidden="true">/);
  assert.match(rde, /<p class="sr-only" id="o-rde-valor-sr">Investimento estimado: ainda sem valor\.<\/p>/);
  assert.equal((rde.match(/class="rde-trilha__nome"/g) || []).length, 5);
});

test('CSP e scripts: nada inline; o CSS e os 4 scripts do radar no lugar certo (painel antes, orcamento.js depois); sem GSAP nesta página', () => {
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /<style[\s>]/);
  assert.match(html, /<link rel="stylesheet" href="css\/orcamento-escopo\.css" \/>/);
  const pos = (s) => html.indexOf('<script src="js/' + s + '" defer></script>');
  const ordem = ['orcamento-painel.js', 'orcamento-escopo-estado.js', 'orcamento-escopo-desenho.js', 'orcamento-escopo-barra.js', 'orcamento-escopo.js', 'orcamento.js'].map(pos);
  assert.ok(ordem.every((p) => p > 0), JSON.stringify(ordem));
  assert.deepEqual(ordem.slice().sort((a, b) => a - b), ordem);
  assert.doesNotMatch(html, /gsap/i);
});

test('CSS: sem desfoque, brilho, sombra, filtro ou gradiente; só tokens; prefixo rde-; sem !important', () => {
  for (const re of [/blur\(/, /\bfilter\s*:/, /backdrop-filter/, /box-shadow/, /text-shadow/, /drop-shadow/, /gradient\(/, /mix-blend/, /!important/]) assert.doesNotMatch(css, re, String(re));
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'cor hexadecimal solta');
  const classes = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)));
  for (const c of classes) assert.match(c, /^(rde|is-|tem-barra-escopo|menos-movimento)/, '.' + c);
});

test('CSS: a altura é reservada antes do JS (desenho com aspect-ratio, cantos com 2 linhas, botão de detalhes guardando o lugar)', () => {
  assert.match(css, /\.rde-desenho \{[^}]*aspect-ratio: 1;/);
  assert.match(css, /\.rde-canto \{[^}]*min-height: calc\(/);
  assert.match(css, /\.rde-abrir\.is-vazio \{ visibility: hidden; \}/);
  assert.doesNotMatch(css, /\.rde-abrir\.is-vazio \{[^}]*display: none/);
  assert.match(css, /\.rde \{ container-type: inline-size;/, 'o tamanho do cartão não vem do conteúdo (a lição do radar antigo: sem isso a 320 px a viewport alargava)');
});

test('CSS: movimento contínuo só por @keyframes de transform (o ponteiro, só com atividade); nenhuma variável por quadro; movimento reduzido tira o ponteiro e as transições', () => {
  const kfs = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)];
  assert.deepEqual(kfs.map((k) => k[1]), ['rde-gira']);
  for (const k of kfs) { assert.doesNotMatch(k[2], /var\(/); assert.match(k[2], /^\s*from \{ transform: [^;]+; \} to \{ transform: [^;]+; \}\s*$/); }
  assert.doesNotMatch(css, /transition[^;]*--/);
  assert.match(css, /\.rde-varre \{ display: none;/);
  assert.match(css, /\.rde-g\.is-ativo \.rde-varre \{ display: inline; animation: rde-gira/);
  const reduz = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduz, /\.rde-g\.is-ativo \.rde-varre \{ display: none; animation: none; \}/);
  assert.match(css, /html\.menos-movimento \.rde-g\.is-ativo \.rde-varre \{ display: none; animation: none; \}/);
  assert.match(css, /html\.menos-movimento \.rde-dim, html\.menos-movimento \.rde-no/);
});

test('CSS: o ouro só no confirmado (toda regra com --ouro-rgb é de .is-ouro, ou o fecho, que só se desenha no ouro)', () => {
  for (const r of css.matchAll(/([^{}]+)\{([^{}]*--ouro-rgb[^{}]*)\}/g)) assert.match(r[1], /is-ouro|rde-fecho/, r[1].trim());
});

test('CSS: a barra do celular é fixa, da largura da tela (sem left/right negativos nem vw), some no computador e reserva a rolagem das âncoras', () => {
  assert.match(css, /\.rde-barra \{ position: fixed; top: var\(--nav-h\); left: 0; right: 0;/);
  assert.doesNotMatch(css, /[{;\s](left|right):\s*-|\d+vw/, '(o margin-left negativo que centra a marca da trilha, dentro do cartão, não conta)');
  assert.match(css, /@media \(min-width: 900px\) \{ \.rde-barra \{ display: none; \} \}/);
  assert.match(css, /html\.tem-barra-escopo \{ scroll-padding-top:/);
});

test('a tela não calcula preço nem tem laço próprio: só lê st.valor; a contagem é pelo laço único (BEYON.add/remove); animações canceladas antes das novas', () => {
  for (const src of [VIEW, BARRA]) {
    assert.doesNotMatch(src, /valor_total|\bsinal\b|requestAnimationFrame|setInterval/);
    assert.doesNotMatch(src, /setProperty\(\s*['"]--/);
    assert.doesNotMatch(src, /aria-live|innerHTML/);
  }
  assert.match(VIEW, /B\.add\(LACO,/);
  assert.match(VIEW, /W\.BEYON\.remove\(LACO\)/);
  assert.match(VIEW, /function pararAnimacoes\(\) \{\s*animacoes\.forEach\(function \(a\) \{ a\.cancel\(\); \}\);/);
  assert.match(VIEW, /pararAnimacoes\(\);\s*Desenho\.aplicar/, 'cada desenho novo cancela o que estava em voo antes');
  assert.match(VIEW, /if \(ass === assinatura\) return;/, 'idempotente');
});

test('a ligação: js/orcamento.js chama o radar numa linha só, no render(), antes do painel; o Zero e a conta avisam a atividade; o preço leva a recomendação', () => {
  const js = ler('js/orcamento.js');
  const linhas = js.split('\n').filter((l) => /BZOrcEscopo/.test(l));
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /if \(window\.BZOrcEscopo\) window\.BZOrcEscopo\.atualizar\(E\);/);
  assert.ok(js.indexOf('BZOrcEscopo') > js.indexOf('function render()') && js.indexOf('BZOrcEscopo') < js.indexOf('BZPainel.atualizar'));
  assert.match(js, /function ocupado\(sim\) \{[^}]*\n\s*document\.dispatchEvent\(new CustomEvent\('bz:pensando', \{ detail: \{ ativo: sim \} \}\)\);/);
  const p = ler('js/orcamento-perguntas.js');
  assert.match(p, /function ocupado\(sim\) \{[\s\S]{0,200}new CustomEvent\('bz:calculando', \{ detail: \{ ativo: sim \} \}\)/);
  assert.match(p, /new CustomEvent\('bz:preco', \{ detail: \{ estimativa: res\.estimativa, diagnostico: res\.diagnostico, recomendacao: rec, formato: atual, urgencia: comUrgencia,/);
  assert.match(p, /desenhar\(res, pedido\.urgencia\);/, 'a urgência é a da conta que voltou, não a da tela agora');
});

test('revisão: quando só a atividade muda, a tela troca o ponteiro e NÃO cancela a contagem nem os arcos; o ouro e o "reduzir" largam o "Proposta atualizada"', () => {
  const ramo = VIEW.slice(VIEW.indexOf('if (tr.soAtividade)'));
  assert.ok(VIEW.indexOf('if (tr.soAtividade)') > 0, 'há o caminho de "só a atividade"');
  const so = ramo.slice(0, ramo.indexOf('}'));
  assert.doesNotMatch(so, /pararAnimacoes|textos\(|movimento\(/, 'nesse caminho nada de dado é redesenhado nem cancelado');
  assert.ok(VIEW.indexOf('if (tr.soAtividade)') < VIEW.indexOf('pararAnimacoes();\n    Desenho.aplicar'), 'decide antes de cancelar');
  assert.match(VIEW, /if \(st\.ouro \|\| \(st\.valor === null && seloAte !== null\)\) \{ W\.clearTimeout\(seloAte\); seloAte = null; \}/);
  assert.match(VIEW, /W\.BEYON\.on\('reduzir', function \(sim3\) \{ if \(sim3\) \{ pararAnimacoes\(\); largarSelo\(\); \} \}\)/);
});
