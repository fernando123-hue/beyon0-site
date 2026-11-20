/* ==========================================================================
   O AVISO AO DONO. Um só lugar para quem manda: os avisos de "pedido novo na fila", "recado novo", "fila cheia" e os do
   atendente (api/_vendas, api/atendente.mjs), o e-mail do vigia (avisarDonoLinhas, api/_vigia/rondar.mjs) e o do estorno,
   da contestação e do restante pago (avisarDonoPagamento, api/_pagamentos/servico.mjs).
   CANAL HOJE: e-mail pelo binding send_email da Cloudflare (AVISO_EMAIL), de avisos@ do domínio para AVISO_PARA (wrangler.jsonc,
   só produção). Dono, 10/11/2026: "Primeiro e mail até termos o APP, depois disso exclua o email e mantenha apenas no
   APP" — quando o app do dono com push existir, este canal SAI (e o binding também).
   Os textos são FIXOS: nunca levam dado do cliente nem o conteúdo de um recado (o dono lê no painel). Sem canal
   configurado, endereço estranho ou envio que falha: devolve false e nunca lança; quem chama pode dar await sem medo.
   ========================================================================== */
export const AVISOS = Object.freeze({
  pedido: 'Pedido novo na fila. Detalhes no painel.',
  pedido_regulado: 'Pedido novo de saúde ou advocacia na fila. Detalhes no painel.',
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
/* o assunto é a 1ª frase do texto (nunca uma quebra de linha: a frase para no primeiro ponto ou fim de linha, e CR e LF saem de qualquer jeito, senão viraria cabeçalho
   injetado). Cabe INTEIRO até ASSUNTO_MAX caracteres (o alerta de pagamento leva o código e o que houve, e vinha cortado em 36); passou disso, corta numa palavra e põe
   reticências. A RFC 2047 limita cada palavra codificada a 75 caracteres: o assunto vai em palavras de até 42 bytes (56 em base64 + 12 de moldura = 68), sem partir um
   caractere UTF-8 ao meio, separadas pela dobra de linha do cabeçalho (CRLF e um espaço), que o leitor de e-mail junta de volta */
const ASSUNTO_MAX = 100;
const BYTES_POR_PALAVRA = 42;
const ASSUNTO_PADRAO = 'Aviso da Beyon Zero';   /* (texto que começa com ponto ou quebra de linha não deixa o assunto vazio) */
const assuntoDe = texto => {
  const letras = Array.from(texto.split(/[.\r\n]/)[0].trim());   /* (por caractere inteiro: o corte nunca parte um emoji ao meio) */
  if (!letras.length) return ASSUNTO_PADRAO;
  return letras.length <= ASSUNTO_MAX ? letras.join('') : letras.slice(0, ASSUNTO_MAX - 1).join('').replace(/\s+\S*$/, '') + '…';
};
function assuntoCodificado(assunto) {
  const palavras = []; let atual = '';
  for (const c of assunto) {   /* (por caractere inteiro, não por unidade UTF-16: um acento ou emoji nunca é partido) */
    if (atual && Buffer.byteLength(atual + c, 'utf8') > BYTES_POR_PALAVRA) { palavras.push(atual); atual = ''; }
    atual += c;
  }
  if (atual) palavras.push(atual);
  return palavras.map(p => '=?UTF-8?B?' + base64(p) + '?=').join('\r\n ');
}

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
    `Subject: ${assuntoCodificado(assuntoDe(texto))}`,
    `Message-ID: <${String(id).toLowerCase().replace(/[^a-z0-9.-]/g, '')}@${DOMINIO}>`,
    `Date: ${new Date(agora).toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    linhas76(base64(corpo))
  ].join('\r\n');
}

/* o envio comum: canal configurado e endereço válido, senão false; nunca lança */
async function enviar(env, texto, tipo, agora, deps) {
  const canal = env?.AVISO_EMAIL, de = DE, para = String(env?.AVISO_PARA ?? '');
  if (!texto || typeof canal?.send !== 'function' || !ENDERECO.test(para)) return false;
  try {
    const EmailMessage = deps.EmailMessage ?? (await import('cloudflare:email')).EmailMessage;
    await canal.send(new EmailMessage(de, para, montarEmail({ de, para, texto, agora })));
    return true;
  } catch (e) {
    /* sem endereço no log: só o tipo do aviso e o começo da mensagem de erro */
    console.error(JSON.stringify({ origem: 'aviso', nivel: 'erro', tipo, erro: String(e?.message ?? '').replace(/\S+@\S+/g, '[e-mail]').slice(0, 80) }));
    return false;
  }
}

/* avisarDono(env, tipo, { EmailMessage, agora }) → true se o e-mail saiu; false em qualquer outro caso */
export async function avisarDono(env, tipo, deps = {}) {
  const texto = AVISOS[tipo];
  if (!texto) return false;
  const agora = (deps.agora ?? Date.now)(), memoria = deps.memoria ?? ULTIMO_AVISO;
  if (COM_FREIO.has(tipo) && agora - (memoria.get(tipo) ?? -Infinity) < FREIO_MS) return false;
  const saiu = await enviar(env, texto, tipo, agora, deps);
  if (saiu && COM_FREIO.has(tipo)) memoria.set(tipo, agora);
  return saiu;
}

/* O AVISO DE PAGAMENTO NA HORA (decisão do dono, 19/11): o estorno, o estorno parcial e a contestação de uma parcela bloqueiam a entrega
   (supabase/migrations/20261119120000_seguranca_pagamentos.sql) e o dono sabe NA HORA, não só na rotina do dia seguinte; e o restante pago avisa
   que o site pode ir ao ar (a ordem nova: ele só vai ao ar com o restante pago). O alerta vem do banco (app.pagamentos_aplicar): { codigo, evento,
   parcela }. O texto é FIXO por evento e parcela; o único dado é o código do pedido (BZ-…), conferido pelo MESMO formato do banco (app.pedidos):
   fora dele, o aviso sai sem o código ("um pedido"), nunca com o que veio. Sem nome, contato, valor nem id do Mercado Pago. Sem freio: cada alerta é
   uma mudança real de estado (o banco não alerta o aviso repetido do provedor). */
const CODIGO_PEDIDO = /^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/;
const PARCELAS = Object.freeze({ entrada: 'a entrada', restante: 'o restante' });
const ACONTECEU = Object.freeze({
  estorno: { entrada: 'foi estornada', restante: 'foi estornado' },
  estorno_parcial: { entrada: 'foi estornada em parte', restante: 'foi estornado em parte' },
  contestacao: { entrada: 'foi contestada ou entrou em disputa no Mercado Pago', restante: 'foi contestado ou entrou em disputa no Mercado Pago' }
});
export function textoDoAvisoDePagamento(alerta) {
  const evento = alerta && alerta.evento, parcela = Object.hasOwn(PARCELAS, String(alerta && alerta.parcela)) ? alerta.parcela : 'entrada';
  const codigo = typeof (alerta && alerta.codigo) === 'string' && CODIGO_PEDIDO.test(alerta.codigo) ? alerta.codigo : null;
  const pedido = codigo ? 'pedido ' + codigo : 'um pedido';
  if (evento === 'restante_pago_bloqueada') return 'URGENTE: ' + pedido + ': o restante foi pago, mas a entrega está bloqueada. O site não vai ao ar até você resolver: veja o Mercado Pago e o painel.';
  if (evento === 'restante_pago') return (codigo ? 'Pedido ' + codigo : 'Um pedido') + ': o restante foi pago. O site já pode ir ao ar: ponha no ar pelo painel e mande o aviso ao cliente.';
  /* (20/11) a desistência do cliente dentro dos 7 dias: a entrada volta pelo Pix; o pedido é encerrado em seguida (o dono não precisa fazer nada, salvo se o encerramento não sair) */
  if (evento === 'desistencia') return (codigo ? 'Pedido ' + codigo : 'Um pedido') + ': o cliente desistiu dentro dos 7 dias e a entrada foi devolvida pelo Mercado Pago. O pedido é encerrado e o material sai no dia seguinte.';
  if (evento === 'desistencia_falhou') return 'URGENTE: ' + pedido + ': o cliente pediu para desistir dentro dos 7 dias, mas o Mercado Pago não devolveu a entrada. Ele foi orientado a deixar um recado. Veja o Mercado Pago e o painel.';
  if (evento === 'desistencia_nao_encerrada') return 'URGENTE: ' + pedido + ': a entrada foi devolvida na desistência do cliente, mas o pedido não encerrou sozinho. Encerre pelo painel, com o motivo desistência.';
  if (!Object.hasOwn(ACONTECEU, String(evento))) return null;
  return 'URGENTE: ' + pedido + ': ' + PARCELAS[parcela] + ' ' + ACONTECEU[evento][parcela] + '. A entrega ficou bloqueada: nada avança nem vai ao ar. Veja o Mercado Pago e o painel.';
}
/* avisarDonoPagamento(env, alerta, deps) → true se o e-mail saiu; false em qualquer outro caso (nunca lança) */
export async function avisarDonoPagamento(env, alerta, deps = {}) {
  const texto = textoDoAvisoDePagamento(alerta);
  if (!texto) return false;
  return enviar(env, texto, 'pagamento', (deps.agora ?? Date.now)(), deps);
}

/* o e-mail do VIGIA (api/_vigia): várias linhas fixas num e-mail só (as linhas vêm de api/_vigia/decidir.mjs, textos fixos,
   o único número é contagem). Sem freio aqui: quem decide não repetir é o vigia, com a memória dele no banco */
export async function avisarDonoLinhas(env, linhas, deps = {}) {
  if (!Array.isArray(linhas) || !linhas.length || !linhas.every(l => typeof l === 'string' && l && !/[\r\n]/.test(l))) return false;
  return enviar(env, linhas.join('\n'), 'vigia', (deps.agora ?? Date.now)(), deps);
}
