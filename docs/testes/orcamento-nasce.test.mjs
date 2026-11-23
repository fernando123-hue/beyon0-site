/* A miniatura "o site nasce" (js/orcamento-nasce.js, remodelação 18/11): o desenho vem só do que a pessoa escolheu, nada de
   dado inventado, texto dela só entra por textContent. node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../../js/orcamento-rotulos.js');
const N = require('../../js/orcamento-nasce.js');

test('sem ramo não há miniatura; com ramo, o nome do ramo e a chamada do tipo de negócio', () => {
  for (const r of [null, undefined, {}, { objetivos: ['agendamentos'] }, { ramo: 'inexistente' }, { ramo: '__proto__' }, 'saude', 7]) assert.equal(N.planoDoSite(r, R), null, JSON.stringify(r));
  const p = N.planoDoSite({ ramo: 'saude', objetivos: [] }, R);
  assert.deepEqual([p.ramo, p.nome, p.titulo, p.pecas], ['saude', 'Saúde', 'Agende em 1 toque', []]);
});

test('todo ramo da lista fechada tem uma chamada, e todo objetivo tem a sua peça (nenhuma opção fica sem desenho)', () => {
  for (const ramo of Object.keys(R.RAMOS)) assert.ok(N.TITULOS[ramo], 'ramo sem chamada: ' + ramo);
  for (const obj of Object.keys(R.OBJETIVOS)) assert.ok(N.PECAS[obj], 'objetivo sem peça: ' + obj);
});

test('cada objetivo tocado vira uma peça (na ordem, sem repetir, ignorando o que não existe); o logo e os textos entram se ela tem (tenho ou parte)', () => {
  const p = N.planoDoSite({ ramo: 'beleza', objetivos: ['agendamentos', 'agendamentos', 'pedidos_whatsapp', 'inventado', 7, null], material: 'tenho' }, R);
  assert.deepEqual(p.pecas.map(x => x.chave), ['agendamentos', 'pedidos_whatsapp', 'material']);
  assert.equal(N.planoDoSite({ ramo: 'beleza', objetivos: [], material: 'parte' }, R).pecas.length, 1);
  assert.equal(N.planoDoSite({ ramo: 'beleza', objetivos: [], material: 'nao' }, R).pecas.length, 0, 'sem logo e textos não aparece peça (nada é prometido)');
  assert.equal(N.planoDoSite({ ramo: 'beleza', objetivos: 'agendamentos' }, R).pecas.length, 0, 'objetivos que não é lista é ignorado');
});

test('"outro" mostra o que a pessoa escreveu, limpo e no máximo 40 caracteres; os outros ramos mostram o nome da lista, nunca texto livre', () => {
  assert.equal(N.planoDoSite({ ramo: 'outro', outro: '  Loja   de  plantas  ' }, R).nome, 'Loja de plantas');
  assert.equal(N.planoDoSite({ ramo: 'outro', outro: 'x'.repeat(200) }, R).nome.length, 40);
  assert.equal(N.planoDoSite({ ramo: 'outro', outro: 5 }, R).nome, 'Outro', 'sem texto válido, cai no nome da lista');
  assert.equal(N.planoDoSite({ ramo: 'saude', outro: 'texto livre' }, R).nome, 'Saúde');
  assert.equal(N.planoDoSite({ ramo: 'saude' }).nome, '', 'sem os rótulos o nome fica vazio, não quebra');
});

test('o módulo pinta só por textContent e classe: sem innerHTML, sem style inline, sem número nem nome de empresa inventado', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-nasce.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(fonte, /innerHTML|insertAdjacentHTML|\.style\b|setAttribute\(\s*['"]style/);
  const textos = [...Object.values(N.TITULOS), ...Object.values(N.PECAS)].join(' ');
  assert.doesNotMatch(textos, /\d{2,}|%|R\$|\bLtda\b|\bCl[ií]nica [A-Z]/, 'texto de modelo sem número, preço nem nome de empresa');
});

/* um DOM de mentira, o mínimo que pintar() usa */
function noh(tag) {
  const e = { tag, children: [], attrs: {}, hidden: false, className: '', classes: new Set(), animou: 0, _t: '',
    get textContent() { return this._t; }, set textContent(v) { this._t = String(v); },
    get offsetWidth() { return 0; },
    classList: { add: c => { e.classes.add(c); if (c === 'is-nova') e.animou++; }, remove: c => e.classes.delete(c) },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { this.insertBefore(c, null); return c; },
    removeChild(c) { this.children.splice(this.children.indexOf(c), 1); return c; },
    insertBefore(c, ref) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); const j = ref ? this.children.indexOf(ref) : -1; this.children.splice(j < 0 ? this.children.length : j, 0, c); return c; } };
  return e;
}
function paginaDeMentira() {
  const nos = { 'o-nasce': noh('div'), 'o-nasce-nome': noh('span'), 'o-nasce-titulo': noh('p'), 'o-nasce-pecas': noh('ul') };
  nos['o-nasce'].hidden = true;
  const ouvintes = {};
  return { nos, ouvintes, getElementById: id => nos[id] || null, createElement: noh, addEventListener: (n, f) => { ouvintes[n] = f; } };
}

