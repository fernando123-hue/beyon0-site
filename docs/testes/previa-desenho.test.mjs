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
  const secaoComClasses = v => comClasse(carregar().desenhar(direcao({ secoes: [{ ...direcao().secoes[0], variante: v }, ...direcao().secoes.slice(1)] })), 'pv-sec--hero')[0]._classe.split(' ');
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
  assert.ok(/:is\(\.pv-v--faixa, \.pv-sec--fecho\) :is\(\.pv-cab,.*?\) \.pv-reservado/.test(css), 'o espaço reservado não some no topo em faixa (o topo em faixa também leva pv-v--faixa)');
  assert.ok(secaoComClasses('faixa').includes('pv-v--faixa'), 'o topo em faixa leva a classe pv-v--faixa que ativa essas regras');
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

test('item vazio não desenha lista nenhuma (nem a régua de cima) e não pula a numeração', () => {
  const raiz = desenharCom(secao('servicos', 'cartoes', []), secao('galeria', 'grade', [{ titulo: '', texto: '' }]), secao('servicos', 'lista', [{ titulo: '', texto: '' }]));
  assert.equal(comClasse(raiz, 'pv-sec').length, 4);
  assert.equal(comClasse(raiz, 'pv-itens').length, 0, 'sem item para desenhar, sem <ul>');
  assert.doesNotThrow(() => desenharCom(secao('numeros', 'lista', [{ titulo: '', texto: 'só texto' }]), secao('depoimentos', 'faixa', [{ titulo: '', texto: '' }])));
  const meio = lista(desenharCom(secao('processo', 'linha_do_tempo', [{ titulo: 'A', texto: '' }, { titulo: '', texto: '' }, { titulo: 'C', texto: '' }])));
  assert.deepEqual(comClasse(meio, 'pv-passo__n').map(x => x.textContent), ['1', '2'], 'o item vazio no meio não deixa buraco na numeração');
  const linhas = lista(desenharCom(secao('servicos', 'lista', [{ titulo: '', texto: '' }, { titulo: 'B', texto: '' }])));
  assert.deepEqual(comClasse(linhas, 'pv-linha__i').map(x => x.textContent), ['01']);
  assert.equal(comClasse(desenharCom(secao('depoimentos', 'cartoes', [{ titulo: 'Só o autor', texto: '' }])), 'pv-citacao').length, 0, 'depoimento sem frase não vira citação vazia');
});

test('precedência dos modos: galeria, números e depoimentos mandam pelo TIPO; processo manda sobre a variante lista; linha_do_tempo vira passos em qualquer tipo', () => {
  const modo = (tipo, variante) => lista(desenharCom(secao(tipo, variante, I3)))._classe.split(' ').find(c => c.startsWith('pv-itens--'));
  assert.equal(modo('galeria', 'linha_do_tempo'), 'pv-itens--galeria');
  assert.equal(modo('numeros', 'lista'), 'pv-itens--numeros');
  assert.equal(modo('depoimentos', 'lista'), 'pv-itens--depoimentos');
  assert.equal(modo('processo', 'lista'), 'pv-itens--passos');
  assert.equal(modo('diferenciais', 'linha_do_tempo'), 'pv-itens--passos');
  assert.equal(modo('diferenciais', 'faixa'), 'pv-itens--cartoes');
  assert.equal(modo('faq', 'lista'), 'pv-itens--linhas');
});

test('o rótulo da seção é um span só dentro do <p> (no flex, cada pedaço e cada "[reservado]" viraria um item solto com vão)', () => {
  const r = comClasse(desenharCom(secao('servicos', 'cartoes', I3, { rotulo: 'Atendemos em [cidade].' })), 'pv-rotulo').find(x => x.textContent.includes('Atendemos'));
  assert.deepEqual(r.filhos.map(f => f._classe), ['pv-rotulo__t']);
  assert.equal(comClasse(r, 'pv-reservado').length, 1);
});

test('galeria: a descrição de verdade do cliente aparece embaixo do título; o "[Foto de…]" não', () => {
  const g = lista(desenharCom(secao('galeria', 'grade', [{ titulo: 'Cozinha', texto: 'MDF com bancada de quartzo' }, { titulo: 'Closet', texto: '[Foto de um closet]' }])));
  const fotos = comClasse(g, 'pv-foto');
  assert.equal(comClasse(fotos[0], 'pv-foto__x')[0].textContent, 'MDF com bancada de quartzo');
  assert.equal(comClasse(fotos[1], 'pv-foto__x').length, 0);
});

