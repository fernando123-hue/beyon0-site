/* RODADA REAL 8, AJUSTE 2: o que o modelo lê quando o 1º desenho é recusado. Tem de dizer o que fazer (troque por quê, quanto passou), sem devolver o texto dele.
   node --test docs/testes/planta-orientacao.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errosParaModelo, resolverDesenho, turnoDaPlantaInicial } from '../../api/_vendas/planta.mjs';
import { planoPadrao } from '../../api/_vendas/planta-padrao.mjs';

test('marca: diz o que trocar (rede social, aplicativo de mensagens) e o que vale', () => {
  const [m] = errosParaModelo([{ caminho: 'etapas[1].frase', codigo: 'marca' }]);
  assert.match(m, /rede social/);
  assert.match(m, /aplicativo de mensagens/);
  assert.match(m, /OAB/);
});

test('prazo: vale mesmo negando e lista as palavras de tempo', () => {
  const [m] = errosParaModelo([{ caminho: 'etapas[3].frase', codigo: 'prazo' }]);
  assert.match(m, /mesmo (?:negando|com "sem")/);
  assert.match(m, /imediat/);
});

test('campo fora da topologia: diz quais campos cada topologia usa', () => {
  const [m] = errosParaModelo([{ caminho: 'etapas[2].retorno', codigo: 'campo_fora_da_topologia' }]);
  assert.match(m, /laco.*retorno/);
  assert.match(m, /bifurca.*ramo/);
  assert.match(m, /espinha.*satelite_de/);
});

test('frase longa: diz quantos caracteres tem, sem devolver o texto', () => {
  const p = JSON.parse(JSON.stringify(planoPadrao('saude_agenda')));
  const longa = 'A pessoa chega pela busca e vê as áreas de atuação do escritório, o perfil de quem atende e a forma de marcar uma conversa inicial.';
  p.etapas[1].frase = longa;
  const d = resolverDesenho({ entrada: p, briefing: {}, turno: turnoDaPlantaInicial(), ctx: { estimativaNoInicio: true, nMensagens: 2, regulado: false, nomeDoNegocio: '' } });
  assert.equal(d.saida.ok, false);
  const msg = d.saida.erros.join(' | ');
  assert.match(msg, new RegExp('tem ' + longa.length + ' caracteres'));
  assert.match(msg, /110/);
  assert.ok(!msg.includes('escritório'), 'o texto do modelo não volta');
});
