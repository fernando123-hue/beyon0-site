/* A ÁREA RESTRITA AUTOMÁTICA da tabela v2 (aprovada pelo dono em 2026-10-09). Em 2026-10-14 o dono a tirou do automático
   ("a partir de R$ 4.500, com escopo escrito", pela conversa), e a tabela-rascunho perdeu os adicionais que dependiam dela.
   O motor continua sabendo lidar com dependentes (requer), prioridade e fase seguinte: os testes desse mecanismo usam
   esta cópia, para não depender do que a tabela do momento oferece. */
export const AREA_V2 = Object.freeze({
  area_restrita: { nome: 'Área restrita com login (1 perfil, até 3 telas)', valor: 4500, prazo_dias: 4, max: 1, prioridade: 12 },
  area_tela_extra: { nome: 'Tela extra na área restrita', valor: 700, prazo_dias: 1, max: 8, prioridade: 18, requer: ['area_restrita'] },
  area_perfil_extra: { nome: 'Perfil extra na área restrita (ex.: associado e diretoria)', valor: 1200, prazo_dias: 1.5, max: 3, prioridade: 16, requer: ['area_restrita'] },
  area_cobranca_recorrente: { nome: 'Cobrança de anuidade ou mensalidade na área restrita (Pix, boleto, cartão)', valor: 2500, prazo_dias: 3, max: 1, prioridade: 14, requer: ['area_restrita'] },
  area_documentos: { nome: 'Documentos e certificados por usuário na área restrita', valor: 900, prazo_dias: 1, max: 1, prioridade: 24, requer: ['area_restrita'] },
  area_importar_usuarios: { nome: 'Importar a lista de usuários para a área restrita', valor: 400, prazo_dias: 0.5, max: 1, prioridade: 13, requer: ['area_restrita'] },
});

/* uma cópia nova da tabela, com a área restrita automática da v2 (nada da tabela original muda) */
export const comArea = regras => {
  const copia = JSON.parse(JSON.stringify(regras));
  return { ...copia, adicionais: { ...copia.adicionais, ...JSON.parse(JSON.stringify(AREA_V2)) } };
};