test('CSS das seções: linhas editoriais, passos com linha, moldura de foto com cantos, fecho em destaque; sem blur, sombra nem filtro', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const regra of [/\.pv-itens--linhas \.pv-item\s*\{/, /\.pv-passo__n\s*\{[^}]*border-radius:\s*50%/, /\.pv-foto\s*\{[^}]*aspect-ratio/, /\.pv-foto::before/, /\.pv-sec--fecho\s*\{[^}]*background:\s*var\(--pv-dest\)/, /\.pv-itens--numeros/]) assert.ok(regra.test(css), String(regra));
  assert.ok(!/blur|drop-shadow|box-shadow|text-shadow|backdrop-filter|filter:/.test(css), 'sem blur nem brilho');
  assert.ok(/\.pv-sec:nth-of-type\(even\) \.pv-itens--cartoes \.pv-item\s*\{/.test(css) && !/\.pv-sec:nth-of-type\(even\) \.pv-item\s*\{/.test(css), 'o fundo branco das faixas pares vale só para os cartões (senão cobre as linhas, os números e a citação)');
  assert.ok(/\.pv-foto\s*\{[^}]*flex-direction:\s*row/.test(css), 'a legenda da moldura fica embaixo (o item é coluna por padrão)');
  /* a faixa de cor cheia e o fecho (revisão do PR): a cor do texto do destaque só nos modos SEM cartão; o cartão é branco e segue com as cores normais */
  assert.ok(/:is\(\.pv-v--faixa, \.pv-sec--fecho\) \.pv-itens:not\(\.pv-itens--cartoes\) :is\([^)]*\.pv-numero[^)]*\.pv-item__t[^)]*\.pv-linha__i[^)]*\)\s*\{[^}]*color:\s*var\(--pv-dest-texto\)/.test(css), 'número, título, índice e citação leem na cor do texto do destaque, mas só fora dos cartões');
  assert.ok(!/\.pv-v--faixa \.pv-item__t/.test(css), 'nenhuma regra recolore o título do cartão na faixa (branco sobre branco)');
  assert.ok(/:is\(\.pv-v--faixa, \.pv-sec--fecho\) \.pv-passo__n\s*\{[^}]*color:\s*var\(--pv-dest-texto\)/.test(css), 'o número do passo lê na cor do texto do destaque sobre o círculo de destaque');
  assert.ok(/:is\(\.pv-v--faixa, \.pv-sec--fecho\) :is\(\.pv-cab, \.pv-itens:not\(\.pv-itens--cartoes\)\) \.pv-reservado/.test(css), 'o espaço reservado mantém o contorno no fecho e na faixa (e não mexe nos cartões brancos)');
  assert.ok(/\.pv-sec\.pv-sec--fecho\s*\{[^}]*padding-top:\s*calc\(var\(--pv-esp\)/.test(css), 'a densidade vale no fecho');
  assert.ok(/\.pv-h2\s*\{[^}]*overflow-wrap:\s*break-word/.test(css), 'palavra longa no título da seção não estoura a coluna');
  const largo = css.slice(css.indexOf('@container'));
  for (const modo of ['galeria', 'numeros', 'passos', 'depoimentos']) {
    assert.ok(new RegExp('\\.pv-sec \\.pv-itens\\.pv-itens--' + modo + '\\s*\\{').test(largo), 'no container largo o modo ' + modo + ' ganha da variante (.pv-v--grade/.pv-v--lista .pv-itens, 0,2,0) pela especificidade (0,3,0)');
  }
  assert.ok(/\.pv-sec \.pv-itens\.pv-itens--galeria\s*\{[^}]*repeat\(3, 1fr\)/.test(largo), 'galeria com variante grade tem 3 colunas no desktop');
});

/* ---- segunda rodada de revisão (PR b): as combinações que o servidor aceita e que quebravam a leitura ---- */
const semComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const regraDe = (css, ancora) => { const i = css.indexOf(ancora); return i < 0 ? '' : css.slice(css.lastIndexOf('}', i) + 1, css.indexOf('}', i) + 1); };

