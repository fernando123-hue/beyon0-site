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
  RECADO_FIXO, ABERTURA_PADRAO, ABERTURAS, semPromessaDeRecado, nichoRegulado, pedeItemProibido,
  garantirRegulado, comMarcadores, briefingSemProibidos, respostaRegulado, semNotacaoInterna, pedeValor, garantirValor
} from '../../api/_vendas/zero.mjs';

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

test('regulados: insistência mantém em uma frase e oferece o recado', () => {
  const n = nichoRegulado('sou dentista');
  const r = garantirRegulado('Pode incluir.', { nicho: n, pediuAgora: true, insistencia: true });
  assert.equal(r.trocou, true);
  assert.match(r.texto, /DEIXAR UM RECADO/);
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

test('turno: pediu de novo depois da recusa: uma frase e o recado, com o botão', async () => {
  const mensagens = [{ papel: 'visitante', conteudo: 'sou dentista, quero depoimento de paciente' }, { papel: 'consultor', conteudo: respostaRegulado(nichoRegulado('dentista')) }];
  const ia = roteiro(fim('Pode incluir sim.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: nova({ mensagens }), mensagem: 'mas eu quero mesmo o depoimento de paciente' });
  assert.match(r.resposta, /DEIXAR UM RECADO/);
  assert.ok(r.diagnostico, 'insistência: o botão aparece');
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
  for (const trecho of ['Sou uma IA, sim, o Zero, da Beyon Zero.', '[[total]]', '[[sinal]]', '[[restante]]', 'DEIXAR UM RECADO', 'encaminhar_diagnostico', 'contato.beyon.zero@gmail.com', 'CRO, CRM, CRP, CRN, CREFITO, OAB', 'Nunca diga "nossa equipe"', 'COMO VOCÊ SOA', 'EXEMPLOS DO QUE NÃO FAZER'])
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
