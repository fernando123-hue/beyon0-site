/* A TELA DOS AJUSTES (PR 3a; spec §4): o que cada estado oferece, sem DOM. O módulo é JS de navegador (IIFE): roda aqui com
   um window de mentira e sem document (ele não toca no DOM ao carregar; só criar() toca). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fonte = fs.readFileSync(new URL('../../js/orcamento-ajustes.js', import.meta.url), 'utf8');
const janela = {};
new Function('window', fonte)(janela);
const A = janela.BZAjustes;
const sec = tipos => tipos.map(tipo => ({ tipo }));
const dir = (id, numero, tipos) => ({ id, numero, status: 'pronta', conteudo: { secoes: sec(tipos) } });
/* o modelo 2 escolhido; o 1 tem "Perguntas frequentes", o 3 tem "Equipe" */
const estado = (extra = {}) => ({ conversa: { etapa: 'escolhida' }, escolha: { direcao_id: 'b' },
  direcoes: [dir('a', 1, ['hero', 'servicos', 'faq', 'contato']), dir('b', 2, ['hero', 'sobre', 'servicos', 'depoimentos', 'contato']), dir('c', 3, ['hero', 'equipe', 'servicos'])],
  alteracoes: [], versao_final: null, ...extra });

test('opções: as cores e as fontes dos OUTROS modelos prontos, nunca do escolhido', () => {
  const m = A.opcoesDe(estado());
  assert.deepEqual(m.cores.map(c => c.rotulo), ['Usar as cores do modelo 1', 'Usar as cores do modelo 3']);
  assert.deepEqual(m.cores[0].opcao, { operacao: 'usar_paleta_de', direcao: 1 });
  assert.deepEqual(m.fontes.map(c => [c.rotulo, c.opcao]), [['Usar as fontes do modelo 1', { operacao: 'usar_tipografia_de', direcao: 1 }], ['Usar as fontes do modelo 3', { operacao: 'usar_tipografia_de', direcao: 3 }]]);
  const semO3 = A.opcoesDe(estado({ direcoes: estado().direcoes.map(d => (d.id === 'c' ? { ...d, status: 'falhou' } : d)) }));
  assert.deepEqual(semO3.cores.map(c => c.opcao.direcao), [1], 'só os prontos');
  assert.equal(A.opcoesDe(estado({ escolha: null })), null, 'sem escolha, nada');
});

test('seções: a abertura fica; subir a partir da 3ª, descer até a penúltima, tirar só com mais de três; a versão ajustada manda', () => {
  const s = A.opcoesDe(estado()).secoes;
  assert.deepEqual(s.map(x => x.nome), ['Abertura', 'Sobre', 'Serviços', 'Depoimentos', 'Contato']);
  assert.equal(s[0].fixa, true);
  assert.ok(!s[0].subir && !s[0].descer && !s[0].tirar, 'a abertura não mexe');
  assert.equal(s[1].subir, undefined, 'a 2ª não sobe acima da abertura');
  assert.deepEqual(s[2].subir, { operacao: 'mover_antes_de', secao: 'servicos', referencia: 'sobre' });
  assert.deepEqual(s[2].descer, { operacao: 'mover_depois_de', secao: 'servicos', referencia: 'depoimentos' });
  assert.equal(s[4].descer, undefined, 'a última não desce');
  assert.deepEqual(s[4].tirar, { operacao: 'remover_secao', secao: 'contato' });
  const curta = A.opcoesDe(estado({ versao_final: { secoes: sec(['hero', 'servicos', 'contato']) } })).secoes;
  assert.deepEqual(curta.map(x => x.tipo), ['hero', 'servicos', 'contato'], 'a versão ajustada, não o modelo original');
  assert.ok(curta.every(x => !x.tirar), 'com três seções nada sai (o servidor recusaria)');
});

