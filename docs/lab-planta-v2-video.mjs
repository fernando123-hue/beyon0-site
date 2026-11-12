// Vídeo do laboratório da planta viva v2, COM o som: node docs/lab-planta-v2-video.mjs <cel|pc> <nicho> <arquivo.mp4>
// CÂMERA LENTA CONTROLADA: a página roda N vezes mais devagar (LENTO, padrão 10): as animações pelo DevTools (Animation.setPlaybackRate, vale
// para Web Animations, animações e transições de CSS) e os relógios do laboratório pelo ?lento=N. Enquanto isso o script tira fotos na
// densidade do aparelho (2x no celular; o screencast do headless entrega 1x) o mais rápido que der, guarda a hora real de cada uma e o vídeo
// é montado no tempo da página (hora real / N). Com a máquina ocupada as fotos só ficam mais espaçadas no tempo real; no tempo do vídeo
// continuam a cada ~1/30 s ou menos. Medido 12/11: o screencast em tempo real saía em 1x e com buracos com a CPU cheia, e o controle de
// quadros (--enable-begin-frame-control) derruba a aba nesta versão do headless. A foto é a do DevTools (Page.captureScreenshot, ~40 ms):
// a page.screenshot do Playwright chegava a minutos por foto com o roteiro rodando.
// O SOM é o mesmo motor de docs/lab-planta-v2-som.js, refeito offline a partir do registro de cada som pedido, na mesma escala de tempo.
// Precisa de CHROMIUM (o chrome-headless-shell do Playwright) e FFMPEG (o do Remotion em 03 Projetos/video-matriz serve).
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const [formato = 'cel', nicho = 'clinica', saida = 'planta.mp4'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:8917', FFMPEG = process.env.FFMPEG;
if (!FFMPEG) throw new Error('defina FFMPEG');
const LENTO = Number(process.env.LENTO || 14), FPS = 30, SOBRA_S = 1.6, MAX_S = 200;
const cel = formato === 'cel';

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const DPR = cel ? 2 : 1.5;
const ctx = await b.newContext({ viewport: cel ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: DPR, isMobile: cel, hasTouch: cel });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(String(e)));
pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erros.push(m.text()); });
const cdp = await ctx.newCDPSession(pg);
await cdp.send('Animation.enable');
await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / LENTO });
await pg.goto(`${BASE}/docs/lab-planta-v2.html?nicho=${nicho}&captura=1&auto=1&lento=${LENTO}${process.env.EXTRA || ''}`, { timeout: 180000 });
await pg.evaluate(() => document.fonts.ready.then(() => true));   /* (devolver o próprio FontFaceSet travava a captura seguinte) */

const tmp = await mkdtemp(join(tmpdir(), 'planta-v2-quadros-'));
const fotos = [];
let real0 = null, fimReal = null;
const noVideo = ms => ms / LENTO / 1000;   /* ms reais -> segundos do vídeo */
for (;;) {
  const a = Date.now();
  /* sem recorte o headless devolve 1x; com o recorte da área visível (na rolagem de agora) e scale = densidade, sai em 2x */
  const v = (await cdp.send('Page.getLayoutMetrics')).cssVisualViewport;
  const clip = { x: v.pageX, y: v.pageY, width: v.clientWidth, height: v.clientHeight, scale: DPR };
  const foto = await Promise.race([cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip }), new Promise(ok => setTimeout(() => ok(null), 15000))]);
  if (!foto) { erros.push('foto passou de 15 s'); continue; }
  const buf = Buffer.from(foto.data, 'base64');
  const t = (a + Date.now()) / 2;
  const espera = 1000 / FPS * LENTO - (Date.now() - a);   /* uma foto a cada 1/30 s do vídeo; com a máquina ocupada, quando der */
  if (espera > 0) await new Promise(ok => setTimeout(ok, espera));
  if (real0 == null) real0 = t;
  const nome = join(tmp, `f${String(fotos.length).padStart(5, '0')}.jpg`);
  await writeFile(nome, buf);
  fotos.push({ nome, t: noVideo(t - real0) });
  if (fimReal == null && fotos.length % 10 === 0 && await pg.evaluate(() => !!(window.LAB && window.LAB.estado.fim))) fimReal = t;
  if (fimReal != null && noVideo(t - fimReal) > SOBRA_S) break;
  if (noVideo(t - real0) > MAX_S) { erros.push('passou do tempo máximo'); break; }
  if (fotos.length % 300 === 0) process.stderr.write(`  ${noVideo(t - real0).toFixed(1)} s de vídeo, ${fotos.length} fotos\n`);
}
const registro = await pg.evaluate(() => window.BZPlantaSom ? window.BZPlantaSom.registro.slice() : []);
const dur = fotos[fotos.length - 1].t + 0.3;
/* os sons na escala do vídeo: em (hora real da página) -> segundos do vídeo, contados da 1ª foto */
const eventos = registro.map(e => ({ nome: e.nome, k: e.k, em: noVideo(e.em - real0) * 1000 }));   /* (renderizar recebe ms a partir de t0 = 0) */
await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
const wav64 = await pg.evaluate(([ev, d]) => window.BZPlantaSom.renderizar(ev, 0, d), [eventos, dur]);
await b.close();
await writeFile(join(tmp, 'som.wav'), Buffer.from(wav64, 'base64'));

/* as fotos no tempo do vídeo: cada uma dura até a próxima (concat com duração), depois 30 qps constantes */
let lista = '';
fotos.forEach((f, i) => { const d = i < fotos.length - 1 ? fotos[i + 1].t - f.t : 0.3; lista += `file '${f.nome.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`; });
lista += `file '${fotos[fotos.length - 1].nome.replace(/\\/g, '/')}'\n`;
await writeFile(join(tmp, 'lista.txt'), lista);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'lista.txt'), '-i', join(tmp, 'som.wav'),
  '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-fps_mode', 'cfr', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', saida]);
const vaos = fotos.slice(1).map((f, i) => f.t - fotos[i].t);
if (!process.env.GUARDAR) await rm(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ saida, fotos: fotos.length, duracao_s: +dur.toFixed(1), qps_medio: +(fotos.length / dur).toFixed(1), maior_vao_ms: Math.round(Math.max(...vaos) * 1000), sons: eventos.length, quadros: process.env.GUARDAR ? tmp : undefined, erros }));
