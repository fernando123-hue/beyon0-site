/* ==========================================================================
   AI CORE — o gesto. Ponteiro, dedo, toque e rolagem viram o estado que
   pecas.js desenha: `campo` (a força no plano do reator), `toque` (a onda)
   e `giroExtra` (o impulso da rolagem). Pedido do dono: "bastante
   interativo".

   Os handlers só anotam coordenadas; a leitura de layout (o retângulo do
   canvas) acontece em `medir()`, chamada por quem já mede (boot.js no
   quadro em que algo mudou de tamanho). Um laço só: `passo(dt, estado)`.

   No celular o dedo é o ponteiro enquanto está na tela; quando o navegador
   assume a rolagem chega `pointercancel` e o campo se desfaz sozinho. Um
   toque curto, sem arrastar, no reator, solta a onda.
   ========================================================================== */

/* a mola do campo: criticamente amortecida (chega sem passar do ponto), ω
   ≈ 7,7/s, assenta em ~0,6 s. Mais dura, o núcleo grudava no cursor; mais
   mole, o campo parecia atrasado demais em relação à mão */
const MOLA = 60;
const AMORTECE = 2 * Math.sqrt(MOLA);
/* o olhar do núcleo: mais mole que o campo (um olho acompanha com atraso) */
const MOLA_OLHAR = 22;
const AMORTECE_OLHAR = 2 * Math.sqrt(MOLA_OLHAR);
const FORCA_SOBE = 4;      /* /s: o campo aparece... */
const FORCA_DESCE = 1.6;   /* ...e se desfaz mais devagar, como água assentando */
const ALCANCE = 1.35;      /* raio do reator (spec) onde o ponteiro ainda age */
const TOQUE_PX = 10;       /* um toque é curto e quase parado; mais que isso é arrasto ou rolagem */
const TOQUE_MS = 450;
const GIRO_PX = 0.0012;    /* rad/s de giro a mais por px rolado num quadro */
const GIRO_TETO = 0.9;     /* rad/s: rolagem forte não vira hélice */
const GIRO_SOLTA = 1.3;    /* /s: o impulso morre aos poucos (inércia) */
/* a AGITAÇÃO (pedido do dono, 2026-10-03: "quando clicássemos demais no
   núcleo, a rotação geral dele começasse a acelerar"): a partir do 3º toque
   em JANELA s, cada toque soma `passo` à agitação (0–1); ela gira a roda a
   mais até `giro` rad/s e se acalma devagar (`acalma`/s). B.agitacao leva
   o valor ao mini e ao campo */
const AGITA = { janela: 2.4, desde: 3, passo: 0.22, giro: 2.2, acalma: 0.32 };

const suave = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

