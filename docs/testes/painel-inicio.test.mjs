/* O início do painel (js/painel-inicio.js; pedido do dono, 15/11: "o mais simples, minimalista e fácil de entender
   possível"): a situação numa linha, os cartões (Precisam de você, Interessados, Vendas, Visitas) e a lista dos
   interessados montada SÓ com o que o painel já recebe. As funções puras rodam aqui com um window de mentira.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FONTE = ler('js/painel-inicio.js'), HTML = ler('painel.html'), CSS = ler('painel.css'), PAINEL = ler('js/painel.js');
const janela = {};
new Function('window', 'document', FONTE)(janela, { getElementById: () => null, addEventListener() {} });   /* (sem o painel o módulo só expõe as funções) */
const I = janela.BZPainelInicio;
const AGORA = Date.parse('2026-11-15T22:00:00Z');
const h = n => new Date(AGORA - n * 36e5).toISOString();

test('pendentes: soma fila, avisos, recados novos, lembretes e alertas; só diz "tudo certo" com tudo lido e sem erro', () => {
  const tudo = { fila: { n: 2 }, avisos: { n: 1 }, recados: { n: 1 }, lembretes: { n: 0 }, saude: { n: 1 } };
  assert.deepEqual(I.somarPendentes(tudo), { n: 5, faltam: [], erros: [] });
  const semSaude = { ...tudo }; delete semSaude.saude;
  assert.deepEqual(I.somarPendentes(semSaude).faltam, ['saude'], 'enquanto falta uma fonte, não afirma nada');
  assert.deepEqual(I.somarPendentes({ ...tudo, avisos: { erro: true } }).erros, ['avisos']);
  assert.equal(I.situacao(I.somarPendentes({ fila: { n: 0 }, avisos: { n: 0 }, recados: { n: 0 }, lembretes: { n: 0 }, saude: { n: 0 } })).texto, 'Tudo certo');
  assert.equal(I.situacao(I.somarPendentes(tudo)).texto, '5 coisas precisam de você');
  assert.equal(I.situacao({ n: 1, faltam: [], erros: [] }).texto, '1 coisa precisa de você');
  assert.match(I.situacao(I.somarPendentes(semSaude)).texto, /^Conferindo/);
  assert.match(I.situacao(I.somarPendentes({ ...tudo, avisos: { erro: true } })).texto, /Não deu para conferir tudo/);
  assert.notEqual(I.situacao(I.somarPendentes({ ...tudo, avisos: { erro: true } })).texto, 'Tudo certo');
});

