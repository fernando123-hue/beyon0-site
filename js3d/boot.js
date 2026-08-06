/* Ponto de entrada do navegador. Separado do index.js de propósito: os testes
   importam boot() e o chamam com um DOM e uma ponte falsos, e não podem
   disparar o boot real ao fazer isso. */
import { boot } from './index.js';

try {
  boot(document, window.__beyon3d);
} catch (e) {
  /* silêncio proposital: o SVG de fallback permanece visível e o resto do
     site segue inteiro. Um reator que não sobe não pode derrubar a página. */
}
