/* O MOTOR COM TETO DE PRAZO E DE VALOR. Em 2026-10-28 o dono tirou as travas da tabela-rascunho ("o objetivo é ser tudo
   100% automático"; prazo_max_dias 60 e limites no máximo do validador): com ela, nenhum pedido comum chega a uma fase
   seguinte nem ao limite de valor. O motor continua sabendo dividir em fases e barrar valor alto (uma tabela ativa pode
   voltar a ter teto): os testes desse mecanismo usam esta cópia, com o teto de 10 dias e os limites de R$ 15.000 por
   fase e R$ 60.000 por projeto da tabela v2 (aprovada em 2026-10-09). Nada da tabela original muda. */
export const TETO_ANTIGO = Object.freeze({ prazo_max_dias: 10, valor_max_automatico: 15000, valor_max_projeto: 60000 });

export const comFases = regras => {
  const copia = JSON.parse(JSON.stringify(regras));
  return {
    ...copia,
    prazo_max_dias: TETO_ANTIGO.prazo_max_dias,
    limites: { valor_max_automatico: TETO_ANTIGO.valor_max_automatico, valor_max_projeto: TETO_ANTIGO.valor_max_projeto }
  };
};
