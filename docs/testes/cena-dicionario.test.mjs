import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../../js/cena-dicionario.js');
const F = require('../../js/orcamento-cena-forma.js');
const RAMOS = ['servicos', 'saude', 'beleza', 'alimentacao', 'comercio', 'educacao', 'associacao', 'outro'];

test('aceite 3: os 8 ramos têm um lugar válido; ramo fora da lista, sem palavra, nada', () => {
  for (const r of RAMOS) assert.ok(F.LUGARES.includes(D.lugarDoCaso(r, '')), r);
  for (const r of ['banco', '__proto__', 'constructor', null, 42]) assert.equal(D.lugarDoCaso(r, ''), null, String(r));
});

test('sublugar por palavra, só se combina com o ramo; negado não vale', () => {
  assert.equal(D.lugarDoCaso('beleza', 'Tenho uma barbearia no centro'), 'salao');
  assert.equal(D.lugarDoCaso('servicos', 'Faço reformas e obras pequenas'), 'obra');
  assert.equal(D.lugarDoCaso('servicos', 'Oficina mecânica do bairro'), 'oficina');
  assert.equal(D.lugarDoCaso('saude', 'Estúdio de pilates'), 'estudio');
  assert.equal(D.lugarDoCaso('saude', 'Tenho uma oficina'), 'consultorio', 'oficina não combina com saúde: fica o padrão');
  assert.equal(D.lugarDoCaso('servicos', 'Não é obra, é consultoria'), 'escritorio');
  assert.equal(D.lugarDoCaso('outro', 'uma confeitaria'), 'cozinha', 'com "outro", a palavra decide');
});

test('aceite 2: equipe só quando ela diz; negação apaga; por extenso; fora do padrão, nada', () => {
  const casos = [
    ['Somos 4 aqui', 4], ['somos quatro', 4], ['Só eu', 1], ['trabalho sozinha', 1], ['Eu e minha sócia', 2], ['eu e meu marido cuidamos de tudo', 2],
    ['equipe de 12', 12], ['temos 3 funcionários', 3], ['uns 10 colaboradores', 10], ['trabalham 5 pessoas aqui', 5], ['7 pessoas na equipe', 7],
    ['Não somos 4', null], ['nao temos 3 funcionarios', null], ['atendo 20 pessoas por dia', null], ['buffet para 100 pessoas', null],
    ['tenho 3 lojas', null], ['', null], [null, null], ['somos 0', null], ['somos 1000', null]
  ];
  for (const [t, n] of casos) assert.equal(D.equipeDoTexto(t), n, String(t));
  assert.equal(D.equipeDoTexto('não sei, mas somos 4'), 4, 'a vírgula fecha a oração da negação');
  assert.equal(D.equipeDoTexto('somos 3 sócios e temos 8 funcionários'), 3, 'a mais à esquerda vale');
});

test('oferta: a 1ª palavra do texto; senão o objetivo; senão nada', () => {
  assert.equal(D.ofertaDoCaso('Vendo marmitas e faço entregas', []), 'cardapio');
  assert.equal(D.ofertaDoCaso('Faço entregas de marmitas', []), 'entrega');
  assert.equal(D.ofertaDoCaso('Não tenho cardápio, só encomendas de bolo', []), 'encomenda');
  assert.equal(D.ofertaDoCaso('', ['agendamentos']), 'agenda');
  assert.equal(D.ofertaDoCaso('', ['vender_online']), 'loja_online');
  assert.equal(D.ofertaDoCaso('', ['apresentar']), null);
});

test('aceite 4: nicho regulado nunca recebe depoimentos; fora dele, o destaque vem do texto ou do objetivo', () => {
  assert.equal(D.destaqueDoCaso('quero mostrar depoimentos dos pacientes', [], true), null);
  assert.equal(D.destaqueDoCaso('quero mostrar depoimentos dos pacientes', ['achado_google'], true), 'localizacao');
  assert.equal(D.destaqueDoCaso('quero mostrar as avaliações dos clientes', [], false), 'depoimentos');
  assert.equal(D.destaqueDoCaso('', ['achado_google', 'apresentar'], false), 'localizacao');
  assert.equal(D.destaqueDoCaso('', ['apresentar'], false), 'fotos');
  assert.equal(D.destaqueDoCaso('sem depoimentos, por favor', [], false), null);
  for (const r of RAMOS) for (const t of ['depoimentos', 'avaliações e depoimentos']) {
    const c = D.cenaDoCaso({ ramo: r, texto: t, canais: [], objetivos: [], regulado: true });
    assert.notEqual(c && c.destaque, 'depoimentos', r);
  }
});

test('cenaDoCaso: a cena válida, congelada, determinística; gente até 6; canais filtrados', () => {
  const caso = { ramo: 'alimentacao', texto: 'Somos 9 na cozinha, vendemos marmitas', canais: ['instagram', 'orkut', 'whatsapp', 'instagram', 'tiktok', 'indicacao'], objetivos: ['apresentar'], regulado: false };
  const c = D.cenaDoCaso(caso);
  assert.deepEqual(JSON.parse(JSON.stringify(c)), { lugar: 'cozinha', gente: 6, canais: ['instagram', 'whatsapp', 'tiktok'], oferta: 'cardapio', destaque: 'fotos' });
  assert.ok(Object.isFrozen(c));
  assert.deepEqual(D.cenaDoCaso(caso), c, 'mesma entrada, mesma cena');
  assert.equal(D.cenaDoCaso({ ...caso, texto: '' }).gente, 0);
  assert.equal(D.cenaDoCaso({ ...caso, ramo: 'banco', texto: '' }), null);
  for (const v of [null, undefined, 'x', 42, []]) assert.equal(D.cenaDoCaso(v), null);
});

