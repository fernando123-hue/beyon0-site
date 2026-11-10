/* ==========================================================================
   A POLÍTICA (o "Harness"; estudo do JEV, seção 5.4). Função pura: recebe os
   sinais já conferidos e o que as regras de código (regex) já pegaram, devolve
   as ações e os motivos. Regra de ouro herdada do estudo do SBP, aplicada aqui:
   sinal de modelo só AUMENTA o cuidado, até estar calibrado.
     • o que as regras de código aplicam SEMPRE vale (a base);
     • o sinal do modelo só ACRESCENTA ação ou selo; nunca tira nada da base,
       nem quando discorda da regra ("o sinal nunca libera");
     • sem sinal (motor fora, prazo, teto, resposta incoerente), o resultado é
       exatamente a base: o caminho de hoje.
   Níveis por pergunta (desligado = 0): 0 só mede; 1 dá selo no painel;
   2 aplica a segunda rede. Subir de nível é decisão do dono, por PR.
   ========================================================================== */
import { perguntasDe } from './perguntas.mjs';

/* (modo sombra do JEV) estas versões são gravadas em app.jev_sombra.versoes: a checagem da migration 20261110120000_jev_sombra.sql
   (privado.jev_sombra_versoes_ok) só aceita minúsculas, números, ponto e hífen, até 20 caracteres. Versão nova fora disso: ajuste a checagem */
export const VERSAO_POLITICA = 'pol-1';
export const LIMIAR_PADRAO = 0.8;
export const NIVEL_MAXIMO = 2;

export const ACOES = Object.freeze({
  DESCONTO_FIXO: 'DESCONTO_FIXO',
  RECADO_FIXO: 'RECADO_FIXO',
  RESPOSTA_REGULADO: 'RESPOSTA_REGULADO',
  AVISO_REGULADO: 'AVISO_REGULADO',
  OPCAO_RECADO: 'OPCAO_RECADO',
  SELO_PROMETE_RESULTADO: 'SELO_PROMETE_RESULTADO',
  SELO_NEGA_IA: 'SELO_NEGA_IA',
  SELO_ORDENS: 'SELO_ORDENS'
});

/* nivel: o menor nível em que a ação sai. acao null = só medir (o sinal vai para o registro, nada muda).
   quando: 'sim' (p_sim ≥ limiar) ou { escolha: [...] } (escolha dentre estas, p ≥ limiar) */
export const POLITICA = Object.freeze([
  { tarefa: 'saida_do_zero', pergunta: 'promete_desconto', quando: 'sim', acao: ACOES.DESCONTO_FIXO, nivel: 2, base: 'regex' },
  { tarefa: 'saida_do_zero', pergunta: 'afirma_recado', quando: 'sim', acao: ACOES.RECADO_FIXO, nivel: 2, base: 'regex' },
  { tarefa: 'saida_do_zero', pergunta: 'oferece_proibido_saude', quando: 'sim', acao: ACOES.RESPOSTA_REGULADO, nivel: 2, base: 'regex' },
  { tarefa: 'saida_do_zero', pergunta: 'promete_resultado', quando: 'sim', acao: ACOES.SELO_PROMETE_RESULTADO, nivel: 1, base: null },
  { tarefa: 'saida_do_zero', pergunta: 'escreve_valor', quando: 'sim', acao: null, nivel: 0, base: null },
  { tarefa: 'saida_do_zero', pergunta: 'nega_ser_ia', quando: 'sim', acao: ACOES.SELO_NEGA_IA, nivel: 1, base: null },
  { tarefa: 'entrada_do_visitante', pergunta: 'nicho_saude', quando: { escolha: ['medicina', 'odontologia', 'psicologia', 'estetica'] }, acao: ACOES.AVISO_REGULADO, nivel: 2, base: 'regex' },
  { tarefa: 'entrada_do_visitante', pergunta: 'pede_pessoa', quando: 'sim', acao: ACOES.OPCAO_RECADO, nivel: 2, base: 'regex' },
  { tarefa: 'entrada_do_visitante', pergunta: 'tenta_dar_ordens', quando: 'sim', acao: ACOES.SELO_ORDENS, nivel: 1, base: null },
  { tarefa: 'entrada_do_visitante', pergunta: 'irritacao', quando: null, acao: null, nivel: 0, base: null },
  { tarefa: 'entrada_do_visitante', pergunta: 'momento', quando: null, acao: null, nivel: 0, base: null }
]);

