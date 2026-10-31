/* ==========================================================================
   O AVISO AO DONO. Um só lugar para quem manda: os avisos de "pedido novo na fila", "recado novo", "fila cheia" e os do
   atendente (api/_vendas, api/atendente.mjs). HOJE NÃO EXISTE CANAL DE AVISO NO CELULAR: o canal será um app próprio
   (o painel do dono com push) e ainda não foi feito. Por isso avisarDono não envia nada e devolve false; quem chama
   pode dar await sem medo. Os textos fixos de AVISOS ficam para o canal futuro: NUNCA levam dado do cliente nem o
   conteúdo de um recado.
   ========================================================================== */
export const AVISOS = Object.freeze({
  pedido: 'Pedido novo na fila. Detalhes no painel.',
  recado: 'Recado novo. Leia no painel.',
  fila_cheia: 'URGENTE: a fila de pedidos encheu ou o limite por hora foi atingido. Veja o painel.',
  atendente_cliente: 'O atendente de um cliente bateu o teto de gasto do dia e passou a mandar as pessoas para a equipe. Veja o painel.',
  atendente_contatos: 'O atendente de um cliente recebeu o máximo de contatos do dia (pode ser abuso). Veja o painel.',
  atendente_global: 'URGENTE: o teto de gasto do dia do atendente (todos os clientes) acabou. Veja o painel.'
});

/* Sem canal: não faz nada além de devolver false. Os parâmetros (env, tipo, deps) ficam para o canal futuro */
export async function avisarDono(env, tipo, deps = {}) {
  return false;
}
