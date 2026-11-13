/* ==========================================================================
   AS RESPOSTAS TOCADAS QUE CHEGAM JUNTO DA MENSAGEM (spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md, seção 6.1).
   Diferente do validarRespostas do formulário (api/_classificador/contrato.mjs), aqui NADA vira padrão: só entra o que a
   pessoa tocou. Esquema fechado: campo desconhecido (inclusive a cidade, que vem pela conversa) é recusado, e o erro nunca
   repete o valor recebido. O único texto livre é o "Outro" do ramo (60 caracteres): limpo, redigido e, com cara de ordem
   ao sistema, descartado (vai só ao briefing, nunca como mensagem).
   ========================================================================== */
import R from '../../js/orcamento-rotulos.js';
import { textoLimpo } from '../_classificador/contrato.mjs';
import { redigir, pareceInjecao, semInvisiveis } from './seguranca.mjs';

const CAMPOS = new Set(['ramo', 'outro', 'objetivos', 'site_atual', 'material', 'situacao', 'responde']);
const RESPONDE = new Set(['dor']);
const OUTRO_MAX = 60, SITUACAO_MAX = 6;
const ERRO = 'Resposta fora da lista.';

const temChave = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const codigoDe = (lista, v) => (typeof v === 'string' && temChave(lista, v) ? v : null);
const listaDe = (lista, v, max) => {
  if (!Array.isArray(v) || v.length > max) return null;
  const unicos = [...new Set(v)];
  return unicos.every(c => codigoDe(lista, c)) ? unicos : null;
};

/* o "Outro": invisíveis fora, texto limpo (sem controles nem < >), contato redigido, corte; vazio ou com cara de injeção some */
function outroLimpo(v) {
  if (typeof v !== 'string') return { valor: undefined };
  const t = redigir(textoLimpo(semInvisiveis(v))).replace(/\s+/g, ' ').trim().slice(0, OUTRO_MAX).trim();
  if (!t) return { valor: undefined };
  return pareceInjecao(t) ? { valor: undefined, injecao: true } : { valor: t };
}

/* bruto -> { dados } | { erro }; com o "Outro" descartado por injeção, { dados, injecao: true } (quem chama registra o evento) */
export function respostasParciais(bruto) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { erro: ERRO };
  const chaves = Object.keys(bruto);
  if (chaves.some(k => !CAMPOS.has(k))) return { erro: ERRO };
  const dados = {};
  let injecao = false;
  for (const k of chaves) {
    const v = bruto[k];
    if (v === undefined || v === null) continue;
    if (k === 'ramo' || k === 'site_atual' || k === 'material') {
      const lista = k === 'ramo' ? R.RAMOS : k === 'site_atual' ? R.SITE_ATUAL : R.MATERIAL;
      const c = codigoDe(lista, v);
      if (!c) return { erro: ERRO };
      dados[k] = c;
    } else if (k === 'objetivos' || k === 'situacao') {
      const l = k === 'objetivos' ? listaDe(R.OBJETIVOS, v, Object.keys(R.OBJETIVOS).length) : listaDe(R.SUGESTOES, v, SITUACAO_MAX);
      if (!l) return { erro: ERRO };
      if (l.length) dados[k] = l;
    } else if (k === 'responde') {
      if (!RESPONDE.has(v)) return { erro: ERRO };
      dados.responde = v;
    } else if (k === 'outro') {
      const o = outroLimpo(v);
      if (o.injecao) injecao = true;
      if (o.valor) dados.outro = o.valor;
    }
  }
  return injecao ? { dados, injecao } : { dados };
}

/* os códigos tocados no passo 4 -> os dois campos de situacao_atual, na ordem em que vieram (null se nenhum) */
export function situacaoDeCodigos(codigos) {
  const campos = {};
  for (const c of codigos || []) {
    const s = temChave(R.SUGESTOES, c) ? R.SUGESTOES[c] : null;
    if (s) campos[s.campo] = campos[s.campo] ? campos[s.campo] + '; ' + s.rotulo : s.rotulo;
  }
  return Object.keys(campos).length ? campos : null;
}

/* a mensagem do "Mudar" só vale se for exatamente a fala montada a partir das próprias respostas */
export const ehFalaDoMudar = (texto, respostas) => {
  const fala = R.falaDoMudar(respostas);
  return !!fala && texto === fala;
};
export const MOLDE_MUDAR = R.MOLDE_MUDAR;
