/* Mapa vivo v2, FASE 4, parte 2 (tela): js/orcamento-coerencia-tela.js com um kit de conversa de mentira (o BZToques.kit e o trocarRamo reais
   são testados em docs/testes/orcamento-toques.test.mjs). O que se prova: sem reacao: true ou sem coerencia, nada; palpite fora da tabela, nada;
   antes da 1ª resposta do Zero, nada; o ramo de agora já é o palpite, nada; uma pergunta por conversa (também numa página nova, com o módulo
   carregado do zero, pelo sessionStorage); "Sim" troca só o ramo (BZToques.trocarRamo, que devolve a promessa do envio) e, se não entrou, diz
   como ajustar; "Não" fecha; o nome que aparece é o da tabela, nunca o que veio do servidor; e a página carrega os dois scripts antes do
   orcamento.js e chama o atualizar.
   npm run testar */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lerFonte = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CAMINHO = require.resolve('../../js/orcamento-coerencia-tela.js');
const guardado = new Map();
/* o window de mentira existe só enquanto o módulo carrega (ele guarda a referência): os outros testes do mesmo processo seguem com o deles */
const window = {
  sessionStorage: { getItem: k => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => guardado.set(k, String(v)) }
};
window.BZOrcCoerencia = require('../../js/orcamento-coerencia.js');
/* carrega o módulo do zero (a memória da página some, como numa página nova; o sessionStorage fica) */
function carregarTela() {
  delete require.cache[CAMINHO];
  const antes = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = window;
  try { return require(CAMINHO); } finally { if (antes) Object.defineProperty(globalThis, 'window', antes); else delete globalThis.window; }
}
const tique = () => new Promise(r => setImmediate(r));
/* (as falas levam espaço que não quebra entre os blocos de sentido: compara com espaço comum; um teste confere o espaço que não quebra) */
const comum = l => l.map(t => t.replace(/ /g, ' '));

