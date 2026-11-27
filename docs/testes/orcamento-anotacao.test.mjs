/* MAPA VIVO v2, fase 1b NA PÁGINA: js/orcamento-anotacao.js (BZOrcAnotacao) num DOM de mentira, com relógio falso e uma API de mentira que conta
   as chamadas de `reagir`. O que se prova (aceites da especificação e da revisão de segurança do PR #274):
   - sem reacao: true no estado: nada criado, nenhum ouvinte, nenhuma chamada (a tela é a de hoje);
   - LGPD: o aviso (Anthropic, fora do Brasil, não guardamos, contatos viram marcadores) está na tela ANTES da 1ª chamada; "Desligar" fica guardado
     no aparelho e, desligada, nenhuma chamada sai (nem numa página nova); a anotação é rotulada como IA e entra por textContent;
   - o porteiro: 25 caracteres, 700 ms de pausa, 15 novos, 3 por mensagem, 12 por conversa, sem sessão não chama, só o final de 400 caracteres;
   - aceite 8: resposta velha (seq menor) não troca a linha;
   - "Não é isso" tira a linha; no envio a anotação vira a 1ª linha do cartão de espera; o que chega durante o envio é ignorado;
   - a reação simulada da prévia passa pela conferência de verdade;
   - fonte e página: sem innerHTML, sem flecha nem let/const (ES5), o script depois do da 1a e antes do orcamento.js, o CSS ligado, a chamada no render.
   node --test docs/testes/orcamento-anotacao.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { criarJanela } from './planta-dom-falso.mjs';
import { reacaoSimulada } from '../../api/_ia/simulado.mjs';
import { conferirReacao, montarPedidoReacao } from '../../api/_vendas/reacao.mjs';

const require = createRequire(import.meta.url);
const Anotacao = require('../../js/orcamento-anotacao.js');
const lerFonte = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const esvaziar = () => new Promise((r) => setImmediate(r));

function ambiente({ reduzido = false, guardado = {}, comSessao = true, comFileira = true } = {}) {
  const w = criarJanela({ largura: 390, reduzido });
  const doc = w.document;
  const ids = {};
  const novo = (tag, id) => { const n = doc.createElement(tag); if (id) { n.id = id; ids[id] = n; } return n; };
  const ligadoNaColuna = (n) => { while (n && n !== coluna) n = n.pai; return n === coluna; };
  doc.getElementById = (id) => ids[id] || doc.todos.find((n) => n.id === id && ligadoNaColuna(n)) || null;
  const coluna = novo('div');
  const pensando = novo('p', 'o-pensando'); pensando.appendChild(doc.createTextNode('Analisando o seu caso…')); coluna.appendChild(pensando);
  if (comFileira) coluna.appendChild(novo('ul', 'o-reacao'));
  const form = novo('form', 'o-form'); coluna.appendChild(form);
  const campo = novo('textarea', 'o-texto'); form.appendChild(campo);
  campo.value = '';
  const loja = Object.assign({}, guardado);
  w.localStorage = { getItem: (k) => (k in loja ? loja[k] : null), setItem: (k, v) => { loja[k] = String(v); }, removeItem: (k) => { delete loja[k]; } };
  const avisos = [];
  w.console = { warn: (...a) => avisos.push(a.join(' ')) };
  const chamadas = [];
  w.BZOrcamento = {
    temSessao: () => comSessao,
    reagir: (texto, seq) => new Promise((resolver) => { chamadas.push({ texto, seq, resolver }); })
  };
  const api = Anotacao.criar(w);
  const digitar = (t) => { campo.value = t; campo.disparar('input'); };
  const caixa = () => coluna.children.find((n) => n.classList.contains('orc-anota')) || null;
  const rotulo = () => { const c = caixa(); return c ? c.children[0].children[0].textContent : ''; };
  const corpo = () => { const c = caixa(); return c && c.children[1] ? c.children[1].textContent.replace(/ /g, ' ') : ''; };
  const botoes = () => { const c = caixa(); return c ? c.children[0].children[1].children : []; };
  const tocar = (texto) => { const b = botoes().find((n) => n.textContent === texto); assert.ok(b, 'botão ' + texto); b.disparar('click'); };
  const pensar = (ativo) => (doc.ouvintes['bz:pensando'] || []).forEach((f) => f({ type: 'bz:pensando', detail: { ativo } }));
  return { w, doc, ids, coluna, form, campo, pensando, api, chamadas, avisos, loja, digitar, caixa, rotulo, corpo, botoes, tocar, pensar };
}
const LIGADA = { reacao: true, planta_editavel: true, mensagens: [], conversa: { id: 'c1' } };
const TEXTO = 'Tenho uma clínica de odontologia em Niterói e quero mais agendamentos';

test('sem reacao no estado: nada criado, nenhum ouvinte, nenhuma chamada', async () => {
  const a = ambiente();
  a.api.atualizar({ planta_editavel: true, mensagens: [] });
  a.api.atualizar(null);
  assert.equal(a.caixa(), null);
  assert.equal((a.campo.ouvintes.input || []).length, 0);
  a.campo.value = TEXTO; a.campo.disparar('input'); a.w.avancar(2000);
  assert.equal(a.chamadas.length, 0);
});

test('LGPD: o aviso está na tela antes da 1ª chamada, acima das peças da 1a', async () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  const c = a.caixa();
  assert.ok(c, 'o lugar nasce');
  assert.ok(a.coluna.filhos.indexOf(c) < a.coluna.filhos.indexOf(a.ids['o-reacao']), 'acima da fileira de peças');
  assert.equal(a.rotulo(), 'Anotação ao vivo');
  assert.match(a.corpo(), /Anthropic/);
  assert.match(a.corpo(), /fora do Brasil/);
  assert.match(a.corpo(), /Não guardamos o texto/);
  assert.match(a.corpo(), /contatos viram marcadores/);
  const textos = a.botoes().map((b) => b.textContent);
  assert.deepEqual(textos, ['Saiba mais', 'Desligar']);
  assert.equal(a.botoes()[0].getAttribute('href'), 'privacidade.html#orcamento');
  assert.equal(a.chamadas.length, 0, 'mostrar o aviso não chama nada');
  assert.equal(a.doc.getElementById('o-anota-viva').getAttribute('aria-live'), 'polite');
});

test('o porteiro: 25 caracteres, 700 ms, 15 novos, 3 por mensagem, final de 400', async () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.digitar('Tenho uma clínica'); a.w.avancar(1000);
  assert.equal(a.chamadas.length, 0, 'menos de 25 caracteres');
  a.digitar(TEXTO); a.w.avancar(600);
  assert.equal(a.chamadas.length, 0, 'antes dos 700 ms');
  a.w.avancar(100);
  assert.equal(a.chamadas.length, 1);
  assert.equal(a.chamadas[0].texto, TEXTO);
  assert.equal(a.chamadas[0].seq, 1);
  a.digitar(TEXTO + ' no sábado'); a.w.avancar(700);
  assert.equal(a.chamadas.length, 1, 'menos de 15 caracteres novos');
  a.digitar(TEXTO + ' no sábado e no domingo à tarde'); a.w.avancar(700);
  a.digitar(TEXTO + ' no sábado e no domingo à tarde, e também pelo Instagram'); a.w.avancar(700);
  assert.equal(a.chamadas.length, 3);
  a.digitar(TEXTO + ' no sábado e no domingo à tarde, e também pelo Instagram e pelo WhatsApp da recepção'); a.w.avancar(700);
  assert.equal(a.chamadas.length, 3, 'no máximo 3 por mensagem');
  const b = ambiente();
  b.api.atualizar(LIGADA);
  const longo = 'a'.repeat(300) + ' ' + 'b'.repeat(300);
  b.digitar(longo); b.w.avancar(700);
  assert.equal(b.chamadas[0].texto, longo.slice(-400));
});

test('sem sessão não chama; 12 por conversa', async () => {
  const a = ambiente({ comSessao: false });
  a.api.atualizar(LIGADA);
  a.digitar(TEXTO); a.w.avancar(700);
  assert.equal(a.chamadas.length, 0);
  const b = ambiente();
  b.api.atualizar(LIGADA);
  for (let i = 0; i < 14; i++) {
    b.digitar(TEXTO + ' ' + 'x'.repeat(16 * (i % 3 + 1)) + i); b.w.avancar(700);
    if (i % 3 === 2) { b.pensar(true); b.pensar(false); }   /* (uma mensagem nova a cada 3) */
  }
  assert.equal(b.chamadas.length, 12);
});

