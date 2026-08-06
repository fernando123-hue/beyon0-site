/* BOOT — o único módulo que conhece o DOM e o hero.

   Sequência obrigatória: qualquer falha desiste em silêncio e o SVG estático
   permanece visível. Este módulo NUNCA lança — o resto do site não pode nem
   ficar sabendo que o 3D não subiu.

   Ele também é o único ponto que ESCREVE na ponte: `coreAnchor`, a posição do
   reator na viewport. O campo de partículas do site orbita essa âncora; sem
   ela as partículas voltariam ao centro da tela e o hero perderia o eixo. */
import { createStage } from './stage.js';
import { createMaterials } from './materials.js';
import { createReactor } from './reactor.js';

const SEL_CANVAS = '.hero__reactor3d';
const SEL_FALLBACK = '.hero__reactor-fallback';

export function boot(doc, bridge) {
  if (!bridge || !bridge.field || typeof bridge.plasmaColor !== 'function') {
    return { ok: false, reason: 'sem-ponte' };
  }
  const canvas = doc.querySelector(SEL_CANVAS);
  if (!canvas) return { ok: false, reason: 'sem-canvas' };

  const stage = createStage(canvas);
  if (!stage) return { ok: false, reason: 'sem-webgl' };

  let mats, reactor;
  try {
    mats = createMaterials(bridge.plasmaColor);
    reactor = createReactor(stage, mats);
  } catch (e) {
    stage.dispose();
    return { ok: false, reason: 'erro-montagem' };
  }

  /* só a partir daqui o 3D assume: o SVG some depois de a cena existir, nunca
     antes — se a montagem falhasse, o hero ficaria vazio */
  const fallback = doc.querySelector(SEL_FALLBACK);
  if (fallback && fallback.style) fallback.style.display = 'none';

  const field = bridge.field;
  let last = 0;
  let lastQuality = -1;

  function measure() {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    stage.resize(w, h);
    const r = canvas.getBoundingClientRect
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: w, height: h };
    field.coreAnchor = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function tick(now) {
    if (typeof document !== 'undefined' && document.hidden) return;
    const dt = last ? Math.min(60, now - last) : 16;
    last = now;

    /* watchQuality é uma via só, então na prática isto dispara poucas vezes na
       vida da página — mas o gate evita reescrever a cena todo frame */
    const q = field.quality == null ? 1 : field.quality;
    if (q !== lastQuality) {
      lastQuality = q;
      stage.setQuality(q);
      reactor.setQuality(q);
    }

    measure();
    reactor.tick(
      field.core || {},
      field.E == null ? 0 : field.E,
      (field.sing && field.sing.warmth) || 0,
      dt
    );
    stage.render();
  }

  measure();

  if (bridge.reduced) {
    /* presença sem movimento: monta, desenha uma vez, e não entra no loop */
    reactor.setQuality(field.quality == null ? 1 : field.quality);
    reactor.tick(field.core || {}, 0, 0, 16);
    stage.render();
    return { ok: true, stage, reactor, tick };
  }

  field.add(tick);          /* UM rAF só: quem gira o loop é o organismo */
  return { ok: true, stage, reactor, tick };
}
