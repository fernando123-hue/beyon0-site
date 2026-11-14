/* A RODADA DE CORREÇÃO DO PR 2a (duas revisões independentes): os testes que faltavam (cada um mata uma mutação que sobreviveu), o custo de CPU do estado, a posição da
   fala do Zero na janela de 60 mensagens, os cortes de cabe(), a evidência normalizada. node --test docs/testes/planta-revisao.test.mjs */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PREFIXO_PLANTA, ferramentas } from '../../api/_vendas/consultor.mjs';
import { executarTurno, estadoParaModelo } from '../../api/_vendas/agente.mjs';
import { planoDoCaso } from '../../api/_vendas/mapa-padrao.mjs';
import { validarPlano } from '../../api/_vendas/planta-esquema.mjs';
import { montarPlanta, leituraParaTela, posicaoDaFala, posicaoNaJanela, limparCacheDaPlanta } from '../../api/_vendas/planta.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { LIMITES_DE_TESTE } from './_pedido.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const fx = n => clone(JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8')));
const BRIEFING = { negocio: { nome: 'Clínica Aurora', segmento: 'clínica odontológica' }, objetivos: ['agendamentos'], projeto: { formato: 'institucional' }, situacao_atual: { como_chegam: 'indicação' } };
const ESTIMATIVA = { id: 'e1', prazo_dias: 8, fase: 1, fatores: { formato: 'institucional' }, detalhes: { itens: [{ nome: 'Site institucional', qtd: 1 }] } };
const MENSAGENS = [{ papel: 'visitante', conteudo: 'Tenho uma clínica' }, { papel: 'agente', conteudo: 'Certo, qual o objetivo?' }];
const chamada = (nome, entrada) => ({ id: 'c_' + nome + '_' + Math.random().toString(36).slice(2, 7), nome, entrada });
const resp = (chamadas = [], texto = '') => ({ texto, chamadas, conteudo: chamadas.map(c => ({ type: 'tool_use', id: c.id, name: c.nome, input: c.entrada })), parada: chamadas.length ? 'ferramenta' : 'fim', custo_usd: 0 });
function roteiro(...respostas) {
  const recebidos = []; let i = 0;
  return { recebidos, mensagem: async p => { recebidos.push(clone(p)); return respostas[Math.min(i++, respostas.length - 1)]; } };
}
const volta = (ia, n) => JSON.parse(ia.recebidos[n].mensagens.at(-1).content[0].content);
const conversaDe = (extra = {}) => ({ etapa: 'estimativa', briefing: clone(BRIEFING), mensagens: clone(MENSAGENS), estimativa: ESTIMATIVA, ...extra });
const turno = (ia, extra = {}) => executarTurno({ ia, regras: REGRAS, conversa: conversaDe(extra.conversa), mensagem: 'ok', planta: true });
/* (PR 4) o modelo escreve o mapa v3 */
const bom = () => { const p = planoDoCaso('generico', {}); p.nos[0].titulo = 'Página feita para você'; return p; };
const ruimDigito = () => { const p = bom(); p.nos[0].titulo = 'Passo 1 da página'; return p; };
const ruimPrazo = () => { const p = bom(); p.nos[0].titulo = 'Pronto em minutos'; return p; };

/* ---------- C4: as mutações que sobreviveram ---------- */
test('C4: no turno em que o modelo ESTIMA, o proximo_passo que volta depois do atualizar_briefing não pede a planta (a estimativa de agora não vale)', async () => {
  const ia = roteiro(resp([chamada('estimar', { formato: 'institucional' })]), resp([chamada('atualizar_briefing', { objetivo_detalhe: 'agendar' })]), resp([], 'Certo.'));
  const r = await executarTurno({ ia, regras: REGRAS, conversa: conversaDe({ etapa: 'descoberta', estimativa: null }), mensagem: 'oi', planta: true });
  assert.ok(r.estimativa, 'o modelo estimou neste turno');
  assert.ok(volta(ia, 1).prazo_dias, 'a 1ª volta é a do estimar');
  assert.ok(!volta(ia, 2).proximo_passo.includes('desenhar_planta'), 'a 2ª volta (atualizar_briefing) não traz o prefixo');
  assert.ok(!ia.recebidos[0].contexto.includes('desenhar_planta'));
});

test('C4: estadoParaModelo repassa o pedidoStatus: com o pedido confirmado o prefixo não aparece; sem confirmar, aparece', () => {
  const base = { briefing: BRIEFING, estimativa: ESTIMATIVA, etapa: 'contato', regras: REGRAS, metodos: ['pix'], planta: true };
  assert.ok(estadoParaModelo({ ...base, pedidoStatus: 'aguardando' }).includes(PREFIXO_PLANTA.slice(0, 40)));
  assert.ok(estadoParaModelo({ ...base }).includes(PREFIXO_PLANTA.slice(0, 40)));
  assert.ok(!estadoParaModelo({ ...base, pedidoStatus: 'confirmado' }).includes('desenhar_planta'));
});

test('C4: estourar as 4 voltas sem NENHUMA falha de plano não grava o padrão (só conta o pedido); com uma planta já na tela, a falha pendente também não troca o desenho', async () => {
  const quatroVoltas = () => roteiro(resp([chamada('atualizar_briefing', { objetivo_detalhe: 'a' })]), resp([chamada('atualizar_briefing', { objetivo_detalhe: 'b' })]), resp([chamada('atualizar_briefing', { objetivo_detalhe: 'c' })]), resp([chamada('atualizar_briefing', { objetivo_detalhe: 'd' })]), resp([], 'nunca'));
  const ia = quatroVoltas();
  const r = await turno(ia);
  assert.equal(ia.recebidos.length, 4);
  assert.equal(r.briefing.planta, undefined, 'sem falha de plano não há padrão de "estouro"');
  assert.equal(r.briefing.planta_pedidos, 1);
  const gravado = { v: 1, versao: 1, origem: 'modelo', motivos: [], tentativas: 1, n_mensagens: 1, plano: fx('loja') };
  const ia2 = roteiro(resp([chamada('desenhar_planta', ruimDigito())]), resp([chamada('atualizar_briefing', { objetivo_detalhe: 'a' })]), resp([chamada('atualizar_briefing', { objetivo_detalhe: 'b' })]), resp([chamada('atualizar_briefing', { objetivo_detalhe: 'c' })]), resp([], 'nunca'));
  const r2 = await turno(ia2, { conversa: { briefing: { ...BRIEFING, planta: gravado } } });
  assert.deepEqual(r2.briefing.planta, gravado, 'o desenho que estava na tela fica');
});

test('C4: duas falhas com códigos diferentes: motivos é a união, na ordem em que apareceram', async () => {
  const ia = roteiro(resp([chamada('desenhar_planta', ruimDigito())]), resp([chamada('desenhar_planta', ruimPrazo())]), resp([], 'Exemplo.'));
  const r = await turno(ia);
  assert.equal(r.briefing.planta.origem, 'padrao');
  assert.deepEqual(r.briefing.planta.motivos, ['digito', 'prazo']);
  assert.equal(r.briefing.planta.tentativas, 2);
});

test('C4: o ajuste que dá certo na 2ª tentativa guarda o motivo da 1ª; a versão sobe sobre a que já existia', async () => {
  const gravado = { v: 1, versao: 2, origem: 'modelo', motivos: [], tentativas: 1, n_mensagens: 1, plano: fx('loja') };
  const ia = roteiro(resp([chamada('desenhar_planta', ruimPrazo())]), resp([chamada('desenhar_planta', bom())]), resp([], 'Refiz.'));
  const r = await turno(ia, { conversa: { briefing: { ...BRIEFING, planta: gravado } } });
  assert.equal(r.briefing.planta.versao, 3);
  assert.deepEqual(r.briefing.planta.motivos, ['prazo']);
});

test('C4: o simulado só chama desenhar_planta se ela está na lista de ferramentas (chamada direta ao dublê)', async () => {
  const sim = criarSimulada();
  const pedido = ferramentas => ({ papel: 'conversa', sistema: '', contexto: 'ESTADO\n{}\n\nBRIEFING DO VISITANTE\n{}', mensagens: [{ role: 'user', content: 'planta-boa' }], ferramentas });
  const com = await sim.mensagem(pedido(ferramentas(REGRAS, { etapa: 'estimativa', planta: true })));
  assert.deepEqual(com.chamadas.map(c => c.nome), ['desenhar_planta']);
  const sem = await sim.mensagem(pedido(ferramentas(REGRAS, { etapa: 'estimativa' })));
  assert.ok(!sem.chamadas.some(c => c.nome === 'desenhar_planta'), 'sem a ferramenta na lista o dublê não a chama');
});

/* ---------- S9 e os cortes de cabe() ---------- */
test('cabe(): os cortes de nós, fundura, protótipo e caracteres, cada um com o seu motivo; arrays e objetos enormes não são nem listados', () => {
  const motivo = v => validarPlano(v, {}).motivos[0];
  assert.equal(motivo({ a: Array.from({ length: 130 }, () => 1) }), 'grande', '130 nós rasos');
  assert.equal(motivo({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }), 'grande', '7 níveis');
  assert.equal(motivo(new Date()), 'nao_objeto', 'protótipo de fora');
  assert.equal(motivo(new Map()), 'nao_objeto');
  assert.equal(motivo({ a: 'x'.repeat(3000), b: 'x'.repeat(3000), c: 'x'.repeat(3000) }), 'grande', 'soma de caracteres acima de 8 KB, cada texto abaixo');
  assert.equal(motivo({ ['k'.repeat(9000)]: 1 }), 'grande', 'o nome da chave também conta');
  /* o corte vem ANTES de empilhar os filhos e ANTES da forma: um espião conta o que foi lido (sem relógio, que oscila com a máquina) */
  const espiao = alvo => { const c = { ownKeys: 0, descritores: 0, get: 0 }; const proxy = new Proxy(alvo, { ownKeys(t) { c.ownKeys++; return Reflect.ownKeys(t); }, getOwnPropertyDescriptor(t, k) { c.descritores++; return Reflect.getOwnPropertyDescriptor(t, k); }, get(t, k, r) { c.get++; return Reflect.get(t, k, r); } }); return { proxy, c }; };
  const grande = espiao(new Array(3000000).fill(1));
  assert.equal(motivo(grande.proxy), 'grande');
  assert.equal(grande.c.ownKeys, 0, 'array enorme: as chaves nem foram listadas');
  assert.equal(grande.c.descritores, 0);
  assert.ok(grande.c.get <= 1, 'só o length foi lido');
  const largo = espiao(Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['k' + i, 1])));
  assert.equal(motivo(largo.proxy), 'grande');
  assert.equal(largo.c.descritores, 0, 'objeto largo: nenhum descritor lido');
  const texto = espiao({ a: 'x'.repeat(3000), b: 'x'.repeat(3000), c: 'x'.repeat(3000) });
  assert.equal(motivo(texto.proxy), 'grande');
  assert.equal(texto.c.get, 0, 'a forma (que faz JSON.stringify do bruto e lê toJSON) nem foi chamada');
});