test('galeria em faixa de cor: a legenda da foto tem fundo próprio, então a descrição do cliente NÃO ganha a cor do texto do destaque (branco sobre branco)', () => {
  const g = desenharCom(secao('galeria', 'faixa', [{ titulo: 'Cozinha', texto: 'Cozinha entregue em Contagem' }, { titulo: 'Closet', texto: '[Foto de um closet]' }]));
  assert.ok(comClasse(g, 'pv-v--faixa').length >= 1, 'a faixa vira classe da seção');
  assert.equal(comClasse(g, 'pv-foto__x')[0].textContent, 'Cozinha entregue em Contagem');
  const regraCor = semComentarios.split('\n').find(l => /--pv-dest-texto\); \}$/.test(l) && /:not\(\.pv-itens--cartoes\) :is\(/.test(l));
  assert.ok(regraCor && !/pv-foto__x|pv-foto__leg/.test(regraCor), 'a regra de cor da faixa não pega a descrição da legenda');
  assert.ok(/\.pv-foto__leg \.pv-reservado\s*\{[^}]*color-mix\(in srgb, var\(--pv-dest\)/.test(semComentarios), 'o espaço reservado dentro da legenda volta ao contorno normal');
});

test('fecho com itens em lista ou passos desenha a lista (linhas numeradas e passos) dentro do bloco de cor', () => {
  for (const [tipo, variante, modo] of [['cta', 'lista', 'linhas'], ['contato', 'linha_do_tempo', 'passos']]) {
    const raiz = desenharCom(secao(tipo, variante, I3));
    assert.ok(comClasse(raiz, 'pv-sec--fecho').length === 1, tipo + ' fecha em bloco de cor');
    assert.ok(comClasse(raiz, 'pv-itens--' + modo).length === 1, tipo + ' + ' + variante + ' desenha ' + modo);
  }
});

