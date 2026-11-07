/* O RADAR DO ESCOPO: a DERIVAÇÃO (js/orcamento-escopo-estado.js; direção docs/design/radar-escopo-2026-11-07.md). Função pura: lê o estado do
   servidor (E), a última simulação das perguntas e a atividade em voo, e devolve estado, marco, valor e as 4 dimensões. Regras provadas aqui:
   nenhum preço é calculado no navegador (o valor é o valor_total do servidor, ou nada); identificado (simulação, o que o Zero anotou) é nível 1
   e confirmado (pedido salvo) é nível 2; mudar as respostas volta a dimensão a pendente; contar mensagens não avança nada; "confirmada" só
   pela etapa real. Fica em planta-*.test.mjs para o agregador (planta-todos.test.mjs, importado por zero.test.mjs) rodá-lo no npm run testar.
   node --test docs/testes/planta-escopo-estado.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import M from '../../js/orcamento-escopo-estado.js';
import Forma from '../../js/orcamento-planta-forma.js';

const { estadoDoEscopo, transicao } = M;
const ler = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* ---------- fixtures (as formas reais: fluxo.mjs cartao(), precos.mjs estimar(), o estado do servidor) ---------- */
const AGENDA = { chave: 'agendamento', nome: 'Agendamento online', qtd: 1 };
const simulado = (extra) => Object.assign({
  estimativa: { formato: 'Site institucional', valor_total: 8350, sinal: 3340, sinal_percentual: 40, prazo_dias: 9, fase: 'unica', itens: [AGENDA], fase_seguinte: null },
  diagnostico: null,
  recomendacao: { formato: 'institucional', alternativa: 'landing_page', motivo: 'Você quer agendamentos.', assumido: [] },
  formato: 'institucional', urgencia: false, paginas_incluidas: 5, urgencia_pct: 30
}, extra || {});
const salvo = (extra) => Object.assign({
  id: 'e1', valor_total: 8600, sinal: 3440, prazo_dias: 9, fase: 'unica',
  detalhes: {
    formato: { chave: 'institucional', nome: 'Site institucional', base: 7900, paginas_incluidas: 5 },
    itens: [{ chave: 'agendamento', nome: 'Agendamento online', qtd: 1, valor: 450 }, { chave: 'imagens', nome: 'Curadoria de imagens', qtd: 1, valor: 250 }],
    multiplicadores: { urgencia: false, complexidade_alta: false, fator: 1 }, valor_total: 8600, sinal: 3440, prazo_dias: 9, fase: 'unica', fase_seguinte: null
  }
}, extra || {});
const estado = (conversa, resto) => Object.assign({ conversa: Object.assign({ etapa: 'descoberta', tem_contato: false }, conversa || {}), mensagens: [], estimativa: null, proposta: null, pagamentos: [], direcoes: [] }, resto || {});
const NIVEIS_DE = (r) => ({ entrega: r.dims.entrega.nivel, escopo: r.dims.escopo.nivel, integracoes: r.dims.integracoes.nivel, prazo: r.dims.prazo.nivel });

/* ---------- os estados ---------- */
test('aguardando: sem estado, sem simulação, sem atividade; tudo pendente, "A definir", sem valor, parado', () => {
  const r = estadoDoEscopo(null, null, {});
  assert.equal(r.estado, 'aguardando');
  assert.equal(r.rotulo, 'Aguardando briefing');
  assert.equal(r.marco, 0);
  assert.equal(r.valor, null);
  assert.equal(r.ativo, false);
  assert.equal(r.ouro, false);
  assert.deepEqual(NIVEIS_DE(r), { entrega: 0, escopo: 0, integracoes: 0, prazo: 0 });
  for (const d of ['entrega', 'escopo', 'integracoes', 'prazo']) assert.equal(r.dims[d].texto, 'A definir');
});

test('identificando: só enquanto há atividade real (o Zero pensando ou o preço sendo calculado) e nada identificado ainda', () => {
  for (const at of [{ zero: true }, { preco: true }]) {
    const r = estadoDoEscopo(null, null, at);
    assert.equal(r.estado, 'identificando');
    assert.equal(r.rotulo, 'Identificando');
    assert.equal(r.ativo, true);
    assert.equal(r.marco, 0);
  }
  assert.equal(estadoDoEscopo(null, null, { zero: false, preco: false }).estado, 'aguardando', 'a atividade acabou sem nada: volta a aguardar');
});

