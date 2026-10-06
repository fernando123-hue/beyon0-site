/* ==========================================================================
   MÉTRICAS PRÓPRIAS — validação do que chega do navegador (2026-10-06).
   O endpoint é público: tudo que entra passa por uma lista fechada de campos,
   com tipo e tamanho máximos. Campo fora da lista é descartado. Nada de IP,
   nada de texto livre do visitante.
   ========================================================================== */
export const LIMITE_BYTES = 4096;
const ID = /^[A-Za-z0-9-]{8,40}$/;
export const CODIGO = /^[ACDEFGHJKMNPQRTUVWXY34679]{5}$/;
const ROTULO = /^[a-z0-9-]{1,30}$/;
const GCLID = /^[A-Za-z0-9_-]{10,200}$/;
const DISPOSITIVOS = ['celular', 'tablet', 'computador'];
const FORM = ['abriu', 'enviou'];
const UM_DIA = 864e5;

const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');
const casa = (re, v) => typeof v === 'string' && re.test(v);
/* campanha, termo e fonte vêm da URL de quem mandou o link: um e-mail ou telefone ali seria dado pessoal sem aceite */
const PESSOAL = /@|\d{8,}|\d{2}[\s.-]?\d{4,5}[\s.-]?\d{4}/;
const rotuloLivre = (v, max) => { const t = texto(v, max); return t && !PESSOAL.test(t) ? t : ''; };
const inteiro = (v, min, max) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null);
const rotulo = v => (casa(ROTULO, v) ? v : null);

/* o caminho vira a forma limpa do deploy: /sites.html e /sites/ viram /sites; /index.html vira / */
export function normalizarPagina(v) {
  const p = texto(v, 80).split(/[?#]/)[0].replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1');
  return /^\/[A-Za-z0-9/_-]*$/.test(p) ? p || '/' : null;
}

/* devolve { pagina, contato } prontos para gravar, ou null se o pacote é inválido */
export function validarPacote(bruto, agora = Date.now()) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const { id, visita, codigo } = bruto;
  if (!casa(ID, id) || !casa(ID, visita) || !casa(CODIGO, codigo)) return null;
  const pagina = normalizarPagina(bruto.pagina);
  if (!pagina) return null;
  const inicio = inteiro(bruto.inicio, 0, Number.MAX_SAFE_INTEGER);
  if (inicio === null || Math.abs(agora - inicio) > UM_DIA) return null;   /* relógio absurdo ou pacote velho */

  const secoes = Array.isArray(bruto.secoes) ? [...new Set(bruto.secoes.map(rotulo).filter(Boolean))].slice(0, 30) : [];
  const linha = {
    id, visita, codigo, pagina,
    inicio: new Date(inicio).toISOString(),
    entrada: bruto.entrada === true,
    fonte: rotuloLivre(bruto.fonte, 40).toLowerCase() || 'direto',
    meio: rotulo(bruto.meio) || 'direto',
    campanha: rotuloLivre(bruto.campanha, 80) || null,
    termo: rotuloLivre(bruto.termo, 80) || null,
    dispositivo: DISPOSITIVOS.includes(bruto.dispositivo) ? bruto.dispositivo : 'computador',
    largura: inteiro(bruto.largura, 0, 8000),
    carga_ms: inteiro(bruto.carga_ms, 0, 120000),
    secoes,
    rolagem: inteiro(bruto.rolagem, 0, 100) ?? 0,
    ativo_s: inteiro(bruto.ativo_s, 0, 86400) ?? 0,
    contato: rotulo(bruto.contato),
    contato_s: inteiro(bruto.contato_s, 0, 86400),
    form: FORM.includes(bruto.form) ? bruto.form : null,
    form_campo: rotulo(bruto.form_campo),
    ouro: bruto.ouro === true
  };
  /* o contato nasce no primeiro clique que abre conversa; o gclid só vem com o aceite de cookies (js/metricas.js) */
  const contato = linha.contato ? {
    codigo, visita, pagina_id: id, quando: new Date(agora).toISOString(), botao: linha.contato, pagina,
    fonte: linha.fonte, meio: linha.meio, campanha: linha.campanha, termo: linha.termo, dispositivo: linha.dispositivo,
    gclid: casa(GCLID, bruto.gclid) ? bruto.gclid : null
  } : null;
  return { pagina: linha, contato };
}

/* o que o painel pode mudar num contato */
export const STATUS = ['clicou', 'conversa', 'cliente', 'descartado'];
export function validarMudanca(bruto) {
  if (!bruto || !casa(CODIGO, bruto.codigo)) return null;
  const mudanca = {};
  if (bruto.status !== undefined) { if (!STATUS.includes(bruto.status)) return null; mudanca.status = bruto.status; }
  if (bruto.valor !== undefined) {
    const v = bruto.valor === null || bruto.valor === '' ? null : Number(bruto.valor);
    if (v !== null && !(Number.isFinite(v) && v >= 0 && v < 1e7)) return null;
    mudanca.valor = v === null ? null : Math.round(v * 100) / 100;
  }
  if (bruto.nota !== undefined) mudanca.nota = texto(bruto.nota, 200) || null;
  if (!Object.keys(mudanca).length) return null;
  return { codigo: bruto.codigo, mudanca: { ...mudanca, atualizado: new Date().toISOString() } };
}

/* robôs que se declaram (o navegador headless do verificador também) não entram na conta */
export const ehRobo = ua => !ua || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp/i.test(ua);
