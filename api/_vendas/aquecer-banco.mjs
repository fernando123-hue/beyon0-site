/* ==========================================================================
   AQUECER O BANCO quando o recado (ou o orçamento) abre. Medido em 12/11 no recado do dono, em produção: a resposta
   levou 1.023 ms e, dentro dela, a chamada ao Supabase 1.010 ms (o anti-robô, 12 ms), com uma função SQL leve: a
   conexão estava fria. O GET sessao-config (que o recado e o orçamento já pedem ao abrir, js/orcamento-turnstile.js)
   deixa em segundo plano uma leitura leve e útil: a tabela de preços ativa, com o cache de 30 s de regras-ativas.mjs.
   No máximo UM aquecimento a cada 30 s por instância, dê certo ou não (revisões do PR: rajada de aberturas, banco
   fora e GET público em massa não viram uma leitura por pedido). Quem chama nunca espera e nunca vê erro; a falha
   vai ao log só com o código (sem mensagem, que pode trazer detalhe do banco).
   ========================================================================== */
import { regrasAtivas } from './regras-ativas.mjs';

const INTERVALO_MS = 30e3;
let ultimoEm = -Infinity;

export function avisarFalha(evento, e) {
  console.warn(JSON.stringify({ origem: 'vendas', nivel: 'aviso', evento, codigo: e?.codigo ?? e?.name ?? 'erro' }));
}

/* banco: o transporte (ou null sem Supabase); segundoPlano: p => ctx.waitUntil(p). Devolve se entregou a leitura. */
export function aquecerBanco(banco, segundoPlano, { agora = Date.now() } = {}) {
  if (typeof banco !== 'function' || typeof segundoPlano !== 'function') return false;
  if (agora - ultimoEm < INTERVALO_MS) return false;
  ultimoEm = agora;
  const leitura = regrasAtivas(banco, { cache: true }).catch(e => { avisarFalha('aquecer o banco falhou', e); return null; });
  segundoPlano(leitura);
  return true;
}

/* testes: volta ao estado de instância nova */
export function esquecerAquecimento() { ultimoEm = -Infinity; }