test('quantidade de mensagens não avança nada: 12 mensagens sem briefing nem preço seguem em "aguardando"', () => {
  const msgs = Array.from({ length: 12 }, (_, i) => ({ papel: i % 2 ? 'agente' : 'visitante', conteudo: 'oi' }));
  const r = estadoDoEscopo(estado({ etapa: 'descoberta', turnos: 6 }, { mensagens: msgs }), null, {});
  assert.equal(r.estado, 'aguardando');
  assert.equal(r.marco, 0);
  assert.deepEqual(NIVEIS_DE(r), { entrega: 0, escopo: 0, integracoes: 0, prazo: 0 });
});

test('análise: o que o Zero anotou no briefing (formato, funcionalidades, páginas, urgência) é nível 1, sem valor', () => {
  const E = estado({ briefing: { projeto: { formato: 'institucional', urgencia: true }, funcionalidades: ['agendamento', 'whatsapp'] } });
  const r = estadoDoEscopo(E, null, {});
  assert.equal(r.estado, 'analise');
  assert.equal(r.rotulo, 'Escopo em análise');
  assert.equal(r.marco, 1);
  assert.equal(r.valor, null);
  assert.deepEqual(NIVEIS_DE(r), { entrega: 1, escopo: 0, integracoes: 1, prazo: 1 });
  assert.equal(r.dims.entrega.texto, 'Site com várias páginas');
  assert.equal(r.dims.integracoes.texto, 'Agendamento online +1');
  assert.equal(r.dims.prazo.texto, 'Com urgência');
  const p = estadoDoEscopo(estado({ briefing: { projeto: { paginas: 4 }, funcionalidades: ['blog'] } }), null, {});
  assert.equal(p.dims.escopo.nivel, 1);
  assert.equal(p.dims.escopo.texto, '4 páginas · Blog');
});

test('estimativa preliminar: a simulação com valor; as 4 dimensões em nível 1 com os textos da tabela', () => {
  const r = estadoDoEscopo(null, simulado(), {});
  assert.equal(r.estado, 'estimativa');
  assert.equal(r.rotulo, 'Estimativa preliminar');
  assert.equal(r.marco, 2);
  assert.equal(r.valor, 8350);
  assert.deepEqual(NIVEIS_DE(r), { entrega: 1, escopo: 1, integracoes: 1, prazo: 1 });
  assert.equal(r.dims.entrega.texto, 'Site com várias páginas');
  assert.equal(r.dims.escopo.texto, 'Até 5 páginas');
  assert.equal(r.dims.integracoes.texto, 'Agendamento online');
  assert.equal(r.dims.prazo.texto, '9 dias úteis');
});

test('escopo: páginas extras somam às incluídas, extras que não são integração contam, a landing é "1 página"; urgência aparece no prazo', () => {
  const itens = [AGENDA, { chave: 'pagina_extra', nome: 'Página extra', qtd: 2 }, { chave: 'blog', nome: 'Blog', qtd: 1 }, { chave: 'imagens', nome: 'Curadoria de imagens', qtd: 1 }];
  const r = estadoDoEscopo(null, simulado({ estimativa: Object.assign({}, simulado().estimativa, { itens }), urgencia: true }), {});
  assert.equal(r.dims.escopo.texto, 'Até 7 páginas · 2 extras');
  assert.equal(r.dims.prazo.texto, '9 dias úteis · com urgência');
  const um = estadoDoEscopo(null, simulado({ formato: 'landing_page', paginas_incluidas: 1, estimativa: Object.assign({}, simulado().estimativa, { itens: [{ chave: 'imagens', nome: 'Curadoria de imagens', qtd: 1 }], prazo_dias: 1 }) }), {});
  assert.equal(um.dims.escopo.texto, '1 página · 1 extra');
  assert.equal(um.dims.entrega.texto, 'Site de uma página');
  assert.equal(um.dims.prazo.texto, '1 dia útil');
  assert.equal(um.dims.integracoes.texto, 'Só as do pacote');
});

test('simulação sem valor (o pacote pede conversa): o formato recomendado fica identificado, o resto volta a pendente, nada de valor; o que pede conversa fica "a confirmar"', () => {
  const r = estadoDoEscopo(null, simulado({ estimativa: null, diagnostico: { itens: ['Sistema ou painel para o seu caso'] } }), {});
  assert.equal(r.estado, 'analise');
  assert.equal(r.valor, null);
  assert.deepEqual(NIVEIS_DE(r), { entrega: 1, escopo: 0, integracoes: 0, prazo: 0 });
  assert.ok(r.detalhes.aConfirmar.some((t) => /Sistema ou painel para o seu caso/.test(t)));
});

