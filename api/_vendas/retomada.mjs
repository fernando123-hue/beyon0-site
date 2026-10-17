/* ==========================================================================
   O LINK DE RETOMADA (PR 2b-2; spec docs/specs/2026-10-11-orcamento-sem-ia.md §3, "Espera útil"). O aviso de
   "prontos" leva <origem>/orcamento#retomar=<código>: 24 bytes sorteados (192 bits, não se adivinha), em base64url
   (32 caracteres, sem nada a escapar na URL). O banco guarda só o SHA-256 (com um prefixo próprio, para o mesmo
   texto não valer como hash de outra coisa); o código em claro só existe na mensagem do dono e no aparelho do
   cliente. No FRAGMENTO (#) da URL ele não vai ao servidor no carregamento da página, nem ao log, nem ao Referer.
   ========================================================================== */
import { randomBytes, createHash } from 'node:crypto';

export const DIAS_RETOMADA = 7;
export const CODIGO_RETOMADA = /^[A-Za-z0-9_-]{32}$/;
export const novoCodigoRetomada = () => randomBytes(24).toString('base64url');
export const hashDaRetomada = codigo => createHash('sha256').update('bz-retomada|' + codigo).digest('hex');
