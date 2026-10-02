/* ==========================================================================
   AI CORE — a cena: renderer, câmera, cores e o ciclo de vida.

   Não sabe de hero, de rolagem nem de boot do site: recebe um canvas e o
   contexto WebGL já testado e devolve `desenhar(estado)`, `medir()`,
   `baixarResolucao()` e `desmontar()`. Quem decide quando desenhar é
   boot.js (site) ou lab.js (laboratório).
   ========================================================================== */
import * as THREE from '../../vendor/three/three-nucleo.min.js';
import { SPEC } from './spec.js';
import { montar } from './pecas.js';

/* tokens do CSS que a esfera usa, lidos UMA vez (ler getComputedStyle por
   quadro foi o pecado que custou 76 ms por quadro a este projeto) */
const TOKENS = { bg: '--bg', t1: '--t1', ac: '--ac', ac2: '--ac-2', luz: '--luz', ambar: '--ambar' };
const PADRAO = { bg: '#06090E', t1: '#EEF1F5', ac: '#4FD8F0', ac2: '#8FE8F7', luz: '#2A6BFF', ambar: '#F0B44F' };

/* atributos do contexto. O teste de GPU e o renderer usam UM contexto só:
   quem testa (boot.js, que repete estes valores porque roda antes de baixar
   este módulo; ou lab.js, por pedirContexto) entrega o contexto pronto.
   Sem stencil (não é usado e custa memória com MSAA); `default` em vez de
   `high-performance`: num efeito decorativo, não acordar a placa dedicada
   do notebook. */
export const ATRIBUTOS = { alpha: true, antialias: true, stencil: false, powerPreference: 'default' };

export function pedirContexto(canvas, aceitarCpu) {
  const op = { ...ATRIBUTOS, failIfMajorPerformanceCaveat: !aceitarCpu };
  try {
    return canvas.getContext('webgl2', op) || canvas.getContext('webgl', op);
  } catch (e) {
    return null;
  }
}

function lerCores(el) {
  const estilo = getComputedStyle(el);
  const cores = {};
  for (const [nome, v] of Object.entries(TOKENS)) {
    const valor = estilo.getPropertyValue(v).trim() || PADRAO[nome];
    cores[nome] = new THREE.Color(valor);
  }
  return cores;
}

export function criarCena(canvas, gl, { celular = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, ...ATRIBUTOS });
  } catch (e) {
    return null;
  }

  const teto = celular ? 1.5 : 2;
  let esfera = null, camera, cena;
  let largura = 0, altura = 0;

  function medir() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === largura && h === altura)) return;
    largura = w; altura = h;
    renderer.setSize(w, h, false);
    /* o canvas é sempre quadrado (144% de uma caixa aspect-ratio 1) */
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    escalaParticulas();
  }

  /* as partículas do disco têm tamanho em pixels: dependem da altura do
     buffer (tamanho em CSS × pixel ratio) */
  function escalaParticulas() {
    if (esfera && altura) esfera.tamanhoTela(altura * renderer.getPixelRatio(), SPEC.camera.fov);
  }

  /* se a montagem falhar DEPOIS de o renderer existir, solta o contexto
     antes de desistir (senão ele vaza, e o navegador tem teto de contextos) */
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, teto));
    renderer.setClearColor(0x000000, 0);
    cena = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(SPEC.camera.fov, 1, 0.1, 50);
    camera.position.set(0, 0, SPEC.camera.z);
    esfera = montar(THREE, SPEC, lerCores(canvas), { celular });
    cena.add(esfera.raiz);
    medir();
  } catch (e) {
    if (esfera) esfera.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }

  function desenhar(estado) {
    esfera.atualizar(estado);
    renderer.render(cena, camera);
  }

  /* primeiro degrau da degradação: pixel ratio 1. Devolve false se já era
     1 (monitor comum): não há o que baixar e quem chamou desiste. O
     setPixelRatio do three já refaz o buffer. */
  function baixarResolucao() {
    if (renderer.getPixelRatio() <= 1) return false;
    renderer.setPixelRatio(1);
    escalaParticulas();
    return true;
  }

  /* o zoom do navegador ou a troca de monitor mudam o devicePixelRatio.
     Quem chama não chama depois de ter baixado a resolução. */
  function ajustarDpr() {
    const alvo = Math.min(window.devicePixelRatio || 1, teto);
    if (Math.abs(renderer.getPixelRatio() - alvo) > 0.01) { renderer.setPixelRatio(alvo); escalaParticulas(); }
  }

  function desmontar() {
    esfera.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  function info() {
    const r = renderer.info.render;
    return { chamadas: r.calls, triangulos: r.triangles };
  }

  return { medir, desenhar, baixarResolucao, ajustarDpr, desmontar, info };
}
