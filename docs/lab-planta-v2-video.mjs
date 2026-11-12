// Vídeo do laboratório da planta viva v2, COM o som: node docs/lab-planta-v2-video.mjs <cel|pc> <nicho> <arquivo.mp4>
// Os quadros vêm do próprio Chrome (CDP Page.startScreencast, JPEG 92, com a hora de cada quadro); o som é o MESMO motor de
// docs/lab-planta-v2-som.js, refeito num OfflineAudioContext a partir do registro de cada som pedido (Date.now()), alinhado à hora dos quadros.
// O ffmpeg (FFMPEG=..., o do Remotion em 03 Projetos/video-matriz serve) junta os dois em MP4 (H.264 + AAC, 30 qps).
// Antes de gravar, confira a carga da máquina: com a CPU cheia o Chrome perde quadros.
import { chromium } from 'playwright';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const [formato = 'cel', nicho = 'clinica', saida = 'planta.mp4'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:8917';
const FFMPEG = process.env.FFMPEG;
if (!FFMPEG) throw new Error('defina FFMPEG com o caminho do ffmpeg.exe');
const cel = formato === 'cel';
const vp = cel ? { width: 390, height: 844 } : { width: 1280, height: 800 }, dpr = cel ? 2 : 1.5;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: cel, hasTouch: cel });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(String(e)));
pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.text()); });
const cdp = await ctx.newCDPSession(pg);
const quadros = [];
cdp.on('Page.screencastFrame', async f => {
  quadros.push({ dados: f.data, t: f.metadata.timestamp });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* a sessão fechou */ }
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(vp.width * dpr), maxHeight: Math.round(vp.height * dpr), everyNthFrame: 1 });
await pg.goto(`${BASE}/docs/lab-planta-v2.html?nicho=${nicho}&captura=1&auto=1${process.env.EXTRA || ''}`, { timeout: 120000 });
await pg.waitForFunction(() => window.LAB && window.LAB.estado.fim, null, { timeout: 240000, polling: 250 });
await pg.waitForTimeout(1500);
await cdp.send('Page.stopScreencast');
if (!quadros.length) throw new Error('nenhum quadro');

const t0 = quadros[0].t * 1000, tFim = quadros[quadros.length - 1].t * 1000 + 600, dur = (tFim - t0) / 1000;
const registro = await pg.evaluate(() => window.BZPlantaSom ? window.BZPlantaSom.registro.slice() : []);
const wav64 = await pg.evaluate(([r, a, d]) => window.BZPlantaSom.renderizar(r, a, d), [registro, t0, dur]);
await b.close();

const tmp = await mkdtemp(join(tmpdir(), 'planta-v2-'));
let lista = '';
for (let i = 0; i < quadros.length; i++) {
  const nome = join(tmp, `q${String(i).padStart(5, '0')}.jpg`);
  await writeFile(nome, Buffer.from(quadros[i].dados, 'base64'));
  const d = i < quadros.length - 1 ? quadros[i + 1].t - quadros[i].t : 0.6;
  lista += `file '${nome.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`;
}
lista += `file '${join(tmp, `q${String(quadros.length - 1).padStart(5, '0')}.jpg`).replace(/\\/g, '/')}'\n`;
await writeFile(join(tmp, 'lista.txt'), lista);
await writeFile(join(tmp, 'som.wav'), Buffer.from(wav64, 'base64'));
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'lista.txt'), '-i', join(tmp, 'som.wav'),
  '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', saida]);
await rm(tmp, { recursive: true, force: true });
const intervalos = quadros.slice(1).map((q, i) => q.t - quadros[i].t).filter(d => d > 0);
console.log(JSON.stringify({ saida, quadros: quadros.length, duracao_s: +dur.toFixed(1), sons: registro.length, maior_vao_ms: Math.round(Math.max(...intervalos) * 1000), erros }));
