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

close();
