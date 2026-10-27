/* ==========================================================================
   O CÓDIGO DO LINK DO PEDIDO (PR 3b-2; spec §1 e §8). Como a retomada (api/_vendas/retomada.mjs): 24 bytes sorteados (192
   bits), base64url (32 caracteres). O banco guarda só o SHA-256, com prefixo PRÓPRIO (o mesmo texto não vale como hash da
   retomada). Vai no FRAGMENTO (#pedido=<código>) da URL: não vai ao servidor no carregamento, nem ao log, nem ao Referer.
   ========================================================================== */
import { randomBytes, createHash } from 'node:crypto';

export const CODIGO_LINK = /^[A-Za-z0-9_-]{32}$/;
export const novoCodigoLink = () => randomBytes(24).toString('base64url');
export const hashDoLink = codigo => createHash('sha256').update('bz-pedido|' + codigo).digest('hex');
