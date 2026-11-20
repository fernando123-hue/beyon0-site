/* A planta viva (BZ_PLANTA) fica LIGADA só nas prévias (dono, chat 20/11, para ver no celular) e DESLIGADA na produção
   (decisão do dono de 07/11: só vai ao ar com tudo bem montado). O interruptor mora no wrangler.jsonc, com versão e revisão,
   e não só no painel da Cloudflare (valor do painel é sobrescrito a cada publicação). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../../cloudflare/jsonc.mjs';

const ARQUIVO = process.env.WRANGLER_ARQUIVO || new URL('../../wrangler.jsonc', import.meta.url);
const cfg = parse(readFileSync(ARQUIVO, 'utf8'));

test('a planta viva está ligada no staging (previa) e nas prévias de branch', () => {
  assert.equal(cfg.env.previa.vars.BZ_PLANTA, 'ligada');
  assert.equal(cfg.env.previa.previews.vars.BZ_PLANTA, 'ligada');
});

test('a produção NÃO liga a planta viva (nem por herança do bloco de cima)', () => {
  assert.notEqual(cfg.vars.BZ_PLANTA, 'ligada');
  assert.ok(!('BZ_PLANTA' in cfg.vars) || cfg.vars.BZ_PLANTA === '', 'a produção deixa BZ_PLANTA vazia ou ausente');
});

test('o staging e as prévias continuam sendo prévia (ambiente e pagamento de teste)', () => {
  for (const vars of [cfg.env.previa.vars, cfg.env.previa.previews.vars]) {
    assert.equal(vars.BZ_AMBIENTE, 'previa');
    assert.equal(vars.MP_AMBIENTE, 'teste');
  }
});
