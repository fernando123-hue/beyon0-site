import { check, near, close } from './assert.js';
import * as THREE from '../vendor/three.module.min.js';

check('three vendorado importa e tem REVISION', () =>
  typeof THREE.REVISION === 'string' || typeof THREE.REVISION === 'number'
    ? true
    : `REVISION veio ${typeof THREE.REVISION}`
);

check('three expõe as classes que o reator precisa', () => {
  const missing = ['Scene', 'PerspectiveCamera', 'WebGLRenderer', 'Group', 'Mesh',
    'SphereGeometry', 'TorusGeometry', 'CylinderGeometry', 'ConeGeometry',
    'EdgesGeometry', 'LineSegments', 'MeshStandardMaterial', 'MeshBasicMaterial',
    'LineBasicMaterial', 'DirectionalLight', 'HemisphereLight', 'Color', 'AdditiveBlending']
    .filter((k) => THREE[k] === undefined);
  return missing.length === 0 ? true : 'faltando: ' + missing.join(', ');
});

import { createStage } from '../js3d/stage.js';

const cv = document.createElement('canvas');
cv.width = 240; cv.height = 240;
document.body.appendChild(cv);
const stage = createStage(cv);

check('createStage devolve um stage', () => (stage ? true : 'veio null — sem WebGL?'));

check('camera tem fov 35', () => near(stage.camera.fov, 35, 0.001));

check('dpr nasce limitado a 1.75', () =>
  stage.renderer.getPixelRatio() <= 1.75 ? true : `dpr ${stage.renderer.getPixelRatio()}`
);

check('add registra o objeto pelo nome', () => {
  const g = new THREE.Group();
  stage.add('teste', g);
  return stage.registry.nodes.teste === g ? true : 'nao registrou';
});

check('add com parentName aninha no pai', () => {
  const filho = new THREE.Group();
  stage.add('filho', filho, 'teste');
  return filho.parent === stage.registry.nodes.teste ? true : 'pai errado';
});

check('add registra o material pelo nome quando o objeto tem material', () => {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 4), mat);
  stage.add('comMaterial', mesh);
  return stage.registry.materials.comMaterial === mat ? true : 'nao registrou o material';
});

check('quality nasce em 1', () => near(stage.quality, 1, 0.001));

check('setQuality(0.62) desliga sombras', () => {
  stage.setQuality(0.62);
  return stage.renderer.shadowMap.enabled === false ? true : 'sombra continua ligada';
});

check('setEnvironment aplica em qualidade cheia e some quando a qualidade cai', () => {
  const tex = new THREE.Texture();
  stage.setQuality(1);
  stage.setEnvironment(tex);
  if (stage.scene.environment !== tex) return `nao aplicou em qualidade cheia: ${stage.scene.environment}`;
  stage.setQuality(0.62);
  if (stage.scene.environment !== null) return `nao removeu em qualidade baixa: ${stage.scene.environment}`;
  return stage._env === tex ? true : 'perdeu o valor desejado (_env) ao cair de qualidade';
});

check('a cena tem as duas luzes que dao volume a esfera', () =>
  stage.lights && stage.lights.key && stage.lights.key.isDirectionalLight === true &&
  stage.lights.fill && stage.lights.fill.isHemisphereLight === true
    ? true : 'faltam key/fill'
);

check('render() desenha alguma coisa (pixels acesos)', () => {
  stage.scene.background = new THREE.Color(0x00f5ff);
  stage.render();
  const gl = stage.renderer.getContext();
  const px = new Uint8Array(4);
  gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  stage.scene.background = null;
  return px[1] > 200 && px[2] > 200 ? true : `pixel veio [${px}]`;
});

import { createMaterials } from '../js3d/materials.js';

/* Stub fiel ao plasmaColor real do main.js: em w=0 devolve a rampa ciano,
   em w=1 devolve o dourado plasma. */
