/* A LIGAÇÃO DA PLANTA NA PÁGINA DE ORÇAMENTO (PR 2c; spec §1.2, §1.3, §2.6, §4.4; plano "PR 2c"). js/orcamento-planta.js (BZOrcPlanta) recebe o `estado`
   a cada render(), valida a forma, carrega sob demanda os 4 módulos da planta (lista CONSTANTE de URLs), põe o botão "Ver a planta do seu site" sob a fala
   do Zero que trouxe aquela versão, e só tira a faixa de `hidden` quando ela nasce fora da área visível (ou num gesto da pessoa).
   Tudo num DOM de mentira (docs/testes/planta-dom-falso.mjs) com os módulos REAIS do desenho onde importa.
   node --test docs/testes/planta-ligacao.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Forma from '../../js/orcamento-planta-forma.js';
import Pecas from '../../js/planta-pecas.js';
import Layout from '../../js/planta-layout.js';
import Desenho from '../../js/planta-desenho.js';
import Ligacao from '../../js/orcamento-planta.js';
import { criarJanela } from './planta-dom-falso.mjs';

const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const lerFonte = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MODULOS = ['js/orcamento-planta-forma.js', 'js/planta-pecas.js', 'js/planta-layout.js', 'js/planta-desenho.js'];
const CSS = 'css/orcamento-planta.css';
const TEXTO_CERTO = 'A planta está certa.';

/* o desenho de espia: registra o que a ligação pede, sem desenhar */
function espia() {
  const e = { montar: [], atualizar: [], parar: 0, falha: false, recusar: false };
  e.api = {
    montar(raiz, plano, op) { e.montar.push({ raiz, plano, op }); if (e.falha) throw new Error('boom'); if (e.recusar) return { ok: false, motivos: ['sem_largura'] }; return { ok: true, etapas: plano.etapas.length + 1 }; },
    atualizar(plano, op) { e.atualizar.push({ plano, op }); return { ok: true }; },
    parar() { e.parar++; }
  };
  return e;
}

/* A página de mentira: só o que a ligação toca. Mesa com a base onde o teste mandar; a lista de mensagens (a abertura fixa + as do estado) */
function ambiente({ desenho = 'espia', baixo = true, falhaDeCarga = false, falhaPrimeiraVez = false, semModulos = false } = {}) {
  let jaFalhou = false;
  const w = criarJanela({ reduzido: true, largura: 390, beyon: true });
  const doc = w.document;
  const ids = {};
  const novo = (tag, id, cls) => { const n = doc.createElement(tag); if (id) { n.attrs.id = id; ids[id] = n; } if (cls) n.className = cls; return n; };
  doc.getElementById = (id) => ids[id] || null;
  /* o <main> do fim da página (PR 2c-B): a mesa, o formulário #o-contato (escondido até o pacote ser gravado) e, por último, a faixa. A faixa nasce onde o último bloco visível termina */
  const main = novo('main');
  const mesa = novo('div', null, 'orc-mesa'); main.appendChild(mesa);
  mesa.getBoundingClientRect = () => ({ top: 100, bottom: mesa.base, height: mesa.base - 100, left: 0, right: 390, width: 390 });
  mesa.base = baixo ? 1500 : 600;   /* innerHeight = 800: base 1500 = a faixa nasceria abaixo da dobra; 600 = à vista */
  const contato = novo('section', 'o-contato', 'orc-bloco'); contato.hidden = true; main.appendChild(contato);
  contato.getBoundingClientRect = () => (contato.hidden ? { top: 0, bottom: 0, height: 0 } : { top: mesa.base, bottom: contato.base, height: contato.base - mesa.base });
  contato.base = 2500;
  doc.head = novo('head');
  const faixa = novo('section', 'o-planta'); faixa.hidden = true; faixa.clientWidth = 390; main.appendChild(faixa);
  const caixa = novo('div', 'o-log-caixa'); caixa.scrollHeight = 1000; caixa.clientHeight = 400; caixa.scrollTop = 600;
  const log = novo('ol', 'o-log');
  const abertura = novo('li', null, 'msg msg--agente'); abertura.appendChild(novo('p')); log.appendChild(abertura);
  const texto = novo('textarea', 'o-texto'); texto.placeholder = 'Ex.: tenho uma clínica';
  const form = novo('form', 'o-form');
  /* o carregador: cada <script> anexado ao <head> "baixa" e roda no próximo tick; o teste escolhe o que cada URL entrega */
  const baixados = [];
  const fonte = { 'js/orcamento-planta-forma.js': () => { if (!semModulos) w.BZPlantaForma = Forma; }, 'js/planta-pecas.js': () => { w.BZPlantaPecas = Pecas; }, 'js/planta-layout.js': () => { w.BZPlantaLayout = Layout; },
    'js/planta-desenho.js': () => { w.BZPlanta = desenho === 'real' ? Desenho.criar(w) : espia.atual.api; } };
  const anexar = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = (s) => {
    anexar(s);
    if (String(s.tagName).toLowerCase() === 'link') {   /* o CSS da faixa: também só sob demanda */
      baixados.push(s.href);
      w.setTimeout(() => s.disparar('load'), 0);
      return s;
    }
    if (String(s.tagName).toLowerCase() !== 'script') return s;
    baixados.push(s.src);
    w.setTimeout(() => {
      if ((falhaDeCarga || (falhaPrimeiraVez && !jaFalhou)) && s.src === 'js/planta-layout.js') { jaFalhou = true; s.disparar('error'); return; }
      fonte[s.src]();
      s.disparar('load');
    }, 0);
    return s;
  };
  const espiao = desenho === 'espia' ? espia() : null;
  espia.atual = espiao;
  const avisos = [];
  w.console = { warn: (...a) => avisos.push(a.join(' ')), log() {}, error: (...a) => avisos.push(a.join(' ')) };
  w.innerHeight = 800;
  const L = Ligacao.criar(w);
  const rolou = [], enviou = [];
  const deps = { rolarAte: (el) => rolou.push(el), enviar: (t) => { enviou.push(t); return Promise.resolve(); } };
  return { w, doc, L, faixa, mesa, contato, main, log, caixa, texto, form, abertura, espiao, baixados, avisos, rolou, enviou, deps, ids };
}

/* o estado do servidor com uma planta; mensagens: visitante, Zero, visitante, Zero... (a planta chegou na fala de índice n_mensagens) */
function estado(extra = {}) {
  const mensagens = [];
  for (let i = 0; i < 6; i++) mensagens.push({ papel: i % 2 === 0 ? 'visitante' : 'agente', conteudo: 'fala ' + i });
  return Object.assign({
    conversa: { etapa: 'estimativa', briefing: { negocio: { nome: 'Clínica Aurora' } } },
    mensagens,
    planta: { versao: 1, origem: 'modelo', n_mensagens: 3, plano: fx('clinica') },
    planta_editavel: true
  }, extra);
}
/* faz o que conversa() de js/orcamento.js faz: refaz a lista inteira, mantendo só a abertura fixa */
function redesenharLista(amb, E) {
  [...amb.log.filhos].slice(1).forEach((f) => amb.log.removeChild(f));
  E.mensagens.forEach((m) => { const li = amb.doc.createElement('li'); li.className = 'msg msg--' + (m.papel === 'agente' ? 'agente' : 'visitante'); const p = amb.doc.createElement('p'); p.textContent = m.conteudo; li.appendChild(p); amb.log.appendChild(li); });
}
const prontos = (amb) => { amb.w.avancar(50); };
const botoes = (amb) => amb.log.achar((n) => n._classes.has('plv-ver'));
const scripts = (amb) => amb.doc.head.porTag('script');
const links = (amb) => amb.doc.head.porTag('link');