/* ---------- S8: evidência normalizada ---------- */
test('S8: a leitura devolve a evidência NORMALIZADA (espaço sem quebra e repetido viram um espaço); a fala em 1ª pessoa da pessoa passa', () => {
  const nbsp = String.fromCharCode(0xa0);
  const eixos = [{ eixo: 'volume', nivel: 'comentou', evidencia: '  tem' + nbsp + 'muita   procura ' }, { eixo: 'repeticao', nivel: 'nao_falou' }, { eixo: 'urgencia', nivel: 'nao_falou' },
    { eixo: 'pessoas', nivel: 'deixou_claro', evidencia: 'só eu atendo e eu respondo' }, { eixo: 'informacao', nivel: 'nao_falou' }];
  const l = leituraParaTela({ leitura: { eixos } });
  assert.equal(l.eixos[0].evidencia, 'tem muita procura');
  assert.equal(l.eixos[3].evidencia, 'só eu atendo e eu respondo', 'a regra de negar ser IA olha o texto do Zero, não a fala da pessoa');
  assert.equal(leituraParaTela({ leitura: { eixos: eixos.map(e => e.eixo === 'volume' ? { ...e, evidencia: 'depoimentos de pacientes' } : e) } }, { regulado: true }), null);
  assert.notEqual(leituraParaTela({ leitura: { eixos: eixos.map(e => e.eixo === 'volume' ? { ...e, evidencia: 'depoimentos de pacientes' } : e) } }, { regulado: false }), null);
});