const REST = [[0, 245, 255], [159, 248, 255], [242, 254, 255]];
const GOLD = [[255, 208, 0], [255, 234, 159], [255, 244, 214]];
const WHITE = [255, 251, 240];
function plasmaStub(w, role) {
  const i = role | 0;
  let c1, c2, f;
  if (w < 0.5) { f = w / 0.5; c1 = REST[i]; c2 = WHITE; }
  else { f = (w - 0.5) / 0.5; c1 = WHITE; c2 = GOLD[i]; }
  return [0, 1, 2].map((k) => Math.round(c1[k] + (c2[k] - c1[k]) * f)).join(',');
}

const mats = createMaterials(plasmaStub);

/* update() e gated por mudanca real (Math.abs(warmth - _warmth) < 0.002), o
   que e o comportamento certo em producao mas deixa os testes acoplados a
   ordem: se o teste anterior ja deixou mats._warmth no valor que este quer,
   a chamada update(w) vira um no-op silencioso e o teste so passa por
   sobra de estado alheio. forceUpdate garante uma escrita real: primeiro
   pula para um warmth certamente diferente do alvo, depois aplica o alvo —
   sem tocar no gate em si (por isso o teste de gating abaixo continua
   chamando mats.update diretamente). */
function forceUpdate(w) {
  const away = w < 0.5 ? 1 : 0;
  mats.update(away);
  mats.update(w);
}

check('materiais expostos existem', () => {
  const missing = ['shell', 'rim', 'wire', 'edge', 'orbit', 'plasma', 'node']
    .filter((k) => !mats[k]);
  return missing.length === 0 ? true : 'faltando: ' + missing.join(', ');
});

check('em repouso a cor e o ciano exato da rampa', () => {
  forceUpdate(0);
  const c = mats.rim.color;
  return near(Math.round(c.r * 255), 0, 1) === true &&
         near(Math.round(c.g * 255), 245, 1) === true &&
         near(Math.round(c.b * 255), 255, 1) === true
    ? true : `veio ${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}`;
});

check('no Singular a cor vira dourado plasma', () => {
  forceUpdate(1);
  const c = mats.rim.color;
  return Math.round(c.r * 255) === 255 && Math.round(c.g * 255) === 208 && Math.round(c.b * 255) === 0
    ? true : `veio ${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}`;
});

check('volta ao ciano quando o Singular acaba', () => {
  forceUpdate(1);
  mats.update(0);
  const c = mats.rim.color;
  return Math.round(c.g * 255) === 245 && Math.round(c.b * 255) === 255
    ? true : `nao voltou: ${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}`;
});

check('shell fica escuro em repouso (albedo nao bypassa plasmaColor)', () => {
  forceUpdate(0);
  const c = mats.shell.color;
  const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
  /* escuro: bem abaixo do ciano pleno (0,245,255) de onde o tom deriva */
  return g < 60 && b < 60 ? true : `shell nao esta escuro em repouso: ${r},${g},${b}`;
});

check('shell desloca para dourado no Singular, sem perder o escurecimento', () => {
  forceUpdate(1);
  const c = mats.shell.color;
  const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
  /* dourado pleno seria 255,208,0 — escurecido deve manter a proporcao
     (vermelho dominante, azul quase nulo) mas com magnitude baixa */
  return r > g && r > b && r < 60 && b < 10
    ? true : `shell nao migrou para dourado escurecido: ${r},${g},${b}`;
});

check('rim e aditivo e desenha por dentro (fresnel barato)', () =>
  mats.rim.blending === THREE.AdditiveBlending && mats.rim.side === THREE.BackSide
    ? true : 'blending/side errados'
);

check('brackets sao linha aditiva, sem corpo preto', () =>
  mats.edge.isLineBasicMaterial === true && mats.edge.blending === THREE.AdditiveBlending
    ? true : 'edge nao e linha aditiva'
);

check('update e gated: nao reescreve com o mesmo warmth', () => {
  mats.update(0.5);
  const antes = mats._writes;
  mats.update(0.5);
  return mats._writes === antes ? true : 'reescreveu sem mudanca';
});

import { createReactor } from '../js3d/reactor.js';

const reactor = createReactor(stage, mats);

check('reactor devolve um root Group', () =>
  reactor.root && reactor.root.isGroup === true ? true : 'root nao e Group'
);

