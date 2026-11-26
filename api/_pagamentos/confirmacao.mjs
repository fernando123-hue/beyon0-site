/* ==========================================================================
   A CONFIRMAÇÃO DA ENTRADA POR E-MAIL (decisões do dono, 14 e 15/11/2026). Quem PAGOU a entrada recebe um e-mail
   curto: o que foi pago, o que acontece agora, o prazo (só o da proposta aceita) e que é só responder para falar
   com a gente. Assina "Beyon Zero" (anonimato: nunca o nome do dono).
   • Envio: Resend, pela API HTTP (fetch, sem SDK), com tempo máximo curto e a chave de idempotência do próprio
     Resend por tentativa. A chave é EXATAMENTE env.RESEND_API_KEY (segredo só do Worker de produção). Sem ela,
     nada sai (teste, prévia): o serviço nem reserva, e a reconciliação recupera quando a chave existir.
   • Uma vez só: quem decide é o banco (app.pagamentos_reservar_confirmacao, 20261115130000). Este módulo só monta e
     envia; `confirmarEntradas` reserva e envia o que o banco devolveu.
   • Nunca derruba o pagamento: o envio acontece DEPOIS de o pagamento estar gravado, e nada aqui lança (exceto o fim
     do orçamento de subpedidos, que a reconciliação trata). Erro vai para o log sem a chave e sem o e-mail.
   • O LINK DO PEDIDO (decisão do dono, 19/11: o cliente não lida com código nenhum). Com a entrega ligada e só em produção, depois da reserva,
     o código é sorteado aqui e o banco recebe SÓ o hash (app.pagamentos_link_da_confirmacao, 20261126120000). O banco cria o
     link se a conversa não tem um; se o cliente já gerou o dele, não troca, e o e-mail vai sem link (a frase de antes). O
     código existe só nesta memória e no e-mail: nunca no log, no banco ou numa resposta. O Resend recusou (o e-mail não
     saiu)? O link é desfeito; no tempo esgotado ou na rede caída o e-mail pode ter saído, então ele fica.
   ========================================================================== */
import { entregaLigada } from '../_material/interruptor.mjs';
import { ambienteDe } from '../_ambiente.mjs';
import { SemOrcamento } from '../_orcamento.mjs';
import { CODIGO_LINK, novoCodigoLink, hashDoLink } from '../_vendas/link-pedido.mjs';

export const RESEND_URL = 'https://api.resend.com/emails';
export const REMETENTE = 'Beyon Zero <pedidos@beyonzero.com.br>';
export const RESPONDER_PARA = 'contato.beyon.zero@gmail.com';
export const TEMPO_MAXIMO_MS = 5000;   /* o pagamento já está gravado; isto só segura a resposta do aviso */
/* a origem é FIXA (a de produção, a única com a chave do Resend): nunca o Host do pedido, que quem chama escolhe */
export const ORIGEM_SITE = 'https://beyonzero.com.br';
/* o MESMO formato que a página monta (js/orcamento-entrega.js, linkDoPedido) e abre (js/orcamento-retomada.js, #pedido= → abrir-pedido).
   No FRAGMENTO: não vai ao servidor no carregamento, nem ao log, nem ao Referer */
export const linkDoPedido = codigo => ORIGEM_SITE + '/orcamento#pedido=' + codigo;
const linkValido = l => typeof l === 'string' && l.startsWith(ORIGEM_SITE + '/orcamento#pedido=') && CODIGO_LINK.test(l.slice((ORIGEM_SITE + '/orcamento#pedido=').length));
/* por item da reconciliação, no pior caso: o link, o envio e o desfazer (a reserva é uma só para todos) */
const CUSTO_COM_LINK = 3;
const PRAZO_DIAS_MAX = 60;             /* (o check de app.propostas.prazo_dias) */
const CHAVE_VALIDA = /^[A-Za-z0-9_-]{8,200}$/;
/* o e-mail por LISTA PERMITIDA (revisão de segurança do #172): letras minúsculas sem acento, dígitos e _ % + - na parte local, pontos só
   entre pedaços; domínio com rótulos de letra e dígito (hífen só no meio) e terminação de 2 a 24 letras. Fica de fora tudo o que
   poderia virar cabeçalho ou lista de destinatários: <, >, aspas, vírgula, espaço e quebra de linha. A MESMA regra do banco
   (20261115130000_confirmacao_entrada.sql) e de quem paga (servico.mjs, validarPagador, que usa esta função) */
