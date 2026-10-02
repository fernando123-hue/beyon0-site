/* Laboratório do AI Core: monta a cena num canvas e desenha um quadro
   parado (parâmetros da URL; campo e onda: ?cx=.3&cy=.2&cf=1&tx=0&ty=0&tt=.3)
   ou o boot ao vivo (?anim=1, com o gesto: ponteiro, toque e onda no
   próprio canvas). Só ferramenta (fora do deploy, ver .vercelignore). */
import { criarCena, pedirContexto } from './cena.js';
import { criarGesto } from './gesto.js';

const q = new URLSearchParams(location.search);
const n = (k, padrao) => (q.has(k) ? parseFloat(q.get(k)) : padrao);
const canvas = document.querySelector('[data-lab]');
const info = document.querySelector('[data-lab-info]');
const gl = pedirContexto(canvas, true);
const cena = gl && criarCena(canvas, gl, { celular: q.has('celular') });

if (!cena) {
  info.textContent = 'sem WebGL';
} else {
  const estado = { t: n('t', 12), montagem: n('m', 1), abertura: n('a', 0), ignicao: n('ig', 1), desdeIgnicao: n('d', 99), px: n('px', 0), py: n('py', 0),
    campo: { x: n('cx', 0), y: n('cy', 0), f: n('cf', 0) }, toque: { x: n('tx', 0), y: n('ty', 0), t: n('tt', -1) }, giroExtra: n('g', 0) };
  if (q.has('anim')) {
    const t0 = performance.now();
    const gesto = criarGesto(cena, canvas, canvas, { fino: true });
    addEventListener('resize', () => { cena.medir(); gesto.medir(); });
    let antes = t0;
    const quadro = (agora) => {
      const s = (agora - t0) / 1000;
      gesto.passo(Math.min(0.05, (agora - antes) / 1000), estado);
      antes = agora;
      estado.t = s;
      estado.montagem = 1 - (1 - Math.min(1, s / 1.3)) ** 3;
      estado.desdeIgnicao = s - 1.05;
      estado.ignicao = s < 1.05 ? 0 : Math.min(1, (s - 1.05) / 0.35);
      cena.desenhar(estado);
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  } else {
    cena.desenhar(estado);
  }
  const i = cena.info();
  info.textContent = `three.js · ${i.chamadas} chamadas · ${i.triangulos} triângulos`;
  window.__nucleo = { pronto: true, info: i, estado };
}
