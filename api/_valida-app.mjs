/* ==========================================================================
   VALIDAÇÃO DOS DADOS DO NEGÓCIO (esquema app). Espelha os checks do banco
   (supabase/migrations/…_app_comercial.sql): a API recusa cedo e com
   mensagem clara; o banco recusa de novo se algo passar. Lista FECHADA de
   campos: campo desconhecido é erro (não é ignorado em silêncio, para quem
   integra perceber), e nada que o banco preenche (org de outro lugar,
   autoria, datas, situação "ganho") entra pela API.
   ========================================================================== */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = v => typeof v === 'string' && UUID.test(v);

export const INTERESSES = ['site', 'automacao', 'outro'];
export const STATUS_LEAD = ['novo', 'em_conversa', 'proposta', 'ganho', 'perdido', 'descartado'];
export const MEIOS = ['anuncio', 'busca', 'social', 'mensagem', 'email', 'referencia', 'direto', 'indicacao', 'prospeccao', 'outro'];
const CODIGO = /^[ACDEFGHJKMNPQRTUVWXY34679]{5}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TEXTOS = { nome: 160, empresa: 160, origem_fonte: 80, campanha: 80, termo: 80, observacoes: 4000 };
const CAMPOS_LEAD = ['org_id', 'nome', 'empresa', 'email', 'telefone', 'interesse', 'origem_meio', 'origem_fonte', 'campanha', 'termo', 'codigo_visita', 'observacoes'];

/* E.164: "+55 (21) 97716-7944", "21977167944" e "+5521977167944" viram "+5521977167944"; sem DDI e com 10–11 dígitos = Brasil */
export function normalizarTelefone(v) {
  if (typeof v !== 'string') return null;
  const mais = v.trim().startsWith('+');
  const digitos = v.replace(/\D/g, '');
  const e164 = mais ? '+' + digitos : (digitos.length === 10 || digitos.length === 11 ? '+55' + digitos : '+' + digitos);
  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null;
}

/* { dados } pronto para gravar, ou { erros: { campo: motivo } } */
export function validarNovoLead(bruto) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { erros: { corpo: 'esperado um objeto JSON' } };
  const erros = {}, dados = {};
  for (const k of Object.keys(bruto)) if (!CAMPOS_LEAD.includes(k)) erros[k] = 'campo não permitido';

  if (!ehUuid(bruto.org_id)) erros.org_id = 'obrigatório (uuid)';
  else dados.org_id = bruto.org_id.toLowerCase();

  for (const [k, max] of Object.entries(TEXTOS)) {
    const v = bruto[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string') { erros[k] = 'texto'; continue; }
    const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
    if (t.length > max) erros[k] = 'até ' + max + ' caracteres';
    else if (t) dados[k] = t;
  }
  if (bruto.email !== undefined && bruto.email !== null && bruto.email !== '') {
    const e = typeof bruto.email === 'string' ? bruto.email.trim().toLowerCase() : '';
    if (e.length > 254 || !EMAIL.test(e)) erros.email = 'e-mail inválido'; else dados.email = e;
  }
  if (bruto.telefone !== undefined && bruto.telefone !== null && bruto.telefone !== '') {
    const t = normalizarTelefone(bruto.telefone);
    if (!t) erros.telefone = 'telefone inválido'; else dados.telefone = t;
  }
  if (bruto.codigo_visita !== undefined && bruto.codigo_visita !== null && bruto.codigo_visita !== '') {
    const c = typeof bruto.codigo_visita === 'string' ? bruto.codigo_visita.trim().toUpperCase() : '';
    if (!CODIGO.test(c)) erros.codigo_visita = 'código de 5 caracteres da mensagem'; else dados.codigo_visita = c;
  }
  if (bruto.interesse !== undefined) { if (!INTERESSES.includes(bruto.interesse)) erros.interesse = 'um de: ' + INTERESSES.join(', '); else dados.interesse = bruto.interesse; }
  if (bruto.origem_meio !== undefined && bruto.origem_meio !== null) { if (!MEIOS.includes(bruto.origem_meio)) erros.origem_meio = 'um de: ' + MEIOS.join(', '); else dados.origem_meio = bruto.origem_meio; }

  if (!erros.nome && !erros.email && !erros.telefone && !erros.codigo_visita && !dados.nome && !dados.email && !dados.telefone && !dados.codigo_visita) {
    erros.contato = 'informe ao menos nome, e-mail, telefone ou código da visita';
  }
  return Object.keys(erros).length ? { erros } : { dados };
}
