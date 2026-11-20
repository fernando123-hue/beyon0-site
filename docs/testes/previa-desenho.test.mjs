/* O TOPO E AS FONTES das prévias dos modelos (PR (a) da qualidade visual, 18/11). O desenhista (js/previa.js) roda de verdade num DOM de mentira mínimo
   (createElement, createElementNS, setAttribute, style.setProperty, appendChild); o resultado na tela real é provado pelo olhar no celular (390/320/desktop).
   O que se trava aqui: as fontes autorais são HOSPEDADAS (CSP font-src 'self', sem Google Fonts em runtime) e cada uma tem arquivo e @font-face; o topo
   tem a arte desenhada por código (SVG sem innerHTML, sem style inline, sem blur nem brilho: regra do dono) que muda entre os 3 modelos do mesmo negócio e
   é sempre a mesma para a mesma entrada; a variante do topo vira classe; direção antiga (sem nada novo) continua desenhando. node --test */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
const JS = ler('js/previa.js'), CSS = ler('css/previa.css');

/* ---- um DOM de mentira só com o que o desenhista usa ---- */
function no(tag, ns) {
  const attrs = {}, estilo = {};
  const e = {
    tag, ns: ns || null, filhos: [], attrs, estilo, _classe: '', _texto: '',
    set className(v) { e._classe = v; }, get className() { return e._classe; },
    set textContent(v) { e._texto = String(v); e.filhos = []; }, get textContent() { return e._texto + e.filhos.map(f => f.textContent || f._t || '').join(''); },
    setAttribute(k, v) { attrs[k] = String(v); if (k === 'class') e._classe = String(v); },
    getAttribute: k => (k === 'class' ? e._classe : attrs[k]),
    style: { setProperty: (k, v) => { estilo[k] = v; } },
    appendChild(f) { e.filhos.push(f); return f; },
    set title(v) { attrs.title = v; }
  };
  return e;
}
const doc = { createElement: t => no(t), createElementNS: (ns, t) => no(t, ns), createTextNode: t => ({ _t: String(t), textContent: String(t) }) };
function carregar() {
  const w = {};
  new Function('window', 'document', JS)(w, doc);
  return w.BZPrevia;
}
const todos = (raiz, f = () => true, out = []) => { if (f(raiz)) out.push(raiz); (raiz.filhos || []).forEach(x => todos(x, f, out)); return out; };
const comClasse = (raiz, c) => todos(raiz, n => (n._classe || '').split(' ').includes(c));

const direcao = (extra = {}) => ({
  nome_conceito: 'Direto ao ponto', estrategia: 'conversao',
  identidade: { paleta: { fundo: '#FFF8F3', superficie: '#FBE9E0', texto: '#3A2420', texto_suave: '#6E5550', destaque: '#B5476B', destaque_texto: '#FFFFFF' }, tipografia: { titulos: 'serif_moderna', texto: 'sans_humanista' }, estilo: { cantos: 'redondos', densidade: 'equilibrada', tema: 'claro' } },
  navegacao: { marca: 'Doce Ateliê da Ana', itens: ['Bolos', 'Contato'], cta: 'Encomendar' },
  secoes: [
    { tipo: 'hero', variante: 'split', rotulo: 'Confeitaria em Campinas', titulo: 'Bolos feitos sob encomenda', subtitulo: 'Com ingredientes de verdade.', texto: 'Conte a data e a ideia.', itens: [], cta: 'Encomendar pelo WhatsApp' },
    { tipo: 'servicos', variante: 'cartoes', rotulo: '', titulo: 'Serviços', subtitulo: '', texto: '', itens: [{ titulo: 'Bolos', texto: 'Para aniversário.' }], cta: '' },
    { tipo: 'cta', variante: 'centro', rotulo: '', titulo: 'Vamos conversar', subtitulo: '', texto: '', itens: [], cta: 'Pedir contato' }
  ],
  rodape: { texto: 'Doce Ateliê da Ana' },
  ...extra
});