/* ---------- 1. sem planta, a página é a de hoje ---------- */
test('sem E.planta: a faixa fica escondida, nada é baixado, nenhum ouvinte, nenhum botão (a tela é igual à de hoje)', () => {
  const amb = ambiente();
  redesenharLista(amb, estado());
  const antes = amb.w.document.todos.length;
  for (const E of [null, undefined, {}, estado({ planta: undefined }), estado({ planta: null }), estado({ planta: 'x' }), estado({ planta: [] })]) {
    assert.doesNotThrow(() => amb.L.atualizar(E, amb.deps));
  }
  prontos(amb);
  assert.equal(amb.faixa.hidden, true);
  assert.equal(amb.baixados.length, 0, 'nenhum JS da planta foi baixado');
  assert.equal(scripts(amb).length, 0);
  assert.equal(links(amb).length, 0, 'nem o CSS');
  assert.equal(botoes(amb).length, 0);
  assert.equal(amb.w.document.todos.length, antes, 'nenhum elemento criado');
  assert.equal(Object.keys(amb.w.ouvintes).length, 0, 'nenhum ouvinte na janela');
  assert.equal(Object.keys(amb.doc.ouvintes).length, 0, 'nenhum ouvinte no documento');
  assert.equal(amb.w.pendentes(), 0, 'nenhum temporizador');
});

test('planta_editavel sozinho (flag ligada, sem planta ainda) não muda nada na tela', () => {
  const amb = ambiente();
  amb.L.atualizar(estado({ planta: undefined, planta_editavel: true }), amb.deps);
  prontos(amb);
  assert.equal(amb.faixa.hidden, true);
  assert.equal(amb.baixados.length, 0);
});

/* ---------- 2. planta válida ---------- */
test('planta válida: carrega os 4 módulos na ordem, pela lista constante, UMA vez; a faixa sai de hidden e monta uma vez; o botão aparece uma vez', () => {
  const amb = ambiente();
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps);
  assert.equal(amb.faixa.hidden, true, 'enquanto os módulos não chegam, nada aparece');
  assert.deepEqual(scripts(amb).map((s) => s.src), MODULOS, 'a lista constante, na ordem de dependência');
  assert.ok(scripts(amb).every((s) => s.async === false), 'async=false: a ordem de execução é a da lista');
  amb.L.atualizar(E, amb.deps);   /* um 2º render durante o download não baixa de novo */
  assert.equal(scripts(amb).length, 4);
  assert.deepEqual(links(amb).map((l) => [l.rel, l.href]), [['stylesheet', CSS]], 'o CSS da faixa também vem sob demanda, uma vez, de URL constante');
  prontos(amb);
  assert.equal(amb.faixa.hidden, false);
  assert.equal(amb.espiao.montar.length, 1);
  assert.equal(botoes(amb).length, 1);
  for (let i = 0; i < 3; i++) amb.L.atualizar(E, amb.deps);
  assert.equal(scripts(amb).length, 4, 'nunca baixa de novo');
  assert.equal(links(amb).length, 1, 'nem o CSS');
  assert.equal(amb.espiao.montar.length, 1, 'monta uma vez só');
  assert.equal(botoes(amb).length, 1, 'o botão não duplica');
  const m = amb.espiao.montar[0];
  assert.equal(m.raiz, amb.faixa);
  assert.equal(m.op.origem, 'modelo');
  assert.equal(m.op.editavel, true);
  assert.equal(m.op.nome, 'Clínica Aurora');
});

test('o botão é filho da fala do Zero de índice n_mensagens (a abertura fixa soma 1 à posição) e diz "Ver a planta do seu site"', () => {
  const amb = ambiente();
  const E = estado();   /* n_mensagens 3 = a 4ª mensagem do estado (agente) */
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  const b = botoes(amb)[0];
  assert.equal(b.textContent, 'Ver a planta do seu site');
  assert.equal(b.attrs.type, 'button');
  assert.equal(b.pai, amb.log.filhos[3 + 1], 'DOM: abertura + índice 3');
  assert.equal(b.pai.textContent.includes('fala 3'), true);
  assert.ok(b.pai._classes.has('msg--agente'));
});

test('posição 0 (a fala saiu da janela) cai na 1ª fala do Zero da lista; posição que não é fala do Zero cai na mais próxima antes dela; passar do fim cai na última', () => {
  for (const [n, esperado] of [[0, 2], [1, 2], [2, 2], [99, 6]]) {
    const amb = ambiente();
    const E = estado(); E.planta.n_mensagens = n;
    redesenharLista(amb, E);
    amb.L.atualizar(E, amb.deps); prontos(amb);
    const b = botoes(amb);
    assert.equal(b.length, 1, 'n=' + n);
    assert.equal(b[0].pai, amb.log.filhos[esperado], 'n=' + n);
  }
});

/* ---------- 3. novo turno ---------- */
test('depois de um novo turno a lista é refeita: o botão volta sob a mesma fala e não duplica; versão nova leva o botão para a fala nova e ajusta, sem montar de novo', () => {
  const amb = ambiente();
  let E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  /* turno sem planta nova: dois balões a mais, a lista inteira refeita (o botão antigo se foi junto) */
  E = estado(); E.mensagens.push({ papel: 'visitante', conteudo: 'fala 6' }, { papel: 'agente', conteudo: 'fala 7' });
  redesenharLista(amb, E);
  assert.equal(botoes(amb).length, 0, 'a lista refeita levou o botão');
  amb.L.atualizar(E, amb.deps);
  assert.equal(botoes(amb).length, 1);
  assert.equal(botoes(amb)[0].pai, amb.log.filhos[3 + 1], 'sob a fala da versão 1');
  amb.L.atualizar(E, amb.deps);
  assert.equal(botoes(amb).length, 1, 'idempotente');
  /* versão 2 na fala 7 */
  E.planta = { versao: 2, origem: 'modelo', n_mensagens: 7, plano: (() => { const p = fx('clinica'); p.fecho = 'Fecho novo da versão dois.'; return p; })() };
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps);
  assert.equal(botoes(amb).length, 1, 'um botão só, não um por versão acumulado');
  assert.equal(botoes(amb)[0].pai, amb.log.filhos[7 + 1], 'agora sob a fala da versão 2');
  assert.equal(amb.espiao.montar.length, 1);
  assert.equal(amb.espiao.atualizar.length, 1);
  assert.equal(amb.espiao.atualizar[0].plano.fecho, 'Fecho novo da versão dois.');
  assert.equal(amb.espiao.atualizar[0].op.fala, 'fala 6', 'o que a pessoa pediu (a fala do visitante antes da fala do Zero) vai para a legenda "Você pediu"');
});

test('o botão não tira a conversa do fim: se a lista estava colada no fim, continua', () => {
  const amb = ambiente();
  const E = estado();
  redesenharLista(amb, E);
  amb.caixa.scrollTop = 600;   /* 1000 - 600 - 400 = 0: colada no fim */
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.caixa.scrollTop, amb.caixa.scrollHeight);
});

/* ---------- 4. planta inválida ---------- */
test('planta inválida (forma errada, texto com <, versão ou origem ruins): nada aparece, nada lança, nada é montado', () => {
  const ruim = [];
  const comLt = estado(); comLt.planta.plano.etapas[0].titulo = '<img src=x onerror=alert(1)>'; ruim.push(comLt);
  const semEtapas = estado(); delete semEtapas.planta.plano.etapas; ruim.push(semEtapas);
  const versao = estado(); versao.planta.versao = '1'; ruim.push(versao);
  const origem = estado(); origem.planta.origem = 'outra'; ruim.push(origem);
  const semPlano = estado(); semPlano.planta.plano = 5; ruim.push(semPlano);
  const nMsg = estado(); nMsg.planta.n_mensagens = -1; ruim.push(nMsg);
  const extra = estado(); extra.planta.plano.campo_extra = 1; ruim.push(extra);
  for (const E of ruim) {
    const amb = ambiente();
    redesenharLista(amb, E);
    assert.doesNotThrow(() => amb.L.atualizar(E, amb.deps));
    prontos(amb);
    assert.equal(amb.faixa.hidden, true, JSON.stringify(E.planta).slice(0, 80));
    assert.equal(botoes(amb).length, 0);
    assert.equal((amb.espiao || { montar: [] }).montar.length, 0);
    assert.equal(Object.keys(amb.doc.ouvintes).length, 0, 'sem ouvintes pendurados');
  }
});

