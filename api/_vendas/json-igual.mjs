/* o mesmo JSON sem depender da ordem das chaves (o jsonb volta do banco com as chaves na ordem dele): o pacote gravado de novo
   (duplo toque, outra aba) não vira outra estimativa. Usado pelo confirmar-pacote (fluxo.mjs) e pelos extras na conversa (fluxo-extras.mjs) */
const canonico = v => (Array.isArray(v) ? v.map(canonico)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v);
export const mesmoJson = (a, b) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
