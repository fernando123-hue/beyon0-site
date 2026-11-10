/* ==========================================================================
   OS SINAIS DE CÓDIGO do classificador: as travas e regras que já existem em
   api/ respondendo as mesmas perguntas fechadas, num lugar só. Usados pela base
   da F1/F2 (scripts/detectores-do-gabarito.mjs, com o nicho de teste) e pelo
   modo sombra do site (sombra.mjs, com o nicho real da sessão), para comparar
   código × modelo. Só regex: custo zero, nada de rede.
   ========================================================================== */
import { semPromessaDeDesconto, semPromessaDeRecado, garantirRegulado, nichoRegulado } from '../_vendas/zero.mjs';
import { semPromessaDeResultado } from '../_vendas/travas-resultado.mjs';
import { semPrecoNoTexto, pareceInjecao } from '../_vendas/seguranca.mjs';
import { pedePessoa, negaSerIA } from '../_atendente/regras.mjs';

/* nicho_saude tem 7 rótulos; o código devolve o nicho regulado ou null (que é "nenhum", "veterinária" ou "ambíguo").
   A comparação justa é binária: é saúde humana regulada (medicina, odontologia, psicologia, estética)? */
export const SAUDE_HUMANA = new Set(['medicina', 'odontologia', 'psicologia', 'estetica']);
export const CHAVES_DE_SAUDE = new Set(['odontologia', 'psicologia', 'nutricao', 'fisioterapia', 'medicina', 'fonoaudiologia', 'enfermagem', 'biomedicina', 'estetica']);

/* cada detector devolve 'sim' ou 'nao' (ou, no nicho, 'regulado' ou 'livre'); null = sem detector.
   nicho: o da sessão (nichoRegulado); a trava de saúde só atua em nicho regulado, então sem nicho ela diz 'nao' */
export function detectores({ nicho = null } = {}) {
  return {
    saida_do_zero: {
      promete_desconto: t => (semPromessaDeDesconto(t).trocou ? 'sim' : 'nao'),
      afirma_recado: t => (semPromessaDeRecado(t).trocou ? 'sim' : 'nao'),
      oferece_proibido_saude: t => (nicho && garantirRegulado(t, { nicho }).trocou ? 'sim' : 'nao'),
      escreve_valor: t => (semPrecoNoTexto(t) !== t ? 'sim' : 'nao'),
      promete_resultado: t => (semPromessaDeResultado(t).trocou ? 'sim' : 'nao'),   /* api/_vendas/travas-resultado.mjs (a garantia, semGarantia, é outra pergunta) */
      /* detector do ATENDENTE do cliente (api/_atendente/regras.mjs), não ligado ao Zero: a base que a F2 mediu.
         Ele marca como negação as apresentações do próprio Zero (sz-102, sz-107, sz-108): divergência aqui é esperada */
      nega_ser_ia: t => (negaSerIA(t) ? 'sim' : 'nao')
    },
    entrada_do_visitante: {
      tenta_dar_ordens: t => (pareceInjecao(t) ? 'sim' : 'nao'),
      nicho_saude: t => { const n = nichoRegulado(t); return n && CHAVES_DE_SAUDE.has(n.chave) ? 'regulado' : 'livre'; },
      pede_pessoa: t => (pedePessoa(t) ? 'sim' : 'nao'),   /* idem: detector do atendente do cliente, não ligado ao Zero */
      irritacao: null,
      momento: null
    }
  };
}

/* o que o código diz de um texto: os rótulos (para registrar e comparar) e o formato que politica.decidir() lê
   (true/false; no nicho, o ramo, que só vale se for de saúde humana) */
export function lerCodigo(tarefa, texto, { nicho = null } = {}) {
  const lista = detectores({ nicho })[tarefa] ?? {};
  const t = typeof texto === 'string' ? texto : '';
  const rotulos = {}, politica = {};
  for (const [pergunta, detector] of Object.entries(lista)) {
    if (!detector) continue;
    rotulos[pergunta] = detector(t);
    politica[pergunta] = rotulos[pergunta] === 'sim';
  }
  if ('nicho_saude' in rotulos) politica.nicho_saude = nichoRegulado(t)?.chave ?? null;
  return { rotulos, politica };
}