test('interessados: um por pessoa, a etapa mais adiantada, só o que o dado diz; telefone e e-mail fora da linha da lista', () => {
  const fontes = {
    fila: { itens: [
      { conversa_id: 'c1', codigo: 'BZ-AAAAA', prioridade: 2, pedido_em: h(5), contato: { nome: 'Ana', telefone: '+5521900000001' } },
      { conversa_id: 'c2', codigo: 'BZ-BBBBB', prioridade: 1, pedido_em: h(30), contato: { nome: 'Bia', telefone: '+5521900000002' } }
    ] },
    lembretes: { itens: [{ conversa_id: 'c3', codigo: 'BZ-CCCCC', avisado_em: h(60), contato: { nome: 'Caio', telefone: '+5521900000003' } }] },
    avisos: { itens: [
      { conversa_id: 'c4', codigo: 'BZ-DDDDD', momento: 'previa', desde: h(8), contato: { nome: 'Davi', telefone: '+5521900000004', email: 'd@exemplo.com' } },
      { conversa_id: 'c4', codigo: 'BZ-DDDDD', momento: 'material_parado', desde: h(9), contato: { nome: 'Davi', telefone: '+5521900000004', email: 'd@exemplo.com' } }
    ] },
    recados: { itens: [
      { id: 'r1', criado_em: h(1), texto: 'Oi', email: 'e@exemplo.com', whatsapp: null, pedido_codigo: null, lido_em: null },
      { id: 'r2', criado_em: h(2), texto: 'Sobre o meu pedido', email: null, whatsapp: '+5521900000001', pedido_codigo: 'BZ-AAAAA', lido_em: null }
    ] }
  };
  const lista = I.montarInteressados(fontes);
  assert.equal(lista.length, 5, 'c1, c2, c3, c4 (uma vez só) e o recado sem pedido; o recado do BZ-AAAAA é da Ana');
  const por = Object.fromEntries(lista.map(p => [p.chave, p]));
  assert.equal(por.c1.como, 'Pedido'); assert.equal(por.c1.etapa, 'Pediu os modelos');
  assert.equal(por.c2.etapa, 'Pediu os modelos', 'modelos prontos e ainda não avisados: para o cliente, ele pediu');
  assert.equal(por.c3.etapa, 'Recebeu os modelos');
  assert.equal(por.c4.etapa, 'Pagou a entrada');
  assert.equal(por.r1.como, 'Recado'); assert.equal(por.r1.nome, null);
  assert.equal(por.r1.etapa, 'Novo', 'recado sem pedido: só o que o dado diz (novo ou lido), sem etapa de venda inventada');
  assert.equal(I.montarInteressados({ recados: { itens: [{ id: 'r9', criado_em: h(1), texto: 'x', lido_em: h(0.5) }] } })[0].etapa, 'Lido', 'o recado já lido diz que foi lido (não parece "em andamento")');
  assert.equal(por.c1.recado, 'Sobre o meu pedido', 'o recado com o código do pedido vai para a ficha da pessoa');
  assert.deepEqual(lista.map(p => p.chave), ['r1', 'c1', 'c4', 'c2', 'c3'], 'do mais recente ao mais antigo');
  for (const p of lista) for (const campo of I.linhaDaLista(p, AGORA)) assert.ok(!/@|\+55|\d{4}-\d{4}/.test(campo), 'a linha da lista não leva contato: ' + campo);
  assert.equal(por.c4.telefone, '+5521900000004'); assert.equal(por.c4.email, 'd@exemplo.com');
});

test('interessados: recado suspeito que chega depois do primeiro recado do mesmo pedido ainda marca a pessoa como suspeita', () => {
  const fila = { itens: [{ conversa_id: 'c1', codigo: 'BZ-AAAAA', pedido_em: h(5), contato: { nome: 'Ana' } }] };
  const recado = (id, suspeito) => ({ id, criado_em: h(1), texto: 't' + id, pedido_codigo: 'BZ-AAAAA', lido_em: null, suspeito });
  const pessoa = recados => I.montarInteressados({ fila, recados: { itens: recados } }).find(p => p.chave === 'c1');
  assert.equal(pessoa([recado('r1', false), recado('r2', true)]).suspeito, true, 'o suspeito vem depois do limpo');
  assert.equal(pessoa([recado('r1', true), recado('r2', false)]).suspeito, true, 'o suspeito vem antes do limpo');
  assert.equal(pessoa([recado('r1', false), recado('r2', false)]).suspeito, false, 'sem suspeito, segue limpo');
  assert.equal(pessoa([recado('r1', false), recado('r2', true)]).recado, 'tr1', 'o texto da ficha continua sendo o do primeiro recado');
});

test('cartão Precisam de você: com fonte faltando ou com erro mostra "—", nunca a soma parcial', () => {
  const tudo = { fila: { n: 2 }, avisos: { n: 1 }, recados: { n: 1 }, lembretes: { n: 0 }, saude: { n: 1 } };
  assert.equal(I.contagemAcoes(I.somarPendentes(tudo)), '5');
  assert.equal(I.contagemAcoes(I.somarPendentes({ ...tudo, avisos: { erro: true } })), '—', 'uma fonte falhou: 4 seria mentira');
  const semSaude = { ...tudo }; delete semSaude.saude;
  assert.equal(I.contagemAcoes(I.somarPendentes(semSaude)), '—');
  assert.equal(I.contagemAcoes(I.somarPendentes({ fila: { n: 0 }, avisos: { n: 0 }, recados: { n: 0 }, lembretes: { n: 0 }, saude: { n: 0 } })), '0');
});