check('todas as pecas viram pivo registrado', () => {
  const esperados = ['shell__pivot', 'ring__pivot', 'orbits__pivot',
    'brackets__pivot', 'base__pivot', 'emitter__pivot', 'plasma__pivot'];
  const missing = esperados.filter((k) => !stage.registry.nodes[k]);
  return missing.length === 0 ? true : 'faltando: ' + missing.join(', ');
});

check('todo pivo e Group, nunca Mesh (alvo limpo de GSAP)', () => {
  const ruins = Object.keys(stage.registry.nodes)
    .filter((k) => k.endsWith('__pivot'))
    .filter((k) => stage.registry.nodes[k].isGroup !== true);
  return ruins.length === 0 ? true : 'nao sao Group: ' + ruins.join(', ');
});

check('pivos sao filhos do root do reator', () => {
  const p = stage.registry.nodes['shell__pivot'];
  return p.parent === reactor.root ? true : 'pai errado';
});

check('a esfera tem mesh dentro do pivo', () => {
  const p = stage.registry.nodes['shell__pivot'];
  return p.children.some((c) => c.isMesh) ? true : 'pivo sem mesh';
});

check('existem 3 orbitas', () => {
  const o = stage.registry.nodes['orbits__pivot'];
  return o.children.length === 3 ? true : `veio ${o.children.length}`;
});

check('brackets sao LineSegments (sem corpo preto)', () => {
  const b = stage.registry.nodes['brackets__pivot'];
  const todos = b.children.every((c) => c.isLineSegments === true);
  return todos && b.children.length === 4 ? true : `${b.children.length} filhos, todos linha: ${todos}`;
});

check('plasma tem nucleo e 3 eletrons', () => {
  const p = stage.registry.nodes['plasma__pivot'];
  if (p.children.length !== 4) return `veio ${p.children.length}`;
  const nucleo = p.children.filter((c) => c.name === 'nucleus');
  const eletrons = p.children.filter((c) => c.name.startsWith('electron_'));
  return nucleo.length === 1 && eletrons.length === 3
    ? true
    : `composicao errada: ${p.children.map((c) => c.name).join(', ')}`;
});

check('todo mesh registrado via stage.add aparece em nodes e materials', () => {
  const nomes = Object.keys(stage.registry.meshes);
  const semNode = nomes.filter((k) => stage.registry.nodes[k] !== stage.registry.meshes[k]);
  const semMaterial = nomes.filter((k) => stage.registry.materials[k] !== stage.registry.meshes[k].material);
  return semNode.length === 0 && semMaterial.length === 0
    ? true
    : `sem node: ${semNode.join(', ')}; sem material: ${semMaterial.join(', ')}`;
});

check('o objeto cabe no enquadramento da camera', () => {
  const box = new THREE.Box3().setFromObject(reactor.root);
  const size = box.getSize(new THREE.Vector3());
  const alturaVisivel = 2 * 6.2 * Math.tan((35 / 2) * Math.PI / 180);
  return size.y < alturaVisivel && size.x < alturaVisivel * 1.4
    ? true : `objeto ${size.x.toFixed(2)}x${size.y.toFixed(2)}, visivel ${alturaVisivel.toFixed(2)}`;
});

/* ===== Task 5 — tick: respiracao, orbitas, plasma, paralaxe ===== */

const coreStub = { pow: 0, breath: 0.5, pres: 1, strain: 0, star: 0, attX: 1, attY: 0 };

/* zera a inclinacao acumulada entre testes de paralaxe: o tick converge por
   lerp, entao sem reset um teste herda a rotacao deixada pelo anterior */
function resetRot() {
  reactor.root.rotation.set(0, 0, 0);
}

check('tick sem energia mantem escala perto de 1', () => {
  reactor.tick(coreStub, 0, 0, 16);
  const s = stage.registry.nodes['shell__pivot'].scale.x;
  return near(s, 1, 0.06);
});

check('energia alta aumenta a escala da esfera', () => {
  reactor.tick({ ...coreStub, pow: 1, breath: 1 }, 1, 0, 16);
  const s = stage.registry.nodes['shell__pivot'].scale.x;
  return s > 1.01 ? true : `escala ficou ${s.toFixed(3)}`;
});

