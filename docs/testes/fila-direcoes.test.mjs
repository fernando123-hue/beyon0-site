/* A FILA MANUAL DAS DIREÇÕES (decisão do dono, 2026-10-08: enquanto não há verba para a API, as três direções são
   produzidas pelo dono no Claude Code, em até 24 horas úteis, e o cliente é avisado pelo WhatsApp com um toque).
   Prova, no banco real (PGlite com as mesmas migrations):
   • modo manual: o servidor NÃO chama o modelo para as direções; elas ficam na fila; o WhatsApp é obrigatório;
   • o painel (com a chave) lista a fila com o briefing e o contato, entrega cada direção pelo MESMO filtro da
     geração automática (higienizar) e marca "avisado"; sem a chave, nada.  npm run testar */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { atender } from '../../api/vendas.mjs';
import { ler, mudar } from '../../api/painel.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';

const BASE = 'http://127.0.0.1:8899';
const CHAVE = 'k'.repeat(40);
const ENV = { BZ_LOCAL: '1', PAINEL_CHAVE: CHAVE };
let local, ia, chamadasGeracao = 0, ipSeq = 0;

before(async () => {
  local = await montarLocal({ base: BASE });
  const base = criarSimulada();
  ia = { ...base, mensagem: async p => { if (p.papel === 'geracao') chamadasGeracao++; return base.mensagem(p); } };
});

function navegador(direcoes) {
  const ip = '203.0.113.' + (++ipSeq);
  let token = null;
  const deps = { banco: local.rpc, visitantes: local.auth, ia, direcoes };
  const chamar = async (metodo, acao, corpo, query = '') => {
    const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, {
      method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }
    }), {}, metodo, deps);
    return { status: r.status, corpo: await r.json() };
  };
  return { chamar, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
}

const comChave = (opcoes = {}) => ({ ...opcoes, headers: { authorization: 'Bearer ' + CHAVE, 'x-forwarded-for': '192.0.2.9', ...(opcoes.headers || {}) } });
const painelGet = async (q, opcoes) => { const r = await ler(new Request(BASE + '/api/painel' + q, opcoes || comChave()), ENV); return { status: r.status, corpo: await r.json() }; };
const painelPost = async corpo => { const r = await mudar(new Request(BASE + '/api/painel', comChave({ method: 'POST', body: JSON.stringify(corpo) })), ENV); return { status: r.status, corpo: await r.json() }; };

/* uma direção como o Claude Code do dono produz (o mesmo formato da geração automática, ESQUEMA_DIRECAO) */
const direcao = (nome = 'Clareza que agenda') => ({
  nome_conceito: nome, resumo: 'Direção focada em levar o paciente a agendar.',
  identidade: { paleta: { fundo: '#FFFFFF', superficie: '#F4F6F8', texto: '#111111', texto_suave: '#4A4F55', destaque: '#0B6E6E', destaque_texto: '#FFFFFF' },
    tipografia: { titulos: 'sans_geometrica', texto: 'sans_humanista' }, estilo: { cantos: 'suaves', densidade: 'equilibrada', tema: 'claro' } },
  navegacao: { marca: 'Clínica Exemplo', itens: ['Tratamentos', 'Equipe', 'Contato'], cta: 'Agendar' },
  secoes: [
    { tipo: 'hero', variante: 'split', rotulo: 'Niterói', titulo: 'Fisioterapia que cabe na sua rotina', subtitulo: 'Agende online em minutos.', texto: '', itens: [], cta: 'Agendar avaliação' },
    { tipo: 'servicos', variante: 'cartoes', rotulo: '', titulo: 'Tratamentos', subtitulo: '', texto: '', itens: [{ titulo: 'Coluna', texto: 'Alívio da dor nas costas.' }], cta: '' },
    { tipo: 'depoimentos', variante: 'faixa', rotulo: '', titulo: 'Pacientes', subtitulo: '', texto: '', itens: [{ titulo: '[Nome do paciente]', texto: '[Depoimento real]' }], cta: '' },
    { tipo: 'contato', variante: 'centro', rotulo: '', titulo: 'Fale com a clínica', subtitulo: '', texto: 'Estamos no centro de Niterói.', itens: [], cta: 'Agendar' }
  ],
  rodape: { texto: 'Clínica Exemplo · Niterói' }
});

