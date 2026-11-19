/* ==========================================================================
   O VIGIA — O QUE O WORKER CONFERE SOZINHO (spec 2026-11-15-auto-reparo), sem IA (a única rede externa é a pergunta gratuita da chave):
   • as páginas-chave pelo binding ASSETS (o mesmo que serve o site): 200 e um documento HTML; uma 2ª tentativa
     depois de 2 s antes de dar como quebrada. Sem ASSETS (servidor local, testes) não há o que conferir;
   • a configuração, só pela PRESENÇA (nunca lê nem devolve valor): banco, chave da IA, segredo das rotinas, pagamentos;
   • a chave da IA, na prática: a chamada gratuita de listar modelos (não gasta nada, não manda dado de cliente). Só a resposta 401
     (credencial recusada) conta; erro de rede, limite ou 5xx não provam nada e não alarmam. Só roda no Worker (com ASSETS).
   ========================================================================== */
import { configPagamentos } from '../_pagamentos/config.mjs';
import { segredoDoCron } from '../_cron.mjs';

export const PAGINAS = Object.freeze(['/', '/sites', '/automacao', '/orcamento']);
const ORIGEM = 'https://beyonzero.com.br';   /* (o ASSETS só olha o caminho; a origem é só para montar o pedido) */
const ESPERA_MS = 2000;
const CHAVE_IA_URL = 'https://api.anthropic.com/v1/models?limit=1';
const CHAVE_IA_VERSAO = '2023-06-01';
const CHAVE_IA_PRAZO_MS = 5000;
const NAO_AUTORIZADO = 401;
const esperarPadrao = ms => new Promise(r => setTimeout(r, ms));

async function paginaAbre(assets, caminho) {
  try {
    const r = await assets.fetch(new Request(ORIGEM + caminho));
    return r.status === 200 && /<html[\s>]/i.test(await r.text());
  } catch { return false; }
}

async function paginasAbrem(assets, esperar) {
  if (typeof assets?.fetch !== 'function') return true;
  for (const caminho of PAGINAS) {
    if (await paginaAbre(assets, caminho)) continue;
    await esperar(ESPERA_MS);
    if (!(await paginaAbre(assets, caminho))) return false;
  }
  return true;
}

async function chaveIaRecusada(env, buscar) {
  if (typeof env.ASSETS?.fetch !== 'function' || !env.ANTHROPIC_API_KEY) return false;
  try {
    const r = await buscar(CHAVE_IA_URL, { headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': CHAVE_IA_VERSAO }, signal: AbortSignal.timeout(CHAVE_IA_PRAZO_MS) });
    return r.status === NAO_AUTORIZADO;
  } catch { return false; }
}

function faltando(env) {
  const pagamentosLigados = configPagamentos(env).ativo === true;
  const nomes = [];
  if (!env.SUPABASE_URL || !env.SUPABASE_CHAVE_SECRETA || !env.SUPABASE_CHAVE_PUBLICA) nomes.push('supabase');
  if (!env.ANTHROPIC_API_KEY) nomes.push('anthropic');
  if (!segredoDoCron(env)) nomes.push('cron');
  if (!pagamentosLigados) nomes.push('pagamentos');
  return { nomes, pagamentosLigados };
}

/* → { paginas: true se todas abriram, configuracao: nomes que faltam, pagamentosLigados, chaveIaRecusada } */
export async function conferir(env = {}, { esperar = esperarPadrao, buscar = fetch } = {}) {
  const { nomes, pagamentosLigados } = faltando(env);
  return { paginas: await paginasAbrem(env.ASSETS, esperar), configuracao: nomes, pagamentosLigados, chaveIaRecusada: await chaveIaRecusada(env, buscar) };
}