test('aceite 5: casos diferentes da mesma área dão cenas diferentes (nenhuma idêntica entre respostas diferentes)', () => {
  const casos = [
    { ramo: 'alimentacao', texto: 'Somos 4, vendemos marmitas', canais: ['instagram'], objetivos: [] },
    { ramo: 'alimentacao', texto: 'Só eu, faço bolos sob encomenda', canais: ['whatsapp'], objetivos: [] },
    { ramo: 'alimentacao', texto: 'Restaurante com reservas, equipe de 12', canais: ['google_mapa'], objetivos: ['achado_google'] },
    { ramo: 'alimentacao', texto: 'Padaria, entregas no bairro', canais: ['indicacao', 'whatsapp'], objetivos: ['apresentar'] },
    { ramo: 'saude', texto: 'Clínica odontológica, somos 3 dentistas', canais: ['instagram'], objetivos: ['agendamentos'] },
    { ramo: 'saude', texto: 'Estúdio de pilates, só eu', canais: ['indicacao'], objetivos: ['agendamentos'] },
    { ramo: 'saude', texto: 'Psicóloga, atendimento online', canais: ['google_busca'], objetivos: ['achado_google'] },
    { ramo: 'beleza', texto: 'Barbearia, somos 2', canais: ['instagram', 'passa_na_frente'], objetivos: ['agendamentos'] },
    { ramo: 'beleza', texto: 'Salão com 6 cabeleireiras', canais: ['whatsapp'], objetivos: ['apresentar'] },
    { ramo: 'servicos', texto: 'Faço reformas, equipe de 5, orçamento grátis', canais: ['indicacao'], objetivos: [] },
    { ramo: 'servicos', texto: 'Oficina mecânica, 3 funcionários', canais: ['google_mapa'], objetivos: ['achado_google'] },
    { ramo: 'servicos', texto: 'Escritório de contabilidade', canais: ['indicacao'], objetivos: ['apresentar'] },
    { ramo: 'comercio', texto: 'Loja de roupas, vitrine no centro', canais: ['instagram', 'passa_na_frente'], objetivos: [] },
    { ramo: 'comercio', texto: 'Quero vender online meus produtos', canais: ['instagram'], objetivos: ['vender_online'] },
    { ramo: 'educacao', texto: 'Curso de inglês, turmas pequenas', canais: ['facebook'], objetivos: [] },
    { ramo: 'educacao', texto: 'Aulas particulares, só eu', canais: ['indicacao'], objetivos: ['agendamentos'] },
    { ramo: 'associacao', texto: 'Associação de moradores', canais: ['whatsapp'], objetivos: ['apresentar'] },
    { ramo: 'outro', texto: 'Estúdio de tatuagem, somos 2', canais: ['instagram'], objetivos: ['agendamentos'] }
  ];
  const assinaturas = casos.map(c => JSON.stringify(D.cenaDoCaso({ ...c, regulado: false })));
  assert.ok(assinaturas.every(a => a !== 'null'), 'todos desenham');
  assert.equal(new Set(assinaturas).size, casos.length, 'nenhuma cena idêntica');
});

test('nunca lança; nenhum texto da pessoa sai (só códigos e números)', () => {
  const hostil = '<img src=x onerror=alert(1)> somos 4 '.repeat(200);
  const c = D.cenaDoCaso({ ramo: 'outro', texto: hostil, canais: ['<b>'], objetivos: ['__proto__'], regulado: false });
  assert.ok(!/[<>]|img|alert/.test(JSON.stringify(c)));
  for (const f of ['lugarDoCaso', 'ofertaDoCaso', 'destaqueDoCaso', 'equipeDoTexto', 'cenaDoCaso']) {
    assert.doesNotThrow(() => D[f]({ toString() { throw new Error('x'); } }, { length: 1 }), f);
  }
});

test('o caminho do navegador: os três scripts juntos, na ordem, sem require, dão a mesma cena', () => {
  const ctx = { window: {} };
  ctx.window.window = ctx.window;
  for (const f of ['oracao.js', 'orcamento-cena-forma.js', 'cena-dicionario.js']) vm.runInNewContext(fs.readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8'), ctx);
  const caso = { ramo: 'beleza', texto: 'Barbearia, somos 2', canais: ['instagram'], objetivos: [], regulado: false };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.BZCenaDicionario.cenaDoCaso(caso))), JSON.parse(JSON.stringify(D.cenaDoCaso(caso))));
});

test('fontes ES5 sem DOM; nenhuma página carrega os módulos novos ainda (PR 2 liga)', () => {
  for (const f of ['oracao.js', 'cena-dicionario.js']) {
    const fonte = fs.readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8');
    assert.ok(!/\blet\b|\bconst\b|=>|`|innerHTML|document\./.test(fonte), f);
  }
  for (const p of fs.readdirSync(new URL('../../', import.meta.url)).filter(n => n.endsWith('.html'))) {
    assert.ok(!/cena-dicionario|orcamento-cena-forma|oracao\.js/.test(fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8')), p);
  }
});