test('FAQ: só o modo cartões mexe no item; em faixa de cor o item vira cartão branco (texto sobre o destaque não é garantido); lista e passos não perdem o desenho', () => {
  assert.ok(/\.pv-sec\.pv-sec--faq \.pv-itens--cartoes \.pv-item\s*\{/.test(semComentarios), 'a regra do FAQ vale só para o modo cartões');
  assert.ok(!/\.pv-sec--faq \.pv-item\s*\{/.test(semComentarios), 'nenhuma regra do FAQ pega os itens de lista e de passos');
  assert.ok(/\.pv-sec\.pv-sec--faq\.pv-v--faixa \.pv-itens--cartoes \.pv-item\s*\{[^}]*background:\s*var\(--pv-fundo\)/.test(semComentarios), 'em faixa o item do FAQ é cartão com o fundo da página');
});

test('o número grande e o índice das linhas leem a cor de leitura do destaque (com o destaque como padrão)', () => {
  assert.ok(/\.pv-numero\s*\{[^}]*color:\s*var\(--pv-dest-leitura, var\(--pv-dest\)\)/.test(semComentarios));
  assert.ok(/\.pv-linha__i\s*\{[^}]*color:\s*var\(--pv-dest-leitura-fina, var\(--pv-dest-leitura, var\(--pv-dest\)\)\)/.test(semComentarios), 'o índice pequeno lê pela cor FINA, que cai na de leitura e depois no destaque');
});

test('destaque claro demais sobre o fundo (amarelo sobre branco) cai para a cor do texto; destaque legível fica como está', () => {
  const paleta = (destaque) => ({ identidade: { ...direcao().identidade, paleta: { ...direcao().identidade.paleta, destaque, destaque_texto: '#000000' } } });
  const fraco = carregar().desenhar(direcao(paleta('#FFE66D')));
  assert.equal(fraco.estilo['--pv-dest-leitura'], '#3A2420', 'amarelo sobre o fundo claro não lê: usa o texto');
  const bom = carregar().desenhar(direcao(paleta('#B5476B')));
  assert.equal(bom.estilo['--pv-dest-leitura'], undefined, 'o destaque que lê (≥ 3:1) segue como cor de leitura');
});

test('número da lista e do passo é decoração: aria-hidden; item com título/texto que não é string não vira <li> vazio nem gasta número', () => {
  const raiz = desenharCom(secao('processo', 'lista', [{ titulo: 42, texto: {} }, { titulo: 'Primeiro', texto: '' }, null, { titulo: 'Segundo', texto: 'x' }]));
  const itens = comClasse(raiz, 'pv-item');
  assert.equal(itens.length, 2, 'só os dois itens com texto de verdade');
  const n = comClasse(raiz, 'pv-passo__n');
  assert.deepEqual(n.map(x => x.textContent), ['1', '2'], 'a numeração conta só os desenhados');
  assert.ok(n.every(x => x.attrs['aria-hidden'] === 'true'));
  const linhas = desenharCom(secao('servicos', 'lista', I3));
  assert.ok(comClasse(linhas, 'pv-linha__i').every(x => x.attrs['aria-hidden'] === 'true'));
});

test('desktop: a galeria não deixa vão nem órfão (1/4/7 fotos abrem com faixa larga; 2/5/8 com foto de 2 colunas), os depoimentos do tipo centro ficam centralizados e o border-left dos números em faixa mantém a cor do destaque', () => {
  const largo = semComentarios.slice(semComentarios.indexOf('@container'));
  assert.ok(/\.pv-foto:first-child:nth-last-child\(3n\+1\)\s*\{[^}]*grid-column:\s*1 \/ -1/.test(largo));
  assert.ok(/\.pv-foto:first-child:nth-last-child\(3n\+2\)\s*\{[^}]*grid-column:\s*span 2/.test(largo));
  assert.ok(/\.pv-v--centro \.pv-itens--depoimentos\s*\{[^}]*margin-inline:\s*auto/.test(largo));
  assert.ok(/\.pv-num:nth-child\(even\)\s*\{[^}]*border-left-color:\s*color-mix\(in srgb, var\(--pv-dest-texto\)/.test(largo));
  for (const s of ['.pv-foto__leg', '.pv-citacao', '.pv-item__t', '.pv-item__x']) {
    const linha = semComentarios.split('\n').find(l => l.startsWith(s + ' {')) || '';
    assert.ok(/overflow-wrap:\s*anywhere/.test(linha), s + ' quebra palavra longa');
  }
});

/* ---- PR (c): ícones por item, ritmo (blocos iguais seguidos, no máximo 3 botões) e as pendências da revisão do PR (b) ---- */
import { ICONES } from '../../api/_vendas/direcao.mjs';
const NOMES = ICONES.filter(n => n !== 'nenhum');
const ico = raiz => comClasse(raiz, 'pv-icone');
const itensCom = icone => [{ titulo: 'Um', texto: 'Texto um.', ...(icone ? { icone } : {}) }, { titulo: 'Dois', texto: 'Texto dois.' }];

test('ícone: cada nome da lista fechada tem desenho próprio (svg com formas, aria-hidden, só classe, sem style nem filtro)', () => {
  for (const nome of NOMES) {
    const raiz = desenharCom(secao('servicos', 'cartoes', itensCom(nome)));
    const i = ico(raiz);
    assert.equal(i.length, 1, nome + ': um ícone no item que pediu');
    assert.equal(i[0].tag, 'svg');
    assert.equal(i[0].attrs['aria-hidden'], 'true');
    assert.equal(i[0].attrs.viewBox, '0 0 24 24');
    assert.ok(todos(i[0]).length > 1, nome + ' desenha formas');
    assert.ok(todos(i[0]).every(f => !f.attrs.style && !f.attrs.filter), nome + ' sem style nem filtro');
  }
});

test('ícone: nome fora da lista, "nenhum", objeto ou ausente não desenha nada; o ícone entra só em cartões e linhas', () => {
  for (const ruim of ['foguete', 'nenhum', '<svg>', { a: 1 }, 7, '']) assert.equal(ico(desenharCom(secao('servicos', 'cartoes', itensCom(ruim)))).length, 0, JSON.stringify(ruim));
  assert.equal(ico(desenharCom(secao('servicos', 'cartoes', itensCom()))).length, 0);
  assert.equal(ico(desenharCom(secao('diferenciais', 'lista', itensCom('raio')))).length, 1, 'linhas editoriais também');
  for (const [tipo, variante] of [['galeria', 'grade'], ['numeros', 'grade'], ['depoimentos', 'grade'], ['processo', 'lista'], ['servicos', 'linha_do_tempo']]) {
    assert.equal(ico(desenharCom(secao(tipo, variante, itensCom('raio')))).length, 0, tipo + ' não tem ícone');
  }
});

test('ícone: no cartão vem antes do título; nas linhas ocupa o lugar do índice numérico', () => {
  const c = comClasse(desenharCom(secao('servicos', 'cartoes', itensCom('bolo'))), 'pv-item')[0];
  assert.ok(c.filhos[0]._classe.split(' ').includes('pv-icone'), 'primeiro filho do cartão');
  const l = comClasse(desenharCom(secao('servicos', 'lista', itensCom('bolo'))), 'pv-linha');
  assert.ok(l[0].filhos[0]._classe.split(' ').includes('pv-icone'));
  assert.equal(comClasse(l[0], 'pv-linha__i').length, 0, 'com ícone, sem índice no mesmo item');
  assert.equal(comClasse(l[1], 'pv-linha__i').length, 1, 'o item sem ícone segue com o índice');
});

test('CSS do ícone: traço na cor de leitura do destaque, sem preenchimento; em faixa e fecho (modo sem cartão) na cor do texto do destaque', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const linha = css.split('\n').find(l => l.startsWith('.pv-icone {')) || '';
  assert.ok(/fill:\s*none/.test(linha) && /stroke:\s*var\(--pv-dest-leitura, var\(--pv-dest\)\)/.test(linha) && /stroke-linecap:\s*round/.test(linha), linha);
  assert.ok(!/filter|blur|shadow/.test(linha));
  assert.ok(/:is\(\.pv-v--faixa, \.pv-sec--fecho\) \.pv-itens:not\(\.pv-itens--cartoes\) \.pv-icone\s*\{[^}]*stroke:\s*var\(--pv-dest-texto\)/.test(css));
});

const lista3 = tipo => secao(tipo, 'cartoes', I3);
const modos = raiz => comClasse(raiz, 'pv-itens').map(u => u._classe.split(' ').find(c => c.startsWith('pv-itens--')));

test('ritmo: dois blocos de itens iguais em sequência não saem; o segundo muda de composição, e o terceiro volta ao primeiro', () => {
  assert.deepEqual(modos(desenharCom(lista3('servicos'), lista3('diferenciais'))), ['pv-itens--cartoes', 'pv-itens--linhas']);
  assert.deepEqual(modos(desenharCom(lista3('servicos'), lista3('diferenciais'), lista3('equipe'))), ['pv-itens--cartoes', 'pv-itens--linhas', 'pv-itens--cartoes']);
  assert.deepEqual(modos(desenharCom(secao('servicos', 'lista', I3), secao('diferenciais', 'lista', I3))), ['pv-itens--linhas', 'pv-itens--cartoes']);
  const trocada = desenharCom(lista3('servicos'), lista3('diferenciais'));
  assert.equal(comClasse(trocada, 'pv-v--lista').length, 0, 'a seção segue com a SUA variante (cabeçalho e layout largo); só os itens trocam de desenho');
  assert.equal(comClasse(trocada, 'pv-v--cartoes').length, 2);
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const largo = css.slice(css.indexOf('@container'));
  assert.ok(/\.pv-sec \.pv-itens\.pv-itens--linhas\s*\{[^}]*grid-template-columns:\s*1fr[^}]*max-width:\s*760px/.test(largo), 'linhas numa seção que não é de lista: 1 coluna de 760 px');
  assert.ok(/\.pv-v--centro \.pv-itens--linhas\s*\{[^}]*margin-inline:\s*auto/.test(largo), 'sob cabeçalho centralizado a lista centraliza');
  assert.ok(/\.pv-v--lista \.pv-itens\.pv-itens--cartoes\s*\{[^}]*repeat\(3, 1fr\)/.test(largo), 'cartões numa seção de lista: 3 colunas, não a coluna de 760 px');
  assert.ok(/\.pv-itens--numeros \.pv-num:last-child:nth-child\(odd\)\s*\{[^}]*grid-column:\s*1 \/ -1/.test(css), 'no celular o último número ímpar ocupa a linha');
  assert.ok(/\.pv-sec \.pv-itens--numeros \.pv-num:last-child:nth-child\(odd\)\s*\{[^}]*grid-column:\s*auto/.test(largo), 'e no desktop volta ao normal');
});

test('ritmo: cartões com cabeçalhos diferentes (centro, grade, split) são o mesmo bloco no celular: a troca conta só o MODO; a faixa de cor não se confunde nem troca', () => {
  assert.deepEqual(modos(desenharCom(secao('servicos', 'centro', I3), secao('diferenciais', 'grade', I3))), ['pv-itens--cartoes', 'pv-itens--linhas']);
  assert.deepEqual(modos(desenharCom(secao('servicos', 'split', I3), secao('diferenciais', 'centro', I3), secao('equipe', 'grade', I3))), ['pv-itens--cartoes', 'pv-itens--linhas', 'pv-itens--cartoes']);
  assert.deepEqual(modos(desenharCom(secao('servicos', 'cartoes', I3), secao('diferenciais', 'faixa', I3))), ['pv-itens--cartoes', 'pv-itens--cartoes'], 'a faixa é um bloco próprio');
  assert.deepEqual(modos(desenharCom(secao('servicos', 'faixa', I3), secao('diferenciais', 'faixa', I3))), ['pv-itens--cartoes', 'pv-itens--cartoes'], 'duas faixas seguidas não trocam');
  const split = desenharCom(secao('servicos', 'split', I3), secao('diferenciais', 'split', I3));
  assert.equal(comClasse(split, 'pv-v--split').length, 3, 'o topo (também split) e as duas seções: o split da segunda fica (2 colunas no layout largo)');
});

test('ritmo: seção sem lista no meio, composições diferentes e tipos de desenho próprio (galeria, números) não são trocados', () => {
  assert.deepEqual(modos(desenharCom(lista3('servicos'), secao('sobre', 'split', []), lista3('diferenciais'))), ['pv-itens--cartoes', 'pv-itens--cartoes']);
  assert.deepEqual(modos(desenharCom(lista3('servicos'), secao('diferenciais', 'lista', I3))), ['pv-itens--cartoes', 'pv-itens--linhas']);
  assert.deepEqual(modos(desenharCom(secao('galeria', 'grade', I3), secao('galeria', 'grade', I3))), ['pv-itens--galeria', 'pv-itens--galeria']);
  assert.deepEqual(modos(desenharCom(secao('processo', 'cartoes', I3), secao('diferenciais', 'linha_do_tempo', I3))), ['pv-itens--passos', 'pv-itens--passos'], 'passos não têm par');
});

const botoes = raiz => comClasse(raiz, 'pv-btn').filter(b => !b._classe.includes('pv-btn--nav'));
test('ritmo: no máximo 3 botões de seção na página: ficam o do topo, o do fecho e o primeiro dos demais', () => {
  const d = carregar().desenhar(direcao({ secoes: [
    { ...direcao().secoes[0], cta: 'Topo' }, secao('servicos', 'cartoes', I3, { cta: 'Serviços' }), secao('sobre', 'split', [], { cta: 'Sobre' }),
    secao('diferenciais', 'lista', I3, { cta: 'Dif' }), secao('cta', 'centro', [], { cta: 'Fecho' })] }));
  assert.deepEqual(botoes(d).map(b => b.textContent), ['Topo', 'Serviços', 'Fecho']);
  const poucas = carregar().desenhar(direcao({ secoes: [{ ...direcao().secoes[0], cta: 'Topo' }, secao('servicos', 'cartoes', I3, { cta: 'S' }), secao('contato', 'centro', [], { cta: 'C' })] }));
  assert.equal(botoes(poucas).length, 3, 'até 3 passam todos');
  const semTopo = carregar().desenhar(direcao({ secoes: [{ ...direcao().secoes[0], cta: '' }, secao('servicos', 'cartoes', I3, { cta: 'A' }), secao('sobre', 'split', [], { cta: 'B' }), secao('diferenciais', 'lista', I3, { cta: 'C' }), secao('contato', 'centro', [], { cta: 'F' })] }));
  assert.deepEqual(botoes(semTopo).map(b => b.textContent), ['A', 'B', 'F'], 'sem botão no topo, o fecho e os dois primeiros');
  assert.equal(comClasse(d, 'pv-btn--nav').length, 1, 'o botão da barra não conta nem some');
  const semFecho = carregar().desenhar(direcao({ secoes: [{ ...direcao().secoes[0], cta: 'Topo' }, secao('servicos', 'cartoes', I3, { cta: 'A' }), secao('sobre', 'split', [], { cta: 'B' }), secao('diferenciais', 'lista', I3, { cta: 'C' }), secao('contato', 'centro', [], { cta: '' })] }));
  assert.deepEqual(botoes(semFecho).map(b => b.textContent), ['Topo', 'A', 'C'], 'sem botão no cta/contato, fica o ÚLTIMO botão da página: a página não termina sem chamada');
});

test('ícone em FAQ e equipe (cartões) desenha sem quebrar; em linhas dentro de faixa o ícone vem no lugar do índice', () => {
  for (const tipo of ['faq', 'equipe']) assert.equal(ico(desenharCom(secao(tipo, 'cartoes', itensCom('check')))).length, 1, tipo);
  const faixa = desenharCom(secao('diferenciais', 'faixa', itensCom('check')));
  assert.equal(ico(faixa).length, 1);
});

test('números: a lista leva a contagem (pv-n3 a pv-n8) para o CSS escolher as colunas sem deixar item solto', () => {
  const classes = k => comClasse(desenharCom(secao('numeros', 'grade', Array.from({ length: k }, (_, i) => ({ titulo: String(i + 1), texto: 'x' })))), 'pv-itens')[0]._classe.split(' ');
  for (const k of [3, 6, 8]) assert.ok(classes(k).includes('pv-n' + k), 'pv-n' + k);
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const largo = css.slice(css.indexOf('@container'));
  const regra = n => largo.split('\n').find(l => l.includes('.pv-itens--numeros.pv-n' + n)) || '';
  for (const k of [5, 6]) assert.ok(/repeat\(3, 1fr\)/.test(regra(k)), k + ' números em 3 colunas');
  for (const k of [7, 8]) assert.ok(/repeat\(4, 1fr\)/.test(regra(k)), k + ' números em 4 colunas');
});

test('cor de leitura FINA: o índice "01" (15 px) pede 4,5:1; o destaque entre 3:1 e 4,5:1 serve ao número grande mas não ao índice', () => {
  const cinza = { identidade: { ...direcao().identidade, paleta: { ...direcao().identidade.paleta, destaque: '#8A8A8A', fundo: '#FFFFFF', superficie: '#FFFFFF' } } };
  const r = carregar().desenhar(direcao(cinza));
  assert.equal(r.estilo['--pv-dest-leitura'], undefined, '3,45:1 ainda serve ao número grande');
  assert.equal(r.estilo['--pv-dest-leitura-fina'], '#3A2420', 'mas o índice pequeno cai para o texto');
  const escuro = { identidade: { ...direcao().identidade, paleta: { ...direcao().identidade.paleta, destaque: '#7A1F3D' } } };
  const bom = carregar().desenhar(direcao(escuro));
  assert.equal(bom.estilo['--pv-dest-leitura-fina'], undefined, 'destaque com 4,5:1 ou mais fica como está');
  assert.equal(bom.estilo['--pv-dest-leitura'], undefined);
  assert.ok(/\.pv-linha__i\s*\{[^}]*color:\s*var\(--pv-dest-leitura-fina, var\(--pv-dest-leitura, var\(--pv-dest\)\)\)/.test(CSS));
});

test('cor de leitura: paleta sem fundo/superfície confere contra os padrões do CSS (#FFFFFF, #F4F4F4), não passa em branco', () => {
  const amarelo = { identidade: { ...direcao().identidade, paleta: { texto: '#3A2420', destaque: '#FFE66D', destaque_texto: '#000000' } } };
  const r = carregar().desenhar(direcao(amarelo));
  assert.equal(r.estilo['--pv-dest-leitura'], '#3A2420');
});

test('régua do topo com itens: o ul do topo usa margem (a régua vai de borda a borda do conteúdo), e o container largo zera', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\.pv-sec--hero \.pv-itens\s*\{[^}]*margin:\s*0 20px[^}]*\}/.test(css) && !/\.pv-sec--hero \.pv-itens\s*\{[^}]*padding:\s*0 20px/.test(css));
  assert.ok(/@container[\s\S]*\.pv-sec--hero \.pv-itens\s*\{[^}]*margin:\s*0/.test(css));
});
