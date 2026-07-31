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

close();
