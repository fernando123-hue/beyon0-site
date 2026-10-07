/* ==========================================================================
   UMA DIREÇÃO DE SITE como ESTRUTURA (nunca HTML do modelo; decisão técnica
   em docs/fase2/00-AUDITORIA-E-ANALISE.md §5): o modelo devolve este JSON
   (saída estruturada por JSON Schema), este módulo valida e higieniza (lista
   fechada, tamanhos, cores hexadecimais, contraste de leitura), e o renderer
   da Beyon Zero (js/previa.js) monta a prévia com textContent. Resultado:
   sem XSS, CSP sem inline preservada, acabamento consistente, e as
   alterações do cliente viram operações sobre este JSON.
   Zero dado inventado: depoimento, número, prêmio ou cliente que não vieram
   do briefing aparecem como ESPAÇO RESERVADO ("[ … ]"), nunca como fato.
   ========================================================================== */
export const ESTRATEGIAS = {
  conversao: 'CONVERSÃO: clareza imediata da oferta, chamadas para ação fortes e repetidas, hierarquia comercial, prova perto do botão, poucos cliques até o contato.',
  autoridade: 'AUTORIDADE: posicionamento e confiança, tom sóbrio e premium, credenciais e método, prova social em destaque, ritmo calmo e espaçoso.',
  experiencia: 'EXPERIÊNCIA: diferenciação e narrativa, a história do negócio contada em sequência, composição visual marcante, seções que surpreendem sem atrapalhar o contato.'
};
export const TIPOS_SECAO = ['hero', 'servicos', 'sobre', 'diferenciais', 'processo', 'depoimentos', 'numeros', 'galeria', 'faq', 'cta', 'contato', 'equipe', 'destaque', 'localizacao'];
export const VARIANTES = ['split', 'centro', 'cartoes', 'lista', 'faixa', 'grade', 'linha_do_tempo'];
export const FONTES = ['sans_geometrica', 'sans_humanista', 'serif_classica', 'serif_moderna', 'mono_tecnica'];
const HEX = /^#[0-9a-fA-F]{6}$/;

const s = (props, req) => ({ type: 'object', additionalProperties: false, properties: props, required: req || Object.keys(props) });
const texto = { type: 'string' };
const ITEM = s({ titulo: texto, texto: texto });
/* o esquema que o modelo é obrigado a seguir (sem limites numéricos: o JSON Schema da API não os aceita; quem limita é higienizar()) */
export const ESQUEMA_DIRECAO = s({
  nome_conceito: texto,
  resumo: texto,
  identidade: s({
    paleta: s({ fundo: texto, superficie: texto, texto: texto, texto_suave: texto, destaque: texto, destaque_texto: texto }),
    tipografia: s({ titulos: { type: 'string', enum: FONTES }, texto: { type: 'string', enum: FONTES } }),
    estilo: s({ cantos: { type: 'string', enum: ['retos', 'suaves', 'redondos'] }, densidade: { type: 'string', enum: ['arejada', 'equilibrada', 'compacta'] }, tema: { type: 'string', enum: ['claro', 'escuro'] } })
  }),
  navegacao: s({ marca: texto, itens: { type: 'array', items: texto }, cta: texto }),
  secoes: { type: 'array', items: s({
    tipo: { type: 'string', enum: TIPOS_SECAO },
    variante: { type: 'string', enum: VARIANTES },
    rotulo: texto, titulo: texto, subtitulo: texto, texto: texto,
    itens: { type: 'array', items: ITEM },
    cta: texto
  }) },
  rodape: s({ texto: texto })
});