check('a compressao pre-Singular encolhe a esfera', () => {
  reactor.tick({ ...coreStub, strain: 1 }, 0, 0, 16);
  const comprimida = stage.registry.nodes['shell__pivot'].scale.x;
  reactor.tick({ ...coreStub, strain: 0 }, 0, 0, 16);
  const solta = stage.registry.nodes['shell__pivot'].scale.x;
  return comprimida < solta ? true : `comprimida ${comprimida.toFixed(3)} >= solta ${solta.toFixed(3)}`;
});

check('as orbitas giram com o tempo', () => {
  const antes = stage.registry.nodes['orbits__pivot'].rotation.y;
  for (let i = 0; i < 10; i += 1) reactor.tick(coreStub, 0.5, 0, 16);
  const depois = stage.registry.nodes['orbits__pivot'].rotation.y;
  return depois !== antes ? true : 'orbitas paradas';
});

check('o anel gira no sentido oposto ao das orbitas', () => {
  const oAntes = stage.registry.nodes['orbits__pivot'].rotation.y;
  const rAntes = stage.registry.nodes['ring__pivot'].rotation.y;
  for (let i = 0; i < 10; i += 1) reactor.tick(coreStub, 0.5, 0, 16);
  const dOrb = stage.registry.nodes['orbits__pivot'].rotation.y - oAntes;
  const dRing = stage.registry.nodes['ring__pivot'].rotation.y - rAntes;
  return dOrb > 0 && dRing < 0 ? true : `orbitas ${dOrb.toFixed(4)}, anel ${dRing.toFixed(4)}`;
});

check('os nos percorrem as orbitas', () => {
  const n = reactor._orbitNodes[0];
  const antes = n.position.x;
  for (let i = 0; i < 10; i += 1) reactor.tick(coreStub, 0.5, 0, 16);
  return n.position.x !== antes ? true : 'no parado';
});

check('os eletrons se movem', () => {
  const e = reactor._electrons[1];
  const antes = e.position.x;
  for (let i = 0; i < 10; i += 1) reactor.tick(coreStub, 0.5, 0, 16);
  return e.position.x !== antes ? true : 'eletron parado';
});

check('a atencao do nucleo inclina o objeto (paralaxe)', () => {
  resetRot();
  for (let i = 0; i < 40; i += 1) reactor.tick({ ...coreStub, attX: 1, attY: 0 }, 0.5, 0, 16);
  const a = reactor.root.rotation.y;
  resetRot();
  for (let i = 0; i < 40; i += 1) reactor.tick({ ...coreStub, attX: -1, attY: 0 }, 0.5, 0, 16);
  const b = reactor.root.rotation.y;
  return a > 0.05 && b < -0.05
    ? true : `nao seguiu a atencao: a=${a.toFixed(3)} b=${b.toFixed(3)}`;
});

check('a inclinacao e contida (nunca vira giro completo)', () => {
  resetRot();
  for (let i = 0; i < 200; i += 1) reactor.tick({ ...coreStub, attX: 1, attY: 1 }, 1, 0, 16);
  const r = reactor.root.rotation;
  return Math.abs(r.y) < 0.45 && Math.abs(r.x) < 0.45
    ? true : `inclinou demais: x=${r.x.toFixed(2)} y=${r.y.toFixed(2)}`;
});

check('tick repassa o warmth para os materiais', () => {
  reactor.tick(coreStub, 0.5, 1, 16);
  const dourado = Math.round(mats.rim.color.r * 255) === 255 && Math.round(mats.rim.color.b * 255) === 0;
  reactor.tick(coreStub, 0.5, 0, 16);
  const ciano = Math.round(mats.rim.color.g * 255) === 245;
  return dourado && ciano ? true : `dourado=${dourado} ciano=${ciano}`;
});

check('o tick nao lanca quando o cerebro vem vazio', () => {
  reactor.tick({}, 0, 0, 16);
  return true;
});

/* ===== Task 6 — escada de degradacao do reator ===== */

