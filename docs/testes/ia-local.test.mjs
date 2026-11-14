/* A IA REAL NO SERVIDOR LOCAL, COM TETO (docs/superpowers/specs/2026-11-14-ia-real-local-design.md): o livro do gasto que
   sobrevive aos servidores, o teto conferido antes de cada chamada, a geração na simulada, a gravação e a fita, e o gancho
   de criarIA que só vale no local. Sem rede: a "IA real" aqui é falsa.  node --test docs/testes/ia-local.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirLivro, tetoDe, criarIALocal, lerFita, montarIALocal, TETO_PADRAO_USD } from '../ia-local.mjs';
import { criarIA, ErroIA } from '../../api/_ia/provedor.mjs';
import { reservaUsd } from '../../api/_ia/config.mjs';

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bz-ia-local-'));
const pedido = (papel, fala = 'tenho uma clínica') => ({ papel, sistema: 's', mensagens: [{ role: 'user', content: fala }] });

/* a "IA real" falsa: custa o que mandarem, pode demorar (uma promessa que o teste solta) e pode falhar com custo */
function realFalsa({ custo = 0.1, falha = null } = {}) {
  const chamadas = [];
  return {
    chamadas,
    nome: 'anthropic',
    async mensagem(p) {
      chamadas.push(p.papel);
      if (falha) throw falha;
      return { texto: 'oi ' + chamadas.length, json: null, chamadas: [], conteudo: [], parada: 'fim', modelo: 'claude-sonnet-5-5', uso: {}, custo_usd: custo };
    }
  };
}
const simuladaFalsa = () => ({ nome: 'simulada', chamadas: [], async mensagem(p) { this.chamadas.push(p.papel); return { texto: 'simulada', custo_usd: 0, parada: 'fim', chamadas: [] }; } });

test('teto: padrão US$ 3; inválido, zero, negativo ou acima de 10 voltam ao padrão', () => {
  assert.equal(TETO_PADRAO_USD, 3);
  assert.equal(tetoDe({}), 3);
  assert.equal(tetoDe({ BZ_IA_TETO_USD: '1.5' }), 1.5);
  for (const v of ['abc', '0', '-1', '11', '1e9', '']) assert.equal(tetoDe({ BZ_IA_TETO_USD: v }), 3, v);
});

test('o livro soma o gasto e sobrevive a uma instância nova (outro servidor)', () => {
  const arq = path.join(pasta(), 'livro.json');
  const a = abrirLivro(arq);
  assert.equal(a.total(), 0);
  a.anotar({ papel: 'conversa', modelo: 'm', custo_usd: 0.25, ms: 1200 });
  a.anotar({ papel: 'extracao', modelo: 'm', custo_usd: 0.05, ms: 300 });
  const b = abrirLivro(arq);
  assert.ok(Math.abs(b.total() - 0.3) < 1e-9);
  assert.equal(b.chamadas().length, 2);
  assert.equal(b.chamadas()[0].ms, 1200);
});

test('livro corrompido não vira gasto zero: recusa abrir', () => {
  const arq = path.join(pasta(), 'livro.json');
  fs.writeFileSync(arq, '{ isto não é json');
  assert.throws(() => abrirLivro(arq), /livro/);
});

test('real: anota custo e tempo de cada chamada', async () => {
  const livro = abrirLivro(path.join(pasta(), 'l.json'));
  const real = realFalsa({ custo: 0.2 });
  let t = 1000;
  const ia = criarIALocal({ real, simulada: simuladaFalsa(), livro, teto: 3, agora: () => (t += 500) });
  assert.equal(ia.modo, 'real');
  const r = await ia.mensagem(pedido('conversa'));
  assert.equal(r.texto, 'oi 1');
  assert.ok(Math.abs(livro.total() - 0.2) < 1e-9);
  assert.equal(livro.chamadas()[0].papel, 'conversa');
  assert.equal(livro.chamadas()[0].ms, 500);
});