/* até as direções pedidas: conversa → estimativa → contato → gerar */
async function ateAFila(direcoes = 'manual', contato = { nome: 'Ana Souza', telefone: '(21) 99999-0000', aceite: true }) {
  const n = navegador(direcoes);
  const c = await n.iniciar();
  const m = await n.chamar('POST', 'mensagem', { conversa_id: c, texto: 'Tenho uma clínica de fisioterapia em Niterói e quero um site institucional para os pacientes agendarem online.' });
  assert.equal(m.status, 200, JSON.stringify(m.corpo));
  assert.ok(m.corpo.estimativa, 'estimativa na 1ª mensagem (simulador)');
  const ct = await n.chamar('POST', 'contato', { conversa_id: c, ...contato });
  return { n, c, contato: ct };
}

test('modo manual: o WhatsApp é obrigatório no contato (é por ele que o cliente é avisado)', async () => {
  const { contato } = await ateAFila('manual', { nome: 'Ana', email: 'ana@exemplo.com', aceite: true });
  assert.equal(contato.status, 400);
  assert.match(contato.corpo.erro, /WhatsApp/);
  const api = await ateAFila('api', { nome: 'Ana', email: 'ana@exemplo.com', aceite: true });
  assert.equal(api.contato.status, 200, 'no modo da API, só o e-mail segue valendo');
});

test('modo manual: as direções ficam na fila e o servidor não chama o modelo', async () => {
  const { n, c, contato } = await ateAFila();
  assert.equal(contato.status, 200, JSON.stringify(contato.corpo));
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  assert.equal(g.status, 200, JSON.stringify(g.corpo));
  const antes = chamadasGeracao;
  const e = await n.chamar('GET', 'estado', undefined, '&conversa=' + c);
  assert.equal(e.corpo.modo_direcoes, 'manual', 'a tela sabe o modo (texto de 24 horas úteis)');
  assert.equal(e.corpo.direcoes.length, 3);
  for (const d of e.corpo.direcoes) {
    const r = await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.status, 'na_fila');
  }
  assert.equal(chamadasGeracao, antes, 'nenhuma chamada ao modelo de geração');
});

test('painel: sem a chave, a fila não abre; com a chave, mostra briefing, escopo e o contato para avisar', async () => {
  const { n, c } = await ateAFila();
  await n.chamar('POST', 'gerar', { conversa_id: c });
  assert.equal((await painelGet('?fila=direcoes', { headers: { authorization: 'Bearer errada', 'x-forwarded-for': '192.0.2.77' } })).status, 401);
  const f = await painelGet('?fila=direcoes');
  assert.equal(f.status, 200, JSON.stringify(f.corpo));
  const p = f.corpo.fila.find(x => x.conversa_id === c);
  assert.ok(p, 'o pedido está na fila');
  assert.equal(p.contato.nome, 'Ana Souza');
  assert.equal(p.contato.telefone, '+5521999990000');
  assert.ok(p.briefing && p.briefing.negocio, 'o briefing para produzir');
  assert.equal(p.fatores.formato, 'institucional');
  assert.deepEqual(p.direcoes.map(d => d.estrategia).sort(), ['autoridade', 'conversao', 'experiencia']);
  assert.ok(p.direcoes.every(d => d.status === 'gerando'));
  assert.ok(p.pedido_em, 'quando o cliente pediu (para o prazo de 24 horas úteis)');
});

