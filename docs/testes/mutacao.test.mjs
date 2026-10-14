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
import { SINAIS_DE_SAIDA, problemasNaPartida, SABOTAGENS } from './mutacao.mjs';

const comFonte = SABOTAGENS.filter(s => s.fonte);

test('mutação: a restauração do arquivo sabotado vale também no SIGHUP e no SIGBREAK', () => {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) assert.ok(SINAIS_DE_SAIDA.includes(s), s);
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
    const sujo = problemasNaPartida(comFonte, raiz, arquivo => arquivo !== s.fonte);
    assert.equal(sujo.length, 1);
    assert.match(sujo[0], /mudança fora do git/);
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
});
