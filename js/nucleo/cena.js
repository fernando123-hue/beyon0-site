/* ==========================================================================
   AI CORE — a cena: renderer, câmera, cores e o ciclo de vida.

   Não sabe de hero, de rolagem nem de boot do site: recebe um canvas e o
   contexto WebGL já testado e devolve `desenhar(estado)`, `projetar()`, `medir()`,
   `baixarResolucao()` e `desmontar()`. Quem decide quando desenhar é
   boot.js (site) ou lab.js (laboratório).
   ========================================================================== */
import * as THREE from '../../vendor/three/three-nucleo.min.js';
import { SPEC } from './spec.js';
import { montar } from './pecas.js';

/* tokens do CSS que a esfera usa, lidos UMA vez (ler getComputedStyle por
   quadro foi o pecado que custou 76 ms por quadro a este projeto) */
const TOKENS = { bg: '--bg', t1: '--t1', ac: '--ac', ac2: '--ac-2', metal: '--metal', prata: '--prata' };
const OURO_TOKENS = { ac: '--ouro-rgb', ac2: '--ouro-2-rgb', brasa: '--brasa-rgb' }, OURO_PADRAO = { ac: '255 190 60', ac2: '255 226 150', brasa: '255 250 235' };
const PADRAO = { bg: '#000000', t1: '#F2F4F4', ac: '#49E5DD', ac2: '#A6F4EF', metal: '#565656', prata: '#B7BFC0' };

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
  let esfera = null, camera, cena, cores = null, frio = null;
  /* O OURO (js/ouro.js): k de 0 a 1 mistura o ciano do reator para o dourado tecnológico; os uniforms dos
     shaders apontam para os mesmos objetos de cor, os materiais copiados são retingidos pela lista */
  const OURO = { ac: new THREE.Color('#FFBE3C'), ac2: new THREE.Color('#FFE296'), brasa: new THREE.Color('#FFFAEB') }, BRASA = OURO.brasa;   /* (os valores reais vêm dos tokens na montagem) */
  /* k: ciano → ouro incandescente; h: → o branco da brasa (o clarão e o tremor do reinado) */
  function tingir(k, h = 0) {
    if (!cores || !frio) return;
    cores.ac.copy(frio.ac).lerp(OURO.ac, k).lerp(BRASA, h);
    cores.ac2.copy(frio.ac2).lerp(OURO.ac2, k).lerp(BRASA, h);
    if (esfera && esfera.tingir) esfera.tingir();
  }
  let largura = 0, altura = 0;

  function medir() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === largura && h === altura)) return;
    largura = w; altura = h;
    renderer.setSize(w, h, false);
    /* o canvas é sempre quadrado (144% de uma caixa aspect-ratio 1) */
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* se a montagem falhar DEPOIS de o renderer existir, solta o contexto
     antes de desistir (senão ele vaza, e o navegador tem teto de contextos) */
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, teto));
    renderer.setClearColor(0x000000, 0);
    cena = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(SPEC.camera.fov, 1, 0.1, 50);
    camera.position.set(0, 0, SPEC.camera.z);
    camera.updateMatrixWorld();
    cores = lerCores(canvas);
    /* (o frio é o ciano dos PADRÃO/tokens, nunca o que a página mostra agora: montada no meio de um ouro, a cena leria o dourado como frio) */
    frio = { ac: new THREE.Color(PADRAO.ac), ac2: new THREE.Color(PADRAO.ac2) };
    const est = getComputedStyle(canvas);
    for (const [nome, token] of Object.entries(OURO_TOKENS)) { const v = (est.getPropertyValue(token).trim() || OURO_PADRAO[nome]).split(/\s+/).map(Number); OURO[nome].setRGB(v[0] / 255, v[1] / 255, v[2] / 255); }
    esfera = montar(THREE, SPEC, cores, { celular });
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

  /* o ponteiro no plano do reator: (x, y) em coordenadas do canvas (−1–1,
     y para cima) viram o ponto onde o raio da câmera cruza o plano z = 0 do
     reator, em coordenadas dele (as do spec). Escreve em `saida` e devolve
     false se o raio não cruza (reator de lado). Sem alocar: roda por quadro. (Matrix4 e Vector4 ficaram fora do three
     reduzido; o worldToLocal faz a inversão por dentro) */
  const origem = new THREE.Vector3(), alvo = new THREE.Vector3();
  function projetar(x, y, saida) {
    const raiz = esfera.raiz;
    raiz.updateMatrixWorld();
    raiz.worldToLocal(origem.copy(camera.position));
    raiz.worldToLocal(alvo.set(x, y, 0.5).unproject(camera)).sub(origem);
    if (Math.abs(alvo.z) < 1e-6) return false;
    const k = -origem.z / alvo.z;
    if (k <= 0) return false;
    saida.x = origem.x + alvo.x * k;
    saida.y = origem.y + alvo.y * k;
    return true;
  }

  /* primeiro degrau da degradação: pixel ratio 1. Devolve false se já era
     1 (monitor comum): não há o que baixar e quem chamou desiste. O
     setPixelRatio do three já refaz o buffer. */
  function baixarResolucao() {
    if (renderer.getPixelRatio() <= 1) return false;
    renderer.setPixelRatio(1);
    return true;
  }

  /* o zoom do navegador ou a troca de monitor mudam o devicePixelRatio.
     Quem chama não chama depois de ter baixado a resolução. */
  function ajustarDpr() {
    const alvo = Math.min(window.devicePixelRatio || 1, teto);
    if (Math.abs(renderer.getPixelRatio() - alvo) > 0.01) { renderer.setPixelRatio(alvo); }
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

  /* a pose do reator e quantas unidades do spec cabem na altura do canvas
     (no plano z = 0, onde estão os raios): a rede converte para px */
  const UNIDADES_NA_ALTURA = 2 * Math.tan((SPEC.camera.fov * Math.PI) / 360) * SPEC.camera.z;
  function pose() { const p = esfera.pose(); p.altura = UNIDADES_NA_ALTURA; p.camera = SPEC.camera.z; return p; }

  return { medir, desenhar, projetar, pose, baixarResolucao, ajustarDpr, desmontar, info, tingir };
}