test('acrescentar: só seções que existem nos outros modelos e ainda não estão no seu, sem repetir', () => {
  const m = A.opcoesDe(estado());
  assert.deepEqual(m.adicionar.map(a => a.rotulo), ['Adicionar perguntas frequentes', 'Adicionar equipe']);
  assert.deepEqual(m.adicionar[0].opcao, { operacao: 'adicionar_secao', secao: 'faq' });
  const comFaq = A.opcoesDe(estado({ versao_final: { secoes: sec(['hero', 'faq', 'sobre', 'contato']) } }));
  assert.deepEqual(comFaq.adicionar.map(a => a.opcao.secao), ['servicos', 'equipe']);
});

test('aviso, desfazer e lista: o 1º ajuste pergunta antes; desfazer só quando o banco diz que dá; cada ajuste com a sua frase', () => {
  assert.equal(A.opcoesDe(estado()).confirmar, true, 'na etapa "escolhida", o 1º ajuste pergunta antes');
  assert.equal(A.opcoesDe(estado()).desfazer, false);
  const alts = [
    { origem: 'opcao', status: 'desfeita', pedido: 'Cores do modelo 1' },
    { origem: 'opcao', status: 'aplicada', pedido: 'Serviços depois de depoimentos' },
    { origem: 'livre', status: 'na_fila', pedido: 'Quero o mapa' },
    { origem: 'livre', status: 'aplicada', pedido: 'Horário no topo' },
    { origem: 'livre', status: 'recusada', pedido: 'Um aplicativo' },
    { origem: 'ia', status: 'aplicada', pedido: 'quero tema claro' }];
  const m = A.opcoesDe(estado({ conversa: { etapa: 'alteracoes' }, alteracoes: alts, pode_desfazer: true }));
  assert.equal(m.confirmar, false);
  assert.equal(m.desfazer, true);
  assert.deepEqual(m.lista, [
    { classe: 'is-nao is-desfeita', texto: 'Desfeito: Cores do modelo 1' },
    { classe: 'is-ok', texto: 'Serviços depois de depoimentos' },
    { classe: 'is-fila', texto: 'Aguardando: Quero o mapa' },
    { classe: 'is-ok', texto: 'Feito pela Beyon Zero: Horário no topo' },
    { classe: 'is-nao', texto: 'Não incluído: Um aplicativo' },
    { classe: 'is-ok', texto: 'Feito: quero tema claro' }]);
  assert.equal(m.livresRestantes, 0);
  assert.equal(A.opcoesDe(estado({ conversa: { etapa: 'alteracoes' }, alteracoes: alts, pode_desfazer: false })).desfazer, false, 'o último aplicado é do dono: o banco diz que não');
  assert.equal(A.opcoesDe(estado({ conversa: { etapa: 'escolhida' }, alteracoes: [], pode_desfazer: true })).desfazer, false, 'fora da etapa de ajustes, não');
});

test('conta dos pedidos escritos e teto de 30', () => {
  assert.equal(A.textoDaConta(3), 'Você pode fazer mais 3 pedidos.');
  assert.equal(A.textoDaConta(1), 'Você pode fazer mais 1 pedido.');
  assert.equal(A.textoDaConta(0), 'Você já fez os 3 pedidos escritos deste orçamento.');
  assert.equal(A.opcoesDe(estado()).livresRestantes, 3);
  const trinta = Array.from({ length: 30 }, () => ({ origem: 'opcao', status: 'desfeita', pedido: 'x' }));
  assert.equal(A.opcoesDe(estado({ conversa: { etapa: 'alteracoes' }, alteracoes: trinta })).limite, true);
  assert.equal(A.opcoesDe(estado({ conversa: { etapa: 'alteracoes' }, alteracoes: trinta.slice(1) })).limite, false);
});

test('a palavra é "modelo": nenhum texto da tela diz "direção"', () => {
  const textos = (fonte.match(/'[^'\n]*'/g) || []).filter(s => /dire[cç][aã]o/i.test(s));
  assert.deepEqual(textos, []);
});