test('a anotação: rotulada como IA, letra a letra, a frase inteira para o leitor de tela', async () => {
  const a = ambiente();
  a.api.atualizar(LIGADA);
  a.digitar(TEXTO); a.w.avancar(700);
  a.chamadas[0].resolver({ reacao: { anotacao: 'clínica de odontologia em Niterói, quer mais agendamentos' }, seq: 1, motivo: 'ok' });
  await esvaziar();
  assert.equal(a.rotulo(), 'O Zero (IA) anotou:');
  assert.ok(a.corpo().length < 10, 'começa pelas primeiras letras');
  a.w.avancar(3000);
  assert.equal(a.corpo(), 'clínica de odontologia em Niterói, quer mais agendamentos');
  assert.equal(a.doc.getElementById('o-anota-viva').textContent, 'O Zero (IA) anotou: clínica de odontologia em Niterói, quer mais agendamentos');
  assert.deepEqual(a.botoes().map((b) => b.textContent), ['Não é isso', 'Desligar']);
  const r = ambiente({ reduzido: true });
  r.api.atualizar(LIGADA);
  r.digitar(TEXTO); r.w.avancar(700);
  r.chamadas[0].resolver({ reacao: { anotacao: 'clínica em Niterói' }, seq: 1 });
  await esvaziar();
  assert.equal(r.corpo(), 'clínica em Niterói', 'movimento reduzido: de uma vez');
});

