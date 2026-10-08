/* ==========================================================================
   O AGENTE DE VENDAS — um turno de conversa (Fase 2, etapas 4 e 5).
   Fluxo de um turno: a mensagem do visitante (já limpa e com dado pessoal
   redigido) + o briefing atual + as últimas mensagens → o modelo de conversa
   (Haiku 5.5, esforço médio; modo econômico) com 5 ferramentas → o código executa as
   ferramentas (briefing, motor de preço, pedir contato, sugestão de IA,
   diagnóstico) → a resposta final, sem valor em dinheiro no texto.
   O que o modelo NÃO tem: ferramenta de preço livre, desconto, dados de
   outro cliente, pagamento ou qualquer ação administrativa. O valor da
   estimativa nem chega a ele: só o prazo e os itens. Quem mostra o preço é
   o cartão da tela, calculado pelo motor (api/_vendas/precos.mjs).
   Pontos de integração do "cérebro" futuro (conhecimento da empresa,
   objeções, histórico): CEREBRO abaixo — hoje vazio, de propósito.
   ========================================================================== */
import { limparAtualizacao, limparTexto, mesclar, avaliar, prontoParaEstimar } from './briefing.mjs';
import { IDENTIDADE, montarSistema, ferramentas, proximoPasso } from './consultor.mjs';
import { modoDirecoes } from '../_ia/config.mjs';
import { estimar } from './precos.mjs';
import { redigir, semPrecoNoTexto } from './seguranca.mjs';
import { ErroIA } from '../_ia/provedor.mjs';

const MAX_ITERACOES = 4;
const HISTORICO = 12;   // mensagens anteriores enviadas ao modelo (o briefing carrega o resto)

/* pontos de integração futuros (spec: "prepare interfaces, não implemente o cérebro") */
export const CEREBRO = {
  conhecimento: async () => [],      // fatos da empresa, cases aprovados
  objecoes: async () => [],          // respostas aprovadas a objeções comuns
  historico: async () => null        // resultados de conversas parecidas
};

/* as instruções, as ferramentas e o próximo passo: o HARNESS em ./consultor.mjs. SISTEMA = a identidade que abre as
   instruções (os testes conferem que ela não vaza na resposta) */
export const SISTEMA = IDENTIDADE;
export { ferramentas };

/* o estado que o modelo vê a cada turno (canal do operador; não é texto do visitante) */
function estadoParaModelo({ briefing, estimativa, etapa }) {
  const { confianca, faltam } = avaliar(briefing);
  return 'ESTADO ATUAL (sistema, não é mensagem do visitante)\n' + JSON.stringify({
    etapa, proximo_passo: proximoPasso({ etapa, briefing, estimativa }), briefing, confianca, ainda_falta: faltam.slice(0, 4),
    estimativa_mostrada: estimativa ? { prazo_dias: estimativa.prazo_dias, fase: estimativa.fase, itens: (estimativa.itens || []).map(i => i.nome) } : null
  });
}

/* um turno completo. ia: a interface de _ia/provedor.mjs */
export async function executarTurno({ ia, regras, conversa, mensagem }) {
  let briefing = conversa.briefing || {};
  let estimativa = null, pedirContato = false, diagnostico = null;
  const sugestoes = [];
  let custo = 0;
  const historico = (conversa.mensagens || []).slice(-HISTORICO).map(m => ({ role: m.papel === 'visitante' ? 'user' : 'assistant', content: redigir(m.conteudo) }));
  const mensagens = [...historico, { role: 'user', content: redigir(mensagem) }];
  /* o estado vai num 2º bloco do prompt de sistema (sem cache), não como mensagem: a API só aceita user/assistant em messages */
  const contexto = estadoParaModelo({ briefing, estimativa: conversa.estimativa, etapa: conversa.etapa });
  const tools = ferramentas(regras);
  const sistema = montarSistema(regras, { direcoes: modoDirecoes() });
  let texto = '';

  for (let i = 0; i < MAX_ITERACOES; i++) {
    /* (falha numa rodada: o erro leva o custo das rodadas anteriores, que já foram pagas) */
    const r = await ia.mensagem({ papel: 'conversa', sistema, contexto, mensagens, ferramentas: tools })
      .catch(e => { if (e && typeof e === 'object') e.custo_usd = (e.custo_usd || 0) + custo; throw e; });
    custo += r.custo_usd || 0;
    if (r.parada === 'recusa') throw new ErroIA('recusa', 'o modelo recusou', custo);
    texto = r.texto || texto;
    if (r.parada !== 'ferramenta' || !r.chamadas.length) break;
    mensagens.push({ role: 'assistant', content: r.conteudo });
    const resultados = [];
    for (const ch of r.chamadas) {
      let saida;
      if (ch.nome === 'atualizar_briefing') {
        briefing = mesclar(briefing, limparAtualizacao(ch.entrada));
        saida = { ok: true, ...avaliar(briefing) };
      } else if (ch.nome === 'estimar') {
        const e = estimar(ch.entrada, regras);
        if (e.erros) saida = { ok: false, erros: e.erros };
        else if (e.encaminhar_diagnostico) { diagnostico = e.motivo; saida = { ok: true, encaminhar_diagnostico: true, motivo: e.motivo, itens: e.itens_diagnostico }; }
        else { estimativa = e; briefing = mesclar(briefing, { projeto: { formato: e.fatores.formato } }); saida = { ok: true, prazo_dias: e.prazo_dias, fase: e.fase, itens: e.itens.map(x => x.nome), fase_seguinte: e.fase_seguinte ? e.fase_seguinte.itens.map(x => x.nome) : null, valor: 'mostrado no cartão para a pessoa' }; }
      } else if (ch.nome === 'pedir_contato') {
        pedirContato = !!(estimativa || conversa.estimativa);
        saida = pedirContato ? { ok: true } : { ok: false, motivo: 'peça a estimativa antes' };
      } else if (ch.nome === 'sugerir_solucao_ia') {
        const ideia = limparTexto(ch.entrada?.ideia, 160) || '', motivo = limparTexto(ch.entrada?.motivo, 300) || '';   /* (vai ao briefing e ao gerador: limpo como o resto) */
        if (ideia) sugestoes.push({ ideia, motivo });
        saida = { ok: true };
      } else if (ch.nome === 'encaminhar_diagnostico') {
        diagnostico = limparTexto(ch.entrada?.motivo, 200) || 'pedido';
        saida = { ok: true };
      } else {
        saida = { ok: false, motivo: 'ferramenta inexistente' };
      }
      resultados.push({ type: 'tool_result', tool_use_id: ch.id, content: JSON.stringify(saida), ...(saida.ok === false ? { is_error: true } : {}) });
    }
    mensagens.push({ role: 'user', content: resultados });
  }

  if (sugestoes.length) briefing = mesclar(briefing, { oportunidades_ia: sugestoes.map(s => s.ideia) });
  const resposta = semPrecoNoTexto(texto).trim() || 'Pode me contar um pouco mais sobre o seu negócio?';
  const { confianca, faltam } = avaliar(briefing);
  return { resposta: resposta.slice(0, 1500), briefing, confianca, faltam, estimativa, pedir_contato: pedirContato, diagnostico, sugestoes_ia: sugestoes, custo_usd: custo, pronto_estimar: prontoParaEstimar(briefing) };
}