test('as fontes autorais são hospedadas: cada família da pilha tem @font-face no css/previa.css com arquivo em assets/fonts (sem Google Fonts, sem URL de fora)', () => {
  const { FONTES } = carregar();
  const aut = { serif_moderna: 'Fraunces', sans_humanista: 'DM Sans', serif_classica: 'Lora' };
  for (const [chave, familia] of Object.entries(aut)) {
    assert.ok(FONTES[chave].startsWith("'" + familia + "'"), chave + ' começa pela fonte hospedada ' + familia + ': ' + FONTES[chave]);
    for (const peso of [400, 600]) {
      const bloco = new RegExp("@font-face\\s*\\{[^}]*font-family:\\s*'" + familia + "'[^}]*font-weight:\\s*" + peso + "[^}]*\\}").exec(CSS);
      assert.ok(bloco, '@font-face de ' + familia + ' ' + peso);
      const url = /url\('\.\.\/(assets\/fonts\/[a-z0-9-]+\.woff2)'\)/.exec(bloco[0]);
      assert.ok(url, familia + ' ' + peso + ': url local relativa');
      const tamanho = fs.statSync(new URL('../../' + url[1], import.meta.url)).size;
      assert.ok(tamanho > 5000 && tamanho < 40000, familia + ' ' + peso + ' pesa ' + tamanho + ' bytes (subconjunto latino, até 40 KB)');
    }
  }
  assert.ok(!/https?:\/\//.test(CSS) && !/googleapis|gstatic/.test(CSS + JS), 'nenhuma fonte (nem nada) vem de fora');
  assert.ok(fs.existsSync(new URL('../../assets/fonts/LICENCAS.txt', import.meta.url)), 'a licença OFL das fontes acompanha os arquivos');
});

test('as chaves antigas continuam valendo (direção já gravada): as cinco famílias seguem na lista fechada', () => {
  const { FONTES } = carregar();
  assert.deepEqual(Object.keys(FONTES).sort(), ['mono_tecnica', 'sans_geometrica', 'sans_humanista', 'serif_classica', 'serif_moderna']);
});

test('o topo tem a arte desenhada por código: um SVG com formas, no lugar da caixa riscada vazia', () => {
  const raiz = carregar().desenhar(direcao());
  const arte = comClasse(raiz, 'pv-arte');
  assert.equal(arte.length, 1, 'uma arte, só no topo');
  const svg = todos(arte[0], n => n.tag === 'svg');
  assert.equal(svg.length, 1);
  assert.equal(svg[0].ns, 'http://www.w3.org/2000/svg', 'criado com createElementNS (nunca innerHTML)');
  assert.equal(svg[0].attrs.viewBox, '0 0 390 300');
  assert.ok(todos(svg[0], n => n !== svg[0]).length >= 8, 'o desenho tem formas de verdade');
  assert.ok(/foto/i.test(arte[0].textContent), 'a legenda diz que ali entra a foto do cliente');
});

test('o desenho do topo é determinístico e muda entre os 3 modelos do mesmo negócio', () => {
  const D = carregar();
  const forma = e => JSON.stringify(todos(comClasse(D.desenhar(e), 'pv-arte')[0], n => n.tag === 'svg')[0], (k, v) => (k === 'estilo' || k === 'style' ? undefined : v));
  const base = direcao();
  assert.equal(forma(base), forma(direcao()), 'mesma entrada, mesmo desenho');
  const tres = ['conversao', 'autoridade', 'experiencia'].map(estrategia => forma(direcao({ estrategia })));
  assert.equal(new Set(tres).size, 3, 'os 3 modelos do mesmo negócio têm 3 desenhos diferentes no topo');
  const marcas = ['Cedro & Linha', 'Frio Certo', 'Clínica Sol', 'Padaria Lua', 'Studio Aurora', 'Oficina Norte'];
  const porNegocio = new Set(marcas.map(marca => forma(direcao({ navegacao: { marca, itens: [], cta: 'Pedir' } }))));
  assert.ok(porNegocio.size >= 3, 'negócios diferentes ganham desenhos diferentes (' + porNegocio.size + ' de 6 marcas)');
});

test('no topo com itens, a arte vem antes dos itens (os cartões não grudam na borda nem passam na frente da arte)', () => {
  const comItens = direcao({ secoes: [{ ...direcao().secoes[0], itens: [{ titulo: 'Orçamento no mesmo dia', texto: 'x' }] }, ...direcao().secoes.slice(1)] });
  const topo = comClasse(carregar().desenhar(comItens), 'pv-sec--hero')[0];
  const classes = topo.filhos.map(f => f._classe.split(' ')[0]);
  assert.deepEqual(classes, ['pv-cab', 'pv-arte', 'pv-itens']);
});

test('a arte respeita a CSP e a regra do dono: nada de style inline, filtro, blur nem brilho; a cor vem de classe do CSS', () => {
  const raiz = carregar().desenhar(direcao());
  const formas = todos(comClasse(raiz, 'pv-arte')[0], n => n.tag !== 'svg' && n.ns);
  assert.ok(formas.length >= 8, 'há formas para conferir (o teste não passa no vazio)');
  for (const f of formas) {
    assert.ok(!('style' in f.attrs) && !('filter' in f.attrs) && !('fill' in f.attrs && /url\(/.test(f.attrs.fill)), 'forma ' + f.tag + ' sem style/filter');
    assert.ok(/^a-(forte|fraco|cheio|vazio)$/.test(f.attrs.class), 'cor por classe fechada: ' + f.attrs.class);
  }
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(JS.replace(/\/\*[\s\S]*?\*\//g, '')), 'nada de innerHTML no desenhista');
  assert.ok(!/blur|drop-shadow|box-shadow|text-shadow|backdrop-filter|filter:/.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '')), 'sem blur nem brilho no CSS da prévia');
});

test('a variante do topo vira classe; variante fora da lista cai em split; o botão do topo é um só', () => {
  const D = carregar();
  const secaoTopo = v => comClasse(D.desenhar(direcao({ secoes: [{ ...direcao().secoes[0], variante: v }, ...direcao().secoes.slice(1)] })), 'pv-sec--hero')[0];
  for (const v of ['split', 'centro', 'faixa']) assert.ok(secaoTopo(v)._classe.split(' ').includes('pv-hero--' + v), 'pv-hero--' + v);
  for (const v of ['lista', 'grade', 'x']) assert.ok(secaoTopo(v)._classe.split(' ').includes('pv-hero--split'), v + ' cai em split');
  assert.equal(comClasse(secaoTopo('split'), 'pv-btn').length, 1);
});

test('texto do modelo continua entrando só por textContent/createTextNode e o espaço reservado continua marcado', () => {
  const raiz = carregar().desenhar(direcao({ secoes: [{ ...direcao().secoes[0], titulo: '<b>x</b> [Anos de oficina]' }, ...direcao().secoes.slice(1)] }));
  const h = comClasse(raiz, 'pv-h1')[0];
  assert.ok(h.textContent.includes('<b>x</b>'), 'o texto fica texto, não vira tag');
  assert.equal(comClasse(h, 'pv-reservado').length, 1);
});

test('direção antiga (sem estrategia, sem nada novo) continua desenhando', () => {
  const velha = direcao(); delete velha.estrategia;
  const raiz = carregar().desenhar(velha);
  assert.equal(comClasse(raiz, 'pv-arte').length, 1);
  assert.equal(comClasse(raiz, 'pv-sec').length, 3);
});

test('o CSS do topo: arte sem listras, título do topo maior, texto longo do topo só quando cabe, e o topo em faixa usa a cor de destaque', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/repeating-linear-gradient/.test(css), 'a caixa riscada vazia saiu');
  assert.ok(/\.pv-sec--hero \.pv-h1\s*\{[^}]*font-size:\s*clamp\(3\dpx,[^)]*,\s*4\dpx\)[^}]*overflow-wrap:\s*break-word/.test(css), 'título do topo de 34 a 44 px conforme a largura (cqw), sem estourar em 320 px');
  assert.ok(/\.pv-hero--faixa[^{]*\{[^}]*background:\s*var\(--pv-dest\)/.test(css), 'topo em faixa: fundo de destaque');
  const largo = css.slice(css.indexOf('@container'));
  assert.ok(/\.pv-sec--hero \.pv-texto\s*\{[^}]*display:\s*block/.test(largo), 'o texto longo do topo volta DENTRO do bloco do container largo');
  assert.ok(/\.pv-sec--hero \.pv-texto\s*\{[^}]*display:\s*none/.test(css.slice(0, css.indexOf('@container'))), 'e some fora dele (celular)');
  assert.ok(/\.pv-arte svg \*\s*\{[^}]*vector-effect:\s*non-scaling-stroke/.test(css), 'o traço da arte não engrossa quando estica');
  assert.ok(/\.pv-arte__leg\s*\{[^}]*color:\s*var\(--pv-texto\)/.test(css), 'a legenda usa a cor de texto (contraste de leitura, não o texto suave)');
  assert.ok(/\.pv-sec--hero\s*\{[^}]*padding:\s*0 0 calc\(var\(--pv-esp\)/.test(css), 'a densidade vale no topo do celular');
  /* o dono escolheu a opção A (19/11): no celular a arte é uma tira ANTES do título, para o cartão da escolha (300 px) mostrar arte + título; no largo volta ao lado */
  const estreito = css.slice(0, css.indexOf('@container'));
  assert.ok(/\.pv-sec--hero \.pv-arte\s*\{[^}]*order:\s*-1[^}]*height:\s*1[0-4]\dpx/.test(estreito), 'celular: arte em tira (100 a 149 px) antes do título');
  assert.ok(/\.pv-sec--hero \.pv-arte\s*\{[^}]*order:\s*0/.test(css.slice(css.indexOf('@container'))), 'container largo: a arte volta à ordem normal (grade de duas colunas)');
  assert.ok(/\.pv-hero--faixa \.pv-reservado/.test(css), 'o espaço reservado não some no topo em faixa');
});

