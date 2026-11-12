/* ==========================================================================
   AQUECER O BANCO quando o recado (ou o orçamento) abre. Medido em 12/11 no recado do dono, em produção: a resposta
   levou 1.023 ms e, dentro dela, a chamada ao Supabase 1.010 ms (o anti-robô, 12 ms), com uma função SQL leve: a
   conexão estava fria. O GET sessao-config (que o recado e o orçamento já pedem ao abrir, js/orcamento-turnstile.js)
   deixa em segundo plano uma leitura leve e útil: a tabela de preços ativa, com o cache de 30 s de regras-ativas.mjs
   (duas aberturas seguidas na mesma instância não vão ao banco duas vezes). Quem chama nunca espera e nunca vê erro.
   ========================================================================== */
import { regrasAtivas } from './regras-ativas.mjs';

/* banco: o transporte (ou null sem Supabase); segundoPlano: p => ctx.waitUntil(p). Devolve se entregou a leitura. */
export function aquecerBanco(banco, segundoPlano) {
  if (typeof banco !== 'function' || typeof segundoPlano !== 'function') return false;
  /* (a chamada sai já, na mesma tarefa da resposta; aquecer é só um adiantamento: a falha aparece, se for o caso, na chamada de verdade) */
  const leitura = regrasAtivas(banco, { cache: true }).catch(() => null);
  segundoPlano(leitura);
  return true;
}
