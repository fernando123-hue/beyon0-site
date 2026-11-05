/* A FERRAMENTA ler_caso E O TURNO DO AGENTE (PR 2d-ligação; spec §3.3; plano "PR 2d-ligação"). Sem modelo: o provedor é um roteiro (respostas prontas) ou o simulado.
   Prova: a lista de ferramentas só tem ler_caso com a flag (leitura) E o preço aberto, no fim da lista; o proximoPasso pede a leitura na hora certa e termina com o texto de
   hoje; a leitura que o modelo manda é gravada com ÂNCORA nas falas do VISITANTE (nunca nas do Zero); forma errada volta uma vez; inválida não muda o que já está;
   uma por turno; o modelo vê a leitura de agora no bloco BRIEFING (nunca no ESTADO); e, com a flag desligada, nada do que o Zero faz hoje muda.
   node --test docs/testes/planta-leitura-agente.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarSistema, proximoPasso, ferramentas, PREFIXO_PLANTA, PREFIXO_LEITURA, pedeLeitura } from '../../api/_vendas/consultor.mjs';
import { executarTurno, estadoParaModelo } from '../../api/_vendas/agente.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { custoUsd, RESERVA_USD, PAPEIS, TETOS } from '../../api/_ia/config.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const NOMES5 = ['atualizar_briefing', 'estimar', 'pedir_contato', 'sugerir_solucao_ia', 'encaminhar_diagnostico'];
const EIXOS = ['volume', 'repeticao', 'urgencia', 'pessoas', 'informacao'];
const leitura = (por = {}) => ({ eixos: EIXOS.map(eixo => ({ eixo, ...(por[eixo] || { nivel: 'nao_falou' }) })) });
const nivelDe = (l, eixo) => l.eixos.find(e => e.eixo === eixo).nivel;
const evidDe = (l, eixo) => l.eixos.find(e => e.eixo === eixo).evidencia;

const BRIEFING = { negocio: { nome: 'Clínica Aurora', segmento: 'loja de roupas', descricao: 'loja de roupas em Niterói' }, objetivos: ['vender'], projeto: { formato: 'institucional' }, situacao_atual: { como_chegam: 'indicação' } };
const ESTIMATIVA = { id: 'e1', prazo_dias: 8, fase: 1, fatores: { formato: 'institucional' }, detalhes: { itens: [{ nome: 'Site institucional', qtd: 1 }] } };
const MENSAGENS = [
  { papel: 'visitante', conteudo: 'Tenho uma loja de roupas. Tem semana de agenda cheia e toda hora perguntam o horário.' },
  { papel: 'agente', conteudo: 'Certo. Só a recepcionista atende, então?' },
  { papel: 'visitante', conteudo: 'Quero vender mais.' },
  { papel: 'agente', conteudo: 'Fica assim.' }
];

/* o provedor-roteiro: cada rodada devolve a próxima resposta pronta; guarda o que recebeu */
const chamada = (nome, entrada, id) => ({ id: id || 'c_' + nome + '_' + Math.random().toString(36).slice(2, 7), nome, entrada });
const resp = (chamadas = [], texto = '') => ({ texto, chamadas, conteudo: [...(texto ? [{ type: 'text', text: texto }] : []), ...chamadas.map(c => ({ type: 'tool_use', id: c.id, name: c.nome, input: c.entrada }))], parada: chamadas.length ? 'ferramenta' : 'fim', modelo: 'roteiro', uso: {}, custo_usd: 0 });
function roteiro(...respostas) {
  const recebidos = [];
  let i = 0;
  return { recebidos, mensagem: async p => { recebidos.push(clone(p)); return respostas[Math.min(i++, respostas.length - 1)]; } };
}
/* o resultado de cada ferramenta, devolvido ao modelo na rodada n */
const voltas = (ia, n) => ia.recebidos[n].mensagens.at(-1).content.map(r => JSON.parse(r.content));
const conversaDe = (extra = {}) => ({ etapa: 'estimativa', briefing: clone(BRIEFING), mensagens: clone(MENSAGENS), estimativa: ESTIMATIVA, ...extra });
const turno = (ia, extra = {}, flags = { planta: true }) => executarTurno({ ia, regras: REGRAS, conversa: conversaDe(extra.conversa), mensagem: extra.mensagem || 'Hoje a recepção anota num caderno.', ...flags });

