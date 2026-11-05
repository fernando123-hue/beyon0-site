/* O ZERO (decisão do dono, 2026-10-31): o consultor de IA ganha nome e persona, e as regras que mais pesam saem do prompt
   e passam para o CÓDIGO (um modelo, mesmo o Sonnet, pode errar):
   • recado: o Zero não envia, não deixa e não avisa ninguém; só a pessoa, no botão DEIXAR UM RECADO;
   • saúde e regulados: nunca depoimento, antes e depois, nem preço ou promoção de procedimento, em nenhuma resposta;
   • valor: o modelo escreve [[total]], [[sinal]] e [[restante]]; o número exato vem do motor, depois dos filtros;
   • modelo: a conversa roda no Sonnet 5.5 em esforço médio; a extração do briefing segue no Haiku.
   Teste vermelho primeiro (relatório de 31/10: "Pode incluir, com cuidado" para dentista; "Deixei o recado" sem recado).
   npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executarTurno } from '../../api/_vendas/agente.mjs';
import { montarSistema, ferramentas, IDENTIDADE } from '../../api/_vendas/consultor.mjs';
import { PAPEIS, TETOS, custoUsd, RESERVA_USD } from '../../api/_ia/config.mjs';
import {
  RECADO_FIXO, ETIQUETA, ABERTURA_PADRAO, ABERTURAS, semPromessaDeRecado, nichoRegulado, pedeItemProibido,
  garantirRegulado, comMarcadores, briefingSemProibidos, respostaRegulado, semNotacaoInterna, pedeValor, garantirValor, cortarEmFrase, semPromessaDeDesconto
} from '../../api/_vendas/zero.mjs';
import { semPromessaDeSuporte, semMensalidadeDoAtendente, SUPORTE_FIXO, ATENDENTE_FIXO, PONTUACAO, CONTRASTE, limpa } from '../../api/_vendas/travas-promessa.mjs';
import { SUPORTE_PEGAR, SUPORTE_PASSAR, MENSALIDADE_PEGAR, MENSALIDADE_PASSAR, FUROS_CONHECIDOS } from './travas-promessa-casos.mjs';
import { semPromessaDeResultado, semGarantia, RESULTADO_FIXO, GARANTIA_FIXO, DADO_FIXO } from '../../api/_vendas/travas-resultado.mjs';
import { normalizar } from '../../api/_vendas/promessa.mjs';
import { RESULTADO_PEGAR, RESULTADO_PASSAR, GARANTIA_PEGAR, GARANTIA_PASSAR, FUROS_RESULTADO_CONHECIDOS, FUROS_DA_RODADA_2, RODADA2_PEGAR, RODADA2_PASSAR, RODADA2_EXTRA_PEGAR, RODADA2_EXTRA_PASSAR, RODADA3_PEGAR, RODADA3_DADO, RODADA3_PASSAR } from './travas-resultado-casos.mjs';
import { semPrecoNoTexto } from '../../api/_vendas/seguranca.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const nova = (extra = {}) => ({ etapa: 'descoberta', briefing: {}, mensagens: [], estimativa: null, ...extra });
const fim = texto => ({ texto, chamadas: [], conteudo: [{ type: 'text', text: texto }], parada: 'fim', custo_usd: 0.001 });
const comFerr = (...cs) => ({ texto: '', chamadas: cs, conteudo: cs.map(c => ({ type: 'tool_use', id: c.id, name: c.nome, input: c.entrada })), parada: 'ferramenta', custo_usd: 0.001 });
function roteiro(...passos) {
  const recebidos = [];
  let i = 0;
  return { recebidos, mensagem: async p => { recebidos.push(JSON.parse(JSON.stringify(p))); return passos[Math.min(i++, passos.length - 1)]; } };
}

/* ---------- 1. o recado: o Zero não envia nada ---------- */
test('recado: "deixei", "avisei", "mandei pro dono", "já está com ele" e afins viram o texto fixo do botão', () => {
  const proibidas = [
    'Deixei o recado para a equipe.',
    'Já deixei seu recado, o dono responde por e-mail.',
    'Avisei o dono sobre o seu pedido.',
    'Mandei pro dono a sua dúvida.',
    'Enviei a sua mensagem para a equipe.',
    'Encaminhei o seu caso.',
    'Repassei isso pra ele.',
    'Registrei o seu pedido e anotei pro dono.',
    'O recado foi enviado.',
    'Seu recado já foi registrado.',
    'A equipe já foi avisada.',
    'O dono já foi notificado.',
    'Já está com ele, pode ficar tranquilo.',
    'Vou passar pra ele agora.',
    'Vou avisar o dono ainda hoje.',
    'Vou deixar o recado para o dono.',
    'O dono responde ainda hoje.',
    'A equipe responde em até 24 horas.',
    'O dono já viu o seu caso.'
  ];
  for (const p of proibidas) {
    const r = semPromessaDeRecado(p);
    assert.equal(r.trocou, true, 'devia trocar: ' + p);
    assert.equal(r.texto, RECADO_FIXO, p);
  }
});

test('recado: a frase fixa é a única forma de falar do recado, e o resto da resposta fica', () => {
  assert.match(RECADO_FIXO, /DEIXAR UM RECADO/);
  assert.match(RECADO_FIXO, /dono lê e responde por e-mail/);
  assert.doesNotMatch(RECADO_FIXO, /deixei|avisei|enviei|equipe/i);
  const r = semPromessaDeRecado('Desconto eu não consigo dar. Deixei o recado para o dono. O preço é o mesmo para todo mundo.');
  assert.equal(r.trocou, true);
  assert.equal(r.texto, 'Desconto eu não consigo dar. ' + RECADO_FIXO + ' O preço é o mesmo para todo mundo.');
  /* duas promessas na mesma resposta: o texto fixo aparece uma vez só */
  const duas = semPromessaDeRecado('Avisei o dono. Já mandei pra equipe.');
  assert.equal(duas.texto, RECADO_FIXO);
});

test('recado: o que NÃO é promessa passa intacto (oferta do botão, negação, conversa normal)', () => {
  const ok = [
    'Se quiser, toque em DEIXAR UM RECADO aqui embaixo. O dono lê e responde por e-mail.',
    'Isso eu não consigo confirmar aqui.',
    'Eu não deixei nenhum recado: só você pode deixar, pelo botão.',
    'Anotei a clínica e o agendamento online.',
    'Registrei que você vende roupa feminina.',
    'Informei o prazo que a estimativa devolveu: 8 dias úteis.',
    'Se quiser tratar disso com o dono, toque em DEIXAR UM RECADO aqui embaixo.',
    'Depois de aceitar, são 7 dias pra desistir e receber a entrada de volta.',
    'Quer ver três modelos pra sua loja, sem pagar nada agora?'
  ];
  for (const t of ok) assert.deepEqual(semPromessaDeRecado(t), { texto: t, trocou: false }, t);
});

test('recado: variações com acento, caixa alta e letras trocadas também são pegas', () => {
  for (const t of ['DEIXEI O RECADO!', 'Deíxei o recádo pra equípe', 'd e i x e i o recado', 'Já a v i s e i o dono']) {
    assert.equal(semPromessaDeRecado(t).trocou, true, t);
  }
});

