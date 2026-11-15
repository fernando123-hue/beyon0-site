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
   ========================================================================== */
import { entregaLigada } from '../_material/interruptor.mjs';
import { SemOrcamento } from '../_orcamento.mjs';

export const RESEND_URL = 'https://api.resend.com/emails';
export const REMETENTE = 'Beyon Zero <pedidos@beyonzero.com.br>';
export const RESPONDER_PARA = 'contato.beyon.zero@gmail.com';
export const TEMPO_MAXIMO_MS = 5000;   /* o pagamento já está gravado; isto só segura a resposta do aviso */
const PRAZO_DIAS_MAX = 60;             /* (o check de app.propostas.prazo_dias) */
const CHAVE_VALIDA = /^[A-Za-z0-9_-]{8,200}$/;
const EMAIL = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMO_PAGOU = { pix: 'pelo Pix', cartao: 'no cartão' };
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escaparHtml = s => String(s).replace(/[&<>"']/g, c => ESCAPES[c]);
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = v => BRL.format(v).replace(/\s/g, ' ');
const valorValido = v => Number.isFinite(Number(v)) && Number(v) > 0 && v !== '' && v !== null;

/* o corpo do HTML: um parágrafo por item, tudo escapado; sem imagem, sem link de rastreio, sem estilo inline de layout */
export function htmlDe(paragrafos) {
  const corpo = paragrafos.map(p => '<p>' + escaparHtml(p).replace(/\n/g, '<br>') + '</p>').join('\n');
  return '<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="utf-8"></head><body>\n' + corpo + '\n</body></html>';
}

/* o texto (voz humana: curto, falado, uma coisa por frase; o prazo só se a proposta o define) */
export function textoDaConfirmacao({ valor, metodo, prazoDias, entrega }) {
  const como = COMO_PAGOU[metodo] ? ', ' + COMO_PAGOU[metodo] : '';
  const prazo = Number.isInteger(prazoDias) && prazoDias >= 1 && prazoDias <= PRAZO_DIAS_MAX
    ? ' O prazo de entrega é de até ' + prazoDias + (prazoDias === 1 ? ' dia útil' : ' dias úteis') + ', contados a partir do envio do material.'
    : '';
  const passo = entrega
    ? 'Agora a gente precisa do seu material, como o logo e as fotos. Você envia pela página do pedido, a mesma em que fez o pagamento.' + prazo
    : 'Agora a gente entra em contato com você para combinar o material, como o logo e as fotos.' + prazo;
  const paragrafos = [
    'Olá,',
    'Recebemos a entrada do seu site: ' + dinheiro(Number(valor)) + como + '.',
    passo,
    'Para falar com a gente, é só responder este e-mail.',
    'Beyon Zero\nbeyonzero.com.br'
  ];
  return { assunto: 'Recebemos a entrada do seu site', texto: paragrafos.join('\n\n') + '\n', html: htmlDe(paragrafos) };
}

const motivoDoErro = e => (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) ? 'tempo' : 'rede';

export function criarConfirmacao({ chave, fetch: buscar = globalThis.fetch, entrega = false, timeoutMs = TEMPO_MAXIMO_MS } = {}) {
  const ligada = typeof chave === 'string' && CHAVE_VALIDA.test(chave) && typeof buscar === 'function';
  return {
    ligada,
    entrega: !!entrega,
    /* a mesma confirmação com o fetch contado (o orçamento de subpedidos da reconciliação) */
    contada: contar => criarConfirmacao({ chave, fetch: contar(buscar), entrega, timeoutMs }),
    /* envia UM e-mail. Devolve { enviado: true, id } ou { enviado: false, motivo }; nunca lança (só SemOrcamento) */
    async enviar({ tentativa_id, email, valor, metodo, prazo_dias }) {
      if (!ligada) return { enviado: false, motivo: 'sem chave' };
      if (!UUID.test(String(tentativa_id || '')) || typeof email !== 'string' || email.length > 254 || !EMAIL.test(email) || !valorValido(valor)) {
        return { enviado: false, motivo: 'dado inválido' };
      }
      const t = textoDaConfirmacao({ valor, metodo, prazoDias: Number(prazo_dias), entrega });
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

export const confirmacaoDoAmbiente = env => criarConfirmacao({ chave: env && env.RESEND_API_KEY, entrega: entregaLigada(env) });

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
    const r = await confirmacao.enviar(item);
    if (r.enviado) { resumo.enviadas++; continue; }
    resumo.falhas++;
    console.error('[pagamentos] confirmação da entrada não saiu:', r.motivo, 'tentativa', String(item && item.tentativa_id).slice(0, 36));
  }
  return resumo;
}
