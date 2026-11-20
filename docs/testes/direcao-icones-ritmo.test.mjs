/* PR (c) da qualidade visual dos modelos: o ícone de cada item (lista fechada, retrocompatível), o número só do briefing,
   o topo por estratégia e as regras de ritmo no prompt. O que o servidor garante aqui o renderer (js/previa.js) só desenha. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESQUEMA_DIRECAO, ICONES, TOPO_DA_ESTRATEGIA, higienizar } from '../../api/_vendas/direcao.mjs';
import { gerarDirecao, SISTEMA_GERACAO } from '../../api/_vendas/gerador.mjs';

const sec = (tipo, extra = {}) => ({ tipo, variante: 'cartoes', rotulo: 'R', titulo: 'Título ' + tipo, subtitulo: '', texto: '', itens: [], cta: '', ...extra });
const base = (secoes, extra = {}) => ({
  nome_conceito: 'Conceito', resumo: 'Resumo.',
  identidade: { paleta: { fundo: '#FFFFFF', superficie: '#F4F4F4', texto: '#111111', texto_suave: '#555555', destaque: '#B5476B', destaque_texto: '#FFFFFF' }, tipografia: { titulos: 'serif_moderna', texto: 'sans_humanista' }, estilo: { cantos: 'suaves', densidade: 'equilibrada', tema: 'claro' } },
  navegacao: { marca: 'Marca', itens: ['A'], cta: 'Falar' },
  secoes, rodape: { texto: 'Rodapé' }, ...extra
});
const tres = [sec('hero', { variante: 'split' }), sec('servicos', { itens: [{ titulo: 'Bolos', texto: 'Para festa.' }] }), sec('contato', { variante: 'centro' })];
const NUMEROS = [{ titulo: '100%', texto: 'Projetos aprovados' }, { titulo: '10 anos', texto: 'De oficina' }, { titulo: '+300', texto: 'Clientes' }, { titulo: '3D', texto: 'Antes do corte' }];

test('ícone: lista fechada, com "nenhum"; o esquema obriga o modelo a escolher dentre ela', () => {
  assert.ok(Array.isArray(ICONES) && ICONES.length >= 16 && ICONES.includes('nenhum'));
  assert.equal(new Set(ICONES).size, ICONES.length, 'sem repetido');
  assert.ok(ICONES.every(n => /^[a-z]+$/.test(n)), 'só nomes simples: o nome vira classe e chave de desenho');
  const item = ESQUEMA_DIRECAO.properties.secoes.items.properties.itens.items;
  assert.deepEqual(item.properties.icone.enum, ICONES);
  assert.ok(item.required.includes('icone'));
  assert.equal(item.additionalProperties, false);
});

test('higienizar: o ícone válido fica; o fora da lista, o HTML e o "nenhum" saem; direção antiga (sem ícone) não ganha chave nova', () => {
  const itens = [{ titulo: 'a', texto: 'b', icone: 'raio' }, { titulo: 'c', texto: 'd', icone: 'foguete' }, { titulo: 'e', texto: 'f', icone: '<svg onload=1>' }, { titulo: 'g', texto: 'h', icone: 'nenhum' }, { titulo: 'i', texto: 'j' }, { titulo: 'k', texto: 'l', icone: { x: 1 } }];
  const { direcao } = higienizar(base([tres[0], sec('servicos', { itens }), tres[2]]), 'conversao');
  const it = direcao.secoes[1].itens;
  assert.equal(it[0].icone, 'raio');
  for (const i of it.slice(1)) assert.ok(!Object.hasOwn(i, 'icone'), 'sem chave: ' + JSON.stringify(i));
  assert.deepEqual(it[4], { titulo: 'i', texto: 'j' }, 'o modelo gravado antes do ícone sai igual');
  assert.ok(!/[<>]/.test(JSON.stringify(direcao)));
});

test('higienizar: com o briefing, número de "numeros" que não veio dele vira espaço reservado; o que veio fica; sem o briefing nada muda', () => {
  const bruta = base([tres[0], sec('numeros', { itens: NUMEROS }), tres[2]]);
  const briefing = { negocio: { nome: 'Marcenaria', descricao: 'Há 10 anos fazendo móveis em 3D.' }, telefone_do_cliente: '11999991000' };
  const it = higienizar(bruta, 'autoridade', { briefing }).direcao.secoes[1].itens;
  assert.equal(it[0].titulo, '[Número a confirmar]', '"100%" não veio do briefing');
  assert.equal(it[0].texto, 'Projetos aprovados', 'o rótulo do número fica');
  assert.equal(it[1].titulo, '10 anos', 'veio do briefing');
  assert.equal(it[2].titulo, '[Número a confirmar]', '"+300" não veio');
  assert.equal(it[3].titulo, '3D', '"3" veio do briefing');
  const semBriefing = higienizar(bruta, 'autoridade').direcao.secoes[1].itens;
  assert.deepEqual(semBriefing.map(i => i.titulo), ['100%', '10 anos', '+300', '3D'], 'ajuste do cliente e fila manual não passam por esta conferência');
  const so = higienizar(base([tres[0], sec('servicos', { itens: [{ titulo: '24 horas', texto: 'x' }] }), tres[2]]), 'autoridade', { briefing }).direcao.secoes[1].itens;
  assert.equal(so[0].titulo, '24 horas', 'a regra é só da seção de números');
});

test('número: dígitos soltos em outro número do briefing (telefone) não contam como o número do cliente; o espaço reservado que o modelo já escreveu fica', () => {
  const bruta = base([tres[0], sec('numeros', { itens: [{ titulo: '1000', texto: 'a' }, { titulo: '[Anos de oficina]', texto: 'b' }, { titulo: 'Sem número', texto: 'c' }] }), tres[2]]);
  const it = higienizar(bruta, 'autoridade', { briefing: { contato: '11999991000' } }).direcao.secoes[1].itens;
  assert.equal(it[0].titulo, '[Número a confirmar]');
  assert.equal(it[1].titulo, '[Anos de oficina]');
  assert.equal(it[2].titulo, 'Sem número');
});

test('topo por estratégia: conversão em split, autoridade em centro, experiência em faixa (o modelo não escolhe; os 3 topos nunca se repetem)', () => {
  assert.deepEqual(TOPO_DA_ESTRATEGIA, { conversao: 'split', autoridade: 'centro', experiencia: 'faixa' });
  for (const [e, v] of Object.entries(TOPO_DA_ESTRATEGIA)) {
    for (const errada of ['lista', 'grade', v]) {
      const h = higienizar(base([{ ...tres[0], variante: errada }, tres[1], tres[2]]), e).direcao;
      assert.equal(h.secoes[0].variante, v, e + ' com topo ' + errada);
    }
  }
  const semTopo = higienizar(base([tres[1], tres[2], sec('sobre', { titulo: 'Sobre' })]), 'experiencia').direcao;
  assert.equal(semTopo.secoes[0].tipo, 'hero');
  assert.equal(semTopo.secoes[0].variante, 'faixa', 'o topo que o código acrescenta também segue a estratégia');
});

test('o gerador entrega o briefing ao higienizar: o "100%" inventado pela IA sai da direção', async () => {
  const json = base([tres[0], sec('numeros', { itens: NUMEROS }), tres[2]]);
  const ia = { mensagem: async () => ({ json, custo_usd: 0, modelo: 'simulado', parada: 'fim' }) };
  const r = await gerarDirecao({ ia, briefing: { negocio: { nome: 'Marcenaria', descricao: 'Há 10 anos com projeto 3D.' } }, estrategia: 'autoridade', numero: 2, fatores: { formato: 'institucional' } });
  assert.deepEqual(r.direcao.secoes[1].itens.map(i => i.titulo), ['[Número a confirmar]', '10 anos', '[Número a confirmar]', '3D']);
});

test('o prompt ensina o ícone (a lista inteira), o número só do briefing e o ritmo (botões, blocos iguais seguidos)', () => {
  for (const nome of ICONES) assert.ok(SISTEMA_GERACAO.includes(nome), 'o prompt cita o ícone ' + nome);
  assert.match(SISTEMA_GERACAO, /icone/);
  assert.match(SISTEMA_GERACAO, /no máximo 3 botões/i);
  assert.match(SISTEMA_GERACAO, /dois blocos (iguais|parecidos) (em sequência|seguidos)/i);
  assert.match(SISTEMA_GERACAO, /números? .*briefing/i);
});
