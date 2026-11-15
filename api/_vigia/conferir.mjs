/* ==========================================================================
   O VIGIA — O QUE O WORKER CONFERE SOZINHO (spec 2026-11-15-auto-reparo), sem rede externa e sem IA:
   • as páginas-chave pelo binding ASSETS (o mesmo que serve o site): 200 e um documento HTML; uma 2ª tentativa
     depois de 2 s antes de dar como quebrada. Sem ASSETS (servidor local, testes) não há o que conferir;
   • a configuração, só pela PRESENÇA (nunca lê nem devolve valor): banco, chave da IA, segredo das rotinas, pagamentos.
   ========================================================================== */
import { configPagamentos } from '../_pagamentos/config.mjs';
import { segredoDoCron } from '../_cron.mjs';

export const PAGINAS = Object.freeze(['/', '/sites', '/automacao', '/orcamento']);
const ORIGEM = 'https://beyonzero.com.br';   /* (o ASSETS só olha o caminho; a origem é só para montar o pedido) */
const ESPERA_MS = 2000;
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

function faltando(env) {
  const pagamentosLigados = configPagamentos(env).ativo === true;
  const nomes = [];
  if (!env.SUPABASE_URL || !env.SUPABASE_CHAVE_SECRETA || !env.SUPABASE_CHAVE_PUBLICA) nomes.push('supabase');
  if (!env.ANTHROPIC_API_KEY) nomes.push('anthropic');
  if (!segredoDoCron(env)) nomes.push('cron');
  if (!pagamentosLigados) nomes.push('pagamentos');
  return { nomes, pagamentosLigados };
}

/* → { paginas: true se todas abriram, configuracao: nomes que faltam, pagamentosLigados } */
export async function conferir(env = {}, { esperar = esperarPadrao } = {}) {
  const { nomes, pagamentosLigados } = faltando(env);
  return { paginas: await paginasAbrem(env.ASSETS, esperar), configuracao: nomes, pagamentosLigados };
}