test('agir (cartões de pedido): depois de avisar que os pedidos mudaram, o foco vai para o título da fila (a fila vazia não some com a confirmação)', async () => {
  const ordem = [];
  const titulo = { focus: () => ordem.push('foco') };
  const documento = { dispatchEvent: ev => { ordem.push('evento:' + ev.detail.aviso); return true; }, getElementById: id => (id === 't-fila' ? titulo : null) };
  const janelaComum = {};
  const montar = pedir => {
    janelaComum.BZPainel = { el: () => ({}), pedir, recusada: () => false };
    new Function('window', 'document', ler('js/painel-pedido-comum.js'))(janelaComum, documento);
    return janelaComum.BZPainelPedido.agir;
  };
  const botao = { disabled: false }, saida = { textContent: '' };
  ordem.length = 0;
  await montar(() => Promise.resolve({ json: () => Promise.resolve({}) }))({ arquivar_pedido: 'c1' }, botao, saida, 'Pedido BZ-AAAAA arquivado.', 'BZ-AAAAA');
  assert.deepEqual(ordem, ['evento:Pedido BZ-AAAAA arquivado.', 'foco'], 'sucesso: avisa e foca o título');
  ordem.length = 0;
  await montar(() => Promise.reject(Object.assign(new Error('já foi confirmado'), { status: 409 })))({ arquivar_pedido: 'c1' }, { disabled: false }, saida, 'x', 'BZ-AAAAA');
  assert.deepEqual(ordem, ['evento:Pedido BZ-AAAAA: já foi confirmado', 'foco'], 'conflito 409: o motivo fica à vista e o foco vai para o título');
  ordem.length = 0;
  const botaoErro = { disabled: false };
  await montar(() => Promise.reject(Object.assign(new Error('sem rede'), { status: 500 })))({ arquivar_pedido: 'c1' }, botaoErro, saida, 'x', 'BZ-AAAAA');
  assert.deepEqual(ordem, [], 'erro de verdade: nada recarrega e o foco fica no botão, que volta a ficar ativo');
  assert.equal(botaoErro.disabled, false); assert.equal(saida.textContent, 'sem rede');
});

test('interessados: fonte que falhou ou veio sem lista não quebra nem inventa ninguém', () => {
  assert.deepEqual(I.montarInteressados({ fila: { erro: true }, recados: { itens: null }, lembretes: {}, avisos: undefined }), []);
  assert.deepEqual(I.montarInteressados({ fila: { itens: [{ conversa_id: 'x' }] } }).map(p => [p.nome, p.etapa]), [[null, 'Pediu os modelos']]);
});

test('há quanto tempo, em português curto', () => {
  assert.equal(I.haQuanto(h(0.2), AGORA), 'agora');
  assert.equal(I.haQuanto(h(3), AGORA), 'há 3 h');
  assert.equal(I.haQuanto(h(30), AGORA), 'há 1 dia');
  assert.equal(I.haQuanto(h(80), AGORA), 'há 3 dias');
  assert.equal(I.haQuanto(new Date(AGORA + 5 * 36e5).toISOString(), AGORA), 'agora', 'data no futuro não vira "há -5 h"');
  assert.equal(I.haQuanto('não é data', AGORA), '');
});

