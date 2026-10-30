/* ==========================================================================
   ESTADOS — do Mercado Pago (Orders API) para o domínio da Beyon Zero.
   Fonte: "Transaction status" e "Order status" da documentação oficial
   (docs/pagamentos/00-PESQUISA-E-PLANO.md). Regra: o que não está na tabela
   vira "desconhecido", e desconhecido NUNCA vira pago (fail closed).
   O estado decide pela TRANSAÇÃO (o pagamento dentro da order); a order só
   desempata em "in_review".
   ========================================================================== */

/* estados internos da tentativa (iguais aos do banco, app.tentativas_pagamento) */
export const ESTADOS = ['processando', 'aguardando', 'requer_acao', 'aprovada', 'recusada', 'cancelada', 'expirada',
  'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida', 'desconhecido'];
export const TERMINAIS = new Set(['recusada', 'cancelada', 'expirada', 'estornada', 'duplicada']);
export const ATIVOS = new Set(['criada', 'processando', 'aguardando', 'requer_acao']);

const AGUARDANDO = new Set(['waiting_transfer', 'waiting_payment']);
const REQUER_ACAO = new Set(['pending_challenge', 'waiting_capture', 'waiting_retry']);

export function estadoDe(status, detalhe) {
  switch (status) {
    case 'processed':
      if (detalhe === 'accredited') return 'aprovada';
      if (detalhe === 'partially_refunded') return 'estornada_parcial';
      return 'desconhecido';
    case 'created':
    case 'processing':
    case 'in_review':
      return 'processando';
    case 'action_required':
      if (AGUARDANDO.has(detalhe)) return 'aguardando';
      if (REQUER_ACAO.has(detalhe)) return 'requer_acao';
      return 'desconhecido';
    case 'failed': return 'recusada';
    case 'canceled': return 'cancelada';
    case 'expired': return 'expirada';
    case 'refunded': return 'estornada';
    /* contestação: as duas páginas oficiais descrevem "settled" e "reimbursed" de forma oposta.
       Fail closed: qualquer chargeback é "contestada" (projeto pausado; a equipe resolve). */
    case 'charged_back': return 'contestada';
    default: return 'desconhecido';
  }
}

/* o que a pessoa lê (sem jargão), por estado e motivo da recusa */
const RECUSA = {
  bad_filled_card_data: 'Algum dado do cartão não confere. Confira e tente de novo.',
  insufficient_amount: 'O cartão não tem limite para este valor.',
  card_insufficient_amount: 'O cartão não tem limite para este valor.',
  rejected_by_issuer: 'O banco do cartão recusou o pagamento. Tente outro cartão ou o Pix.',
  required_call_for_authorize: 'O banco do cartão pede que você autorize o pagamento com ele antes.',
  card_disabled: 'Este cartão está bloqueado. Tente outro cartão ou o Pix.',
  high_risk: 'O pagamento não foi aprovado pela análise de segurança. Tente o Pix.',
  max_attempts_exceeded: 'Muitas tentativas com este cartão. Tente outro cartão ou o Pix.',
  invalid_installments: 'Esse número de parcelas não está disponível para este cartão.',
  amount_limit_exceeded: 'O valor passa do limite deste cartão.',
  '3ds_challenge_expired': 'A confirmação com o banco expirou. Tente de novo.'
};
export function mensagemRecusa(detalhe) {
  return RECUSA[detalhe] || 'O pagamento não foi aprovado. Tente de novo; se não der, deixe um recado para a equipe.';
}
