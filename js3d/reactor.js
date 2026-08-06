/* REATOR — o AI Core em volume.
   Evolui a linguagem do reator canvas: esfera com fresnel e globo wireframe,
   anel equatorial com internos, órbitas com nós, brackets de luz, base e
   emissor, e o plasma-átomo.

   Hierarquia pivô-por-peça: cada peça é um Group com o mesh dentro. O pivô é
   o alvo de animação (GSAP mexe nele) e o mesh guarda geometria e material.
   Essa separação é o que torna o sub-projeto 3 (peças clicáveis, arrastar
   para girar) quase de graça. */
import * as THREE from '../vendor/three.module.min.js';

const TAU = Math.PI * 2;

/* População por degrau de qualidade: reduz QUANTIDADE, nunca presença.
   NODES_LOW divide NODES_FULL exatamente — o passo da degradação é inteiro,
   sem módulo em ponto flutuante. */
const NODES_FULL = 12;
const NODES_LOW = 6;

function pivot(stage, name, parentName) {
  const g = new THREE.Group();
  g.name = name;
  stage.add(name, g, parentName);
  return g;
}

export function createReactor(stage, mats) {
  const root = new THREE.Group();
  root.name = 'aiCore';
  stage.add('aiCore', root);

  /* --- esfera: corpo + fresnel aditivo + globo wireframe --- */
  const shellPivot = pivot(stage, 'shell__pivot', 'aiCore');
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mats.shell);
  shell.name = 'shell';
  stage.add('shell', shell, 'shell__pivot');

  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.07, 32, 24), mats.rim);
  rim.name = 'shellRim';
  shellPivot.add(rim);

  const wire = new THREE.Mesh(new THREE.SphereGeometry(1.02, 16, 12), mats.wire);
  wire.name = 'shellWire';
  shellPivot.add(wire);

  /* --- anel equatorial + interno --- */
  const ringPivot = pivot(stage, 'ring__pivot', 'aiCore');
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.028, 8, 96), mats.orbit);
  ring.name = 'ring';
  ring.rotation.x = Math.PI / 2;
  stage.add('ring', ring, 'ring__pivot');

  const ringInner = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.014, 6, 64), mats.orbit);
  ringInner.name = 'ringInner';
  ringInner.rotation.x = Math.PI / 2;
  ringPivot.add(ringInner);

  /* --- órbitas com nós: a oclusão frente/trás sai de graça em 3D --- */
  const orbitsPivot = pivot(stage, 'orbits__pivot', 'aiCore');
  const orbitNodes = [];
  const ORBITS = [
    { r: 1.72, rx: 0.42, rz: 0.15 },
    { r: 1.58, rx: -0.68, rz: 0.55 },
    { r: 1.85, rx: 1.15, rz: -0.35 }
  ];
  const nodeGeo = new THREE.SphereGeometry(0.028, 8, 6);
  ORBITS.forEach((o, i) => {
    const g = new THREE.Group();
    g.name = 'orbit_' + i;
    g.rotation.set(o.rx, 0, o.rz);
    const line = new THREE.Mesh(new THREE.TorusGeometry(o.r, 0.005, 6, 128), mats.orbit);
    g.add(line);
    for (let n = 0; n < NODES_FULL; n += 1) {
      const m = new THREE.Mesh(nodeGeo, mats.node);
      const a = (n / NODES_FULL) * TAU;
      m.position.set(Math.cos(a) * o.r, Math.sin(a) * o.r, 0);
      m.userData.baseAngle = a;
      m.userData.radius = o.r;
      g.add(m);
      orbitNodes.push(m);
    }
    orbitsPivot.add(g);
  });

  /* --- brackets: arestas de luz, SEM corpo preto --- */
  const bracketsPivot = pivot(stage, 'brackets__pivot', 'aiCore');
  const bracketGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.20, 0.62, 0.20));
  for (let i = 0; i < 4; i += 1) {
    const seg = new THREE.LineSegments(bracketGeo, mats.edge);
    seg.name = 'bracket_' + i;
    const a = (i / 4) * TAU + Math.PI / 4;
    seg.position.set(Math.cos(a) * 1.30, 0, Math.sin(a) * 1.30);
    seg.rotation.y = -a;
    bracketsPivot.add(seg);
  }

  /* --- base e emissor --- */
  const basePivot = pivot(stage, 'base__pivot', 'aiCore');
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.68, 0.16, 24), mats.shell);
  base.name = 'base';
  base.position.y = -1.62;
  stage.add('base', base, 'base__pivot');

  const baseBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 0.62, 16), mats.orbit);
  baseBeam.name = 'baseBeam';
  baseBeam.position.y = -1.22;
  basePivot.add(baseBeam);

  const emitterPivot = pivot(stage, 'emitter__pivot', 'aiCore');
  const emitter = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.34, 20), mats.shell);
  emitter.name = 'emitter';
  emitter.position.y = 1.58;
  stage.add('emitter', emitter, 'emitter__pivot');

  const emitterBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.10, 0.52, 16), mats.orbit);
  emitterBeam.name = 'emitterBeam';
  emitterBeam.position.y = 1.24;
  emitterPivot.add(emitterBeam);

  /* --- plasma-átomo --- */
  const plasmaPivot = pivot(stage, 'plasma__pivot', 'aiCore');
  const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mats.plasma);
  nucleus.name = 'nucleus';
  stage.add('nucleus', nucleus, 'plasma__pivot');

  const electrons = [];
  const electronGeo = new THREE.SphereGeometry(0.045, 10, 8);
  for (let i = 0; i < 3; i += 1) {
    const e = new THREE.Mesh(electronGeo, mats.plasma);
    e.name = 'electron_' + i;
    e.userData.phase = (i / 3) * TAU;
    e.userData.tilt = i * 0.9;
    plasmaPivot.add(e);
    electrons.push(e);
  }

  const reactor = {
    root,
    _orbitNodes: orbitNodes,
    _electrons: electrons,
    _orbits: orbitsPivot,
    _ring: ringPivot,
    _shell: shellPivot,
    _plasma: plasmaPivot,
    _t: 0,

    /* Só OBSERVA o cérebro — nunca escreve nele, e nunca registra um rAF
       próprio. É chamado pelo loop único do organismo. Tolerante a um `core`
       incompleto: no boot, e enquanto a intro roda, vários campos ainda não
       existem, e o reator não pode ser o que quebra a página. */
    tick(core, energy, warmth, dt) {
      const c = core || {};
      const step = (dt || 16) / 16;
      reactor._t += dt || 16;
      const t = reactor._t * 0.001;
      const e = energy || 0;
      const pow = c.pow || 0;
      const breath = c.breath == null ? 0.5 : c.breath;
      const strain = c.strain || 0;
      const star = c.star || 0;

      mats.update(warmth || 0);

      /* esfera: respira com o núcleo, comprime na pré-Singularidade e incha na
         ignição estelar */
      shellPivot.scale.setScalar(
        1 + breath * 0.035 * (0.4 + pow) - strain * 0.06 + star * 0.05
      );

      /* órbitas e anel giram em sentidos opostos: dá leitura de profundidade
         sem precisar de sombra */
      orbitsPivot.rotation.y += (0.0016 + e * 0.0042) * step;
      ringPivot.rotation.y -= (0.0009 + e * 0.0021) * step;

      /* nós percorrem as órbitas */
      for (let i = 0; i < orbitNodes.length; i += 1) {
        const n = orbitNodes[i];
        const a = n.userData.baseAngle + t * (0.35 + e * 0.5);
        n.position.set(Math.cos(a) * n.userData.radius, Math.sin(a) * n.userData.radius, 0);
      }

      /* plasma: elétrons em órbitas inclinadas, núcleo pulsando com a energia */
      for (let i = 0; i < electrons.length; i += 1) {
        const el = electrons[i];
        const a = el.userData.phase + t * (1.1 + e * 1.4);
        const r = 0.46 + e * 0.08;
        const tilt = el.userData.tilt;
        el.position.set(
          Math.cos(a) * r,
          Math.sin(a) * r * Math.cos(tilt),
          Math.sin(a) * r * Math.sin(tilt)
        );
      }
      plasmaPivot.scale.setScalar(0.9 + pow * 0.25 + star * 0.3);

      /* PARALAXE — o reator olha para onde o cérebro já estava olhando.
         attX/attY são a atenção que o AICore calcula: zero estado novo. A
         convergência é por lerp e o alvo é limitado, então isto inclina,
         nunca gira. */
      const alvoY = (c.attX || 0) * 0.28;
      const alvoX = -(c.attY || 0) * 0.20;
      root.rotation.y += (alvoY - root.rotation.y) * 0.06 * step;
      root.rotation.x += (alvoX - root.rotation.x) * 0.06 * step;
    },

    setQuality(q) { /* implementado na Task 6 */ },

    dispose() {
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  };

  return reactor;
}
