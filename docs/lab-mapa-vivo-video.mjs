// Vídeo do laboratório do Mapa vivo v2 (fase 0), SEM som: node docs/lab-mapa-vivo-video.mjs <caso> <arquivo.mp4>
// Mesmo método de docs/lab-planta-v2-video.mjs: a página roda LENTO vezes mais devagar (animações pelo DevTools, relógios do laboratório pelo
// ?lento=N), o script tira fotos em 2x o mais rápido que der, guarda a hora real de cada uma e monta o vídeo no tempo da página.
// O relógio na tela mostra o tempo real de cada passo (a anotação chega com o atraso de ?latencia=, sem esconder).
// Precisa de CHROMIUM e FFMPEG.
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const [caso = 'clinica', saida = 'mapa-vivo.mp4'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:8899', FFMPEG = process.env.FFMPEG;
if (!FFMPEG) throw new Error('defina FFMPEG');
const LENTO = Number(process.env.LENTO || 6), FPS = 30, SOBRA_S = 1.5, MAX_S = 60, DPR = 2;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(String(e)));
const cdp = await ctx.newCDPSession(pg);
await cdp.send('Animation.enable');
await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / LENTO });
await pg.goto(`${BASE}/docs/lab-mapa-vivo.html?caso=${caso}&captura=1&auto=1&teclado=1&lento=${LENTO}`, { timeout: 120000 });
await pg.evaluate(() => document.fonts.ready.then(() => true));

const tmp = await mkdtemp(join(tmpdir(), 'mapa-vivo-quadros-'));
const fotos = [];
let real0 = null, fimReal = null;
const noVideo = ms => ms / LENTO / 1000;
for (;;) {
  const a = Date.now();
  /* a área de baixo (caixa, peças, anotação) acima do teclado: a página rola sozinha para mostrar o fim */
  await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const v = (await cdp.send('Page.getLayoutMetrics')).cssVisualViewport;
  const foto = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: v.pageX, y: v.pageY, width: v.clientWidth, height: v.clientHeight, scale: DPR } });
  const t = (a + Date.now()) / 2;
  const espera = 1000 / FPS * LENTO - (Date.now() - a);
  if (espera > 0) await new Promise(ok => setTimeout(ok, espera));
  if (real0 == null) real0 = t;
  const nome = join(tmp, `f${String(fotos.length).padStart(5, '0')}.jpg`);
  await writeFile(nome, Buffer.from(foto.data, 'base64'));
  fotos.push({ nome, t: noVideo(t - real0) });
  if (fimReal == null && fotos.length % 10 === 0 && await pg.evaluate(() => !!(window.LAB && window.LAB.estado.fim))) fimReal = t;
  if (fimReal != null && noVideo(t - fimReal) > SOBRA_S) break;
  if (noVideo(t - real0) > MAX_S) { erros.push('passou do tempo máximo'); break; }
}
await b.close();
let lista = '';
fotos.forEach((f, i) => { const d = i < fotos.length - 1 ? fotos[i + 1].t - f.t : 0.3; lista += `file '${f.nome.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`; });
lista += `file '${fotos[fotos.length - 1].nome.replace(/\\/g, '/')}'\n`;
await writeFile(join(tmp, 'lista.txt'), lista);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'lista.txt'),
  '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-fps_mode', 'cfr', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', saida]);
await rm(tmp, { recursive: true, force: true });
const dur = fotos[fotos.length - 1].t;
console.log(JSON.stringify({ saida, fotos: fotos.length, duracao_s: +dur.toFixed(1), qps_medio: +(fotos.length / dur).toFixed(1), erros }));