/* o que a regra de código disse de cada pergunta: true, false, um rótulo (escolha) ou null (não olhou) */
const SAUDE_HUMANA = Object.freeze(['medicina', 'odontologia', 'psicologia', 'estetica']);
const regexDisse = (regra, codigo) => {
  const v = codigo?.[regra.pergunta];
  if (v === true) return true;
  /* escolha: só os ramos de saúde humana valem (veterinária, "nenhum" e "ambíguo" não travam, como no prompt) */
  return typeof v === 'string' && regra.quando?.escolha?.includes(v) === true && SAUDE_HUMANA.includes(v);
};

const sinalDispara = (regra, sinal, limiar) => {
  if (!sinal || regra.quando === null) return false;
  if (regra.quando === 'sim') return typeof sinal.p_sim === 'number' && sinal.p_sim >= limiar;
  return typeof sinal.escolha === 'string' && regra.quando.escolha.includes(sinal.escolha) && sinal.p >= limiar;
};

const nivelDe = (niveis, pergunta) => {
  const n = niveis?.[pergunta];
  return Number.isInteger(n) && n >= 0 && n <= NIVEL_MAXIMO ? n : 0;
};

/* decidir({ tarefa, sinais, sinaisDeCodigo, niveis, limiar }) → { acoes, motivos, versaoDaPolitica }
   `sinais` ausente ou nulo = sem sinal. Nunca lança; tarefa desconhecida = só a base (vazia) */
export function decidir({ tarefa, sinais = null, sinaisDeCodigo = {}, niveis = {}, limiar: limiarPedido } = {}) {
  /* limiar fora de 0 a 1 (nulo, texto, NaN) volta ao padrão: nunca um limiar que dispare com qualquer probabilidade */
  const limiar = typeof limiarPedido === 'number' && limiarPedido > 0 && limiarPedido <= 1 ? limiarPedido : LIMIAR_PADRAO;
  const regras = POLITICA.filter(r => r.tarefa === tarefa && perguntasDe(tarefa));
  const base = new Set();
  const extra = new Set();
  const motivos = [];
  for (const regra of regras) {
    const regex = regra.base === 'regex' && regra.acao && regexDisse(regra, sinaisDeCodigo);
    if (regex) base.add(regra.acao);
    const sinal = sinais?.[regra.pergunta];
    if (!sinal) { motivos.push({ pergunta: regra.pergunta, efeito: 'sem_sinal' }); continue; }
    const dispara = sinalDispara(regra, sinal, limiar);
    if (!dispara) {
      motivos.push({ pergunta: regra.pergunta, efeito: regex ? 'contra_regex_ignorado' : 'observado' });
      continue;
    }
    if (regra.acao && nivelDe(niveis, regra.pergunta) >= regra.nivel) {
      if (!regex) extra.add(regra.acao);
      motivos.push({ pergunta: regra.pergunta, efeito: regex ? 'confirma_regex' : 'acao' });
    } else {
      motivos.push({ pergunta: regra.pergunta, efeito: 'observado' });
    }
  }
  const acoes = [...new Set([...base, ...extra])].sort();
  return Object.freeze({ acoes: Object.freeze(acoes), motivos: Object.freeze(motivos.map(m => Object.freeze(m))), versaoDaPolitica: VERSAO_POLITICA });
}

/* o que SÓ as regras de código aplicariam: o piso que o resultado de decidir() nunca pode furar */
export const acoesDeCodigo = (tarefa, sinaisDeCodigo = {}) =>
  [...new Set(POLITICA.filter(r => r.tarefa === tarefa && r.base === 'regex' && r.acao && regexDisse(r, sinaisDeCodigo)).map(r => r.acao))].sort();
