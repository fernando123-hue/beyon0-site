/* ==========================================================================
   PEDIDO ABANDONADO NO MODO API (dono, 15/11; revisão de segurança do PR #173, A1).
   No modo api ninguém gera as direções sozinho: quem pede os modelos e fecha a aba (comum no celular), ou quem tem uma
   direção recusada pelo teto de custo, deixa o pedido com direção "gerando" e o pedido segue em privado.pedido_na_fila
   (confirmado e não concluído; o dono não vai produzir nada). Dez assim e o formulário some para todo mundo, de graça
   para quem faz isso. Esta varredura usa só funções do banco que já existem (sem migration):
     1. a fila do painel (vendas_fila_direcoes) diz, de cada pedido na fila, quando a última geração nasceu (pedido_em)
        e o estado de cada direção;
     2. direção ainda "gerando" meia hora depois de nascer não vai mais terminar (a mais longa leva ~6 min): vira
        "falhou" (vendas_concluir_direcao). Com as três falhas a conversa volta a "contato" e o gatilho do banco tira o
        pedido da fila; com alguma pronta, vendas_marcar_avisado o tira (as prontas ficam entregues);
     3. quem voltar encontra "Gerar de novo" (a 2ª geração, TETOS.geracoes_por_conversa) ou as prontas.
   Só vale no modo api: na fila manual a direção "gerando" é trabalho do dono, que leva até 24 horas úteis.
   NÃO soma custo (a varredura não tem o visitante): o gasto da chamada cortada já está em app.ia_chamadas desde a
   reivindicação da direção (fluxo.mjs, registrarProvisorio), então o teto do dia o enxerga sem a varredura.
   Limite conhecido (N2 da revisão de segurança): a idade vem de pedido_em (o nascimento da geração), não da reivindicação
   (vendas_fila_direcoes não expõe iniciada_em, e expor é migration). Quem volta aos 29 min e gera uma direção que leva 6
   min pode ter a direção fechada pela varredura no meio; quem gera recebe "falhou" (fluxo.mjs lê o retorno de
   vendas_concluir_direcao) e refaz pela 2ª geração.
   ========================================================================== */
import { ORG } from './org.mjs';

export const ABANDONADA_APOS_MS = 30 * 60 * 1000;   /* a direção mais longa (regulado, 2 chamadas) leva ~6 min: meia hora é folga */
export const MAX_PEDIDOS_POR_VARREDURA = 5;         /* (4 subpedidos por pedido: cabe no orçamento de 50 da Cloudflare grátis) */
const ENTRE_VARREDURAS_MS = 60 * 1000;               /* quem abre a página com a fila cheia varre no máximo 1 vez por minuto por isolate */
const MOTIVO = 'geração abandonada (a página foi fechada antes de terminar)';

export async function soltarAbandonadas({ banco, agora = Date.now(), limiteMs = ABANDONADA_APOS_MS, max = MAX_PEDIDOS_POR_VARREDURA }) {
  const fila = await banco('vendas_fila_direcoes', { org_slug: ORG });
  const velhos = (fila && Array.isArray(fila.itens) ? fila.itens : []).filter((it) => {
    const dirs = Array.isArray(it.direcoes) ? it.direcoes : [];
    const nasceu = Date.parse(it.pedido_em);
    return dirs.some((d) => d.status === 'gerando') && Number.isFinite(nasceu) && agora - nasceu >= limiteMs;
  }).slice(0, max);
  let liberados = 0;
  for (const it of velhos) {
    /* (N3) um pedido que falha (deadlock, por exemplo) não trava os outros: registra e segue; ele volta na próxima varredura */
    try {
      for (const d of it.direcoes.filter((x) => x.status === 'gerando')) await banco('vendas_concluir_direcao', { direcao_id: d.id, erro: MOTIVO });
      if (it.direcoes.some((d) => d.status === 'pronta')) await banco('vendas_marcar_avisado', { conversa_id: it.conversa_id, org_slug: ORG });
      liberados++;
    } catch (x) {
      console.error(JSON.stringify({ origem: 'vendas', nivel: 'aviso', evento: 'varredura de abandonados: um pedido falhou', codigo: (x && x.codigo) || 'interno' }));
    }
  }
  return { examinados: velhos.length, liberados };
}

let proximaEm = 0;
export const reiniciarVarredura = () => { proximaEm = 0; };
/* a mesma varredura, no máximo 1 vez por minuto (a página com a fila cheia é aberta o tempo todo; sem isto cada abertura listaria a fila) */
export async function soltarAbandonadasComFreio(args, agora = Date.now()) {
  if (agora < proximaEm) return { examinados: 0, liberados: 0 };
  proximaEm = agora + ENTRE_VARREDURAS_MS;
  return soltarAbandonadas({ ...args, agora });
}
