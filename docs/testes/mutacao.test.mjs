/* O próprio teste de mutação (docs/testes/mutacao.mjs), que sabota um arquivo de código NO LUGAR (a sabotagem com
   "fonte"). Revisão final do PR 2a, B7: a restauração vale também quando o terminal fecha (SIGHUP) e no Ctrl+Break do
   Windows (SIGBREAK); e, na partida, ele RECUSA rodar se um arquivo "fonte" já está sabotado (sobra de uma rodada que
   morreu sem restaurar) ou tem mudança fora do git: a cópia de segurança guardaria a sabotagem como se fosse o original.
   Aqui só a conferência da partida, num diretório temporário: nada no repositório é tocado.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SINAIS_DE_SAIDA, problemasNaPartida, SABOTAGENS, escolherSabotagens, lerFatia, daFatia, rodar, alvosVencidos } from './mutacao.mjs';

const comFonte = SABOTAGENS.filter(s => s.fonte);

test('mutação: a restauração do arquivo sabotado vale também no SIGHUP e no SIGBREAK', () => {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) assert.ok(SINAIS_DE_SAIDA.includes(s), s);
});

test('mutação: o filtro (BZ_MUTACAO_FILTRO) escolhe pelo nome; sem filtro, todas; filtro que não casa nenhuma é ERRO ("0 de 0" não é sucesso)', () => {
  assert.equal(escolherSabotagens(SABOTAGENS, '').sabotagens.length, SABOTAGENS.length);
  const um = escolherSabotagens(SABOTAGENS, SABOTAGENS[0].nome.slice(0, 12).toUpperCase());
  assert.ok(um.sabotagens.length >= 1 && um.sabotagens.every(s => s.nome.toLowerCase().includes(SABOTAGENS[0].nome.slice(0, 12).toLowerCase())));
  assert.equal(um.erro, null);
  const nenhuma = escolherSabotagens(SABOTAGENS, 'nome-que-nao-existe');
  assert.deepEqual(nenhuma.sabotagens, []);
  assert.match(nenhuma.erro, /nenhuma sabotagem/);
});

test('mutação: na partida, recusa rodar com um arquivo "fonte" já sabotado ou com mudança fora do git', () => {
  assert.ok(comFonte.length >= 1, 'há sabotagem de código (o teste tem o que provar)');
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'bz-partida-'));
  try {
    for (const s of comFonte) {
      fs.mkdirSync(path.dirname(path.join(raiz, s.fonte)), { recursive: true });
      fs.writeFileSync(path.join(raiz, s.fonte), 'antes\r\n' + s.de + '\r\ndepois\r\n');
    }
    const limpo = () => true;
    assert.deepEqual(problemasNaPartida(comFonte, raiz, limpo), [], 'arquivos originais e limpos: roda');
    const s = comFonte[0];
    fs.writeFileSync(path.join(raiz, s.fonte), 'antes\n' + s.para + '\ndepois\n');
    const sabotado = problemasNaPartida(comFonte, raiz, limpo);
    assert.equal(sabotado.length, 1);
    assert.match(sabotado[0], /já está sabotado/);
    assert.ok(sabotado[0].includes(s.fonte));
    fs.writeFileSync(path.join(raiz, s.fonte), 'antes\n' + s.de + '\ndepois\n');
    /* (um arquivo pode ter mais de uma sabotagem: o mesmo aviso sai uma vez por sabotagem, e conta como um) */
    const sujo = [...new Set(problemasNaPartida(comFonte, raiz, arquivo => arquivo !== s.fonte))];
    assert.equal(sujo.length, 1);
    assert.match(sujo[0], /mudança fora do git/);
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});

/* ---- a mutação em fatias (CI em paralelo): MUTACAO_FATIA=i/N ---- */
const semFonte = SABOTAGENS.filter(s => !s.fonte);
const todas = SABOTAGENS.map(s => s.nome);

test('mutação em fatias: MUTACAO_FATIA vazia = rodada inteira; "i/N" válido vira {i, n}; qualquer outra coisa é ERRO (nunca "rodou nada" em silêncio)', () => {
  assert.deepEqual(lerFatia(''), { fatia: null, erro: null });
  assert.deepEqual(lerFatia(undefined), { fatia: null, erro: null });
  assert.deepEqual(lerFatia(' 3/8 '), { fatia: { i: 3, n: 8 }, erro: null });
  for (const ruim of ['0/8', '9/8', '1/0', 'a/b', '3', '3/', '/8', '-1/8', '1.5/8', '1/8/2', '1/101']) {
    const r = lerFatia(ruim);
    assert.equal(r.fatia, null, ruim);
    assert.match(r.erro, /MUTACAO_FATIA/, ruim);
  }
});

