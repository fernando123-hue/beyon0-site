/* O CENÁRIO dos testes de AJUSTES (PR 3a): o pedido confirmado pelo painel, os três modelos entregues pelo painel (válidos
   e diferentes entre si: o 2 com outra paleta, outras fontes e "Perguntas frequentes"; o 3 com "Equipe") e o modelo 1
   escolhido. A IA do cenário conta quem a chama e falha: os ajustes não podem precisar dela (spec §7). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { atender } from '../../api/vendas.mjs';
import { ler, mudar } from '../../api/painel.mjs';
import { LIMITES_DE_TESTE, telefoneDeTeste } from './_pedido.mjs';

export const BASE = 'http://127.0.0.1:8899';
const CHAVE = 'k'.repeat(40);
export const ENV = { BZ_LOCAL: '1', PAINEL_CHAVE: CHAVE };
const RESP = { ramo: 'saude', cidade: 'Niterói', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' };
const VALIDA = JSON.parse(fs.readFileSync(new URL('./fixtures/direcao-valida.json', import.meta.url), 'utf8'));
const secao = (tipo, titulo, itens) => ({ tipo, variante: 'lista', rotulo: '', titulo, subtitulo: '', texto: '', itens, cta: '' });

/* seções do 1: abertura, serviços, depoimentos, contato. O 2 acrescenta "Perguntas frequentes"; o 3, "Equipe" */
export function modelo(n) {
  const d = structuredClone(VALIDA);
  d.nome_conceito = ['Clareza que agenda', 'Autoridade serena', 'Experiência que acolhe'][n - 1];
  if (n === 2) {
    d.identidade.paleta = { ...d.identidade.paleta, destaque: '#7A3E0B' };
    d.identidade.tipografia = { titulos: 'serif_classica', texto: 'sans_humanista' };
    d.secoes.splice(3, 0, secao('faq', 'Perguntas frequentes', [{ titulo: 'Atende particular?', texto: 'Sim, com horário marcado.' }]));
  }
  if (n === 3) d.secoes.splice(1, 0, secao('equipe', 'Quem cuida de você', [{ titulo: '[Nome do profissional]', texto: '[Formação]' }]));
  return d;
}

export function criarCenario(local) {
  const contas = { ia: 0, banco: 0 };
  const ia = { nome: 'proibida', async mensagem() { contas.ia++; throw new Error('a IA não pode ser chamada nos ajustes'); } };
  const banco = (nome, p) => { contas.banco++; return local.rpc(nome, p); };
  let ipSeq = 0;
  /* um "navegador" por IP (o freio geral é de 90 por minuto por IP) */
  function navegador(extra = {}) {
    const ip = '198.18.0.' + (++ipSeq);
    let token = null;
    const deps = { banco, visitantes: local.auth, ia, direcoes: 'manual', segredoFreio: 's'.repeat(32), limitesPedido: LIMITES_DE_TESTE, ...extra };
    const chamar = async (metodo, acao, corpo, query = '') => {
      const r = await atender(new Request(BASE + '/api/vendas?acao=' + acao + query, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
        headers: { 'x-forwarded-for': ip, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) } }), {}, metodo, deps);
      return { status: r.status, corpo: await r.json() };
    };
    return { chamar, adotar(sessao) { token = sessao.token; }, async iniciar() { const r = await chamar('POST', 'sessao', {}); token = r.corpo.token; return r.corpo.conversa_id; } };
  }
  const comChave = (opcoes = {}) => ({ ...opcoes, headers: { authorization: 'Bearer ' + CHAVE, 'x-forwarded-for': '192.0.2.9', ...(opcoes.headers || {}) } });
  const painelGet = async q => { const r = await ler(new Request(BASE + '/api/painel' + q, comChave()), ENV); return { status: r.status, corpo: await r.json() }; };
  const painelPost = async corpo => { const r = await mudar(new Request(BASE + '/api/painel', comChave({ method: 'POST', body: JSON.stringify(corpo) })), ENV); return { status: r.status, corpo: await r.json() }; };
  const estado = async (n, c) => (await n.chamar('GET', 'estado', undefined, '&conversa=' + c)).corpo;
  async function forcarEtapa(c, etapa) {
    await local.db.transaction(async tx => {
      await tx.exec("set local bz.transicao_livre = 'on'");
      await tx.query('update app.conversas set etapa = $1 where id = $2', [etapa, c]);
    });
  }
  /* perguntas → pacote → detalhes → o dono confirma e entrega os três pelo painel → o cliente escolhe o modelo 1 */
  async function ateEscolher(extra = {}) {
    const n = navegador(extra);
    const c = await n.iniciar();
    const s = await n.chamar('POST', 'simular', { conversa_id: c, respostas: RESP });
    assert.equal((await n.chamar('POST', 'confirmar-pacote', { conversa_id: c, respostas: RESP, versao: s.corpo.versao })).status, 200);
    assert.equal((await n.chamar('POST', 'detalhes', { conversa_id: c, negocio: 'Clínica Exemplo', vende: 'Fisioterapia', telefone: telefoneDeTeste(), nome: 'Ana Souza', aceite: true })).status, 200);
    assert.equal((await painelPost({ confirmar_whatsapp: c })).status, 200);
    const dirs = (await estado(n, c)).direcoes;
    for (const d of dirs) assert.equal((await painelPost({ entregar_direcao: d.id, conteudo: modelo(d.numero) })).status, 200, 'entrega do modelo ' + d.numero);
    assert.equal((await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs.find(d => d.numero === 1).id })).status, 200);
    return { n, c, dirs };
  }
  return { contas, navegador, painelGet, painelPost, ateEscolher, estado, forcarEtapa };
}