/* ---------- C1: o custo do estado ---------- */
test('C1: o estado revalida só forma + lista dura (as dez travas rodam ao gravar); o resultado fica em cache por (plano, nome, regulado) e a cópia é nova a cada leitura', () => {
  limparCacheDaPlanta();
  const soTrava = fx('clinica');
  soTrava.etapas[0].frase = 'O site traz mais gente para a porta, com a resposta que a pessoa quer ler.';
  assert.equal(validarPlano(soTrava, {}).ok, false, 'ao gravar, a trava pega');
  const b = { ...BRIEFING, planta: { v: 1, versao: 1, origem: 'modelo', motivos: [], tentativas: 1, n_mensagens: 1, plano: soTrava } };
  assert.equal(montarPlanta(b).origem, 'modelo', 'na leitura só a lista dura roda: esta frase só a trava antiga pega');
  const lexical = fx('clinica');
  lexical.etapas[0].frase = 'Cai na página do tratamento, com o preço que a pessoa quer ler primeiro.';
  assert.equal(montarPlanta({ ...b, planta: { ...b.planta, plano: lexical } }).origem, 'padrao', 'a lista dura pega e vira o padrão');
  const a = montarPlanta(b), c = montarPlanta(b);
  assert.deepEqual(a, c);
  a.plano.etapas[0].titulo = 'mexi';
  assert.notEqual(montarPlanta(b).plano.etapas[0].titulo, 'mexi', 'o cache devolve cópia');
  assert.notDeepEqual(montarPlanta(b, { regulado: true }).origem, undefined);
});

