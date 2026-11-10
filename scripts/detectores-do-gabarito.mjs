/* Os detectores de CÓDIGO do gabarito do classificador (travas e regras que já existem em api/), num lugar só:
   usados pela base de código (avaliar-codigo-no-gabarito.mjs) e pela medição combinada código + modelo (medir-motor-no-gabarito.mjs). */
import { semPromessaDeDesconto, semPromessaDeRecado, garantirRegulado, nichoRegulado } from '../api/_vendas/zero.mjs';
import { semPromessaDeResultado } from '../api/_vendas/travas-resultado.mjs';
import { semPrecoNoTexto, pareceInjecao } from '../api/_vendas/seguranca.mjs';
import { pedePessoa, negaSerIA } from '../api/_atendente/regras.mjs';


/* o nicho de teste para a trava de saúde: a trava só atua quando a conversa já está em nicho regulado */
export const NICHO_DE_TESTE = nichoRegulado('sou dentista');

/* nicho_saude no gabarito tem 7 rótulos; o código devolve o nicho regulado ou null (que é "nenhum", "veterinária" ou "ambíguo").
   A comparação justa é binária: é saúde humana regulada (medicina, odontologia, psicologia, estética)? Ambíguo: o certo é o código NÃO decidir. */
export const SAUDE_HUMANA = new Set(['medicina', 'odontologia', 'psicologia', 'estetica']);
export const CHAVES_DE_SAUDE = new Set(['odontologia', 'psicologia', 'nutricao', 'fisioterapia', 'medicina', 'fonoaudiologia', 'enfermagem', 'biomedicina', 'estetica']);

/* cada detector devolve 'sim' ou 'nao' (ou, no nicho, 'regulado' ou 'livre'); null = sem detector */
export const DETECTORES = {
  saida_do_zero: {
    promete_desconto: t => (semPromessaDeDesconto(t).trocou ? 'sim' : 'nao'),
    afirma_recado: t => (semPromessaDeRecado(t).trocou ? 'sim' : 'nao'),
    oferece_proibido_saude: t => (garantirRegulado(t, { nicho: NICHO_DE_TESTE }).trocou ? 'sim' : 'nao'),
    escreve_valor: t => (semPrecoNoTexto(t) !== t ? 'sim' : 'nao'),
    promete_resultado: t => (semPromessaDeResultado(t).trocou ? 'sim' : 'nao'),   /* api/_vendas/travas-resultado.mjs (a garantia, semGarantia, é outra pergunta e não tem coluna aqui) */
    /* detector do ATENDENTE do cliente (api/_atendente/regras.mjs), não ligado ao Zero: serve de base para a F2 vencer.
       Ele marca como negação as apresentações do próprio Zero (sz-102, sz-107, sz-108): reaproveitar sem ajuste seria erro */
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

/* a resposta certa de um caso, já no vocabulário do detector */
