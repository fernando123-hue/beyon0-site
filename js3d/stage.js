/* STAGE — renderer, cena, câmera e registro de objetos.
   Deliberadamente agnóstico: não sabe o que é "hero" nem o que é "reator".
   É isso que permite, no sub-projeto 5 (cena com scroll), trocar só o
   tamanho e a câmera sem tocar nos objetos. */
import * as THREE from '../vendor/three.module.min.js';

const DPR_CAP = 1.75;   /* constante de nascença, não degrau de degradação */
const FOV = 35;         /* volume sem distorção de lente */
const CAM_Z = 6.2;

export function createStage(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch (e) {
    return null;                       /* sem WebGL: quem chamou cai no fallback */
  }
  if (!renderer || !renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  const registry = { nodes: {}, meshes: {}, materials: {} };

  /* Como quase tudo no reator é emissivo/aditivo, é preciso pouca luz: uma
     direcional que dá FORMA à esfera (senão o MeshStandardMaterial some) e uma
     hemisférica de preenchimento. Cor branca de propósito: a cor do objeto vem
     dos materiais, que saem de plasmaColor. Luz colorida introduziria um
     segundo croma pela porta dos fundos. */
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(2.4, 3.0, 3.2);
  scene.add(key);

  const fill = new THREE.HemisphereLight(0xffffff, 0x0b2f35, 0.55);
  scene.add(fill);

  const stage = {
    scene,
    camera,
    renderer,
    registry,
    lights: { key, fill },
    quality: 1,

    /* Todo objeto entra por aqui e fica endereçável pelo nome — é o que dá
       alvos prontos de GSAP e o que torna o sub-projeto 3 (peças clicáveis)
       quase de graça. */
    add(name, obj, parentName) {
      const parent = (parentName && registry.nodes[parentName]) || scene;
      parent.add(obj);
      registry.nodes[name] = obj;
      if (obj.isMesh) registry.meshes[name] = obj;
      return obj;
    },

    /* watchQuality é UMA VIA (1 → 0.62 → 0.38). Cada degrau reduz
       QUANTIDADE, nunca presença: o objeto continua inteiro. */
    setQuality(q) {
      stage.quality = q;
      const full = q >= 0.999;
      renderer.shadowMap.enabled = full;
      scene.environment = full ? stage._env || null : null;
    },

    setEnvironment(tex) {
      stage._env = tex;
      if (stage.quality >= 0.999) scene.environment = tex;
    },

    resize(w, h) {
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },

    render() {
      renderer.render(scene, camera);
    },

    dispose() {
      renderer.dispose();
    }
  };

  stage.setQuality(1);
  stage.resize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
  return stage;
}
