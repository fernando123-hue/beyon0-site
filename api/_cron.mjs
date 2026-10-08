/* ==========================================================================
   O SEGREDO DAS ROTINAS AGENDADAS (CRON_SECRET), comum à rotina diária
   (api/rotinas.mjs) e à reconciliação dos pagamentos (api/pagamentos.mjs).
   Revisão de segurança do PR #1, B3: aceitava 16 caracteres e as tentativas
   erradas não tinham freio.
   • Mínimo de 32 caracteres (depois de tirar espaço e quebra de linha
     colados por engano no painel): menos que isso, a rotina fica DESLIGADA
     (nunca "aberta").
   • Comparação em tempo constante.
   • Tentativa errada conta por IP: 10 em 10 min e o IP leva 429. A certa não
     conta, então o agendador de verdade (outros IPs) não é afetado.
   ========================================================================== */
import { timingSafeEqual } from 'node:crypto';
import { criarFreio, ipDe } from './_freio.mjs';

const MINIMO = 32;
const freioErros = criarFreio({ max: 10, janelaMs: 10 * 60e3 });

export function segredoDoCron(env = {}) {
  const s = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';
  return s.length >= MINIMO ? s : null;
}

const iguaisSeguro = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/* 'ok' | 'negado' (401) | 'freado' (429) */
export function conferirCron(request, segredo) {
  if (segredo && iguaisSeguro(request.headers.get('authorization') || '', 'Bearer ' + segredo)) return 'ok';
  /* rotina desligada por configuração: avisa no log (sem o valor), senão a retenção, os alertas e a reconciliação
     param calados (revisão técnica do PR 11) */
  if (!segredo) console.error(JSON.stringify({ origem: 'cron', nivel: 'erro', evento: 'rotina desligada: CRON_SECRET ausente ou com menos de ' + MINIMO + ' caracteres' }));
  return freioErros(ipDe(request)) ? 'freado' : 'negado';
}
