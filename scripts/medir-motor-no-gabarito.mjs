/* ==========================================================================
   F2 DO JEV: mede um MODELO no gabarito do classificador (docs/gabarito/classificador/*.json), com as MESMAS perguntas
   congeladas (api/_classificador/perguntas.mjs), o MESMO portão do texto (montarPedido: redigir, corte, marcadores) e a
   MESMA conferência (conferir) que o site usaria. Compara com a base de código (scripts/avaliar-codigo-no-gabarito.mjs).

     node scripts/com-chave.mjs --so ANTHROPIC_API_KEY node scripts/medir-motor-no-gabarito.mjs --modelo claude-haiku-5-5
     ... --modelo claude-sonnet-5-5 --teto 1.5 --limite 10 --erros

   --teto US$ (padrão 1,5): passou, para de mandar casos e mede só o que já voltou. --limite N: só os N primeiros casos de cada tarefa.
   Grava o resultado em docs/gabarito/classificador/medicoes/<modelo>-<data>.json (só ids, rótulos, probabilidades, tempo, custo;
   os textos já estão no gabarito). Nada aqui liga motor no site: é medição fora da linha.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { montarPedido, perguntasDe, VERSAO_PERGUNTAS } from '../api/_classificador/perguntas.mjs';
import { conferir } from '../api/_classificador/conferencia.mjs';
import { PRECO_POR_MILHAO } from '../api/_ia/config.mjs';
import { DETECTORES } from './detectores-do-gabarito.mjs';
import { chamarHaiku, INSTRUCOES } from '../api/_classificador/motor-haiku.mjs';

const TAREFAS = ['saida_do_zero', 'entrada_do_visitante'];
const SAUDE_HUMANA = new Set(['medicina', 'odontologia', 'psicologia', 'estetica']);
const PARALELO = 4;
const TETO_PADRAO_USD = 1.5;

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i > 0 ? process.argv[i + 1] : padrao; };
const MODELO = arg('modelo', '');
const TETO_USD = Number(arg('teto', TETO_PADRAO_USD));
const LIMITE = Number(arg('limite', 0)) || Infinity;
const ESFORCO = arg('esforco', 'low');
const MOSTRAR_ERROS = process.argv.includes('--erros');
const CONJUNTO = arg('conjunto', 'gabarito');   /* gabarito (ajuste) | separado (medida final, nunca para ajustar) */
const INSTRUCAO = arg('instrucao', 'v1');
const LIMIAR_SEGURANCA = Number(arg('limiar', 0.5));   /* p_sim a partir da qual uma pergunta de SEGURANÇA conta como sim (regra de ouro: sinal só aumenta o cuidado) */
if (!PRECO_POR_MILHAO[MODELO]) { console.error('uso: --modelo ' + Object.keys(PRECO_POR_MILHAO).join(' | ')); process.exit(2); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('sem ANTHROPIC_API_KEY: rode por scripts/com-chave.mjs --so ANTHROPIC_API_KEY'); process.exit(2); }

const lerGabarito = t => JSON.parse(readFileSync(new URL('../docs/gabarito/classificador/' + (CONJUNTO === 'separado' ? 'separado/' : '') + t + '.json', import.meta.url), 'utf8'));

/* ---------- o pedido ao modelo: num lugar só, api/_classificador/motor-haiku.mjs (o mesmo corpo que o modo sombra do site usa) ---------- */
if (!INSTRUCOES[INSTRUCAO]) { console.error('uso: --instrucao ' + Object.keys(INSTRUCOES).join(' | ')); process.exit(2); }
const cliente = new Anthropic();
const chamar = pedido => chamarHaiku(cliente, pedido, { modelo: MODELO, esforco: ESFORCO, instrucao: INSTRUCAO });

const preco = PRECO_POR_MILHAO[MODELO];
const custo = u => ((u?.input_tokens ?? 0) * preco.entrada + (u?.output_tokens ?? 0) * preco.saida) / 1e6;

/* ---------- a resposta do modelo no vocabulário do gabarito ---------- */
const DE_SEGURANCA = (tarefa, nome) => tarefa === 'saida_do_zero' || nome === 'tenta_dar_ordens';
function rotuloDe(p, sinal, tarefa, nome) {
  if (p.tipo === 'sim_ou_nao') return sinal.p_sim >= (DE_SEGURANCA(tarefa, nome) ? LIMIAR_SEGURANCA : 0.5) ? 'sim' : 'nao';
  if (p.tipo === 'nota') return String(sinal.nota);
  return sinal.escolha;
}
const certaDe = (g, caso, pergunta) => { const r = caso.certa[pergunta] ?? g.padrao[pergunta]; return r === undefined ? r : String(r); };   /* (a nota vem como número no gabarito; o rótulo é texto) */

/* ---------- roda ---------- */
let gasto = 0;
const resultados = [];
async function rodarCaso(tarefa, caso) {
  if (gasto >= TETO_USD) return { tarefa, id: caso.id, pulado: 'teto' };
  const { pedido } = montarPedido(tarefa, caso.texto);
  try {
    const r = await chamar(pedido);
    gasto += custo(r.usage);
    if (r.recusa) return { tarefa, id: caso.id, ms: r.ms, falha: 'recusa' };
    const conferida = conferir(tarefa, r.resposta);
    if (!conferida.ok) return { tarefa, id: caso.id, ms: r.ms, falha: 'incoerente: ' + conferida.motivo };
    return { tarefa, id: caso.id, ms: r.ms, sinais: conferida.sinais };
  } catch (e) {
    return { tarefa, id: caso.id, falha: 'erro ' + (e?.status ?? '') + ' ' + String(e?.message ?? '').slice(0, 80) };
  }
}

