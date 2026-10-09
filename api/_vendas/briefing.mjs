/* ==========================================================================
   O BRIEFING ESTRUTURADO (a memória da conversa; spec: "cada mensagem
   contribui para um briefing estruturado"). O agente manda ATUALIZAÇÕES
   parciais pela ferramenta atualizar_briefing; este módulo valida (lista
   fechada, tamanhos), mescla e calcula a CONFIANÇA pela cobertura dos
   campos — não pelo que o modelo diz de si.
   Dado de contato (nome da pessoa, telefone, e-mail) NÃO entra aqui: vem pelo
   formulário de contato e vai para app.leads, longe do modelo.
   ========================================================================== */
import { FORMATOS } from './precos.mjs';   /* (os formatos que o briefing aceita são os do motor) */

export const FUNCIONALIDADES = ['whatsapp', 'formulario', 'agendamento', 'mapa', 'blog', 'integracao', 'ia', 'area_restrita', 'automacao', 'catalogo', 'loja', 'idioma', 'galeria', 'depoimentos'];
export const OBJETIVOS = ['gerar_leads', 'apresentar_empresa', 'vender', 'agendamentos', 'autoridade', 'captar_contatos', 'lancar_produto', 'outro'];
const POSSE = ['tem', 'parcial', 'nao'];
const t = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : undefined);
export const limparTexto = t;   /* (o mesmo corte para o texto livre das outras ferramentas do agente) */
const lista = (v, max, itemMax) => (Array.isArray(v) ? [...new Set(v.map(x => t(x, itemMax)).filter(Boolean))].slice(0, max) : undefined);
const enumLista = (v, permitidos, max) => (Array.isArray(v) ? [...new Set(v.filter(x => permitidos.includes(x)))].slice(0, max) : undefined);
const bool = v => (typeof v === 'boolean' ? v : undefined);
const limpar = o => { for (const k of Object.keys(o)) if (o[k] === undefined || (Array.isArray(o[k]) && !o[k].length) || (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k]; return o; };

/* esquema da ferramenta (o que o modelo pode preencher) */
export const ESQUEMA_ATUALIZACAO = {
  type: 'object',
  additionalProperties: false,
  properties: {
    negocio: { type: 'object', additionalProperties: false, properties: { nome: { type: 'string' }, segmento: { type: 'string' }, descricao: { type: 'string' }, cidade: { type: 'string' } } },
    objetivos: { type: 'array', items: { type: 'string', enum: OBJETIVOS } },
    objetivo_detalhe: { type: 'string' },
    publico: { type: 'object', additionalProperties: false, properties: { descricao: { type: 'string' } } },
    servicos: { type: 'array', items: { type: 'string' } },
    posicionamento: { type: 'object', additionalProperties: false, properties: { percepcao: { type: 'string' }, diferenciais: { type: 'array', items: { type: 'string' } } } },
    identidade_visual: { type: 'object', additionalProperties: false, properties: { tem_logo: { type: 'boolean' }, cores: { type: 'array', items: { type: 'string' } }, tipografia: { type: 'string' }, manual_de_marca: { type: 'boolean' }, observacoes: { type: 'string' } } },
    conteudo: { type: 'object', additionalProperties: false, properties: { textos: { type: 'string', enum: POSSE }, imagens: { type: 'string', enum: POSSE }, videos: { type: 'string', enum: POSSE }, depoimentos: { type: 'string', enum: POSSE }, cases: { type: 'string', enum: POSSE } } },
    referencias: { type: 'array', items: { type: 'string' } },
    restricoes: { type: 'array', items: { type: 'string' } },
    funcionalidades: { type: 'array', items: { type: 'string', enum: FUNCIONALIDADES } },
    preferencias: { type: 'array', items: { type: 'string' } },
    projeto: { type: 'object', additionalProperties: false, properties: { formato: { type: 'string', enum: FORMATOS }, paginas: { type: 'integer' }, urgencia: { type: 'boolean' }, complexidade: { type: 'string', enum: ['normal', 'alta'] } } }
  }
};

/* valida uma atualização (descarta o que não cabe; nunca lança por conteúdo do modelo) */
export function limparAtualizacao(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return {};
  const o = {};
  if (a.negocio) o.negocio = limpar({ nome: t(a.negocio.nome, 120), segmento: t(a.negocio.segmento, 80), descricao: t(a.negocio.descricao, 600), cidade: t(a.negocio.cidade, 80) });
  o.objetivos = enumLista(a.objetivos, OBJETIVOS, 5);
  o.objetivo_detalhe = t(a.objetivo_detalhe, 400);
  if (a.publico) o.publico = limpar({ descricao: t(a.publico.descricao, 500) });
  o.servicos = lista(a.servicos, 15, 120);
  if (a.posicionamento) o.posicionamento = limpar({ percepcao: t(a.posicionamento.percepcao, 300), diferenciais: lista(a.posicionamento.diferenciais, 8, 160) });
  if (a.identidade_visual) {
    const iv = a.identidade_visual;
    o.identidade_visual = limpar({ tem_logo: bool(iv.tem_logo), cores: lista(iv.cores, 6, 40), tipografia: t(iv.tipografia, 80), manual_de_marca: bool(iv.manual_de_marca), observacoes: t(iv.observacoes, 300) });
  }
  if (a.conteudo) { const c = {}; for (const k of ['textos', 'imagens', 'videos', 'depoimentos', 'cases']) if (POSSE.includes(a.conteudo[k])) c[k] = a.conteudo[k]; o.conteudo = c; }
  o.referencias = lista(a.referencias, 5, 200);
  o.restricoes = lista(a.restricoes, 8, 200);
  o.funcionalidades = enumLista(a.funcionalidades, FUNCIONALIDADES, 14);
  o.preferencias = lista(a.preferencias, 8, 200);
  if (a.projeto) {
    const p = a.projeto;
    o.projeto = limpar({
      formato: FORMATOS.includes(p.formato) ? p.formato : undefined,
      paginas: Number.isInteger(p.paginas) && p.paginas >= 1 && p.paginas <= 60 ? p.paginas : undefined,
      urgencia: bool(p.urgencia),
      complexidade: ['normal', 'alta'].includes(p.complexidade) ? p.complexidade : undefined
    });
  }
  return limpar(o);
}

/* mescla: objetos campo a campo, listas somadas sem repetir (com teto) */
export function mesclar(atual, atualizacao) {
  const out = JSON.parse(JSON.stringify(atual || {}));
  for (const [k, v] of Object.entries(atualizacao)) {
    if (Array.isArray(v)) out[k] = [...new Set([...(Array.isArray(out[k]) ? out[k] : []), ...v])].slice(0, 15);
    else if (v && typeof v === 'object') out[k] = { ...(out[k] && typeof out[k] === 'object' ? out[k] : {}), ...v };
    else out[k] = v;
  }
  return out;
}

/* o que ainda falta saber, em ordem de importância (o agente pergunta só isso) */
const PESOS = [
  ['negocio', b => !!(b.negocio && (b.negocio.segmento || b.negocio.descricao)), 0.2],
  ['objetivo', b => !!(b.objetivos?.length || b.objetivo_detalhe), 0.15],
  ['formato', b => !!b.projeto?.formato, 0.15],
  ['publico', b => !!b.publico?.descricao, 0.1],
  ['servicos', b => !!b.servicos?.length, 0.1],
  ['conteudo', b => !!(b.conteudo && Object.keys(b.conteudo).length), 0.08],
  ['identidade_visual', b => !!(b.identidade_visual && Object.keys(b.identidade_visual).length), 0.07],
  ['funcionalidades', b => !!b.funcionalidades?.length, 0.07],
  ['posicionamento', b => !!(b.posicionamento?.percepcao || b.posicionamento?.diferenciais?.length), 0.04],
  ['referencias', b => !!(b.referencias?.length || b.preferencias?.length), 0.02],
  ['restricoes', b => !!b.restricoes?.length, 0.02]
];
export function avaliar(b) {
  let conf = 0; const faltam = [];
  for (const [nome, ok, peso] of PESOS) { if (ok(b || {})) conf += peso; else faltam.push(nome); }
  return { confianca: Math.round(conf * 100) / 100, faltam };
}
/* pronto para estimar: negócio, objetivo e formato; pronto para gerar as direções: confiança ≥ 0,7 */
export const prontoParaEstimar = b => !!(b?.projeto?.formato && (b.negocio?.segmento || b.negocio?.descricao) && (b.objetivos?.length || b.objetivo_detalhe));
export const LIMIAR_DIRECOES = 0.7;