export function criarGesto(cena, canvas, alvoEventos, { fino = false, ouvir } = {}) {
  const liga = ouvir || ((a, ev, fn, op) => a.addEventListener(ev, fn, op));
  const ponteiro = { cx: 0, cy: 0, ativo: false };
  const pendente = { cx: 0, cy: 0, novo: false };
  const inicio = { cx: 0, cy: 0, ms: 0, id: -1 };
  const ret = { x: 0, y: 0, w: 1, h: 1 };   /* o canvas, em coordenadas da PÁGINA */
  const ponto = { x: 0, y: 0 };
  const vel = { x: 0, y: 0 };
  const velOlhar = { x: 0, y: 0 };
  let rolagem = window.scrollY, rolagemAntes = rolagem, impulso = 0, relogio = 0, agitacao = 0;
  const toques = [];

  function medir() {
    const r = canvas.getBoundingClientRect();
    ret.x = r.left + window.scrollX;
    ret.y = r.top + window.scrollY;
    ret.w = Math.max(1, r.width);
    ret.h = Math.max(1, r.height);
  }

  /* coordenadas da janela → plano do reator (false se o raio não cruza) */
  function noPlano(cx, cy, saida) {
    const x = ((cx + window.scrollX - ret.x) / ret.w) * 2 - 1;
    const y = 1 - ((cy + rolagem - ret.y) / ret.h) * 2;
    return cena.projetar(x, y, saida);
  }
  /* ...e só se cair no reator (onde o campo e o toque agem) */
  const dentroDoReator = (p) => Math.hypot(p.x, p.y) < ALCANCE;
  const noReator = (cx, cy, saida) => noPlano(cx, cy, saida) && dentroDoReator(saida);

  const anotar = (e) => { ponteiro.cx = e.clientX; ponteiro.cy = e.clientY; ponteiro.ativo = true; };
  if (fino) {
    liga(alvoEventos, 'pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') anotar(e); }, { passive: true });
    liga(alvoEventos, 'pointerleave', () => { ponteiro.ativo = false; }, { passive: true });
  }
  liga(alvoEventos, 'pointerdown', (e) => {
    inicio.cx = e.clientX; inicio.cy = e.clientY; inicio.ms = e.timeStamp; inicio.id = e.pointerId;
    if (e.pointerType === 'touch') anotar(e);
  }, { passive: true });
  liga(alvoEventos, 'pointermove', (e) => { if (e.pointerType === 'touch' && e.pointerId === inicio.id) anotar(e); }, { passive: true });
  liga(alvoEventos, 'pointerup', (e) => {
    if (e.pointerId === inicio.id && e.timeStamp - inicio.ms < TOQUE_MS &&
        Math.hypot(e.clientX - inicio.cx, e.clientY - inicio.cy) < TOQUE_PX) {
      pendente.cx = e.clientX; pendente.cy = e.clientY; pendente.novo = true;
    }
    inicio.id = -1;
    if (e.pointerType === 'touch') ponteiro.ativo = false;
  }, { passive: true });
  liga(alvoEventos, 'pointercancel', (e) => { inicio.id = -1; if (e.pointerType === 'touch') ponteiro.ativo = false; }, { passive: true });
  liga(window, 'scroll', () => { rolagem = window.scrollY; }, { passive: true });

  /* um quadro: dt em s; escreve olhar, campo, toque e giroExtra em `e` */
  function passo(dt, e) {
    const c = e.campo || (e.campo = { x: 0, y: 0, f: 0 });
    const tq = e.toque || (e.toque = { x: 0, y: 0, t: -1 });
    const o = e.olhar || (e.olhar = { x: 0, y: 0, f: 0 });

    /* o olhar: em qualquer ponto do hero o núcleo vai na direção do cursor
       (ou do dedo); dentro do reator até onde ele está, fora só a direção
       (comprimento 1). Sem cursor, volta ao centro */
    let ox = 0, oy = 0;
    const visto = ponteiro.ativo && noPlano(ponteiro.cx, ponteiro.cy, ponto);
    if (visto) {
      const r = Math.hypot(ponto.x, ponto.y), k = r > 1 ? 1 / r : 1;
      ox = ponto.x * k; oy = ponto.y * k;
    }
    velOlhar.x += (MOLA_OLHAR * (ox - o.x) - AMORTECE_OLHAR * velOlhar.x) * dt;
    velOlhar.y += (MOLA_OLHAR * (oy - o.y) - AMORTECE_OLHAR * velOlhar.y) * dt;
    o.x += velOlhar.x * dt;
    o.y += velOlhar.y * dt;
    o.f += ((visto ? 1 : 0) - o.f) * Math.min(1, dt * 2);

    const dentro = visto && dentroDoReator(ponto);   /* a mesma projeção do olhar */
    if (dentro) {
      /* campo apagado: nasce onde está a mão (sem varrer o reator vindo do
         último lugar onde esteve) */
      if (c.f < 0.02) { c.x = ponto.x; c.y = ponto.y; vel.x = vel.y = 0; }
      vel.x += (MOLA * (ponto.x - c.x) - AMORTECE * vel.x) * dt;
      vel.y += (MOLA * (ponto.y - c.y) - AMORTECE * vel.y) * dt;
      c.x += vel.x * dt;
      c.y += vel.y * dt;
    }
    /* perto da borda do alcance o campo some aos poucos (sem degrau) */
    const alvoF = dentro ? suave((ALCANCE - Math.hypot(ponto.x, ponto.y)) / 0.25) : 0;
    c.f += (alvoF - c.f) * Math.min(1, dt * (alvoF > c.f ? FORCA_SOBE : FORCA_DESCE));

    relogio += dt;
    if (pendente.novo) {
      pendente.novo = false;
      if (noReator(pendente.cx, pendente.cy, ponto)) {
        tq.x = ponto.x; tq.y = ponto.y; tq.t = 0;
        toques.push(relogio);
        while (toques.length && relogio - toques[0] > AGITA.janela) toques.shift();
        if (toques.length >= AGITA.desde) {
          agitacao = Math.min(1, agitacao + AGITA.passo);
          if (window.BEYON) window.BEYON.emit('nucleo:agitado', agitacao);
        }
      }
    } else if (tq.t >= 0) {
      tq.t += dt;
    }
    agitacao *= Math.exp(-dt * AGITA.acalma);
    if (agitacao < 0.002) agitacao = 0;
    e.agitacao = agitacao;
    if (window.BEYON) window.BEYON.agitacao = agitacao;

    /* a rolagem empurra a roda; o impulso morre aos poucos */
    const rolou = Math.abs(rolagem - rolagemAntes);
    rolagemAntes = rolagem;
    impulso = Math.min(GIRO_TETO, impulso + rolou * GIRO_PX) * Math.exp(-dt * GIRO_SOLTA);
    /* a agitação acelera a roda (com a curva suave: começa de leve) */
    e.giroExtra = (e.giroExtra || 0) + (impulso + AGITA.giro * agitacao * agitacao) * dt;
  }

  medir();
  return { medir, passo };
}