test('turno: a resposta do modelo que diz "deixei o recado" sai com o texto fixo e o botão aparece (diagnóstico)', async () => {
  const ia = roteiro(fim('Entendi. Deixei o recado para a equipe, eles te respondem hoje.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'quero falar com uma pessoa' });
  assert.doesNotMatch(r.resposta, /deixei|equipe|hoje/i);
  assert.match(r.resposta, /DEIXAR UM RECADO/);
  assert.ok(r.diagnostico, 'o botão do recado aparece junto da mensagem');
});

test('turno: o resultado de encaminhar_diagnostico diz ao modelo que NADA foi enviado', async () => {
  const ia = roteiro(comFerr({ id: 'c1', nome: 'encaminhar_diagnostico', entrada: { motivo: 'pediu falar com uma pessoa' } }), fim('Se quiser, toque em DEIXAR UM RECADO aqui embaixo. O dono lê e responde por e-mail.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'posso falar com o dono?' });
  const resultado = JSON.parse(ia.recebidos[1].mensagens.at(-1).content[0].content);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.enviado, false);
  assert.match(resultado.aviso, /botão[^.]*apareceu na tela[^.]*nada foi enviado/i);
  assert.ok(r.diagnostico);
});

/* ---------- 2. saúde e regulados ---------- */
test('regulados: o detector pega saúde e advocacia pelo que a pessoa diz, e não pega o que é ambíguo', () => {
  const casos = {
    'sou dentista e quero um site': 'CRO',
    'tenho uma clínica odontológica': 'CRO',
    'sou psicóloga': 'CRP',
    'atendo como nutricionista': 'CRN',
    'tenho um consultório de fisioterapia': 'CREFITO',
    'sou médico, atendo em consultório': 'CRM',
    'clínica de dermatologia': 'CRM',
    'tenho um escritório de advocacia': 'OAB',
    'sou advogado trabalhista': 'OAB',
    'faço harmonização facial': 'conselho'
  };
  for (const [texto, conselho] of Object.entries(casos)) {
    const n = nichoRegulado(texto);
    assert.ok(n, 'devia travar: ' + texto);
    assert.equal(n.conselho, conselho, texto);
  }
  for (const texto of ['tenho uma padaria', 'loja de roupa feminina', 'clínica veterinária', 'sou médico veterinário', 'estética automotiva', 'lava-jato e estética de carros', 'pet shop com banho e tosa', 'meu advogado vai ler o contrato', 'restaurante japonês']) {
    assert.equal(nichoRegulado(texto), null, 'ambíguo ou fora: ' + texto);
  }
});

test('regulados: o pedido proibido é reconhecido (depoimento, antes e depois, preço e promoção de procedimento)', () => {
  for (const t of ['quero depoimento de paciente no site', 'põe antes e depois', 'quero colocar o preço do clareamento', 'vou fazer promoção de botox', 'quero uma tabela de preços das consultas', 'primeira sessão grátis', 'vou fazer um sorteio de limpeza', 'quero as avaliações dos meus pacientes', 'Antes/Depois dos casos']) {
    assert.equal(pedeItemProibido(t), true, t);
  }
  for (const t of ['quero mostrar o endereço e como marcar', 'quanto custa um site para minha clínica?', 'o preço do site é igual para todo mundo?', 'quero falar das especialidades', 'qual o valor do site para tratamento de pacientes']) {
    assert.equal(pedeItemProibido(t), false, t);
  }
});

test('regulados: a resposta do modelo que libera o proibido vira a recusa fixa, com o conselho certo', () => {
  const dentista = nichoRegulado('sou dentista');
  const liberam = [
    'Pode incluir, com cuidado.',
    'Claro, dá pra colocar depoimento de paciente e o antes e depois.',
    'Pode sim, o preço do clareamento entra na página.',
    'Sem problema, a gente coloca as fotos de antes e depois.',
    'Vamos incluir uma tabela de preços dos procedimentos.'
  ];
  for (const t of liberam) {
    const r = garantirRegulado(t, { nicho: dentista, pediuAgora: true });
    assert.equal(r.trocou, true, t);
    assert.equal(r.texto, respostaRegulado(dentista), t);
  }
  const fixa = respostaRegulado(dentista);
  assert.match(fixa, /^Entendo a vontade\./);
  assert.match(fixa, /depoimento/); assert.match(fixa, /antes e depois/); assert.match(fixa, /preço/);
  assert.match(fixa, /CRO/);
  assert.match(fixa, /política|a Beyon não coloca/i);
  assert.doesNotMatch(fixa, /a lei|é proibido|ilegal/i, 'recusa como política da Beyon, nunca como "a lei proíbe tudo"');
  assert.match(fixa, /como marcar/);
  assert.doesNotMatch(fixa, /nossa equipe/i);
  assert.doesNotMatch(fixa, /—/);
  assert.match(respostaRegulado(nichoRegulado('sou advogado')), /OAB/);
  assert.match(respostaRegulado(nichoRegulado('sou psicóloga')), /CRP/);
});

test('regulados: a recusa certa do modelo passa; fora de nicho regulado nada muda', () => {
  const dentista = nichoRegulado('sou dentista');
  const boa = 'Entendo a vontade. Em site de dentista a Beyon não coloca depoimento nem antes e depois. Dá pra mostrar quem você é, o número do CRO e como marcar. Seguimos assim?';
  assert.deepEqual(garantirRegulado(boa, { nicho: dentista, pediuAgora: true }), { texto: boa, trocou: false });
  /* conversa comum, sem pedido proibido: não mexe, nem em resposta que cita depoimento só para recusar */
  const conversa = 'Beleza. Qual especialidade você quer destacar primeiro?';
  assert.deepEqual(garantirRegulado(conversa, { nicho: dentista, pediuAgora: false }), { texto: conversa, trocou: false });
  /* fora de nicho: loja pode ter depoimento */
  assert.deepEqual(garantirRegulado('Pode incluir depoimentos de clientes.', { nicho: null, pediuAgora: true }), { texto: 'Pode incluir depoimentos de clientes.', trocou: false });
  /* pediu, o modelo desviou sem recusar: também vira a recusa */
  const desvio = garantirRegulado('Boa ideia, vamos ver isso juntos mais adiante.', { nicho: dentista, pediuAgora: true });
  assert.equal(desvio.trocou, true);
});

/* (03/11: a simulação mostrou que oferecer o recado na insistência dava a entender que o dono libera o proibido: a posição fica numa frase, sem recado) */
test('regulados: insistência mantém em uma frase, sem oferecer recado', () => {
  const n = nichoRegulado('sou dentista');
  const r = garantirRegulado('Pode incluir.', { nicho: n, pediuAgora: true, insistencia: true });
  assert.equal(r.trocou, true);
  assert.doesNotMatch(r.texto, /RECADO/, 'o dono não libera o proibido: nada de recado aqui');
  assert.equal(r.texto.split(/[.?!]\s/).length <= 4, true, 'curta');
  assert.doesNotMatch(r.texto, /^Entendo a vontade/, 'não repete o parágrafo inteiro');
});

test('regulados: outras formas honestas de recusar também passam (não troca a recusa certa por outra igual)', () => {
  const n = nichoRegulado('sou advogado');
  for (const t of ['Depoimento de cliente e preço de honorários ficam de fora do site de advocacia.', 'Isso eu não posso colocar: a Beyon só faz site informativo para advogado.', 'Não vamos incluir depoimento nem tabela de preços, é política da Beyon.']) {
    assert.equal(garantirRegulado(t, { nicho: n, pediuAgora: true }).trocou, false, t);
  }
});

test('turno: a mensagem de agora não some atrás de um histórico enorme (o detector olha cada fonte à parte)', async () => {
  const enorme = 'conversa de padaria '.repeat(150);   /* (3.000 caracteres antes da profissão) */
  const ia = roteiro(fim('Pode incluir depoimento, sim.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova({ mensagens: [{ papel: 'visitante', conteudo: enorme }] }), mensagem: 'sou dentista e quero depoimento de paciente' });
  assert.match(r.resposta, /CRO/);
});

test('turno: dentista pede depoimento e o modelo diz "pode incluir, com cuidado": a tela recebe a recusa fixa', async () => {
  const ia = roteiro(fim('Pode incluir, com cuidado. Quer também o preço do clareamento?'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'sou dentista, quero depoimento de paciente, antes e depois e o preço do clareamento' });
  assert.equal(r.resposta, respostaRegulado(nichoRegulado('dentista')));
  assert.doesNotMatch(r.resposta, /pode incluir/i);
});

test('turno: o estado do código avisa o modelo que o nicho é regulado (e o que não pode prometer)', async () => {
  const ia = roteiro(fim('Entendo a vontade. Em site de dentista a Beyon não coloca depoimento, antes e depois nem preço de procedimento.'));
  await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'sou dentista, quero depoimento de paciente' });
  const [operador] = ia.recebidos[0].contexto.split('BRIEFING DO VISITANTE');
  assert.match(operador, /saude_regulada/);
  assert.match(operador, /CRO/);
  assert.match(operador, /depoimento/);
  /* conversa comum: sem o aviso */
  const ia2 = roteiro(fim('Que tipo de negócio você tem?'));
  await executarTurno({ ia: ia2, regras: REGRAS, conversa: nova(), mensagem: 'oi' });
  assert.doesNotMatch(ia2.recebidos[0].contexto, /saude_regulada/);
});

test('turno: o nicho vale a sessão inteira (briefing e histórico), mesmo que a mensagem de agora não cite a profissão', async () => {
  const doBriefing = nova({ briefing: { negocio: { segmento: 'consultório de psicologia' } } });
  const ia = roteiro(fim('Pode colocar depoimento sim, é só pedir pros pacientes.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: doBriefing, mensagem: 'e dá pra ter depoimentos de clientes na home?' });
  assert.match(r.resposta, /CRP/);
  assert.doesNotMatch(r.resposta, /pode colocar/i);
  /* histórico: a profissão foi dita 3 mensagens atrás */
  const mensagens = [{ papel: 'visitante', conteudo: 'sou nutricionista' }, { papel: 'consultor', conteudo: 'Que bom. Como seus pacientes chegam hoje?' }, { papel: 'visitante', conteudo: 'por indicação' }];
  const ia2 = roteiro(fim('Dá sim, colocamos o antes e depois.'));
  const r2 = await executarTurno({ ia: ia2, regras: REGRAS, conversa: nova({ mensagens }), mensagem: 'quero colocar antes e depois' });
  assert.match(r2.resposta, /CRN/);
});

test('turno: pediu de novo depois da recusa: uma frase, sem recado e sem botão', async () => {
  const mensagens = [{ papel: 'visitante', conteudo: 'sou dentista, quero depoimento de paciente' }, { papel: 'consultor', conteudo: respostaRegulado(nichoRegulado('dentista')) }];
  const ia = roteiro(fim('Pode incluir sim.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova({ mensagens }), mensagem: 'mas eu quero mesmo o depoimento de paciente' });
  assert.doesNotMatch(r.resposta, /RECADO/);
  assert.ok(!r.diagnostico, 'insistência em saúde: o botão não aparece (o dono não libera isso)');
});

test('turno: veterinária e estética automotiva NÃO travam (o prompt manda perguntar antes)', async () => {
  const ia = roteiro(fim('Pode ter depoimento de clientes, sim. Eles aparecem numa faixa na home.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'tenho uma clínica veterinária, quero depoimento de clientes' });
  assert.match(r.resposta, /Pode ter depoimento/);
  const ia2 = roteiro(fim('Dá pra colocar o antes e depois dos carros, fica bom.'));
  const r2 = await executarTurno({ ia: ia2, regras: REGRAS, conversa: nova(), mensagem: 'estética automotiva, quero antes e depois' });
  assert.match(r2.resposta, /antes e depois dos carros/);
});

test('regulados: "depoimentos" não entra no briefing nem nas funcionalidades desses negócios', async () => {
  const b = { negocio: { segmento: 'clínica odontológica' }, funcionalidades: ['agendamento', 'depoimentos', 'mapa'], conteudo: { textos: 'tem', depoimentos: 'tem' }, servicos: ['implante', 'depoimentos de pacientes', 'clareamento antes e depois'], preferencias: ['fotos de antes e depois'] };
  const s = briefingSemProibidos(b);
  assert.deepEqual(s.funcionalidades, ['agendamento', 'mapa']);
  assert.deepEqual(s.conteudo, { textos: 'tem' });
  assert.deepEqual(s.servicos, ['implante']);
  assert.equal(s.preferencias, undefined);
  assert.deepEqual(b.funcionalidades, ['agendamento', 'depoimentos', 'mapa'], 'não muda o original');
  /* o turno limpa o que o modelo registrar */
  const ia = roteiro(
    comFerr({ id: 'c1', nome: 'atualizar_briefing', entrada: { negocio: { segmento: 'dentista' }, funcionalidades: ['depoimentos', 'agendamento'], conteudo: { depoimentos: 'tem' } } }),
    fim('Anotei o ramo. Como seus pacientes chegam hoje?'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'sou dentista' });
  assert.deepEqual(r.briefing.funcionalidades, ['agendamento']);
  assert.equal(r.briefing.conteudo?.depoimentos, undefined);
  /* fora de regulado, fica como está */
  const ia2 = roteiro(comFerr({ id: 'c2', nome: 'atualizar_briefing', entrada: { negocio: { segmento: 'padaria' }, funcionalidades: ['depoimentos'] } }), fim('Beleza.'));
  const r2 = await executarTurno({ ia: ia2, regras: REGRAS, conversa: nova(), mensagem: 'tenho padaria' });
  assert.deepEqual(r2.briefing.funcionalidades, ['depoimentos']);
});

/* ---------- 3. o valor: marcadores trocados pelo número do motor, depois dos filtros ---------- */
test('marcadores: [[total]], [[sinal]] e [[restante]] viram o número exato da estimativa', () => {
  const e = { valor_total: 2900, sinal: 1160 };
  assert.equal(comMarcadores('Uma página só fica [[total]]. Sinal de [[sinal]] e [[restante]] depois.', e).texto,
    'Uma página só fica R$ 2.900. Sinal de R$ 1.160 e R$ 1.740 depois.');
  assert.equal(comMarcadores('Fica [[total]].', { valor_total: '8900.50', sinal: '3560.2' }).texto, 'Fica R$ 8.900,50.');
  assert.equal(comMarcadores('[[TOTAL]] e [[ total ]]', e).texto, 'R$ 2.900 e R$ 2.900');
});

test('marcadores: sem estimativa válida, o marcador vira frase sem número e oferece o recado', () => {
  for (const e of [null, undefined, {}, { valor_total: 'x', sinal: 1 }, { valor_total: -1, sinal: 0 }]) {
    const r = comMarcadores('Uma página só fica [[total]], com sinal de [[sinal]]. Quer ver três modelos?', e);
    assert.doesNotMatch(r.texto, /\[\[|R\$|\d/);
    assert.match(r.texto, /DEIXAR UM RECADO/);
    assert.match(r.texto, /Quer ver três modelos\?/);
    assert.equal(r.semEstimativa, true);
  }
  assert.deepEqual(comMarcadores('Sem marcador nenhum.', null), { texto: 'Sem marcador nenhum.', semEstimativa: false });
});

test('turno: depois de estimar, o texto sai com o valor do motor; o R$ que o modelo escrever por conta própria é apagado ANTES', async () => {
  const ia = roteiro(
    comFerr({ id: 'e1', nome: 'estimar', entrada: { formato: 'landing_page' } }),
    fim('A landing fica [[total]], e não R$ 1.000 como dizem por aí. O sinal é [[sinal]] e o resto [[restante]]. Quer ver três modelos?'));
  const conversa = nova({ briefing: { negocio: { segmento: 'padaria' }, objetivos: ['vender'], projeto: { formato: 'landing_page' } } });
  const r = await executarTurno({ ia, regras: REGRAS, conversa, mensagem: 'quanto custa?' });
  assert.match(r.resposta, /A landing fica R\$ 2\.900,/);
  assert.match(r.resposta, /sinal é R\$ 1\.160 e o resto R\$ 1\.740/);
  assert.doesNotMatch(r.resposta, /1\.000/);
  assert.doesNotMatch(r.resposta, /\[\[/);
  const resultado = JSON.parse(ia.recebidos[1].mensagens.at(-1).content[0].content);
  assert.match(resultado.valor, /\[\[total\]\]/);
});

test('turno: o marcador em conversa sem estimativa nunca chega cru à tela', async () => {
  const ia = roteiro(fim('Fica [[total]], com sinal de [[sinal]].'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'e o preço?' });
  assert.doesNotMatch(r.resposta, /\[\[|\d/);
  assert.match(r.resposta, /DEIXAR UM RECADO/);
  assert.ok(r.diagnostico);
});

test('turno: estimativa que já está no banco (turno seguinte) também alimenta os marcadores', async () => {
  const doBanco = { id: 'e1', prazo_dias: 8, fase: 'unica', valor_total: '7900.00', sinal: '3160.00', fatores: { formato: 'institucional' }, detalhes: { itens: [] } };
  const ia = roteiro(fim('O institucional fica [[total]].'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova({ estimativa: doBanco, etapa: 'estimativa' }), mensagem: 'e o total?' });
  assert.equal(r.resposta, 'O institucional fica R$ 7.900.');
});

/* rodada 1 dos testes simulados (31/10): o valor nunca chegava à pessoa e a anotação interna vazava na tela */
test('turno: marcador sem estimativa dá ao modelo mais uma volta para estimar, e a pessoa recebe o número', async () => {
  const ia = roteiro(
    fim('A landing fica [[total]], com sinal de [[sinal]].'),
    comFerr({ id: 'e1', nome: 'estimar', entrada: { formato: 'landing_page' } }),
    fim('Vou te passar de novo: a landing fica [[total]], com sinal de [[sinal]].'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova({ briefing: { negocio: { segmento: 'loja de roupa' }, objetivos: ['apresentar_empresa'] } }), mensagem: 'quanto fica?' });
  assert.equal(r.resposta, 'Vou te passar de novo: a landing fica R$ 2.900, com sinal de R$ 1.160.');
  assert.equal(r.diagnostico, null, 'não oferece o recado quando o valor saiu');
  assert.ok(r.estimativa);
  const aviso = ia.recebidos[1].mensagens.at(-1);
  assert.equal(aviso.role, 'user');
  assert.match(aviso.content, /não há estimativa válida/);
  assert.equal(ia.recebidos[1].mensagens.at(-2).role, 'assistant');
});

test('turno: a volta a mais acontece uma vez só; se o modelo insistir sem estimar, o marcador sai com o recado', async () => {
  const ia = roteiro(fim('Fica [[total]].'), fim('Fica [[total]] mesmo.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'e o preço?' });
  assert.equal(ia.recebidos.length, 2);
  assert.doesNotMatch(r.resposta, /\[\[|\d/);
  assert.match(r.resposta, /DEIXAR UM RECADO/);
});

test('turno: com estimativa válida, ou depois do escopo, não há volta a mais', async () => {
  const doBanco = { id: 'e1', prazo_dias: 5, fase: 'unica', valor_total: '2900.00', sinal: '1160.00', fatores: { formato: 'landing_page' }, detalhes: { itens: [] } };
  const ia = roteiro(fim('Fica [[total]].'));
  await executarTurno({ ia, regras: REGRAS, conversa: nova({ estimativa: doBanco, etapa: 'estimativa' }), mensagem: 'e o total?' });
  assert.equal(ia.recebidos.length, 1);
  const ia2 = roteiro(fim('Fica [[total]].'));
  await executarTurno({ ia: ia2, regras: REGRAS, conversa: nova({ etapa: 'escopo' }), mensagem: 'e o total?' });
  assert.equal(ia2.recebidos.length, 1);
});

test('notação interna: [estimar: ...], [Botão ...] e [Cartão: ...] escritos como texto nunca chegam à tela', async () => {
  assert.equal(semNotacaoInterna('[estimar: Landing page, total [[total]], sinal [[sinal]]]\n\nPra você ter um ponto de partida: fica [[total]].'), 'Pra você ter um ponto de partida: fica [[total]].');
  assert.equal(semNotacaoInterna('[Botão DEIXAR UM RECADO apareceu na tela; nada foi enviado]\nTem razão.'), 'Tem razão.');
  assert.equal(semNotacaoInterna('Oi. [encaminhar_diagnostico: pediu uma pessoa] Fala comigo.'), 'Oi.  Fala comigo.');
  assert.equal(semNotacaoInterna('[Cartão: Landing page, 5 dias úteis] Fica [[total]].').trim(), 'Fica [[total]].');
  assert.equal(semNotacaoInterna('[estimar: sem fechar\nSegue a conversa.'), 'Segue a conversa.');
  const normal = 'A landing [[total]] e o [[sinal]] entram no Pix [no celular].';
  assert.equal(semNotacaoInterna(normal), normal);
  const ia = roteiro(fim('[estimar: Landing page, 1 página, total [[total]]]\n\nA landing fica [[total]].'));
  const doBanco = { id: 'e1', prazo_dias: 5, fase: 'unica', valor_total: '2900.00', sinal: '1160.00', fatores: { formato: 'landing_page' }, detalhes: { itens: [] } };
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova({ estimativa: doBanco, etapa: 'estimativa' }), mensagem: 'quanto?' });
  assert.equal(r.resposta, 'A landing fica R$ 2.900.');
});

/* rodada 3 dos testes simulados (31/10): a pessoa pediu o valor 3 a 4 vezes e nunca o viu */
test('valor pedido: reconhece o pedido do valor e a queixa de que não apareceu, e ignora o resto', () => {
  for (const m of ['quanto fica?', 'qnto é a landing', 'fala o valor em reais', 'apareceu [[total]] aqui', 'de novo os colchetes', 'não apareceu o valor', 'só fala o valor em número, 1 linha'])
    assert.ok(pedeValor(m), m);
  for (const m of ['oi, tudo bem?', 'sou dentista e quero depoimento', 'quanto custa o atendente de IA?', ''])
    assert.ok(!pedeValor(m), m);
});

test('valor pedido: sem R$ na resposta e com estimativa válida, o código acrescenta os números do motor', () => {
  const e = { valor_total: '2900.00', sinal: '1160.00' };
  const r = garantirValor('Pra oficina, uma página só resolve.', { mensagem: 'só fala o valor', estimativa: e });
  assert.equal(r.acrescentou, true);
  assert.equal(r.texto, 'Pra oficina, uma página só resolve.\n\nEm resumo, o site fica R$ 2.900, com entrada de R$ 1.160 no Pix e R$ 1.740 quando o site entrar no ar.');
  assert.equal(garantirValor('A landing fica R$ 2.900.', { mensagem: 'quanto fica', estimativa: e }).acrescentou, false, 'já tem número');
  assert.equal(garantirValor('Uma página só.', { mensagem: 'oi', estimativa: e }).acrescentou, false, 'ninguém pediu o valor');
  assert.equal(garantirValor('Uma página só.', { mensagem: 'quanto fica', estimativa: null }).acrescentou, false, 'sem estimativa não inventa número');
  assert.equal(garantirValor('Uma página só.', { mensagem: 'quanto custa o atendente?', estimativa: e }).acrescentou, false, 'valor do atendente não é o do site');
});

test('turno: a pessoa reclama que o valor não apareceu e o modelo responde sem número: a linha do motor sai na tela', async () => {
  const doBanco = { id: 'e1', prazo_dias: 5, fase: 'unica', valor_total: '2900.00', sinal: '1160.00', fatores: { formato: 'landing_page' }, detalhes: { itens: [] } };
  const ia = roteiro(fim('O valor não está chegando pra você. Uma página só mostra o que a oficina faz.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova({ estimativa: doBanco, etapa: 'estimativa' }), mensagem: 'cartao nenhum apareceu aqui, so fala o valor' });
  assert.match(r.resposta, /Em resumo, o site fica R\$ 2\.900, com entrada de R\$ 1\.160 no Pix e R\$ 1\.740/);
  assert.doesNotMatch(r.resposta, /\[\[/);
});

test('turno: no escopo e no sinal a linha do valor não entra (os filtros de pagamento mandam)', async () => {
  const doBanco = { id: 'e1', prazo_dias: 5, fase: 'unica', valor_total: '2900.00', sinal: '1160.00', fatores: { formato: 'landing_page' }, detalhes: { itens: [] } };
  const ia = roteiro(fim('Confira o bloco Resumo do que será feito.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova({ estimativa: doBanco, etapa: 'escopo' }), mensagem: 'e o valor, qual é?' });
  assert.doesNotMatch(r.resposta, /Em resumo/);
});

/* ---------- 4. o prompt do Zero ---------- */
test('prompt: abre como o Zero, diz que é IA, e traz os marcadores e as regras de recado e de saúde', () => {
  const s = montarSistema(REGRAS, { direcoes: 'manual', metodos: ['pix'] });
  assert.ok(s.startsWith('VOCÊ É O ZERO'), 'abre com o nome');
  assert.ok(s.startsWith(IDENTIDADE));
  for (const trecho of ['Você é uma IA e diz isso quando perguntarem', '[[total]]', '[[sinal]]', '[[restante]]', 'DEIXAR UM RECADO', 'encaminhar_diagnostico', 'contato.beyon.zero@gmail.com', 'CRO, CRM, CRP, CRN, CREFITO, OAB', 'Nunca diga "nossa equipe"', 'COMO VOCÊ SOA', 'EXEMPLOS DO QUE NÃO FAZER'])
    assert.ok(s.includes(trecho), 'falta no prompt: ' + trecho);
  assert.ok(!s.includes('{{TABELA_ATIVA}}'), 'o bloco da tabela é montado por código');
  assert.ok(!s.includes('—'), 'sem travessão (o modelo imita)');
  assert.doesNotMatch(s, /WhatsApp(?!\.)[^.\n]{0,30}(fale|chame|peça)|pelo WhatsApp/i, 'sem mandar ninguém ao WhatsApp');
});

test('prompt: a tabela ativa entra por código, sem nenhum valor em reais, e a urgência sai do multiplicador', () => {
  const s = montarSistema(REGRAS, { direcoes: 'manual' });
  assert.ok(!/R\$/.test(s.replace(/R\$ ?\[/g, '')), 'sem R$ no prompt');
  for (const f of Object.values(REGRAS.formatos)) { assert.ok(s.includes(f.nome), f.nome); for (const i of f.inclui) assert.ok(s.includes(i), i); }
  for (const n of [2900, 7900, 19900, 8900, 1500, 4500, 9900, 6500]) assert.ok(!new RegExp('(^|[^\\d])' + String(n).replace(/(\d)(\d{3})$/, '$1[.]?$2') + '(?!\\d)').test(s), 'valor no prompt: ' + n);
  assert.match(s, /sobe 30%/);
  const outra = JSON.parse(JSON.stringify(REGRAS)); outra.multiplicadores.urgencia.fator = 1.5;
  assert.match(montarSistema(outra), /sobe 50%/);
  assert.ok(!/sobe 30%/.test(montarSistema(outra)));
});

test('ferramentas: encaminhar_diagnostico só mostra o botão; estimar manda usar os marcadores', () => {
  const fs_ = ferramentas(REGRAS);
  const diag = fs_.find(f => f.name === 'encaminhar_diagnostico').description;
  assert.match(diag, /botão DEIXAR UM RECADO/);
  assert.match(diag, /nada é enviado/i);
  const est = fs_.find(f => f.name === 'estimar').description;
  assert.match(est, /\[\[total\]\]/);
  assert.doesNotMatch(est, /nunca no seu texto/);
  assert.match(fs_.find(f => f.name === 'atualizar_briefing').description, /depoimento/i);
});

/* ---------- 5. a abertura ---------- */
test('abertura: texto fixo aprovado, com variantes por página, e o modelo a recebe como "a pessoa já viu isto"', async () => {
  assert.equal(ABERTURA_PADRAO, 'Oi, eu sou o Zero, a IA da Beyon Zero. Me conta o que você faz que eu te digo qual formato de site serve pro seu negócio e quanto fica.');
  assert.equal(ABERTURAS.sites, 'Oi, eu sou o Zero, a IA da Beyon Zero. Pra qual tipo de negócio você está pensando em site?');
  assert.equal(ABERTURAS.atendente, 'Oi, eu sou o Zero, a IA da Beyon Zero. Hoje, quem responde seus clientes quando eles chamam?');
  assert.equal(ABERTURAS.retorno, 'Oi de novo, o Zero aqui, a IA da Beyon Zero. Você parou na escolha dos modelos. Quer continuar de onde parou?');
  for (const t of Object.values(ABERTURAS)) { assert.doesNotMatch(t, /—|\n/); assert.ok(t.length < 200); }
  const ia = roteiro(fim('Beleza. Pra quem você vende?'));
  await executarTurno({ ia, regras: REGRAS, conversa: nova(), mensagem: 'tenho uma padaria' });
  const [operador] = ia.recebidos[0].contexto.split('BRIEFING DO VISITANTE');
  assert.ok(operador.includes(ABERTURA_PADRAO));
  assert.match(operador, /a_pessoa_ja_viu/);
});

/* ---------- 6. modelo e tetos ---------- */
test('modelo: a conversa roda no Sonnet 5.5 em esforço médio; a extração do briefing segue no Haiku', () => {
  assert.equal(PAPEIS.conversa.modelo, 'claude-sonnet-5-5');
  assert.equal(PAPEIS.conversa.esforco, 'medium');
  assert.equal(PAPEIS.extracao.modelo, 'claude-haiku-5-5');
  assert.equal(PAPEIS.atendente.modelo, 'claude-haiku-5-5', 'o atendente do cliente não muda');
});

test('tetos: uma conversa longa de verdade, no Sonnet médio, cabe no teto da conversa com folga; o /48 não esgota o dia', () => {
  const sistema = montarSistema(REGRAS, { direcoes: 'manual', metodos: ['pix'] });
  const tokensSistema = Math.ceil(sistema.length / 3);   /* (pt-BR: ~3 caracteres por token, estimativa para cima) */
  /* um turno: 2 rodadas (ferramenta + resposta); cada uma lê o sistema do cache e paga estado, histórico e a mensagem; saída com raciocínio médio */
  const rodada = { cache_leitura: tokensSistema, entrada: 3500, saida: 900 };
  const turno = 2 * custoUsd('claude-sonnet-5-5', rodada);
  const conversaLonga = 30 * turno;
  assert.ok(conversaLonga < TETOS.conversa_usd * 0.6, `30 turnos (US$ ${conversaLonga.toFixed(2)}) ocupam mais que 60% do teto de US$ ${TETOS.conversa_usd}; sobra pouco para as 3 direções no Opus`);
  assert.ok(TETOS.conversas_por_ip48_dia * TETOS.conversa_usd < TETOS.dia_usd);
  assert.ok(TETOS.conversas_por_ip_dia * TETOS.conversa_usd < TETOS.dia_usd);
  assert.ok(TETOS.conversas_por_ip48_dia > TETOS.conversas_por_ip_dia);
  /* a reserva por chamada de conversa acompanha o custo real de uma rodada, não os US$ 0,01 do Haiku */
  assert.ok(RESERVA_USD.conversa >= custoUsd('claude-sonnet-5-5', rodada), 'reserva de ' + RESERVA_USD.conversa + ' < uma rodada de ' + custoUsd('claude-sonnet-5-5', rodada));
  assert.ok(RESERVA_USD.conversa <= 0.1);
});

/* ---------- 7. o arquivo que o time de teste usa ---------- */
test('docs/zero: o prompt efetivo e a abertura gravados são exatamente o que o código monta', async () => {
  const { montarPromptEfetivo, montarAbertura } = await import('../zero/gerar.mjs');
  const dir = new URL('../zero/', import.meta.url);
  const lf = s => s.replace(/\r\n/g, '\n');   /* (o Git no Windows pode trocar o fim de linha ao baixar) */
  const t = lf(fs.readFileSync(new URL('prompt-efetivo.txt', dir), 'utf8'));
  assert.equal(t, montarPromptEfetivo(), 'rode: node docs/zero/gerar.mjs');
  assert.equal(lf(fs.readFileSync(new URL('abertura.txt', dir), 'utf8')), montarAbertura(), 'rode: node docs/zero/gerar.mjs');
  assert.ok(t.includes('VOCÊ É O ZERO'));
  for (const f of ferramentas(REGRAS)) assert.ok(t.includes(f.name), 'ferramenta no arquivo: ' + f.name);
  assert.match(t, /ESTADO ATUAL/);
});

test('tela: a página de orçamento mostra o Zero como IA (etiqueta e primeira fala fixa) e não chama mais de "consultor"', () => {
  const html = fs.readFileSync(new URL('../../orcamento.html', import.meta.url), 'utf8');
  assert.ok(html.includes(ETIQUETA), 'etiqueta fixa na conversa');
  assert.ok(html.includes(ABERTURA_PADRAO), 'a primeira fala é a aprovada, a mesma que o modelo recebe como já vista');
  const visivel = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(visivel, /consultor/i, 'nenhum texto visível chama de consultor');
});

test('prompt: fatos decididos pelo dono em 01/11 (domínio, hospedagem, nota) e a negociação sem desconto', () => {
  const s = montarSistema(REGRAS, { direcoes: 'manual', metodos: ['pix'] });
  for (const trecho of ['fica no nome do cliente', 'hospedado de graça na Cloudflare', 'Nota fiscal: ainda não há', 'negocie sem baixar o valor', 'o resto entra depois, item a item, pela tabela'])
    assert.ok(s.includes(trecho), 'falta no prompt: ' + trecho);
  assert.doesNotMatch(s, /mensalidade, hospedagem e de quem é/, 'mensalidade e hospedagem saíram da lista do que não se confirma');
  assert.doesNotMatch(s, /R\$ ?(800|1\.900)/, 'a oferta de lançamento não entra no texto do Zero');
});

/* ---------- revisão do PR 71 (02/11): furos achados nas travas ---------- */
test('revisão: "não" longe do verbo NÃO desfaz a promessa de recado ("Não se preocupe, deixei o recado")', () => {
  for (const t of ['Não se preocupe, deixei o recado com ele.', 'Não tem problema, mandei pro dono sua dúvida.', 'Fique tranquilo, não precisa insistir, avisei o dono.'])
    assert.equal(semPromessaDeRecado(t).trocou, true, t);
  for (const t of ['Não deixei nenhum recado, quem deixa é você.', 'Eu nunca envio nada ao dono.'])
    assert.equal(semPromessaDeRecado(t).trocou, false, t);
});

test('revisão: em saúde, "não tem problema colocar depoimentos" NÃO conta como recusa', () => {
  const dentista = nichoRegulado('sou dentista');
  for (const t of ['Não tem problema colocar depoimentos no site.', 'Não precisa se preocupar, vamos incluir antes e depois.'])
    assert.equal(garantirRegulado(t, { nicho: dentista, pediuAgora: true }).trocou, true, t);
  assert.equal(garantirRegulado('Isso a gente não coloca em site de dentista.', { nicho: dentista, pediuAgora: true }).trocou, false, 'recusa de verdade passa');
});

test('revisão: marcador desconhecido nunca vaza cru ([[valor]], [[ entrada ]], [total])', () => {
  const est = { valor_total: 7900, sinal: 3160 };
  for (const t of ['O site fica [[valor]].', 'A entrada é [[ entrada ]] no Pix.', 'Fica [total] no total.', 'Fica [[desconto]] hoje.']) {
    assert.doesNotMatch(comMarcadores(t, est).texto, /\[/, 'com estimativa: ' + t);
    assert.doesNotMatch(comMarcadores(t, null).texto, /\[/, 'sem estimativa: ' + t);
  }
  assert.match(comMarcadores('O site fica [[valor]] e a entrada [[entrada]].', est).texto, /R\$\s?7\.900.*R\$\s?3\.160/);
});

test('revisão: pergunta de prazo, domínio ou hospedagem não vira "o site fica R$"', () => {
  for (const m of ['quanto é o prazo?', 'quanto custa o domínio?', 'quanto fica a hospedagem?', 'qual o valor da renovação do domínio?']) assert.equal(pedeValor(m), false, m);
  for (const m of ['quanto fica um site?', 'qual o valor do sinal?', 'me passa o valor']) assert.equal(pedeValor(m), true, m);
});

test('revisão: o corte do texto do modelo é em fim de frase e não parte o texto fixo', () => {
  const longa = ('Frase curta de teste aqui. ').repeat(80);
  const c = cortarEmFrase(longa, 1100);
  assert.ok(c.length <= 1100 && /\.$/.test(c.trim()), 'termina em ponto: ' + c.slice(-30));
  assert.equal(cortarEmFrase('Curto.', 1100), 'Curto.');
  assert.ok(cortarEmFrase('a'.repeat(3000), 100).length <= 100, 'sem ponto: corte duro');
});

test('revisão: o modelo não promete desconto em nenhuma etapa', () => {
  for (const t of ['Te dou 20% de desconto se fechar hoje.', 'Posso fazer um desconto de 10% pra você.', 'Vou te dar um desconto especial.'])
    assert.equal(semPromessaDeDesconto(t).trocou, true, t);
  for (const t of ['Desconto eu não faço, a tabela é a mesma pra todo mundo.', 'Não existe desconto aqui.', 'O site fica mais barato se começar pela landing.'])
    assert.equal(semPromessaDeDesconto(t).trocou, false, t);
});

/* ---------- rodada 5 da lapidação: memória do que já foi dito (código) e palavras-bordão fora do prompt ---------- */
test('já dito: o código lê as falas do Zero guardadas (até as 60 que o banco entrega) e devolve só rótulos fixos (nada do texto da conversa)', async () => {
  const { jaDito } = await import('../../api/_vendas/zero.mjs');
  assert.deepEqual(jaDito([]), []);
  assert.deepEqual(jaDito(null), []);
  const m = (papel, conteudo) => ({ papel, conteudo });
  const conversa = [
    m('agente', 'Oi, eu sou o Zero, a IA da Beyon Zero.'),
    m('visitante', 'quero um site, meu e-mail é ana@exemplo.com'),
    m('agente', 'Você vê três modelos feitos pra você antes de pagar, e tem 7 dias para desistir. Os modelos saem em até 24 horas úteis.'),
    m('agente', 'Se quiser, toque em DEIXAR UM RECADO aqui embaixo. O site fica R$ 2.900.'),
    m('agente', 'Vale conferir o nome de quem recebe antes de confirmar. As regras de propaganda do conselho não deixam.')
  ];
  assert.deepEqual(jaDito(conversa).sort(), ['aviso_de_ia', 'modelos_em_24_horas', 'nome_no_pix', 'porque_da_recusa_em_saude', 'recado_oferecido', 'sete_dias_para_desistir', 'tres_modelos_antes_de_pagar', 'valor_dito']);
  assert.ok(!JSON.stringify(jaDito(conversa)).includes('ana@exemplo'), 'nada do que o visitante escreveu entra na lista');
  /* a fala do VISITANTE não conta como dita pelo Zero, e papel desconhecido também não (lista branca: só 'agente') */
  assert.deepEqual(jaDito([m('visitante', 'tenho 7 dias para desistir? deixar um recado? sou uma IA? R$ 5')]), []);
  assert.deepEqual(jaDito([m('sistema', 'Sou uma IA. Deixe um recado. R$ 2.900.'), m(undefined, 'Sou uma IA')]), []);
  /* o que o Zero NÃO disse não aparece */
  assert.deepEqual(jaDito([m('agente', 'Me conta o que você faz.')]), []);
  assert.deepEqual(jaDito([m('agente', 'Eu sou o Zero, uma IA da Beyon Zero.')]), ['aviso_de_ia']);
});

test('já dito: frases parecidas que NÃO são o que o rótulo diz não acendem o rótulo (revisão do PR 78)', async () => {
  const { jaDito } = await import('../../api/_vendas/zero.mjs');
  const diz = t => jaDito([{ papel: 'agente', conteudo: t }]);
  assert.ok(!diz('O site de uma página sai em 7 dias úteis.').includes('sete_dias_para_desistir'), 'prazo de 7 dias úteis não é o prazo de desistência');
  assert.ok(diz('Depois de aceitar, você tem 7 dias para desistir e a entrada volta.').includes('sete_dias_para_desistir'));
  assert.ok(diz('Em até sete dias você pode desistir.').includes('sete_dias_para_desistir'));
  assert.ok(!diz('Vale conferir com o conselho (CRO, CRM) antes de publicar.').includes('porque_da_recusa_em_saude'), 'o aviso de conferir com o conselho não é o porquê da recusa');
  assert.ok(!diz('Um conselho: comece pelo menor formato.').includes('porque_da_recusa_em_saude'), 'conselho no sentido comum');
  assert.ok(diz('A gente não faz isso porque as regras de propaganda do conselho não deixam.').includes('porque_da_recusa_em_saude'));
  assert.ok(!diz('Eu não deixo recado por você, só você mesma pelo botão.').includes('recado_oferecido'), 'dizer que não deixa recado não é oferecer o botão');
  assert.ok(diz('Se quiser, toque em deixar um recado aqui embaixo.').includes('recado_oferecido'));
  assert.ok(diz('Escreva o seu recado no botão aqui embaixo.').includes('recado_oferecido'));
  assert.ok(!diz('Não sou uma IA, sou gente.').includes('aviso_de_ia'), 'negação não é o aviso');
  assert.ok(!diz('Sou da Beyon, ia te contar do formato.').includes('aviso_de_ia'), 'o verbo "ia" não é a IA');
  assert.ok(diz('Sou uma inteligência artificial, sim.').includes('aviso_de_ia'));
  assert.ok(diz('Os modelos saem em até 24h.').includes('modelos_em_24_horas'));
  assert.ok(diz('O site fica 2.900 reais.').includes('valor_dito'));
});

test('já dito: o ESTADO leva ja_dito quando há o que dizer e não leva quando não há; a lista vem das falas guardadas, não só das 12 últimas', async () => {
  const { estadoParaModelo } = await import('../../api/_vendas/agente.mjs');
  const REGRAS = JSON.parse(fs.readFileSync(new URL('../../docs/fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
  const base = { briefing: {}, estimativa: null, etapa: 'descoberta', regras: REGRAS, metodos: ['pix'] };
  assert.ok(!/ja_dito/.test(estadoParaModelo(base)), 'sem nada dito, sem o campo');
  assert.match(estadoParaModelo({ ...base, jaDitoNaConversa: ['aviso_de_ia', 'recado_oferecido'] }), /"ja_dito":\["aviso_de_ia","recado_oferecido"\]/);
  /* de ponta a ponta: o aviso de IA dito na 1ª fala, 20 mensagens atrás, ainda aparece no estado que o modelo recebe */
  const { executarTurno } = await import('../../api/_vendas/agente.mjs');
  const mensagens = [{ papel: 'agente', conteudo: 'Sou uma IA, sim, o Zero. Os modelos saem em até 24 horas úteis.' }];
  for (let i = 0; i < 20; i++) mensagens.push({ papel: i % 2 ? 'agente' : 'visitante', conteudo: i % 2 ? 'Certo.' : 'tá' });
  const recebidos = [];
  const ia = { mensagem: async p => { recebidos.push(p); return { texto: 'Certo.', chamadas: [], conteudo: [{ type: 'text', text: 'Certo.' }], parada: 'fim', custo_usd: 0 }; } };
  await executarTurno({ ia, regras: REGRAS, conversa: { etapa: 'descoberta', briefing: {}, mensagens }, mensagem: 'e então?', direcoes: 'manual', metodos: ['pix'] });
  assert.equal(recebidos.length, 1, 'o modelo foi chamado uma vez');
  assert.match(recebidos[0].contexto, /"ja_dito":\[[^\]]*"aviso_de_ia"[^\]]*\]/, 'o estado do turno traz o aviso de IA dito 21 mensagens atrás');
  assert.match(recebidos[0].contexto, /"modelos_em_24_horas"/);
});

test('prompt do Zero: as palavras-bordão que o modelo copiava (rodada 4) não estão mais escritas nele', () => {
  const REGRAS = JSON.parse(fs.readFileSync(new URL('../../docs/fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
  const s = montarSistema(REGRAS, { direcoes: 'manual', metodos: ['pix'] });
  for (const bordao of ['ponto de partida', 'maiores custam mais', 'têm outro valor', 'resolve o hoje', 'resolve o seu hoje', 'o menor que resolve', 'sem pagar nada', 'antes de pagar qualquer coisa', 'pagando só o que for pondo', 'existem formatos maiores', 'o valor que ele passou']) {
    assert.ok(!s.toLowerCase().includes(bordao), 'bordão no prompt: ' + bordao);
  }
  assert.match(s, /ja_dito, lido pelo código nas últimas 60 mensagens/, 'o prompt manda respeitar o ja_dito');
  assert.match(s, /valor_dito não vale depois de uma nova estimativa/, 'a estimativa nova vence o valor já dito');
  assert.match(s, /quando perguntam se você é IA a resposta é direta mesmo com aviso_de_ia/, 'o aviso de IA perguntado sempre tem resposta direta');
  assert.ok(!/valores já orçados lado a lado/.test(s), 'o prompt não manda escrever valores à mão (o código os troca por "no cartão")');
  assert.match(s, /Não ofereça esses itens e não chame encaminhar_diagnostico por isso/, 'o que a Beyon não faz: sem oferta e sem diagnóstico');
  assert.match(s, /Quem pergunta se você é robô: diz que é uma IA/, 'o exemplo do robô diz que é uma IA');
  assert.match(s, /código do site fica do cliente para sempre: isso você não confirma/, 'contraexemplo do código do cliente');
  assert.match(s, /Valor de outra pessoa \(o sobrinho, o concorrente\) você cita sem número/, 'valor de terceiro sem número');
  assert.match(s, /Quando ela conta uma dor concreta/, 'responder primeiro à dor');
  assert.match(s, /Curiosidade sobre o funcionamento interno/, 'recado não é para curiosidade sobre o funcionamento interno');
  assert.match(s, /o valor é o mesmo com o dono/, 'com o dono o valor é o mesmo');
  assert.ok(s.length <= 27000, 'o prompt segue dentro do limite: ' + s.length);
});

/* ---------- peças da conversa, fatia 1: o painel derivado do briefing (api/_vendas/painel.mjs) ---------- */
test('painel: sem briefing ou sem nada para mostrar, null (a tela não desenha cartão vazio)', async () => {
  const { montarPainel } = await import('../../api/_vendas/painel.mjs');
  for (const b of [null, undefined, {}, [], 'texto', 7, { negocio: {} }, { objetivos: [], funcionalidades: [] }]) assert.equal(montarPainel(b), null);
});

test('painel: o que a pessoa contou vira anotações e ficha, cada dado em um só bloco, em esquema fechado e sem inventar nada', async () => {
  const { montarPainel, LIMITES_PAINEL } = await import('../../api/_vendas/painel.mjs');
  const p = montarPainel({
    negocio: { nome: 'Doces da Ana', segmento: 'confeitaria', descricao: 'Vende bolos e doces por encomenda', cidade: 'Campo Grande' },
    objetivos: ['vender', 'gerar_leads', 'autoridade'], objetivo_detalhe: 'Quer parar de depender só do Instagram',
    situacao_atual: { como_chegam: 'indicação e Instagram', o_que_se_perde: 'quem procura no Google não acha' },
    funcionalidades: ['whatsapp', 'galeria'], projeto: { formato: 'landing_page', urgencia: true }
  });
  assert.deepEqual(Object.keys(p).sort(), ['anotamos', 'ficha']);
  assert.deepEqual(p.anotamos, ['Vende bolos e doces por encomenda', 'Clientes chegam por: indicação e Instagram', 'O que se perde hoje: quem procura no Google não acha', 'Quer: botão de WhatsApp, galeria de fotos']);
  assert.deepEqual(p.ficha, [
    { rotulo: 'Empresa', valor: 'Doces da Ana' }, { rotulo: 'Segmento', valor: 'confeitaria' }, { rotulo: 'Cidade', valor: 'Campo Grande' },
    { rotulo: 'O que quer resolver', valor: 'Quer parar de depender só do Instagram' }, { rotulo: 'Procura', valor: 'Site de uma página' }, { rotulo: 'Prazo', valor: 'Curto' }
  ]);
  assert.ok(p.anotamos.length <= LIMITES_PAINEL.itens && p.ficha.length <= LIMITES_PAINEL.ficha);
  /* cada dado em um só lugar: nada que está na ficha se repete nas anotações */
  const naFicha = p.ficha.map(f => f.valor);
  assert.ok(p.anotamos.every(a => !naFicha.some(v => a === v)), 'sem repetição entre os blocos');
  /* nada além do que está no briefing: sem número, sem prova */
  assert.ok(!/[0-9]/.test(JSON.stringify(p).replace(/Doces da Ana/g, '')), 'nenhum número aparece que a pessoa não tenha dito');
  /* só o segmento conhecido: a ficha mostra, as anotações não repetem */
  assert.deepEqual(montarPainel({ negocio: { segmento: 'confeitaria', cidade: 'Campo Grande' } }), { ficha: [{ rotulo: 'Segmento', valor: 'confeitaria' }, { rotulo: 'Cidade', valor: 'Campo Grande' }] });
});

test('painel: texto hostil sai limpo e curto; chave herdada do protótipo, formato desconhecido e id fora da lista somem; o sob medida usa o nome Atelier, nunca o antigo', async () => {
  const { montarPainel, LIMITES_PAINEL } = await import('../../api/_vendas/painel.mjs');
  const longo = 'x'.repeat(500);
  const p = montarPainel({ negocio: { nome: '<img src=x onerror=alert(1)>' + longo, segmento: 'a<b>c' }, objetivos: ['inexistente'], projeto: { formato: 'qualquer_coisa' }, funcionalidades: ['hackear'] });
  assert.ok(!/[<>]/.test(JSON.stringify(p)), 'sem sinais de HTML');
  for (const f of p.ficha) assert.ok(f.valor.length <= LIMITES_PAINEL.texto, 'valor curto: ' + f.rotulo);
  assert.ok(!p.ficha.some(f => f.rotulo === 'Procura') && !p.anotamos, 'formato e ids fora da lista não aparecem');
  /* chaves herdadas do protótipo não viram texto nem objeto (achado da revisão de segurança) */
  for (const chave of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const q = montarPainel({ objetivos: [chave], funcionalidades: [chave], projeto: { formato: chave }, negocio: { nome: 'Ana' } });
    assert.deepEqual(q, { ficha: [{ rotulo: 'Empresa', valor: 'Ana' }] }, 'a chave ' + chave + ' não vira rótulo');
  }
  /* todo valor sai como string */
  assert.ok(montarPainel({ negocio: { nome: 'Ana' }, projeto: { formato: 'institucional' } }).ficha.every(f => typeof f.valor === 'string'));
  const sm = montarPainel({ projeto: { formato: 'sob_medida' } });
  assert.deepEqual(sm.ficha, [{ rotulo: 'Procura', valor: 'Atelier' }]);
  assert.ok(!/beyond/i.test(JSON.stringify(sm)));
  /* o prefixo não come o valor: o item inteiro cabe no limite e o valor não perde o começo */
  const curto = montarPainel({ situacao_atual: { como_chegam: 'c'.repeat(300) } });
  assert.ok(curto.anotamos[0].length <= LIMITES_PAINEL.texto && curto.anotamos[0].startsWith('Clientes chegam por: c'));
});

test('painel: em nicho regulado o painel não repete, na voz da Beyon, o que a pessoa pediu e a Beyon não faz (depoimento, antes e depois)', async () => {
  const { montarPainel } = await import('../../api/_vendas/painel.mjs');
  const briefing = {
    negocio: { nome: 'Clínica Sorriso', segmento: 'odontologia', descricao: 'Clínica odontológica com antes e depois do clareamento' },
    objetivo_detalhe: 'Quer mostrar depoimentos de pacientes', situacao_atual: { o_que_se_perde: 'pacientes não agendam' }, funcionalidades: ['depoimentos', 'agendamento']
  };
  const livre = JSON.stringify(montarPainel(briefing));
  assert.match(livre, /depoimentos de pacientes/, 'fora de nicho regulado, o painel mostra o que a pessoa contou');
  const regulado = montarPainel(briefing, { regulado: true });
  const txt = JSON.stringify(regulado).toLowerCase();
  assert.ok(!/depoiment|antes (e )?depois/.test(txt), 'em nicho regulado, nada de depoimento nem antes e depois no painel: ' + txt);
  assert.ok(regulado.anotamos.includes('O que se perde hoje: pacientes não agendam') && regulado.anotamos.includes('Quer: agendamento'), 'o resto segue');
});

test('painel na tela: valida de novo o que veio do servidor, monta só por textContent, não redesenha sem mudança e marca só o item novo', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-painel.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(fonte), 'nada de HTML montado por texto');
  assert.ok(!/\.style\b|setAttribute\(\s*['"]style/.test(fonte), 'CSP sem inline: só classes');
  const janela = {};
  new Function('window', fonte)(janela);
  const { validar, _criar, LIMITES } = janela.BZPainel;
  /* validar: o que não cabe no esquema some */
  assert.equal(validar(null), null); assert.equal(validar([]), null); assert.equal(validar({ x: 1 }), null);
  const v = validar({ anotamos: ['ok', 7, '<b>x</b>', '', 'a'.repeat(500)], ficha: [{ rotulo: 'Empresa', valor: 'Ana' }, { rotulo: 'Qualquer', valor: 'não' }, { rotulo: 'Cidade', valor: '' }, { rotulo: '__proto__', valor: 'x' }], caso: { cenario: 'c' }, extra: 'fora' });
  assert.deepEqual(Object.keys(v).sort(), ['anotamos', 'ficha']);
  assert.ok(v.anotamos.every(a => a.length <= LIMITES.texto) && v.anotamos.length === 3 && !/[<>]/.test(JSON.stringify(v)));
  assert.deepEqual(v.ficha, [{ rotulo: 'Empresa', valor: 'Ana' }]);
  /* DOM de mentira: conta elementos criados e guarda classe e texto */
  let criados = 0;
  const no = tag => ({ tag, className: '', textContent: '', children: [], hidden: false,
    appendChild(c) { this.children.push(c); return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    get firstChild() { return this.children[0] || null; } });
  const doc = { createElement: tag => { criados++; return no(tag); } };
  const raiz = no('div'); raiz.hidden = true;
  const tela = _criar(doc, raiz);
  const itens = () => { const r = []; (function ir(n) { if (n.className.includes('orc-peca__item')) r.push(n); n.children.forEach(ir); })(raiz); return r; };
  tela.atualizar({ anotamos: ['Vende bolos'], ficha: [{ rotulo: 'Empresa', valor: 'Doces da Ana' }] });
  assert.equal(raiz.hidden, false);
  assert.ok(itens().every(i => i.className.includes('is-novo')), 'na primeira vez o item é novo');
  const depoisDoPrimeiro = criados;
  tela.atualizar({ anotamos: ['Vende bolos'], ficha: [{ rotulo: 'Empresa', valor: 'Doces da Ana' }] });
  assert.equal(criados, depoisDoPrimeiro, 'o mesmo painel não redesenha (o DOM fica)');
  tela.atualizar({ anotamos: ['Vende bolos', 'Quer: formulário de contato'], ficha: [{ rotulo: 'Empresa', valor: 'Doces da Ana' }] });
  const [velho, novo] = itens();
  assert.ok(!velho.className.includes('is-novo') && novo.className.includes('is-novo'), 'só o item que acabou de chegar faz o fade');
  tela.atualizar(null);
  assert.equal(raiz.hidden, true, 'sem painel o bloco some');
});

test('painel na tela: window.BZPainel.atualizar acha o #o-peca, delega ao desenho, e não quebra sem o elemento nem sem painel', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-painel.js', import.meta.url), 'utf8');
  const janela = {};
  new Function('window', fonte)(janela);
  const no = () => ({ className: '', textContent: '', children: [], hidden: true, appendChild(c) { this.children.push(c); return c; }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); }, get firstChild() { return this.children[0] || null; } });
  const anterior = globalThis.document;
  try {
    globalThis.document = { getElementById: () => null, createElement: () => no() };
    assert.doesNotThrow(() => janela.BZPainel.atualizar({ anotamos: ['x'] }), 'sem #o-peca na página, nada acontece');
    const raiz = no();
    globalThis.document = { getElementById: id => (id === 'o-peca' ? raiz : null), createElement: () => no() };
    janela.BZPainel.atualizar({ anotamos: ['Vende bolos'] });
    assert.equal(raiz.hidden, false, 'com painel, o bloco aparece');
    assert.ok(raiz.children.length >= 1, 'e foi desenhado');
    janela.BZPainel.atualizar(undefined);
    assert.equal(raiz.hidden, true, 'E.painel undefined: o bloco some, sem erro');
  } finally { globalThis.document = anterior; }
});

test('painel na tela: a página liga o módulo, o CSS e o ponto de montagem; o fade some em movimento reduzido; nada de blur', () => {
  const html = fs.readFileSync(new URL('../../orcamento.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="orc-peca" id="o-peca"[^>]*hidden><\/div>/, 'o ponto de montagem começa escondido (sem JS ele não aparece)');
  assert.match(html, /css\/orcamento-painel\.css/); assert.match(html, /js\/orcamento-painel\.js/);
  assert.ok(html.indexOf('js/orcamento-painel.js') < html.indexOf('js/orcamento.js'), 'o módulo é carregado antes do orcamento.js que o chama (defer mantém a ordem)');
  const css = fs.readFileSync(new URL('../../css/orcamento-painel.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.orc-peca \.is-novo\s*\{\s*animation: none/, 'movimento reduzido: sem animação');
  const cssSemComentario = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/blur|drop-shadow|box-shadow|filter\s*:|style=/.test(cssSemComentario), 'sem desfoque nem brilho (o dono proíbe)');
  assert.ok(!/animation[^;]*infinite/.test(css), 'nenhum movimento contínuo');
  assert.ok(!/overscroll-behavior/.test(cssSemComentario), 'a roda do mouse encadeia com a página (a coluna rolável não prende a rolagem)');
  const js = fs.readFileSync(new URL('../../js/orcamento.js', import.meta.url), 'utf8');
  assert.match(js, /window\.BZPainel\.atualizar\(E\.painel\)/, 'o render passa o painel do estado');
});

test('painel: a rota de estado liga o filtro de nicho regulado (o nicho vale a sessão: briefing e o que a pessoa disse)', () => {
  const fluxo = fs.readFileSync(new URL('../../api/_vendas/fluxo.mjs', import.meta.url), 'utf8');
  assert.match(fluxo, /montarPainel\(e\.conversa\?\.briefing,\s*\{\s*regulado:\s*!!nichoDaSessao\(\{\s*briefing:\s*e\.conversa\?\.briefing,\s*mensagens:\s*e\.mensagens\s*\}\)\s*\}\)/, 'o estado passa regulado ao painel');
});

test('passo seguinte do código: sem frase entre aspas para o modelo copiar nem o termo interno "direções" (achado do teste com o modelo real no staging, 03/11)', async () => {
  const fonte = fs.readFileSync(new URL('../../api/_vendas/consultor.mjs', import.meta.url), 'utf8');
  const ini = fonte.indexOf('export function proximoPasso');
  const corpo = fonte.slice(ini, fonte.indexOf('\n}\n', ini));
  assert.ok(corpo.length > 500, 'achou o corpo da função');
  assert.ok(!/direç(?:ão|ões)/.test(corpo), 'o passo seguinte fala em modelos, não em direções (o Zero repete o que lê)');
  assert.ok(!/saírem com a cara/.test(corpo), 'a fórmula de abertura que o Zero repetia em todo turno não está mais escrita');
  assert.match(corpo, /sem fórmula de abertura repetida/, 'e o passo manda não repetir fórmula de abertura');
});

test('passo seguinte e prompt: o valor já dito não se repete nem se reestima sem mudança, e o Zero não finge conversa anterior (achados do teste com o modelo real, 03/11)', async () => {
  const fonte = fs.readFileSync(new URL('../../api/_vendas/consultor.mjs', import.meta.url), 'utf8');
  const ini = fonte.indexOf('export function proximoPasso');
  const corpo = fonte.slice(ini, fonte.indexOf('\n}\n', ini));
  assert.equal(corpo.split('O valor já foi dito: não o repita e não chame estimar de novo enquanto formato, páginas, extras (e as quantidades), urgência e complexidade não mudarem; se algum mudou, chame estimar e diga o que mudou e o novo valor').length - 1, 2, 'os dois passos depois da estimativa trazem a regra do valor já dito, com tudo que muda o preço e o que fazer quando muda');
  assert.ok(!/recado para a equipe/.test(corpo), 'o passo da etapa contato não manda o recado "para a equipe" (a regra 1 proíbe falar em equipe)');
  const REGRAS = JSON.parse(fs.readFileSync(new URL('../../docs/fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
  const s = montarSistema(REGRAS, { direcoes: 'manual', metodos: ['pix'] });
  assert.match(s, /nem finja conversa anterior/, 'o prompt proíbe fingir conversa anterior');
  assert.ok(s.length <= 27000, 'o prompt segue dentro do limite: ' + s.length);
});

/* ---------- a pergunta que voltava com as mesmas palavras (teste com o modelo real, 03/11) ---------- */
test('pergunta repetida: a frase com ? quase igual a uma pergunta das duas últimas falas do Zero sai; a reformulada fica', async () => {
  const { semPerguntaRepetida } = await import('../../api/_vendas/zero.mjs');
  const P = 'Você já tem fotos dos seus bolos pra usar?';
  /* repetida palavra por palavra: sai, o resto fica */
  let r = semPerguntaRepetida('Então o site pode falar com as duas coisas, com um botão de WhatsApp. ' + P, ['Fica em R$ 2.900. ' + P]);
  assert.equal(r.trocou, true); assert.equal(r.texto, 'Então o site pode falar com as duas coisas, com um botão de WhatsApp.');
  /* só diferença de caixa, acento e pontuação: ainda é a mesma pergunta */
  r = semPerguntaRepetida('Certo, anotei. Voce ja tem fotos dos seus bolos pra usar??', [P]);
  assert.equal(r.trocou, true); assert.equal(r.texto, 'Certo, anotei.');
  /* reformulada mais curta, com outras palavras: passa */
  r = semPerguntaRepetida('Tudo bem. Tem foto dos bolos?', [P]);
  assert.deepEqual(r, { texto: 'Tudo bem. Tem foto dos bolos?', trocou: false });
  /* pergunta nova: passa */
  r = semPerguntaRepetida('Anotei. Quem costuma encomendar com você, família ou empresas?', [P]);
  assert.equal(r.trocou, false);
  /* se sobrasse só a pergunta repetida, o texto fica como veio (nunca resposta vazia) */
  r = semPerguntaRepetida(P, [P]);
  assert.deepEqual(r, { texto: P, trocou: false });
  /* só as DUAS últimas falas contam; sem falas, nada muda; entrada estranha não quebra */
  assert.equal(semPerguntaRepetida('Oi. ' + P, ['a', 'b', P, 'c']).trocou, true, 'a pergunta está numa das duas últimas');
  assert.equal(semPerguntaRepetida('Oi. ' + P, [P, 'a', 'b']).trocou, false, 'a pergunta é de três falas atrás');
  for (const x of [[], null, undefined, 'texto', [null, 7, {}]]) assert.equal(semPerguntaRepetida('Oi. ' + P, x).trocou, false);
  assert.deepEqual(semPerguntaRepetida(undefined, [P]), { texto: '', trocou: false });
  /* afirmação igual não é pergunta: não mexe */
  assert.equal(semPerguntaRepetida('Fica em R$ 2.900 e leva 5 dias.', ['Fica em R$ 2.900 e leva 5 dias.']).trocou, false);
});

test('pergunta repetida: o agente aplica o filtro sobre o que vai para a tela, olhando as falas guardadas do Zero', async () => {
  const REGRAS = JSON.parse(fs.readFileSync(new URL('../../docs/fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
  const { executarTurno } = await import('../../api/_vendas/agente.mjs');
  const P = 'Você já tem fotos dos seus bolos pra usar?';
  const ia = { mensagem: async () => ({ texto: 'Então o site cobre aniversário e festa de empresa. ' + P, chamadas: [], conteudo: [{ type: 'text', text: 'x' }], parada: 'fim', custo_usd: 0 }) };
  const mensagens = [{ papel: 'visitante', conteudo: 'oi' }, { papel: 'agente', conteudo: 'Fica em R$ 2.900. ' + P }, { papel: 'visitante', conteudo: 'mais família' }];
  const r = await executarTurno({ ia, regras: REGRAS, conversa: { etapa: 'descoberta', briefing: {}, mensagens }, mensagem: 'e então?', direcoes: 'manual', metodos: ['pix'] });
  assert.ok(!r.resposta.includes('fotos dos seus bolos'), 'a pergunta repetida não chega à tela: ' + r.resposta);
  assert.match(r.resposta, /aniversário e festa de empresa/, 'o resto da resposta fica');
  /* sem a pergunta antes, a mesma resposta passa inteira */
  const sem = await executarTurno({ ia, regras: REGRAS, conversa: { etapa: 'descoberta', briefing: {}, mensagens: mensagens.filter(m => m.papel !== 'agente') }, mensagem: 'e então?', direcoes: 'manual', metodos: ['pix'] });
  assert.match(sem.resposta, /fotos dos seus bolos/, 'sem a pergunta antes, ela passa');
});

test('pergunta repetida: limiar, tamanho mínimo e número com ponto (achados da revisão)', async () => {
  const { semPerguntaRepetida: s } = await import('../../api/_vendas/zero.mjs');
  const P = 'Você já tem fotos dos seus bolos pra usar agora?';   /* 8 palavras: voce, tem, fotos, dos, seus, bolos, pra, usar, agora (>2 letras: 8) */
  /* quase igual (uma palavra a mais, Jaccard ~0,89): sai */
  assert.equal(s('Certo. Você já tem fotos dos seus bolos pra usar agora mesmo?', [P]).trocou, true);
  /* parecida pela metade (Jaccard ~0,4): fica */
  assert.equal(s('Certo. Você tem fotos dos bolos da vitrine para mostrar no site?', [P]).trocou, false);
  /* pergunta curta (menos de 3 palavras com mais de 2 letras) nunca casa */
  assert.equal(s('Entendi. Quer ver?', ['Ok. Quer ver?']).trocou, false);
  /* número com ponto não quebra a frase: o resto nunca fica truncado em "2." */
  const r = s('Fica em 2.900, quer ver os três modelos do seu site?', ['Fica em 2.900, quer ver os três modelos do seu site?']);
  assert.equal(r.trocou, false, 'só havia a pergunta repetida: o texto fica inteiro');
  assert.equal(r.texto, 'Fica em 2.900, quer ver os três modelos do seu site?');
  const r2 = s('O prazo é 1.5 semana. Quer ver os três modelos do seu site?', ['Quer ver os três modelos do seu site?']);
  assert.equal(r2.texto, 'O prazo é 1.5 semana.');
});

test('pergunta repetida: se o turno ligou um botão (recado ou diagnóstico), o convite fica no texto', async () => {
  const REGRAS = JSON.parse(fs.readFileSync(new URL('../../docs/fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
  const { executarTurno } = await import('../../api/_vendas/agente.mjs');
  const P = 'Quer deixar um recado para a gente retornar?';
  let rodada = 0;
  const ia = { mensagem: async () => (rodada++ === 0
    ? { texto: '', chamadas: [{ id: 't1', nome: 'encaminhar_diagnostico', entrada: { motivo: 'pedido' } }], conteudo: [{ type: 'tool_use', id: 't1', name: 'encaminhar_diagnostico', input: { motivo: 'pedido' } }], parada: 'ferramenta', custo_usd: 0 }
    : { texto: 'Entendi o seu caso. ' + P, chamadas: [], conteudo: [{ type: 'text', text: 'x' }], parada: 'fim', custo_usd: 0 }) };
  const mensagens = [{ papel: 'visitante', conteudo: 'oi' }, { papel: 'agente', conteudo: 'Certo. ' + P }, { papel: 'visitante', conteudo: 'hum' }];
  const r = await executarTurno({ ia, regras: REGRAS, conversa: { etapa: 'descoberta', briefing: {}, mensagens }, mensagem: 'e então?', direcoes: 'manual', metodos: ['pix'] });
  assert.ok(r.diagnostico, 'o diagnóstico foi acionado: ' + JSON.stringify(r.diagnostico));
  assert.match(r.resposta, /recado/, 'o convite fica junto do botão: ' + r.resposta);
});

/* ---------- sobras da rodada 7: quem faz é a Beyon ("a gente"), e o passo 3 usa a palavra do cliente: "modelos" ---------- */
test('prompt do Zero: quem faz o trabalho é a Beyon ("a gente", nunca "eu monto/desenho/mostro") e o processo fala em "modelos", não em "direções"', () => {
  const REGRAS = JSON.parse(fs.readFileSync(new URL('../../docs/fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
  for (const direcoes of ['api', 'manual']) {
    const s = montarSistema(REGRAS, { direcoes, metodos: ['pix'] });
    assert.match(s, /Quem faz é a Beyon: diga "a gente", nunca "eu monto\/desenho\/mostro"/, direcoes + ': a regra da voz da empresa está no prompt');
    assert.match(s, /\n3\. Modelos: /, direcoes + ': o passo 3 do processo se chama "Modelos"');
    assert.ok(!/direç(?:ão|ões)(?! visual)/i.test(s), direcoes + ': "direções" (os modelos) é jargão que o modelo repetia e não aparece no prompt; "direção visual" da tabela de preços é outra coisa e fica');
    assert.ok(!/falando como "a gente" ou "eu"/.test(s), direcoes + ': a recusa em saúde fala como "a gente", sem "ou eu"');
    assert.ok(s.length <= 27000, direcoes + ': o prompt segue dentro do limite: ' + s.length);
  }
});

/* ---------- pendências do #75: suporte pós-entrega e mensalidade do atendente (api/_vendas/travas-promessa.mjs) ---------- */
/* as frases vêm das revisões do PR #85 (docs/testes/travas-promessa-casos.mjs); o teste mostra TODAS as falhas de uma vez */
test('travas de promessa: pegam a promessa afirmativa de suporte e de mensalidade do atendente e deixam passar a resposta correta', () => {
  const falhas = [];
  for (const t of SUPORTE_PEGAR) if (!semPromessaDeSuporte(t).trocou) falhas.push('suporte, não pegou: ' + t);
  for (const t of SUPORTE_PASSAR) if (semPromessaDeSuporte(t).trocou) falhas.push('suporte, cortou resposta boa: ' + t);
  for (const t of MENSALIDADE_PEGAR) if (!semMensalidadeDoAtendente(t).trocou) falhas.push('atendente, não pegou: ' + t);
  for (const t of MENSALIDADE_PASSAR) if (semMensalidadeDoAtendente(t).trocou) falhas.push('atendente, cortou resposta boa: ' + t);
  assert.deepEqual(falhas, [], falhas.length + ' falhas:\n' + falhas.join('\n'));
});

test('travas de promessa: o texto fixo não dispara a si mesmo nem a outra trava, e a resposta trocada é exatamente o texto fixo', () => {
  for (const fixo of [SUPORTE_FIXO, ATENDENTE_FIXO]) {
    assert.equal(semPromessaDeSuporte(fixo).trocou, false, fixo);
    assert.equal(semMensalidadeDoAtendente(fixo).trocou, false, fixo);
  }
  assert.equal(semPromessaDeSuporte('Damos suporte contínuo.').texto, SUPORTE_FIXO);
  assert.equal(semMensalidadeDoAtendente('O atendente tem mensalidade.').texto, ATENDENTE_FIXO);
  assert.match(SUPORTE_FIXO, /não há suporte contínuo/, 'o texto de suporte nega o suporte contínuo');
  assert.doesNotMatch(SUPORTE_FIXO, /arquivos|seu site|fica seu/i, 'o texto fixo não afirma propriedade nem portabilidade do site (CDC): o prompt não confirma isso');
  assert.match(ATENDENTE_FIXO, /em preparo/, 'o texto do atendente diz que ainda está em preparo');
});

test('travas de promessa: entrada estranha não quebra nem demora (texto vazio, só espaço, 1.500 letras iguais, 190 "suporte")', () => {
  const casos = ['', '   ', null, undefined, 'a'.repeat(1500), 'suporte '.repeat(190), 'suporte, '.repeat(160), 'atendente mensalidade '.repeat(68)];
  const ini = performance.now();
  for (const c of casos) {
    assert.equal(typeof semPromessaDeSuporte(c).trocou, 'boolean');
    assert.equal(typeof semMensalidadeDoAtendente(c).trocou, 'boolean');
  }
  /* (medido: ~4 ms no total; a margem larga é para CI lento, o que se quer pegar é backtracking de segundos) */
  assert.ok(performance.now() - ini < 3000, 'as duas travas respondem rápido em texto hostil: ' + (performance.now() - ini).toFixed(1) + ' ms');
});

test('travas de promessa: os furos conhecidos (paráfrases sem as palavras da lista) estão documentados e continuam fora de propósito', () => {
  const pegas = FUROS_CONHECIDOS.filter(t => semPromessaDeSuporte(t).trocou || semMensalidadeDoAtendente(t).trocou);
  assert.deepEqual(pegas, [], 'estas já são pegas: tire de FUROS_CONHECIDOS e ponha em PEGAR');
});

test('turno: suporte pós-entrega e mensalidade do atendente prometidos pelo modelo saem com o texto fixo (a trava está ligada no agente)', async () => {
  const suporte = await executarTurno({ ia: roteiro(fim('Depois da entrega a gente cuida da manutenção do seu site.')), regras: REGRAS, conversa: nova(), mensagem: 'e depois que ficar pronto?' });
  assert.equal(suporte.resposta, SUPORTE_FIXO);
  const atendente = await executarTurno({ ia: roteiro(fim('O atendente de IA tem uma mensalidade bem acessível.')), regras: REGRAS, conversa: nova(), mensagem: 'e o atendente, quanto custa?' });
  assert.equal(atendente.resposta, ATENDENTE_FIXO);
  const certo = await executarTurno({ ia: roteiro(fim('Depois da entrega não há suporte contínuo.')), regras: REGRAS, conversa: nova(), mensagem: 'e depois que ficar pronto?' });
  assert.equal(certo.resposta, 'Depois da entrega não há suporte contínuo.');
});

/* ---------- travas de RESULTADO e de GARANTIA (api/_vendas/travas-resultado.mjs) ---------- */
/* o Zero não promete mais clientes, vendas, posição no Google nem retorno, não inventa dado de cliente e não promete garantia que a
   empresa não ofereceu (CDC art. 30 e 37; CLAUDE.md: zero invenção de dado). As frases ficam em docs/testes/travas-resultado-casos.mjs */
test('travas de resultado e garantia: pegam a promessa afirmativa e deixam passar a negação, a possibilidade, a pergunta e o que a empresa disse', () => {
  const falhas = [];
  for (const t of RESULTADO_PEGAR) if (!semPromessaDeResultado(t).trocou) falhas.push('resultado, não pegou: ' + t);
  for (const t of RESULTADO_PASSAR) if (semPromessaDeResultado(t).trocou) falhas.push('resultado, cortou resposta boa: ' + t);
  for (const t of GARANTIA_PEGAR) if (!semGarantia(t).trocou) falhas.push('garantia, não pegou: ' + t);
  for (const t of GARANTIA_PASSAR) if (semGarantia(t).trocou) falhas.push('garantia, cortou resposta boa: ' + t);
  assert.deepEqual(falhas, [], falhas.length + ' falhas:\n' + falhas.join('\n'));
});

test('travas de resultado e garantia: uma não corta o que a outra deixa passar, e nenhuma corta o que as travas de suporte e mensalidade deixam', () => {
  const falhas = [];
  const boas = [...RESULTADO_PASSAR, ...GARANTIA_PASSAR, ...SUPORTE_PASSAR, ...MENSALIDADE_PASSAR];
  for (const t of boas) {
    if (semPromessaDeResultado(t).trocou) falhas.push('resultado cortou: ' + t);
    if (semGarantia(t).trocou) falhas.push('garantia cortou: ' + t);
  }
  /* (as falas fixas do Zero também não podem ser cortadas) */
  for (const t of [ABERTURA_PADRAO, RECADO_FIXO, SUPORTE_FIXO, ATENDENTE_FIXO, ...Object.values(ABERTURAS)]) {
    if (semPromessaDeResultado(t).trocou) falhas.push('resultado cortou o texto fixo: ' + t);
    if (semGarantia(t).trocou) falhas.push('garantia cortou o texto fixo: ' + t);
  }
  assert.deepEqual(falhas, [], falhas.length + ' falhas:\n' + falhas.join('\n'));
});

test('travas de resultado e garantia: o texto fixo não dispara a si mesmo nem a outra trava, e sem promessa o texto fica intacto', () => {
  for (const fixo of [RESULTADO_FIXO, GARANTIA_FIXO]) {
    assert.equal(semPromessaDeResultado(fixo).trocou, false, fixo);
    assert.equal(semGarantia(fixo).trocou, false, fixo);
    assert.equal(semPromessaDeSuporte(fixo).trocou, false, fixo);
    assert.equal(semMensalidadeDoAtendente(fixo).trocou, false, fixo);
    assert.equal(semPromessaDeDesconto(fixo).trocou, false, fixo);
    assert.equal(semPromessaDeRecado(fixo).trocou, false, fixo);
    assert.equal(semPrecoNoTexto(fixo), fixo, 'o texto fixo não tem número que o filtro de preço troque: ' + fixo);
    assert.match(fixo, /^[^\n]+$/, 'uma linha só');
    assert.ok(fixo.length < 320, 'o texto fixo cabe folgado nos 400 caracteres que o código pode acrescentar: ' + fixo.length);
  }
  assert.equal(semPromessaDeResultado('Vai dobrar suas vendas.').texto, RESULTADO_FIXO);
  assert.equal(semGarantia('Damos garantia de 12 meses.').texto, GARANTIA_FIXO);
  assert.match(RESULTADO_FIXO, /não dá para garantir/, 'o texto de resultado nega a garantia de resultado');
  assert.doesNotMatch(RESULTADO_FIXO, /primeiro lugar/i, 'o texto fixo não promete nada');
  /* (o texto fixo de garantia só repete o que está em condicoes.html: 7 dias para desistir e a entrada de volta; devolução se a Beyon atrasar) */
  assert.match(GARANTIA_FIXO, /7 dias para desistir/);
  assert.match(GARANTIA_FIXO, /atrasar a entrega, a gente devolve a entrada/);
  assert.equal(semPromessaDeResultado('').trocou, false);
  assert.equal(semGarantia(null).texto, '');
});

test('travas de resultado e garantia: troca só a frase que promete e o resto da resposta (valor, pergunta) fica', () => {
  const a = semPromessaDeResultado('O formato fica [[total]]. Vai dobrar suas vendas, com certeza. Quer ver os modelos?');
  assert.equal(a.trocou, true);
  assert.equal(a.texto, 'O formato fica [[total]]. ' + RESULTADO_FIXO + ' Quer ver os modelos?');
  const b = semGarantia('Entendi. Damos garantia de 12 meses. Qual é o seu ramo?');
  assert.equal(b.texto, 'Entendi. ' + GARANTIA_FIXO + ' Qual é o seu ramo?');
  /* duas promessas na mesma resposta: o texto fixo entra uma vez só */
  const c = semPromessaDeResultado('Vai dobrar suas vendas. Seu faturamento vai subir.');
  assert.equal(c.texto, RESULTADO_FIXO);
});

test('travas de resultado e garantia: os furos conhecidos estão documentados (melhorar a trava só gera um aviso, nunca vermelho)', () => {
  const pegas = [...FUROS_RESULTADO_CONHECIDOS, ...FUROS_DA_RODADA_2].filter(t => semPromessaDeResultado(t).trocou || semGarantia(t).trocou);
  if (pegas.length) console.warn('[aviso] ' + pegas.length + ' de ' + (FUROS_RESULTADO_CONHECIDOS.length + FUROS_DA_RODADA_2.length) + ' furos conhecidos já são pegos; mova para PEGAR:\n  ' + pegas.join('\n  '));
  assert.ok(Array.isArray(FUROS_RESULTADO_CONHECIDOS) && FUROS_RESULTADO_CONHECIDOS.every(t => typeof t === 'string' && t.length > 3));
  assert.ok(RESULTADO_PEGAR.length + RESULTADO_PASSAR.length + GARANTIA_PEGAR.length + GARANTIA_PASSAR.length + FUROS_RESULTADO_CONHECIDOS.length >= 150, 'pelo menos 150 frases de caso');
});

test('travas de resultado e garantia: entrada estranha não quebra nem demora (ReDoS: 50 mil caracteres patológicos)', () => {
  const ruins = [
    '', '   ', null, undefined, 'a'.repeat(50000), 'vai '.repeat(12500), 'vai trazer mais '.repeat(3125), 'clientes '.repeat(5500),
    'garantia '.repeat(5500), 'nossos clientes '.repeat(3125), 'não, '.repeat(10000), 'vai vender e '.repeat(3800), 'a '.repeat(25000),
    'primeiro lugar no '.repeat(2700), 'devolvemos o dinheiro se '.repeat(2000),
    /* rodada 2: o que a revisão de segurança mediu como pior caso (25 mil linhas curtas custavam ~4 s) */
    'a\n'.repeat(25000), 'vai trazer a\n'.repeat(4000), 'a. '.repeat(16000), 'a, '.repeat(16000), 'mas '.repeat(12500), '1.'.repeat(25000) + 'x', 'sem '.repeat(12500), 'mais '.repeat(10000) + 'clientes', ('x'.repeat(40) + ' ').repeat(1200) + 'vai dobrar'
  ];
  const ini = performance.now();
  for (const c of ruins) {
    assert.equal(typeof semPromessaDeResultado(c).trocou, 'boolean');
    assert.equal(typeof semGarantia(c).trocou, 'boolean');
  }
  /* (medido no relatório do PR; a margem larga é para CI lento, o que se quer pegar é backtracking de segundos) */
  assert.ok(performance.now() - ini < 3000, 'as duas travas respondem rápido em texto hostil: ' + (performance.now() - ini).toFixed(1) + ' ms');
});

test('travas de resultado e garantia: o gabarito do classificador (promete_resultado) — nenhum controle é cortado e os positivos ficam pegos', () => {
  const g = JSON.parse(fs.readFileSync(new URL('../gabarito/classificador/saida_do_zero.json', import.meta.url), 'utf8'));
  const certa = c => c.certa.promete_resultado ?? g.padrao.promete_resultado;
  const falsosSim = g.casos.filter(c => certa(c) === 'nao' && semPromessaDeResultado(c.texto).trocou).map(c => c.id + ': ' + c.texto);
  assert.deepEqual(falsosSim, [], 'falso "sim" no gabarito (corta resposta boa)');
  const positivos = g.casos.filter(c => certa(c) === 'sim');
  assert.equal(positivos.length, 14);
  const faltam = positivos.filter(c => !semPromessaDeResultado(c.texto).trocou).map(c => c.id);
  assert.deepEqual(faltam, [], 'positivos do gabarito que a trava não pegou');
});

test('turno: resultado e garantia prometidos pelo modelo saem com o texto fixo (as travas estão ligadas no agente), e a resposta honesta fica', async () => {
  const r = await executarTurno({ ia: roteiro(fim('Com esse site você vai dobrar seus clientes.')), regras: REGRAS, conversa: nova(), mensagem: 'esse site traz mais clientes?' });
  assert.equal(r.resposta, RESULTADO_FIXO);
  const g = await executarTurno({ ia: roteiro(fim('Damos garantia de 12 meses.')), regras: REGRAS, conversa: nova(), mensagem: 'tem garantia?' });
  assert.equal(g.resposta, GARANTIA_FIXO);
  const certo = await executarTurno({ ia: roteiro(fim('Não prometemos mais clientes: o que eu garanto é um site claro. Qual é o seu ramo?')), regras: REGRAS, conversa: nova(), mensagem: 'esse site traz mais clientes?' });
  assert.equal(certo.resposta, 'Não prometemos mais clientes: o que eu garanto é um site claro. Qual é o seu ramo?');
  const desistencia = await executarTurno({ ia: roteiro(fim('Depois de aceitar, você tem 7 dias para desistir e receber a entrada de volta.')), regras: REGRAS, conversa: nova(), mensagem: 'e se eu não gostar?' });
  assert.equal(desistencia.resposta, 'Depois de aceitar, você tem 7 dias para desistir e receber a entrada de volta.');
  /* a promessa com número escrito pelo modelo: o filtro de preço roda antes e a trava de resultado ainda vê a promessa */
  const num = await executarTurno({ ia: roteiro(fim('Por R$ 2.900 você vai dobrar as suas vendas.')), regras: REGRAS, conversa: nova(), mensagem: 'quanto fica?' });
  assert.ok(num.resposta.includes(RESULTADO_FIXO), 'a promessa saiu: ' + num.resposta);
  assert.doesNotMatch(num.resposta, /dobrar/);
  /* o valor do motor continua entrando depois da troca */
  const comValor = await executarTurno({ ia: roteiro(fim('O formato fica [[total]]. Vai dobrar suas vendas, com certeza.')), regras: REGRAS, conversa: nova({ estimativa: { valor_total: 2900, sinal: 1160 } }), mensagem: 'quanto fica?' });
  assert.match(comValor.resposta, /R\$/, 'o valor do motor continua na resposta');
  assert.ok(comValor.resposta.includes(RESULTADO_FIXO));
});


/* ---------- RODADA 2 das travas de resultado e garantia (correção depois das revisões técnica e de segurança) ---------- */
/* Escritos ANTES da correção (vermelhos): as frases de prova dos revisores estão em docs/testes/travas-resultado-casos.mjs (RODADA2_*) */
const unir = (...mapas) => {
  const saida = {};
  for (const m of mapas) for (const [k, v] of Object.entries(m)) saida[k] = [...(saida[k] || []), ...v];
  return saida;
};
const PEGAR2 = unir(RODADA2_PEGAR, RODADA2_EXTRA_PEGAR, RODADA3_PEGAR);
const PASSAR2 = unir(RODADA2_PASSAR, RODADA2_EXTRA_PASSAR, RODADA3_PASSAR);
const corta = t => semPromessaDeResultado(t).trocou || semGarantia(t).trocou;

for (const [grupo, frases] of Object.entries(PEGAR2)) {
  test('rodada 2 [' + grupo + ']: a promessa é trocada (' + frases.length + ' frases)', () => {
    const furos = frases.filter(t => !corta(t));
    assert.deepEqual(furos, [], furos.length + ' de ' + frases.length + ' não pegas:\n' + furos.join('\n'));
  });
}
for (const [grupo, frases] of Object.entries(PASSAR2)) {
  test('rodada 2 [' + grupo + ']: a resposta honesta passa intacta (' + frases.length + ' frases)', () => {
    const cortadas = frases.filter(corta);
    assert.deepEqual(cortadas, [], cortadas.length + ' de ' + frases.length + ' cortadas:\n' + cortadas.join('\n'));
  });
}

test('rodada 2 [T2]: dado inventado sobre os clientes da Beyon sai com o texto fixo PRÓPRIO, não com o de resultado', () => {
  for (const t of PEGAR2.T2_dado_inventado) assert.equal(semPromessaDeResultado(t).texto, DADO_FIXO, t);
  assert.match(DADO_FIXO, /casos publicados/);
  assert.doesNotMatch(DADO_FIXO, /\d/, 'o texto fixo não inventa número');
  /* resultado e dado na mesma resposta: cada texto fixo entra uma vez só, no lugar da sua frase */
  const duas = semPromessaDeResultado('Fizemos sites para dezenas de empresas. Vai dobrar suas vendas. Qual é o seu ramo?');
  assert.equal(duas.texto, DADO_FIXO + ' ' + RESULTADO_FIXO + ' Qual é o seu ramo?');
  assert.equal(semPromessaDeResultado('Vai dobrar suas vendas. Seu faturamento vai subir.').texto, RESULTADO_FIXO);
});

test('rodada 2 [T2]: os textos fixos falam do que a trava cobre, sem soar errado e sem disparar nenhuma trava', () => {
  assert.match(RESULTADO_FIXO, /Google/, 'o texto de resultado cobre também a posição no Google');
  assert.match(RESULTADO_FIXO, /não promete/);
  assert.doesNotMatch(GARANTIA_FIXO, /,\s*e,/, 'sem vírgula dupla');
  assert.doesNotMatch(GARANTIA_FIXO, /a gente [^.]*devolvemos/, 'sem misturar "a gente" com "devolvemos"');
  for (const fixo of [DADO_FIXO, RESULTADO_FIXO, GARANTIA_FIXO]) {
    assert.equal(corta(fixo), false, fixo);
    assert.equal(semPromessaDeSuporte(fixo).trocou, false, fixo);
    assert.equal(semMensalidadeDoAtendente(fixo).trocou, false, fixo);
    assert.equal(semPromessaDeDesconto(fixo).trocou, false, fixo);
    assert.equal(semPromessaDeRecado(fixo).trocou, false, fixo);
    assert.equal(semPrecoNoTexto(fixo), fixo, fixo);
  }
});

test('rodada 2 [I6]: caracteres invisíveis e letras parecidas dentro da palavra não escondem a promessa', () => {
  const base = 'Esse site vai dobrar suas vendas.';
  const invisiveis = ['᠎', '️', 'ㅤ', 'ᅟ', 'ᅠ', 'ﾠ', '⠀', '؜', '឵', '឴', '\u{E0041}', '\u{E007F}', '︀'];
  for (const c of invisiveis) {
    const t = base.replace('dobrar', 'd' + c + 'obrar');
    assert.equal(normalizar(t), normalizar(base), 'normalizar tira U+' + c.codePointAt(0).toString(16));
    assert.equal(semPromessaDeResultado(t).trocou, true, 'U+' + c.codePointAt(0).toString(16));
  }
  const parecidas = [['ν', 'νai'], ['ѵ', 'ѵai'], ['ɑ', 'vɑi']];
  for (const [falsa, palavra] of parecidas) {
    assert.equal(normalizar(palavra), 'vai', 'U+' + falsa.codePointAt(0).toString(16));
    assert.equal(semPromessaDeResultado(base.replace('vai', palavra)).trocou, true, 'homóglifo ' + falsa);
  }
});

test('rodada 2 [M5]: a trava depende de PONTUACAO, CONTRASTE e limpa exportados por travas-promessa.mjs e esse acoplamento está fixado', () => {
  for (const s of ['a, b', 'a; b', 'a: b', 'a (b)', 'a — b', 'a – b', 'a | b']) assert.ok(PONTUACAO.test(s), s);
  assert.ok(CONTRASTE.test('não garanto mas ajudo'));
  assert.ok(CONTRASTE.test('não garanto, porém ajudo'));
  assert.ok(!CONTRASTE.test('o masculino'));
  assert.ok(!/\bnao\b/.test(limpa('nao se preocupe, vai')), 'limpa tira o "não" de "não se preocupe"');
  assert.ok(!/\bsem duvida\b/.test(limpa('sem duvida vai')), 'limpa tira "sem dúvida"');
  /* o efeito que a trava tira disso */
  assert.equal(semPromessaDeResultado('Não se preocupe, vai vender mais.').trocou, true);
  assert.equal(semPromessaDeResultado('Não garanto posição no Google, mas o site vai dobrar suas vendas.').trocou, true);
  assert.equal(semPromessaDeResultado('Não vou prometer que o site vai trazer mais clientes.').trocou, false);
});

test('rodada 2 [T6]: resposta longa com as duas trocas e a linha do valor não passa de 1.500 e não termina no meio da frase', async () => {
  const enche = 'Entendi o seu caso e vou explicar com calma como funciona cada parte do trabalho. '.repeat(12);
  const txt = 'Vai dobrar suas vendas. ' + enche + 'Damos garantia de 12 meses. O formato fica [[total]]. Qual é o seu ramo?';
  assert.ok(txt.length <= 1100, 'a entrada cabe nos 1.100 do modelo: ' + txt.length);
  const r = await executarTurno({ ia: roteiro(fim(txt)), regras: REGRAS, conversa: nova({ estimativa: { valor_total: 2900, sinal: 1160 } }), mensagem: 'quanto fica o valor total?' });
  assert.ok(r.resposta.length <= 1500, 'passou do teto: ' + r.resposta.length);
  assert.match(r.resposta, /[.!?]$/, 'termina em fim de frase: ' + r.resposta.slice(-60));
  assert.ok(r.resposta.includes(RESULTADO_FIXO), 'a troca de resultado ficou');
  assert.match(r.resposta, /R\$/, 'o valor do motor ficou');
  assert.doesNotMatch(r.resposta, /Damos garantia|dobrar suas vendas/, 'nenhuma promessa sobrou');
  /* as três trocas juntas (dado, resultado e garantia) somam mais de 400 caracteres a mais que o texto original: aí o teto de 1.500 corta, e corta em fim de frase */
  const filler = 'Entendi o seu caso e vou explicar com calma como funciona cada parte do trabalho. ';
  const tres = 'Fizemos sites para dezenas de empresas. Vai dobrar suas vendas. Damos garantia de 12 meses. ' + filler.repeat(11) + 'Vou mostrar o formato certo. O formato fica [[total]]. Qual é o seu ramo e para quando você quer o site?';
  assert.ok(tres.length <= 1100, 'cabe nos 1.100 do modelo: ' + tres.length);
  const t3 = await executarTurno({ ia: roteiro(fim(tres)), regras: REGRAS, conversa: nova({ estimativa: { valor_total: 2900, sinal: 1160 } }), mensagem: 'quanto fica o valor total?' });
  assert.ok(t3.resposta.length <= 1500, 'passou do teto: ' + t3.resposta.length);
  assert.match(t3.resposta, /[.!?]$/, 'termina em fim de frase: ' + t3.resposta.slice(-60));
  assert.ok(t3.resposta.includes(DADO_FIXO) && t3.resposta.includes(RESULTADO_FIXO) && t3.resposta.includes(GARANTIA_FIXO), 'as três trocas ficaram');
  /* o pior caso: texto de 1.100 já cheio de frases e as duas promessas no fim */
  const pior = 'Entendi o seu caso e vou explicar com calma como funciona cada parte do trabalho. '.repeat(13) + 'Vai dobrar suas vendas. Damos garantia de 12 meses.';
  const p = await executarTurno({ ia: roteiro(fim(pior)), regras: REGRAS, conversa: nova(), mensagem: 'oi' });
  assert.ok(p.resposta.length <= 1500, 'pior caso passou do teto: ' + p.resposta.length);
  assert.match(p.resposta, /[.!?]$/, 'pior caso termina em fim de frase');
});

test('rodada 2 [M2]: a folga entre o corte do agente (1.100) e o que as travas examinam não encolhe', () => {
  /* a promessa no fim de 1.100 caracteres de frases curtíssimas (o pior caso que o agente deixa chegar) ainda é vista */
  const pior = 'a\n'.repeat(545) + 'Vai dobrar suas vendas.';
  assert.ok(pior.length <= 1120);
  assert.equal(semPromessaDeResultado(pior).trocou, true, 'promessa depois de 545 linhas curtas');
  const outra = 'a. '.repeat(360) + 'Damos garantia de 12 meses.';
  assert.equal(semGarantia(outra).trocou, true, 'garantia depois de 360 frases curtas');
  /* e o que passa muito do limite não é examinado (é o preço de não travar a resposta): documentado, e o agente nunca entrega isso */
  assert.equal(semPromessaDeResultado('a\n'.repeat(5000) + 'Vai dobrar suas vendas.').trocou, false);
});

test('rodada 3 [I2]: dado inventado em anedota ("um dentista que atendemos triplicou...") sai com o texto fixo próprio', () => {
  for (const t of RODADA3_DADO) assert.equal(semPromessaDeResultado(t).texto, DADO_FIXO, t);
});

/* trava "negar ser IA": os testes ficam em travas-identidade.test.mjs (este arquivo está na lista do script testar) */
import './travas-identidade.test.mjs';
/* a planta viva: o agregador roda todo planta-*.test.mjs sem mexer no package.json (nível 3) */
import './planta-todos.test.mjs';