test('encaixar com ajuste de altura mede de novo quando as fontes hospedadas assentam (document.fonts.ready); sem document.fonts não quebra', async () => {
  const feito = [];
  const janela = { clientWidth: 350, style: {} };
  const tela = { style: {}, offsetHeight: 1000 };
  let liberar;
  doc.fonts = { ready: new Promise(r => { liberar = r; }) };
  try {
    const D = carregar();
    const escala = D.encaixar(janela, tela, 390, true);
    assert.ok(escala < 1 && /scale/.test(tela.style.transform));
    assert.equal(janela.style.height, Math.ceil(1000 * escala) + 'px', 'altura no primeiro encaixe');
    tela.offsetHeight = 1200; feito.push('fonte chegou');
    liberar();
    await doc.fonts.ready; await new Promise(r => setImmediate(r));
    assert.equal(janela.style.height, Math.ceil(1200 * escala) + 'px', 'altura refeita depois das fontes');
    delete doc.fonts;
    assert.doesNotThrow(() => D.encaixar({ clientWidth: 390, style: {} }, { style: {}, offsetHeight: 10 }, 390, true));
    assert.doesNotThrow(() => D.encaixar({ clientWidth: 390, style: {} }, { style: {}, offsetHeight: 10 }, 390, false));
  } finally { delete doc.fonts; }
  assert.deepEqual(feito, ['fonte chegou']);
});

