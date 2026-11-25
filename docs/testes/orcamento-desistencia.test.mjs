/* A TELA DA DESISTÊNCIA (20/11, dono): "o reembolso não é algo que deva ser facilitado, meio que mostrado assim. Não queremos induzir o cliente a pedir reembolso".
   Por isso: a tela principal do pedido NÃO fala em reembolso nem devolução e NÃO tem o botão que devolve; só um link de texto pequeno ("Preciso desistir da compra"),
   que existe dentro da janela dos 7 dias (o servidor diz: entrega.pode_desistir). Ao tocar, abre um painel calmo e honesto com o botão "Confirmar desistência e
   devolver a entrada" e "Voltar"; só o clique no segundo botão chama o servidor. Tudo por textContent.  (js/orcamento-desistencia.js; global BZDesistencia)  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarDoc, tique } from './_dom-falso.mjs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FONTE = ler('js/orcamento-desistencia.js'), HTML = ler('orcamento.html'), API_JS = ler('js/orcamento-api.js'), CSS = ler('css/orcamento-entrega.css');
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const texto = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const PALAVRAS = /reembols|devol|estorn|desist/i;   /* (as palavras que não podem estar à vista antes da opção discreta ser aberta; "desistir" só no link) */

/* ---------- a página ---------- */
test('a página (HTML): nenhum botão que devolve, nenhuma palavra de devolução e nenhum style="": só o lugar do link, escondido', () => {
  const pagina = texto(HTML);
  assert.ok(!/reembols|devolu|devolver|estorn/i.test(pagina), 'a tela principal nunca diz reembolso nem devolução: ' + (pagina.match(/.{30}(reembols|devolu|devolver|estorn).{30}/i) || [''])[0]);
  assert.ok(!/Confirmar desist/i.test(HTML), 'o botão de confirmar não está na página');
  assert.ok(!/o-desiste-confirmar|o-desiste-painel/.test(HTML), 'o painel nasce só quando o link é tocado');
  assert.match(HTML, /<div id="o-desiste"[^>]*\bhidden\b[^>]*><\/div>/, 'um lugar vazio e escondido, dentro de "Seu pedido"');
  const iFim = HTML.indexOf('id="o-fim"'), iDesiste = HTML.indexOf('id="o-desiste"');
  assert.ok(iFim > 0 && iFim < iDesiste && iDesiste < HTML.indexOf('id="o-planta"'), 'o link mora embaixo de tudo: depois do fim do pedido, antes só da planta do site');
  assert.ok(HTML.indexOf('id="o-material"') < iDesiste && HTML.indexOf('id="o-previa"') < iDesiste, 'embaixo do material e da prévia');
  assert.ok(!/ style=/.test(HTML), 'CSP sem inline');
  assert.match(HTML, /<script src="js\/orcamento-desistencia\.js" defer><\/script>/);
  assert.ok(HTML.indexOf('src="js/orcamento-desistencia.js"') < HTML.indexOf('src="js/orcamento-entrega.js"'), 'carrega antes do módulo que o usa');
});

test('o módulo: sem innerHTML, sem style="", sem inline, sem blur; o texto entra por textContent', () => {
  const codigo = semComentario(FONTE);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(codigo));
  assert.ok(!/style="|\.style\.cssText|setAttribute\('style'/.test(codigo));
  assert.match(codigo, /textContent/);
  const css = semComentario(CSS);
  const parte = css.slice(css.indexOf('.orc-desiste'));
  assert.ok(parte.includes('.orc-desiste'), 'o CSS do link e do painel existe');
  assert.ok(!/blur|box-shadow|text-shadow|drop-shadow|backdrop|filter/.test(parte), 'sem desfoque nem brilho (o dono proíbe)');
  assert.ok(/min-height: 44px/.test(parte), 'alvo de toque de 44 px no celular');
});