test('aceite 8: resposta velha (seq menor) não troca a linha', async () => {
  const a = ambiente({ reduzido: true });
  a.api.atualizar(LIGADA);
  a.digitar(TEXTO); a.w.avancar(700);
  a.digitar(TEXTO + ' e no Instagram da clínica'); a.w.avancar(700);
  assert.equal(a.chamadas.length, 2);
  a.chamadas[1].resolver({ reacao: { anotacao: 'clínica em Niterói, quer agendamentos pelo Instagram' }, seq: 2 });
  await esvaziar();
  a.chamadas[0].resolver({ reacao: { anotacao: 'clínica em Niterói' }, seq: 1 });
  await esvaziar();
  assert.equal(a.corpo(), 'clínica em Niterói, quer agendamentos pelo Instagram');
  /* resposta sem frase, ou falha da rede: a linha que está fica, e nenhum erro */
  a.digitar(TEXTO + ' e no Instagram da clínica, e pelo WhatsApp'); a.w.avancar(700);
  a.chamadas[2].resolver({ reacao: null, seq: 3, motivo: 'teto' });
  await esvaziar();
  assert.equal(a.corpo(), 'clínica em Niterói, quer agendamentos pelo Instagram');
  assert.equal(a.avisos.length, 0);
});

test('"Não é isso" tira a linha e volta ao aviso; nada vai para o cartão de espera', async () => {
  const a = ambiente({ reduzido: true });
  a.api.atualizar(LIGADA);
  a.digitar(TEXTO); a.w.avancar(700);
  a.chamadas[0].resolver({ reacao: { anotacao: 'clínica em Niterói' }, seq: 1 });
  await esvaziar();
  a.tocar('Não é isso');
  assert.equal(a.rotulo(), 'Anotação ao vivo');
  assert.equal(a.doc.ativo, a.campo, 'o foco volta para a caixa');
  a.pensar(true);
  assert.equal(a.pensando.children.length, 0);
});

test('no envio a anotação vira a 1ª linha do cartão de espera; o que chega no envio é ignorado', async () => {
  const a = ambiente({ reduzido: true });
  a.api.atualizar(LIGADA);
  a.digitar(TEXTO); a.w.avancar(700);
  a.chamadas[0].resolver({ reacao: { anotacao: 'clínica em Niterói' }, seq: 1 });
  await esvaziar();
  a.digitar(TEXTO + ' e no Instagram da clínica'); a.w.avancar(700);
  a.pensar(true);
  const linha = a.pensando.filhos[0];
  assert.ok(linha.classList.contains('orc-pensando__anota'));
  assert.equal(linha.textContent, 'O Zero (IA) anotou: clínica em Niterói');
  assert.equal(a.rotulo(), 'Anotação ao vivo', 'o lugar volta ao aviso para a próxima mensagem');
  a.chamadas[1].resolver({ reacao: { anotacao: 'clínica em Niterói, Instagram' }, seq: 2 });
  await esvaziar();
  assert.equal(a.rotulo(), 'Anotação ao vivo', 'a resposta da mensagem que já foi não aparece');
  a.digitar(TEXTO); a.w.avancar(700);
  assert.equal(a.chamadas.length, 2, 'durante o envio não chama');
  a.pensar(false);
  assert.equal(a.pensando.children.length, 0, 'a linha sai do cartão junto com ele');
});