test('mutação em fatias: a união das fatias é exatamente a lista inteira, cada sabotagem em UMA fatia só, para qualquer N (inclusive N maior que a lista)', () => {
  assert.ok(todas.length >= 100, 'há bastante sabotagem para a partição ter o que provar');
  assert.equal(new Set(todas).size, todas.length, 'nome de sabotagem repetido esconderia uma repetição/falta nesta prova');
  for (const n of [1, 2, 3, 5, 7, 8, 10, 12, 20, todas.length, todas.length + 1, todas.length + 50]) {
    const vistas = [];
    for (let i = 1; i <= n; i++) vistas.push(...daFatia(SABOTAGENS, { i, n }).map(s => s.nome));
    assert.equal(vistas.length, todas.length, 'N=' + n + ': nem a mais (repetida) nem a menos (faltando)');
    assert.deepEqual([...vistas].sort(), [...todas].sort(), 'N=' + n + ': as mesmas sabotagens');
  }
});

test('mutação em fatias: a partição é estável (mesma entrada, mesma fatia), segue a ordem da lista e as fatias ficam equilibradas (diferem no máximo 1)', () => {
  const a = daFatia(SABOTAGENS, { i: 3, n: 8 }).map(s => s.nome);
  assert.deepEqual(daFatia(SABOTAGENS, { i: 3, n: 8 }).map(s => s.nome), a);
  assert.deepEqual(a, todas.filter((_, idx) => idx % 8 === 2), 'fatia i = índices i-1, i-1+N, i-1+2N… da lista');
  const tamanhos = Array.from({ length: 8 }, (_, k) => daFatia(SABOTAGENS, { i: k + 1, n: 8 }).length);
  assert.ok(Math.max(...tamanhos) - Math.min(...tamanhos) <= 1, tamanhos.join(','));
  assert.deepEqual(daFatia(SABOTAGENS, null), SABOTAGENS, 'sem fatia: todas');
});

test('mutação em fatias: fatia vazia (N maior que a lista) NÃO é erro; o filtro que não casa nada continua sendo erro, também dentro de uma fatia', () => {
  const vazia = escolherSabotagens(SABOTAGENS, '', { i: todas.length + 5, n: todas.length + 10 });
  assert.deepEqual(vazia.sabotagens, []);
  assert.equal(vazia.erro, null);
  const sem = escolherSabotagens(SABOTAGENS, 'nome-que-nao-existe', { i: 1, n: 4 });
  assert.match(sem.erro, /nenhuma sabotagem/);
  /* o filtro vale sobre a fatia: junto das N fatias ele acha as mesmas sabotagens que sem fatia */
  const f = SABOTAGENS[0].nome.slice(0, 12);
  const soma = [1, 2, 3].flatMap(i => escolherSabotagens(SABOTAGENS, f, { i, n: 3 }).sabotagens.map(s => s.nome));
  assert.deepEqual(soma.sort(), escolherSabotagens(SABOTAGENS, f).sabotagens.map(s => s.nome).sort());
});

/* o agregado do CI só passa se todas as fatias passarem; cada fatia sai com código != 0 se UMA sabotagem escapar */
const pegaTudo = () => ({ status: 1, stdout: '✖ teste que caiu na asserção\nℹ tests 3\n', stderr: '' });
const naoPegaNada = () => ({ status: 0, stdout: 'ℹ tests 3\nℹ pass 3\n', stderr: '' });
const lista = semFonte.slice(0, 3);

test('mutação em fatias: se os testes pegam todas as sabotagens da fatia, o código de saída é 0', () => {
  const linhas = [];
  const r = rodar({ env: {}, sabotagens: lista, executarTestes: pegaTudo, log: l => linhas.push(l) });
  assert.equal(r.codigo, 0);
  assert.match(linhas.join('\n'), /3 de 3 sabotagens pegas/);
});

test('mutação em fatias: UMA sabotagem que escapa (testes passam com ela) faz a fatia sair com código 1, e o nome aparece como ESCAPOU', () => {
  let chamada = 0;
  const linhas = [];
  const executar = (...args) => (++chamada === 2 ? naoPegaNada() : pegaTudo(...args));
  const r = rodar({ env: {}, sabotagens: lista, executarTestes: executar, log: l => linhas.push(l) });
  assert.equal(r.codigo, 1);
  assert.ok(linhas.some(l => l.startsWith('ESCAPOU  ' + lista[1].nome)), 'a sabotagem que escapou aparece como ESCAPOU');
  assert.match(linhas.join('\n'), /2 de 3 sabotagens pegas/);
});

