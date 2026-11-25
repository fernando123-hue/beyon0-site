/* OS EXTRAS NA CONVERSA COM O ZERO na tela (js/orcamento-extras-zero.js; dono, 24/11, opção A), num DOM de mentira mínimo: logo depois do
   preço do Zero, 2 ou 3 cartões dentro da conversa; um toque inclui, outro tira; o total aparece e é anunciado; o preço é sempre o do servidor.
   Texto mínimo (o dono odeia texto demais): no cartão só o nome curto e o preço; uma fala curta antes (teto de palavras travado aqui).
   O comportamento na página real é provado pelo E2E (docs/e2e-orcamento.mjs, CONSULTOR=1). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarConversa, tique, puro } from './_dom-falso.mjs';

const FONTE = fs.readFileSync(new URL('../../js/orcamento-extras-zero.js', import.meta.url), 'utf8');
const FATORES = { formato: 'institucional', paginas: null, urgencia: false, adicionais: {}, complexidade: 'normal' };
const LISTA = (o = {}) => ({ versao: 'v1', fatores: FATORES, total: 7900, extras: [
  { chave: 'agendamento', nome: 'Agendamento pelo site', frase: 'O cliente escolhe o dia e o horário pelo site.', valor: 450, incluido: false, indicado: true },
  { chave: 'textos', nome: 'Nós escrevemos os textos', frase: 'Nós escrevemos os textos de cada página.', valor: 1750, incluido: false, indicado: false },
  { chave: 'imagens', nome: 'Nós escolhemos as imagens', frase: 'Nós escolhemos as fotos.', valor: 250, incluido: false, indicado: false }
], ...o });
const comAgendamento = () => {
  const l = LISTA();
  return { ...l, fatores: { ...FATORES, adicionais: { agendamento: 1 } }, total: 8350, estimativa: { valor_total: 8350 }, extras: l.extras.map(x => x.chave === 'agendamento' ? { ...x, incluido: true } : x) };
};
const ESTADO = (o = {}) => ({ conversa: { etapa: 'estimativa', tem_contato: false, briefing: { fluxo_conversa: true } }, estimativa: { valor_total: 7900, fatores: FATORES }, pedido: null, ...o });

function montar({ listar = async () => LISTA(), alternar = async () => comAgendamento(), consultor = true, liberar = true } = {}) {
  const chamadas = { listar: 0, alternar: [] }, releituras = [];
  const p = montarConversa({ modulos: ['js/orcamento-extras-zero.js'], api: {
    extrasSugeridos: () => { chamadas.listar++; return listar(); },
    alternarExtra: d => { chamadas.alternar.push(puro(d)); return alternar(d); }
  } });
  p.T.iniciar({ consultor });
  p.T.entregues();
  if (liberar) p.T.liberarValor();
  const X = p.win.BZExtrasZero;
  const atualizar = E => X.atualizar(E, { reler: () => { releituras.push(1); return Promise.resolve(); } });
  const caixa = () => p.log.querySelector('.orc-xz');
  const cartoes = () => (caixa() ? caixa().querySelectorAll('.orc-xz__op') : []);
  const cartao = chave => cartoes().find(b => b.getAttribute('data-extra') === chave);
  const visivel = no => (no.classList.contains('sr-only') ? '' : no._texto + no.children.map(visivel).join(''));
  const total = () => caixa().querySelector('.orc-xz__total').textContent;
  return { p, X, chamadas, releituras, atualizar, caixa, cartoes, cartao, visivel, total };
}

test('logo depois do preço do Zero: uma fala curta e 2 ou 3 cartões com o nome curto e o preço, num grupo rotulado, e o total', async () => {
  const m = montar();
  m.atualizar(ESTADO());
  await tique(); await tique();
  assert.equal(m.chamadas.listar, 1);
  const li = m.caixa();
  assert.ok(li, 'os cartões entram na conversa');
  assert.equal(m.p.log.lastElementChild, li, 'no fim da conversa, logo depois da fala do preço');
  assert.ok(li.hasAttribute('data-toque') && li.hasAttribute('data-toque-tardio'), 'sobrevivem ao redesenho da conversa e voltam depois das falas');
  const grupo = li.querySelector('.orc-xz__ops');
  assert.equal(grupo.getAttribute('role'), 'group');
  const fala = m.p.doc.getElementById(grupo.getAttribute('aria-labelledby'));
  assert.ok(fala && li.contains(fala), 'o grupo é rotulado pela fala curta');
  assert.equal(m.cartoes().length, 3);
  assert.deepEqual(m.cartoes().map(b => b.tagName + ':' + b.type + ':' + b.getAttribute('aria-pressed')), ['button:button:false', 'button:button:false', 'button:button:false']);
  assert.deepEqual(m.cartoes().map(b => b.children.map(m.visivel).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()), ['Agendamento pelo site + R$ 450', 'Nós escrevemos os textos + R$ 1.750', 'Nós escolhemos as imagens + R$ 250'],
    'à vista, só o nome curto e o preço');
  assert.ok(m.cartao('agendamento').textContent.includes('O cliente escolhe o dia'), 'a frase da tabela vai só para o leitor de tela');
  assert.ok(m.cartao('agendamento').classList.contains('is-indicado') && !m.cartao('textos').classList.contains('is-indicado'), 'o indicado marcado de leve');
  assert.match(m.total(), /Total\s*R\$\s*7\.900/);
});

test('TEXTO MÍNIMO: a fala antes dos cartões tem no máximo 10 palavras, sem cara de vendedor; o total, uma palavra e o número', async () => {
  const m = montar();
  m.atualizar(ESTADO());
  await tique(); await tique();
  const fala = m.caixa().querySelector('.orc-xz__fala').textContent.trim();
  assert.ok(fala.length > 0);
  assert.ok(fala.split(/\s+/).length <= 10, 'fala com ' + fala.split(/\s+/).length + ' palavras: "' + fala + '"');
  assert.doesNotMatch(fala, /!|aproveite|imperd|promo|últim|agora mesmo|não perca|oferta|exclusiv/i, 'sem pressão nem urgência falsa');
  assert.equal(m.visivel(m.caixa().querySelector('.orc-xz__total')).replace(/\s+/g, ' ').trim().split(' ').length, 3, '"Total R$ 7.900"');
});

test('um toque inclui (o servidor recalcula), o total muda e é anunciado; outro toque tira; a página relê o estado', async () => {
  let n = 0;
  const m = montar({ alternar: async d => (++n, d.incluir ? comAgendamento() : { ...LISTA(), estimativa: { valor_total: 7900 } }) });
  m.atualizar(ESTADO());
  await tique(); await tique();
  const b = m.cartao('agendamento');
  b.focus();
  b.clicar();
  assert.equal(b.getAttribute('aria-pressed'), 'true', 'o toque responde na hora');
  assert.equal(m.caixa().querySelector('.orc-xz__ops').getAttribute('aria-busy'), 'true');
  assert.deepEqual(m.chamadas.alternar, [{ chave: 'agendamento', incluir: true, versao: 'v1' }], 'só a chave, o sim e a versão da tabela: nenhum preço sai da tela');
  await tique(); await tique();
  assert.match(m.total(), /R\$\s*8\.350/);
  assert.ok(m.p.anuncios.some(a => /incluído/i.test(a) && /8\.350/.test(a)), 'a mudança de preço é anunciada: ' + JSON.stringify(m.p.anuncios));
  assert.equal(m.releituras.length, 1, 'a página relê o estado (o cartão do preço acompanha)');
  assert.equal(m.caixa().querySelector('.orc-xz__ops').getAttribute('aria-busy'), null);
  assert.equal(m.p.doc.activeElement, m.cartao('agendamento'), 'o foco fica no cartão');
  m.cartao('agendamento').clicar();
  assert.deepEqual(m.chamadas.alternar.at(-1), { chave: 'agendamento', incluir: false, versao: 'v1' });
  await tique(); await tique();
  assert.equal(m.cartao('agendamento').getAttribute('aria-pressed'), 'false');
  assert.match(m.total(), /R\$\s*7\.900/);
  assert.ok(m.p.anuncios.some(a => /retirado/i.test(a) && /7\.900/.test(a)));
});

test('um toque por vez: com um em voo, o outro não sai', async () => {
  let soltar;
  const m = montar({ alternar: () => new Promise(r => { soltar = () => r(comAgendamento()); }) });
  m.atualizar(ESTADO());
  await tique(); await tique();
  m.cartao('agendamento').clicar();
  m.cartao('imagens').clicar();
  m.cartao('agendamento').clicar();
  assert.equal(m.chamadas.alternar.length, 1);
  assert.equal(m.cartao('imagens').getAttribute('aria-pressed'), 'false');
  soltar(); await tique(); await tique();
  assert.equal(m.cartao('agendamento').getAttribute('aria-pressed'), 'true');
});

test('falha: o cartão volta ao que era, o erro aparece na conversa e o foco não se perde; a tabela que mudou faz listar de novo', async () => {
  const m = montar({ alternar: async () => { throw Object.assign(new Error('O serviço está lento agora.'), { status: 503 }); } });
  m.atualizar(ESTADO());
  await tique(); await tique();
  const b = m.cartao('imagens');
  b.focus(); b.clicar();
  await tique(); await tique();
  await new Promise(r => setTimeout(r, 80));
  assert.equal(b.getAttribute('aria-pressed'), 'false', 'volta ao que era');
  const erro = m.caixa().querySelector('.orc-xz__erro');
  assert.equal(erro.getAttribute('role'), 'alert');
  assert.match(erro.textContent, /lento/);
  assert.match(m.total(), /7\.900/, 'o total segue o último do servidor');
  assert.equal(m.p.doc.activeElement, b);
  assert.equal(m.releituras.length, 0);

  const t = montar({ alternar: async () => { throw Object.assign(new Error('A tabela mudou.'), { status: 409, dados: { versao_nova: 'v2' } }); } });
  t.atualizar(ESTADO());
  await tique(); await tique();
  t.cartao('imagens').clicar();
  await tique(); await tique(); await tique();
  assert.equal(t.chamadas.listar, 2, 'lista de novo com a tabela de agora');
});

test('segue o servidor: a mesma estimativa não lista de novo; o Zero estimou outra (outra mensagem) e os cartões se acertam no lugar', async () => {
  const m = montar({ listar: async () => (m && m.chamadas.listar > 1 ? comAgendamento() : LISTA()) });
  m.atualizar(ESTADO());
  await tique(); await tique();
  m.atualizar(ESTADO({ estimativa: { valor_total: 7900, fatores: { complexidade: 'normal', adicionais: {}, urgencia: false, paginas: null, formato: 'institucional' } } }));
  await tique();
  assert.equal(m.chamadas.listar, 1, 'as mesmas chaves em outra ordem (o jsonb do banco) são a mesma estimativa');
  m.atualizar(ESTADO({ estimativa: { valor_total: 8350, fatores: { ...FATORES, adicionais: { agendamento: 1 } } } }));
  await tique(); await tique();
  assert.equal(m.chamadas.listar, 2);
  assert.equal(m.p.log.querySelectorAll('.orc-xz').length, 1, 'um bloco só');
  assert.equal(m.cartao('agendamento').getAttribute('aria-pressed'), 'true');
  assert.match(m.total(), /8\.350/);
});

test('depois de incluir, a releitura com a estimativa nova não pede a lista de novo', async () => {
  const m = montar();
  m.atualizar(ESTADO());
  await tique(); await tique();
  m.cartao('agendamento').clicar();
  await tique(); await tique();
  m.atualizar(ESTADO({ estimativa: { valor_total: 8350, fatores: { ...FATORES, adicionais: { agendamento: 1 } } } }));
  await tique();
  assert.equal(m.chamadas.listar, 1);
});

test('só com o Zero, com o valor liberado e antes dos detalhes do pedido; depois deles os cartões ficam como registro, sem mudar mais nada', async () => {
  const sem = montar({ consultor: false });
  sem.atualizar(ESTADO()); await tique();
  assert.equal(sem.chamadas.listar, 0, 'sem o consultor, o fluxo de toques de hoje (os extras dele) segue igual');
  const retido = montar({ liberar: false });
  retido.atualizar(ESTADO()); await tique();
  assert.equal(retido.chamadas.listar, 0, 'com o valor retido, nada');
  const vazio = montar({ listar: async () => LISTA({ extras: [] }) });
  vazio.atualizar(ESTADO()); await tique(); await tique();
  assert.equal(vazio.caixa(), null, 'sem sugestão, nada entra na conversa');
  const semPreco = montar();
  semPreco.atualizar(ESTADO({ estimativa: null })); await tique();
  assert.equal(semPreco.chamadas.listar, 0);

  const m = montar();
  m.atualizar(ESTADO());
  await tique(); await tique();
  m.atualizar(ESTADO({ conversa: { etapa: 'contato', tem_contato: true, briefing: { fluxo_conversa: true } } }));
  await tique();
  assert.ok(m.caixa(), 'fica na conversa');
  assert.ok(m.cartoes().every(b => b.disabled), 'travados');
  m.cartao('imagens').clicar();
  assert.equal(m.chamadas.alternar.length, 0);
  assert.equal(m.chamadas.listar, 1);
});

test('a fonte: ES5, todo texto por textContent, sem estilo inline', () => {
  assert.doesNotMatch(FONTE, /=>|\blet\b|\bconst\b|`|class\s+\w+\s*\{/, 'ES5 sintático, como os outros módulos da conversa');
  assert.doesNotMatch(FONTE, /innerHTML|outerHTML|insertAdjacentHTML|\.style\b|setAttribute\(\s*'style'/);
});
