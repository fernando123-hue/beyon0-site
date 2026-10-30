/* a recusa que o visitante lê: o status HTTP, a frase (sem detalhe interno) e campos extras (recado, versao_nova…).
   Mora aqui para o fluxo do pedido (fluxo-pedido.mjs) e o fluxo de vendas (fluxo.mjs) usarem a MESMA classe */
export class Recusa extends Error {
  constructor(status, mensagem, extra) { super(mensagem); this.status = status; this.extra = extra; }
}
