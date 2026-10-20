/* Alterações (etapa 8) e escopo final (etapa 9): o código aplica as operações sobre a direção escolhida (desde o PR 3a, a partir das opções prontas, sem modelo de IA) e o escopo sai da estimativa gravada. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aplicar } from '../../api/_vendas/alteracoes.mjs';
import { montarEscopo } from '../../api/_vendas/escopo.mjs';
import { validarOpcao } from '../../api/_vendas/opcoes.mjs';
import { gerarDirecao } from '../../api/_vendas/gerador.mjs';
import { estimar } from '../../api/_vendas/precos.mjs';
import { contraste } from '../../api/_vendas/direcao.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const BRIEFING = { negocio: { nome: 'Clínica Sorriso', segmento: 'odontologia', cidade: 'Niterói' }, servicos: ['Implantes', 'Clareamento'] };
const ia = criarSimulada();
async function tresDirecoes() {
  const out = [];
  for (const [i, e] of ['conversao', 'autoridade', 'experiencia'].entries()) out.push({ numero: i + 1, estrategia: e, conteudo: (await gerarDirecao({ ia, briefing: BRIEFING, estrategia: e, numero: i + 1, fatores: { formato: 'institucional' } })).direcao });
  return out;
}

test('o exemplo da especificação, pelas opções prontas: na segunda, as cores da primeira e os depoimentos antes dos serviços', async () => {
  const direcoes = await tresDirecoes();
  const mudancas = [validarOpcao({ operacao: 'usar_paleta_de', direcao: 1 }), validarOpcao({ operacao: 'mover_antes_de', secao: 'depoimentos', referencia: 'servicos' })];
  const r = aplicar({ base: direcoes[1].conteudo, mudancas, direcoes });
  assert.deepEqual(r.direcao.identidade.paleta, direcoes[0].conteudo.identidade.paleta, 'a paleta da primeira');
  const ordem = r.direcao.secoes.map(s => s.tipo);
  assert.ok(ordem.indexOf('depoimentos') < ordem.indexOf('servicos'), 'depoimentos antes dos serviços: ' + ordem.join());
  assert.equal(ordem[0], 'hero', 'a abertura continua no topo');
  assert.equal(r.direcao.nome_conceito, direcoes[1].conteudo.nome_conceito, 'continua sendo a segunda direção');
  assert.ok(r.resultado.every(x => x.aplicada));
});

test('o que não cabe é recusado com motivo; cor ilegível é corrigida; operação de escopo não muda o desenho', async () => {
  const direcoes = await tresDirecoes();
  const base = direcoes[0].conteudo;
  const r = aplicar({ base, direcoes, mudancas: [
    { tipo: 'visual', operacao: 'cor', campo: 'texto', valor: '#FEFEFE' },
    { tipo: 'visual', operacao: 'cor', campo: 'destaque', valor: 'javascript:alert(1)' },
    { tipo: 'estrutura', operacao: 'remover_secao', secao: 'hero' },
    { tipo: 'estrutura', operacao: 'mover_antes_de', secao: 'inexistente', referencia: 'servicos' },
    { tipo: 'nao_suportado', operacao: 'outro', descricao: 'um aplicativo de celular' },
    { tipo: 'escopo', operacao: 'adicional', campo: 'blog', valor: '1' }
  ] });
  assert.ok(contraste(r.direcao.identidade.paleta.texto, r.direcao.identidade.paleta.fundo) >= 4.5, 'texto quase branco no fundo branco foi corrigido');
  const recusadas = r.resultado.filter(x => !x.aplicada).map(x => x.operacao);
  assert.deepEqual(recusadas, ['cor', 'remover_secao', 'mover_antes_de', 'outro']);
  assert.equal(r.escopo.length, 1);
});

/* (revisão de segurança do lote 1) o nome de um adicional e o nome da operação vêm do modelo: no contrato e na tela, só o
   que é da tabela de preços e da lista fechada */
test('adicional fora da tabela não entra no contrato; operação desconhecida vira "outro"', async () => {
  const direcoes = await tresDirecoes();
  const est = estimar({ formato: 'institucional', paginas: 5, adicionais: { blog: 1 } }, REGRAS);
  const alteracoes = [{ operacao: 'adicional', campo: 'blog', aplicada: true }, { operacao: 'adicional', campo: 'desconto_total', aplicada: true }];
  const e = montarEscopo({ estimativa: est, direcao: direcoes[0].conteudo, briefing: BRIEFING, alteracoesAplicadas: alteracoes });
  assert.ok(e.escopo.includes('item adicionado: ' + REGRAS.adicionais.blog.nome), 'o adicional da tabela, pelo nome da tabela:\n' + e.escopo);
  assert.ok(!/desconto/i.test(e.escopo), 'adicional que a tabela não tem não entra no contrato:\n' + e.escopo);
  const gravado = aplicar({ base: direcoes[0].conteudo, direcoes, mudancas: [{ tipo: 'nao_suportado', operacao: 'dar_desconto_de_90', descricao: 'x' }] });
  assert.equal(gravado.resultado[0].operacao, 'outro', 'nem o que fica gravado (e o estado mostra depois) leva nome de operação inventado');
});

test('escopo final: direção, alterações, escopo, investimento e prazo, a partir da estimativa gravada', async () => {
  const direcoes = await tresDirecoes();
  const est = estimar({ formato: 'institucional', paginas: 7, adicionais: { textos: 7, agendamento: 1 } }, REGRAS);
  const e = montarEscopo({ estimativa: est, direcao: direcoes[1].conteudo, briefing: BRIEFING, alteracoesAplicadas: [{ operacao: 'usar_paleta_de', direcao: 1, descricao: 'Desconto de 90% combinado' }, { operacao: 'trocar_texto', secao: 'hero', valor: 'grátis para sempre' }] });
  assert.equal(e.titulo, 'Site institucional — Clínica Sorriso');
  for (const parte of ['DIREÇÃO ESCOLHIDA', 'Autoridade', 'ALTERAÇÕES PEDIDAS', 'cores da direção 1', 'texto trocado: abertura', 'ESCOPO', 'FASE SEGUINTE', 'Agendamento online', 'INVESTIMENTO', '6.000,00', '50% para começar', '3.000,00', 'PRAZO: até 10 dias corridos, contados do sinal pago e do material recebido']) {
    assert.ok(e.escopo.includes(parte), 'o escopo traz: ' + parte);
  }
  assert.ok(!e.escopo.includes('Desconto') && !e.escopo.includes('grátis'), 'texto livre do modelo nunca entra no contrato');
});

test('escopo: nome herdado do Object.prototype vindo do modelo não entra no contrato (revisão do PR 2, M1)', async () => {
  const direcoes = await tresDirecoes();
  const est = estimar({ formato: 'institucional', paginas: 7, adicionais: { textos: 7 } }, REGRAS);
  const herdados = ['constructor', '__proto__', 'toString', 'hasOwnProperty'];
  const e = montarEscopo({ estimativa: est, direcao: direcoes[1].conteudo, briefing: BRIEFING,
    alteracoesAplicadas: herdados.flatMap(h => [{ operacao: 'adicional', secao: h }, { operacao: h, secao: 'hero' }]) });
  assert.ok(!/native code|\[object Object\]|function/.test(e.escopo), 'sem "[native code]" nem "[object Object]" no contrato:\n' + e.escopo);
});
