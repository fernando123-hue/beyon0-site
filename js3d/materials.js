/* MATERIAIS — a cor NUNCA é lida do CSS por frame (getComputedStyle em loop
   é veneno). Ela sai de plasmaColor(warmth, role), a mesma função que rege o
   resto do site. Consequência: a metamorfose do Estado Singular arrasta o
   objeto 3D para o dourado de graça e em sincronia garantida com CSS,
   tipografia e partículas — porque é literalmente a mesma fonte.

   Linguagem: técnico-emissivo, não PBR realista. Metal ou vidro brigaria com
   a lei do projeto e custaria caro; tudo aditivo sobre preto reproduz a
   estética atual sem introduzir um segundo croma. */
import * as THREE from '../vendor/three.module.min.js';

const GLOW = 0, HI = 1, CORE = 2;

/* O casco precisa ficar escuro para o emissive ler como brilho, mas a cor
   base ainda tem que vir de plasmaColor (lei do projeto: nenhuma cor chega
   a tela sem passar por ele). SHELL_TINT escala o token de GLOW para baixo —
   0.12 foi escolhido comparando com o hex antigo (0x061a1e = 6,26,30 sobre
   o ciano de repouso 0,245,255): 245*0.12≈29 e 255*0.12≈31, a poucos passos
   do teal original, então o repouso visual não muda perceptivelmente. */
const SHELL_TINT = 0.12;

function applyTriple(color, triple) {
  const p = triple.split(',');
  color.setRGB(+p[0] / 255, +p[1] / 255, +p[2] / 255);
}

export function createMaterials(plasmaColor) {
  const shell = new THREE.MeshStandardMaterial({
    roughness: 0.42, metalness: 0.12, emissiveIntensity: 1
  });
  shell.emissive = new THREE.Color();

  const rim = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false
  });

  const wire = new THREE.MeshBasicMaterial({
    wireframe: true, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  const edge = new THREE.LineBasicMaterial({
    transparent: true, opacity: 0.72,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  const orbit = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.30,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  const plasma = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  const node = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  const mats = {
    shell, rim, wire, edge, orbit, plasma, node,
    _warmth: -1,
    _writes: 0,

    /* Gated por mudança real, mesmo padrão do setSingCss no main.js. */
    update(warmth) {
      if (Math.abs(warmth - mats._warmth) < 0.002) return;
      mats._warmth = warmth;
      mats._writes += 1;
      const g = plasmaColor(warmth, GLOW);
      const h = plasmaColor(warmth, HI);
      const c = plasmaColor(warmth, CORE);
      applyTriple(rim.color, g);
      applyTriple(wire.color, g);
      applyTriple(orbit.color, g);
      applyTriple(edge.color, h);
      applyTriple(node.color, h);
      applyTriple(plasma.color, c);
      applyTriple(shell.emissive, g);
      applyTriple(shell.color, g);
      shell.color.multiplyScalar(SHELL_TINT);
    },

    dispose() {
      [shell, rim, wire, edge, orbit, plasma, node].forEach((m) => m.dispose());
    }
  };

  mats.update(0);
  return mats;
}
