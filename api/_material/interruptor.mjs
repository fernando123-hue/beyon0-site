/* ==========================================================================
   O INTERRUPTOR DA ENTREGA (PR 3b-2; M5 da revisão do plano). O orçamento novo (material, link do pedido) só abre a cliente real
   com BZ_ENTREGA=ligada nas variáveis do Worker. Desligado por padrão: mesclar este PR nunca liga nada. O dono liga junto com o 3b-3
   e com o PR da privacidade mesclado. O servidor local (docs/servidor.mjs, que não vai ao deploy) liga por conta própria.
   ========================================================================== */
export const entregaLigada = env => String((env && env.BZ_ENTREGA) || '').trim() === 'ligada';
export const FRASE_DESLIGADA = 'Recebemos a sua entrada. A Beyon Zero responde pelo e-mail do seu recado para o próximo passo. Se ainda não deixou um, deixe um recado aqui.';