test('C1: o estado com a planta já vista custa menos de 1 ms de CPU por leitura (200 leituras do mesmo plano)', () => {
  const b = { ...BRIEFING, planta: { v: 1, versao: 1, origem: 'modelo', motivos: [], tentativas: 1, n_mensagens: 1, plano: fx('embalagens') } };
  montarPlanta(b, { regulado: true });
  const c0 = process.cpuUsage();
  for (let i = 0; i < 200; i++) assert.ok(montarPlanta(b, { regulado: true }));
  const ms = (c => (c.user + c.system) / 1000)(process.cpuUsage(c0));
  assert.ok(ms < 200, '200 leituras gastaram ' + ms.toFixed(0) + ' ms de CPU (meta: menos de 1 ms cada, o plano grátis tem 10 ms)');
});

/* ---------- C2: a posição da fala ---------- */
test('C2: posição da fala do Zero: absoluta na gravação (2 * turnos + 1) e na janela de 60 mensagens na leitura', () => {
  assert.equal(posicaoDaFala({ turnos: 0, mensagens: 0 }), 1);
  assert.equal(posicaoDaFala({ turnos: 3, mensagens: 6 }), 7);
  assert.equal(posicaoDaFala({ turnos: 40, mensagens: 60 }), 81, 'o banco guarda 80 mensagens e a lista que o turno lê tem 60: vale o contador');
  assert.equal(posicaoDaFala({ mensagens: 4 }), 5, 'sem o contador (teste, dado antigo) vale o comprimento + 1');
  assert.equal(posicaoNaJanela(7, { turnos: 3, mensagensNaJanela: 6 }), 7, 'conversa curta: a posição é a mesma');
  assert.equal(posicaoNaJanela(75, { turnos: 40, mensagensNaJanela: 60 }), 55);
  assert.equal(posicaoNaJanela(3, { turnos: 40, mensagensNaJanela: 60 }), 0, 'fala que saiu da janela: o começo');
  assert.equal(posicaoNaJanela(12, { mensagensNaJanela: 6 }), 12, 'sem o contador, como veio');
  assert.equal(posicaoNaJanela(-4, { turnos: 1, mensagensNaJanela: 2 }), 0);
  assert.equal(posicaoNaJanela('x', {}), 0);
});

test('C2: o turno grava a posição absoluta pelo contador de turnos do banco, não pelo tamanho da lista de 60', async () => {
  const sessenta = Array.from({ length: 60 }, (_, i) => ({ papel: i % 2 ? 'agente' : 'visitante', conteudo: 'm' + i }));
  const ia = roteiro(resp([chamada('desenhar_planta', bom())]), resp([], 'Desenhei.'));
  const r = await turno(ia, { conversa: { mensagens: sessenta, turnos: 40 } });
  assert.equal(r.briefing.planta.n_mensagens, 81);
});

