/* TRAVA "NEGAR SER IA" (api/_vendas/travas-identidade.mjs). Teste vermelho primeiro (relatório do PR).
   Este arquivo é importado por zero.test.mjs, que está na lista do script `testar`; também roda sozinho: node --test docs/testes/travas-identidade.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executarTurno } from '../../api/_vendas/agente.mjs';
import { semNegarSerIA, IDENTIDADE_FIXO, EXPERIENCIA_FIXO, EQUIPE_FIXO } from '../../api/_vendas/travas-identidade.mjs';
import { ABERTURA_PADRAO, ABERTURAS, RECADO_FIXO, DESCONTO_FIXO, semPromessaDeRecado, semPromessaDeDesconto } from '../../api/_vendas/zero.mjs';
import { semPromessaDeSuporte, semMensalidadeDoAtendente, SUPORTE_FIXO, ATENDENTE_FIXO } from '../../api/_vendas/travas-promessa.mjs';
import { semPromessaDeResultado, semGarantia, RESULTADO_FIXO, GARANTIA_FIXO, DADO_FIXO } from '../../api/_vendas/travas-resultado.mjs';
import { RESPOSTAS_PAGAMENTO, motivoDaTroca } from '../../api/_vendas/promessa.mjs';
import { semPrecoNoTexto } from '../../api/_vendas/seguranca.mjs';
import { SUPORTE_PASSAR, MENSALIDADE_PASSAR } from './travas-promessa-casos.mjs';
import { RESULTADO_PASSAR, GARANTIA_PASSAR } from './travas-resultado-casos.mjs';
import { LEVA1_PEGAR, LEVA1_PASSAR, LEVA2_PEGAR, LEVA2_PASSAR, FRONTEIRA_PEGAR, FUROS_IDENTIDADE_CONHECIDOS } from './travas-identidade-casos.mjs';
import { LEVA3_PEGAR, LEVA3_PASSAR } from './travas-identidade-leva3.mjs';
import { LEVA4_PEGAR, LEVA4_PASSAR } from './travas-identidade-leva4.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const nova = (extra = {}) => ({ etapa: 'descoberta', briefing: {}, mensagens: [], estimativa: null, ...extra });
const fim = texto => ({ texto, chamadas: [], conteudo: [{ type: 'text', text: texto }], parada: 'fim', custo_usd: 0.001 });
const roteiro = (...passos) => { let i = 0; return { mensagem: async () => passos[Math.min(i++, passos.length - 1)] }; };

const FIXOS_IDENTIDADE = [IDENTIDADE_FIXO, EXPERIENCIA_FIXO, EQUIPE_FIXO];
const cortaIdentidade = t => semNegarSerIA(t).trocou;

for (const [nome, pegar, passar] of [['leva 1', LEVA1_PEGAR, LEVA1_PASSAR], ['leva 2', LEVA2_PEGAR, LEVA2_PASSAR], ['leva 3', LEVA3_PEGAR, LEVA3_PASSAR], ['leva 4', LEVA4_PEGAR, LEVA4_PASSAR]]) {
  test('identidade [' + nome + ']: a frase que afirma ser pessoa/dono, nega ser IA ou finge experiência humana é trocada (' + pegar.length + ' frases)', () => {
    const furos = pegar.filter(t => !cortaIdentidade(t));
    assert.deepEqual(furos, [], furos.length + ' de ' + pegar.length + ' não pegas:\n' + furos.join('\n'));
  });
  test('identidade [' + nome + ']: a frase honesta passa intacta (' + passar.length + ' frases)', () => {
    const cortadas = passar.filter(cortaIdentidade);
    assert.deepEqual(cortadas, [], cortadas.length + ' de ' + passar.length + ' cortadas:\n' + cortadas.join('\n'));
    for (const t of passar) assert.equal(semNegarSerIA(t).texto, t);
  });
}

test('identidade: a fronteira decidida ("não sou um robô de respostas prontas, sou uma IA" ainda nega ser robô e é trocada)', () => {
  for (const t of FRONTEIRA_PEGAR) assert.equal(cortaIdentidade(t), true, t);
});

test('identidade: a negação dupla passa e a negação de IA corta (os exemplos do pedido, um a um)', () => {
  const passam = ['Sou a IA da Beyon Zero.', 'Não sou uma pessoa, sou uma IA.', 'O dono é uma pessoa de verdade e responde por e-mail.', 'Uma pessoa de verdade lê o recado.', 'Não sou o dono.', 'Existe um robô de busca do Google.', 'O humano que toca a empresa é o dono.'];
  for (const t of passam) assert.equal(cortaIdentidade(t), false, t);
  const cortam = ['Não sou um robô.', 'Sou uma pessoa de verdade.', 'Sou humano.', 'Aqui é o dono.', 'Falo aqui eu mesmo, o Fernando.', 'Sou atendente humano.', 'Eu sou o proprietário.', 'Na minha experiência, isso funciona.', 'Já atendi muitos clientes.', 'Ontem eu vi isso.', 'Conversei com ele por telefone.', 'Nossa equipe cuida disso.'];
  for (const t of cortam) assert.equal(cortaIdentidade(t), true, t);
});

test('identidade: cada classe troca pelo seu texto fixo, o resto da resposta fica e cada texto entra uma vez só', () => {
  const a = semNegarSerIA('Entendi. Sou uma pessoa de verdade. Qual é o seu ramo?');
  assert.equal(a.texto, 'Entendi. ' + IDENTIDADE_FIXO + ' Qual é o seu ramo?');
  assert.deepEqual(a.classes, ['identidade']);
  assert.equal(semNegarSerIA('Na minha experiência, isso funciona. Qual é o seu ramo?').texto, EXPERIENCIA_FIXO + ' Qual é o seu ramo?');
  assert.equal(semNegarSerIA('Nossa equipe monta os modelos. Qual é o seu ramo?').texto, EQUIPE_FIXO + ' Qual é o seu ramo?');
  const dupla = semNegarSerIA('Sou humano. Aqui é o dono. Não sou um robô.');
  assert.equal(dupla.texto, IDENTIDADE_FIXO);
  const mista = semNegarSerIA('Sou humano. Já atendi muitos clientes. Nossa equipe ajuda.');
  assert.deepEqual([...mista.classes].sort(), ['equipe', 'experiencia', 'identidade']);
  assert.equal(mista.texto, [IDENTIDADE_FIXO, EXPERIENCIA_FIXO, EQUIPE_FIXO].join(' '));
  assert.equal(semNegarSerIA('').trocou, false);
  assert.equal(semNegarSerIA(null).texto, '');
  assert.equal(semNegarSerIA(undefined).trocou, false);
});

test('identidade: os textos fixos são honestos, curtos, sem o nome do dono, e não disparam nenhuma trava (nem a própria)', () => {
  for (const fixo of FIXOS_IDENTIDADE) {
    assert.equal(semNegarSerIA(fixo).trocou, false, 'a trava não corta o próprio texto: ' + fixo);
    assert.equal(semPromessaDeResultado(fixo).trocou, false, fixo);
    assert.equal(semGarantia(fixo).trocou, false, fixo);
    assert.equal(semPromessaDeSuporte(fixo).trocou, false, fixo);
    assert.equal(semMensalidadeDoAtendente(fixo).trocou, false, fixo);
    assert.equal(semPromessaDeDesconto(fixo).trocou, false, fixo);
    assert.equal(semPromessaDeRecado(fixo).trocou, false, fixo);
    assert.equal(semPrecoNoTexto(fixo), fixo, 'o filtro de preço não mexe: ' + fixo);
    assert.equal(motivoDaTroca(fixo), null, 'o filtro de pagamento não mexe: ' + fixo);
    assert.match(fixo, /^[^\n]+$/, 'uma linha só');
    assert.ok(fixo.length < 260, 'cabe folgado nos 400 caracteres que o código pode acrescentar: ' + fixo.length);
    assert.match(fixo, /inteligência artificial/, 'diz que é IA');
    assert.doesNotMatch(fixo, /fernando/i, 'não diz o nome do dono');
    assert.doesNotMatch(fixo, /\d/, 'sem número');
  }
  assert.match(IDENTIDADE_FIXO, /dono/);
  assert.match(IDENTIDADE_FIXO, /DEIXAR UM RECADO/, 'o texto manda para o botão que o agente liga junto');
  assert.match(EXPERIENCIA_FIXO, /não tenho experiência própria/);
  assert.doesNotMatch(EQUIPE_FIXO, /nossa equipe/i);
});

test('identidade: nenhuma fala fixa do Zero nem texto fixo das outras travas é cortado, nem as frases honestas das outras travas', () => {
  const fixas = [ABERTURA_PADRAO, RECADO_FIXO, SUPORTE_FIXO, ATENDENTE_FIXO, RESULTADO_FIXO, GARANTIA_FIXO, DADO_FIXO, DESCONTO_FIXO, ...Object.values(ABERTURAS), ...Object.values(RESPOSTAS_PAGAMENTO)];
  assert.deepEqual(fixas.filter(cortaIdentidade), [], 'texto fixo cortado');
  const boas = [...RESULTADO_PASSAR, ...GARANTIA_PASSAR, ...SUPORTE_PASSAR, ...MENSALIDADE_PASSAR].filter(cortaIdentidade);
  assert.deepEqual(boas, [], 'frase honesta de outra trava cortada: ' + boas.join(' | '));
});

test('identidade: o gabarito do classificador (nega_ser_ia) — nenhum controle é cortado e os positivos ficam pegos', () => {
  const g = JSON.parse(fs.readFileSync(new URL('../gabarito/classificador/saida_do_zero.json', import.meta.url), 'utf8'));
  const certa = c => c.certa.nega_ser_ia ?? g.padrao.nega_ser_ia;
  const falsosSim = g.casos.filter(c => certa(c) === 'nao' && cortaIdentidade(c.texto)).map(c => c.id + ': ' + c.texto);
  assert.deepEqual(falsosSim, [], 'falso "sim" no gabarito (corta resposta boa)');
  const positivos = g.casos.filter(c => certa(c) === 'sim');
  assert.equal(positivos.length, 10);
  const faltam = positivos.filter(c => !cortaIdentidade(c.texto)).map(c => c.id);
  assert.deepEqual(faltam, [], 'positivos do gabarito que a trava não pegou');
});

test('identidade: os furos conhecidos estão documentados (melhorar a trava só gera um aviso, nunca vermelho)', () => {
  const pegas = FUROS_IDENTIDADE_CONHECIDOS.filter(cortaIdentidade);
  if (pegas.length) console.warn('[aviso] ' + pegas.length + ' de ' + FUROS_IDENTIDADE_CONHECIDOS.length + ' furos de identidade já são pegos; mova para PEGAR:\n  ' + pegas.join('\n  '));
  assert.ok(FUROS_IDENTIDADE_CONHECIDOS.length >= 6 && FUROS_IDENTIDADE_CONHECIDOS.every(t => typeof t === 'string' && t.length > 3));
  const todas = [LEVA1_PEGAR, LEVA1_PASSAR, LEVA2_PEGAR, LEVA2_PASSAR, LEVA3_PEGAR, LEVA3_PASSAR, LEVA4_PEGAR, LEVA4_PASSAR].reduce((n, l) => n + l.length, 0);
  assert.ok(todas >= 500, 'pelo menos 500 frases de caso: ' + todas);
});

test('identidade: entrada estranha não quebra nem demora (ReDoS: 50 mil caracteres patológicos)', () => {
  const ruins = [
    '', '   ', null, undefined, 'a'.repeat(50000), 'sou '.repeat(12500), 'sou uma '.repeat(6250), 'não '.repeat(12500), 'pessoa '.repeat(7000), 'aqui é o '.repeat(5500),
    'não sou um '.repeat(4500), 'a nossa '.repeat(6250), 'já '.repeat(16000), 'minha '.repeat(8000), 'eu mesmo '.repeat(5500), 'a\n'.repeat(25000), 'a. '.repeat(16000),
    'a, '.repeat(16000), 'sou, '.repeat(10000), 'quem está falando '.repeat(2900), 'ontem '.repeat(8000), '1.'.repeat(25000) + 'x', ('x'.repeat(40) + ' ').repeat(1200) + 'sou humano',
    'meu nome é '.repeat(4500), 'você está falando com '.repeat(2300), 'tenho 10 anos de '.repeat(3000)
  ];
  const ini = performance.now();
  for (const c of ruins) assert.equal(typeof semNegarSerIA(c).trocou, 'boolean');
  assert.ok(performance.now() - ini < 3000, 'a trava responde rápido em texto hostil: ' + (performance.now() - ini).toFixed(1) + ' ms');
});

test('turno: o modelo que diz ser pessoa/dono ou nega ser IA sai com o texto fixo honesto, o botão de recado liga, e a resposta honesta fica', async () => {
  const r = await executarTurno({ ia: roteiro(fim('Sou uma pessoa de verdade, pode ficar tranquilo.')), regras: REGRAS, conversa: nova(), mensagem: 'você é um robô?' });
  assert.equal(r.resposta, IDENTIDADE_FIXO);
  assert.equal(r.diagnostico, 'recado', 'o texto manda para o botão e o botão aparece');
  const exp = await executarTurno({ ia: roteiro(fim('Na minha experiência, esse formato serve. Qual é o seu ramo?')), regras: REGRAS, conversa: nova(), mensagem: 'esse formato serve?' });
  assert.equal(exp.resposta, EXPERIENCIA_FIXO + ' Qual é o seu ramo?');
  assert.equal(exp.diagnostico, null, 'a experiência não liga o botão');
  const eq = await executarTurno({ ia: roteiro(fim('Nossa equipe monta os modelos. Qual é o seu ramo?')), regras: REGRAS, conversa: nova(), mensagem: 'quem monta?' });
  assert.equal(eq.resposta, EQUIPE_FIXO + ' Qual é o seu ramo?');
  const certo = await executarTurno({ ia: roteiro(fim('Sou uma IA, o Zero da Beyon Zero. Qual é o seu ramo?')), regras: REGRAS, conversa: nova(), mensagem: 'você é um robô?' });
  assert.equal(certo.resposta, 'Sou uma IA, o Zero da Beyon Zero. Qual é o seu ramo?');
  assert.equal(certo.diagnostico, null);
  const naoPessoa = await executarTurno({ ia: roteiro(fim('Não sou uma pessoa, sou uma IA. O dono é uma pessoa de verdade e responde por e-mail.')), regras: REGRAS, conversa: nova(), mensagem: 'tem gente aí?' });
  assert.equal(naoPessoa.resposta, 'Não sou uma pessoa, sou uma IA. O dono é uma pessoa de verdade e responde por e-mail.');
  /* o valor do motor continua entrando depois da troca, e o teto de 1.500 vale com as trocas somadas */
  const comValor = await executarTurno({ ia: roteiro(fim('O formato fica [[total]]. Sou humano, pode confiar.')), regras: REGRAS, conversa: nova({ estimativa: { valor_total: 2900, sinal: 1160 } }), mensagem: 'quanto fica?' });
  assert.match(comValor.resposta, /R\$/);
  assert.ok(comValor.resposta.includes(IDENTIDADE_FIXO));
  const enche = 'Entendi o seu caso e vou explicar com calma como funciona cada parte do trabalho. '.repeat(12);
  const longo = await executarTurno({ ia: roteiro(fim(enche + 'Sou humano. Já atendi muitos clientes. Nossa equipe ajuda. Qual é o seu ramo?')), regras: REGRAS, conversa: nova(), mensagem: 'oi' });
  assert.ok(longo.resposta.length <= 1500, 'passou do teto: ' + longo.resposta.length);
  assert.match(longo.resposta, /[.!?]$/);
});
