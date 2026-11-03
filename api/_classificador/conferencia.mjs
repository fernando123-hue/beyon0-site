/* ==========================================================================
   A CONFERÊNCIA (estudo do JEV, seção 5.2): confere a resposta de QUALQUER
   motor antes de virar sinal. Escrita do zero para o nosso contrato; a ideia
   (resposta incoerente é falha, nunca sinal) vem do estudo do SBP.
   Cada pergunta feita deve ter resposta; pergunta que ninguém fez é descartada;
   os rótulos são os NOSSOS; cada probabilidade está entre 0 e 1 e a soma por
   pergunta é 1 (tolerância pequena); resposta incoerente derruba o pedido
   inteiro. Devolve só números e rótulos nossos: nunca texto do motor.
   ========================================================================== */
import { perguntasDe } from './perguntas.mjs';

export const TOLERANCIA_DA_SOMA = 0.02;

const numeroValido = p => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;

/* resposta de um motor: { [pergunta]: { [rotulo]: probabilidade } } */
export function conferir(tarefa, resposta) {
  const perguntas = perguntasDe(tarefa);
  if (!perguntas) return { ok: false, motivo: 'tarefa desconhecida' };
  if (resposta === null || typeof resposta !== 'object' || Array.isArray(resposta)) return { ok: false, motivo: 'resposta não é um objeto' };
  const sinais = {};
  for (const [nome, pergunta] of Object.entries(perguntas)) {
    const dado = resposta[nome];
    if (dado === null || typeof dado !== 'object' || Array.isArray(dado)) return { ok: false, motivo: nome + ': sem resposta' };
    const chaves = Object.keys(dado);
    if (chaves.length !== pergunta.rotulos.length || chaves.some(k => !pergunta.rotulos.includes(k))) return { ok: false, motivo: nome + ': rótulos fora do combinado' };
    if (!chaves.every(k => numeroValido(dado[k]))) return { ok: false, motivo: nome + ': probabilidade inválida' };
    const soma = chaves.reduce((s, k) => s + dado[k], 0);
    if (Math.abs(soma - 1) > TOLERANCIA_DA_SOMA) return { ok: false, motivo: nome + ': probabilidades não somam 1' };
    sinais[nome] = resumo(pergunta, dado);
  }
  return { ok: true, sinais };
}

/* o que se guarda: o rótulo mais provável e a probabilidade dele; no sim ou não, a probabilidade do sim */
function resumo(pergunta, dado) {
  if (pergunta.tipo === 'sim_ou_nao') return { p_sim: dado.sim };
  const [rotulo, p] = pergunta.rotulos.map(k => [k, dado[k]]).reduce((a, b) => (b[1] > a[1] ? b : a));
  return pergunta.tipo === 'nota' ? { nota: Number(rotulo), p } : { escolha: rotulo, p };
}
