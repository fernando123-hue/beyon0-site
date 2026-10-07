/* ==========================================================================
   ASSINATURA DO WEBHOOK do Mercado Pago (x-signature).
   Réplica do validador OFICIAL (mercadopago/sdk-nodejs 3.6.1,
   src/utils/webhook/index.ts), com duas decisões documentadas em
   docs/pagamentos/00-PESQUISA-E-PLANO.md (conflitos entre fontes):
   • data.id: a página de orders manda minúsculas; o SDK usa o id como veio.
     Aceita o HMAC de qualquer das duas formas (as duas exigem o segredo).
   • ts: o exemplo da documentação tem 13 dígitos (ms); o SDK trata como
     segundos. Detecta pelo tamanho. Janela: 72 h (o MP reenvia por horas;
     a defesa contra repetição de verdade é que o aviso não carrega estado:
     ele só dispara uma CONSULTA, e cada transição é idempotente no banco).
   Comparação em tempo constante. Nunca registra o segredo.
   ========================================================================== */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const JANELA_S = 72 * 3600;

function partes(cabecalho) {
  const hashes = {};
  let ts;
  for (const parte of String(cabecalho).split(',')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    const k = parte.slice(0, i).trim().toLowerCase(), v = parte.slice(i + 1).trim();
    if (!k || !v) continue;
    if (k === 'ts') ts = v;
    else if (/^v\d+$/.test(k)) hashes[k] = v;
  }
  return { ts, hashes };
}

function manifesto(dataId, requestId, ts) {
  const p = [];
  if (dataId) p.push('id:' + dataId);
  if (requestId) p.push('request-id:' + requestId);
  p.push('ts:' + ts);
  return p.join(';') + ';';
}

const igual = (a, b) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/* devolve { valido: true } ou { valido: false, motivo } (motivo sem dado sensível) */
export function verificarAssinatura({ xSignature, xRequestId, dataId, segredo, agora = Date.now(), janelaS = JANELA_S }) {
  if (!segredo || segredo.length < 16) return { valido: false, motivo: 'segredo não configurado' };
  const assinatura = typeof xSignature === 'string' ? xSignature.trim() : '';
  if (!assinatura) return { valido: false, motivo: 'sem assinatura' };
  const { ts, hashes } = partes(assinatura);
  if (!ts) return { valido: false, motivo: 'sem ts' };
  if (!/^\d{9,14}$/.test(ts)) return { valido: false, motivo: 'ts malformado' };
  const recebido = hashes.v1;
  if (!recebido || !/^[0-9a-f]{64}$/i.test(recebido)) return { valido: false, motivo: 'sem v1' };
  const req = typeof xRequestId === 'string' && xRequestId.trim() ? xRequestId.trim() : undefined;
  const id = typeof dataId === 'string' && dataId.trim() ? dataId.trim() : undefined;
  const candidatos = id && id.toLowerCase() !== id ? [id.toLowerCase(), id] : [id];
  const ok = candidatos.some(c => igual(createHmac('sha256', segredo).update(manifesto(c, req, ts)).digest('hex'), recebido.toLowerCase()));
  if (!ok) return { valido: false, motivo: 'assinatura não confere' };
  const tsMs = ts.length > 12 ? Number(ts) : Number(ts) * 1000;
  if (Math.abs(agora - tsMs) / 1000 > janelaS) return { valido: false, motivo: 'ts fora da janela' };
  return { valido: true, tsMs };
}

/* para testes e para o simulador local: assina como o Mercado Pago */
export function assinar({ dataId, requestId, ts, segredo }) {
  return 'ts=' + ts + ',v1=' + createHmac('sha256', segredo).update(manifesto(dataId, requestId, ts)).digest('hex');
}
