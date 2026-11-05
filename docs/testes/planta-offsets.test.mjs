/* Achado do 2c no navegador de verdade: o Web Animations API recusa keyframes com `offset` decrescente ("Offsets must be monotonically non-decreasing") e o
   DOM de mentira aceitava. O pulso de repouso de uma rota LONGA e curta no tempo (a de retorno do laço) gerava o 2º ponto antes do 1º. O módulo engolia o erro
   (aviso) e a rota ficava sem o pulso. Este teste confere, para toda animação pedida, que os offsets não decrescem e ficam em [0,1].
   node --test docs/testes/planta-offsets.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import M from '../../js/planta-desenho.js';
import { criarJanela } from './planta-dom-falso.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));

function confere(w, rotulo) {
  assert.ok(w.document.animacoes.length > 10, rotulo + ': houve animações');
  for (const a of w.document.animacoes) {
    let ant = -Infinity;
    for (const k of a.keyframes) {
      if (k.offset === undefined) continue;
      assert.ok(k.offset >= 0 && k.offset <= 1, rotulo + ': offset fora de [0,1]: ' + k.offset);
      assert.ok(k.offset >= ant, rotulo + ': offset decrescente (' + ant + ' depois ' + k.offset + ')');
      ant = k.offset;
    }
  }
}

for (const nicho of ['clinica', 'embalagens', 'loja']) {
  for (const largura of [320, 390, 1280]) {
    test('offsets não decrescem (' + nicho + ', ' + largura + ' px), na entrada, no pulso de repouso e no ajuste', () => {
      const w = criarJanela({ reduzido: false, largura });
      const A = M.criar(w);
      const raiz = w.raiz(largura);
      assert.equal(A.montar(raiz, fx(nicho), {}).ok, true);
      w.mostrar(1, 900);
      w.avancar(16000);
      confere(w, nicho + ' ' + largura);
      const depois = fx(nicho);
      depois.etapas.splice(1, 0, Object.assign({}, depois.etapas[0], { id: 'novo9', titulo: 'Etapa nova do ajuste' }));
      depois.etapas = depois.etapas.slice(0, 8);
      A.atualizar(depois, { fala: 'quero mais uma etapa' });
      w.avancar(16000);
      confere(w, nicho + ' ' + largura + ' (ajuste)');
    });
  }
}