for (const tarefa of TAREFAS) {
  const g = lerGabarito(tarefa);
  const fila = g.casos.slice(0, LIMITE);
  for (let i = 0; i < fila.length; i += PARALELO) {
    resultados.push(...await Promise.all(fila.slice(i, i + PARALELO).map(c => rodarCaso(tarefa, c))));
  }
}

/* ---------- conta ---------- */
const linhas = [];
const erros = [];
for (const tarefa of TAREFAS) {
  const g = lerGabarito(tarefa);
  const perguntas = perguntasDe(tarefa);
  const porId = new Map(resultados.filter(r => r.tarefa === tarefa).map(r => [r.id, r]));
  for (const [nome, p] of Object.entries(perguntas)) {
    let n = 0, ok = 0, falsoSim = 0, falsoNao = 0, semResposta = 0, perto = 0, combOk = 0, combFalsoNao = 0;
    /* código + modelo (regra de ouro): em sim ou não com detector de código, basta um dos dois marcar 'sim' */
    const detector = p.tipo === 'sim_ou_nao' ? DETECTORES[tarefa]?.[nome] : null;
    for (const caso of g.casos) {
      const certa = certaDe(g, caso, nome);
      if (certa === undefined) continue;
      const r = porId.get(caso.id);
      if (!r) continue;
      n++;
      if (!r.sinais) { semResposta++; continue; }
      const obteve = rotuloDe(p, r.sinais[nome], tarefa, nome);
      if (detector) { const comb = obteve === 'sim' || detector(caso.texto) === 'sim' ? 'sim' : 'nao'; if (comb === certa) combOk++; else if (comb === 'nao') combFalsoNao++; }
      const igual = nome === 'nicho_saude' ? SAUDE_HUMANA.has(obteve) === SAUDE_HUMANA.has(certa) : obteve === certa;
      if (igual) { ok++; continue; }
      if (p.tipo === 'nota' && Math.abs(Number(obteve) - Number(certa)) <= 1) perto++;
      if (p.tipo === 'sim_ou_nao') { if (obteve === 'sim') falsoSim++; else falsoNao++; }
      erros.push({ tarefa, pergunta: nome, id: caso.id, certa, obteve, incerto: !!caso.incerto, texto: caso.texto });
    }
    linhas.push({ tarefa, pergunta: nome, n, ok, falsoSim, falsoNao, semResposta, perto, tipo: p.tipo, combinado: detector ? { ok: combOk, falsoNao: combFalsoNao } : null });
  }
}

const tempos = resultados.filter(r => r.ms).map(r => r.ms).sort((a, b) => a - b);
const pctl = q => (tempos.length ? tempos[Math.min(tempos.length - 1, Math.floor(q * tempos.length))] : 0);
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '-');

console.log(`\nModelo ${MODELO} (esforço ${ESFORCO}, instrução ${INSTRUCAO}, limiar ${LIMIAR_SEGURANCA}, conjunto ${CONJUNTO}) · casos ${resultados.length} · falhas ${resultados.filter(r => r.falha).length} · pulados ${resultados.filter(r => r.pulado).length}`);
console.log(`Custo US$ ${gasto.toFixed(4)} · tempo mediana ${pctl(0.5)} ms · p90 ${pctl(0.9)} ms\n`);
console.log('| tarefa | pergunta | casos | acertos | falso "sim" | falso "não" | sem resposta | nota a 1 de distância | código+modelo: acertos | código+modelo: falso "não" |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const l of linhas) console.log(`| ${l.tarefa} | ${l.pergunta} | ${l.n} | ${l.ok} (${pct(l.ok, l.n)}) | ${l.tipo === 'sim_ou_nao' ? l.falsoSim : '-'} | ${l.tipo === 'sim_ou_nao' ? l.falsoNao : '-'} | ${l.semResposta} | ${l.tipo === 'nota' ? l.perto : '-'} | ${l.combinado ? l.combinado.ok + ' (' + pct(l.combinado.ok, l.n) + ')' : '-'} | ${l.combinado ? l.combinado.falsoNao : '-'} |`);
const falhas = resultados.filter(r => r.falha);
if (falhas.length) { console.log('\nFalhas:'); for (const f of falhas) console.log(`- ${f.id}: ${f.falha}`); }
if (MOSTRAR_ERROS) { console.log('\nCasos errados:'); for (const e of erros) console.log(`- ${e.id} [${e.pergunta}] certo=${e.certa} modelo=${e.obteve}${e.incerto ? ' (incerto)' : ''}: ${e.texto}`); }

const data = new Date().toISOString().slice(0, 10);
const pasta = new URL('../docs/gabarito/classificador/medicoes/', import.meta.url);
mkdirSync(pasta, { recursive: true });
const destino = new URL(`${MODELO}-${ESFORCO}-${INSTRUCAO}-${CONJUNTO}-${data}.json`, pasta);
writeFileSync(destino, JSON.stringify({
  modelo: MODELO, esforco: ESFORCO, instrucao: INSTRUCAO, conjunto: CONJUNTO, limiar_seguranca: LIMIAR_SEGURANCA, data, versoes: VERSAO_PERGUNTAS, custo_usd: Number(gasto.toFixed(4)),
  tempo_ms: { mediana: pctl(0.5), p90: pctl(0.9) }, linhas,
  erros: erros.map(({ texto, ...e }) => e),
  falhas: falhas.map(({ id, falha }) => ({ id, falha })),
  sinais: resultados.filter(r => r.sinais).map(({ tarefa, id, sinais }) => ({ tarefa, id, sinais }))
}, null, 2) + '\n');
console.log('\nGravado em ' + decodeURIComponent(destino.pathname).replace(/^\/([A-Z]:)/, '$1'));