/* ======================= PR (b): as seções (lista em linhas, passos com linha, moldura de foto, números, depoimento, fecho) ======================= */
const secao = (tipo, variante, itens, extra = {}) => ({ tipo, variante, rotulo: 'Rótulo', titulo: 'Título ' + tipo, subtitulo: '', texto: '', itens, cta: '', ...extra });
const desenharCom = (...secoes) => carregar().desenhar(direcao({ secoes: [direcao().secoes[0], ...secoes] }));
const lista = raiz => comClasse(raiz, 'pv-itens')[0];
const I3 = [{ titulo: 'Um', texto: 'Texto um.' }, { titulo: 'Dois', texto: 'Texto dois.' }, { titulo: 'Três', texto: 'Texto três.' }];

test('a galeria vira moldura de foto desenhada (legenda = título), não caixa de texto com colchete', () => {
  const g = lista(desenharCom(secao('galeria', 'grade', [{ titulo: 'Cozinha planejada', texto: '[Foto de uma cozinha entregue]' }, { titulo: 'Closet', texto: '[Foto de um closet]' }])));
  assert.ok(g._classe.split(' ').includes('pv-itens--galeria'));
  const fotos = comClasse(g, 'pv-foto');
  assert.equal(fotos.length, 2);
  assert.equal(comClasse(fotos[0], 'pv-foto__leg')[0].textContent, 'Cozinha planejada', 'a legenda é o título do item');
  assert.equal(comClasse(fotos[0], 'pv-item__x').length, 0, 'o colchete "[Foto de…]" não vira texto solto: a moldura é o espaço da foto');
});

test('números: o número grande em cima do rótulo, em grade; espaço reservado continua marcado', () => {
  const n = lista(desenharCom(secao('numeros', 'faixa', [{ titulo: '[Anos de oficina]', texto: 'Fabricando móveis' }, { titulo: '[Projetos entregues]', texto: 'Ambientes' }])));
  assert.ok(n._classe.split(' ').includes('pv-itens--numeros'));
  const num = comClasse(n, 'pv-num')[0];
  assert.equal(comClasse(num, 'pv-numero').length, 1);
  assert.equal(comClasse(comClasse(num, 'pv-numero')[0], 'pv-reservado').length, 1);
  assert.ok(comClasse(num, 'pv-numero')[0]._classe.includes('pv-numero--texto'), 'o "[espaço reservado]" é frase: usa o tamanho menor e não estoura a coluna');
  const real = lista(desenharCom(secao('numeros', 'lista', [{ titulo: '12 anos', texto: 'de oficina' }])));
  assert.equal(comClasse(real, 'pv-numero')[0]._classe, 'pv-numero', 'número de verdade segue grande');
});

