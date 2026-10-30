/* OS ITENS "FORA DO AUTOMÁTICO" da tabela-rascunho até 2026-10-28. Nesse dia o dono tirou da venda a área restrita, o
   sistema sob medida e a loja em código próprio (Decisões.md): a tabela real não tem mais item fora do automático, e o
   consultor diz que a Beyon Zero não faz isso hoje. O motor continua sabendo mandar um item assim para o diagnóstico
   (uma tabela ativa antiga pode ter): os testes desse caminho usam esta cópia. Nada da tabela original muda. */
export const FORA_V1 = Object.freeze({
  loja_virtual: { nome: 'Loja feita do zero, em código próprio', fora_do_automatico: true },
  area_restrita: { nome: 'Área restrita com login', fora_do_automatico: true },
  sistema_sob_medida: { nome: 'Sistema ou painel sob medida', fora_do_automatico: true }
});

export const comFora = regras => {
  const copia = JSON.parse(JSON.stringify(regras));
  return { ...copia, adicionais: { ...copia.adicionais, ...JSON.parse(JSON.stringify(FORA_V1)) } };
};
