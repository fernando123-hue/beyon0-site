/* ==========================================================================
   AS OPÇÕES PRONTAS (PR 3a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §4): a LISTA FECHADA do que a pessoa ajusta
   sem IA. Uma opção por chamada, com EXATAMENTE os campos da sua operação: o número do modelo, de 1 a 3 (cores e fontes),
   ou tipos de seção (mover, tirar, acrescentar). Nunca valor, campo nem texto livres (sem cor hex, tema, troca de texto,
   adicional nem páginas): por isso nenhuma opção pronta muda o preço. A mudança sai no formato que aplicar()
   (alteracoes.mjs) espera. O rótulo que a pessoa e o resumo leem é montado aqui, só com nomes da lista.
   ========================================================================== */
import { TIPOS_SECAO } from './direcao.mjs';
import { NOME_SECAO } from './escopo.mjs';

const CAMPOS = Object.freeze({
  usar_paleta_de: ['direcao'], usar_tipografia_de: ['direcao'],
  mover_antes_de: ['secao', 'referencia'], mover_depois_de: ['secao', 'referencia'],
  remover_secao: ['secao'], adicionar_secao: ['secao']
});
export const OPERACOES = Object.freeze(Object.keys(CAMPOS));
const MODELOS = 3;
const ehSecao = v => typeof v === 'string' && TIPOS_SECAO.includes(v);
const VAZIA = Object.freeze({ secao: '', referencia: '', campo: '', valor: '', direcao: 0, descricao: '' });

/* a mudança no formato de aplicar(), ou null. Só chaves PRÓPRIAS contam, e todas têm de ser da operação */
export function validarOpcao(opcao) {
  if (!opcao || typeof opcao !== 'object' || Array.isArray(opcao)) return null;
  const op = opcao.operacao;
  if (typeof op !== 'string' || !Object.hasOwn(CAMPOS, op)) return null;
  const permitidas = ['operacao', ...CAMPOS[op]];
  const chaves = Object.keys(opcao);
  if (chaves.length !== permitidas.length || !chaves.every(k => permitidas.includes(k))) return null;
  if (CAMPOS[op][0] === 'direcao') {
    if (!Number.isInteger(opcao.direcao) || opcao.direcao < 1 || opcao.direcao > MODELOS) return null;
    return { ...VAZIA, tipo: 'visual', operacao: op, direcao: opcao.direcao };
  }
  if (!ehSecao(opcao.secao)) return null;
  if (CAMPOS[op].includes('referencia')) {
    if (!ehSecao(opcao.referencia) || opcao.referencia === opcao.secao) return null;
    return { ...VAZIA, tipo: 'estrutura', operacao: op, secao: opcao.secao, referencia: opcao.referencia };
  }
  return { ...VAZIA, tipo: 'estrutura', operacao: op, secao: opcao.secao };
}

const nome = tipo => (Object.hasOwn(NOME_SECAO, tipo) ? NOME_SECAO[tipo] : 'seção');
const maiuscula = t => t.charAt(0).toUpperCase() + t.slice(1);
/* o que a lista de ajustes e o pedido gravado mostram (nunca texto do visitante) */
export function rotuloDaOpcao(m) {
  switch (m.operacao) {
    case 'usar_paleta_de': return 'Cores do modelo ' + m.direcao;
    case 'usar_tipografia_de': return 'Fontes do modelo ' + m.direcao;
    case 'mover_antes_de': return maiuscula(nome(m.secao)) + ' antes de ' + nome(m.referencia);
    case 'mover_depois_de': return maiuscula(nome(m.secao)) + ' depois de ' + nome(m.referencia);
    case 'remover_secao': return 'Sem a seção ' + nome(m.secao);
    case 'adicionar_secao': return 'Com a seção ' + nome(m.secao);
    default: return 'Ajuste';
  }
}

/* o motivo de aplicar() (texto interno) vira uma frase da tela, de uma tabela fixa */
const OUTRO = 'Esse ajuste não deu certo. Escolha outro.';
const RECUSAS = Object.freeze({
  'direção não encontrada': 'Esse modelo não está disponível para este ajuste.',
  'seção não existe nesta direção': 'Essa seção não existe no seu modelo.',
  'a abertura fica no topo': 'A abertura fica sempre no topo.',
  'seção não pode ser removida': 'Essa seção não pode sair.',
  'seção inválida ou já existe': 'Essa seção já está no seu modelo.'
});
export const fraseDaRecusa = motivo => (typeof motivo === 'string' && Object.hasOwn(RECUSAS, motivo) ? RECUSAS[motivo] : OUTRO);
export const fraseDoErro = erro => (erro === 'direção com poucas seções' ? 'O site precisa de pelo menos três seções.' : OUTRO);
