/* O INTERRUPTOR DA ENTREGA (PR 3b-2; M5): desligado por padrão, só o texto exato "ligada" liga; desligado, as ações novas dão 503 e o
   estado não traz a entrega; nenhum arquivo de deploy liga; o servidor local liga.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarLocal } from '../banco-local.mjs';
import { criarCenario, BASE } from './_ajustes.mjs';
import { ateEntregaCriada } from './_entrega.mjs';
import { entregaLigada, FRASE_DESLIGADA } from '../../api/_material/interruptor.mjs';

/* as ações POST de /api/vendas que já existiam antes da entrega e as que a entrega trouxe (estas ficam atrás do interruptor) */
const ANTIGAS = ['recado', 'sessao', 'retomar', 'renovar', 'mensagem', 'gerar', 'gerar-direcao', 'escolher', 'ajustar', 'desfazer', 'pedido-livre', 'escopo', 'confirmar', 'pagar', 'simular', 'confirmar-pacote', 'detalhes'];
const DA_ENTREGA = ['material-salvar', 'material-reservar', 'material-conferir', 'material-remover', 'material-enviar', 'link-pedido', 'sair-do-aparelho', 'outro-aparelho', 'abrir-pedido', 'previa-ajustes', 'previa-aprovar'];

let local, cen;
before(async () => { local = await montarLocal({ base: BASE }); cen = criarCenario(local); });
const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('o padrão é desligado: só "ligada" liga', () => {
  for (const v of [undefined, '', 'sim', 'ligado', 'LIGADA', '1', 'true']) assert.equal(entregaLigada({ BZ_ENTREGA: v }), false, String(v));
  assert.equal(entregaLigada({}), false); assert.equal(entregaLigada(undefined), false);
  assert.equal(entregaLigada({ BZ_ENTREGA: 'ligada' }), true); assert.equal(entregaLigada({ BZ_ENTREGA: ' ligada ' }), true);
});

test('nenhum arquivo de deploy liga a entrega; o servidor local liga por conta própria', () => {
  for (const f of ['vercel.json', 'package.json']) assert.ok(!/BZ_ENTREGA/.test(ler(f)), f + ' não pode mencionar a variável com valor');
  assert.match(ler('.env.example'), /^BZ_ENTREGA=\s*$/m, 'o nome está no .env.example, sem valor');
  assert.match(ler('docs/servidor.mjs'), /process\.env\.BZ_ENTREGA = 'ligada'/);
});

test('no servidor local, BZ_ENTREGA_LOCAL=desligada é o único jeito de desligar a entrega (a rodada do E2E com o interruptor desligado)', () => {
  const s = ler('docs/servidor.mjs');
  assert.match(s, /^if \(process\.env\.BZ_ENTREGA_LOCAL !== 'desligada'\) process\.env\.BZ_ENTREGA = 'ligada';/m, 'a única linha que liga, e só quando BZ_ENTREGA_LOCAL não é "desligada"');
  const usos = s.split(/\r?\n/).filter(l => /BZ_ENTREGA\b(?!_LOCAL)/.test(l.replace(/\/\*.*?\*\//g, '')));
  assert.equal(usos.length, 1, 'nenhuma outra linha do servidor local liga, desliga ou apaga BZ_ENTREGA: ' + usos.join(' | '));
  assert.ok(!/BZ_ENTREGA_LOCAL/.test(ler('vercel.json') + ler('package.json')), 'o atalho do servidor local não entra em arquivo de deploy');
});

test('desligada: as ações novas dão 503 com a saída pelo WhatsApp, e o estado não traz a entrega', async () => {
  const { n, c } = await ateEntregaCriada(cen, local, { env: {} });
  for (const acao of DA_ENTREGA.filter(a => a !== 'abrir-pedido')) {   /* (a lista inteira da entrega: o teste do fim do arquivo a fecha) */
    const r = await n.chamar('POST', acao, { conversa_id: c });
    assert.equal(r.status, 503, acao); assert.equal(r.corpo.erro, FRASE_DESLIGADA); assert.equal(r.corpo.recado, true);
  }
  assert.equal((await cen.navegador().chamar('POST', 'abrir-pedido', { codigo: 'a'.repeat(32) })).status, 503);
  const e = await cen.estado(n, c);
  assert.equal(e.entrega, undefined); assert.equal(e.entrega_ligada, false);
  /* o restante: a conversa em produção, com a entrega desligada, não cobra nada (o pagar dá 503 antes de qualquer valor) */
  const pg = await n.chamar('POST', 'pagar', { conversa_id: c, metodo: 'pix', pagador: { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '52998224725' } });
  assert.equal(pg.status, 503); assert.equal(pg.corpo.erro, FRASE_DESLIGADA); assert.equal(pg.corpo.recado, true);
});

test('ligada: o estado traz a entrega e entrega_ligada true', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const e = await cen.estado(n, c);
  assert.equal(e.entrega_ligada, true); assert.equal(e.entrega.passo, 'material');
});

test('toda ação POST de /api/vendas é antiga ou está na lista da entrega (e cada uma da lista dá 503 com a entrega desligada, no teste acima): nenhuma ação nova nasce fora do interruptor', async () => {
  const { ACOES } = await import('../../api/vendas.mjs');
  const novas = Object.keys(ACOES.POST).filter(a => !ANTIGAS.includes(a)).sort();
  assert.deepEqual(novas, [...DA_ENTREGA].sort(), 'uma ação nova entrou em ACOES.POST: ponha-a atrás do interruptor e em DA_ENTREGA (ou, se é anterior à entrega, em ANTIGAS)');
  assert.equal(new Set([...ANTIGAS, ...DA_ENTREGA]).size, ANTIGAS.length + DA_ENTREGA.length, 'uma ação não pode estar nas duas listas');
});
