/* ==========================================================================
   A ESTRUTURA INTEIRA DA IMAGEM (PR 3b-2; spec §6 e §8). O Worker só lê 16 bytes; o arquivo cortado no meio é pego AQUI,
   no PC do dono, antes de a captação receber. São os três percorredores de captacao/entrega/imagens.mjs (marcadoresJpeg,
   pedacosPng, pedacosWebp), COPIADOS sem mudar a lógica, mais `estruturaCompleta`. Mudou lá, mude aqui (o teste
   docs/testes/entregas-dono.test.mjs cobre os casos de arquivo cortado).
   ========================================================================== */
import { tipoPorBytes } from '../api/_material/bytes.mjs';

const SEM_TAMANHO_JPEG = marcador => marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7); // TEM e RSTn

function marcadoresJpeg(b) {
  const marcadores = [];
  let i = 2;
  for (;;) {
    while (i + 1 < b.length && b[i] === 0xff && b[i + 1] === 0xff) i++; // bytes de enchimento 0xFF antes do marcador
    if (i + 2 > b.length || b[i] !== 0xff) return null;
    const marcador = b[i + 1];
    if (marcador === 0xda || marcador === 0xd9) return marcadores;
    if (marcador === 0x00) return null; // FF 00 não é marcador
    marcadores.push(marcador);
    if (SEM_TAMANHO_JPEG(marcador)) { i += 2; continue; }
    if (i + 4 > b.length) return null;
    const tamanho = b.readUInt16BE(i + 2);
    if (tamanho < 2 || i + 2 + tamanho > b.length) return null;
    i += 2 + tamanho;
  }
}

function pedacosPng(b) {
  const nomes = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const tipo = b.toString('latin1', i + 4, i + 8);
    const fimDoPedaco = i + 12 + b.readUInt32BE(i);
    if (fimDoPedaco > b.length) return null;
    nomes.push(tipo);
    if (tipo === 'IEND') return nomes;
    i = fimDoPedaco;
  }
  return null;
}

function pedacosWebp(b) {
  const nomes = [];
  let i = 12;
  while (i < b.length) {
    if (i + 8 > b.length) return null;
    const tamanho = b.readUInt32LE(i + 4);
    nomes.push(b.toString('latin1', i, i + 4));
    i += 8 + tamanho + (tamanho % 2);
  }
  return i === b.length ? nomes : null;
}

/* a estrutura chega ao fim legítimo? (SOS/EOI no JPEG, IEND no PNG, fim exato do arquivo no WebP) */
export function estruturaCompleta(b) {
  if (!Buffer.isBuffer(b)) return false;
  const tipo = tipoPorBytes(b.subarray(0, 16));
  if (tipo === 'png') return pedacosPng(b) !== null;
  if (tipo === 'jpg') return marcadoresJpeg(b) !== null;
  if (tipo === 'webp') return pedacosWebp(b) !== null;
  return false;
}
