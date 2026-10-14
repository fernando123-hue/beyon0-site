/* ==========================================================================
   AS REGRAS COMERCIAIS ATIVAS (sem elas não há estimativa: nada de preço inventado), com um CACHE CURTO
   OPCIONAL (PR37-T4: o catálogo, o preço ao vivo e o "Quero" iam ao banco a cada chamada). 30 s por instância,
   só para quem pede { cache: true } (catálogo, simular, confirmar-pacote); a conversa com o consultor e o
   ajuste sempre leem do banco. A chave do cache é a do banco: em produção o transporte nasce a cada pedido,
   então ele traz rpc.chaveCache (o endereço do Supabase); nos testes, a própria função. Uma versão ativa
   INVÁLIDA vale como ausente e nunca fica guardada (revisão técnica do PR 12). Tabela trocada nos últimos 30 s:
   o banco só aceita estimativa da ATIVA, e quem grava chama esquecerRegras().
   ========================================================================== */
import { validarRegras } from './precos.mjs';
import { ORG } from './org.mjs';

const TTL_MS = 30e3;
let guardada = null;   /* { chave, em, valor } */
const chaveDe = banco => banco.chaveCache || banco;

/* a tabela guardada é uma só para todos os pedidos da instância: congelada em profundidade, quem a recebe não a altera */
function congelar(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(congelar); }
  return v;
}

export async function regrasAtivas(banco, { cache = false, agora = Date.now() } = {}) {
  const chave = chaveDe(banco);
  if (cache && guardada && guardada.chave === chave && agora - guardada.em < TTL_MS) return guardada.valor;
  const r = await banco('vendas_regras_ativas', { org_slug: ORG });
  let valor = null;
  if (r && r.regras) {
    const v = validarRegras(r.regras);
    if (v.erros) console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', evento: 'tabela de preços ativa inválida', versao: r.versao ?? null, erros: v.erros.slice(0, 5) }));
    else valor = congelar(r);
  }
  guardada = valor ? { chave, em: agora, valor } : null;   /* (a leitura sem cache também renova o guardado) */
  return valor;
}

export function esquecerRegras() { guardada = null; }