test('proposta configurada: o pedido salvo (E.estimativa) é nível 2 em tudo e vence a simulação', () => {
  const E = estado({ etapa: 'contato' }, { estimativa: salvo() });
  const r = estadoDoEscopo(E, simulado(), {});
  assert.equal(r.estado, 'proposta');
  assert.equal(r.rotulo, 'Proposta configurada');
  assert.equal(r.marco, 3);
  assert.equal(r.valor, 8600);
  assert.deepEqual(NIVEIS_DE(r), { entrega: 2, escopo: 2, integracoes: 2, prazo: 2 });
  assert.equal(r.dims.entrega.texto, 'Site com várias páginas');
  assert.equal(r.dims.escopo.texto, 'Até 5 páginas · 1 extra');
  assert.equal(r.dims.integracoes.texto, 'Agendamento online');
  assert.equal(r.dims.prazo.texto, '9 dias úteis');
  const semInteg = salvo(); semInteg.detalhes = Object.assign({}, semInteg.detalhes, { itens: [] });
  assert.equal(estadoDoEscopo(estado({ etapa: 'estimativa' }, { estimativa: semInteg }), null, {}).dims.integracoes.texto, 'Só as do pacote');
  const urg = salvo(); urg.detalhes = Object.assign({}, urg.detalhes, { multiplicadores: { urgencia: true, fator: 1.3 } });
  assert.equal(estadoDoEscopo(estado({ etapa: 'contato' }, { estimativa: urg }), null, {}).dims.prazo.texto, '9 dias úteis · com urgência');
});

test('aguardando confirmação: etapa "escopo" (o resumo na tela); o valor é o da proposta do servidor; sem ouro', () => {
  const E = estado({ etapa: 'escopo' }, { estimativa: salvo(), proposta: { id: 'p1', valor_total: 8600, prazo_dias: 9, escopo: '...' } });
  const r = estadoDoEscopo(E, null, {});
  assert.equal(r.estado, 'confirmacao');
  assert.equal(r.rotulo, 'Aguardando confirmação');
  assert.equal(r.marco, 4);
  assert.equal(r.ouro, false);
  assert.equal(r.valor, 8600);
  assert.deepEqual(NIVEIS_DE(r), { entrega: 2, escopo: 2, integracoes: 2, prazo: 2 });
});

test('proposta confirmada (o único ouro): só pela etapa real (aguardando_pagamento, em_producao, encerrada com entrega)', () => {
  for (const [conversa, resto] of [[{ etapa: 'aguardando_pagamento' }, {}], [{ etapa: 'em_producao' }, {}], [{ etapa: 'encerrada' }, { entrega: { id: 'x' } }]]) {
    const r = estadoDoEscopo(estado(conversa, Object.assign({ estimativa: salvo(), proposta: { valor_total: 8600 } }, resto)), null, {});
    assert.equal(r.estado, 'confirmada', conversa.etapa);
    assert.equal(r.rotulo, 'Proposta confirmada');
    assert.equal(r.marco, 4);
    assert.equal(r.ouro, true);
  }
  const fim = estadoDoEscopo(estado({ etapa: 'encerrada' }, { estimativa: salvo() }), null, {});
  assert.notEqual(fim.estado, 'confirmada', 'encerrada sem entrega não é confirmada');
  assert.equal(fim.ouro, false);
  /* nada mais leva ao ouro: proposta sem a etapa, simulação, atividade */
  for (const r of [estadoDoEscopo(estado({ etapa: 'alteracoes' }, { estimativa: salvo(), proposta: { valor_total: 8600 } }), simulado(), { zero: true }), estadoDoEscopo(null, simulado(), { preco: true })]) {
    assert.notEqual(r.estado, 'confirmada');
    assert.equal(r.ouro, false);
  }
});