/* ---------- a lista de ferramentas ---------- */
test('ferramentas: ler_caso só entra com leitura:true E preço aberto, no FIM da lista (prefixo de cache); sem a flag a lista é a de hoje', () => {
  const nomes = o => ferramentas(REGRAS, o).map(f => f.name);
  assert.deepEqual(nomes({}), NOMES5);
  assert.deepEqual(nomes({ leitura: false }), NOMES5);
  for (const etapa of ['descoberta', 'estimativa', 'contato']) {
    assert.deepEqual(nomes({ etapa, leitura: true }), [...NOMES5, 'ler_caso'], etapa);
    assert.deepEqual(nomes({ etapa, planta: true, leitura: true }), [...NOMES5, 'desenhar_planta', 'ler_caso'], etapa);
    assert.deepEqual(nomes({ etapa, planta: true }), [...NOMES5, 'desenhar_planta'], 'só a planta: a lista do 2a');
  }
  assert.deepEqual(nomes({ leitura: true }), [...NOMES5, 'ler_caso'], 'sem etapa vem a lista toda');
  assert.deepEqual(nomes({ etapa: 'escopo', leitura: true, planta: true }), []);
  assert.deepEqual(nomes({ etapa: 'aguardando_pagamento', leitura: true }), []);
  assert.deepEqual(nomes({ etapa: 'contato', pedidoStatus: 'confirmado', planta: true, leitura: true }), ['atualizar_briefing', 'sugerir_solucao_ia', 'encaminhar_diagnostico']);
  for (const etapa of ['gerando', 'direcoes', 'escolhida', 'alteracoes']) assert.ok(!nomes({ etapa, leitura: true }).includes('ler_caso'), etapa);
  assert.deepEqual(ferramentas(REGRAS, { etapa: 'estimativa', leitura: true }), ferramentas(REGRAS, { etapa: 'estimativa', leitura: true }));
});

test('o prompt de sistema é o mesmo: a leitura mora na ferramenta e no ESTADO, não nas instruções', () => {
  const s = montarSistema(REGRAS, { direcoes: 'manual', metodos: ['pix'] });
  assert.ok(!/ler_caso|radar|Como lemos/.test(s));
  assert.ok(s.length < 27000, 'segue abaixo das 27.000 que o teste do Zero prende (' + s.length + ')');
});

/* ---------- o proximoPasso: o prefixo ---------- */
const BASE = { etapa: 'estimativa', briefing: clone(BRIEFING), estimativa: ESTIMATIVA, regras: REGRAS, metodos: ['pix'] };
test('proximoPasso: com leitura e preço aberto o texto começa por PREFIXO_LEITURA e termina com o de hoje (comparação exata); com a planta também, depois do prefixo dela', () => {
  const hoje = proximoPasso({ ...BASE });
  assert.equal(proximoPasso({ ...BASE, leitura: true }), PREFIXO_LEITURA + hoje);
  assert.equal(proximoPasso({ ...BASE, planta: true, leitura: true }), PREFIXO_PLANTA + PREFIXO_LEITURA + hoje);
  assert.equal(proximoPasso({ ...BASE, planta: true }), PREFIXO_PLANTA + hoje, 'o do 2a não muda');
  /* a leitura vale desde o 1º turno: não espera estimativa nem plano */
  assert.equal(proximoPasso({ ...BASE, estimativa: null, leitura: true }), PREFIXO_LEITURA + proximoPasso({ ...BASE, estimativa: null }));
  assert.equal(proximoPasso({ ...BASE, etapa: 'descoberta', briefing: {}, estimativa: null, leitura: true }), PREFIXO_LEITURA + proximoPasso({ ...BASE, etapa: 'descoberta', briefing: {}, estimativa: null }));
  assert.match(PREFIXO_LEITURA, /ler_caso/);
  assert.match(PREFIXO_LEITURA, /informação nova/);
  assert.match(PREFIXO_LEITURA, /atualizar_briefing/);
  assert.ok(PREFIXO_LEITURA.endsWith('Depois: '));
  assert.ok(PREFIXO_LEITURA.length < 400);
});