check('em qualidade cheia todos os nos aparecem', () => {
  reactor.setQuality(1);
  const visiveis = reactor._orbitNodes.filter((n) => n.visible).length;
  return visiveis === reactor._orbitNodes.length
    ? true : `${visiveis}/${reactor._orbitNodes.length}`;
});

check('0.62 corta sombra/IBL mas mantem a populacao cheia', () => {
  reactor.setQuality(0.62);
  const visiveis = reactor._orbitNodes.filter((n) => n.visible).length;
  return visiveis === reactor._orbitNodes.length
    ? true : `populacao caiu cedo demais: ${visiveis}`;
});

check('no piso a populacao de nos cai pela metade', () => {
  reactor.setQuality(0.38);
  const visiveis = reactor._orbitNodes.filter((n) => n.visible).length;
  const esperado = reactor._orbitNodes.length / 2;
  return visiveis === esperado
    ? true : `${visiveis} visiveis, esperado ${esperado}`;
});

check('a reducao e distribuida, nao um bloco continuo', () => {
  reactor.setQuality(0.38);
  /* dentro de UMA orbita os nos visiveis tem que ficar alternados; se
     sumissem em bloco, metade da orbita ficaria vazia */
  const primeiraOrbita = reactor._orbitNodes.slice(0, 12);
  const padrao = primeiraOrbita.map((n) => (n.visible ? 1 : 0)).join('');
  return padrao === '101010101010' ? true : `padrao ${padrao}`;
});

check('degradar reduz QUANTIDADE mas nunca remove presenca', () => {
  reactor.setQuality(0.38);
  const pecas = ['shell__pivot', 'ring__pivot', 'orbits__pivot',
    'brackets__pivot', 'base__pivot', 'emitter__pivot', 'plasma__pivot'];
  const sumiram = pecas.filter((k) => stage.registry.nodes[k].visible === false);
  return sumiram.length === 0 ? true : 'sumiram: ' + sumiram.join(', ');
});

check('a degradacao e reversivel no sentido do estado, nao do watchQuality', () => {
  reactor.setQuality(0.38);
  reactor.setQuality(1);
  const visiveis = reactor._orbitNodes.filter((n) => n.visible).length;
  return visiveis === reactor._orbitNodes.length
    ? true : `nao restaurou: ${visiveis}`;
});

/* ===== Task 7 — boot: ponte, fallback, ancora ===== */

import { boot } from '../js3d/index.js';

/* cada boot cria um contexto WebGL; o browser limita quantos ficam vivos,
   entao os testes descartam o stage assim que terminam de inspecionar */
const bootsAbertos = [];
function docFalso(comCanvas) {
  const host = document.createElement('div');
  if (comCanvas) {
    const c = document.createElement('canvas');
    c.className = 'hero__reactor3d';
    c.width = 200; c.height = 200;
    host.appendChild(c);
  }
  const svg = document.createElement('div');
  svg.className = 'hero__reactor-fallback';
  host.appendChild(svg);
  document.body.appendChild(host);
  return { querySelector: (sel) => host.querySelector(sel), _host: host };
}

function ponteFalsa(extra) {
  const added = [];
  return Object.assign({
    field: {
      core: { ...coreStub },
      sing: { warmth: 0 },
      E: 0.3,
      quality: 1,
      add: (fn) => added.push(fn),
      _added: added
    },
    plasmaColor: plasmaStub,
    reduced: false
  }, extra || {});
}

function bootar(doc, ponte) {
  const r = boot(doc, ponte);
  if (r && r.stage) bootsAbertos.push(r.stage);
  return r;
}

check('sem ponte, desiste sem lancar', () => {
  const r = bootar(docFalso(true), null);
  return r.ok === false && r.reason === 'sem-ponte' ? true : JSON.stringify(r);
});

check('ponte sem plasmaColor tambem desiste', () => {
  const r = bootar(docFalso(true), { field: {} });
  return r.ok === false && r.reason === 'sem-ponte' ? true : JSON.stringify(r);
});

check('sem canvas, desiste sem lancar', () => {
  const r = bootar(docFalso(false), ponteFalsa());
  return r.ok === false && r.reason === 'sem-canvas' ? true : JSON.stringify(r);
});