/* ---------- 5 e 6. editável e os botões ---------- */
test('planta_editavel false (preço fechado): a planta aparece, mas "Está certo" e "Quero ajustar" ficam desligados e não fazem nada', () => {
  const amb = ambiente({ desenho: 'real' });
  const E = estado({ planta_editavel: false });
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, false, 'planta visível');
  const [certo, ajuste] = amb.faixa.porClasse('plv-btn');
  assert.ok(certo.hasAttribute('disabled') && ajuste.hasAttribute('disabled'));
  certo.disparar('click'); ajuste.disparar('click');
  assert.deepEqual(amb.enviou, [], 'nenhuma mensagem');
  assert.equal(amb.doc.ativo, null, 'o foco não foi para a caixa de texto');
  assert.equal(amb.texto.placeholder, 'Ex.: tenho uma clínica');
});

test('editável vira false depois (o pedido foi confirmado): os botões desligam sem refazer a planta; o callback também recusa', () => {
  const amb = ambiente();
  let E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  const op = amb.espiao.montar[0].op;
  E = estado({ planta_editavel: false });
  amb.L.atualizar(E, amb.deps);
  assert.equal(amb.espiao.atualizar.at(-1).op.editavel, false);
  op.aoCerto(); op.aoAjustar();
  assert.deepEqual(amb.enviou, [], 'mesmo chamando o callback antigo, nada é enviado');
  assert.equal(amb.doc.ativo, null);
});

test('"Está certo" manda exatamente uma mensagem ("A planta está certa.") pelo envio normal; clicar de novo na mesma versão não manda outra; versão nova libera', () => {
  const amb = ambiente();
  let E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  const op = amb.espiao.montar[0].op;
  op.aoCerto(); op.aoCerto();
  assert.deepEqual(amb.enviou, [TEXTO_CERTO]);
  E = estado(); E.planta = Object.assign({}, E.planta, { versao: 2 });
  E.planta.plano = Object.assign({}, E.planta.plano, { fecho: 'Outro fecho para a versão dois.' });
  amb.L.atualizar(E, amb.deps);
  amb.espiao.atualizar.at(-1).op.aoCerto();
  assert.deepEqual(amb.enviou, [TEXTO_CERTO, TEXTO_CERTO]);
});

test('"Quero ajustar algo" não envia nada: foca a caixa de texto e põe a dica "Diga o que mudar na planta."', () => {
  const amb = ambiente();
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  amb.espiao.montar[0].op.aoAjustar();
  assert.deepEqual(amb.enviou, []);
  assert.equal(amb.doc.ativo, amb.texto);
  assert.equal(amb.texto.placeholder, 'Diga o que mudar na planta.');
});

test('sem a função de envio da tela, "Está certo" não lança nem finge que enviou', () => {
  const amb = ambiente();
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, {}); prontos(amb);
  assert.doesNotThrow(() => amb.espiao.montar[0].op.aoCerto());
});

/* ---------- 7. a regra de inserção ---------- */
test('faixa à vista (a mesa termina dentro da tela): NÃO é inserida; o botão do chat fica disponível', () => {
  const amb = ambiente({ baixo: false });
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, true);
  assert.equal(amb.espiao.montar.length, 0);
  assert.equal(botoes(amb).length, 1, 'o botão já está no chat');
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, true, 'novos renders não a inserem');
});

for (const gesto of [['doc', 'click'], ['doc', 'keydown']]) {
  test('faixa à vista: o próximo gesto da pessoa (' + gesto[1] + ') insere (o navegador não conta o deslocamento logo depois de uma ação dela)', () => {
    const amb = ambiente({ baixo: false });
    const E = estado();
    redesenharLista(amb, E);
    amb.L.atualizar(E, amb.deps); prontos(amb);
    assert.equal(amb.faixa.hidden, true);
    amb.doc.disparar(gesto[1]);
    assert.equal(amb.faixa.hidden, false);
    assert.equal(amb.espiao.montar.length, 1);
    amb.doc.disparar(gesto[1]); amb.doc.disparar('click');
    assert.equal(amb.espiao.montar.length, 1, 'uma vez só');
    assert.equal(Object.keys(amb.doc.ouvintes).filter((k) => amb.doc.ouvintes[k].length).length, 0, 'os ouvintes de gesto saem depois de inserir');
  });
}

test('faixa à vista: a pessoa rola e a posição da faixa passa para baixo da dobra; ao parar de rolar ela é inserida', () => {
  const amb = ambiente({ baixo: false });
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  amb.mesa.base = 1500;
  amb.w.disparar('scroll');
  assert.equal(amb.faixa.hidden, true, 'o debounce ainda não passou');
  amb.w.avancar(400);
  assert.equal(amb.faixa.hidden, false);
  assert.equal(amb.espiao.montar.length, 1);
});

test('tocar em "Ver a planta do seu site": insere se preciso, rola até a faixa pela rolagem existente da tela (rolarAte) e leva o foco ao título', () => {
  const amb = ambiente({ baixo: false, desenho: 'real' });
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, true);
  botoes(amb)[0].disparar('click');
  assert.equal(amb.faixa.hidden, false);
  assert.deepEqual(amb.rolou, [amb.faixa], 'rolarAte(faixa), uma vez');
  const h2 = amb.faixa.porClasse('plv-titulo')[0];
  assert.equal(amb.doc.ativo, h2);
  assert.equal(h2.attrs.tabindex, '-1');
  botoes(amb)[0].disparar('click');
  assert.equal(amb.rolou.length, 2, 'com a faixa já na tela o botão só rola');
});

test('abaixo da dobra com a faixa já inserida: o botão rola e não monta de novo', () => {
  const amb = ambiente();
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  botoes(amb)[0].disparar('click');
  assert.equal(amb.espiao.montar.length, 1);
  assert.equal(amb.rolou.length, 1);
});

/* ---------- 8. falha fechada ---------- */
test('se o desenho lança ao montar: a faixa volta a hidden, o visitante não vê nada, o log tem [beyon] e o render não quebra', () => {
  const amb = ambiente();
  amb.espiao.falha = true;
  const E = estado();
  redesenharLista(amb, E);
  assert.doesNotThrow(() => { amb.L.atualizar(E, amb.deps); prontos(amb); });
  assert.equal(amb.faixa.hidden, true);
  assert.equal(botoes(amb).length, 0, 'sem faixa, sem botão que leva a ela');
  assert.ok(amb.avisos.some((a) => a.startsWith('[beyon] planta')), amb.avisos.join('|'));
  assert.doesNotThrow(() => amb.L.atualizar(E, amb.deps));
});

test('se um módulo não carrega: nada aparece, [beyon] no log, não tenta de novo no mesmo render; versão nova tenta outra vez', () => {
  const amb = ambiente({ falhaDeCarga: true });
  let E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, true);
  assert.equal(botoes(amb).length, 0);
  assert.ok(amb.avisos.some((a) => a.startsWith('[beyon] planta')));
  const n = scripts(amb).length;
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(scripts(amb).length, n, 'a mesma versão não repete a tentativa');
  E = estado(); E.planta = Object.assign({}, E.planta, { versao: 2 });
  amb.L.atualizar(E, amb.deps);
  assert.ok(scripts(amb).length > n, 'versão nova, nova tentativa');
});

test('a planta some do estado (flag desligada, conversa nova): a faixa esconde, o desenho para, o botão e os ouvintes saem', () => {
  const amb = ambiente({ baixo: false });
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  amb.doc.disparar('click');
  assert.equal(amb.faixa.hidden, false);
  amb.L.atualizar(estado({ planta: undefined }), amb.deps);
  assert.equal(amb.faixa.hidden, true);
  assert.equal(amb.espiao.parar, 1);
  assert.equal(botoes(amb).length, 0);
  /* e volta a nascer se a planta volta */
  amb.L.atualizar(estado(), amb.deps);
  assert.equal(botoes(amb).length, 1);
});