test('proximoPasso: sem a flag, com pedido confirmado ou nas etapas fechadas é IDÊNTICO ao de hoje', () => {
  const sem = o => proximoPasso({ ...BASE, ...o });
  assert.equal(sem({ leitura: false }), sem({}));
  assert.equal(sem({ leitura: true, pedidoStatus: 'confirmado' }), sem({ pedidoStatus: 'confirmado' }));
  for (const etapa of ['escopo', 'aguardando_pagamento', 'gerando', 'direcoes', 'escolhida', 'alteracoes']) assert.equal(sem({ leitura: true, etapa }), sem({ etapa }), etapa);
  assert.equal(pedeLeitura({ leitura: true, etapa: 'estimativa' }), true);
  assert.equal(pedeLeitura({ leitura: false, etapa: 'estimativa' }), false);
  assert.equal(pedeLeitura({ leitura: true, etapa: 'escopo' }), false);
  assert.equal(pedeLeitura({ leitura: true, etapa: 'contato', pedidoStatus: 'confirmado' }), false);
});

/* ---------- o que o modelo lê ---------- */
const LEITURA = leitura({ volume: { nivel: 'deixou_claro', evidencia: 'tem semana de agenda cheia' }, repeticao: { nivel: 'comentou', evidencia: 'toda hora perguntam o horário' } });
test('contexto do modelo: com a flag, a leitura de agora vai no bloco BRIEFING (dado) como leitura_atual e NUNCA no ESTADO; sem a flag, a serialização é a de hoje', () => {
  const b = { ...BRIEFING, leitura: LEITURA, planta_pedidos: 1 };
  const com = estadoParaModelo({ briefing: b, estimativa: ESTIMATIVA, etapa: 'estimativa', regras: REGRAS, metodos: ['pix'], leitura: true });
  const [estado, briefing] = com.split('BRIEFING DO VISITANTE');
  assert.ok(!estado.includes('leitura_atual') && !estado.includes('agenda cheia'), 'o ESTADO é do código e não leva a fala da pessoa');
  const dados = JSON.parse(briefing.split('\n')[1]);
  assert.deepEqual(dados.leitura_atual, LEITURA);
  assert.equal(dados.leitura, undefined, 'a chave crua não vai');
  assert.equal(dados.planta_pedidos, undefined);
  assert.ok(!/planta_pedidos/.test(com));
  /* sem a flag: byte a byte o briefing sem as chaves */
  const sem = estadoParaModelo({ briefing: b, estimativa: ESTIMATIVA, etapa: 'estimativa', regras: REGRAS, metodos: ['pix'] });
  const hoje = estadoParaModelo({ briefing: BRIEFING, estimativa: ESTIMATIVA, etapa: 'estimativa', regras: REGRAS, metodos: ['pix'] });
  assert.equal(sem, hoje);
  /* leitura inválida guardada: nada vai ao modelo */
  const ruim = estadoParaModelo({ briefing: { ...BRIEFING, leitura: { eixos: [] } }, estimativa: ESTIMATIVA, etapa: 'estimativa', regras: REGRAS, metodos: ['pix'], leitura: true });
  assert.ok(!ruim.includes('leitura_atual'));
  assert.equal(ruim.split('BRIEFING DO VISITANTE')[1], hoje.split('BRIEFING DO VISITANTE')[1]);
});

/* ---------- o turno do agente ---------- */
const DUAS = (extra = []) => [chamada('atualizar_briefing', { objetivo_detalhe: 'vender' }), ...extra];

