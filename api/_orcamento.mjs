/* ==========================================================================
   ORÇAMENTO DE SUBPEDIDOS POR EXECUÇÃO (plano da migração para a Cloudflare, A8; limite lido em 21/10/2026).
   No plano grátis da Cloudflare um Worker pode fazer no máximo 50 subpedidos (fetch, banco, ntfy…) por invocação; o
   que passar disso falha. As duas rotinas agendadas (reconciliação dos pagamentos e a rotina diária) contam cada
   chamada e PARAM antes: o resto fica para a próxima execução, com aviso no log e `parcial: true` no resumo.
   • O contador é POR EXECUÇÃO (criado em cada chamada, nunca no módulo): o isolado atende pedidos ao mesmo tempo.
   • `contar(fn)` gasta 1 por chamada e lança SemOrcamento quando acabou; a conta é feita ANTES de chamar, de forma
     síncrona, então tarefas em paralelo também respeitam o teto.
   • `reserva`: o que fica de fora das chamadas comuns, para as chamadas finais que não podem faltar (`contarReservado`).
   ========================================================================== */
export const ORCAMENTO_SUBPEDIDOS = 45;   /* (o limite é 50; sobram 5 de folga para o que não é contado) */

export class SemOrcamento extends Error {
  constructor() { super('sem orçamento de subpedidos nesta execução'); this.name = 'SemOrcamento'; }
}

export function orcamentoDe(limite = ORCAMENTO_SUBPEDIDOS, reserva = 0) {
  let gastos = 0;
  const gastar = teto => { if (gastos >= teto) throw new SemOrcamento(); gastos++; };
  return {
    contar: fn => async (...a) => { gastar(limite - reserva); return fn(...a); },
    contarReservado: fn => async (...a) => { gastar(limite); return fn(...a); },
    gastos: () => gastos
  };
}