test('a API do navegador: UMA chamada, POST "desistir", com a conversa e o confirmo; nada de valor, order ou prazo', () => {
  const trecho = API_JS.slice(API_JS.indexOf('desistir:'), API_JS.indexOf('desistir:') + 400);
  assert.match(trecho, /chamar\('POST', 'desistir', comConversa\(\{ confirmo: true \}\)/);
  assert.ok(!/valor|order|prazo|tentativa/.test(trecho.split('\n')[0]), trecho);
});

/* ---------- o componente, com um DOM de mentira ---------- */
function montar({ desistir = async () => ({ ok: true, encerrado: true }), recarregar = async () => {} } = {}) {
  const doc = criarDoc();
  const raiz = doc.createElement('div'); raiz.id = 'o-desiste'; raiz.hidden = true;
  const titulo = doc.createElement('h2'); titulo.id = 'o-fim-encerrado-titulo'; titulo.textContent = 'Este pedido foi encerrado';
  const lead = doc.createElement('p'); lead.id = 'o-fim-desistiu'; lead.hidden = true;
  const chamadas = [];
  const API = { desistir: () => { chamadas.push('desistir'); return desistir(); } };
  const win = {};
  new Function('window', 'document', FONTE)(win, doc);
  const tela = win.BZDesistencia.criar({ API, aoCancelar: recarregar });
  return { doc, raiz, titulo, lead, chamadas, tela, B: win.BZDesistencia, API };
}
const E = (extra = {}, conversa = {}) => ({ conversa: { etapa: 'em_producao', ...conversa }, entrega_ligada: true, entrega: { passo: 'producao', pode_desistir: true, desistiu: false, bloqueada: false, ...extra } });
const todo = no => no.textContent;
const botoes = no => no.todos().filter(x => x.tagName === 'button');

test('visivel(): só com o servidor dizendo pode_desistir === true, a conversa em produção, a entrega ligada e sem bloqueio', () => {
  const { B } = montar();
  assert.equal(B.visivel(E()), true);
  for (const ruim of [E({ pode_desistir: false }), E({ pode_desistir: undefined }), E({ pode_desistir: 'true' }), E({ pode_desistir: 1 }), E({ bloqueada: true }),
    E({}, { etapa: 'encerrada' }), E({}, { etapa: 'aguardando_pagamento' }), { ...E(), entrega_ligada: false }, { conversa: { etapa: 'em_producao' } }, { conversa: { etapa: 'em_producao' }, entrega: null }, null, undefined, {}]) {
    assert.equal(B.visivel(ruim), false, JSON.stringify(ruim));
  }
});

test('ANTES de tocar na opção discreta: só um link de texto; nenhuma palavra de devolução; nenhum botão de confirmar; o servidor não é chamado', () => {
  const m = montar();
  m.tela.atualizar(E());
  assert.equal(m.raiz.hidden, false);
  assert.equal(todo(m.raiz), 'Preciso desistir da compra');
  assert.ok(!/reembols|devol|estorn/i.test(todo(m.raiz)));
  assert.deepEqual(botoes(m.raiz).map(b => b.textContent), ['Preciso desistir da compra']);
  assert.equal(m.doc.getElementById('o-desiste-confirmar'), null);
  assert.equal(m.raiz.querySelector('.orc-desiste__painel'), null);
  assert.equal(botoes(m.raiz)[0].getAttribute('aria-expanded'), 'false');
  assert.deepEqual(m.chamadas, []);
});

test('sem a opção do servidor, o lugar fica vazio e escondido (nem o link existe)', () => {
  const m = montar();
  m.tela.atualizar(E({ pode_desistir: false }));
  assert.equal(m.raiz.hidden, true); assert.equal(todo(m.raiz), '');
  m.tela.atualizar(E());
  assert.equal(m.raiz.hidden, false);
  m.tela.atualizar(E({ pode_desistir: false }));
  assert.equal(m.raiz.hidden, true); assert.equal(todo(m.raiz), '', 'passou o prazo com a página aberta: o link some na próxima leitura');
});

test('o 1º toque (o link) só ABRE o painel calmo e honesto: o que acontece, "Confirmar desistência e devolver a entrada" e "Voltar"; o servidor ainda não foi chamado', () => {
  const m = montar();
  m.tela.atualizar(E());
  const link = botoes(m.raiz)[0];
  link.clicar();
  const painel = m.raiz.querySelector('.orc-desiste__painel');
  assert.ok(painel, 'o painel abriu');
  const t = painel.textContent;
  assert.match(t, /entrada volta pelo mesmo Pix/); assert.match(t, /pedido é cancelado/); assert.match(t, /apagado em até um dia/); assert.match(t, /site não vai ao ar/); assert.match(t, /depende do seu banco/);
  assert.deepEqual(botoes(painel).map(b => b.textContent), ['Confirmar desistência e devolver a entrada', 'Voltar']);
  assert.ok(!/certeza|sentimos|pena|desconto|oferta|fique|continue|aproveite|perder|última chance|mudar de ideia/i.test(t), 'sem culpa, sem insistência, sem oferta para ficar: ' + t);
  assert.ok(!/!/.test(t), 'sem exclamação');
  assert.equal(link.getAttribute('aria-expanded'), 'true');
  assert.equal(m.doc.activeElement.id, 'o-desiste-titulo', 'o foco vai para o título do painel');
  assert.deepEqual(m.chamadas, [], 'abrir não chama o servidor');
});

test('"Voltar" fecha o painel, devolve o foco ao link e NÃO chama o servidor; o painel pode abrir de novo', () => {
  const m = montar();
  m.tela.atualizar(E());
  botoes(m.raiz)[0].clicar();
  botoes(m.raiz.querySelector('.orc-desiste__painel')).find(b => b.textContent === 'Voltar').clicar();
  assert.equal(m.raiz.querySelector('.orc-desiste__painel'), null);
  assert.equal(m.raiz.todos().find(x => x.id === 'o-desiste-confirmar'), undefined);
  assert.equal(botoes(m.raiz)[0].getAttribute('aria-expanded'), 'false');
  assert.equal(m.doc.activeElement, botoes(m.raiz)[0]);
  assert.deepEqual(m.chamadas, []);
  botoes(m.raiz)[0].clicar();
  assert.ok(m.raiz.querySelector('.orc-desiste__painel'));
});

test('o 2º toque (confirmar) chama o servidor UMA vez, mesmo com toques repetidos, e depois recarrega o pedido', async () => {
  let solta; const espera = new Promise(r => { solta = r; });
  let recarregou = 0;
  const m = montar({ desistir: async () => { await espera; return { ok: true, encerrado: true }; }, recarregar: async () => { recarregou++; } });
  m.tela.atualizar(E());
  botoes(m.raiz)[0].clicar();
  const confirmar = m.doc.getElementById('o-desiste-confirmar');
  confirmar.clicar(); confirmar.clicar(); confirmar.clicar();
  confirmar.dispatchEvent({ type: 'click' }); confirmar.dispatchEvent({ type: 'click' });   /* (um toque que passa pelo botão já travado: o guarda do módulo segura) */
  assert.deepEqual(m.chamadas, ['desistir'], 'um só pedido ao servidor');
  assert.equal(confirmar.disabled, true, 'travado enquanto espera');
  assert.equal(m.raiz.querySelector('.orc-desiste__painel').getAttribute('aria-busy'), 'true');
  solta(); await tique(); await tique(); await tique();
  assert.deepEqual(m.chamadas, ['desistir']);
  assert.equal(recarregou, 1);
  assert.match(m.raiz.textContent, /Pedido cancelado\. A entrada volta pelo Pix; o prazo depende do seu banco\./);
});

test('se o servidor recusa ou falha: a frase humana dele aparece no painel (textContent), os botões voltam e o link do recado aparece quando ele manda o recado', async () => {
  const falha = new Error('O prazo para cancelar por aqui já passou. Deixe um recado para a equipe: ela olha o seu caso.');
  falha.dados = { recado: true };
  let vez = 0;
  const m = montar({ desistir: async () => { if (!vez++) throw falha; return { ok: true, encerrado: true }; } });
  m.tela.atualizar(E());
  botoes(m.raiz)[0].clicar();
  m.doc.getElementById('o-desiste-confirmar').clicar();
  await tique(); await tique();
  const erro = m.doc.getElementById('o-desiste-erro');
  assert.equal(erro.textContent.includes('prazo para cancelar por aqui já passou'), true);
  assert.equal(erro.getAttribute('role'), 'alert');
  assert.equal(m.doc.getElementById('o-desiste-confirmar').disabled, false);
  const recado = erro.querySelector('a[data-recado-abrir]') || m.raiz.querySelector('a[data-recado-abrir]');
  assert.ok(recado, 'o caminho do recado');
  assert.equal(recado.getAttribute('data-recado-origem'), 'orcamento');
  /* outra tentativa funciona */
  m.doc.getElementById('o-desiste-confirmar').clicar();
  await tique(); await tique(); await tique();
  assert.deepEqual(m.chamadas, ['desistir', 'desistir']);
});

test('erro sem frase (rede caída): uma frase humana de reserva, nunca "undefined" nem o erro cru', async () => {
  const m = montar({ desistir: async () => { throw new TypeError('Failed to fetch'); } });
  m.tela.atualizar(E());
  botoes(m.raiz)[0].clicar();
  m.doc.getElementById('o-desiste-confirmar').clicar();
  await tique(); await tique();
  const t = m.doc.getElementById('o-desiste-erro').textContent;
  assert.ok(t.length > 20 && !/undefined|Failed|TypeError/.test(t), t);
});

test('a resposta "estamos confirmando" (o servidor ainda não fechou o pedido) mostra a frase dele e ela FICA na tela (as leituras seguintes do pedido não a apagam)', async () => {
  let recarregou = 0;
  const m = montar({ desistir: async () => ({ ok: true, encerrado: false, aguardando: true, mensagem: 'Recebemos o seu cancelamento e estamos confirmando com o Mercado Pago. Você não precisa fazer mais nada.' }), recarregar: async () => { recarregou++; } });
  m.tela.atualizar(E());
  botoes(m.raiz)[0].clicar();
  m.doc.getElementById('o-desiste-confirmar').clicar();
  await tique(); await tique(); await tique();
  assert.match(m.raiz.textContent, /estamos confirmando com o Mercado Pago/);
  assert.equal(recarregou, 0, 'o pedido ainda não fechou: nada a recarregar');
  m.tela.atualizar(E({ pode_desistir: false, desistiu: true }));
  assert.match(m.raiz.textContent, /estamos confirmando com o Mercado Pago/, 'a leitura que vem depois (o servidor já tem a linha) não apaga a frase');
});

test('uma leitura do pedido que chega com o painel ABERTO não o fecha na cara da pessoa (o relógio dos 7 dias vence com ela olhando)', () => {
  const m = montar();
  m.tela.atualizar(E());
  botoes(m.raiz)[0].clicar();
  m.tela.atualizar(E());
  assert.ok(m.raiz.querySelector('.orc-desiste__painel'), 'continua aberto');
  m.tela.atualizar(E({ pode_desistir: false }));
  assert.equal(m.raiz.querySelector('.orc-desiste__painel'), null, 'o servidor tirou a opção: o painel fecha em vez de enganar');
  assert.equal(m.raiz.hidden, true);
});

test('o pedido desistido: o fim do pedido diz "Pedido cancelado" (a frase do dono) e volta ao texto de sempre se não houve desistência', () => {
  const m = montar();
  m.tela.atualizar({ conversa: { etapa: 'encerrada' }, entrega: { passo: 'encerrada', desistiu: true, pode_desistir: false } });
  assert.equal(m.titulo.textContent, 'Pedido cancelado');
  assert.equal(m.lead.hidden, false);
  assert.match(m.lead.textContent, /A entrada volta pelo Pix; o prazo depende do seu banco\./);
  m.tela.atualizar({ conversa: { etapa: 'encerrada' }, entrega: { passo: 'encerrada', desistiu: false } });
  assert.equal(m.titulo.textContent, 'Este pedido foi encerrado'); assert.equal(m.lead.hidden, true);
});

test('a opção não pisca na tela do restante: o painel da desistência nunca aparece em pedido encerrado nem concluído', () => {
  const m = montar();
  m.tela.atualizar({ conversa: { etapa: 'encerrada' }, entrega: { passo: 'concluida', pode_desistir: true } });
  assert.equal(m.raiz.hidden, true);
});

test('o HTML do fim do pedido tem o lugar da frase da desistência, escondido e vazio', () => {
  assert.match(HTML, /<p class="orc-bloco__lead" id="o-fim-desistiu" hidden><\/p>/);
});

test('/condicoes diz que dentro dos 7 dias dá também para desistir pelo próprio pedido, em "Seu pedido", e a versão sobe para 21/11 (a captação sobe a condicoes_versao junto)', () => {
  const cond = texto(ler('condicoes.html'));
  assert.match(cond, /Para desistir, escreva para contato\.beyon\.zero@gmail\.com ?ou, se a nossa conversa foi pelo WhatsApp, mande uma mensagem por lá\. Dentro dos 7 dias, a devolução é imediata, pelo mesmo meio do pagamento \(o Pix\), com o valor corrigido, e você também pode desistir pelo próprio pedido, em “Seu pedido”, na página do orçamento\./);
  assert.match(cond, /Última atualização: 23 de novembro de 2026/);
  assert.ok(HTML.includes('<p class="orcamento-pedido-rotulo') || /Seu pedido<span id="o-ped-codigo"/.test(HTML), 'o rótulo "Seu pedido" que a página das condições cita existe na tela');
});

test('tela: depois de um erro o foco volta ao botão de confirmar; com o servidor trabalhando, o toque no link NÃO fecha o painel; o aria-controls só existe com o painel aberto', async () => {
  let solta; const espera = new Promise(r => { solta = r; });
  let vez = 0;
  const m = montar({ desistir: async () => { if (!vez++) { await espera; throw new Error('Não consegui concluir agora. Tente de novo em alguns minutos.'); } return { ok: true, encerrado: true }; } });
  m.tela.atualizar(E());
  const link = botoes(m.raiz)[0];
  assert.equal(link.getAttribute('aria-controls'), null);
  link.clicar();
  assert.equal(link.getAttribute('aria-controls'), 'o-desiste-titulo');
  m.doc.getElementById('o-desiste-confirmar').clicar();
  link.clicar();   /* (o servidor está trabalhando: não fecha) */
  assert.ok(m.raiz.querySelector('.orc-desiste__painel'), 'o painel continua aberto enquanto espera');
  solta(); await tique(); await tique(); await tique();
  assert.equal(m.doc.activeElement.id, 'o-desiste-confirmar', 'o foco volta ao botão de confirmar');
  botoes(m.raiz.querySelector('.orc-desiste__painel')).find(b => b.textContent === 'Voltar').clicar();
  assert.equal(link.getAttribute('aria-controls'), null);
});

test('a frase "estamos confirmando" some quando o pedido passa a encerrado (não fica ao lado do "Pedido cancelado")', async () => {
  const m = montar({ desistir: async () => ({ ok: true, encerrado: false, aguardando: true, mensagem: 'Recebemos o seu cancelamento e estamos confirmando com o Mercado Pago. Você não precisa fazer mais nada.' }) });
  m.tela.atualizar(E());
  botoes(m.raiz)[0].clicar();
  m.doc.getElementById('o-desiste-confirmar').clicar();
  await tique(); await tique(); await tique();
  assert.match(m.raiz.textContent, /estamos confirmando/);
  m.tela.atualizar({ conversa: { etapa: 'encerrada' }, entrega: { passo: 'encerrada', desistiu: true } });
  assert.equal(m.raiz.hidden, true); assert.equal(m.raiz.textContent, '');
  assert.equal(m.titulo.textContent, 'Pedido cancelado');
});