test('ler_caso na mesma volta do atualizar_briefing: evidência literal numa fala do visitante (agora ou antes) é gravada; o modelo recebe ok/no_painel; o ESTADO do turno traz o prefixo', async () => {
  const entrada = leitura({
    volume: { nivel: 'deixou_claro', evidencia: 'tem semana de agenda cheia' },           /* fala antiga do visitante */
    informacao: { nivel: 'comentou', evidencia: 'a recepção anota num caderno' }         /* fala de agora */
  });
  const ia = roteiro(resp(DUAS([chamada('ler_caso', entrada)])), resp([], 'Entendi.'));
  const r = await turno(ia);
  assert.deepEqual(r.briefing.leitura, entrada);
  assert.deepEqual(voltas(ia, 1)[1], { ok: true, no_painel: true });
  assert.ok(ia.recebidos[0].ferramentas.some(f => f.name === 'ler_caso'));
  assert.ok(ia.recebidos[0].contexto.split('BRIEFING DO VISITANTE')[0].includes('chame ler_caso'));
  assert.equal(r.briefing.objetivo_detalhe, 'vender', 'o atualizar_briefing da mesma volta valeu');
  assert.equal(r.briefing.negocio.nome, 'Clínica Aurora');
});

test('âncora: a fala do ZERO não ancora (o modelo só pode citar a pessoa); evidência forjada ou parafraseada é descartada e o nível cai', async () => {
  const entrada = leitura({
    pessoas: { nivel: 'deixou_claro', evidencia: 'Só a recepcionista atende' },       /* está só na fala do agente */
    urgencia: { nivel: 'comentou', evidencia: 'preciso disso muito rápido' },         /* ninguém disse */
    volume: { nivel: 'comentou', evidencia: 'agenda cheia toda semana' }             /* paráfrase */
  });
  const ia = roteiro(resp(DUAS([chamada('ler_caso', entrada)])), resp([], 'Entendi.'));
  const { briefing } = await turno(ia);
  assert.equal(nivelDe(briefing.leitura, 'pessoas'), 'comentou');
  assert.equal(evidDe(briefing.leitura, 'pessoas'), undefined);
  assert.equal(nivelDe(briefing.leitura, 'urgencia'), 'nao_falou');
  assert.equal(nivelDe(briefing.leitura, 'volume'), 'nao_falou');
});

test('a fala de agora é redigida como o modelo a vê (telefone sai), e a evidência ancora na versão redigida', async () => {
  const entrada = leitura({ informacao: { nivel: 'deixou_claro', evidencia: 'tudo anotado num caderno' } });
  const ia = roteiro(resp([chamada('ler_caso', entrada)]), resp([], 'Entendi.'));
  const { briefing } = await turno(ia, { mensagem: 'Meu número é 21 98888-7777 e aqui fica tudo anotado num caderno velho.' });
  assert.equal(nivelDe(briefing.leitura, 'informacao'), 'deixou_claro');
  assert.ok(!JSON.stringify(briefing.leitura).includes('98888'));
});

test('forma errada volta ao modelo UMA vez com erros legíveis; a correção é aceita', async () => {
  const quatro = { eixos: leitura().eixos.slice(0, 4) };
  const certa = leitura({ informacao: { nivel: 'comentou', evidencia: 'a recepção anota num caderno' } });
  const ia = roteiro(resp([chamada('ler_caso', quatro)]), resp([chamada('ler_caso', certa)]), resp([], 'Entendi.'));
  const r = await turno(ia);
  const primeira = voltas(ia, 1)[0];
  assert.equal(primeira.ok, false);
  assert.ok(Array.isArray(primeira.erros) && primeira.erros.length > 0);
  assert.deepEqual(voltas(ia, 2)[0], { ok: true, no_painel: true });
  assert.deepEqual(r.briefing.leitura, certa);
});

test('leitura inválida duas vezes: o que já estava na tela fica, e o turno segue sem erro para a pessoa', async () => {
  const quatro = { eixos: leitura().eixos.slice(0, 4) };
  const antes = leitura({ volume: { nivel: 'comentou', evidencia: 'tem semana de agenda cheia' } });
  const ia = roteiro(resp([chamada('ler_caso', quatro)]), resp([chamada('ler_caso', quatro)]), resp([chamada('ler_caso', leitura())]), resp([], 'Segue.'));
  const r = await turno(ia, { conversa: { briefing: { ...clone(BRIEFING), leitura: antes } } });
  assert.deepEqual(r.briefing.leitura, antes);
  assert.equal(voltas(ia, 2)[0].mantida, true);
  assert.equal(voltas(ia, 3)[0].ok, false, 'uma 3ª tentativa no mesmo turno é recusada');
  assert.equal(r.resposta, 'Segue.');
});

