/* ==========================================================================
   O ACEITE COM VERSÃO (spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §5 e Anexo B, N6/N6b).
   O texto do aceite mora no módulo comum (js/orcamento-rotulos.js, ACEITE). A tela manda a versão que mostrou; o servidor só aceita a
   VIGENTE (uma aba velha ou uma página em cache recebe 409 e recarrega) e grava, junto do aceite, a versão e o hash do texto,
   calculado AQUI (o conteúdo nunca vem do cliente: ele só diz qual viu).
   ========================================================================== */
import R from '../../js/orcamento-rotulos.js';

export const VERSAO_ACEITE = R.ACEITE.versao;
export const TEXTO_ACEITE = R.ACEITE.texto;
export const ACEITE_MUDOU = 'O texto do aceite foi atualizado. Recarregue a página e confira de novo antes de enviar.';

export const aceiteVigente = versao => versao === VERSAO_ACEITE;

/* SHA-256 do texto vigente, em hexadecimal (Web Crypto: o mesmo no Worker e no Node) */
let hashGuardado = null;
export async function hashDoAceite() {
  if (hashGuardado) return hashGuardado;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TEXTO_ACEITE)));
  hashGuardado = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return hashGuardado;
}
