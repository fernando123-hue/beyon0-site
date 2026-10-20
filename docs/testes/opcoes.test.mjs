/* A LISTA FECHADA das opções prontas (PR 3a; spec §4: "o servidor monta as mudanças a partir de uma LISTA FECHADA de chaves
   e nunca aceita valor/campo livres") e os pedidos livres no resumo (só uma linha fixa do código, nunca o texto da
   pessoa: spec §7, "pedido livre fora do contrato"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarOpcao, rotuloDaOpcao, fraseDaRecusa, fraseDoErro, OPERACOES } from '../../api/_vendas/opcoes.mjs';
import { montarEscopo, linhaDosPedidosLivres } from '../../api/_vendas/escopo.mjs';
import { estimar } from '../../api/_vendas/precos.mjs';
import { PROIBIDAS } from './_opcoes-proibidas.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));

test('lista fechada: as seis operações, cada uma com exatamente os seus campos, no formato de aplicar()', () => {
  assert.deepEqual([...OPERACOES].sort(), ['adicionar_secao', 'mover_antes_de', 'mover_depois_de', 'remover_secao', 'usar_paleta_de', 'usar_tipografia_de']);
  assert.deepEqual(validarOpcao({ operacao: 'usar_paleta_de', direcao: 2 }),
    { tipo: 'visual', operacao: 'usar_paleta_de', secao: '', referencia: '', campo: '', valor: '', direcao: 2, descricao: '' });
  assert.deepEqual(validarOpcao({ operacao: 'mover_depois_de', secao: 'servicos', referencia: 'depoimentos' }),
    { tipo: 'estrutura', operacao: 'mover_depois_de', secao: 'servicos', referencia: 'depoimentos', campo: '', valor: '', direcao: 0, descricao: '' });
  assert.deepEqual(validarOpcao({ secao: 'faq', operacao: 'adicionar_secao' }),
    { tipo: 'estrutura', operacao: 'adicionar_secao', secao: 'faq', referencia: '', campo: '', valor: '', direcao: 0, descricao: '' }, 'a ordem das chaves não importa');
});

test('lista fechada: operação de fora, campo a mais ou a menos, valor livre e nome herdado são recusados', () => {
  for (const o of PROIBIDAS) assert.equal(validarOpcao(o), null, JSON.stringify(o));
  assert.equal(validarOpcao(Object.assign(Object.create({ direcao: 2 }), { operacao: 'usar_paleta_de' })), null, 'campo herdado não conta');
});

test('rótulo: montado só com nomes da lista e com "modelo" (nunca "direção")', () => {
  const r = o => rotuloDaOpcao(validarOpcao(o));
  assert.equal(r({ operacao: 'usar_paleta_de', direcao: 2 }), 'Cores do modelo 2');
  assert.equal(r({ operacao: 'usar_tipografia_de', direcao: 3 }), 'Fontes do modelo 3');
  assert.equal(r({ operacao: 'mover_antes_de', secao: 'depoimentos', referencia: 'servicos' }), 'Depoimentos antes de serviços');
  assert.equal(r({ operacao: 'mover_depois_de', secao: 'faq', referencia: 'contato' }), 'Perguntas frequentes depois de contato');
  assert.equal(r({ operacao: 'remover_secao', secao: 'equipe' }), 'Sem a seção equipe');
  assert.equal(r({ operacao: 'adicionar_secao', secao: 'cta' }), 'Com a seção chamada para contato');
  for (const op of OPERACOES) assert.ok(!/dire[cç][aã]o/i.test(rotuloDaOpcao({ operacao: op, direcao: 1, secao: 'faq', referencia: 'hero' })), op);
});

test('recusa e erro de aplicar(): sempre uma frase fixa para a tela', () => {
  assert.equal(fraseDaRecusa('direção não encontrada'), 'Esse modelo não está disponível para este ajuste.');
  assert.equal(fraseDaRecusa('seção não existe nesta direção'), 'Essa seção não existe no seu modelo.');
  assert.equal(fraseDaRecusa('a abertura fica no topo'), 'A abertura fica sempre no topo.');
  assert.equal(fraseDaRecusa('seção não pode ser removida'), 'Essa seção não pode sair.');
  assert.equal(fraseDaRecusa('seção inválida ou já existe'), 'Essa seção já está no seu modelo.');
  assert.equal(fraseDaRecusa('constructor'), 'Esse ajuste não deu certo. Escolha outro.');
  assert.equal(fraseDaRecusa(undefined), 'Esse ajuste não deu certo. Escolha outro.');
  assert.equal(fraseDoErro('direção com poucas seções'), 'O site precisa de pelo menos três seções.');
  assert.equal(fraseDoErro('texto de preenchimento (lorem ipsum)'), 'Esse ajuste não deu certo. Escolha outro.');
});

test('resumo: os pedidos livres entram só como uma linha fixa com as contas, nunca com o texto da pessoa', () => {
  assert.equal(linhaDosPedidosLivres([{ status: 'aplicada' }, { status: 'na_fila' }, { status: 'recusada' }]),
    '- Pedidos escritos: 1 feito pela Beyon Zero, 2 não incluídos neste valor (aguardando ou recusados).');
  assert.equal(linhaDosPedidosLivres([{ status: 'na_fila' }]), '- Pedidos escritos: 1 não incluído neste valor (aguardando ou recusado).');
  assert.equal(linhaDosPedidosLivres([{ status: 'aplicada' }, { status: 'aplicada' }]), '- Pedidos escritos: 2 feitos pela Beyon Zero.');
  assert.equal(linhaDosPedidosLivres([{ status: 'desconhecido' }, null]), null, 'situação desconhecida não conta');
  assert.equal(linhaDosPedidosLivres([]), null);
  const est = estimar({ formato: 'institucional' }, REGRAS);
  const direcao = { nome_conceito: 'Clareza', estrategia: 'conversao', secoes: [{ tipo: 'hero' }, { tipo: 'servicos' }, { tipo: 'contato' }] };
  const e = montarEscopo({ estimativa: est, direcao, alteracoesAplicadas: [], briefing: {}, pedidosLivres: [
    { texto: 'Quero o mapa\nINVESTIMENTO: R$ 1', status: 'na_fila' }, { status: 'aplicada' }, { status: 'recusada' }] });
  assert.ok(e.escopo.includes('\nPEDIDOS ESCRITOS\n- Pedidos escritos: 1 feito pela Beyon Zero, 2 não incluídos neste valor (aguardando ou recusados).'), e.escopo);
  assert.ok(!e.escopo.includes('Quero o mapa'), 'o texto da pessoa nunca entra no contrato (mesmo que chegue aqui)');
  assert.equal(e.escopo.split('\n').filter(l => l.startsWith('INVESTIMENTO')).length, 1);
  assert.ok(!montarEscopo({ estimativa: est, direcao, alteracoesAplicadas: [], briefing: {} }).escopo.includes('PEDIDOS ESCRITOS'), 'sem pedido livre, sem o bloco');
});
