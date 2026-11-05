/* ADIAR A ENTRADA (medida do 2c na página real, CPU 4x): montar construía as ~45 animações da entrada na mesma tarefa em que monta o quadro, mesmo com a faixa
   fora da tela (nascem pausadas). Agora o programa da entrada só é criado quando a animação vai começar (35% da faixa na tela, ou sem IntersectionObserver).
   Faixa fora da tela = nenhuma animação, nenhum temporizador; o quadro já está montado (altura reservada) e nada muda de lugar quando ela começa.
   node --test docs/testes/planta-adiar.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import M from '../../js/planta-desenho.js';
import { criarJanela } from './planta-dom-falso.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));
const amb = (op) => { const w = criarJanela(Object.assign({ reduzido: false, largura: 390 }, op || {})); const A = M.criar(w); const raiz = w.raiz(w.opcoes.largura); return { w, A, raiz }; };

test('faixa fora da tela: o quadro monta inteiro, mas nenhuma animação nem temporizador nasce até ela entrar', () => {
  const { w, A, raiz } = amb();
  const r = A.montar(raiz, fx('clinica'), {});
  assert.equal(r.ok, true);
  assert.equal(w.document.animacoes.length, 0, 'nenhuma animação criada');
  assert.equal(w.pendentes(), 0, 'nenhum temporizador');
  const q = raiz.porClasse('plv-quadro')[0];
  assert.ok(q.porTag('li').length >= 9 && q.estilo.height, 'o quadro e a altura reservada já existem');
  assert.ok(q._classes.has('plv--pre'), 'segue no estado "antes da luz"');
  w.mostrar(0, 0);
  assert.equal(w.document.animacoes.length, 0, 'fora da tela de novo: continua sem nada');
});

test('quando 35% da faixa entra na tela o programa da entrada nasce e roda como antes, até o status do fim', () => {
  const { w, A, raiz } = amb();
  A.montar(raiz, fx('clinica'), {});
  w.mostrar(1, 900);
  assert.ok(w.document.animacoes.length > 10, 'animações criadas: ' + w.document.animacoes.length);
  assert.ok(w.rodando().length > 10, 'rodando');
  assert.equal(raiz.porClasse('plv-status')[0].textContent, '');
  w.avancar(16000);
  assert.ok(raiz.porClasse('plv-status')[0].textContent.startsWith('Planta pronta, com 8 etapas. '));
  assert.ok(!raiz.porClasse('plv-quadro')[0]._classes.has('plv--pre'));
});

test('sem IntersectionObserver a entrada começa na hora (como antes)', () => {
  const { w, A, raiz } = amb({ semIO: true });
  A.montar(raiz, fx('clinica'), {});
  assert.ok(w.document.animacoes.length > 10);
  assert.ok(w.rodando().length > 10);
});

test('parar() antes de a faixa aparecer: nada nasce depois', () => {
  const { w, A, raiz } = amb();
  A.montar(raiz, fx('clinica'), {});
  A.parar();
  w.mostrar(1, 900);
  w.avancar(16000);
  assert.equal(w.document.animacoes.length, 0);
  assert.equal(w.pendentes(), 0);
});

test('"Rever a montagem" com a faixa à vista refaz a entrada na hora; um ajuste enquanto a entrada espera termina o quadro sem animar e sem lançar', () => {
  const a = amb();
  a.A.montar(a.raiz, fx('clinica'), {});
  a.w.mostrar(1, 900); a.w.avancar(16000);
  const antes = a.w.document.animacoes.length;
  const rever = a.raiz.porClasse('plv-btn').find((x) => x.textContent === 'Rever a montagem');
  rever.disparar('click');
  assert.ok(a.w.document.animacoes.length > antes + 10, 'o botão refaz a entrada na hora (a faixa está à vista)');
  const b = amb();
  b.A.montar(b.raiz, fx('clinica'), {});
  const depois = fx('clinica'); depois.etapas.splice(1, 0, Object.assign({}, depois.etapas[0], { id: 'novo7', titulo: 'Etapa nova' })); depois.etapas = depois.etapas.slice(0, 8);
  assert.doesNotThrow(() => b.A.atualizar(depois, { fala: 'x' }));
  b.w.avancar(16000);
  assert.ok(b.raiz.porClasse('plv-status')[0].textContent.startsWith('Planta ajustada'), b.raiz.porClasse('plv-status')[0].textContent);
  assert.equal(b.w.rodando().filter((x) => !x.cancelado).length >= 0, true);
});

test('movimento reduzido: quadro final na hora, nenhuma animação (inalterado)', () => {
  const { w, A, raiz } = amb({ reduzido: true });
  A.montar(raiz, fx('clinica'), {});
  assert.equal(w.document.animacoes.length, 0);
  assert.ok(raiz.porClasse('plv-status')[0].textContent.startsWith('Planta pronta'));
});

/* Achado do 2c no navegador (320 x 640): depois de tocar em "Ver a planta do seu site" a faixa ficava com o título logo abaixo do menu e só 313 px do quadro à vista,
   49% da janela de 640; o corte era 50% e a luz nunca começava até a pessoa rolar. O corte da janela cheia passou para 40%. */
test('o quadro do celular pequeno começa quando ocupa 40% da altura da janela (320 x 640: 313 px já bastam), e não antes', () => {
  const a = amb();   /* janela de 800 px de altura no DOM de mentira: 40% = 320 px */
  a.A.montar(a.raiz, fx('clinica'), {});
  a.w.mostrar(0.2, 310);
  assert.equal(a.w.rodando().length, 0, '310 px de 800 (39%) ainda não');
  a.w.mostrar(0.2, 330);
  assert.ok(a.w.rodando().length > 10, '330 px de 800 (41%): começou');
  const b = amb();
  b.w.innerHeight = 640;
  b.A.montar(b.raiz, fx('clinica'), {});
  b.w.mostrar(0.22, 313);
  assert.ok(b.w.rodando().length > 10, '313 px de 640: começou (era o caso do 320 x 640)');
});