/* ---------- contraste (WCAG 2.x) ---------- */
function luminancia(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const legivelSobre = fundo => (contraste('#111111', fundo) >= contraste('#FFFFFF', fundo) ? '#111111' : '#FFFFFF');

/* ---------- higienização (o que vai para o banco e para a tela) ---------- */
const t = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const LOREM = /lorem ipsum|dolor sit amet/i;

export function higienizar(bruta, estrategia) {
  if (!bruta || typeof bruta !== 'object') return { erro: 'direção vazia' };
  const d = bruta;
  const pal = d.identidade?.paleta || {};
  const cor = (v, padrao) => (HEX.test(v || '') ? v.toUpperCase() : padrao);
  const paleta = {
    fundo: cor(pal.fundo, '#FFFFFF'), superficie: cor(pal.superficie, '#F4F4F4'),
    texto: cor(pal.texto, '#111111'), texto_suave: cor(pal.texto_suave, '#555555'),
    destaque: cor(pal.destaque, '#1CB5B9'), destaque_texto: cor(pal.destaque_texto, '#FFFFFF')
  };
  /* contraste de leitura: texto ≥ 4,5:1 sobre fundo e superfície; botão ≥ 4,5:1 — corrigido, não recusado */
  const ajustes = [];
  if (contraste(paleta.texto, paleta.fundo) < 4.5 || contraste(paleta.texto, paleta.superficie) < 4.5) { paleta.texto = legivelSobre(paleta.fundo); ajustes.push('texto'); }
  if (contraste(paleta.texto_suave, paleta.fundo) < 3) { paleta.texto_suave = paleta.texto; ajustes.push('texto_suave'); }
  if (contraste(paleta.destaque_texto, paleta.destaque) < 4.5) { paleta.destaque_texto = legivelSobre(paleta.destaque); ajustes.push('destaque_texto'); }

  const tip = d.identidade?.tipografia || {}, est = d.identidade?.estilo || {};
  const secoes = (Array.isArray(d.secoes) ? d.secoes : []).filter(x => x && TIPOS_SECAO.includes(x.tipo)).slice(0, 12).map(x => ({
    tipo: x.tipo,
    variante: VARIANTES.includes(x.variante) ? x.variante : 'centro',
    rotulo: t(x.rotulo, 40), titulo: t(x.titulo, 120), subtitulo: t(x.subtitulo, 220), texto: t(x.texto, 700),
    itens: (Array.isArray(x.itens) ? x.itens : []).slice(0, 8).map(i => ({ titulo: t(i?.titulo, 80), texto: t(i?.texto, 300) })).filter(i => i.titulo || i.texto),
    cta: t(x.cta, 40)
  })).filter(x => x.titulo || x.texto || x.itens.length);

  if (secoes.length < 3) return { erro: 'direção com poucas seções' };
  if (secoes[0].tipo !== 'hero') secoes.unshift({ tipo: 'hero', variante: 'centro', rotulo: '', titulo: t(d.navegacao?.marca, 120) || 'Seu negócio', subtitulo: '', texto: '', itens: [], cta: t(d.navegacao?.cta, 40) });
  const direcao = {
    nome_conceito: t(d.nome_conceito, 60) || 'Direção',
    estrategia,
    resumo: t(d.resumo, 400),
    identidade: {
      paleta,
      tipografia: { titulos: FONTES.includes(tip.titulos) ? tip.titulos : 'sans_geometrica', texto: FONTES.includes(tip.texto) ? tip.texto : 'sans_humanista' },
      estilo: { cantos: ['retos', 'suaves', 'redondos'].includes(est.cantos) ? est.cantos : 'suaves', densidade: ['arejada', 'equilibrada', 'compacta'].includes(est.densidade) ? est.densidade : 'equilibrada', tema: est.tema === 'escuro' ? 'escuro' : 'claro' }
    },
    navegacao: { marca: t(d.navegacao?.marca, 60) || 'Sua marca', itens: (Array.isArray(d.navegacao?.itens) ? d.navegacao.itens : []).map(i => t(i, 24)).filter(Boolean).slice(0, 6), cta: t(d.navegacao?.cta, 30) || 'Fale conosco' },
    secoes,
    rodape: { texto: t(d.rodape?.texto, 200) }
  };
  if (LOREM.test(JSON.stringify(direcao))) return { erro: 'texto de preenchimento (lorem ipsum)' };
  return { direcao, ajustes };
}
