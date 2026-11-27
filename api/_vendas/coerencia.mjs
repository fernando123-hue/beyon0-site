/* Mapa vivo v2, FASE 4, parte 2 (servidor): a coerência do caso que o ESTADO devolve à tela. A regra é a comum com a tela
   (js/orcamento-coerencia.js); quem decide é o servidor (revisão de segurança do PR #289: a tela nunca manda o palpite). Só o ramo que a
   pessoa TOCOU (briefing.fluxo_toques.ramo; texto livre sem toque não grava ramo, aceite 4 da Fase 4) contra as falas DELA, juntas, uma
   oração por mensagem. Devolve só códigos e nomes da tabela, nunca texto dela. Nunca lança. */
import C from '../../js/orcamento-coerencia.js';

const TEXTO_MAX = 2000;
const ehObjeto = v => !!v && typeof v === 'object' && !Array.isArray(v);

export function coerenciaDaConversa(briefing, mensagens) {
  try {
    const toques = ehObjeto(briefing) && ehObjeto(briefing.fluxo_toques) ? briefing.fluxo_toques : null;
    const ramo = toques && typeof toques.ramo === 'string' ? toques.ramo : null;
    if (!ramo || !Object.hasOwn(C.NOMES, ramo)) return null;
    const dela = (Array.isArray(mensagens) ? mensagens : [])
      .filter(m => ehObjeto(m) && m.papel === 'visitante' && typeof m.conteudo === 'string')
      .map(m => m.conteudo.replace(/[.!?;,\s]+$/, ''));
    if (!dela.length) return null;
    /* (cada mensagem fecha a oração: o "não" de uma não nega a palavra da seguinte) */
    const r = C.conferirCoerencia({ ramo }, dela.join('. ').slice(0, TEXTO_MAX));
    if (r.ok || !Object.hasOwn(C.NOMES, r.palpite)) return null;
    return { palpite: r.palpite, nome: C.NOMES[r.palpite], tocado: C.NOMES[ramo] };
  } catch {
    return null;
  }
}