test('real: o teto barra ANTES de chamar (gasto + reserva do papel), com erro "limite"', async () => {
  const livro = abrirLivro(path.join(pasta(), 'l.json'));
  livro.anotar({ papel: 'conversa', modelo: 'm', custo_usd: 2.96, ms: 1 });
  const real = realFalsa();
  const ia = criarIALocal({ real, simulada: simuladaFalsa(), livro, teto: 3 });
  assert.ok(2.96 + reservaUsd('conversa') > 3);
  await assert.rejects(ia.mensagem(pedido('conversa')), e => e instanceof ErroIA && e.motivo === 'limite');
  assert.deepEqual(real.chamadas, [], 'a chamada não saiu');
});

test('real: chamadas em voo contam no teto (duas ao mesmo tempo não passam juntas)', { timeout: 5000 }, async () => {
  const livro = abrirLivro(path.join(pasta(), 'l.json'));
  livro.anotar({ papel: 'conversa', modelo: 'm', custo_usd: 3 - reservaUsd('conversa') * 1.5, ms: 1 });
  let soltar;
  const presa = new Promise(r => { soltar = r; });
  const real = { chamadas: [], async mensagem(p) { this.chamadas.push(p.papel); await presa; return { texto: 'x', custo_usd: 0.01, parada: 'fim', chamadas: [] }; } };
  const ia = criarIALocal({ real, simulada: simuladaFalsa(), livro, teto: 3 });
  const primeira = ia.mensagem(pedido('conversa'));
  /* a segunda deve recusar na hora; se passar do teto, fica presa junto com a primeira: o prazo curto vira falha, não trava */
  const segunda = ia.mensagem(pedido('conversa')).then(() => 'passou', e => e);
  const prazo = new Promise(r => setTimeout(() => r('presa'), 500));
  const r = await Promise.race([segunda, prazo]);
  soltar();
  await primeira;
  await segunda;
  assert.equal(r?.motivo, 'limite', 'a segunda chamada devia ser recusada pelo teto, veio: ' + (r?.motivo || r));
  assert.equal(real.chamadas.length, 1);
});

test('real: o custo já pago de uma chamada que falhou entra no livro', async () => {
  const livro = abrirLivro(path.join(pasta(), 'l.json'));
  const real = realFalsa({ falha: new ErroIA('formato', 'quebrou', 0.07) });
  const ia = criarIALocal({ real, simulada: simuladaFalsa(), livro, teto: 3 });
  await assert.rejects(ia.mensagem(pedido('conversa')), e => e.motivo === 'formato');
  assert.ok(Math.abs(livro.total() - 0.07) < 1e-9);
  assert.equal(livro.chamadas()[0].erro, 'formato');
});

test('real: a geração (Opus) vai à simulada, salvo com BZ_IA_REAL_GERACAO=1', async () => {
  const livro = abrirLivro(path.join(pasta(), 'l.json'));
  const real = realFalsa(), sim = simuladaFalsa();
  const ia = criarIALocal({ real, simulada: sim, livro, teto: 3 });
  const r = await ia.mensagem(pedido('geracao'));
  assert.equal(r.texto, 'simulada');
  assert.deepEqual(real.chamadas, []);
  const comGeracao = criarIALocal({ real, simulada: sim, livro, teto: 3, geracaoReal: true });
  await comGeracao.mensagem(pedido('geracao'));
  assert.deepEqual(real.chamadas, ['geracao']);
});