/* ---------- C2 e a regulação, pela API de verdade ---------- */
let local, deps;
const BASE = 'http://127.0.0.1:8899';
const LIGADA = { BZ_PLANTA: 'ligada' };
let ipSeq = 200;
before(async () => {
  local = await montarLocal({ base: BASE });
  deps = { banco: local.rpc, visitantes: local.auth, ia: criarSimulada(), direcoes: 'api', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, pagamentos: criarServicoPagamentos({ banco: local.rpc, cfg: configPagamentos({}) }) };
});
async function comPlanta(fala) {
  const ip = '198.51.100.' + (++ipSeq);
  let token;
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), LIGADA, metodo, deps);
    return r.json();
  };
  const s = await chamar('POST', 'sessao', {}); token = s.token;
  await chamar('POST', 'mensagem', { conversa_id: s.conversa_id, texto: fala });
  await chamar('POST', 'mensagem', { conversa_id: s.conversa_id, texto: 'planta-boa' });
  return { c: s.conversa_id, estado: () => chamar('GET', 'estado', undefined, '&conversa=' + s.conversa_id) };
}
const FALA_CLINICA = 'Tenho uma clínica odontológica em Niterói e quero um site mais profissional porque hoje só tenho Instagram. Quero mais agendamentos.';
const FALA_LOJA = 'Tenho uma loja de roupas femininas e quero um site institucional para vender mais';

test('regulado repassado no estado: o mesmo plano com "depoimentos de pacientes" vira o padrão numa conversa de saúde e fica numa loja (planta e leitura)', async () => {
  const frase = 'Lê depoimentos de pacientes e conversa';
  const evidencia = 'depoimentos de pacientes';
  const leitura = { eixos: [{ eixo: 'volume', nivel: 'comentou', evidencia }, { eixo: 'repeticao', nivel: 'nao_falou' }, { eixo: 'urgencia', nivel: 'nao_falou' }, { eixo: 'pessoas', nivel: 'nao_falou' }, { eixo: 'informacao', nivel: 'nao_falou' }] };
  const resultado = {};
  for (const [nome, fala] of [['saude', FALA_CLINICA], ['loja', FALA_LOJA]]) {
    const { c, estado } = await comPlanta(fala);
    const antes = await estado();
    assert.equal(antes.planta.origem, 'modelo', nome);
    await local.db.query(`update app.conversas set briefing = jsonb_set(briefing, '{planta,plano,nos,1,frase}', $2::jsonb) || jsonb_build_object('leitura', $3::jsonb) where id = $1`, [c, JSON.stringify(frase), JSON.stringify(leitura)]);
    const e = await estado();
    resultado[nome] = { origem: e.planta.origem, leitura: !!e.leitura };
  }
  assert.deepEqual(resultado, { saude: { origem: 'padrao', leitura: false }, loja: { origem: 'modelo', leitura: true } });
});

test('C2 pela API: com 40 turnos e a janela de 60 mensagens, a posição que o estado devolve é a da janela', async () => {
  const { c, estado } = await comPlanta(FALA_CLINICA);
  const abs = 75;
  await local.db.query(`insert into app.mensagens (org_id, conversa_id, papel, conteudo) select cv.org_id, cv.id, case when g % 2 = 0 then 'visitante' else 'agente' end, 'x' from app.conversas cv, generate_series(1, 76) g where cv.id = $1`, [c]);
  await local.db.query(`update app.conversas set turnos = 40, briefing = jsonb_set(briefing, '{planta,n_mensagens}', $2::jsonb) where id = $1`, [c, JSON.stringify(abs)]);
  const e = await estado();
  assert.equal(e.mensagens.length, 60);
  assert.equal(e.planta.n_mensagens, 55, '75 - (80 - 60)');
});

/* ---------- C3: a descrição ---------- */
test('C3: a descrição da ferramenta diz o tamanho do fecho e cita os ids reservados (mapa v3)', () => {
  const d = ferramentas(REGRAS, { planta: true }).find(f => f.name === 'desenhar_planta').description;
  assert.match(d, /fecho de 20 a 80/);
  for (const id of ['objetivo', 'hoje', 'constructor', 'prototype', 'proto']) assert.ok(d.includes(id), id);
});
