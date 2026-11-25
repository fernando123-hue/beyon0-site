/* ==========================================================================
   AS ESCOLHAS DELA PELOS CARTÕES DE EXTRAS (dono, 24/11; dinheiro transparente: nada muda no preço sem ela saber).
   O que ela incluiu ou tirou tocando nos cartões da conversa (api/_vendas/fluxo-extras.mjs) fica gravado JUNTO da estimativa, em
   detalhes.escolhas_cliente ({ chave: true incluído | false tirado }, a última escolha de cada chave). Quando o Zero estima de novo
   (agente.mjs, ferramenta estimar), o código aplica essas escolhas por cima do que o modelo pediu ANTES de calcular: o valor que ele
   escreve pelos marcadores e o cartão já saem com a escolha dela, e a escolha segue para a estimativa nova. Vale até ela tocar de novo.
   Só chaves da tabela ATIVA que se contratam (nem em preparo, nem fora do automático); o "requer" e os órfãos como em todo cálculo;
   quem calcula é sempre o motor (precos.mjs).
   ========================================================================== */
import { estimar } from './precos.mjs';
import { mesmoJson } from './json-igual.mjs';

const POR_PAGINA = /por p[áa]gina/i;
const MAX_ESCOLHAS = 40;
const semChave = (o, chave) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== chave));
const contrata = (tabela, k) => Object.hasOwn(tabela.adicionais || {}, k) && tabela.adicionais[k].em_preparo !== true && tabela.adicionais[k].fora_do_automatico !== true;

/* tira o extra cujo "requer" ficou sem base (nem o formato nem outro extra pedido); repete até assentar (dependente de dependente) */
export function semOrfaos(adicionais, formato, tabela) {
  let atual = adicionais, mexeu = true;
  while (mexeu) {
    mexeu = false;
    for (const k of Object.keys(atual)) {
      const req = tabela.adicionais[k]?.requer;
      if (req && !req.some(r => r === formato || atual[r] > 0)) { atual = semChave(atual, k); mexeu = true; }
    }
  }
  return atual;
}
/* os fatores com um extra a mais ou a menos. A quantidade do extra por página é o total de páginas do pacote (os textos do site inteiro,
   que é o que o nome promete); dos outros, 1. O motor ainda limita ao máximo da tabela */
export function comExtra(fatores, chave, incluir, tabela) {
  const ad = fatores.adicionais && typeof fatores.adicionais === 'object' && !Array.isArray(fatores.adicionais) ? fatores.adicionais : {};
  if (!incluir) return { ...fatores, adicionais: semOrfaos(semChave(ad, chave), fatores.formato, tabela) };
  const fmt = tabela.formatos[fatores.formato];
  const qtd = POR_PAGINA.test(tabela.adicionais[chave]?.nome || '') ? (fatores.paginas || fmt?.paginas_incluidas || 1) : 1;
  return { ...fatores, adicionais: { ...ad, [chave]: Math.max(Number(ad[chave]) || 0, qtd) } };
}

/* as escolhas gravadas numa estimativa (do banco: detalhes; no mesmo turno: a própria), já filtradas: só chave da tabela que se contrata e sim/não */
export function escolhasDe(estimativa, tabela) {
  const bruto = estimativa && (estimativa.detalhes ? estimativa.detalhes.escolhas_cliente : estimativa.escolhas_cliente);
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto) || !tabela) return {};
  return Object.fromEntries(Object.entries(bruto).filter(([k, v]) => typeof v === 'boolean' && contrata(tabela, k)).slice(0, MAX_ESCOLHAS));
}
export const comEscolha = (escolhas, chave, incluir) => ({ ...escolhas, [chave]: incluir });

/* o pedido do modelo com as escolhas dela por cima: incluída continua (se o formato dele a aceita), tirada fica fora. Só mexe no que é objeto;
   o resto (formato inválido, campos a mais) segue para o motor recusar como sempre */
export function aplicarEscolhas(entrada, escolhas, tabela) {
  const chaves = Object.keys(escolhas || {});
  if (!chaves.length || !entrada || typeof entrada !== 'object' || Array.isArray(entrada) || !Object.hasOwn(tabela.formatos || {}, entrada.formato)) return entrada;
  const ad = entrada.adicionais && typeof entrada.adicionais === 'object' && !Array.isArray(entrada.adicionais) ? entrada.adicionais : {};
  const juntos = chaves.reduce((f, k) => comExtra(f, k, escolhas[k], tabela), { ...entrada, adicionais: ad });
  return { ...juntos, adicionais: semOrfaos(juntos.adicionais, entrada.formato, tabela) };
}
/* a estimativa do motor com as escolhas que seguem com ela (sem escolhas, a MESMA estimativa) */
export const comEscolhasGravadas = (e, escolhas) => (Object.keys(escolhas || {}).length ? { ...e, escolhas_cliente: escolhas } : e);

/* (revisões do PR 237: técnica 1, segurança B1) um toque entrou ENQUANTO o Zero pensava: o turno calculou com as escolhas do começo dele. Antes de
   gravar, o servidor relê as de agora e, se mudaram, recalcula pelo motor com elas por cima. Sem mudança (o caso comum), a MESMA estimativa.
   Se o recálculo não fechar (não deveria: as escolhas já passaram pelo motor no toque), fica a do turno */
export function reaplicarEscolhas(e, antes, agora, tabela) {
  if (mesmoJson(antes, agora)) return e;
  const nova = estimar(aplicarEscolhas(e.fatores, agora, tabela), tabela);
  return nova.erros || nova.encaminhar_diagnostico ? e : comEscolhasGravadas(nova, agora);
}

/* para o modelo (ESTADO e resultado do estimar): os nomes da tabela do que ela incluiu e tirou, e a regra */
export const REGRA_ESCOLHAS = 'Ela escolheu estes extras tocando nos cartões da tela. Valem como ela escolheu: o sistema os mantém em toda estimativa, mesmo que você peça outra coisa. Se ela pedir por escrito para tirar ou pôr um deles, diga em uma frase que é só tocar no cartão do extra, logo abaixo do valor.';
export function escolhasParaOModelo(escolhas, tabela) {
  const nomes = v => Object.keys(escolhas || {}).filter(k => escolhas[k] === v).map(k => tabela.adicionais[k].nome);
  const incluidos = nomes(true), tirados = nomes(false);
  if (!incluidos.length && !tirados.length) return null;
  return { ...(incluidos.length ? { incluidos } : {}), ...(tirados.length ? { tirados } : {}), regra: REGRA_ESCOLHAS };
}