/* ---------- integração com os módulos reais ---------- */
test('com o desenho real: a faixa monta (título, lista, status), o texto do modelo entra por textContent e "Está certo" de verdade manda uma mensagem', () => {
  const amb = ambiente({ desenho: 'real' });
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, false);
  assert.equal(amb.faixa.porClasse('plv-titulo')[0].textContent, 'A planta do seu site');
  assert.ok(amb.faixa.porClasse('plv-quadro')[0].porTag('li').length >= 8);
  assert.ok(amb.faixa.porClasse('plv-status')[0].textContent.startsWith('Planta pronta, com '));
  const [certo, ajuste] = amb.faixa.porClasse('plv-btn');
  assert.ok(!certo.hasAttribute('disabled'));
  certo.disparar('click');
  assert.deepEqual(amb.enviou, [TEXTO_CERTO]);
  ajuste.disparar('click');
  assert.equal(amb.doc.ativo, amb.texto);
  assert.equal(amb.enviou.length, 1);
});

test('com o desenho real, o ajuste (versão 2 com etapa nova) marca só o id novo', () => {
  const amb = ambiente({ desenho: 'real' });
  let E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  const p2 = fx('clinica');
  p2.etapas.splice(2, 0, Object.assign({}, p2.etapas[0], { id: 'sinal1', titulo: 'Sinal para segurar o horário', frase: 'A pessoa paga um sinal para garantir o horário.' }));
  p2.etapas = p2.etapas.slice(0, 8);
  E = estado(); E.mensagens.push({ papel: 'visitante', conteudo: 'quero cobrar um sinal' }, { papel: 'agente', conteudo: 'Refiz a planta.' });
  E.planta = { versao: 2, origem: 'modelo', n_mensagens: 7, plano: p2 };
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps);
  const novos = amb.faixa.achar((n) => n._classes.has('is-ajustado') && n.tagName.toLowerCase() === 'li');
  assert.deepEqual(novos.map((n) => n.dataset.id), ['sinal1']);
  assert.equal(amb.faixa.porClasse('plv-leitura__tag')[0].textContent, 'Ajustado', 'sem movimento a legenda mostra o fim; a fala vai ao desenho em opcoes.fala (teste do espião acima)');
});

/* ---------- o que o código-fonte não pode ter ---------- */
const FONTE = lerFonte('js/orcamento-planta.js');
const semComentarios = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

