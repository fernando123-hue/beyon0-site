/* Achado 1 de 00 Entrada/lapidar-zero-2026-11-25/achados-modelos.md: os três modelos de um cliente saíam com o mesmo esqueleto
   e só outra cor (Fraunces nos títulos em 6 de 9, DM Sans no texto em 9 de 9, os três claros). Regra permanente do dono (20/11):
   nunca padronizar. O código fixa um TRILHO por estratégia: títulos em fontes diferentes, um só escuro, destaque em famílias
   de cor diferentes; gira pelo nome e o segmento do negócio, para dois clientes também não saírem iguais. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trilhoDaDirecao, TEMPERATURAS, ESTRATEGIAS, FONTES, higienizar } from '../../api/_vendas/direcao.mjs';
import { gerarDirecao, SISTEMA_GERACAO } from '../../api/_vendas/gerador.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';

const briefing = (nome, segmento = 'confeitaria') => ({ negocio: { nome, segmento, descricao: 'Bolos por encomenda.', servicos: ['Bolos'] } });
const tres = b => Object.keys(ESTRATEGIAS).map(e => trilhoDaDirecao(b, e));
const NOMES = ['Doce Ateliê da Ana', 'Marcenaria Veio', 'Clínica Sorriso', 'Oficina do Zé', 'Pet Amigo', 'Studio Corte', 'Academia Forte', 'Sabor da Casa'];

test('trilho: as três estratégias de um cliente têm títulos em fontes diferentes, um só modelo escuro e destaques de famílias diferentes', () => {
  for (const nome of NOMES) {
    const t = tres(briefing(nome));
    assert.equal(new Set(t.map(x => x.tipografia.titulos)).size, 3, nome + ': fontes dos títulos');
    assert.equal(t.filter(x => x.tema === 'escuro').length, 1, nome + ': um escuro só');
    assert.equal(new Set(t.map(x => x.temperatura)).size, 3, nome + ': famílias de cor');
    for (const x of t) {
      assert.ok(FONTES.includes(x.tipografia.titulos) && FONTES.includes(x.tipografia.texto));
      assert.notEqual(x.tipografia.titulos, x.tipografia.texto, 'título e texto contrastam');
      assert.ok(Object.hasOwn(TEMPERATURAS, x.temperatura));
    }
  }
});

test('trilho: o mesmo briefing dá sempre o mesmo trilho; clientes diferentes não caem todos no mesmo', () => {
  assert.deepEqual(tres(briefing('Doce Ateliê da Ana')), tres(briefing('Doce Ateliê da Ana')));
  const assinaturas = new Set(NOMES.map(n => JSON.stringify(tres(briefing(n)))));
  assert.ok(assinaturas.size >= 4, 'só ' + assinaturas.size + ' combinações em ' + NOMES.length + ' clientes');
  const escuroEm = new Set(NOMES.map(n => tres(briefing(n)).findIndex(x => x.tema === 'escuro')));
  assert.ok(escuroEm.size >= 2, 'o escuro não fica sempre na mesma estratégia');
});

test('trilho: briefing vazio ou estranho não quebra (gera o trilho padrão), estratégia desconhecida devolve null', () => {
  for (const b of [null, undefined, {}, { negocio: 7 }, { negocio: { nome: { x: 1 } } }]) assert.ok(trilhoDaDirecao(b, 'conversao').tipografia);
  assert.equal(trilhoDaDirecao(briefing('X'), 'outra'), null);
});

test('higienizar com trilho: as fontes são as do trilho (o código fixa, como o topo); sem trilho, as do modelo', () => {
  const bruta = { identidade: { tipografia: { titulos: 'serif_moderna', texto: 'sans_humanista' } }, navegacao: { marca: 'M' },
    secoes: [{ tipo: 'hero', titulo: 'a' }, { tipo: 'sobre', titulo: 'b' }, { tipo: 'cta', titulo: 'c' }] };
  const trilho = { tipografia: { titulos: 'serif_classica', texto: 'sans_geometrica' }, tema: 'claro', temperatura: 'fria' };
  assert.deepEqual(higienizar(bruta, 'conversao', { trilho }).direcao.identidade.tipografia, trilho.tipografia);
  assert.deepEqual(higienizar(bruta, 'conversao').direcao.identidade.tipografia, { titulos: 'serif_moderna', texto: 'sans_humanista' });
  assert.deepEqual(higienizar(bruta, 'conversao', { trilho: { tipografia: { titulos: '<x>', texto: 'nada' } } }).direcao.identidade.tipografia,
    { titulos: 'serif_moderna', texto: 'sans_humanista' }, 'trilho inválido não vale');
});

test('geração: o pedido traz o trilho desta estratégia (tema e família de cor) e a direção sai com as fontes dele; a instrução de sistema não muda entre as três (cache)', async () => {
  const pedidos = [];
  const base = criarSimulada();
  const ia = { mensagem: p => { pedidos.push(p); return base.mensagem(p); } };
  const b = briefing('Doce Ateliê da Ana');
  const ds = [];
  for (const [i, e] of Object.keys(ESTRATEGIAS).entries()) ds.push((await gerarDirecao({ ia, briefing: b, estrategia: e, numero: i + 1, fatores: { formato: 'landing_page' } })).direcao);
  for (const [i, e] of Object.keys(ESTRATEGIAS).entries()) {
    const t = trilhoDaDirecao(b, e);
    const texto = pedidos[i].mensagens[0].content;
    assert.match(texto, /IDENTIDADE FIXADA/);
    assert.ok(texto.includes('tema ' + t.tema), 'tema no pedido');
    assert.ok(texto.includes(TEMPERATURAS[t.temperatura]), 'família de cor no pedido');
    assert.ok(texto.lastIndexOf('IDENTIDADE FIXADA') > texto.indexOf('</briefing>'), 'o trilho vem do código, fora do briefing');
    assert.deepEqual(ds[i].identidade.tipografia, t.tipografia);
  }
  assert.equal(new Set(pedidos.map(p => p.sistema)).size, 1, 'mesmo sistema nas três');
  assert.match(SISTEMA_GERACAO, /identidade fixada/i);
});

test('fila manual: o pedido.json leva a identidade fixada de cada direção, com a tipografia (lá quem escreve a fonte é a sessão)', async () => {
  const { pedidoParaModelo } = await import('../../scripts/direcoes.mjs');
  const b = briefing('Doce Ateliê da Ana');
  const p = pedidoParaModelo({ conversa_id: '11111111-2222-4333-8444-555555555555', briefing: b, fatores: {},
    direcoes: Object.keys(ESTRATEGIAS).map((e, i) => ({ id: 'd' + i, numero: i + 1, estrategia: e, status: 'na_fila' })) });
  for (const d of p.direcoes) {
    const t = trilhoDaDirecao(b, d.estrategia, '11111111-2222-4333-8444-555555555555');
    assert.deepEqual(d.identidade_fixada, { tema: t.tema, cor_de_destaque: TEMPERATURAS[t.temperatura], tipografia: t.tipografia, molde_x_nao_y: t.contraste ? 'no máximo um título' : 'nenhum título' });
  }
});

test('trilho, propriedade: em 2.000 sementes as garantias valem sempre e cada estratégia pega cada fonte, cor e o escuro', () => {
  const conta = {};
  for (let k = 0; k < 2000; k++) {
    const t = Object.keys(ESTRATEGIAS).map(e => trilhoDaDirecao(null, e, 'pedido-' + k));
    assert.equal(new Set(t.map(x => x.tipografia.titulos)).size, 3, 'semente ' + k);
    assert.equal(t.filter(x => x.tema === 'escuro').length, 1, 'semente ' + k);
    assert.equal(new Set(t.map(x => x.temperatura)).size, 3, 'semente ' + k);
    t.forEach((x, i) => { for (const c of [x.tipografia.titulos, x.temperatura, x.tema]) conta[i + c] = (conta[i + c] || 0) + 1; });
  }
  for (const [chave, n] of Object.entries(conta)) if (!chave.endsWith('claro')) assert.ok(n > 500, chave + ' só ' + n + ' em 2000');
});

test('trilho: a semente (id do pedido) vence o texto do briefing; briefing só com segmento também gera trilho válido', () => {
  const s = '11111111-2222-4333-8444-555555555555';
  for (const e of Object.keys(ESTRATEGIAS)) assert.deepEqual(trilhoDaDirecao(briefing('Nome antigo'), e, s), trilhoDaDirecao(briefing('Nome novo', 'outro ramo'), e, s), 'o briefing mudou entre as chamadas e o trilho não');
  const t = Object.keys(ESTRATEGIAS).map(e => trilhoDaDirecao({ negocio: { segmento: 'barbearia' } }, e));
  assert.equal(new Set(t.map(x => x.tipografia.titulos)).size, 3);
});

test('higienizar: o tema não é forçado, mas o desvio do trilho fica anotado em ajustes', () => {
  const bruta = { identidade: { estilo: { tema: 'claro' } }, navegacao: { marca: 'M' }, secoes: [{ tipo: 'hero', titulo: 'a' }, { tipo: 'sobre', titulo: 'b' }, { tipo: 'cta', titulo: 'c' }] };
  const tip = { titulos: 'serif_classica', texto: 'sans_geometrica' };
  const fora = higienizar(bruta, 'conversao', { trilho: { tipografia: tip, tema: 'escuro' } });
  assert.equal(fora.direcao.identidade.estilo.tema, 'claro');
  assert.ok(fora.ajustes.includes('tema_fora_do_trilho'));
  assert.ok(!higienizar(bruta, 'conversao', { trilho: { tipografia: tip, tema: 'claro' } }).ajustes.includes('tema_fora_do_trilho'));
});

test('reserva sem IA: com o trilho, as fontes são as dele (o degrau que cai não repete a fonte de título de outro modelo)', async () => {
  const { direcaoDeReserva } = await import('../../api/_vendas/reserva.mjs');
  const b = briefing('Doce Ateliê da Ana');
  for (const e of Object.keys(ESTRATEGIAS)) {
    const trilho = trilhoDaDirecao(b, e, 'pedido-x');
    assert.deepEqual(direcaoDeReserva({ briefing: b, estrategia: e, trilho }).direcao.identidade.tipografia, trilho.tipografia);
  }
  assert.ok(direcaoDeReserva({ briefing: b, estrategia: 'conversao' }).direcao, 'sem trilho continua como antes');
});