test('uma leitura aceita por turno: a segunda (na mesma volta ou na seguinte) é recusada e a primeira fica', async () => {
  const a = leitura({ volume: { nivel: 'comentou', evidencia: 'tem semana de agenda cheia' } });
  const b = leitura({ volume: { nivel: 'deixou_claro', evidencia: 'tem semana de agenda cheia' } });
  const ia = roteiro(resp([chamada('ler_caso', a), chamada('ler_caso', b)]), resp([], 'Ok.'));
  const r = await turno(ia);
  assert.deepEqual(voltas(ia, 1).map(x => x.ok), [true, false]);
  assert.deepEqual(r.briefing.leitura, a);
});

test('atualizar_briefing depois da leitura no mesmo turno não a apaga, e o modelo não grava a leitura pelo atualizar_briefing', async () => {
  const l = leitura({ volume: { nivel: 'comentou', evidencia: 'tem semana de agenda cheia' } });
  const ia = roteiro(resp([chamada('ler_caso', l), chamada('atualizar_briefing', { objetivo_detalhe: 'vender', leitura: leitura({ urgencia: { nivel: 'deixou_claro', evidencia: 'x' } }) })]), resp([], 'Ok.'));
  const r = await turno(ia);
  assert.deepEqual(r.briefing.leitura, l);
});

test('conversa de saúde (nicho regulado): a leitura sobrevive ao filtro do briefing, e depoimento na evidência é descartado', async () => {
  const msgs = [{ papel: 'visitante', conteudo: 'Tenho uma clínica de odontologia e quero depoimentos de pacientes no site.' }, { papel: 'agente', conteudo: 'Certo.' }];
  const l = leitura({ volume: { nivel: 'comentou', evidencia: 'uma clínica de odontologia' }, informacao: { nivel: 'deixou_claro', evidencia: 'quero depoimentos de pacientes' } });
  const ia = roteiro(resp([chamada('ler_caso', l)]), resp([], 'Entendi.'));
  const r = await turno(ia, { conversa: { mensagens: msgs, briefing: { negocio: { segmento: 'clínica odontológica' }, objetivos: ['agendamentos'] } }, mensagem: 'Pode ser.' });
  assert.ok(r.briefing.leitura, 'a chave leitura sobreviveu a briefingSemProibidos');
  assert.equal(nivelDe(r.briefing.leitura, 'volume'), 'comentou');
  assert.equal(nivelDe(r.briefing.leitura, 'informacao'), 'comentou');
  assert.equal(evidDe(r.briefing.leitura, 'informacao'), undefined);
});

test('com a flag desligada: a ferramenta não existe (o modelo que a invente é recusado, nada é gravado) e o ESTADO não pede a leitura', async () => {
  const ia = roteiro(resp([chamada('ler_caso', leitura())]), resp([], 'Ok.'));
  const r = await turno(ia, {}, {});
  assert.deepEqual(ia.recebidos[0].ferramentas.map(f => f.name), NOMES5);
  assert.equal(voltas(ia, 1)[0].ok, false);
  assert.equal(voltas(ia, 1)[0].motivo, 'ferramenta inexistente');
  assert.equal(r.briefing.leitura, undefined);
  assert.ok(!ia.recebidos[0].contexto.includes('ler_caso'));
});

test('executarTurno: planta:true sozinha liga as duas (a leitura segue a mesma flag do fluxo); leitura:false a desliga mesmo com a planta', async () => {
  const ia = roteiro(resp([], 'Ok.'));
  await executarTurno({ ia, regras: REGRAS, conversa: conversaDe(), mensagem: 'oi', planta: true });
  assert.deepEqual(ia.recebidos[0].ferramentas.map(f => f.name), [...NOMES5, 'desenhar_planta', 'ler_caso']);
  const ia2 = roteiro(resp([], 'Ok.'));
  await executarTurno({ ia: ia2, regras: REGRAS, conversa: conversaDe(), mensagem: 'oi', planta: true, leitura: false });
  assert.deepEqual(ia2.recebidos[0].ferramentas.map(f => f.name), [...NOMES5, 'desenhar_planta']);
});

