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

check('materiais expostos existem', () => {
  const missing = ['shell', 'rim', 'wire', 'edge', 'orbit', 'plasma', 'node']
    .filter((k) => !mats[k]);
  return missing.length === 0 ? true : 'faltando: ' + missing.join(', ');
});

check('em repouso a cor e o ciano exato da rampa', () => {
  mats.update(0);
  const c = mats.rim.color;
  return near(Math.round(c.r * 255), 0, 1) === true &&
         near(Math.round(c.g * 255), 245, 1) === true &&
         near(Math.round(c.b * 255), 255, 1) === true
    ? true : `veio ${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}`;
});

check('no Singular a cor vira dourado plasma', () => {
  mats.update(1);
  const c = mats.rim.color;
  return Math.round(c.r * 255) === 255 && Math.round(c.g * 255) === 208 && Math.round(c.b * 255) === 0
    ? true : `veio ${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}`;
});

check('volta ao ciano quando o Singular acaba', () => {
  mats.update(1);
  mats.update(0);
  const c = mats.rim.color;
  return Math.round(c.g * 255) === 245 && Math.round(c.b * 255) === 255
    ? true : `nao voltou: ${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)}`;
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

close();
