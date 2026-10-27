/* ==========================================================================
   OS ENDEREÇOS QUE O PAINEL GRAVA (PR 3b-3; spec §8, "Endereços que o painel grava"). Só https, sem usuário, porta, caminho nem `?`.
   • A PRÉVIA passa pela URL_PREVIA da captação (clientes/esquema.mjs) E precisa ser do projeto desta entrega (bz-<id do cliente na captação>),
     porque qualquer pessoa pode criar um *.pages.dev. O id do cliente chega ao site no "importado" (3b-2).
   • O SITE NO AR segue as regras de problemaDoLink (domínio público) e tem de ser só o endereço.
   O endereço que a tela abre é montado pelo CÓDIGO a partir deste valor conferido, nunca de texto livre.
   ========================================================================== */
import ESQ from '../../js/orcamento-material-esquema.js';

export const URL_PREVIA = new RegExp('^https://v\\d{1,2}\\.bz-c-[' + ESQ.ALFABETO_ID + ']{6}\\.pages\\.dev/?$');

export function problemaDaPrevia(url, clienteCaptacao) {
  if (typeof url !== 'string' || url.length > 120) return 'endereço inválido';
  if (!URL_PREVIA.test(url)) return 'o endereço não é de uma prévia (https://vN.bz-c-xxxxxx.pages.dev)';
  if (!ESQ.ID_CLIENTE.test(String(clienteCaptacao))) return 'o pedido ainda não foi importado na captação (falta o id do cliente)';
  if (new URL(url).hostname.split('.')[1] !== 'bz-' + clienteCaptacao) return 'a prévia é de outro projeto';
  return null;
}

export function problemaDoSite(url) {
  if (typeof url !== 'string' || !url) return 'endereço inválido';
  const p = ESQ.problemaDoLink(url);
  if (p) return p;
  let u;
  try { u = new URL(url); } catch { return 'endereço inválido'; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return 'use https, sem usuário nem porta';
  if (u.pathname !== '/' || u.search || u.hash) return 'use só o endereço do site, sem caminho nem ?';
  return null;
}
export const origemDoSite = url => new URL(url).origin;
