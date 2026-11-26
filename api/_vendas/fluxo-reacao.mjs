/* ==========================================================================
   A ação `reagir` (mapa vivo v2, fase 1b; a regra e a conferência em reacao.mjs). Ordem do caminho, da mais barata à mais cara:
   interruptor → sessão (401) → conversa dela, aberta (404/409) → texto (curto ou com cara de ordem = não chama) → freios (visitante,
   IP, 12 por conversa) → teto do dia → Haiku → conferência. Tudo o que não é erro de quem chama volta como "sem reação" (200, reacao: null):
   a tela fica a da fase 1a, sem mensagem de erro. Nada do texto vai ao banco ou ao log: o registro do custo (app.ia_chamadas, com o papel
   'extracao', que o banco aceita) e a soma no custo da conversa saem em segundo plano, fora do caminho da resposta.
   Limite conhecido: os freios e o teto de US$ 1 são por isolado do Worker (como os freios de simular/confirmar); o custo entra no custo da
   conversa e no registro do dia, então o teto do Zero (TETOS em fluxo.mjs) continua enxergando tudo.
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ehUuid } from '../_valida-app.mjs';
import { criarFreio, ipDe } from '../_freio.mjs';
import { criarGastoLocal } from '../_classificador/sombra.mjs';
import { ErroIA } from '../_ia/provedor.mjs';
import { reacaoLigada, LIMITES_REACAO, textoParaReacao, montarPedidoReacao, conferirReacao } from './reacao.mjs';

const exigir = (cond, status, msg) => { if (!cond) throw new Recusa(status, msg); };
const DIA_MS = 24 * 60 * 60e3;
const HOJE_EM_BRASILIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
const hojeEmBrasilia = () => HOJE_EM_BRASILIA.format(new Date());

/* por isolado, no módulo: o fluxo é criado a cada pedido (vendas.mjs) e um freio dentro dele zeraria sempre */
export const criarFreiosDaReacao = () => ({
  visitante: criarFreio(LIMITES_REACAO.freio_visitante),
  ip: criarFreio(LIMITES_REACAO.freio_ip),
  conversa: criarFreio({ max: LIMITES_REACAO.por_conversa, janelaMs: DIA_MS })
});
const FREIOS = criarFreiosDaReacao();
const GASTO = criarGastoLocal();
const logPadrao = dados => console.error(JSON.stringify({ origem: 'reacao', ...dados }));

export function criarAcoesDaReacao({ ia, env, visitante, donoDaConversa, etapas, gravarChamadas, somarCusto, segundoPlano, requestId = null,
  freios = FREIOS, gasto = GASTO, hoje = hojeEmBrasilia, log = logPadrao }) {
  const sem = (seq, motivo) => ({ reacao: null, seq, motivo });
  /* o registro e o custo, sem segurar a resposta; falhar aqui só vira log (o gasto local já contou) */
  const registrar = (conversaId, vid, custo) => segundoPlano(Promise.resolve()
    .then(() => Promise.all([gravarChamadas(conversaId, vid), somarCusto(conversaId, vid, custo)]))
    .catch(e => log({ nivel: 'aviso', evento: 'registro da reação não gravado', request_id: requestId, codigo: (e && e.codigo) || 'interno' })));

  async function reagir({ request, corpo }) {
    const seq = Number.isSafeInteger(corpo?.seq) && corpo.seq >= 0 ? corpo.seq : null;
    exigir(seq !== null, 400, 'Pedido inválido.');
    if (!reacaoLigada(env) || !ia) return sem(seq, 'desligada');
    const vid = await visitante(request);
    exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
    await donoDaConversa(vid, corpo.conversa_id, etapas);
    const texto = textoParaReacao(corpo?.texto);
    if (!texto) return sem(seq, 'trava');
    if (freios.visitante(vid) || freios.ip(request ? ipDe(request) : 'sem-ip') || freios.conversa(corpo.conversa_id)) return sem(seq, 'limite');
    if (gasto.de(hoje()) >= LIMITES_REACAO.dia_usd) return sem(seq, 'teto');
    const t0 = Date.now();
    let r;
    try { r = await ia.mensagem(montarPedidoReacao(texto)); }
    catch (e) {
      const custo = (e && e.custo_usd) || 0;
      gasto.somar(hoje(), custo);
      registrar(corpo.conversa_id, vid, custo);
      log({ nivel: 'aviso', evento: 'reação', motivo: 'prazo', ms: Date.now() - t0, seq, erro: e instanceof ErroIA ? e.motivo : 'interno', request_id: requestId });
      return sem(seq, 'prazo');
    }
    const custo = r.custo_usd || 0;
    gasto.somar(hoje(), custo);
    registrar(corpo.conversa_id, vid, custo);
    const c = conferirReacao(r.json, texto);
    log({ nivel: 'info', evento: 'reação', motivo: c.motivo, ms: Date.now() - t0, custo_usd: custo, seq, request_id: requestId });
    return c.anotacao ? { reacao: { anotacao: c.anotacao }, seq, motivo: 'ok' } : sem(seq, c.motivo);
  }
  return { reagir };
}