test('escopo: sem ferramenta nenhuma; pedido confirmado: a recusa tem o motivo próprio do pacote fechado', async () => {
  const ia = roteiro(resp([chamada('ler_caso', leitura())]), resp([], 'Ok.'));
  const r = await turno(ia, { conversa: { etapa: 'escopo' } });
  assert.deepEqual(ia.recebidos[0].ferramentas, []);
  assert.equal(r.briefing.leitura, undefined);
  /* o código também recusa se alguém mexer na lista: a defesa não depende dela */
  const ia2 = roteiro(resp([chamada('ler_caso', leitura())]), resp([], 'Ok.'));
  const r2 = await turno(ia2, { conversa: { etapa: 'contato', pedido_status: 'confirmado' } });
  assert.equal(voltas(ia2, 1)[0].ok, false);
  assert.equal(r2.briefing.leitura, undefined);
});

test('a leitura gravada volta ao modelo no turno seguinte (leitura_atual) para ele reenviar os cinco eixos', async () => {
  const guardada = leitura({ volume: { nivel: 'comentou', evidencia: 'tem semana de agenda cheia' } });
  const ia = roteiro(resp([], 'Ok.'));
  await turno(ia, { conversa: { briefing: { ...clone(BRIEFING), leitura: guardada } } });
  const dados = JSON.parse(ia.recebidos[0].contexto.split('BRIEFING DO VISITANTE')[1].split('\n')[1]);
  assert.deepEqual(dados.leitura_atual, guardada);
  assert.equal(dados.leitura, undefined);
});

/* ---------- o simulado ---------- */
const simular = async (textos, ferr = ['ler_caso'], etapa = 'descoberta') => {
  const sim = criarSimulada();
  const mensagens = textos.map(t => ({ papel: 'visitante', conteudo: t }));
  return executarTurno({ ia: sim, regras: REGRAS, conversa: { etapa, briefing: {}, mensagens: mensagens.slice(0, -1).flatMap(m => [m, { papel: 'agente', conteudo: 'Certo.' }]), estimativa: null }, mensagem: textos.at(-1), planta: ferr.length > 0 });
};
test('simulado: sem o gatilho "leitura-sim" ele nunca chama ler_caso (nenhum roteiro do E2E muda); com ele, lê as palavras da própria pessoa', async () => {
  const sem = await simular(['Tenho uma clínica de odontologia, tem muita procura e toda hora perguntam o horário.']);
  assert.equal(sem.briefing.leitura, undefined);
  const com = await simular(['Tenho uma clínica de odontologia, tem muita procura e toda hora perguntam o horário. leitura-sim']);
  assert.equal(nivelDe(com.briefing.leitura, 'volume'), 'deixou_claro');
  assert.equal(evidDe(com.briefing.leitura, 'volume'), 'muita procura');
  assert.equal(nivelDe(com.briefing.leitura, 'repeticao'), 'deixou_claro');
  assert.equal(nivelDe(com.briefing.leitura, 'pessoas'), 'nao_falou');
});

test('simulado: o radar muda do 1º ao 3º turno (o gatilho vale na conversa inteira)', async () => {
  const t1 = 'Tenho uma clínica de odontologia e tem muita procura. leitura-sim';
  const t2 = 'Toda hora perguntam o horário e só a recepcionista atende.';
  const t3 = 'Preciso disso antes da feira. Hoje fica tudo na minha cabeça.';
  const a = await simular([t1]), b = await simular([t1, t2]), c = await simular([t1, t2, t3]);
  const niveis = r => EIXOS.map(e => nivelDe(r.briefing.leitura, e)).join(',');
  assert.equal(niveis(a), 'deixou_claro,nao_falou,nao_falou,nao_falou,nao_falou');
  assert.equal(niveis(b), 'deixou_claro,deixou_claro,nao_falou,deixou_claro,nao_falou');
  assert.equal(niveis(c), 'deixou_claro,deixou_claro,deixou_claro,deixou_claro,deixou_claro');
});

