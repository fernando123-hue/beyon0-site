/* ==========================================================================
   O CONTRATO DO CLASSIFICADOR (spec docs/specs/2026-10-11-orcamento-sem-ia.md §8).
   O resto do sistema fala com "um classificador", nunca com um fornecedor:
   hoje o adaptador "regras" (grátis, por tabela explícita); amanhã o JEV
   (api/_classificador/jev.mjs), se tiver documentação, chave e medição.
   Entrada e saída versionadas; o classificador RECOMENDA, quem calcula o
   preço é o motor (api/_vendas/precos.mjs) e quem decide é o código.
   ========================================================================== */
export const VERSAO_CONTRATO = 1;
export const TAREFAS = ['recomendar_pacote'];

export const RAMOS = ['servicos', 'saude', 'beleza', 'alimentacao', 'comercio', 'educacao', 'associacao', 'outro'];
export const OBJETIVOS = ['pedidos_whatsapp', 'achado_google', 'agendamentos', 'vender_online', 'apresentar', 'campanha'];
export const SITE_ATUAL = ['nao', 'instagram', 'tenho_site', 'so_endereco'];
export const MATERIAL = ['tenho', 'parte', 'nao'];

/* texto curto e limpo: quebra de linha e tab viram um espaço; os demais controles (inclui DEL e C1) e < > saem */
const curto = (v, max) => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').trim().slice(0, max) : '');

/* as respostas do formulário (lista fechada). Resposta ausente = "não sei": vale o padrão e fica em `assumido` */
export function validarRespostas(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { erros: ['respostas: esperado um objeto'] };
  const erros = [], assumido = [];
  const um = (campo, lista, padrao) => {
    if (r[campo] === undefined || r[campo] === null || r[campo] === '') { assumido.push(campo); return padrao; }
    if (!lista.includes(r[campo])) { erros.push(campo + ': fora da lista'); return padrao; }
    return r[campo];
  };
  const ramo = um('ramo', RAMOS, 'servicos');
  const site_atual = um('site_atual', SITE_ATUAL, 'nao');
  const material = um('material', MATERIAL, 'parte');
  const objetivos = Array.isArray(r.objetivos) ? [...new Set(r.objetivos)] : [];
  if (objetivos.some(o => !OBJETIVOS.includes(o))) erros.push('objetivos: fora da lista');
  if (!objetivos.length) assumido.push('objetivos');
  if (erros.length) return { erros };
  return { dados: { ramo, outro: curto(r.outro, 60), cidade: curto(r.cidade, 60), objetivos, site_atual, material, assumido } };
}

export const resultado = (tarefa, motor, dados) => ({ versao: VERSAO_CONTRATO, tarefa, motor, dados });
