/* ==========================================================================
   O AVISO AO DONO. Um só lugar para quem manda: os avisos de "pedido novo na fila", "recado novo", "fila cheia" e os do
   atendente (api/_vendas, api/atendente.mjs).
   CANAL HOJE: e-mail pelo binding send_email da Cloudflare (AVISO_EMAIL), de avisos@ do domínio para AVISO_PARA (wrangler.jsonc,
   só produção). Dono, 10/11/2026: "Primeiro e mail até termos o APP, depois disso exclua o email e mantenha apenas no
   APP" — quando o app do dono com push existir, este canal SAI (e o binding também).
   Os textos são FIXOS: nunca levam dado do cliente nem o conteúdo de um recado (o dono lê no painel). Sem canal
   configurado, endereço estranho ou envio que falha: devolve false e nunca lança; quem chama pode dar await sem medo.
   ========================================================================== */
export const AVISOS = Object.freeze({
  pedido: 'Pedido novo na fila. Detalhes no painel.',
  recado: 'Recado novo. Leia no painel.',
  fila_cheia: 'URGENTE: a fila de pedidos encheu ou o limite por hora foi atingido. Veja o painel.',
  atendente_cliente: 'O atendente de um cliente bateu o teto de gasto do dia e passou a mandar as pessoas para a equipe. Veja o painel.',
  atendente_contatos: 'O atendente de um cliente recebeu o máximo de contatos do dia (pode ser abuso). Veja o painel.',
  atendente_global: 'URGENTE: o teto de gasto do dia do atendente (todos os clientes) acabou. Veja o painel.',
  custo_dia: 'O gasto de IA do orçamento está perto do teto do dia. Veja o painel.'
});

const PAINEL = 'https://beyonzero.com.br/painel';
const DOMINIO = 'beyonzero.com.br';
const DE = 'avisos@' + DOMINIO;   /* (no código: o domínio aparece uma vez só no wrangler.jsonc, e é a rota da produção) */
/* um endereço só, sem espaço, vírgula nem quebra de linha (nada de cabeçalho injetado pela configuração) */
const ENDERECO = /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

const base64 = s => Buffer.from(s, 'utf8').toString('base64');
const linhas76 = s => s.match(/.{1,76}/g).join('\r\n');
/* assunto curto: cabe numa palavra codificada da RFC 2047 (até 75 caracteres; revisão técnica) */
const ASSUNTO_MAX = 36;
const assuntoDe = texto => { const s = texto.split('.')[0]; return s.length <= ASSUNTO_MAX ? s : s.slice(0, ASSUNTO_MAX - 1).replace(/\s+\S*$/, '') + '…'; };

/* os avisos de alerta (fila cheia, tetos) mandam no máximo 1 e-mail por hora por tipo: com a fila cheia, cada tentativa de pedido
   chamaria o aviso (revisões técnica e de segurança). A memória é do isolado do Worker: freio de melhor esforço, que basta
   para não encher a caixa; recado e pedido avisam sempre (cada um já tem os freios por IP e no banco) */
const COM_FREIO = new Set(['fila_cheia', 'atendente_cliente', 'atendente_contatos', 'atendente_global', 'custo_dia']);
const FREIO_MS = 60 * 60e3;
const ULTIMO_AVISO = new Map();

/* a mensagem crua (RFC 5322): cabeçalhos em ASCII, assunto e corpo em UTF-8 codificados em base64 */
export function montarEmail({ de, para, texto, agora = Date.now(), id = crypto.randomUUID() }) {
  const corpo = texto + '\n\nAbra o painel: ' + PAINEL + '\n\n(Aviso automático do site. O conteúdo fica só no painel.)';
  return [
    `From: Beyon Zero <${de}>`,
    `To: ${para}`,
    `Subject: =?UTF-8?B?${base64(assuntoDe(texto))}?=`,
    `Message-ID: <${String(id).toLowerCase().replace(/[^a-z0-9.-]/g, '')}@${DOMINIO}>`,
    `Date: ${new Date(agora).toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    linhas76(base64(corpo))
  ].join('\r\n');
}

/* avisarDono(env, tipo, { EmailMessage, agora }) → true se o e-mail saiu; false em qualquer outro caso */
export async function avisarDono(env, tipo, deps = {}) {
  const texto = AVISOS[tipo];
  const canal = env?.AVISO_EMAIL, de = DE, para = String(env?.AVISO_PARA ?? '');
  if (!texto || typeof canal?.send !== 'function' || !ENDERECO.test(para)) return false;
  const agora = (deps.agora ?? Date.now)(), memoria = deps.memoria ?? ULTIMO_AVISO;
  if (COM_FREIO.has(tipo) && agora - (memoria.get(tipo) ?? -Infinity) < FREIO_MS) return false;
  try {
    const EmailMessage = deps.EmailMessage ?? (await import('cloudflare:email')).EmailMessage;
    await canal.send(new EmailMessage(de, para, montarEmail({ de, para, texto, agora })));
    if (COM_FREIO.has(tipo)) memoria.set(tipo, agora);
    return true;
  } catch (e) {
    /* sem endereço no log: só o tipo do aviso e o começo da mensagem de erro */
    console.error(JSON.stringify({ origem: 'aviso', nivel: 'erro', tipo, erro: String(e?.message ?? '').replace(/\S+@\S+/g, '[e-mail]').slice(0, 80) }));
    return false;
  }
}