test('painel: entregar passa pelo mesmo filtro da geração; as 3 prontas liberam a tela do cliente; avisado sai da fila', async () => {
  const { n, c } = await ateAFila();
  await n.chamar('POST', 'gerar', { conversa_id: c });
  const pedido = (await painelGet('?fila=direcoes')).corpo.fila.find(x => x.conversa_id === c);
  const [d1, d2, d3] = pedido.direcoes;

  /* recusada pelo filtro: poucas seções */
  const ruim = await painelPost({ entregar_direcao: d1.id, conteudo: { ...direcao(), secoes: [direcao().secoes[0]] } });
  assert.equal(ruim.status, 422);
  assert.match(ruim.corpo.erro, /poucas seções/);
  /* id inválido e direção inexistente */
  assert.equal((await painelPost({ entregar_direcao: 'x', conteudo: direcao() })).status, 400);
  assert.equal((await painelPost({ entregar_direcao: '00000000-0000-4000-8000-000000000000', conteudo: direcao() })).status, 404);

  const ok = await painelPost({ entregar_direcao: d1.id, conteudo: { ...direcao(), identidade: { ...direcao().identidade, paleta: { ...direcao().identidade.paleta, texto: '#FAFAFA' } } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.ok(ok.corpo.ajustes.includes('texto'), 'contraste corrigido pelo filtro, como na geração automática');
  assert.equal((await painelPost({ entregar_direcao: d1.id, conteudo: direcao() })).status, 409, 'já entregue');
  await painelPost({ entregar_direcao: d2.id, conteudo: direcao('Autoridade serena') });
  await painelPost({ entregar_direcao: d3.id, conteudo: direcao('Experiência que acolhe') });

  const e = await n.chamar('GET', 'estado', undefined, '&conversa=' + c);
  assert.equal(e.corpo.conversa.etapa, 'direcoes', 'as três prontas: o cliente já escolhe');
  const salva = e.corpo.direcoes.find(d => d.id === d1.id);
  assert.equal(salva.status, 'pronta');
  assert.equal(salva.conteudo.estrategia, d1.estrategia, 'a estratégia vem do banco, não do arquivo');

  const pronta = (await painelGet('?fila=direcoes')).corpo.fila.find(x => x.conversa_id === c);
  assert.ok(pronta && pronta.direcoes.every(d => d.status === 'pronta'), 'prontas e ainda não avisadas: seguem na fila para o aviso');
  assert.equal((await painelPost({ avisado: c })).status, 200);
  assert.ok(!(await painelGet('?fila=direcoes')).corpo.fila.some(x => x.conversa_id === c), 'avisado: sai da fila');
  assert.equal((await painelPost({ avisado: '00000000-0000-4000-8000-000000000000' })).status, 404);
});

test('controle positivo: no modo da API a geração chama o modelo (o espião enxerga)', async () => {
  const { n, c } = await ateAFila('api');
  await n.chamar('POST', 'gerar', { conversa_id: c });
  const d = (await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo.direcoes[0];
  const antes = chamadasGeracao;
  const r = await n.chamar('POST', 'gerar-direcao', { conversa_id: c, direcao_id: d.id });
  assert.equal(r.corpo.status, 'pronta', JSON.stringify(r.corpo));
  assert.ok(chamadasGeracao > antes, 'o modelo de geração foi chamado');
});

test('modo manual: a fila não depende dos tetos de gasto da IA (não há gasto de API na fila)', async () => {
  /* revisão técnica: o disjuntor aberto ou o teto da conversa não podem barrar quem acabou de deixar o WhatsApp */
  /* (acima do teto da conversa, US$ 1,50, e longe do teto do dia, US$ 25, que valeria para os outros testes) */
  const { n, c } = await ateAFila();
  const api = await ateAFila('api');
  await local.db.exec(`update app.conversas set custo_ia_usd = 1.6 where id in ('${c}', '${api.c}')`);
  const g = await n.chamar('POST', 'gerar', { conversa_id: c });
  assert.equal(g.status, 200, JSON.stringify(g.corpo));
  assert.equal((await api.n.chamar('POST', 'gerar', { conversa_id: api.c })).status, 429, 'no modo da API o teto segue valendo');
});

test('painel: a fila diz o total (pedido novo nunca some calado), avisado antes da hora não perde o pedido, POST sem chave e corpo grande são recusados', async () => {
  const { n, c } = await ateAFila();
  await n.chamar('POST', 'gerar', { conversa_id: c });
  const f = await painelGet('?fila=direcoes');
  assert.equal(typeof f.corpo.total, 'number');
  assert.ok(f.corpo.total >= f.corpo.fila.length);
  assert.equal(f.corpo.truncada, f.corpo.total > f.corpo.fila.length);
  const cedo = await painelPost({ avisado: c });
  assert.equal(cedo.status, 200);
  assert.equal(cedo.corpo.avisadas, 0, 'nada pronto: nada marcado');
  assert.ok((await painelGet('?fila=direcoes')).corpo.fila.some(x => x.conversa_id === c), 'segue na fila');
  const semChave = await mudar(new Request(BASE + '/api/painel', { method: 'POST', body: JSON.stringify({ avisado: c }), headers: { 'x-forwarded-for': '192.0.2.78' } }), ENV);
  assert.equal(semChave.status, 401);
  const grande = await mudar(new Request(BASE + '/api/painel', comChave({ method: 'POST', body: JSON.stringify({ entregar_direcao: c, conteudo: { lixo: 'x'.repeat(300000) } }) })), ENV);
  assert.equal(grande.status, 413);
});