test('pintar: o 1º ramo mostra a miniatura, cada peça nova entra (uma vez), a que saiu do plano sai e o título só anima quando muda', () => {
  const d = paginaDeMentira(), cx = d.nos['o-nasce'], lista = d.nos['o-nasce-pecas'], titulo = d.nos['o-nasce-titulo'];
  N.pintar(d, null);
  assert.equal(cx.hidden, true, 'sem plano, escondida');
  N.pintar(d, N.planoDoSite({ ramo: 'saude', objetivos: ['agendamentos'] }, R));
  assert.equal(cx.hidden, false);
  assert.equal(d.nos['o-nasce-nome'].textContent, 'Seu site · Saúde');
  assert.deepEqual(lista.children.map(l => l.textContent), ['Agenda de horários']);
  assert.match(lista.children[0].className, /is-nova/);
  const primeira = lista.children[0], animou = titulo.animou;
  N.pintar(d, N.planoDoSite({ ramo: 'saude', objetivos: ['agendamentos', 'pedidos_whatsapp'] }, R));
  assert.equal(lista.children.length, 2);
  assert.equal(lista.children[0], primeira, 'a peça que já estava não é refeita (não repete o pulo)');
  assert.equal(titulo.animou, animou, 'o título não mudou: não anima de novo');
  N.pintar(d, N.planoDoSite({ ramo: 'saude', objetivos: ['pedidos_whatsapp'] }, R));
  assert.deepEqual(lista.children.map(l => l.getAttribute('data-peca')), ['pedidos_whatsapp'], 'o "Mudar" tirou uma: a peça sai');
  N.pintar(d, N.planoDoSite({ ramo: 'beleza', objetivos: [] }, R));
  assert.equal(titulo.textContent, 'Seu horário, sem espera'); assert.ok(titulo.animou > animou, 'o título mudou: anima');
  assert.equal(lista.children.length, 0);
  N.pintar(d, null);
  assert.equal(cx.hidden, true, 'sem ramo de novo, escondida');
});

test('pintar: a ordem das peças é a do plano, também depois do "Mudar", sem duplicar', () => {
  const d = paginaDeMentira(), lista = d.nos['o-nasce-pecas'];
  N.pintar(d, N.planoDoSite({ ramo: 'servicos', objetivos: ['pedidos_whatsapp'] }, R));
  N.pintar(d, N.planoDoSite({ ramo: 'servicos', objetivos: ['agendamentos', 'pedidos_whatsapp', 'campanha'] }, R));
  assert.deepEqual(lista.children.map(l => l.getAttribute('data-peca')), ['agendamentos', 'pedidos_whatsapp', 'campanha']);
});

