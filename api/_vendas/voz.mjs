/* ==========================================================================
   O MICROFONE DO ZERO (18/11, dono: "na conversa com o Zero era para ter a possibilidade de mandar áudio").
   A pessoa grava um trecho (até 90 s) no navegador, o áudio vem aqui, vira TEXTO e volta para a caixa da conversa:
   ela confere, corrige e envia como qualquer mensagem. O Zero continua recebendo só texto, pelo mesmo caminho e pelos
   mesmos freios da mensagem digitada.
   • O áudio NUNCA é gravado: passa pela memória, é transcrito e descartado. O log guarda só o tamanho, o tempo e o resultado.
   • Quem transcreve: o Workers AI da própria Cloudflare (o modelo Whisper), pelo binding env.AI. Sem fornecedor novo, sem
     chave nova; o áudio não sai da Cloudflare. Sem o binding, ou com BZ_VOZ diferente de "1", o recurso some da tela.
   • Só quem tem sessão (visitante com token, que já passou pelo anti-robô) transcreve; corpo limitado a ~2 MB; freio por IP
     e por visitante; o texto devolvido é limpo como o digitado (sem controles, no máximo 2000 caracteres).
   • O servidor local usa um transcritor simulado (frase fixa) para a tela e os testes; nunca chama a Cloudflare.
   ========================================================================== */
import { ambienteDe } from '../_ambiente.mjs';

export const VOZ_MAX_BYTES = 2 * 1024 * 1024;       /* 90 s de áudio comprimido (Opus ou AAC) cabem com folga */
export const VOZ_MIN_BYTES = 1500;                  /* abaixo disso é só o clique: nada para ouvir */
export const VOZ_MAX_TEXTO = 2000;                  /* o mesmo limite da caixa de mensagem */
export const VOZ_TEMPO_MS = 25000;                  /* a transcrição de 90 s leva poucos segundos; passou disso, desiste */
export const MODELO_VOZ = '@cf/openai/whisper-large-v3-turbo';
export const TIPO_AUDIO = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|m4a|wav|x-wav)\s*(;.*)?$/i;
export const FRASE_SIMULADA = 'Tenho uma confeitaria em Niterói e quero mais encomendas pelo site.';

/* o texto que volta para a caixa: sem caracteres de controle, espaços normalizados, no máximo o tamanho da caixa */
export function limparTexto(t) {
  return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, VOZ_MAX_TEXTO);
}

const paraBase64 = buf => (typeof Buffer !== 'undefined' ? Buffer.from(buf).toString('base64') : btoa(String.fromCharCode(...new Uint8Array(buf))));

/* o transcritor do ambiente: { transcrever(buffer, tipo) → texto } ou null (recurso desligado) */
export function criarTranscritor(env) {
  if (!env) return null;
  if (ambienteDe(env) === 'local' && env.BZ_LOCAL === '1') {
    if (env.BZ_SEM_VOZ === '1') return null;
    return { simulado: true, async transcrever() { return FRASE_SIMULADA; } };
  }
  if (env.BZ_VOZ !== '1' || !env.AI || typeof env.AI.run !== 'function') return null;
  return {
    async transcrever(buffer) {
      /* (o Whisper do Workers AI recebe o áudio em base64; o idioma fixo em português evita que ele "adivinhe" outro) */
      const r = await env.AI.run(MODELO_VOZ, { audio: paraBase64(buffer), language: 'pt', task: 'transcribe', vad_filter: true });
      return r && typeof r.text === 'string' ? r.text : '';
    }
  };
}

/* lê o corpo com teto: recusa pelo Content-Length antes de ler e confere o tamanho real depois */
export async function lerAudio(request) {
  const declarado = Number(request.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > VOZ_MAX_BYTES) return { erro: 413 };
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > VOZ_MAX_BYTES) return { erro: 413 };
  if (buffer.byteLength < VOZ_MIN_BYTES) return { erro: 400 };
  return { buffer };
}

/* devolve { status, corpo }: quem chama monta a resposta (a mesma de api/vendas.mjs) */
export async function transcrever({ request, transcritor, visitantes, freios, log, requestId, tempoMs = VOZ_TEMPO_MS }) {
  if (!transcritor) return { status: 503, corpo: { erro: 'O microfone não está disponível agora. Escreva a sua mensagem.' } };
  const tipo = request.headers.get('content-type') || '';
  if (!TIPO_AUDIO.test(tipo)) return { status: 415, corpo: { erro: 'Esse tipo de áudio não é aceito.' } };
  const vid = await visitantes.quem(request);
  if (!vid) return { status: 401, corpo: { erro: 'Sessão inválida ou expirada.' } };
  if (freios.visitante(vid)) return { status: 429, corpo: { erro: 'Você gravou várias vezes seguidas. Espere um pouco ou escreva a mensagem.' } };
  const lido = await lerAudio(request);
  if (lido.erro === 413) return { status: 413, corpo: { erro: 'A gravação ficou longa demais. Grave um trecho menor.' } };
  if (lido.erro === 400) return { status: 400, corpo: { erro: 'Não consegui ouvir nada. Tente gravar de novo.' } };
  const inicio = Date.now();
  let texto = '';
  try {
    let relogio;
    const limite = new Promise((_, rej) => { relogio = setTimeout(() => rej(new Error('tempo')), tempoMs); });
    try { texto = await Promise.race([transcritor.transcrever(lido.buffer, tipo), limite]); } finally { clearTimeout(relogio); }
  } catch (e) {
    /* só o motivo, nunca o áudio nem o que o modelo ouviu */
    log('erro', { request_id: requestId, evento: 'voz falhou', motivo: e && e.message === 'tempo' ? 'tempo' : 'erro', bytes: lido.buffer.byteLength, ms: Date.now() - inicio });
    return { status: 503, corpo: { erro: 'Não consegui transcrever agora. Escreva a sua mensagem.' } };
  }
  const limpo = limparTexto(texto);
  log('info', { request_id: requestId, evento: 'voz', bytes: lido.buffer.byteLength, ms: Date.now() - inicio, vazio: !limpo, simulado: !!transcritor.simulado });
  return { status: 200, corpo: limpo ? { texto: limpo } : { texto: '', vazio: true } };
}
