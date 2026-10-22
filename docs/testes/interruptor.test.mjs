/* O INTERRUPTOR DA ENTREGA (PR 3b-2; M5): desligado por padrão, só o texto exato "ligada" liga; desligado, as ações novas dão 503 e o
   estado não traz a entrega; nenhum arquivo de deploy liga; o servidor local liga.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarLocal } from '../banco-local.mjs';
import { criarCenario, BASE } from './_ajustes.mjs';
import { ateEntregaCriada } from './_entrega.mjs';
import { entregaLigada, FRASE_DESLIGADA } from '../../api/_material/interruptor.mjs';

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

test('desligada: as ações novas dão 503 com a saída pelo WhatsApp, e o estado não traz a entrega', async () => {
  const { n, c } = await ateEntregaCriada(cen, local, { env: {} });
  for (const acao of ['material-salvar', 'material-reservar', 'material-conferir', 'material-remover', 'material-enviar' /* (Task 9 acrescenta link-pedido, sair-do-aparelho e outro-aparelho) */]) {
    const r = await n.chamar('POST', acao, { conversa_id: c });
    assert.equal(r.status, 503, acao); assert.equal(r.corpo.erro, FRASE_DESLIGADA); assert.equal(r.corpo.whatsapp, true);
  }
  /* (Task 9: abrir-pedido também) */
  const e = await cen.estado(n, c);
  assert.equal(e.entrega, undefined); assert.equal(e.entrega_ligada, false);
});

test('ligada: o estado traz a entrega e entrega_ligada true', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const e = await cen.estado(n, c);
  assert.equal(e.entrega_ligada, true); assert.equal(e.entrega.passo, 'material');
});