test('nenhum preço é calculado aqui: o valor é o valor_total do servidor; sem ele, nada (nem a soma dos itens)', () => {
  const sem = simulado({ estimativa: Object.assign({}, simulado().estimativa, { valor_total: undefined }) });
  assert.equal(estadoDoEscopo(null, sem, {}).valor, null);
  const torto = salvo({ valor_total: 'abc' }); torto.detalhes = Object.assign({}, torto.detalhes, { valor_total: 'abc' });
  assert.equal(estadoDoEscopo(estado({ etapa: 'contato' }, { estimativa: torto }), null, {}).valor, null);
  assert.equal(estadoDoEscopo(estado({ etapa: 'contato' }, { estimativa: salvo({ valor_total: '8600.00' }) }), null, {}).valor, 8600, 'o numérico do banco (texto) vale como número');
  const fonte = ler('js/orcamento-escopo-estado.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.doesNotMatch(fonte, /\bsinal\b|unitario|\.fator\b|\bbase\b/, 'o módulo não toca em sinal, preço unitário, fator nem base (só lê a urgência dos multiplicadores)');
  assert.doesNotMatch(fonte, /valor_total\s*[-+*/]|[-+*/]\s*\w*\.valor_total/, 'nenhuma conta sobre o valor');
});

/* ---------- as transições ---------- */
test('transição: "Proposta atualizada" só quando havia um valor e o do servidor mudou de verdade', () => {
  const a = estadoDoEscopo(null, simulado(), {});
  const b = estadoDoEscopo(null, simulado({ estimativa: Object.assign({}, simulado().estimativa, { valor_total: 8800 }) }), {});
  assert.equal(transicao(a, b).atualizada, true);
  assert.equal(transicao(a, a).atualizada, false, 'mesmo valor');
  assert.equal(transicao(null, a).atualizada, false, 'sem estado anterior');
  assert.equal(transicao(estadoDoEscopo(null, null, {}), a).atualizada, false, 'antes sem valor (o 1º preço não é "atualizada")');
  assert.equal(transicao(a, estadoDoEscopo(null, null, {})).atualizada, false, 'o valor sumiu');
});

test('mudar as respostas (a simulação sai): as dimensões voltam a pendente e a transição diz quais desceram', () => {
  const a = estadoDoEscopo(null, simulado(), {});
  const b = estadoDoEscopo(null, null, {});
  assert.equal(b.estado, 'aguardando');
  assert.deepEqual(NIVEIS_DE(b), { entrega: 0, escopo: 0, integracoes: 0, prazo: 0 });
  const t = transicao(a, b);
  assert.deepEqual(t.desceram.sort(), ['entrega', 'escopo', 'integracoes', 'prazo']);
  assert.deepEqual(t.subiram, []);
  const s = transicao(b, a);
  assert.deepEqual(s.subiram.sort(), ['entrega', 'escopo', 'integracoes', 'prazo']);
  const c = transicao(a, estadoDoEscopo(estado({ etapa: 'contato' }, { estimativa: salvo() }), null, {}));
  assert.deepEqual(c.subiram.sort(), ['entrega', 'escopo', 'integracoes', 'prazo'], 'de identificado (1) a confirmado (2) também sobe');
  assert.equal(c.marcoMudou, true);
  assert.equal(c.virouOuro, false);
  const ouro = estadoDoEscopo(estado({ etapa: 'aguardando_pagamento' }, { estimativa: salvo(), proposta: { valor_total: 8600 } }), null, {});
  assert.equal(transicao(c && estadoDoEscopo(estado({ etapa: 'escopo' }, { estimativa: salvo(), proposta: { valor_total: 8600 } }), null, {}), ouro).virouOuro, true);
  assert.equal(transicao(ouro, ouro).virouOuro, false);
});

/* ---------- os detalhes ---------- */
test('o que pode mudar o valor: a urgência pela tabela (com o percentual do catálogo) e os extras, só enquanto o preço está aberto', () => {
  const r = estadoDoEscopo(null, simulado(), {});
  assert.ok(r.detalhes.podeMudar.includes('Precisar antes do prazo: +30% no valor'));
  assert.ok(r.detalhes.podeMudar.some((t) => /Quer ajustar\?/.test(t)));
  const semPct = estadoDoEscopo(null, simulado({ urgencia_pct: null }), {});
  assert.ok(semPct.detalhes.podeMudar.includes('Precisar antes do prazo (acréscimo da tabela)'));
  const urg = estadoDoEscopo(null, simulado({ urgencia: true }), {});
  assert.ok(urg.detalhes.podeMudar.some((t) => /urgência/.test(t) && /tabela/.test(t)));
  assert.ok(!urg.detalhes.podeMudar.includes('Precisar antes do prazo: +30% no valor'));
  assert.deepEqual(estadoDoEscopo(estado({ etapa: 'escopo' }, { estimativa: salvo(), proposta: { valor_total: 8600 } }), null, {}).detalhes.podeMudar, [], 'no resumo o valor está fechado');
});

test('ainda a confirmar: o que o servidor assumiu ("Não sei, escolha por mim"), nas mesmas palavras da tela', () => {
  const r = estadoDoEscopo(null, simulado({ recomendacao: Object.assign({}, simulado().recomendacao, { assumido: ['material', 'ramo', 'inventado'] }) }), {});
  assert.deepEqual(r.detalhes.aConfirmar, ['se já tem logo e textos', 'o seu ramo']);
  assert.deepEqual(estadoDoEscopo(null, simulado(), {}).detalhes.aConfirmar, []);
});

test('o que você nos contou: a leitura (BZ_PLANTA) com as palavras da própria pessoa, literais; "não falou" fica de fora; leitura torta não entra', () => {
  const leitura = { eixos: [
    { eixo: 'volume', nivel: 'deixou_claro', evidencia: 'Tem muita procura' },
    { eixo: 'repeticao', nivel: 'comentou', evidencia: 'Toda hora perguntam o horário' },
    { eixo: 'urgencia', nivel: 'nao_falou', evidencia: 'não deveria aparecer' },
    { eixo: 'pessoas', nivel: 'comentou', evidencia: 'só a recepcionista atende' },
    { eixo: 'informacao', nivel: 'nao_falou' }
  ] };
  const r = estadoDoEscopo(estado({}, { leitura }), null, {});
  assert.deepEqual(r.detalhes.contou, [
    { eixo: 'volume', rotulo: 'Volume', nivel: 'deixou claro', evidencia: 'Tem muita procura' },
    { eixo: 'repeticao', rotulo: 'Repetição', nivel: 'comentou', evidencia: 'Toda hora perguntam o horário' },
    { eixo: 'pessoas', rotulo: 'Depende de pessoas', nivel: 'comentou', evidencia: 'só a recepcionista atende' }
  ]);
  assert.equal(r.estado, 'aguardando', 'a leitura não é escopo: não avança o radar');
  for (const torta of [{ eixos: leitura.eixos.slice(0, 4) }, { eixos: leitura.eixos.map((e, i) => (i ? e : Object.assign({}, e, { eixo: 'dinheiro' }))) },
    { eixos: leitura.eixos.map((e, i) => (i ? e : Object.assign({}, e, { evidencia: 'x'.repeat(61) }))) }, { eixos: 'não' }, null]) {
    assert.deepEqual(estadoDoEscopo(estado({}, { leitura: torta }), null, {}).detalhes.contou, []);
  }
});

/* ---------- o que não pode desandar ---------- */
test('textos curtos para os cantos (cabem em 2 linhas a 320 px): muitas integrações viram "a primeira +N"', () => {
  const itens = ['agendamento', 'formulario_avancado', 'integracao', 'catalogo'].map((chave) => ({ chave, nome: 'Nome longo da tabela para ' + chave, qtd: 1 }));
  const r = estadoDoEscopo(null, simulado({ estimativa: Object.assign({}, simulado().estimativa, { itens }) }), {});
  assert.equal(r.dims.integracoes.texto, 'Agendamento online +3');
  const desconhecido = estadoDoEscopo(null, simulado({ estimativa: Object.assign({}, simulado().estimativa, { itens: [{ chave: 'marketplace', nome: 'Integração com marketplace (Mercado Livre, Shopee)', qtd: 1 }] }) }), {});
  for (const d of Object.values(desconhecido.dims)) assert.ok(d.texto.length <= 32, d.texto);
});

test('entrada torta não lança e cai em pendente (E vazio, conversa sem etapa, itens que não são lista, simulação de texto)', () => {
  for (const [E, s] of [[{}, null], [{ conversa: null }, 'x'], [estado({}, { estimativa: { detalhes: { itens: 'x', formato: 3 } } }), { estimativa: { itens: 7 } }], [undefined, undefined], [estado({ briefing: { funcionalidades: 'x', projeto: [] } }), {}]]) {
    assert.doesNotThrow(() => estadoDoEscopo(E, s, null));
    const r = estadoDoEscopo(E, s, null);
    assert.ok(['aguardando', 'proposta', 'analise'].includes(r.estado), r.estado);
  }
});

test('os nomes dos formatos são os mesmos da tela das perguntas (js/orcamento-perguntas.js, NOMES) e os eixos/níveis os da forma (BZPlantaForma)', () => {
  const m = ler('js/orcamento-perguntas.js').match(/var NOMES = (\{[^}]+\});/);
  assert.ok(m, 'achei o NOMES das perguntas');
  assert.deepEqual(M.NOMES_FORMATO, JSON.parse(m[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"')));
  assert.deepEqual([...M.EIXOS], [...Forma.EIXOS]);
  assert.deepEqual([...M.NIVEIS], [...Forma.NIVEIS]);
  assert.deepEqual([...M.DIMENSOES], ['entrega', 'escopo', 'integracoes', 'prazo']);
  assert.deepEqual([...M.MARCOS], ['Briefing', 'Análise', 'Estimativa', 'Proposta', 'Confirmada']);
});