test('depoimentos: citação com autor, sem itálico sintetizado (as fontes hospedadas não têm a face itálica)', () => {
  const d = lista(desenharCom(secao('depoimentos', 'cartoes', [{ titulo: 'Ana, cliente', texto: 'Ficou do jeito que eu queria.' }])));
  assert.ok(d._classe.split(' ').includes('pv-itens--depoimentos'));
  assert.equal(comClasse(d, 'pv-citacao')[0].textContent, 'Ficou do jeito que eu queria.');
  assert.equal(comClasse(d, 'pv-item__autor')[0].textContent, 'Ana, cliente');
  assert.ok(!/\.pv-citacao\s*\{[^}]*font-style:\s*italic/.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '')), 'sem itálico falso na citação');
});

test('processo e linha do tempo viram passos com número e linha; a variante lista vira linhas editoriais numeradas; cartões seguem cartões', () => {
  const passos = lista(desenharCom(secao('processo', 'linha_do_tempo', I3)));
  assert.ok(passos._classe.split(' ').includes('pv-itens--passos'));
  assert.deepEqual(comClasse(passos, 'pv-passo__n').map(x => x.textContent), ['1', '2', '3']);
  const tempo = lista(desenharCom(secao('servicos', 'linha_do_tempo', I3)));
  assert.ok(tempo._classe.split(' ').includes('pv-itens--passos'), 'a variante linha_do_tempo também');
  const linhas = lista(desenharCom(secao('servicos', 'lista', I3)));
  assert.ok(linhas._classe.split(' ').includes('pv-itens--linhas'));
  assert.deepEqual(comClasse(linhas, 'pv-linha__i').map(x => x.textContent), ['01', '02', '03']);
  const cartoes = lista(desenharCom(secao('servicos', 'cartoes', I3)));
  assert.ok(cartoes._classe.split(' ').includes('pv-itens--cartoes'));
});

test('cta e contato fecham a página em bloco de cor (pv-sec--fecho); outras seções não', () => {
  const raiz = desenharCom(secao('servicos', 'cartoes', I3), secao('cta', 'centro', [], { cta: 'Pedir contato' }));
  const fechos = comClasse(raiz, 'pv-sec--fecho');
  assert.equal(fechos.length, 1);
  assert.equal(comClasse(raiz, 'pv-sec--servicos')[0]._classe.includes('pv-sec--fecho'), false);
  assert.equal(comClasse(desenharCom(secao('contato', 'centro', [])), 'pv-sec--fecho').length, 1);
});

test('direção antiga e itens vazios continuam desenhando (sem lista quando não há item)', () => {
  const raiz = desenharCom(secao('servicos', 'cartoes', []), secao('galeria', 'grade', [{ titulo: '', texto: '' }]));
  assert.equal(comClasse(raiz, 'pv-sec').length, 3);
  assert.doesNotThrow(() => desenharCom(secao('numeros', 'lista', [{ titulo: '', texto: 'só texto' }]), secao('depoimentos', 'faixa', [{ titulo: '', texto: '' }])));
});

test('CSS das seções: linhas editoriais, passos com linha, moldura de foto com cantos, fecho em destaque; sem blur, sombra nem filtro', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const regra of [/\.pv-itens--linhas \.pv-item\s*\{/, /\.pv-passo__n\s*\{[^}]*border-radius:\s*50%/, /\.pv-foto\s*\{[^}]*aspect-ratio/, /\.pv-foto::before/, /\.pv-sec--fecho\s*\{[^}]*background:\s*var\(--pv-dest\)/, /\.pv-itens--numeros/]) assert.ok(regra.test(css), String(regra));
  assert.ok(!/blur|drop-shadow|box-shadow|text-shadow|backdrop-filter|filter:/.test(css), 'sem blur nem brilho');
  assert.ok(/\.pv-sec:nth-of-type\(even\) \.pv-itens--cartoes \.pv-item\s*\{/.test(css) && !/\.pv-sec:nth-of-type\(even\) \.pv-item\s*\{/.test(css), 'o fundo branco das faixas pares vale só para os cartões (senão cobre as linhas, os números e a citação)');
  assert.ok(/\.pv-foto\s*\{[^}]*flex-direction:\s*row/.test(css), 'a legenda da moldura fica embaixo (o item é coluna por padrão)');
  assert.ok(/\.pv-v--faixa \.pv-numero[^{]*\{[^}]*color:\s*var\(--pv-dest-texto\)/.test(css), 'na faixa de cor cheia o número lê na cor do texto do destaque (senão some: destaque sobre destaque)');
});