check('boot normal monta e registra o tick no loop unico', () => {
  const p = ponteFalsa();
  const r = bootar(docFalso(true), p);
  return r.ok === true && p.field._added.length === 1
    ? true : `ok=${r.ok} reason=${r.reason} ticks=${p.field._added.length}`;
});

check('boot normal esconde o SVG de fallback', () => {
  const d = docFalso(true);
  bootar(d, ponteFalsa());
  return d.querySelector('.hero__reactor-fallback').style.display === 'none'
    ? true : 'SVG continua visivel';
});

check('boot que falha NAO esconde o SVG de fallback', () => {
  const d = docFalso(true);
  bootar(d, null);
  return d.querySelector('.hero__reactor-fallback').style.display !== 'none'
    ? true : 'escondeu o fallback mesmo tendo falhado';
});

check('reduced-motion renderiza 1 frame e NAO registra tick', () => {
  const p = ponteFalsa({ reduced: true });
  const r = bootar(docFalso(true), p);
  return r.ok === true && p.field._added.length === 0
    ? true : `ok=${r.ok} ticks registrados: ${p.field._added.length}`;
});

/* O tick comeca com `if (document.hidden) return` — comportamento de producao
   que queremos manter. Mas o pane deste ambiente roda SEMPRE com
   document.hidden=true, entao sem isto o corpo do tick jamais executa e os
   testes passariam vazios. Falseia a visibilidade so durante a chamada. */
function comAbaVisivel(fn) {
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  try { return fn(); }
  finally {
    delete document.hidden;
    if (desc && !Object.getOwnPropertyDescriptor(document, 'hidden')) { /* volta ao getter herdado */ }
  }
}

check('o guard de visibilidade realmente barra o tick', () => {
  const p = ponteFalsa();
  const r = bootar(docFalso(true), p);
  p.field.coreAnchor = null;
  r.tick(1000);                       /* aba oculta: nao deve fazer nada */
  return p.field.coreAnchor === null
    ? true : 'tick rodou com a aba oculta';
});

check('o tick escreve coreAnchor para o campo de particulas', () => {
  const p = ponteFalsa();
  const r = bootar(docFalso(true), p);
  p.field.coreAnchor = null;          /* apaga o que o boot escreveu */
  comAbaVisivel(() => r.tick(1000));
  const a = p.field.coreAnchor;
  return a && typeof a.x === 'number' && typeof a.y === 'number'
    ? true : 'coreAnchor nao foi reescrito pelo tick';
});

check('o tick repassa a qualidade para stage e reator', () => {
  const p = ponteFalsa();
  const r = bootar(docFalso(true), p);
  comAbaVisivel(() => {
    r.tick(1000);
    p.field.quality = 0.38;
    r.tick(1016);
  });
  const nosVisiveis = r.reactor._orbitNodes.filter((n) => n.visible).length;
  return r.stage.quality === 0.38 && nosVisiveis < r.reactor._orbitNodes.length
    ? true : `stage=${r.stage.quality} nos=${nosVisiveis}`;
});

check('o tick desenha de fato (pixels acesos no framebuffer)', () => {
  const p = ponteFalsa();
  const r = bootar(docFalso(true), p);
  comAbaVisivel(() => { for (let i = 0; i < 5; i += 1) r.tick(1000 + i * 16); });
  const gl = r.stage.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let acesos = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (Math.max(buf[i], buf[i + 1], buf[i + 2]) > 25) acesos += 1;
  }
  return acesos > (w * h) * 0.01
    ? true : `so ${acesos} de ${w * h} pixels acesos`;
});

check('o tick nao lanca quando o cerebro vem incompleto', () => {
  const p = ponteFalsa();
  p.field.core = {};
  p.field.sing = {};
  delete p.field.E;
  delete p.field.quality;
  const r = bootar(docFalso(true), p);
  r.tick(1000);
  r.tick(1016);
  return true;
});

/* libera os contextos WebGL abertos pelos testes de boot */
bootsAbertos.forEach((s) => { if (s && s.dispose) s.dispose(); });

close();