test('pintar: página sem os nós da miniatura não lança (a conversa nunca cai por enfeite)', () => {
  const d = paginaDeMentira();
  delete d.nos['o-nasce-pecas'];
  assert.doesNotThrow(() => N.pintar(d, N.planoDoSite({ ramo: 'saude', objetivos: [] }, R)));
  assert.doesNotThrow(() => N.pintar({ getElementById: () => null }, null));
});

test('ligar: escuta bz:respostas, lê os rótulos SÓ na hora do evento (eles carregam depois) e ignora lixo', () => {
  const d = paginaDeMentira();
  let leituras = 0;
  N.ligar(d, () => { leituras++; return R; });
  assert.equal(leituras, 0, 'nada lido ao ligar');
  d.ouvintes['bz:respostas']({ detail: { ramo: 'educacao', objetivos: ['apresentar'] } });
  assert.equal(leituras, 1);
  assert.equal(d.nos['o-nasce-nome'].textContent, 'Seu site · Educação');
  assert.deepEqual(d.nos['o-nasce-pecas'].children.map(l => l.textContent), ['Quem somos e o que fazemos']);
  assert.doesNotThrow(() => d.ouvintes['bz:respostas'](undefined));
  assert.doesNotThrow(() => d.ouvintes['bz:respostas']({ detail: 'lixo' }));
  assert.equal(d.nos['o-nasce'].hidden, true, 'detail inválido esconde a miniatura');
  N.ligar({ getElementById: () => null, addEventListener() { throw new Error('não era para ligar'); } });
});

