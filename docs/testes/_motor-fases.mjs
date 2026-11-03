/* O MOTOR COM TETO DE PRAZO E DE VALOR. Em 2026-10-28 o dono tirou as travas da tabela-rascunho ("o objetivo é ser tudo
   100% automático"; prazo_max_dias 60 e limites no máximo do validador): com ela, nenhum pedido comum chega a uma fase
   seguinte nem ao limite de valor. O motor continua sabendo dividir em fases e barrar valor alto (uma tabela ativa pode
   voltar a ter teto): os testes desse mecanismo usam esta cópia, com o teto de 10 dias e os limites de R$ 15.000 por
   fase e R$ 60.000 por projeto da tabela v2 (aprovada em 2026-10-09). Nada da tabela original muda. */
export const TETO_ANTIGO = Object.freeze({ prazo_max_dias: 10, valor_max_automatico: 15000, valor_max_projeto: 60000 });

export const comFases = regras => {
  const copia = JSON.parse(JSON.stringify(regras));
  /* a tabela v3 (2026-11-03) trouxe o Cume (base 20.000, 15 dias) e as interações e o atendente como adicionais; estes testes
     são do MECANISMO de fases e limites, com a tabela v2: voltam o formato antigo e saem os adicionais novos (o que a v3 traz tem
     testes próprios, no fim de precos.test.mjs) */
  copia.formatos.sob_medida = { nome: 'Experiência digital', base: 19900, piso: 9900, prazo_dias: 10, paginas_incluidas: 4, inclui: copia.formatos.sob_medida.inclui };
  for (const k of Object.keys(copia.adicionais)) if (/^interacao_|^atendente_ia_/.test(k)) delete copia.adicionais[k];
  return {
    ...copia,
    prazo_max_dias: TETO_ANTIGO.prazo_max_dias,
    limites: { valor_max_automatico: TETO_ANTIGO.valor_max_automatico, valor_max_projeto: TETO_ANTIGO.valor_max_projeto }
  };
};
