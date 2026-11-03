/* ==========================================================================
   O classificador, em duas portas (estudo do JEV, 03/11/2026):
   • classificar(tarefa, entrada): o que o orçamento já usa (recomendar_pacote,
     triar_pedido). SEMPRE as regras, por tabela. Quem escolhe o formato do site
     é o motor de regras e o motor de preços: nenhum modelo, nem o JEV, escolhe
     formato, preço, desconto ou adicional (o caminho antigo que deixava o JEV
     devolver o formato saiu; era contra a regra de ouro "sinal só aumenta o cuidado").
   • sinalizar(tarefa, texto, opcoes): perguntas fechadas sobre um texto, para
     MEDIR e, se o dono subir o nível, ACRESCENTAR cuidado (politica.mjs). Sem
     motor, motor fora, prazo estourado, disjuntor aberto ou resposta incoerente:
     "sem sinal" e o resultado é o de hoje. Nenhuma função do site depende disto.
   O motor é qualquer objeto { nome, chamar(pedido) } que devolve probabilidades
   por pergunta; hoje não há motor real ligado (a fase 2 mede Haiku, Clef-flash
   e Jev antes de escolher).
   ========================================================================== */
import { TAREFAS } from './contrato.mjs';
import { regras } from './regras.mjs';
import { montarPedido, VERSAO_PERGUNTAS, VERSAO_PROTECAO } from './perguntas.mjs';
import { conferir } from './conferencia.mjs';
import { decidir, VERSAO_POLITICA } from './politica.mjs';

export const PRAZO_EM_LINHA_MS = 800;
export const configClassificador = () => ({ prazoMs: PRAZO_EM_LINHA_MS });

const comPrazo = (p, ms) => new Promise((ok, falha) => { const t = setTimeout(() => falha(new Error('prazo')), ms); Promise.resolve(p).then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); falha(e); }); });

/* ---------- as regras (orçamento) ---------- */
export async function classificar(tarefa, entrada, { adaptadores = {} } = {}) {
  if (!TAREFAS.includes(tarefa)) throw new Error('tarefa desconhecida: ' + tarefa);
  return ({ regras, ...adaptadores }).regras(tarefa, entrada);
}

/* ---------- o disjuntor: 3 falhas seguidas param o classificador por 10 minutos ---------- */
export function criarDisjuntor({ falhas = 3, paraMs = 10 * 60 * 1000, agora = Date.now } = {}) {
  let seguidas = 0, abertoAte = 0;
  return {
    aberto: () => agora() < abertoAte,
    falhou() { seguidas += 1; if (seguidas >= falhas) { abertoAte = agora() + paraMs; seguidas = 0; } },
    deuCerto() { seguidas = 0; }
  };
}

/* sinalizar(tarefa, texto, { motor, sinaisDeCodigo, niveis, limiar, prazoMs, disjuntor })
   → { disponivel: true, sinais, decisao, fonte, versoes, cortado, mascarados }
   ou { disponivel: false, motivo, decisao, cortado, mascarados }: a decisão sem sinal é exatamente a base de código */
export async function sinalizar(tarefa, texto, { motor = null, sinaisDeCodigo = {}, niveis = {}, limiar, prazoMs = PRAZO_EM_LINHA_MS, disjuntor = null } = {}) {
  const { pedido, cortado, mascarados } = montarPedido(tarefa, texto);
  const semSinal = motivo => ({ disponivel: false, motivo, decisao: decidir({ tarefa, sinais: null, sinaisDeCodigo, niveis, limiar }), cortado, mascarados });
  if (typeof motor?.chamar !== 'function') return semSinal('sem motor');
  if (disjuntor?.aberto()) return semSinal('disjuntor aberto');
  let resposta;
  try {
    resposta = await comPrazo(motor.chamar(pedido), prazoMs);
  } catch (e) {
    disjuntor?.falhou();
    return semSinal(e?.message === 'prazo' ? 'prazo' : 'motor falhou');
  }
  const conferida = conferir(tarefa, resposta);
  if (!conferida.ok) { disjuntor?.falhou(); return semSinal('resposta incoerente'); }
  disjuntor?.deuCerto();
  return {
    disponivel: true,
    sinais: conferida.sinais,
    decisao: decidir({ tarefa, sinais: conferida.sinais, sinaisDeCodigo, niveis, limiar }),
    fonte: String(motor.nome ?? 'motor').slice(0, 40),
    versoes: { perguntas: VERSAO_PERGUNTAS[tarefa], protecao: VERSAO_PROTECAO, politica: VERSAO_POLITICA },
    cortado,
    mascarados
  };
}