test('gravação e fita: a fita devolve as mesmas respostas, por papel, em ordem, sem chamar a real', async () => {
  const dir = pasta();
  const fitaArq = path.join(dir, 'fita.jsonl');
  const livro = abrirLivro(path.join(dir, 'l.json'));
  const ia = criarIALocal({ real: realFalsa(), simulada: simuladaFalsa(), livro, teto: 3, gravar: fitaArq });
  const r1 = await ia.mensagem(pedido('conversa', 'sou dentista'));
  const r2 = await ia.mensagem(pedido('extracao'));
  const r3 = await ia.mensagem(pedido('conversa', 'pacientes faltam'));
  const linhas = lerFita(fitaArq);
  assert.equal(linhas.length, 3);
  assert.equal(linhas[0].fala, 'sou dentista');

  const esperas = [];
  const toca = criarIALocal({ simulada: simuladaFalsa(), livro, teto: 3, fita: linhas, esperar: async ms => { esperas.push(ms); } });
  assert.equal(toca.modo, 'fita');
  assert.deepEqual((await toca.mensagem(pedido('conversa'))).texto, r1.texto);
  assert.deepEqual((await toca.mensagem(pedido('conversa'))).texto, r3.texto);
  assert.deepEqual((await toca.mensagem(pedido('extracao'))).texto, r2.texto);
  assert.equal(esperas.length, 3, 'no ritmo gravado');
  await assert.rejects(toca.mensagem(pedido('conversa')), e => e instanceof ErroIA && e.motivo === 'indisponivel');
  assert.equal(livro.chamadas().length, 3, 'a fita não gasta');
});

test('fita no ritmo imediato não espera', async () => {
  const esperas = [];
  const linhas = [{ papel: 'conversa', ms: 9000, resposta: { texto: 'a', custo_usd: 0.1 } }];
  const toca = criarIALocal({ simulada: simuladaFalsa(), livro: abrirLivro(path.join(pasta(), 'l.json')), teto: 3, fita: linhas, ritmo: 'imediato', esperar: async ms => { esperas.push(ms); } });
  assert.equal((await toca.mensagem(pedido('conversa'))).texto, 'a');
  assert.deepEqual(esperas, []);
});

test('montarIALocal: sem BZ_IA_REAL é a simulada; com BZ_IA_REAL e sem chave, recusa subir', async () => {
  const dir = pasta();
  const sim = await montarIALocal({ BZ_IA_LIVRO: path.join(dir, 'l.json') });
  assert.equal(sim.modo, 'simulada');
  await assert.rejects(montarIALocal({ BZ_IA_REAL: '1', BZ_IA_LIVRO: path.join(dir, 'l.json') }), /ANTHROPIC_API_KEY/);
  const fitaArq = path.join(dir, 'f.jsonl');
  fs.writeFileSync(fitaArq, JSON.stringify({ papel: 'conversa', ms: 1, resposta: { texto: 'g' } }) + '\n');
  const toca = await montarIALocal({ BZ_IA_REPRODUZIR: fitaArq, BZ_IA_LIVRO: path.join(dir, 'l.json') });
  assert.equal(toca.modo, 'fita');
});

test('o gancho de criarIA vale no local e é ignorado na Cloudflare', async () => {
  const antes = globalThis.__BZ_LOCAL;
  const minha = { nome: 'local-teste', async mensagem() { return {}; } };
  try {
    globalThis.__BZ_LOCAL = { ...(antes || {}), ia: () => minha };
    assert.equal(await criarIA({ BZ_LOCAL: '1' }), minha);
    const naNuvem = await criarIA({ BZ_LOCAL: '1', BZ_PLATAFORMA: 'cloudflare', BZ_AMBIENTE: 'previa', BZ_IA: 'simulada' });
    assert.notEqual(naNuvem, minha);
    assert.equal(await criarIA({ BZ_PLATAFORMA: 'cloudflare' }), null, 'produção sem chave segue sem IA');
  } finally {
    if (antes === undefined) delete globalThis.__BZ_LOCAL; else globalThis.__BZ_LOCAL = antes;
  }
});

test('o servidor local monta a IA local e apaga a JEV_SOMBRA', () => {
  const s = fs.readFileSync(new URL('../servidor.mjs', import.meta.url), 'utf8');
  assert.match(s, /montarIALocal/);
  assert.match(s, /delete process\.env\.JEV_SOMBRA/);
});
