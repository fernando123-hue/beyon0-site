/* Os detectores de CÓDIGO do gabarito do classificador: os mesmos do site (api/_classificador/sinais-de-codigo.mjs), aqui
   com o nicho de teste. Usados pela base de código (avaliar-codigo-no-gabarito.mjs) e pela medição combinada código + modelo
   (medir-motor-no-gabarito.mjs). */
import { nichoRegulado } from '../api/_vendas/zero.mjs';
import { detectores, SAUDE_HUMANA, CHAVES_DE_SAUDE } from '../api/_classificador/sinais-de-codigo.mjs';

export { SAUDE_HUMANA, CHAVES_DE_SAUDE };

/* o nicho de teste para a trava de saúde: a trava só atua quando a conversa já está em nicho regulado */
export const NICHO_DE_TESTE = nichoRegulado('sou dentista');

/* cada detector devolve 'sim' ou 'nao' (ou, no nicho, 'regulado' ou 'livre'); null = sem detector */
export const DETECTORES = detectores({ nicho: NICHO_DE_TESTE });
