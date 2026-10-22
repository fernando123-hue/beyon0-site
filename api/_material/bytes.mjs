/* ==========================================================================
   A CONFERÊNCIA DOS PRIMEIROS BYTES (PR 3b-2; spec §7 e §8). O Worker lê só os 16 primeiros bytes do objeto e decide
   o tipo pelo CONTEÚDO, não pelo nome nem pelo tipo declarado. Sobre Uint8Array (sem Buffer): vale igual na Cloudflare.
   É a `tipoPorBytes` da captação (captacao/entrega/imagens.mjs) para PNG, JPEG e WebP; o SVG, que lá precisa de 2048
   bytes, aqui dá null (as duas recusam). docs/testes/captacao-igual.test.mjs confere as duas lado a lado.
   ========================================================================== */
export const BYTES_DO_INICIO = 16;
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const letras = (u8, de, ate) => String.fromCharCode(...u8.subarray(de, ate));

export function tipoPorBytes(u8) {
  if (!(u8 instanceof Uint8Array)) return null;
  if (u8.length >= 8 && ASSINATURA_PNG.every((b, i) => u8[i] === b)) return 'png';
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpg';
  if (u8.length >= 12 && letras(u8, 0, 4) === 'RIFF' && letras(u8, 8, 12) === 'WEBP') {
    /* os 16 bytes já trazem o 1º bloco (VP8 , VP8L ou VP8X): confere também, de graça (revisão do plano, B9) */
    return u8.length < 16 || /^VP8[ LX]$/.test(letras(u8, 12, 16)) ? 'webp' : null;
  }
  return null;
}