test('simulado: leitura-forjada cai de nível; leitura-ruim erra uma vez e acerta; leitura-ruim2 erra sempre e nada muda', async () => {
  const forjada = await simular(['Tenho uma clínica de odontologia. leitura-forjada']);
  assert.equal(nivelDe(forjada.briefing.leitura, 'volume'), 'comentou');
  assert.equal(evidDe(forjada.briefing.leitura, 'volume'), undefined);
  const ruim = await simular(['Tenho uma clínica de odontologia e tem muita procura. leitura-ruim']);
  assert.equal(nivelDe(ruim.briefing.leitura, 'volume'), 'deixou_claro');
  const ruim2 = await simular(['Tenho uma clínica de odontologia e tem muita procura. leitura-ruim2']);
  assert.equal(ruim2.briefing.leitura, undefined);
});

/* ---------- o custo (medido, não chutado) ---------- */
test('custo: o turno com a leitura (a 1ª rodada fala 350 tokens a mais) cabe na reserva de conversa de hoje; uma conversa longa com planta E leitura segue abaixo do teto', () => {
  const sistema = montarSistema(REGRAS, { direcoes: 'manual', metodos: ['pix'] });
  const f = ferramentas(REGRAS, { planta: true, leitura: true });
  const ler = f.find(x => x.name === 'ler_caso'), planta = f.find(x => x.name === 'desenhar_planta');
  const cacheHoje = Math.ceil(sistema.length / 3);
  const cache = Math.ceil((sistema.length + planta.description.length + JSON.stringify(planta.input_schema).length + ler.description.length + JSON.stringify(ler.input_schema).length) / 3);
  const rodada = (c, saida) => custoUsd('claude-sonnet-5-5', { cache_leitura: c, entrada: 3500, saida });
  const turnoComLeitura = rodada(cache, 900 + 350) + rodada(cache, 900);
  assert.ok(turnoComLeitura <= RESERVA_USD.conversa, 'turno com leitura: US$ ' + turnoComLeitura.toFixed(4) + ' contra a reserva de ' + RESERVA_USD.conversa);
  const normal = c => 2 * rodada(c, 900);
  const hoje = 30 * normal(cacheHoje);
  /* 26 turnos comuns e 4 de desenho; todos com a leitura (o pior: o modelo lê em todo turno) */
  const turnoDaPlanta = rodada(cache, 300 + 350) + rodada(cache, 1300) + rodada(cache, 300) + rodada(cache, 300);
  const comTudo = 26 * turnoComLeitura + 4 * turnoDaPlanta;
  console.log('# custo: hoje US$ ' + hoje.toFixed(2) + ' | planta + leitura em todo turno US$ ' + comTudo.toFixed(2) + ' (' + (comTudo / hoje).toFixed(2) + 'x) | turno com leitura US$ ' + turnoComLeitura.toFixed(4) + ' | descrição ' + ler.description.length + ' car.');
  assert.ok(comTudo < TETOS.conversa_usd * 0.75, 'conversa longa com planta e leitura: US$ ' + comTudo.toFixed(2));
  assert.ok(comTudo < hoje * 1.4, 'o radar + planta encarecem mais de 40%: ' + (comTudo / hoje).toFixed(2));
  assert.ok(PAPEIS.conversa.max_tokens >= 4000);
});

/* ---------- o que o servidor registra para medir (a rodada real 8 mede por aqui: só códigos, nunca texto de ninguém) ---------- */
test('executarTurno devolve leitura_rebaixos (eixo, de, para, motivo) do que o validador desceu; sem leitura, lista vazia', async () => {
  const entrada = leitura({
    volume: { nivel: 'deixou_claro', evidencia: 'recebo pedidos o dia inteiro' },     /* ninguém disse */
    informacao: { nivel: 'comentou', evidencia: 'a recepção anota num caderno' }      /* ancorada */
  });
  const ia = roteiro(resp([chamada('ler_caso', entrada)]), resp([], 'Entendi.'));
  const r = await turno(ia);
  assert.deepEqual(r.leitura_rebaixos, [{ eixo: 'volume', de: 'deixou_claro', para: 'comentou', motivo: 'sem_ancora' }]);
  const sem = await turno(roteiro(resp([], 'Ok.')));
  assert.deepEqual(sem.leitura_rebaixos, []);
  assert.ok(!JSON.stringify(r.leitura_rebaixos).includes('dia inteiro'), 'sem o texto do modelo');
});
