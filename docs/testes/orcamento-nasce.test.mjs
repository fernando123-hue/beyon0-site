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

test('palco no CSS: no claro a conversa em branco e a logo para fundo claro; faixa preta com a luz #49E5DD; sem desfoque, sem brilho, sem sombra suave', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.match(css, /html\[data-tema="claro"\] \.orc__main[^{]*\{[^}]*--bg: #FFFFFF/, 'no claro a página do orçamento é branca');
  assert.match(css, /\.orc-palco[^{]*\{[^}]*--ac: #49E5DD/, 'no palco a luz é o verde-água da marca');
  assert.match(css, /\.orc-palco \{[^}]*background(-color)?: #000/, 'o palco é preto chapado');
  assert.match(css, /\.orc \.nav[^{]*\{[^}]*background(-color)?: var\(--bg\)/, 'o topo tem a cor da página (branco no claro, grafite no escuro)');
  assert.match(css, /html\[data-tema="claro"\] [^{]*\.marca__nome \{[^}]*fill: #0B0C0D/, 'no claro, a logo para fundo claro (o nome em tinta)');
  assert.doesNotMatch(css, /blur|backdrop-filter|drop-shadow|filter\s*:|text-shadow|radial-gradient/i);
  for (const s of css.match(/box-shadow:[^;}]+/g) || []) {
    /* só traço: inset de 1 a 3 px sem desfoque, nunca sombra que espalha luz */
    for (const parte of s.replace('box-shadow:', '').split(',')) assert.match(parte.trim(), /^(none|inset 0 (0|-?[1-3]px) 0( 0)? (-?[0-3]px )?\S+|0 [1-3]px 0 \S+)$/, 'sombra que não é traço: ' + parte);
  }
  assert.doesNotMatch(css, /\bleft:\s*-|\bright:\s*-|\d{3,}vw/, 'nenhuma caixa mais larga que a tela (regra 10)');
});

/* dono, 24/11: "Tire os numeros ao lados das opções pré selecionadas": as opções ficam só com o texto (marcada, o ✓ continua) */
test('palco no CSS: os passos viram abas mono com sublinhado; as escolhas, cartões de contorno SEM número', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.match(css, /\.orc-etapas li\[aria-current="step"\][^{]*\{[^}]*box-shadow: inset 0 -3px 0/, 'a aba atual tem o sublinhado');
  assert.doesNotMatch(css, /counter-reset: op|counter-increment: op|counter\(op/, 'as opções não se numeram mais (01, 02… saíram)');
  for (const arq of ['css/orcamento.css', 'css/orcamento-casca.css', 'css/orcamento-modelos.css', 'css/orcamento-semjs.css', 'css/cartoes.css']) assert.doesNotMatch(semComentario(lerTexto(arq)), /\.orc-op[^{]*::(after|before)[^{]*\{[^}]*counter\(/, arq + ': nenhum número nas opções por outro arquivo');
  assert.doesNotMatch(blocoDe(css, '.orc-op--toque::after') || '', /content: counter/, 'o ::after da opção solta não desenha número');
  assert.match(css, /\.orc-op--toque\[aria-pressed="true"\]::after \{[^}]*content: "✓"/, 'marcada: o ✓ continua à direita');
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
/* O TEMA (dono, 23/11 ~21h, sobre a v2: "Só quero que ele fique com a opção, escuro ativado de inicio, caso o usuario deseje mudar ele
   clicar em um botão e muda. Mas está muito bom"). O escuro é o padrão de todo visitante; o botão no topo troca para o claro da v2 e
   volta; a escolha fica no aparelho. Os dois são NOSSOS: o claro segue "only light" (o Chrome do celular escurecia a página sozinho e
   estragava a logo e o nome, print do dono de 24/11) e o escuro declara "dark" (o navegador não mexe numa página que já é escura) */
const carregarTema = () => require('../../js/tema.js');
function armazemDeMentira(inicial, { quebraLer = false, quebraGravar = false } = {}) {
  const dados = new Map(Object.entries(inicial || {}));
  return {
    dados,
    getItem(k) { if (quebraLer) throw new Error('SecurityError'); return dados.has(k) ? dados.get(k) : null; },
    setItem(k, v) { if (quebraGravar) throw new Error('QuotaExceededError'); dados.set(k, String(v)); }
  };
}
function docDeMentira({ botoes = 1 } = {}) {
  const attrs = new Map();
  const comoElemento = o => Object.assign(o, { setAttribute(k, v) { this[k] = String(v); }, getAttribute(k) { return k in this ? this[k] : null; } });
  const meta = { 'color-scheme': comoElemento({ content: 'dark' }), 'theme-color': comoElemento({ content: '#131617' }) };
  const lista = Array.from({ length: botoes }, () => comoElemento({ 'aria-pressed': 'false' }));
  return {
    meta, lista,
    documentElement: { setAttribute: (k, v) => attrs.set(k, String(v)), getAttribute: k => (attrs.has(k) ? attrs.get(k) : null) },
    querySelector: sel => { const m = /^meta\[name="([^"]+)"\]$/.exec(sel); return m && meta[m[1]] ? meta[m[1]] : null; },
    querySelectorAll: sel => (sel === '.nav__tema' ? lista : [])
  };
}
const luz = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0); };
const contraste = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const blocoDe = (css, seletor) => { const i = css.indexOf('\n' + seletor + ' {'); if (i < 0) return null; const ini = css.indexOf('{', i) + 1; return css.slice(ini, css.indexOf('}', ini)); };
const tokenDe = (bloco, nome) => { const m = new RegExp('(?:^|[;\\s])' + nome.replace(/-/g, '\\-') + ':\\s*(#[0-9A-Fa-f]{6})').exec(bloco || ''); return m ? m[1] : null; };
const PAGINA = '.orc__main, .orc .nav, .orc .rde-barra';
const PAGINA_CLARA = 'html[data-tema="claro"] .orc__main, html[data-tema="claro"] .orc .nav, html[data-tema="claro"] .orc .rde-barra';

test('o orçamento abre no ESCURO: sem nada guardado, com lixo guardado, sem localStorage ou com ele quebrado', () => {
  const T = carregarTema();
  assert.equal(T.CHAVE, 'bz-orcamento-tema');
  assert.equal(T.lerTema(armazemDeMentira()), 'escuro', 'visitante novo');
  for (const lixo of ['', 'CLARO', 'dark', 'light', '{"tema":"claro"}', 'claro ', 'escuro']) assert.equal(T.lerTema(armazemDeMentira({ 'bz-orcamento-tema': lixo })), 'escuro', JSON.stringify(lixo));
  assert.equal(T.lerTema(null), 'escuro', 'sem localStorage');
  assert.equal(T.lerTema(armazemDeMentira({ 'bz-orcamento-tema': 'claro' }, { quebraLer: true })), 'escuro', 'localStorage que lança (Safari privado)');
  assert.equal(T.lerTema(armazemDeMentira({ 'bz-orcamento-tema': 'claro' })), 'claro', 'só "claro" exato volta ao claro');
});
test('aplicar o tema: o atributo do <html>, o color-scheme (claro = only light; escuro = dark), a cor da barra do navegador e o aria-pressed do botão', () => {
  const T = carregarTema();
  const d = docDeMentira({ botoes: 2 });
  assert.equal(T.aplicarTema(d, 'claro'), 'claro');
  assert.equal(d.documentElement.getAttribute('data-tema'), 'claro');
  assert.equal(d.meta['color-scheme'].content, 'only light', 'no claro o navegador não escurece a página sozinho');
  assert.equal(d.meta['theme-color'].content, '#FFFFFF');
  assert.deepEqual(d.lista.map(b => b['aria-pressed']), ['true', 'true'], 'o botão "Tema claro" fica pressionado');
  assert.equal(T.aplicarTema(d, 'escuro'), 'escuro');
  assert.equal(d.documentElement.getAttribute('data-tema'), 'escuro');
  assert.equal(d.meta['color-scheme'].content, 'dark');
  assert.equal(d.meta['theme-color'].content, '#131617');
  assert.deepEqual(d.lista.map(b => b['aria-pressed']), ['false', 'false']);
  for (const lixo of [undefined, null, 'CLARO', 'azul', 7]) assert.equal(T.aplicarTema(docDeMentira(), lixo), 'escuro', 'valor estranho vira o escuro: ' + String(lixo));
  assert.doesNotThrow(() => T.aplicarTema({ documentElement: d.documentElement, querySelector: () => null, querySelectorAll: () => [] }, 'claro'), 'sem as metas nem o botão, nada quebra');
});
test('o botão alterna e guarda: escuro → claro → escuro; o aparelho lembra; guardar que falha não trava a troca', () => {
  const T = carregarTema();
  const d = docDeMentira(), a = armazemDeMentira();
  T.aplicarTema(d, T.lerTema(a));
  assert.equal(T.alternar(d, a), 'claro');
  assert.equal(a.dados.get('bz-orcamento-tema'), 'claro', 'guardado no aparelho');
  assert.equal(T.lerTema(a), 'claro', 'a próxima visita abre no claro');
  assert.equal(d.meta['color-scheme'].content, 'only light');
  assert.equal(T.alternar(d, a), 'escuro');
  assert.equal(a.dados.get('bz-orcamento-tema'), 'escuro');
  assert.equal(T.lerTema(a), 'escuro');
  const quebrado = armazemDeMentira({}, { quebraGravar: true });
  assert.equal(T.alternar(d, quebrado), 'claro', 'sem poder guardar, a troca vale nesta visita');
  assert.equal(d.documentElement.getAttribute('data-tema'), 'claro');
  assert.equal(T.alternar(d, null), 'escuro', 'sem localStorage também');
});
test('HTML: o tema decide no <head>, antes de qualquer folha (nada pisca), num script externo (CSP sem inline); o padrão sem JS é o escuro', () => {
  const html = semComentario(lerTexto('orcamento.html'));
  const cabeca = html.slice(0, html.indexOf('</head>'));
  assert.match(cabeca, /<script src="js\/tema\.js"><\/script>/, 'script clássico, sem defer nem async: roda antes da 1ª pintura');
  assert.ok(cabeca.indexOf('js/tema.js') > cabeca.indexOf('Content-Security-Policy'), 'depois da CSP');
  assert.ok(cabeca.indexOf('js/tema.js') < cabeca.indexOf('rel="stylesheet"'), 'antes da 1ª folha de estilo');
  assert.doesNotMatch(cabeca, /<script(?![^>]*\ssrc=)[^>]*>/, 'nenhum script inline');
  assert.match(cabeca, /<meta name="color-scheme" content="dark" \/>/, 'sem JS (e antes dele) a página é a escura');
  assert.match(cabeca, /<meta name="theme-color" content="#131617" \/>/);
  assert.match(html, /<html lang="pt-BR">/, 'o atributo data-tema só nasce pelo script: sem JS, o botão não aparece');
  const botao = /<button class="nav__tema"[^>]*>/.exec(html);
  assert.ok(botao, 'o botão do tema na barra do topo');
  assert.match(botao[0], /type="button"/);
  assert.match(botao[0], /aria-pressed="false"/);
  assert.match(botao[0], /aria-label="Tema claro"/);
  assert.ok(html.indexOf('class="nav__tema"') > html.indexOf('class="nav__logo"') && html.indexOf('class="nav__tema"') < html.indexOf('class="nav__toggle"'), 'entre a logo e o menu');
  for (const outra of ['index.html', 'sites.html', 'automacao.html']) {
    assert.doesNotMatch(lerTexto(outra), /name="color-scheme"|js\/tema\.js|nav__tema/, 'as outras páginas (escuras) não mudam: ' + outra);
  }
});
test('CSS: o claro inteiro mora em html[data-tema="claro"] (only light); o escuro é o padrão, com "dark" e a marca nas cores dela', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.match(css, /html\[data-tema="claro"\] \{[^}]*color-scheme: only light/, 'o claro trava o escurecimento automático');
  assert.match(css, /\n:root \{[^}]*color-scheme: dark/, 'o escuro diz ao navegador que já é escuro');
  assert.doesNotMatch(css, /:root \{[^}]*only light/, 'o only light não vale mais para a página inteira');
  const escuro = blocoDe(css, PAGINA), claro = blocoDe(css, PAGINA_CLARA);
  assert.ok(escuro && claro, 'um bloco de tokens para cada tema');
  assert.equal(tokenDe(claro, '--bg'), '#FFFFFF', 'o claro da v2 não muda');
  assert.equal(tokenDe(claro, '--t1'), '#0B0C0D');
  assert.doesNotMatch(css.replace(claro, ''), /--bg: #FFFFFF/, 'nenhum fundo branco fora do claro');
  /* a marca no escuro: os tokens dela não são redefinidos na página (vêm de css/tokens.css, e o ouro continua trocando todos) */
  for (const nome of ['--ac', '--ac-rgb', '--ac-3', '--t1', '--logo-entrada', '--logo-nucleo']) assert.doesNotMatch(escuro, new RegExp('(^|[;\\s])' + nome + ':'), 'o escuro não mexe em ' + nome);
  /* a logo do topo: cada pintura especial é do claro; no escuro valem as de css/tokens.css */
  const regrasMarca = css.match(/[^{}]*\.marca__[a-z-]+[^{}]*\{/g) || [];
  assert.ok(regrasMarca.length >= 6);
  for (const r of regrasMarca) assert.match(r.trim(), /^html\[data-tema="claro"\]/, 'pintura da logo fora do claro: ' + r.trim());
  /* o símbolo do Zero em cada fala: o claro no fundo branco, o escuro (as cores da logo) no fundo escuro */
  assert.match(css, /\n\.msg--agente::before \{[^}]*zero-simbolo-escuro\.svg/);
  assert.match(css, /html\[data-tema="claro"\] \.msg--agente::before \{[^}]*zero-simbolo-claro\.svg/);
  /* o fundo da página e da barra vêm do token, não do branco fixo */
  assert.match(css, /\n\.orc__main \{[^}]*background-color: var\(--bg\)/);
  assert.match(css, /\.orc \.nav, \.orc \.nav\.is-stuck, \.orc \.nav\.is-open \{[^}]*background-color: var\(--bg\)/);
});
test('o escuro tem contraste AA: texto no fundo da página e no dos cartões; contorno de controle com 3:1', () => {
  const escuro = blocoDe(semComentario(lerTexto('css/orcamento-palco.css')), PAGINA);
  const bg = tokenDe(escuro, '--bg'), cartao = tokenDe(escuro, '--cartao'), s1 = tokenDe(escuro, '--s1');
  for (const f of [bg, cartao, s1]) assert.ok(f, 'fundo definido');
  assert.notEqual(bg, '#000000', 'a página não é o preto do palco: o palco se destaca dela (dono, 20/11: "muito escura, sem vida")');
  const t3 = tokenDe(escuro, '--t3'), stroke = tokenDe(escuro, '--stroke');
  for (const fundo of [bg, cartao, s1]) {
    for (const [nome, cor] of [['--t1', '#F2F4F4'], ['--t2', '#B2B8B8'], ['--t3', t3]]) assert.ok(contraste(cor, fundo) >= 4.5, nome + ' em ' + fundo + ': ' + contraste(cor, fundo).toFixed(2));
    assert.ok(contraste(stroke, fundo) >= 3, '--stroke em ' + fundo + ': ' + contraste(stroke, fundo).toFixed(2));
    assert.ok(contraste('#49E5DD', fundo) >= 4.5, 'o ciano em ' + fundo);
  }
});
test('o símbolo escuro do Zero tem as cores da logo (aro e lente no ciano profundo, a luz que sai no ciano, o núcleo no branco)', () => {
  assert.ok(fs.existsSync(new URL('../../assets/zero-simbolo-escuro.svg', import.meta.url)), 'o símbolo para fundo escuro');
  const svg = lerTexto('assets/zero-simbolo-escuro.svg');
  const claro = lerTexto('assets/zero-simbolo-claro.svg');
  const cores = s => [...s.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1].toUpperCase());
  assert.deepEqual(cores(svg), ['#1CB5B9', '#1CB5B9', '#0F6F72', '#49E5DD', '#F2F4F4'], 'aro, lente, entrada, saída, núcleo');
  const formas = s => [...s.matchAll(/ d="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(formas(svg), formas(claro), 'o mesmo desenho do claro, só a cor muda');
});
test('o botão do tema: alvo de 44 px ou mais, escondido sem JS, ícone pelo tema (não pelo clique), e a logo encolhe para caber até 320', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  const b = blocoDe(css, '.nav__tema');
  assert.ok(b, 'o estilo do botão');
  for (const lado of ['width', 'height']) { const m = new RegExp('(?:^|[;\\s])' + lado + ':\\s*(\\d+)px').exec(b); assert.ok(m && Number(m[1]) >= 44, lado + ' ≥ 44'); }
  assert.match(css, /html:not\(\[data-tema\]\) \.nav__tema \{[^}]*display: none/, 'sem JS o botão não faria nada: não aparece');
  assert.match(css, /html\[data-tema="claro"\] \.nav__tema__sol/, 'o ícone segue o tema aplicado');
  assert.match(css, /\.orc \.nav:has\(\.nav__tema\) \.marca--nav \{[^}]*96px/, 'a logo deixa lugar para o tema e o menu (48 + 48)');
  assert.doesNotMatch(b, /blur|drop-shadow|glow/, 'sem desfoque nem brilho');
});
test('a barra fina do radar não repete o valor ao lado do palco: só aparece depois que o palco saiu da tela', () => {
  const barra = semComentario(lerTexto('js/orcamento-escopo-barra.js'));
  assert.match(barra, /var mostrar = [^;]*!palcoVisto/, 'a decisão espera o palco sair da tela');
  assert.match(barra, /querySelector\('\.orc-palco'\)/);
  assert.match(barra, /io\.observe\(palco\)/);
  /* depois de escrever, a barra espera a pessoa rolar: voltando na hora ela cobria o "Seguir" no meio do toque (o E2E pegou depois da retomada) */
  assert.match(barra, /var mostrar = [^;]*!esperaRolar/);
  assert.match(barra, /function mudarEscrita\(agora\) \{ if \(escrevendo && !agora\) esperaRolar = true;/);
  assert.match(barra, /addEventListener\('scroll', function \(\) \{ if \(!esperaRolar\) return; esperaRolar = false; decidir\(\); \}, \{ passive: true \}\)/);
});
test('uma identificação só do Zero na conversa (o título, com "assistente virtual (IA)"); cada fala fica com o símbolo', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.doesNotMatch(css, /content: "Zero"/, 'sem o "ZERO" repetido em cada fala');
  assert.match(css, /\.msg--agente::before \{[^}]*zero-simbolo-(claro|escuro)\.svg/, 'o símbolo segue marcando quem fala');
  assert.match(semComentario(lerTexto('orcamento.html')), /<h2 id="o-conversa-titulo" class="orc-rotulo">Zero, assistente virtual \(IA\) da Beyon Zero<\/h2>/, 'a identificação de IA continua à vista');
});
test('a caixa da conversa para a rolagem no começo de uma fala: nada cortado no topo', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.match(css, /\.orc-log \{[^}]*scroll-snap-type: y proximity/, 'proximity: o mandatory brigava com a rolagem até o botão de um passo aberto');
  assert.match(css, /\.orc-log__lista > li \{[^}]*scroll-snap-align: start/);
  assert.match(css, /\.orc-log__lista > li:last-child \{[^}]*scroll-snap-align: start end/, 'o fim da conversa continua alcançável');
  assert.match(lerTexto('docs/cortes.mjs'), /cortado no topo da rolagem/, 'o varredor confere o topo da caixa');
  /* a folga embaixo: o que falta para a última fala do Zero alcançar o topo (a rolagem acabava antes, e o topo cortava a fala anterior) */
  assert.equal(P.folgaNecessaria(500, 180), 320, 'fala + opções curtas: a lista ganha a folga que falta');
  assert.equal(P.folgaNecessaria(500, 620), 0, 'o que vem depois da fala já passa da caixa: nenhuma folga');
  for (const [a, b] of [[NaN, 10], [500, NaN], [0, 10], [-5, 10], [500, -1], ['500', 10]]) assert.equal(P.folgaNecessaria(a, b), a === '500' ? 490 : 0, String([a, b]));
  assert.doesNotThrow(() => P.ligarCaixa({ getElementById: () => null }, {}), 'sem a caixa, nada acontece');
  assert.doesNotThrow(() => P.ajustarFolga(), 'sem a caixa ligada, ajustar não faz nada');
  /* quem rola é quem já rolava: eles ajustam a folga antes da conta; o palco não rola (2 rolagens suaves brigavam e o toque caía fora do botão) */
  for (const arq of ['js/orcamento-toques.js', 'js/orcamento.js']) assert.match(lerTexto(arq), /BZOrcPalco\.ajustarFolga\(\)/, arq);
  assert.doesNotMatch(semComentario(lerTexto('js/orcamento-palco.js')), /scrollTop\s*=/, 'o palco não rola a caixa');
});

/* dono, 24/11: "as opções já pré-selecionadas [com] um destaque um pouco menor do que a opção do usuário conversar com o Zero com suas
   próprias palavras". As opções descem um degrau (menores, texto e número em cinza); o campo de escrever vira o protagonista */
const OPCAO = '.orc-op--toque, .orc-op--ic, .orc-toque__ops:has(.orc-op--ic) > .orc-op--ic:last-child:nth-child(odd)';
const px = (bloco, prop) => { const m = new RegExp('(?:^|[;\\s])' + prop + ':\\s*([\\d.]+)(px|rem)').exec(bloco || ''); return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : NaN; };
test('a conversa: as opções prontas ficam um degrau abaixo do campo de escrever, sem perder o alvo de toque', () => {
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  const op = blocoDe(css, OPCAO), campo = blocoDe(css, '.orc-envio textarea');
  assert.ok(op && campo, 'as duas regras');
  assert.ok(px(op, 'min-height') >= 44, 'opção: alvo de 44 px ou mais');
  assert.ok(px(op, 'min-height') < px(campo, 'min-height'), 'a opção é mais baixa que o campo');
  assert.ok(px(op, 'font-size') < px(campo, 'font-size'), 'a letra da opção é menor que a do campo');
  assert.match(op, /(?:^|[;\s])color: var\(--t2\)/, 'o texto da opção em cinza (o branco/tinta fica para o que a pessoa escreve)');
  assert.match(campo, /(?:^|[;\s])border: 1px solid var\(--ac\)/, 'o campo tem o contorno na cor de ação: é ele que chama');
  assert.match(campo, /border-radius: \d+px/);
  assert.match(semComentario(lerTexto('orcamento.html')), /<textarea id="o-texto"[^>]*placeholder="Ou conte do seu jeito[^"]*"/, 'a dica convida a falar com as próprias palavras');
});

/* "deixe o ícone de onde clicam para ativar o áudio mais bonitinho e com efeitos minimalistas": um microfone desenhado na linha da logo
   (traço de 1,5, pontas redondas, o núcleo em ponto) e, gravando, UM traço fino girando em volta. Sem blur, sem brilho, sem sombra */
test('o microfone: ícone próprio, um traço só que gira durante a gravação e para com movimento reduzido', () => {
  const html = semComentario(lerTexto('orcamento.html'));
  const mic = /<button class="btn orc-mic"[^>]*id="o-mic"[^>]*>([\s\S]*?)<\/button>/.exec(html);
  assert.ok(mic, 'o botão do microfone');
  assert.match(mic[1], /<span class="orc-mic__icone" aria-hidden="true"><svg class="orc-mic__svg"[^>]*viewBox="0 0 24 24"/, 'o ícone desenhado, escondido do leitor de tela');
  assert.doesNotMatch(mic[1], /orc-mic__ponto/, 'o ponto antigo saiu');
  assert.match(mic[1], /<span id="o-mic-rotulo">Falar<\/span>/, 'o rótulo (e o tempo, gravando) continua escrito');
  const css = semComentario(lerTexto('css/orcamento-voz.css'));
  assert.ok(px(blocoDe(css, '.orc-mic .orc-mic__icone'), 'width') >= 24, 'o ícone tem corpo');
  assert.match(css, /\.orc-mic\.is-gravando \.orc-mic__icone::after \{[^}]*animation: orc-mic-giro/, 'gravando: o traço gira');
  const giro = /@keyframes orc-mic-giro \{([^@]*?)\}\s*\}/.exec(css);
  assert.ok(giro, 'a volta do traço');
  assert.doesNotMatch(giro[1].replace(/transform:[^;}]+/g, ''), /[a-z-]+:/, 'só transform (compositor; regra 1)');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.orc-mic\.is-gravando \.orc-mic__icone::after \{[^}]*animation: none/, 'movimento reduzido: o traço para');
  assert.match(css, /html\.menos-movimento \.orc-mic\.is-gravando \.orc-mic__icone::after \{[^}]*animation: none/, 'o interruptor do rodapé também');
  assert.doesNotMatch(css, /blur|backdrop-filter|drop-shadow|filter\s*:|text-shadow|radial-gradient|box-shadow|glow/i, 'sem desfoque, sem brilho, sem sombra');
});

/* dono, 24/11 (depois): "Dê um pouco mais de detalhes em tudo, com ênfase no campo aonde o usuário escreve e no microfone e seu ícone".
   A variação B de docs/design/orcamento-detalhes-2026-11-24.md: a luz que dá UMA volta pela linha do campo ao entrar nele, o microfone
   num disco chapado (centrado de verdade), o núcleo piscando enquanto grava, o Enviar com a seta */
test('o campo: ao entrar nele, uma luz curta dá UMA volta pela própria linha da borda; parado e com movimento reduzido, nada a mais', () => {
  const html = semComentario(lerTexto('orcamento.html'));
  const campo = /<div class="orc-campo">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(campo, 'o campo mora na caixa .orc-campo (a luz acompanha o tamanho dele)');
  assert.match(campo[1], /<textarea id="o-texto"/);
  assert.match(campo[1], /<svg class="orc-campo__luz" aria-hidden="true" focusable="false"><rect pathLength="100"\/><\/svg>/, 'a luz: um traço só, escondido do leitor de tela');
  const css = semComentario(lerTexto('css/orcamento-palco.css'));
  assert.match(css, /\n\.orc-campo__luz \{ display: none; \}/, 'sem movimento (ou sem o @media), a luz nem existe');
  const mov = /@media \(prefers-reduced-motion: no-preference\) \{([^@]*?\.orc-campo__luz[^@]*?)\n\}/.exec(css);
  assert.ok(mov, 'a luz só com movimento ligado');
  assert.match(mov[1], /html:not\(\.menos-movimento\) \.orc-campo__luz \{[^}]*display: block/, 'o interruptor do rodapé também a desliga');
  const volta = /html:not\(\.menos-movimento\) \.orc-campo:focus-within \.orc-campo__luz rect \{([^}]*)\}/.exec(mov[1]);
  assert.ok(volta, 'a volta começa quando a pessoa entra no campo');
  assert.match(volta[1], /animation: orc-campo-volta /);
  assert.doesNotMatch(volta[1], /infinite/, 'UMA volta: depois o campo fica quieto para a pessoa escrever');
  const traco = /\.orc-campo__luz rect \{[^}]*stroke-dasharray: (\d+) (\d+)/.exec(mov[1]);
  assert.ok(traco && Number(traco[1]) + Number(traco[2]) === 100 && Number(traco[1]) <= 12, 'um traço curto (até 12 % da volta), nunca a borda inteira acesa');
  const kf = /@keyframes orc-campo-volta \{([^\n]*)\}/.exec(css);
  assert.ok(kf, 'a volta');
  assert.doesNotMatch(kf[1].replace(/stroke-dashoffset:[^;}]+|opacity:[^;}]+/g, ''), /[a-z-]+:/, 'só o caminho do traço e a opacidade');
  assert.match(blocoDe(css, '.orc-envio textarea'), /caret-color: var\(--ac\)/, 'o cursor na cor de ação');
});

test('o microfone: centrado no disco (ganha da regra geral .btn span), o núcleo pisca enquanto grava e para com movimento reduzido', () => {
  const css = semComentario(lerTexto('css/orcamento-voz.css'));
  const icone = blocoDe(css, '.orc-mic .orc-mic__icone');
  assert.ok(icone, 'a regra do ícone tem de vencer ".btn span { display: inline-block }" (css/base.css), que o deixava torto');
  assert.match(icone, /display: inline-grid; place-items: center/);
  assert.match(icone, /border-radius: 50%; background-color: rgb\(var\(--ac-rgb\) \/ \.\d+\)/, 'o disco chapado da cor de ação, clarinho');
  assert.match(css, /\.orc-mic\.is-gravando \.orc-mic__nucleo \{[^}]*animation: orc-mic-pisca/, 'gravando: o núcleo pisca');
  const pisca = /@keyframes orc-mic-pisca \{([^@]*?)\}\s*\}/.exec(css);
  assert.ok(pisca, 'a piscada');
  assert.doesNotMatch(pisca[1].replace(/opacity:[^;}]+/g, ''), /[a-z-]+:/, 'só opacidade');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.orc-mic\.is-gravando \.orc-mic__nucleo \{[^}]*animation: none/, 'movimento reduzido: o núcleo fica aceso');
  assert.match(css, /html\.menos-movimento \.orc-mic\.is-gravando \.orc-mic__nucleo \{[^}]*animation: none/);
  assert.match(css, /#o-mic-rotulo \{[^}]*font-variant-numeric: tabular-nums/, 'o relógio da gravação não sacode');
});

test('o Enviar casado com o campo: a palavra e uma seta de traço escondida do leitor de tela, na altura do Falar', () => {
  const html = semComentario(lerTexto('orcamento.html'));
  assert.match(html, /<button class="btn btn--primary orc-enviar" type="submit" id="o-enviar">Enviar<svg class="orc-enviar__seta" aria-hidden="true" focusable="false"/, 'o nome do botão continua "Enviar"');
  const palco = semComentario(lerTexto('css/orcamento-palco.css')), voz = semComentario(lerTexto('css/orcamento-voz.css'));
  assert.equal(px(blocoDe(palco, '.orc-envio #o-enviar'), 'min-height'), px(blocoDe(voz, '.orc-mic'), 'min-height'), 'Enviar e Falar com a mesma altura');
  assert.ok(px(blocoDe(palco, '.orc-envio #o-enviar'), 'min-height') >= 44, 'alvo de toque');
});