test('fonte: nada de innerHTML, eval, estilo inline, rAF, escrita de HTML; src só da lista constante', () => {
  for (const [nome, re] of [['innerHTML', /\binnerHTML\b/], ['outerHTML', /\bouterHTML\b/], ['insertAdjacentHTML', /insertAdjacentHTML/], ['document.write', /document\s*\.\s*write/], ['eval', /\beval\s*\(/], ['new Function', /new\s+Function/],
    ['setAttribute style', /setAttribute\s*\(\s*['"]style/], ['cssText', /cssText/], ['rAF', /requestAnimationFrame/], ['querySelector com concatenação', /querySelector(All)?\s*\([^)]*\+/]]) {
    assert.doesNotMatch(semComentarios, re, nome);
  }
  const srcs = semComentarios.match(/\.src\s*=[^=][^;]*/g) || [];
  assert.equal(srcs.length, 1, 'uma atribuição de src só');
  assert.match(srcs[0], /\.src\s*=\s*url$/, 'vinda do argumento de anexar()');
  const hrefs = semComentarios.match(/\.href\s*=[^=][^;]*/g) || [];
  assert.equal(hrefs.length, 1, 'uma atribuição de href só');
  assert.match(hrefs[0], /\.href\s*=\s*CSS_DA_FAIXA/, 'vinda da constante');
  assert.match(semComentarios, /var CSS_DA_FAIXA = 'css\/orcamento-planta\.css';/);
  /* o argumento url só nasce de duas chamadas: a lista constante de módulos e a constante do CSS */
  assert.equal((semComentarios.match(/\banexar\(/g) || []).length, 2, 'a definição e uma chamada');
  assert.match(semComentarios, /anexar\(lista\[i\]\[0\], lista\[i\]\[1\], fim\)/);
  assert.match(semComentarios, /lista\.push\(\[CSS_DA_FAIXA, 'link'\]\)/);
  assert.match(semComentarios, /lista\.push\(\[MODULOS\[i\], 'script'\]\)/);
  assert.equal((semComentarios.match(/lista\.push\(/g) || []).length, 2, 'só essas duas entradas');
  const lista = semComentarios.match(/var MODULOS = \[([^\]]*)\]/);
  assert.ok(lista, 'a lista constante existe');
  assert.deepEqual(lista[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')), MODULOS);
});

test('fonte: ES5 sintático (sem =>, const, let, crase, classe, async)', () => {
  for (const [nome, re] of [['seta', /=>/], ['const', /\bconst\b/], ['let', /\blet\b/], ['crase', /`/], ['class', /\bclass\b/], ['async', /(^|[^.\w])async\b/], ['await', /\bawait\b/], ['spread', /\.\.\./], ['Promise', /\bPromise\b/], ['?.', /\?\./], ['??', /\?\?/]]) {
    assert.doesNotMatch(semComentarios.replace(/'[^'\n]*'/g, "''"), re, nome);
  }
});

test('fonte: nenhum texto do estado vira HTML; textos fixos da tela são as constantes combinadas', () => {
  assert.match(FONTE, /A planta está certa\./);
  assert.match(FONTE, /Diga o que mudar na planta\./);
  assert.match(FONTE, /Ver a planta do seu site/);
  assert.match(FONTE, /\[beyon\] planta/);
});

/* ---------- a página ---------- */
const HTML = lerFonte('orcamento.html');
test('orcamento.html: a faixa é uma <section id="o-planta" hidden> sem style="", e o script da ligação vem antes do orcamento.js', () => {
  const i = HTML.indexOf('id="o-planta"');
  assert.ok(i > 0 && HTML.indexOf('id="o-planta"', i + 1) < 0, 'uma faixa só');
  const tag = HTML.slice(HTML.lastIndexOf('<', i), HTML.indexOf('>', i) + 1);
  assert.match(tag, /^<section\b/);
  assert.match(tag, /\bhidden\b/);
  assert.doesNotMatch(tag, /\bstyle\s*=/);
  const a = HTML.indexOf('src="js/orcamento-planta.js"'), b = HTML.indexOf('src="js/orcamento.js"');
  assert.ok(a > 0 && a < b, 'a ligação carrega antes de orcamento.js');
  assert.match(HTML.slice(HTML.lastIndexOf('<script', a), HTML.indexOf('>', a) + 1), /\bdefer\b/);
  assert.ok(!HTML.includes('orcamento-planta.css'), 'o CSS NÃO bloqueia a renderização da página: a ligação o baixa junto com os módulos, só quando a planta chega');
  for (const m of MODULOS) assert.ok(!HTML.includes(m), 'o HTML NÃO carrega ' + m + ': só sob demanda');
});

test('js/orcamento.js: uma linha chama a ligação, protegida por if, no render(), e passa rolarAte e enviar', () => {
  const src = lerFonte('js/orcamento.js');
  const linhas = src.split('\n').filter((l) => l.includes('BZOrcPlanta'));
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /if \(window\.BZOrcPlanta\) window\.BZOrcPlanta\.atualizar\(E, \{ rolarAte: rolarAte, enviar: enviar \}\);/);
  const render = src.slice(src.indexOf('function render()'), src.indexOf('async function recarregar()'));
  assert.ok(render.includes('BZOrcPlanta'), 'a chamada está dentro do render()');
  assert.ok(render.indexOf('conversa();') < render.indexOf('BZOrcPlanta'), 'depois de conversa() (a lista de mensagens já está refeita)');
});

/* ---------- o servidor local ---------- */
test('docs/servidor.mjs liga BZ_PLANTA no servidor local, salvo BZ_PLANTA_LOCAL=desligada (mesmo desenho de BZ_ENTREGA_LOCAL)', () => {
  const src = lerFonte('docs/servidor.mjs');
  assert.match(src, /if \(process\.env\.BZ_PLANTA_LOCAL !== 'desligada'\) process\.env\.BZ_PLANTA = 'ligada'; else delete process\.env\.BZ_PLANTA;/);
  assert.ok(src.indexOf('BZ_PLANTA_LOCAL') < src.indexOf("await import('./banco-local.mjs')"), 'a flag vale antes de o agente de vendas local subir');
});


/* ======================================================================================================================================================
   Rodada de correção depois das revisões do 2c (code-reviewer + security-reviewer, 05/11)
   ====================================================================================================================================================== */
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const clicarCerto = (amb) => amb.espiao.montar[0].op.aoCerto();
function pronto(amb, E) { redesenharLista(amb, E); amb.L.atualizar(E, amb.deps); prontos(amb); }

test('achado 1: "Está certo" com a conversa ocupada (enviar recusou) NÃO gasta a versão: o próximo clique manda', async () => {
  const amb = ambiente();
  const respostas = [false, true];
  amb.deps.enviar = (t) => { amb.enviou.push(t); return Promise.resolve(respostas.shift()); };
  pronto(amb, estado());
  clicarCerto(amb); await tick();
  assert.equal(amb.enviou.length, 1, 'o 1º clique chamou o envio, que recusou (a conversa estava ocupada)');
  clicarCerto(amb); await tick();
  assert.equal(amb.enviou.length, 2, 'a versão não foi gasta: o 2º clique manda');
  clicarCerto(amb); await tick();
  assert.equal(amb.enviou.length, 2, 'aceito, a versão está gasta: o 3º clique não manda');
});

test('achado 1: dois cliques seguidos (o 1º ainda no ar) mandam uma vez só; falha de rede libera de novo', async () => {
  const amb = ambiente();
  let solta; const noAr = new Promise((r) => { solta = r; });
  const fila = [noAr, Promise.resolve(true)];
  amb.deps.enviar = (t) => { amb.enviou.push(t); return fila.shift(); };
  pronto(amb, estado());
  clicarCerto(amb); clicarCerto(amb);
  assert.equal(amb.enviou.length, 1, 'dois cliques seguidos: um envio');
  solta(false); await tick();   /* a rede falhou: o texto volta à caixa e o envio devolve false */
  clicarCerto(amb); await tick();
  assert.equal(amb.enviou.length, 2, 'depois da falha o botão manda de novo');
  clicarCerto(amb); await tick();
  assert.equal(amb.enviou.length, 2);
});

test('achado 1: envio que rejeita ou lança libera a versão e deixa aviso [beyon], sem estourar', async () => {
  for (const modo of ['rejeita', 'lanca']) {
    const amb = ambiente();
    let n = 0;
    amb.deps.enviar = (t) => { amb.enviou.push(t); n++; if (n === 1) { if (modo === 'lanca') throw new Error('boom'); return Promise.reject(new Error('rede')); } return Promise.resolve(true); };
    pronto(amb, estado());
    assert.doesNotThrow(() => clicarCerto(amb));
    await tick();
    assert.ok(amb.avisos.some((a) => a.startsWith('[beyon] planta')), modo + ': ' + amb.avisos.join('|'));
    clicarCerto(amb); await tick();
    assert.equal(amb.enviou.length, 2, modo + ': liberou');
  }
});

test('achado 1: um envio que não devolve nada (função antiga) conta como aceito', async () => {
  const amb = ambiente();
  amb.deps.enviar = (t) => { amb.enviou.push(t); };
  pronto(amb, estado());
  clicarCerto(amb); await tick(); clicarCerto(amb); await tick();
  assert.equal(amb.enviou.length, 1);
});

test('achado 1 (fonte): enviar() de js/orcamento.js diz se aceitou: false com a conversa ocupada e quando falhou sem gravar, true quando o turno entrou', () => {
  const src = lerFonte('js/orcamento.js');
  const corpo = src.slice(src.indexOf('async function enviar(texto)'), src.indexOf('async function falhaNoEnvio'));
  assert.match(corpo, /if \(enviando\) return false;/);
  assert.match(corpo, /return await falhaNoEnvio\(e, texto, minha, antes\);/);
  assert.match(corpo, /\n    return true;\n  \}/, 'o fim do envio feliz devolve true');
  const falha = src.slice(src.indexOf('async function falhaNoEnvio'), src.indexOf('async function reenviar'));
  assert.match(falha, /var gravada = visitantesNoServidor\(\) > antes;/);
  assert.equal((falha.match(/return gravada;/g) || []).length, 4, 'toda saída de falhaNoEnvio devolve se o turno entrou');
  assert.doesNotMatch(falha, /return avisarSessao\(\)|return;/);
});

test('achado 2: planta recusada pela forma esconde, mas não repete o aviso a cada render', () => {
  const amb = ambiente();
  const E = estado(); E.planta.plano.etapas[0].titulo = '<img src=x>';
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  for (let i = 0; i < 5; i++) amb.L.atualizar(E, amb.deps);
  assert.equal(amb.avisos.filter((a) => /recusada pela forma/.test(a)).length, 1, amb.avisos.join('|'));
  assert.equal(amb.faixa.hidden, true); assert.equal(botoes(amb).length, 0);
  /* planta nova e boa: volta a valer */
  const boa = estado(); boa.planta.versao = 2;
  redesenharLista(amb, boa);
  amb.L.atualizar(boa, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, false);
});

test('achado 2: módulos incompletos avisam uma vez, não a cada render', () => {
  const amb = ambiente({ semModulos: true });
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  for (let i = 0; i < 5; i++) amb.L.atualizar(E, amb.deps);
  assert.equal(amb.avisos.filter((a) => /módulos incompletos/.test(a)).length, 1, amb.avisos.join('|'));
  assert.equal(amb.faixa.hidden, true);
});

test('achado 3: montar que recusa (ok:false) duas vezes mata o botão e os ouvintes; não tenta a cada gesto', () => {
  const amb = ambiente({ baixo: false });
  amb.espiao.recusar = true;
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(botoes(amb).length, 1, 'a 1ª tentativa ainda não aconteceu: o botão está lá');
  amb.doc.disparar('click');
  assert.equal(amb.espiao.montar.length, 1, '1ª recusa');
  assert.equal(botoes(amb).length, 1, 'uma recusa só: pode ser só uma janela sem largura');
  amb.doc.disparar('click');
  assert.equal(amb.espiao.montar.length, 2, '2ª recusa');
  assert.equal(botoes(amb).length, 0, 'na 2ª o botão morto sai');
  assert.equal(Object.keys(amb.doc.ouvintes).filter((k) => amb.doc.ouvintes[k].length).length, 0, 'e os ouvintes de gesto também');
  amb.doc.disparar('click'); amb.doc.disparar('keydown'); amb.L.atualizar(E, amb.deps);
  assert.equal(amb.espiao.montar.length, 2, 'não tenta mais');
  assert.equal(amb.faixa.hidden, true);
  /* uma versão nova do plano zera a conta */
  amb.espiao.recusar = false;
  const E2 = estado(); E2.planta.versao = 2; E2.planta.plano.fecho = 'Outro fecho, plano novo, vale tentar.';
  redesenharLista(amb, E2);
  amb.L.atualizar(E2, amb.deps); amb.doc.disparar('click');
  assert.equal(amb.faixa.hidden, false);
});

test('achado 4: a nova tentativa depois de uma falha de download baixa só o que falta (do módulo que falhou em diante) e tira o elemento que falhou', () => {
  const amb = ambiente({ falhaPrimeiraVez: true });
  let E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(scripts(amb).length, 3, 'o elemento que falhou já saiu do <head>');
  assert.equal(amb.faixa.hidden, true);
  E = estado(); E.planta = Object.assign({}, E.planta, { versao: 2 });
  amb.L.atualizar(E, amb.deps);
  assert.deepEqual(amb.baixados.slice(5), ['js/planta-layout.js', 'js/planta-desenho.js'], 'só o que falhou e o que vem depois dele (o desenho lê os outros ao carregar): ' + amb.baixados.join(','));
  assert.equal(links(amb).length, 1, 'o CSS que já chegou não vem de novo');
  prontos(amb);
  const srcs = scripts(amb).map((x) => x.src);
  assert.equal(srcs.filter((x) => x === 'js/planta-layout.js').length, 1, 'o elemento que falhou saiu do <head>: ' + srcs.join(','));
  assert.equal(srcs.filter((x) => x === 'js/orcamento-planta-forma.js').length, 1);
  assert.equal(amb.faixa.hidden, false);
  assert.equal(amb.espiao.montar.length, 1);
});

test('achado 4: com módulo ainda no ar, outro render não anexa nada', () => {
  const amb = ambiente({ falhaPrimeiraVez: true });
  let E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps);   /* nada rodou ainda: todos no ar */
  E = estado(); E.planta = Object.assign({}, E.planta, { versao: 2 });
  amb.L.atualizar(E, amb.deps);
  assert.equal(scripts(amb).length, 4, 'enquanto baixa, outro render não anexa nada');
  prontos(amb);
});

test('achado 5: a planta some do estado enquanto os módulos baixam: ao chegarem, nada é montado e não sobra botão', () => {
  const amb = ambiente();
  const E = estado();
  redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps);
  amb.L.atualizar(estado({ planta: undefined }), amb.deps);
  prontos(amb);
  assert.equal(amb.faixa.hidden, true);
  assert.equal(amb.espiao.montar.length, 0);
  assert.equal(botoes(amb).length, 0);
  assert.equal(Object.keys(amb.doc.ouvintes).filter((k) => amb.doc.ouvintes[k].length).length, 0);
});

test('achado 5: o estado mais novo vale quando os módulos chegam (a versão de agora, não a do 1º render)', () => {
  const amb = ambiente();
  redesenharLista(amb, estado());
  amb.L.atualizar(estado(), amb.deps);
  const novo = estado(); novo.planta = Object.assign({}, novo.planta, { versao: 3, n_mensagens: 5 }); novo.planta.plano = Object.assign({}, novo.planta.plano, { fecho: 'Fecho da versão três do plano.' });
  amb.L.atualizar(novo, amb.deps);
  redesenharLista(amb, novo);
  prontos(amb);
  assert.equal(amb.espiao.montar[0].plano.fecho, 'Fecho da versão três do plano.');
  assert.equal(botoes(amb)[0].pai, amb.log.filhos[5 + 1]);
});


/* ======================================================================================================================================================
   PR 2c-B: a faixa vai DEPOIS do formulário (decisão do dono, 05/11). A referência da regra de inserção é o último bloco VISÍVEL antes dela.
   ====================================================================================================================================================== */
test('2c-B: com o formulário escondido a faixa nasce logo depois da mesa (a base da mesa decide); com ele visível, depois dele (a base dele decide)', () => {
  /* formulário visível e abaixo da dobra, mesa à vista: a faixa nasce fora da área visível, entra na hora */
  const a = ambiente({ baixo: false });
  a.contato.hidden = false; a.contato.base = 2500;
  const E = estado(); redesenharLista(a, E);
  a.L.atualizar(E, a.deps); prontos(a);
  assert.equal(a.faixa.hidden, false, 'o formulário (visível) termina abaixo da tela: a faixa entra');
  assert.equal(a.espiao.montar.length, 1);
  /* formulário visível mas terminando dentro da tela: espera o gesto */
  const b = ambiente({ baixo: false });
  b.contato.hidden = false; b.contato.base = 700;
  redesenharLista(b, E);
  b.L.atualizar(E, b.deps); prontos(b);
  assert.equal(b.faixa.hidden, true, 'o formulário termina dentro da tela: a faixa à vista espera');
  assert.equal(botoes(b).length, 1);
  b.doc.disparar('click');
  assert.equal(b.faixa.hidden, false);
});

test('2c-B: bloco escondido ou sem altura não conta como referência (pula para o anterior); sem nenhum bloco visível antes, espera', () => {
  const a = ambiente({ baixo: true });   /* mesa abaixo da dobra, formulário escondido */
  const E = estado(); redesenharLista(a, E);
  a.L.atualizar(E, a.deps); prontos(a);
  assert.equal(a.faixa.hidden, false, 'formulário escondido: vale a mesa');
  const b = ambiente({ baixo: true });
  b.mesa.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0 });   /* nenhum bloco com altura antes da faixa (na retomada #o-retomada é visível e viraria a referência: aqui é só o caso extremo de não haver nenhum) */
  redesenharLista(b, E);
  b.L.atualizar(E, b.deps); prontos(b);
  assert.equal(b.faixa.hidden, true);
  assert.equal(botoes(b).length, 1, 'o botão do chat segue sendo o caminho');
});

test('2c-B: bloco com o atributo hidden NÃO vale como referência mesmo que o retângulo dele tenha altura (hidden manda, não só a altura)', () => {
  /* mesa à vista (base 600) e o formulário com hidden mas com um retângulo alto e abaixo da tela (um CSS que o mostrasse apesar do hidden): se valesse, a faixa entraria já */
  const amb = ambiente({ baixo: false });
  amb.contato.hidden = true;
  amb.contato.getBoundingClientRect = () => ({ top: 600, bottom: 2500, height: 1900 });
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, true, 'a referência é a mesa (à vista): a faixa espera o gesto');
  assert.equal(amb.espiao.montar.length, 0);
  assert.equal(botoes(amb).length, 1);
});

test('2c-B: a rolagem que leva o último bloco visível para baixo da dobra insere a faixa (a referência é a do momento)', () => {
  const amb = ambiente({ baixo: false });
  amb.contato.hidden = false; amb.contato.base = 700;
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, true);
  amb.contato.base = 1900;
  amb.w.disparar('scroll'); amb.w.avancar(400);
  assert.equal(amb.faixa.hidden, false);
});

test('2c-B: "Quero ajustar algo" volta até a caixa de texto (que fica longe da faixa) pela mesma rolagem de "Perguntar ao consultor" e foca sem rolar de novo', () => {
  const amb = ambiente();
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  const chamadas = [];
  amb.form.scrollIntoView = (op) => chamadas.push(op);
  let foco = null;
  amb.texto.focus = (op) => { foco = op; amb.doc.ativo = amb.texto; };
  amb.espiao.montar[0].op.aoAjustar();
  assert.deepEqual(chamadas, [{ block: 'center' }], 'rola o formulário da conversa ao meio da tela');
  assert.deepEqual(foco, { preventScroll: true }, 'e foca sem rolar de novo (o teclado do celular não puxa a tela)');
  assert.equal(amb.texto.placeholder, 'Diga o que mudar na planta.');
  assert.deepEqual(amb.enviou, []);
});

test('2c-B: sem o formulário na página (ou sem scrollIntoView) "Quero ajustar algo" ainda foca a caixa e não lança', () => {
  const amb = ambiente();
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.doesNotThrow(() => amb.espiao.montar[0].op.aoAjustar());
  assert.equal(amb.doc.ativo, amb.texto);
});

test('2c-B (fonte): a referência é o irmão visível anterior da faixa, não mais a mesa; o único scrollIntoView é o da volta à conversa', () => {
  assert.doesNotMatch(semComentarios, /querySelector\(\s*['"]\.orc-mesa['"]/);
  assert.match(semComentarios, /previousElementSibling/);
  assert.equal((semComentarios.match(/scrollIntoView/g) || []).length, 2, 'a checagem de existência e a chamada, as duas na volta à conversa');
  assert.match(semComentarios, /\$\('o-form'\)/);
});

test('2c-B: orcamento.html: a faixa é a ÚLTIMA seção do <main>, depois do formulário e de todo o fluxo (pedido, modelos, pagamento, entrega), antes do rodapé', () => {
  const i = HTML.indexOf('id="o-planta"'), fimMain = HTML.indexOf('</main>'), contato = HTML.indexOf('id="o-contato"'), fim = HTML.indexOf('id="o-fim"');
  assert.ok(contato < fim && fim < i && i < fimMain, 'depois de #o-contato e de #o-fim, antes de </main>');
  const resto = HTML.slice(HTML.indexOf('>', i) + 1, fimMain).trim();
  assert.ok(resto.startsWith('</section>') && resto.slice('</section>'.length).trim() === '', 'nada entre a faixa e o fim do <main>: ' + resto.slice(0, 80));
  assert.equal(HTML.slice(HTML.lastIndexOf('<', i), HTML.indexOf('>', i) + 1).includes('hidden'), true);
});


/* ======================================================================================================================================================
   2c-B, achado da medida do formulário: com a faixa à vista logo abaixo do botão "Quero os três modelos", enviar o formulário faz o servidor trocar o bloco de
   cima (o formulário alto some, entram os modelos): a faixa pulou, CLS de 0,91 em 390 e 0,74 em 1.280 contra até 0,03 sem a faixa. A faixa se recolhe no envio
   (a ação da pessoa: o navegador não conta o que muda logo depois) e volta, sem montar de novo, quando a posição dela fica fora da área visível ou num gesto.
   ====================================================================================================================================================== */
function comFormulario(opcoes) {
  const amb = ambiente(opcoes);
  const detalhes = amb.doc.createElement('form'); detalhes.attrs.id = 'o-detalhes-form'; amb.ids['o-detalhes-form'] = detalhes;
  amb.contato.appendChild(detalhes);
  amb.detalhes = detalhes;
  return amb;
}
/* o handler de js/orcamento-detalhes.js roda ANTES (foi registrado no carregamento) e, se aceita o envio, marca aria-busy="true" de forma síncrona; se recusa (campo vazio), não marca */
const enviarFormulario = (amb) => { amb.detalhes.setAttribute('aria-busy', 'true'); amb.detalhes.disparar('submit'); };
const enviarRecusado = (amb) => { amb.detalhes.removeAttribute('aria-busy'); amb.detalhes.disparar('submit'); };
const respostaChegou = (amb) => amb.detalhes.removeAttribute('aria-busy');

test('envio do formulário com a faixa à vista logo abaixo do botão: ela se recolhe na hora, sem desmontar, e fica recolhida enquanto a posição dela está à vista', () => {
  const amb = comFormulario({ baixo: true });
  amb.contato.hidden = false; amb.contato.base = 2500;   /* a faixa nasce abaixo da dobra e entra */
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  assert.equal(amb.faixa.hidden, false);
  amb.contato.base = 700; amb.mesa.base = 500;   /* o usuário rolou: o botão de enviar e a faixa logo abaixo estão na tela */
  enviarFormulario(amb);
  assert.equal(amb.faixa.hidden, true, 'recolhida no envio');
  assert.equal(amb.espiao.parar, 0, 'não desmonta');
  amb.L.atualizar(E, amb.deps); amb.L.atualizar(E, amb.deps);
  assert.equal(amb.faixa.hidden, true, 'continua recolhida: o servidor trocou o bloco de cima e a posição dela segue à vista');
  assert.equal(amb.espiao.atualizar.length, 0, 'e o desenho não é chamado enquanto ela está escondida (sem largura)');
  assert.equal(amb.espiao.montar.length, 1);
});

test('recolhida: volta, sem montar de novo, quando o bloco de cima fica abaixo da tela (a posição dela fora da área visível)', () => {
  const amb = comFormulario({ baixo: true });
  amb.contato.hidden = false; amb.contato.base = 2500;
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  amb.contato.base = 700; amb.mesa.base = 500;
  enviarFormulario(amb);
  assert.equal(amb.faixa.hidden, true);
  amb.contato.hidden = true; amb.mesa.base = 900;   /* o servidor trocou: o último bloco visível agora termina abaixo da tela */
  const dir = amb.doc.createElement('section'); dir.getBoundingClientRect = () => ({ top: 900, bottom: 3000, height: 2100 }); amb.main.filhos.splice(amb.main.filhos.indexOf(amb.faixa), 0, dir); dir.pai = amb.main;
  amb.L.atualizar(E, amb.deps);
  assert.equal(amb.faixa.hidden, false, 'a posição dela ficou fora da área visível: volta');
  assert.equal(amb.espiao.montar.length, 1, 'sem montar de novo');
  assert.equal(amb.espiao.parar, 0);
});

test('recolhida: um gesto da pessoa a traz de volta mesmo com a posição à vista', () => {
  const amb = comFormulario({ baixo: true });
  amb.contato.hidden = false; amb.contato.base = 2500;
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  amb.contato.base = 700; amb.mesa.base = 500;
  enviarFormulario(amb);
  assert.equal(amb.faixa.hidden, true);
  respostaChegou(amb);
  amb.doc.disparar('click');
  assert.equal(amb.faixa.hidden, false);
  assert.equal(amb.espiao.montar.length, 1);
  amb.doc.disparar('click'); amb.doc.disparar('keydown');
  assert.equal(Object.keys(amb.doc.ouvintes).filter((k) => amb.doc.ouvintes[k].length).length, 0, 'os ouvintes de gesto saem');
});

test('recolhida: tocar em "Ver a planta do seu site" mostra de novo e rola até ela', () => {
  const amb = comFormulario({ baixo: true });
  amb.contato.hidden = false; amb.contato.base = 2500;
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  amb.contato.base = 700; amb.mesa.base = 500;
  enviarFormulario(amb);
  botoes(amb)[0].disparar('click');
  assert.equal(amb.faixa.hidden, false);
  assert.deepEqual(amb.rolou, [amb.faixa]);
  assert.equal(amb.espiao.montar.length, 1);
});

test('envio do formulário com a faixa fora da tela não deixa a faixa recolhida (nada a proteger); sem faixa montada não faz nada', () => {
  const a = comFormulario({ baixo: true });
  a.contato.hidden = false; a.contato.base = 2500;
  const E = estado(); redesenharLista(a, E);
  a.L.atualizar(E, a.deps); prontos(a);
  enviarFormulario(a);
  assert.equal(a.faixa.hidden, false, 'a posição dela segue abaixo da dobra: recolher e voltar na mesma tarefa');
  const b = comFormulario({ baixo: false });   /* à vista: a faixa nem foi inserida */
  redesenharLista(b, E);
  b.L.atualizar(E, b.deps); prontos(b);
  assert.doesNotThrow(() => enviarFormulario(b));
  assert.equal(b.faixa.hidden, true);
  assert.equal(b.espiao.montar.length, 0);
});

test('envio do formulário: a planta que some do estado enquanto recolhida sai de vez (sem ouvinte nem botão)', () => {
  const amb = comFormulario({ baixo: true });
  amb.contato.hidden = false; amb.contato.base = 2500;
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  amb.contato.base = 700; amb.mesa.base = 500;
  enviarFormulario(amb);
  amb.L.atualizar(estado({ planta: undefined }), amb.deps);
  assert.equal(amb.faixa.hidden, true);
  assert.equal(botoes(amb).length, 0);
  assert.equal(amb.espiao.parar, 1);
  assert.equal(Object.keys(amb.doc.ouvintes).filter((k) => amb.doc.ouvintes[k].length).length, 0);
});

test('2c-B (fonte): a ligação escuta o envio do formulário de contato (#o-detalhes-form) para recolher a faixa', () => {
  assert.match(semComentarios, /\$\('o-detalhes-form'\)/);
  assert.match(semComentarios, /addEventListener\('submit', aoEnviarFormulario\)/);
});


/* ======================================================================================================================================================
   Re-revisão do 2c-B (M1, M2, M3)
   ====================================================================================================================================================== */
function recolhida(opcoes) {
  const amb = comFormulario(opcoes);
  amb.contato.hidden = false; amb.contato.base = 2500;
  const E = estado(); redesenharLista(amb, E);
  amb.L.atualizar(E, amb.deps); prontos(amb);
  amb.contato.base = 700; amb.mesa.base = 500;
  return { amb, E };
}

test('M1: envio RECUSADO pela própria tela (campo vazio: o handler de detalhes não marca aria-busy) NÃO recolhe a faixa; o aceito recolhe', () => {
  const { amb } = recolhida({ baixo: true });
  enviarRecusado(amb);
  assert.equal(amb.faixa.hidden, false, 'recusado: a faixa fica onde está');
  assert.equal(amb.espiao.parar, 0);
  enviarFormulario(amb);
  assert.equal(amb.faixa.hidden, true, 'aceito (aria-busy): recolhe');
});

test('M2: ao voltar de recolhida a faixa é reconciliada com o estado: planta_editavel que virou false desliga os botões (uma chamada ao desenho, só depois de voltar)', () => {
  const { amb, E } = recolhida({ baixo: true });
  enviarFormulario(amb);
  assert.equal(amb.faixa.hidden, true);
  const E2 = estado({ planta_editavel: false }); E2.planta = E.planta;
  amb.L.atualizar(E2, amb.deps);
  assert.equal(amb.espiao.atualizar.length, 0, 'escondida (largura 0): o desenho não é chamado');
  respostaChegou(amb);
  amb.doc.disparar('click');
  assert.equal(amb.faixa.hidden, false);
  assert.equal(amb.espiao.atualizar.length, 1, 'na volta o desenho recebe o estado de agora');
  assert.equal(amb.espiao.atualizar[0].op.editavel, false);
  assert.equal(amb.espiao.montar.length, 1);
  amb.L.atualizar(E2, amb.deps);
  assert.equal(amb.espiao.atualizar.length, 1, 'e não repete');
});

test('M2: versão nova que chegou enquanto recolhida chega ao desenho como ajuste (com a fala da pessoa) quando a faixa volta, e o botão do chat acompanha', () => {
  const { amb } = recolhida({ baixo: true });
  enviarFormulario(amb);
  const E2 = estado(); E2.mensagens.push({ papel: 'visitante', conteudo: 'quero cobrar um sinal' }, { papel: 'agente', conteudo: 'Refiz.' });
  E2.planta = { versao: 2, origem: 'modelo', n_mensagens: 7, plano: (() => { const p = fx('clinica'); p.fecho = 'Fecho da versão dois, depois do envio.'; return p; })() };
  redesenharLista(amb, E2);
  amb.L.atualizar(E2, amb.deps);
  assert.equal(amb.espiao.atualizar.length, 0);
  assert.equal(botoes(amb)[0].pai, amb.log.filhos[7 + 1], 'o botão do chat já acompanha a versão nova');
  respostaChegou(amb);
  amb.doc.disparar('click');
  assert.equal(amb.espiao.atualizar.length, 1);
  assert.equal(amb.espiao.atualizar[0].plano.fecho, 'Fecho da versão dois, depois do envio.');
  assert.equal(amb.espiao.atualizar[0].op.fala, 'quero cobrar um sinal', 'a versão nova ainda é "nova" para o desenho: marca o ajustado e leva a fala');
});

test('M2: voltar por "Ver a planta do seu site" também reconcilia', () => {
  const { amb, E } = recolhida({ baixo: true });
  enviarFormulario(amb);
  const E2 = estado({ planta_editavel: false }); E2.planta = E.planta;
  amb.L.atualizar(E2, amb.deps);
  botoes(amb)[0].disparar('click');
  assert.equal(amb.faixa.hidden, false);
  assert.equal(amb.espiao.atualizar.length, 1);
  assert.equal(amb.espiao.atualizar[0].op.editavel, false);
});

test('M3: um gesto DURANTE o envio (duplo toque, clique no vazio) não devolve a faixa antes da resposta; depois da resposta, o gesto devolve', () => {
  const { amb } = recolhida({ baixo: true });
  enviarFormulario(amb);
  amb.doc.disparar('click'); amb.doc.disparar('keydown'); amb.doc.disparar('click');
  assert.equal(amb.faixa.hidden, true, 'enviando: continua recolhida');
  respostaChegou(amb);
  amb.doc.disparar('click');
  assert.equal(amb.faixa.hidden, false);
  assert.equal(amb.espiao.montar.length, 1);
});

test('M3: durante o envio o botão do chat segue sendo a saída explícita (mostra e rola)', () => {
  const { amb } = recolhida({ baixo: true });
  enviarFormulario(amb);
  botoes(amb)[0].disparar('click');
  assert.equal(amb.faixa.hidden, false);
  assert.deepEqual(amb.rolou, [amb.faixa]);
});

test('M1 e M3 (fonte): a dependência da ordem dos ouvintes está escrita, e a checagem usa aria-busy do formulário', () => {
  assert.match(FONTE, /aria-busy/);
  assert.match(FONTE, /orcamento-detalhes\.js/);
  assert.match(semComentarios, /getAttribute\('aria-busy'\) === 'true'/);
});

/* ======================================================================================================================================================
   Ajustes pós-radar (05/11): "A planta está certa." duplicada na releitura. O servidor já tem a mensagem do botão DEPOIS da fala da planta: a versão está confirmada, mesmo que
   a página nunca tenha visto o envio terminar (F5, rede que voltou, outra aba). A ligação lê isso do estado; não depende só da memória do clique.
   ====================================================================================================================================================== */
const comConfirmacao = (indice, texto = TEXTO_CERTO, papel = 'visitante') => {
  const E = estado();
  E.mensagens[indice] = { papel, conteudo: texto };
  return E;
};

test('pós-radar: o servidor já tem "A planta está certa." depois da fala da planta (página recarregada): o clique devolve "duplicada" e NÃO manda', async () => {
  const amb = ambiente();
  pronto(amb, comConfirmacao(4));   /* n_mensagens 3; a confirmação é a mensagem 4 */
  assert.equal(clicarCerto(amb), 'duplicada');
  await tick();
  assert.equal(amb.enviou.length, 0, 'não reenviou a mesma versão');
});

test('pós-radar: a confirmação só vale para a versão em que foi dita (a de antes da fala da planta, ou outra pessoa/papel, não conta)', async () => {
  for (const [rotulo, E] of [['antes da planta', comConfirmacao(2)], ['no lugar da própria fala da planta', comConfirmacao(3, TEXTO_CERTO, 'agente')], ['fala do Zero repetindo a frase', comConfirmacao(5, TEXTO_CERTO, 'agente')],
    ['outra frase', comConfirmacao(4, 'A planta está errada.')], ['só parecida', comConfirmacao(4, 'A planta está certa, mas troque a ordem.')]]) {
    const amb = ambiente();
    pronto(amb, E);
    clicarCerto(amb); await tick();
    assert.equal(amb.enviou.length, 1, rotulo + ': manda');
  }
});

test('pós-radar: versão NOVA da planta (ajuste) depois da confirmação antiga: o botão volta a valer', async () => {
  const amb = ambiente();
  const E = comConfirmacao(4); E.mensagens.push({ papel: 'visitante', conteudo: 'troque a ordem' }, { papel: 'agente', conteudo: 'Troquei.' });
  E.planta.versao = 2; E.planta.n_mensagens = 7;
  pronto(amb, E);
  clicarCerto(amb); await tick();
  assert.equal(amb.enviou.length, 1);
});

test('pós-radar: o envio falhou sem a página saber se entrou (devolveu false, versão liberada); o estado relido mostra que entrou: o clique seguinte é "duplicada"', async () => {
  const amb = ambiente();
  amb.deps.enviar = (t) => { amb.enviou.push(t); return Promise.resolve(false); };
  pronto(amb, estado());
  clicarCerto(amb); await tick();
  assert.equal(amb.enviou.length, 1);
  amb.L.atualizar(comConfirmacao(4), amb.deps);   /* a rede voltou: a leitura de fundo traz o turno que tinha entrado */
  assert.equal(clicarCerto(amb), 'duplicada');
  await tick();
  assert.equal(amb.enviou.length, 1, 'não mandou de novo');
});

test('pós-radar: "duplicada" só vale com a planta editável (preço fechado continua devolvendo false)', () => {
  const amb = ambiente();
  const E = comConfirmacao(4); E.planta_editavel = false;
  pronto(amb, E);
  assert.equal(clicarCerto(amb), false);
});

test('pós-radar (fonte): a ligação lê as mensagens do estado e compara com o texto do botão', () => {
  const src = lerFonte('js/orcamento-planta.js');
  assert.match(src, /function jaConfirmada\(/);
  assert.match(src, /if \(st\.certoVersao === st\.versao \|\| jaConfirmada\(\)\) return 'duplicada';/);
});