test('LGPD: "Desligar" fica no aparelho; desligada, nenhuma chamada, nem numa página nova; "Ligar" volta', async () => {
  const a = ambiente({ reduzido: true });
  a.api.atualizar(LIGADA);
  a.digitar(TEXTO); a.w.avancar(700);
  a.tocar('Desligar');
  assert.equal(a.loja[Anotacao.CHAVE], 'desligada');
  assert.equal(a.rotulo(), 'Anotação ao vivo desligada.');
  a.chamadas[0].resolver({ reacao: { anotacao: 'clínica em Niterói' }, seq: 1 });
  await esvaziar();
  assert.equal(a.rotulo(), 'Anotação ao vivo desligada.', 'o que estava a caminho não aparece');
  a.digitar(TEXTO + ' e no Instagram da clínica'); a.w.avancar(2000);
  assert.equal(a.chamadas.length, 1);
  const b = ambiente({ guardado: { [Anotacao.CHAVE]: 'desligada' } });
  b.api.atualizar(LIGADA);
  assert.equal(b.rotulo(), 'Anotação ao vivo desligada.');
  b.digitar(TEXTO); b.w.avancar(2000);
  assert.equal(b.chamadas.length, 0, 'página nova: segue desligada');
  b.tocar('Ligar');
  assert.equal(b.loja[Anotacao.CHAVE], undefined);
  b.digitar(TEXTO + ' de novo'); b.w.avancar(700);
  assert.equal(b.chamadas.length, 1);
});

test('reacao some do estado: o lugar, o ouvinte e a linha do cartão saem', async () => {
  const a = ambiente({ reduzido: true });
  a.api.atualizar(LIGADA);
  a.api.atualizar({ planta_editavel: true, mensagens: [] });
  assert.equal(a.caixa(), null);
  assert.equal((a.campo.ouvintes.input || []).length, 0);
  a.api.atualizar(LIGADA);
  const form = a.form; form.hidden = true;
  a.api.atualizar(LIGADA);
  assert.equal(a.caixa().hidden, true, 'sem caixa, sem linha');
});

test('a reação simulada da prévia passa pela conferência de verdade', () => {
  const r = reacaoSimulada(montarPedidoReacao(TEXTO + '!'));
  const c = conferirReacao(r.json, TEXTO + '!');
  assert.equal(c.motivo, 'ok');
  assert.equal(c.anotacao, '(simulada) clínica, odontologia, Niterói, agendamentos');
  assert.ok(c.anotacao.length <= 90);
  assert.equal(reacaoSimulada(montarPedidoReacao('')).json.entendeu, false);
});

test('fonte e página: ES5, sem innerHTML, script na ordem, CSS ligado, chamada no render, API sem abrir sessão', () => {
  const js = lerFonte('js/orcamento-anotacao.js');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|outerHTML/);
  const codigo = js.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(codigo, /=>|\blet\b|\bconst\b|`/);
  const html = lerFonte('orcamento.html');
  const i1a = html.indexOf('js/orcamento-reacao.js'), i1b = html.indexOf('js/orcamento-anotacao.js'), iOrc = html.indexOf('js/orcamento.js"');
  assert.ok(i1a > 0 && i1b > i1a && iOrc > i1b, 'o script da 1b depois do da 1a e antes do orcamento.js');
  assert.match(html, /css\/orcamento-anotacao\.css/);
  assert.match(lerFonte('js/orcamento.js'), /BZOrcAnotacao\.atualizar\(E\)/);
  const reagir = /reagir: function \(texto, seq\) \{[^\n]*\}/.exec(lerFonte('js/orcamento-api.js'));
  assert.ok(reagir, 'a API tem reagir');
  assert.doesNotMatch(reagir[0], /garantirSessao/);
  const css = lerFonte('css/orcamento-anotacao.css');
  assert.match(css, /\.orc-anota__texto \{[^}]*height: calc\(3/, 'altura fixa: a linha não empurra a caixa');
  assert.doesNotMatch(css, /blur/);
  const wr = lerFonte('wrangler.jsonc');
  assert.equal((wr.match(/"BZ_REACAO": "ligada"/g) || []).length, 2, 'ligada só nos dois blocos da prévia');
  const prod = wr.slice(0, wr.indexOf('"env"'));
  assert.doesNotMatch(prod, /BZ_REACAO/, 'a produção não liga');
  const priv = lerFonte('privacidade.html');
  assert.match(priv, /anotação ao vivo/);
  assert.match(priv, /Anthropic, nos Estados Unidos/);
});
