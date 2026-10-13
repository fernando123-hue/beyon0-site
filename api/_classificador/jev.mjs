/* ==========================================================================
   ADAPTADOR DO JEV — DESLIGADO (etapa A da missão do JEV, 2026-10-11).
   Não há documentação pública acessível, chave nem medição (no Sistema SBP a
   API respondeu 403). Por isso NENHUMA chamada de rede aqui: o adaptador diz
   "indisponível" e o classificador recua para as regras. Para conectar (etapa
   C): documentação oficial, chave no ambiente do servidor (nunca no
   navegador), contrato de entrada/saída igual ao das regras, tempo-limite e
   uma medição do JEV contra as regras antes de ligar BZ_JEV=ligado.
   ========================================================================== */
export async function jev() {
  return { disponivel: false, motivo: 'jev não conectado' };
}