test('painel.html: os cartões na ordem pedida, Interessados logo depois de Precisam de você, Ferramentas no rodapé', () => {
  const ordem = [...HTML.matchAll(/class="pn__cartao" href="#([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(ordem, ['acoes', 'interessados', 'vendas', 'visitas']);
  assert.match(HTML, /<footer class="pn__rodape"><a href="#ferramentas">Ferramentas<\/a><\/footer>/);
  for (const t of ['inicio', 'acoes', 'interessados', 'pessoa', 'vendas', 'visitas', 'ferramentas']) assert.match(HTML, new RegExp('data-tela="' + t + '"'), t);
  /* o que saiu da interface (dono: "exclua todas as informações desnecessárias") */
  for (const id of ['kpis', 'funil', 'campanhas', 'entradas', 'dispositivos', 'botoes', 'paginas', 'formulario', 'ouro', 'dias']) assert.ok(!HTML.includes('id="' + id + '"'), id);
  for (const f of ['function tabela', 'function paginas', 'function formularioEOuro', 'pn__funil']) assert.ok(!PAINEL.includes(f), 'JS órfão removido: ' + f);
  /* as funções de sempre continuam: a fila, os recados, os lembretes, os avisos, o atendente e o CSV */
  for (const id of ['bloco-fila', 'bloco-recados', 'bloco-lembretes', 'bloco-avisos', 'saude', 'contatos', 'atendente', 'baixarCsv']) assert.ok(HTML.includes('id="' + id + '"'), id);
  assert.ok(HTML.indexOf('src="js/painel-inicio.js"') > HTML.indexOf('src="js/painel-atendente.js"'), 'o início carrega por último');
  assert.ok(!/\sstyle=|<style/i.test(HTML), 'a CSP do painel não aceita estilo inline');
});

test('lista vazia some da tela de ações, menos a que guarda o foco (o foco não cai no corpo depois do "Já lembrei" no último)', () => {
  assert.match(FONTE, /pn__bloco--vazio', vazia && !bloco\.contains\(document\.activeElement\)\)/);
  assert.match(CSS, /\.pn__bloco--vazio \{ display: none; \}/);
});

test('todo js/painel*.js: nenhum innerHTML, insertAdjacentHTML nem document.write (o painel mostra texto de cliente; só textContent)', () => {
  const arquivos = fs.readdirSync(new URL('../../js/', import.meta.url)).filter(f => /^painel.*\.js$/.test(f));
  assert.ok(arquivos.length >= 8, 'achou os arquivos do painel: ' + arquivos.join(', '));
  for (const f of arquivos) {
    const codigo = ler('js/' + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(codigo), f + ' escreve HTML na página');
  }
});

/* A ÚNICA exceção à regra "sem brilho": o bloco NEON-PAINEL de painel.css (dono, 16/11: brilho suave no ciano, só no painel) */
const NEON = /\/\*\s*====\s*NEON-PAINEL: início[\s\S]*?NEON-PAINEL: fim\s*====\s*\*\//;
const semComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('o módulo do início: só textContent, sem console nem armazenamento; o CSS sem blur, sombra nem brilho fora do bloco NEON-PAINEL', () => {
  const codigo = semComentarios(FONTE);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|console\.|localStorage|sessionStorage/.test(codigo));
  assert.ok(NEON.test(CSS), 'o bloco da exceção está entre os dois marcadores');
  const css = semComentarios(CSS.replace(NEON, ''));
  assert.ok(!/blur\(|box-shadow|text-shadow|drop-shadow|backdrop-filter|radial-gradient|linear-gradient/.test(css));
});

test('o brilho do painel (NEON-PAINEL): só sombra e gradiente estáticos, sem blur, filtro, animação, inline nem token novo; usa o ciano e o ouro da marca', () => {
  const bloco = semComentarios(CSS.match(NEON)[0]);
  assert.ok(bloco.length > 400, 'o bloco existe e tem corpo');
  assert.ok(!/blur|backdrop|filter|animation|@keyframes|transition|will-change|!important|style=/.test(bloco), 'nada de desfoque, filtro, movimento do brilho nem !important');
  assert.ok(/box-shadow/.test(bloco) && /text-shadow/.test(bloco) && /radial-gradient/.test(bloco), 'o que o dono pediu está lá');
  assert.ok(/--ac-rgb/.test(bloco) && /--ouro-rgb/.test(bloco) && /--ac-3-rgb/.test(bloco), 'cores dos tokens da marca (ciano; ouro no que pede um toque)');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(bloco), 'nenhuma cor solta: só os tokens');
  assert.equal((CSS.match(/NEON-PAINEL: início/g) || []).length, 1, 'um bloco só');
});