test('o evento tem o mesmo nome nos dois lados, e o toques manda uma CÓPIA das respostas (quem escuta não recebe o estado vivo)', () => {
  const toques = fs.readFileSync(new URL('../../js/orcamento-toques.js', import.meta.url), 'utf8');
  const nasce = fs.readFileSync(new URL('../../js/orcamento-nasce.js', import.meta.url), 'utf8');
  assert.match(toques, /new CustomEvent\('bz:respostas', \{ detail: copiar\(s\.respostas\) \}\)/);
  assert.match(nasce, /addEventListener\('bz:respostas'/);
});

test('planoDoSite: entrada forjada enorme é cortada antes de custar CPU (texto de 90 MB, lista de 5 milhões)', () => {
  const t0 = Date.now();
  const p = N.planoDoSite({ ramo: 'outro', outro: ' a '.repeat(3e7), objetivos: new Array(5e6).fill('agendamentos') }, R);
  assert.equal(p.nome.length <= 40, true); assert.equal(p.pecas.length, 1);
  assert.ok(Date.now() - t0 < 1500, 'demorou ' + (Date.now() - t0) + ' ms');
  const esparso = []; esparso.length = 4294967295;
  assert.doesNotThrow(() => N.planoDoSite({ ramo: 'saude', objetivos: esparso }, R));
});

test('a miniatura é decorativa e escondida até o 1º toque: o HTML tem aria-hidden e hidden, e a conversa não depende dela', () => {
  const html = fs.readFileSync(new URL('../../orcamento.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="nasce" id="o-nasce" aria-hidden="true" hidden>/);
  assert.doesNotMatch(html, /id="o-nasce"[^>]*style=/);
  assert.match(html, /orcamento-nasce\.js" defer><\/script>\s*<script src="js\/orcamento-rotulos\.js" defer><\/script>\s*<script src="js\/orcamento-toques\.js"/, 'rótulos, toques e perguntas seguem colados (planta-orcamento-leve.test.mjs)');
  assert.ok(html.indexOf('<script src="js/orcamento-icones.js"') < html.indexOf('<script src="js/orcamento-toques.js"'), 'os ícones vêm antes dos toques que os usam');
});

/* ==========================================================================
   O PALCO (direção C "palco", escolhida pelo dono em 23/11: "C ficou muito bom"). A conversa fica em branco e o site nasce numa
   faixa preta de ponta a ponta, como vitrine, com três contadores em verde-água (partes, integração, valor). A estrutura de 18/11
   não muda: a miniatura que cresce a cada resposta (agora dentro do palco, no topo), os 5 passos e o radar. Os contadores só
   repetem o que já existe (as peças da miniatura e o radar); nada é calculado nem inventado aqui.
   ========================================================================== */
const P = require('../../js/orcamento-palco.js');
const lerTexto = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('palco no HTML: kicker, título, a vitrine com a miniatura e os contadores numa faixa só; os passos logo abaixo, fora dela', () => {
  const html = semComentario(lerTexto('orcamento.html'));
  const topo = html.slice(html.indexOf('<section class="orc-topo"'), html.indexOf('</section>', html.indexOf('<section class="orc-topo"')));
  const palco = topo.slice(topo.indexOf('<div class="orc-palco"'), topo.indexOf('<ol class="orc-etapas"'));
  assert.ok(topo.indexOf('<div class="orc-palco"') >= 0 && palco.length > 0, 'o palco existe e vem antes dos passos');
  for (const pedaco of ['class="orc-kicker"', 'id="orc-titulo"', 'class="orc-vitrine"', 'id="o-nasce"', 'class="orc-contadores"', 'id="o-palco-partes"', 'id="o-palco-integracoes"', 'id="o-palco-valor"']) {
    assert.ok(palco.includes(pedaco), 'falta no palco: ' + pedaco);
  }
  const conversa = html.slice(html.indexOf('<section class="orc-conversa"'), html.indexOf('</section>', html.indexOf('<section class="orc-conversa"')));
  assert.ok(!conversa.includes('id="o-nasce"'), 'a miniatura saiu de dentro da conversa (ela é o palco agora)');
  assert.match(palco, /<div class="orc-vitrine" aria-hidden="true">/, 'a vitrine é desenho: quem usa leitor de tela segue pela conversa');
  assert.match(palco, /<div class="orc-contadores" aria-hidden="true">/, 'os contadores repetem o radar, que é o texto de verdade');
  assert.match(palco, /id="o-palco-partes">0</, 'começa sem peça nenhuma');
  assert.match(palco, /id="o-palco-integracoes">—</);
  assert.match(palco, /id="o-palco-valor">—</, 'o valor só aparece quando o Zero entende o caso');
  assert.ok(html.indexOf('<script src="js/orcamento-palco.js" defer>') > 0 && html.indexOf('<script src="js/orcamento-palco.js"') < html.indexOf('<script src="js/orcamento-escopo.js"'),
    'o palco escuta antes de o radar falar pela 1ª vez');
  assert.ok(html.indexOf('href="css/orcamento-palco.css"') > html.indexOf('href="css/previa.css"') && html.indexOf('href="css/orcamento-palco.css"') < html.indexOf('href="css/passagem.css"'),
    'a folha do palco vem depois das do orçamento (ganha delas) e antes da passagem (que segue mandando no movimento entre páginas)');
});

test('palco no CSS: conversa em branco, faixa preta com a luz #49E5DD, logo para fundo claro; sem desfoque, sem brilho, sem sombra suave', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.match(css, /\.orc__main[^{]*\{[^}]*--bg: #FFFFFF/, 'a página do orçamento é branca');
  assert.match(css, /\.orc-palco[^{]*\{[^}]*--ac: #49E5DD/, 'no palco a luz é o verde-água da marca');
  assert.match(css, /\.orc-palco \{[^}]*background(-color)?: #000/, 'o palco é preto chapado');
  assert.match(css, /\.orc \.nav[^{]*\{[^}]*background(-color)?: #FFFFFF/, 'o topo é branco');
  assert.match(css, /\.marca__nome \{[^}]*fill: #0B0C0D/, 'a logo para fundo claro (o nome em tinta)');
  assert.doesNotMatch(css, /blur|backdrop-filter|drop-shadow|filter\s*:|text-shadow|radial-gradient/i);
  for (const s of css.match(/box-shadow:[^;}]+/g) || []) {
    /* só traço: inset de 1 a 3 px sem desfoque, nunca sombra que espalha luz */
    for (const parte of s.replace('box-shadow:', '').split(',')) assert.match(parte.trim(), /^(none|inset 0 (0|-?[1-3]px) 0( 0)? (-?[0-3]px )?\S+|0 [1-3]px 0 \S+)$/, 'sombra que não é traço: ' + parte);
  }
  assert.doesNotMatch(css, /\bleft:\s*-|\bright:\s*-|\d{3,}vw/, 'nenhuma caixa mais larga que a tela (regra 10)');
});

test('palco no CSS: os passos viram abas mono com sublinhado; as escolhas, cartões de contorno com o número à direita', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.match(css, /\.orc-etapas li\[aria-current="step"\][^{]*\{[^}]*box-shadow: inset 0 -3px 0/, 'a aba atual tem o sublinhado');
  assert.match(css, /\.orc-toque__ops \{[^}]*counter-reset/, 'as opções se numeram sozinhas (01, 02…), sem mexer no texto delas');
  assert.match(css, /\.orc-op--toque::after \{[^}]*counter\([^)]*decimal-leading-zero\)/);
  assert.match(css, /\.orc-op--toque\[aria-pressed="true"\]/, 'marcada também pela forma, não só pela cor');
  assert.match(css, /html\.orc-retomando[^{]*\.orc-vitrine[^{]*\{[^}]*display: none/, 'abrindo o pedido pelo link, a vitrine vazia não diz que a pessoa está no começo');
});

test('contadores: partes = as peças da miniatura (a mesma conta do desenho); integração e valor vêm do radar; vazio é —', () => {
  assert.equal(P.partes({ ramo: 'saude', objetivos: ['agendamentos', 'pedidos_whatsapp'], material: 'tenho' }, N, R), '3');
  assert.equal(P.partes({ ramo: 'saude', objetivos: [] }, N, R), '0');
  for (const lixo of [null, undefined, 'saude', {}, { ramo: '__proto__' }]) assert.equal(P.partes(lixo, N, R), '0', JSON.stringify(lixo));
  assert.equal(P.partes({ ramo: 'saude', objetivos: ['agendamentos'] }, null, R), '0', 'sem o módulo da miniatura não quebra');
  assert.equal(P.inteiro(0), '0'); assert.equal(P.inteiro(2), '2');
  for (const v of [undefined, null, -1, NaN, Infinity, '2', 1.5, 1e6]) assert.equal(P.inteiro(v), '—', String(v));
  assert.equal(P.valor(null), '—'); assert.equal(P.valor(0), '—'); assert.equal(P.valor(-5), '—'); assert.equal(P.valor('3200'), '—', 'só número de verdade');
  assert.equal(P.valor(3200).replace(/\s/g, ' '), 'R$ 3.200');
  assert.equal(P.valor(8350.5).replace(/\s/g, ' '), 'R$ 8.350,5');
});

function palcoDeMentira() {
  const nos = { 'o-palco-partes': noh('b'), 'o-palco-integracoes': noh('b'), 'o-palco-valor': noh('b') };
  nos['o-palco-partes'].textContent = '0'; nos['o-palco-integracoes'].textContent = '—'; nos['o-palco-valor'].textContent = '—';
  const ouvintes = {};
  return { nos, ouvintes, getElementById: id => nos[id] || null, addEventListener: (n, f) => { ouvintes[n] = f; } };
}

test('ligar: escuta a resposta (bz:respostas) e o radar (bz:radar); só escreve o que mudou e marca o número novo para o pulo', () => {
  const d = palcoDeMentira();
  P.ligar(d, () => N, () => R);
  d.ouvintes['bz:respostas']({ detail: { ramo: 'beleza', objetivos: ['agendamentos'] } });
  assert.equal(d.nos['o-palco-partes'].textContent, '1');
  assert.equal(d.nos['o-palco-partes'].animou, 1, 'o número novo pula');
  d.ouvintes['bz:respostas']({ detail: { ramo: 'beleza', objetivos: ['agendamentos'] } });
  assert.equal(d.nos['o-palco-partes'].animou, 1, 'o mesmo número não pula de novo');
  d.ouvintes['bz:radar']({ detail: { integracoes: 2, valor: null } });
  assert.equal(d.nos['o-palco-integracoes'].textContent, '2');
  assert.equal(d.nos['o-palco-valor'].textContent, '—', 'sem valor enquanto o Zero não entende o caso');
  assert.equal(d.nos['o-palco-valor'].animou, 0);
  d.ouvintes['bz:radar']({ detail: { integracoes: 2, valor: 4100 } });
  assert.equal(d.nos['o-palco-valor'].textContent.replace(/\s/g, ' '), 'R$ 4.100');
  assert.equal(d.nos['o-palco-valor'].animou, 1);
  assert.doesNotThrow(() => { d.ouvintes['bz:radar'](undefined); d.ouvintes['bz:radar']({ detail: 'lixo' }); d.ouvintes['bz:respostas']({}); });
  assert.equal(d.nos['o-palco-valor'].textContent, '—', 'detail inválido volta ao vazio, nunca a um número velho');
  assert.doesNotThrow(() => P.ligar({ getElementById: () => null, addEventListener() { throw new Error('não era para ligar'); } }));
});

test('o módulo do palco escreve só por textContent; o radar avisa o palco com o número e o valor que ELE já mostra', () => {
  const fonte = semComentario(lerTexto('js/orcamento-palco.js'));
  assert.doesNotMatch(fonte, /innerHTML|insertAdjacentHTML|setAttribute\(\s*['"]style/);
  /* o único estilo por JS é a folga embaixo da lista da conversa (por evento, nunca por quadro; CLAUDE.md permite el.style) */
  assert.deepEqual([...new Set(fonte.match(/\w+\.style\.\w+/g) || [])], ['lista.style.paddingBottom']);
  const radar = semComentario(lerTexto('js/orcamento-escopo.js'));
  assert.match(radar, /new CustomEvent\('bz:radar', \{ detail: \{ integracoes: st\.dims\.integracoes\.n, valor: st\.valor \} \}\)/);
});

/* espaçamento sem corte (regra do dono; achados de 23/11 em 320): nada de reticências, folga igual nos dois lados da régua, a borda
   da caixa que rola marcada por régua, nenhuma palavra partida no meio. O varredor de tela é docs/cortes.mjs (CORTES=1 no E2E) */
const regrasSemCorte = css => {
  const erros = [];
  if (!/\.rde-barra__estado \{[^}]*white-space: normal[^}]*text-overflow: clip/.test(css)) erros.push('a barra fina do radar ainda corta o estado com reticências');
  if (!/\.orc-contador \{[^}]*padding: 12px 12px 0 0/.test(css)) erros.push('os contadores sem a folga de 12 px antes da régua seguinte');
  if (!/\.orc-log \{[^}]*border-block: 1px solid/.test(css)) erros.push('a caixa da conversa sem a régua que marca a borda da rolagem');
  if (!/\.rde-canto__valor \{[^}]*hyphens: manual/.test(css)) erros.push('os cantos do radar ainda partem palavra com hífen');
  if (!/@media \(max-width: 379px\) \{[\s\S]*?\.orc-est__dados div \{[^}]*display: flex/.test(css)) erros.push('o prazo e os valores do investimento seguem em 3 colunas apertadas no celular estreito');
  if (!/\.visor__titulo \{[^}]*white-space: normal[^}]*text-overflow: clip/.test(css)) erros.push('o título do visor da prévia ainda corta com reticências');
  return erros;
};
test('espaçamento sem corte no palco: sem reticências, folga igual, borda da rolagem marcada, sem palavra partida', () => {
  assert.deepEqual(regrasSemCorte(semComentario(lerTexto('css/orcamento-palco.css'))), []);
  const varredor = lerTexto('docs/cortes.mjs');
  for (const tipo of ['reticências', 'fora da tela', 'preso numa caixa', 'palavra partida', 'encostado na régua']) assert.ok(varredor.includes("'" + tipo) || varredor.includes(tipo + ' ('), 'o varredor procura: ' + tipo);
  assert.match(lerTexto('docs/e2e-orcamento.mjs'), /CORTES === '1'[\s\S]*cortes\(page\)/, 'o E2E roda o varredor a cada foto quando pedido');
  const visor = semComentario(lerTexto('js/orcamento-visor.js'));
  assert.match(visor, /tituloEmPartes\(d\.id === 'final'/, 'o título do visor é montado em pedaços que quebram pelo sentido');
  assert.doesNotMatch(visor, /'o-visor-titulo'\)\.textContent = /, 'nada de título numa linha só, cortada com reticências');
});

/* retorno do dono sobre o palco no celular (24/11): o Chrome do celular escureceu a página sozinho e a logo e o nome mudaram de cor;
   a barra fina repetia o valor por cima do palco; "ZERO" se repetia em cada fala e saía cortado pela régua no topo da conversa */
test('o tema claro do orçamento é travado: o escurecimento automático do navegador não mexe na logo nem no nome', () => {
  const html = semComentario(lerTexto('orcamento.html'));
  assert.match(html, /<meta name="color-scheme" content="only light" \/>/, 'a página diz ao navegador que só tem o tema claro');
  assert.match(semComentario(lerTexto('css/orcamento-palco.css')), /:root \{[^}]*color-scheme: only light/, 'e a folha também');
  for (const outra of ['index.html', 'sites.html', 'automacao.html']) assert.doesNotMatch(lerTexto(outra), /name="color-scheme"/, 'as outras páginas (escuras) não mudam: ' + outra);
});
test('a barra fina do radar não repete o valor ao lado do palco: só aparece depois que o palco saiu da tela', () => {
  const barra = semComentario(lerTexto('js/orcamento-escopo-barra.js'));
  assert.match(barra, /var mostrar = [^;]*!palcoVisto/, 'a decisão espera o palco sair da tela');
  assert.match(barra, /querySelector\('\.orc-palco'\)/);
  assert.match(barra, /io\.observe\(palco\)/);
});
test('uma identificação só do Zero na conversa (o título, com "assistente virtual (IA)"); cada fala fica com o símbolo', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.doesNotMatch(css, /content: "Zero"/, 'sem o "ZERO" repetido em cada fala');
  assert.match(css, /\.msg--agente::before \{[^}]*zero-simbolo-claro\.svg/, 'o símbolo segue marcando quem fala');
  assert.match(semComentario(lerTexto('orcamento.html')), /<h2 id="o-conversa-titulo" class="orc-rotulo">Zero, assistente virtual \(IA\) da Beyon Zero<\/h2>/, 'a identificação de IA continua à vista');
});
test('a caixa da conversa para a rolagem no começo de uma fala: nada cortado no topo', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.match(css, /\.orc-log \{[^}]*scroll-snap-type: y mandatory/);
  assert.match(css, /\.orc-log__lista > li \{[^}]*scroll-snap-align: start/);
  assert.match(css, /\.orc-log__lista > li:last-child \{[^}]*scroll-snap-align: start end/, 'o fim da conversa continua alcançável');
  assert.match(lerTexto('docs/cortes.mjs'), /cortado no topo da rolagem/, 'o varredor confere o topo da caixa');
  /* a folga embaixo: o que falta para a última fala do Zero alcançar o topo (a rolagem acabava antes, e o topo cortava a fala anterior) */
  assert.equal(P.folgaNecessaria(500, 180), 320, 'fala + opções curtas: a lista ganha a folga que falta');
  assert.equal(P.folgaNecessaria(500, 620), 0, 'o que vem depois da fala já passa da caixa: nenhuma folga');
  for (const [a, b] of [[NaN, 10], [500, NaN], [0, 10], [-5, 10], [500, -1], ['500', 10]]) assert.equal(P.folgaNecessaria(a, b), a === '500' ? 490 : 0, String([a, b]));
  assert.doesNotThrow(() => P.ligarCaixa({ getElementById: () => null }, {}), 'sem a caixa, nada acontece');
});