describe('a pergunta de coerência na conversa', () => {
  let Tela, falas, grupos, trocas, consultor, trocaDa, ramoAgora;
  beforeEach(() => {
    guardado.clear();
    Tela = carregarTela();
    falas = []; grupos = []; trocas = []; consultor = true; trocaDa = true; ramoAgora = 'saude';
    window.BZToques = {
      comConsultor: () => consultor,
      respostas: () => ({ ramo: ramoAgora }),
      trocarRamo: r => { trocas.push(r); return Promise.resolve(trocaDa); },
      kit: {
        fala: t => { falas.push(t); return { firstChild: { id: 'f' + falas.length } }; },
        opcoes: (rotulo, itens, aoEscolher, o) => { grupos.push({ rotulo, itens, aoEscolher, o }); },
        focarSaida: () => {}
      }
    };
  });
  let n = 0;
  const RESPONDIDA = [{ papel: 'visitante', conteudo: 'Tenho uma padaria' }, { papel: 'agente', conteudo: 'Que bom!' }];
  const estado = (coerencia, extra = {}) => ({ reacao: true, coerencia, conversa: { id: 'conversa-' + (++n) }, mensagens: RESPONDIDA, ...extra });
  const PADARIA = { palpite: 'alimentacao', nome: 'Alimentação', tocado: 'Saúde' };

  test('com reacao: true e coerencia: uma fala com o palpite da tabela e dois botões', () => {
    assert.equal(Tela.atualizar(estado(PADARIA)), true);
    assert.deepEqual(comum(falas), ['Pelo que você contou, o seu negócio parece ser de Alimentação, e não de Saúde. Quer que eu ajuste?']);
    assert.deepEqual(grupos[0].itens.map(i => i.rotulo), ['Sim, ajuste', 'Não, está certo']);
    assert.deepEqual(grupos[0].o, { falaId: 'f1' });
    assert.ok(['de Alimentação', 'e não de Saúde', 'Quer que eu ajuste?'].every(b => falas[0].includes(b)), 'a linha só quebra entre os blocos de sentido');
  });

  test('sem reacao: true, sem coerencia, sem conversa, sem consultor ou sem os toques: nada', () => {
    assert.equal(Tela.atualizar({ coerencia: PADARIA, conversa: { id: 'x1' }, mensagens: RESPONDIDA }), false);
    assert.equal(Tela.atualizar(estado(undefined)), false);
    assert.equal(Tela.atualizar({ reacao: true, coerencia: PADARIA, mensagens: RESPONDIDA }), false);
    consultor = false;
    assert.equal(Tela.atualizar(estado(PADARIA)), false);
    consultor = true;
    const t = window.BZToques; window.BZToques = undefined;
    assert.equal(Tela.atualizar(estado(PADARIA)), false);
    window.BZToques = t;
    assert.equal(falas.length, 0);
  });

  test('antes da 1ª resposta do Zero, nada (e a conversa não fica marcada: pergunta quando ele responder)', () => {
    const e = estado(PADARIA, { mensagens: [{ papel: 'visitante', conteudo: 'Tenho uma padaria' }] });
    assert.equal(Tela.atualizar(e), false);
    assert.equal(Tela.atualizar({ ...e, mensagens: undefined }), false);
    assert.equal(falas.length, 0);
    assert.equal(Tela.atualizar({ ...e, mensagens: RESPONDIDA }), true);
  });

  test('o ramo de agora já é o palpite (ela trocou sozinha): nada, sem marcar', () => {
    ramoAgora = 'alimentacao';
    const e = estado(PADARIA);
    assert.equal(Tela.atualizar(e), false);
    assert.equal(guardado.size, 0);
    ramoAgora = 'saude';
    assert.equal(Tela.atualizar(e), true);
  });

  test('palpite fora da tabela (ou "outro", ou herdado) não vira pergunta; nome do servidor que não é da tabela não aparece', () => {
    for (const palpite of ['outro', 'banco', '__proto__', 'constructor', 42, null]) assert.equal(Tela.atualizar(estado({ palpite, nome: 'x' })), false, String(palpite));
    Tela.atualizar(estado({ palpite: 'beleza', nome: '<b>Beleza</b>', tocado: '<img src=x>' }));
    assert.deepEqual(comum(falas), ['Pelo que você contou, o seu negócio parece ser de Beleza. Quer que eu ajuste?']);
  });

  test('uma vez por conversa; numa página nova (módulo do zero) o sessionStorage segura; outra conversa pergunta de novo', () => {
    const e = estado(PADARIA);
    assert.equal(Tela.atualizar(e), true);
    assert.equal(Tela.atualizar(e), false);
    Tela = carregarTela();
    assert.equal(Tela.atualizar(e), false, 'página nova, mesma aba: não pergunta de novo');
    guardado.clear();
    Tela = carregarTela();
    assert.equal(Tela.atualizar(e), true, 'sem o sessionStorage (aba nova), pergunta de novo: prova que era ele que segurava');
    assert.equal(Tela.atualizar(estado(PADARIA)), true);
    assert.equal(falas.length, 3);
  });

  test('"Sim, ajuste" troca só o ramo; se o envio não entrou, diz como ajustar; "Não" não troca nada', async () => {
    Tela.atualizar(estado(PADARIA));
    grupos[0].aoEscolher('sim');
    await tique();
    assert.deepEqual(trocas, ['alimentacao']);
    assert.equal(falas.length, 1, 'entrou: nenhuma fala a mais (a fala dela e a resposta do Zero entram pela conversa)');
    trocaDa = false;
    Tela.atualizar(estado(PADARIA));
    grupos[1].aoEscolher('sim');
    await tique();
    assert.match(falas.at(-1), /Mudar as respostas/);
    Tela.atualizar(estado(PADARIA));
    grupos[2].aoEscolher('nao');
    await tique();
    assert.deepEqual(trocas, ['alimentacao', 'alimentacao']);
  });

  test('"Sim" com o trocarRamo que falha (promessa rejeitada ou valor que não é promessa): diz como ajustar, sem erro solto', async () => {
    window.BZToques.trocarRamo = () => Promise.reject(new Error('x'));
    Tela.atualizar(estado(PADARIA));
    grupos[0].aoEscolher('sim');
    await tique();
    assert.match(falas.at(-1), /Mudar as respostas/);
    window.BZToques.trocarRamo = () => false;
    Tela.atualizar(estado(PADARIA));
    grupos[1].aoEscolher('sim');
    await tique();
    assert.equal(falas.filter(f => /Mudar as respostas/.test(f)).length, 2);
  });
});

test('fonte e página: ES5 sem innerHTML; os scripts depois dos toques e antes do orcamento.js; o render chama o atualizar; trocarRamo existe', () => {
  const fonte = lerFonte('js/orcamento-coerencia-tela.js');
  assert.ok(!/innerHTML|=>|\blet\b|\bconst\b/.test(fonte));
  const html = lerFonte('orcamento.html');
  const pos = s => html.indexOf('<script src="js/' + s + '" defer></script>');
  for (const s of ['orcamento-toques.js', 'orcamento-coerencia.js', 'orcamento-coerencia-tela.js', 'orcamento.js']) assert.ok(pos(s) > 0, s);
  assert.ok(pos('orcamento-toques.js') < pos('orcamento-coerencia.js') && pos('orcamento-coerencia.js') < pos('orcamento-coerencia-tela.js') && pos('orcamento-coerencia-tela.js') < pos('orcamento.js'));
  assert.match(lerFonte('js/orcamento.js'), /window\.BZOrcCoerenciaTela\.atualizar\(E\)/);
  assert.match(lerFonte('js/orcamento-toques.js'), /trocarRamo: function \(ramo\)/);
});