export const EMAIL_PERMITIDO = /^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export const emailPermitido = e => typeof e === 'string' && e.length <= 254 && e.split('@')[0].length <= 64 && EMAIL_PERMITIDO.test(e);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMO_PAGOU = { pix: 'pelo Pix', cartao: 'no cartão' };
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escaparHtml = s => String(s).replace(/[&<>"']/g, c => ESCAPES[c]);
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = v => BRL.format(v).replace(/\s/g, ' ');
const valorValido = v => Number.isFinite(Number(v)) && Number(v) > 0 && v !== '' && v !== null;

/* o corpo do HTML: um parágrafo por item, tudo escapado; sem imagem, sem link de rastreio, sem estilo inline de layout.
   Um parágrafo { texto, link } leva o link num <a> (href e texto escapados; quem monta já conferiu o formato) */
const paragrafoHtml = p => typeof p === 'string'
  ? '<p>' + escaparHtml(p).replace(/\n/g, '<br>') + '</p>'
  : '<p>' + escaparHtml(p.texto) + '<br><a href="' + escaparHtml(p.link) + '">' + escaparHtml(p.link) + '</a></p>';
const paragrafoTexto = p => typeof p === 'string' ? p : p.texto + '\n' + p.link;
export function htmlDe(paragrafos) {
  const corpo = paragrafos.map(paragrafoHtml).join('\n');
  return '<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="utf-8"></head><body>\n' + corpo + '\n</body></html>';
}

/* o texto (voz humana: curto, falado, uma coisa por frase; o prazo só se a proposta o define) */
export function textoDaConfirmacao({ valor, metodo, prazoDias, entrega, link = null }) {
  const como = COMO_PAGOU[metodo] ? ', ' + COMO_PAGOU[metodo] : '';
  const prazo = Number.isInteger(prazoDias) && prazoDias >= 1 && prazoDias <= PRAZO_DIAS_MAX
    ? ' O prazo de entrega é de até ' + prazoDias + (prazoDias === 1 ? ' dia útil' : ' dias úteis') + ', contados a partir do envio do material.'
    : '';
  const comLink = !!entrega && linkValido(link);
  const passo = comLink ? ['Agora a gente precisa do seu material, como o logo e as fotos.' + prazo,
    { texto: 'Este é o link do seu pedido. Por ele você manda o material e acompanha cada passo, de qualquer aparelho:', link },
    'O link é só seu. Não repasse para ninguém.']
    : entrega ? ['Agora a gente precisa do seu material, como o logo e as fotos. Você envia pela página do pedido, a mesma em que fez o pagamento.' + prazo]
    : ['Agora a gente entra em contato com você para combinar o material, como o logo e as fotos.' + prazo];
  const paragrafos = [
    'Olá,',
    'Recebemos a entrada do seu site: ' + dinheiro(Number(valor)) + como + '.',
    ...passo,
    'Para falar com a gente, é só responder este e-mail.',
    'Beyon Zero\nbeyonzero.com.br'
  ];
  return { assunto: 'Recebemos a entrada do seu site', texto: paragrafos.map(paragrafoTexto).join('\n\n') + '\n', html: htmlDe(paragrafos) };
}

/* o item que a reserva devolveu está em condição de sair (as mesmas conferências do envio) */
const itemValido = ({ tentativa_id, email, valor } = {}) => UUID.test(String(tentativa_id || '')) && emailPermitido(email) && valorValido(valor);
const motivoDoErro = e => (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) ? 'tempo' : 'rede';

/* `comLink`: o e-mail leva o link do pedido (só com a entrega ligada; confirmacaoDoAmbiente o liga só em produção, a origem do link) */
export function criarConfirmacao({ chave, fetch: buscar = globalThis.fetch, entrega = false, comLink = true, timeoutMs = TEMPO_MAXIMO_MS } = {}) {
  const ligada = typeof chave === 'string' && CHAVE_VALIDA.test(chave) && typeof buscar === 'function';
  const link = !!entrega && !!comLink;
  return {
    ligada,
    entrega: !!entrega,
    link,
    custoPorItem: link ? CUSTO_COM_LINK : 1,
    /* a mesma confirmação com o fetch contado (o orçamento de subpedidos da reconciliação) */
    contada: contar => criarConfirmacao({ chave, fetch: contar(buscar), entrega, comLink, timeoutMs }),
    /* envia UM e-mail. Devolve { enviado: true, id } ou { enviado: false, motivo }; nunca lança (só SemOrcamento) */
    async enviar({ tentativa_id, email, valor, metodo, prazo_dias, link = null }) {
      if (!ligada) return { enviado: false, motivo: 'sem chave' };
      if (!itemValido({ tentativa_id, email, valor })) return { enviado: false, motivo: 'dado inválido' };
      const t = textoDaConfirmacao({ valor, metodo, prazoDias: Number(prazo_dias), entrega, link });
      let r;
      try {
        r = await buscar(RESEND_URL, {
          method: 'POST',
          headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json', 'idempotency-key': 'confirmacao-entrada/' + tentativa_id },
          body: JSON.stringify({ from: REMETENTE, to: [email], reply_to: RESPONDER_PARA, subject: t.assunto, html: t.html, text: t.texto }),
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (e) {
        if (e instanceof SemOrcamento) throw e;
        return { enviado: false, motivo: motivoDoErro(e) };
      }
      if (!r.ok) return { enviado: false, motivo: 'http ' + r.status };
      const corpo = await r.json().catch(() => null);
      return { enviado: true, id: corpo && typeof corpo.id === 'string' ? corpo.id.slice(0, 80) : null };
    }
  };
}

/* o link só em produção: ele aponta para ORIGEM_SITE, e o hash fica no banco de quem enviou (numa prévia, o link abriria a produção sem o pedido) */
export const confirmacaoDoAmbiente = env => criarConfirmacao({ chave: env && env.RESEND_API_KEY, entrega: entregaLigada(env), comLink: ambienteDe(env) === 'producao' });

/* reserva no banco (uma vez por entrada paga) e envia o que veio. `filtro`: { provedor_order_id } (o caminho do aviso, da
   consulta e da criação) ou { limite } (a varredura da reconciliação). Devolve a contagem; nunca lança (só SemOrcamento) */
export async function confirmarEntradas({ banco, confirmacao, provedor, filtro }) {
  const resumo = { enviadas: 0, falhas: 0 };
  if (!confirmacao || !confirmacao.ligada) {
    console.warn(JSON.stringify({ origem: 'pagamentos', nivel: 'aviso', evento: 'confirmação da entrada não enviada: sem RESEND_API_KEY' }));
    return resumo;
  }
  let itens;
  try { itens = ((await banco('pagamentos_reservar_confirmacao', { provedor, ...filtro })) || {}).itens || []; }
  catch (e) {
    if (e instanceof SemOrcamento) throw e;
    console.error('[pagamentos] confirmação da entrada: a reserva falhou:', (e && e.codigo) || 'erro');
    return resumo;
  }
  for (const item of itens) {
    const pedido = confirmacao.link && itemValido(item) ? await linkParaOEmail(banco, item.tentativa_id) : null;
    const r = await confirmacao.enviar(pedido ? { ...item, link: pedido.link } : item);
    if (!r.enviado && pedido && /^http /.test(r.motivo)) await desfazerLink(banco, item.tentativa_id, pedido.hash);
    if (r.enviado) { resumo.enviadas++; continue; }
    resumo.falhas++;
    /* uma linha estruturada, fácil de achar no log do Worker (o dono e o vigia procuram "origem":"confirmacao" com "falha":true);
       só o motivo (texto fixo deste módulo) e o id da tentativa: nunca o e-mail, a chave ou o valor */
    console.error(JSON.stringify({ origem: 'confirmacao', nivel: 'erro', evento: 'confirmação da entrada não saiu', falha: true, motivo: r.motivo,
      tentativa_id: UUID.test(String(item && item.tentativa_id)) ? item.tentativa_id : null }));
  }
  return resumo;
}

const logDoLink = (evento, tentativa_id, e) => console.error(JSON.stringify({ origem: 'confirmacao', nivel: 'aviso', evento,
  motivo: (e && e.codigo) || 'erro', tentativa_id: UUID.test(String(tentativa_id)) ? tentativa_id : null }));

/* o link do pedido para o e-mail: { link, hash } se o banco o criou agora; null se a conversa já tem um (o do cliente fica) ou se o banco
   falhou (o e-mail sai sem link, com a frase de antes). O código fica só no retorno: o banco recebe o hash e o log, nada dele */
async function linkParaOEmail(banco, tentativa_id) {
  const codigo = novoCodigoLink(), hash = hashDoLink(codigo);
  try {
    const r = await banco('pagamentos_link_da_confirmacao', { tentativa_id, codigo_hash: hash });
    return r && r.criado === true ? { link: linkDoPedido(codigo), hash } : null;
  } catch (e) {
    if (e instanceof SemOrcamento) throw e;
    logDoLink('link do pedido não criado para o e-mail', tentativa_id, e);
    return null;
  }
}
/* o Resend recusou: o e-mail não saiu, então o link criado para ele não chegou a ninguém (a página volta a gerar o dela) */
async function desfazerLink(banco, tentativa_id, hash) {
  try { await banco('pagamentos_link_da_confirmacao', { tentativa_id, codigo_hash: hash, desfazer: true }); }
  catch (e) {
    if (e instanceof SemOrcamento) throw e;
    logDoLink('link do e-mail que não saiu não foi desfeito', tentativa_id, e);
  }
}