test('mutação em fatias: sabotagem inválida (nenhum teste rodou) também reprova a fatia', () => {
  const r = rodar({ env: {}, sabotagens: lista.slice(0, 1), executarTestes: () => ({ status: 1, stdout: '', stderr: 'boom' }), log: () => {} });
  assert.equal(r.codigo, 1);
});

test('mutação em fatias: fatia vazia sai com 0 ("0 de 0"); MUTACAO_FATIA inválida sai com 1 sem rodar nada; a fatia roda só as suas sabotagens', () => {
  const rodou = [];
  const registra = (...args) => { rodou.push(args); return pegaTudo(); };
  const vazia = rodar({ env: { MUTACAO_FATIA: '7/9' }, sabotagens: lista, executarTestes: registra, log: () => {} });
  assert.equal(vazia.codigo, 0);
  assert.equal(rodou.length, 0, 'fatia 7/9 de 3 sabotagens: nada a rodar');
  const ruim = rodar({ env: { MUTACAO_FATIA: '9/3' }, sabotagens: lista, executarTestes: registra, log: () => {} });
  assert.equal(ruim.codigo, 1);
  assert.equal(rodou.length, 0);
  const definidaVazia = rodar({ env: { MUTACAO_FATIA: '' }, sabotagens: lista, executarTestes: registra, log: () => {} });
  assert.equal(definidaVazia.codigo, 1, 'variável definida e vazia = erro (a matriz do CI não preencheu a fatia)');
  assert.equal(rodou.length, 0);
  const so2 = rodar({ env: { MUTACAO_FATIA: '2/3' }, sabotagens: lista, executarTestes: registra, log: () => {} });
  assert.equal(so2.codigo, 0);
  assert.equal(rodou.length, 1, 'fatia 2/3 de 3 sabotagens: só a do índice 1');
});

/* ---- o alvo da sabotagem é o código que VALE (PR 196: 37 sabotagens mexiam em funções que uma migration nova recriou, e 2 não
   achavam mais o texto; o PR não roda a mutação, e elas só apareceram na main). Esta conferência não roda teste: cabe no PR ---- */
test('mutação: toda sabotagem acha o seu texto e mexe na versão que vale de cada função (nenhuma na versão que uma migration mais nova recriou)', () => {
  assert.deepEqual(alvosVencidos(), []);
});

test('mutação: a conferência do alvo acusa a função recriada, o grant antes da migration que refaz os privilégios e o texto sumido; o rename leva o corpo junto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bz-alvos-'));
  try {
    fs.writeFileSync(path.join(dir, '001_velha.sql'), 'create function app.f(p jsonb) returns int language sql as $$\r\n  select 1 -- regra velha\r\n$$;\r\n'
      + 'create function app.g(p jsonb) returns int language sql as $$ select 2 -- regra de g $$;\r\n'
      + 'create function app.h(p jsonb) returns int language sql as $$ select 3 -- regra de h $$;\r\n');
    /* (revisão do #213: um COMENTÁRIO que cita "create or replace function app.h" ou "revoke … on function app.h" não recria nada) */
    fs.writeFileSync(path.join(dir, '002_nova.sql'), '-- antes era: create or replace function app.h(p jsonb) $$ … $$\n-- e revoke all on function app.h(jsonb) from anon;\n'
      + 'create or replace function app.f(p jsonb) returns int language sql as $$ select 1 -- regra nova $$;\n'
      + 'revoke all on function app.f(jsonb) from public, anon, authenticated;\n'
      + 'alter function app.g(jsonb) rename to g_base;\ncreate function app.g(p jsonb) returns int language sql as $$ select app.g_base(p) $$;\n');
    const s = (nome, extra) => ({ nome, arquivo: '001_velha.sql', ...extra });
    const r = alvosVencidos([
      s('velha', { de: 'regra velha', para: 'x' }),
      s('renomeada', { de: 'regra de g', para: 'x' }),
      s('nova', { arquivo: '002_nova.sql', de: 'regra nova', para: 'x' }),
      s('sumiu', { de: 'texto que não existe', para: 'x' }),
      s('grant velho', { acrescentar: '\ngrant execute on function app.f(jsonb) to anon;\n' }),
      s('grant novo', { arquivo: '002_nova.sql', acrescentar: '\ngrant execute on function app.f(jsonb) to anon;\n' }),
      s('só comentada', { de: 'regra de h', para: 'x' }),
      s('grant de h', { acrescentar: '\ngrant execute on function app.h(jsonb) to anon;\n' })
    ], dir, dir);
    assert.equal(r.length, 3, r.join('\n'));
    assert.match(r[0], /^VERSÃO VELHA: velha /);
    assert.match(r[1], /^NÃO APLICADA: sumiu /);
    assert.match(r[2], /^VERSÃO VELHA: grant velho .*002_nova\.sql/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
