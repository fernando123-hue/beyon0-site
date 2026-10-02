/* ==========================================================================
   AI CORE — o emissor. Lê o SPEC (o reator, v2) e monta as peças em three.js.

   Nada aqui decide QUANDO o reator se mexe: `atualizar(estado)` recebe o
   estado pronto (montagem, abertura, ignição, ponteiro) de quem manda no
   tempo (boot.js no site, lab.js no laboratório). O mesmo emissor serve ao
   site, ao laboratório e a uma renderização de vídeo.

   Custo (regras do threejs-perf e da história do projeto): sem luz de cena,
   sem sombra, sem pós-processamento. O brilho é aditivo; a energia corre em
   shaders curtos (pulsos por ângulo nos anéis, por comprimento nos raios, e
   o disco de partículas inteiro calculado na GPU: zero JS por partícula).
   ========================================================================== */

const TAU = Math.PI * 2;
const VOLTA = 400;   /* s: período do relógio dos shaders (ver atualizar) */

/* gerador com semente: o reator é o mesmo em toda visita */
function sorteio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const suave = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const mistura = (a, b, t) => a + (b - a) * t;

/* ---------- texturas geradas (uma vez, em canvas 2D) ---------- */

function tela(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function texturaHalo(THREE, miolo) {
  const n = 128, c = tela(n, n), g = c.getContext('2d');
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(Math.max(0.001, miolo), 'rgba(255,255,255,.85)');
  r.addColorStop(Math.min(0.999, miolo + 0.2), 'rgba(255,255,255,.2)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
}

/* raios curtos, igualmente espaçados: a estrela também é simétrica */
function texturaRaios(THREE, nRaios) {
  const n = 256, c = tela(n, n), g = c.getContext('2d');
  g.translate(n / 2, n / 2);
  for (let i = 0; i < nRaios; i++) {
    const a = (i / nRaios) * TAU;
    const comp = n * (i % 2 ? 0.26 : 0.4);
    const grad = g.createLinearGradient(0, 0, Math.cos(a) * comp, Math.sin(a) * comp);
    grad.addColorStop(0, 'rgba(255,255,255,.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad;
    g.lineWidth = i % 2 ? 1 : 1.6;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * comp, Math.sin(a) * comp);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function texturaTraco(THREE) {
  const w = 512, h = 32, c = tela(w, h), g = c.getContext('2d');
  const gx = g.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(0.4, 'rgba(255,255,255,.45)');
  gx.addColorStop(0.5, 'rgba(255,255,255,1)');
  gx.addColorStop(0.6, 'rgba(255,255,255,.45)');
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(0.5, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy;
  g.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(c);
}

/* um anel de 1 px: a onda de choque (o anel fica a 97% do raio da textura) */
function texturaOnda(THREE) {
  const n = 256, c = tela(n, n), g = c.getContext('2d');
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.955, 'rgba(255,255,255,0)');
  r.addColorStop(0.97, 'rgba(255,255,255,1)');
  r.addColorStop(0.985, 'rgba(255,255,255,0)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
}

/* ---------- shaders ---------- */

/* o vidro escuro: a única luz é o núcleo, no centro do mundo; fios de
   reflexo duros, o núcleo visto através, aresta de fresnel */
const VIDRO_VS = /* glsl */`
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * p;
    vP = w.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const VIDRO_FS = /* glsl */`
  uniform vec3 uBase;
  uniform vec3 uInterno;
  uniform vec3 uAresta;
  uniform vec3 uBrilho;
  uniform vec3 uAmbiente;
  uniform vec3 uCentro;
  uniform float uIgnicao;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vP);
    vec3 Lv = uCentro - vP;
    float d = length(Lv);
    vec3 L = Lv / d;
    float ig = uIgnicao;
    float queda = 1.0 / (1.0 + d * d * 3.2);
    float difusa = max(dot(N, L), 0.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float espec = pow(max(dot(N, normalize(L + V)), 0.0), 90.0);
    vec3 R = reflect(-V, N);
    float faixa = exp(-R.y * R.y * 140.0);
    float faixa2 = exp(-(R.y - 0.38) * (R.y - 0.38) * 260.0);
    float topo = smoothstep(0.82, 1.0, R.y);
    float atraves = pow(max(dot(-V, L), 0.0), 10.0);
    vec3 c = uBase * 0.45;
    c += uInterno * difusa * difusa * queda * (0.05 + 0.95 * ig);
    c += uInterno * atraves * 0.32 * ig;
    c += uAresta * fres * (0.03 + 0.12 * ig);
    c += uBrilho * espec * queda * 3.2 * ig;
    c += (mix(uInterno, uBrilho, 0.45) * faixa * 0.2 + uBrilho * faixa2 * 0.12 + uBrilho * topo * 0.1) * (0.25 + 0.75 * fres);
    c += uAmbiente * fres * 0.05;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

/* a energia nos anéis: pulsos (cabeça forte, cauda curta) correndo em volta.
   A volta vem do uv.x do toro (0–1, com vértices duplicados na costura), não
   de atan: o atan salta de +π a −π às 9 horas e espremia os pulsos num
   tracinho fixo ali (revisão de código; quebraria a simetria) */
const FLUXO_VS = /* glsl */`
  varying float vVolta;
  void main() {
    vVolta = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FLUXO_FS = /* glsl */`
  uniform vec3 uCor;
  uniform float uTempo;
  uniform float uN;
  uniform float uVel;
  uniform float uAlfa;
  uniform float uForca;
  varying float vVolta;
  void main() {
    float f = fract(vVolta * uN + uTempo * uVel);
    float b = pow(f, 18.0) + 0.05;
    gl_FragColor = vec4(uCor, b * uAlfa * uForca);
    #include <colorspace_fragment>
  }
`;

/* os raios de energia: faixas do portal ao núcleo; aU 0 (fora) → 1 (dentro),
   aV −1…1 através. Os pulsos correm para dentro, todos em fase */
const RAIO_VS = /* glsl */`
  attribute float aU;
  attribute float aV;
  varying float vU;
  varying float vV;
  void main() {
    vU = aU; vV = aV;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const RAIO_FS = /* glsl */`
  uniform vec3 uCor;
  uniform float uTempo;
  uniform float uN;
  uniform float uVel;
  uniform float uAlfa;
  uniform float uBase;
  uniform float uCauda;
  uniform float uForca;
  varying float vU;
  varying float vV;
  void main() {
    float f = fract(vU * uN - uTempo * uVel);
    float atravessa = 1.0 - vV * vV;
    float pontas = smoothstep(0.0, 0.12, vU) * (1.0 - smoothstep(0.82, 1.0, vU));
    float b = (pow(f, uCauda) + uBase) * atravessa * atravessa * pontas;
    gl_FragColor = vec4(uCor, b * uAlfa * uForca);
    #include <colorspace_fragment>
  }
`;

/* o disco: cada partícula é calculada aqui. Órbita fixa (aRaio), rotação
   diferencial como num disco de acreção: as de dentro giram mais rápido
   (expoente uKepler). Mais claras perto do núcleo. */
const DISCO_VS = /* glsl */`
  uniform float uTempo;
  uniform float uRmin;
  uniform float uRmax;
  uniform float uGiro;
  uniform float uKepler;
  uniform float uEscala;
  uniform float uForca;
  attribute float aAng;
  attribute float aRaio;
  attribute float aTam;
  varying float vB;
  varying vec2 vTan;
  void main() {
    float ang = aAng + uTempo * uGiro * pow(uRmax / aRaio, uKepler);
    vec4 mv = modelViewMatrix * vec4(cos(ang) * aRaio, sin(ang) * aRaio, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
    /* a direção da órbita na tela (y para baixo, como gl_PointCoord) */
    vec3 t = mat3(modelViewMatrix) * vec3(-sin(ang), cos(ang), 0.0);
    vTan = normalize(vec2(t.x, -t.y) + 1e-5);
    gl_PointSize = aTam * uEscala / -mv.z;
    float dentro = 1.0 - (aRaio - uRmin) / (uRmax - uRmin);
    vB = (0.3 + 0.7 * dentro) * uForca;
  }
`;
const DISCO_FS = /* glsl */`
  uniform vec3 uCor;
  uniform float uAlfa;
  uniform float uRastro;
  varying float vB;
  varying vec2 vTan;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    /* um risco ao longo da órbita: elipse com o eixo maior na tangente */
    float d = length(vec2(dot(q, vTan), dot(q, vec2(-vTan.y, vTan.x)) * uRastro));
    gl_FragColor = vec4(uCor, (1.0 - smoothstep(0.0, 0.5, d)) * vB * uAlfa);
    #include <colorspace_fragment>
  }
`;

/* ---------- montagem ---------- */

export function montar(THREE, SPEC, cores, { celular = false } = {}) {
  const sorte = sorteio(SPEC.semente);
  const raiz = new THREE.Group();
  const descartar = [];   /* tudo que tem GPU por trás, para o dispose */
  const guarda = (x) => { if (x) descartar.push(x); return x; };
  const cor = (nome) => cores[nome] || new THREE.Color(1, 1, 1);
  const ADITIVO = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const aditivo = (nomeCor, alfa) => guarda(new THREE.MeshBasicMaterial({ color: cor(nomeCor), opacity: alfa, ...ADITIVO }));

  /* quem tem uniform de tempo/força (atualizados juntos por quadro), com o
     atraso de acendimento da camada: acende de dentro para fora */
  const energia = [];
  function shader(vs, fs, uniforms, atraso = 0, dupla = false) {
    /* `dupla`: as faixas de raios e jatos são montadas à mão e metade ficava
       de costas para a câmera (descartada). Nos tubos fechados não: os dois
       lados somariam a energia duas vezes no mesmo pixel */
    const m = guarda(new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, ...(dupla ? { side: THREE.DoubleSide } : {}), ...ADITIVO }));
    energia.push({ m, atraso });
    return m;
  }

  const vidro = guarda(new THREE.ShaderMaterial({
    vertexShader: VIDRO_VS,
    fragmentShader: VIDRO_FS,
    side: THREE.DoubleSide,
    uniforms: {
      uBase: { value: cor(SPEC.vidro.base).clone().multiplyScalar(0.8) },
      uInterno: { value: cor(SPEC.vidro.interno) },
      uAresta: { value: cor(SPEC.vidro.aresta) },
      uBrilho: { value: cor(SPEC.vidro.brilho) },
      uAmbiente: { value: cor(SPEC.vidro.ambiente) },
      uCentro: { value: new THREE.Vector3() },
      uIgnicao: { value: 0 }
    }
  }));

  /* fita: a seção do toro comprimida no eixo normal ao plano dele; a normal
     da elipse é a radial com o z dividido por `achata` (sem escala não
     uniforme na malha, que o shader não corrigiria) */
  function achatar(geo, achata) {
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, pos.getZ(i) * achata);
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i) / achata;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.setXYZ(i, nx / l, ny / l, nz / l);
    }
    return geo;
  }

  function fluxo(raio, tubo, d, atraso) {
    return new THREE.Mesh(
      guarda(new THREE.TorusGeometry(raio, tubo, 6, 220)),
      shader(FLUXO_VS, FLUXO_FS, {
        uCor: { value: cor(d.cor) }, uTempo: { value: 0 }, uN: { value: d.pulsos },
        uVel: { value: d.vel }, uAlfa: { value: d.alfa }, uForca: { value: 0 }
      }, atraso)
    );
  }
  const A = SPEC.acende;

  /* --- a roda: portal, raios e régua giram juntos (os vãos do portal ficam
     sempre alinhados aos raios) --- */
  const roda = new THREE.Group();
  raiz.add(roda);
  const P = SPEC.portal;
  const passo = TAU / P.n;
  const segmentos = [];
  function anelDeSegmentos(raio, tubo, achata, z, defasagem, atraso0) {
    const geo = guarda(achatar(new THREE.TorusGeometry(raio, tubo, 10, 40, passo * (1 - P.vao)), achata));
    for (let i = 0; i < P.n; i++) {
      const pivo = new THREE.Group();
      const malha = new THREE.Mesh(geo, vidro);
      const a0 = (i + defasagem) * passo + passo * P.vao * 0.5;
      malha.rotation.z = a0;
      malha.position.z = z;
      pivo.add(malha);
      roda.add(pivo);
      const meio = a0 + passo * (1 - P.vao) * 0.5;
      /* pares opostos chegam juntos: a montagem também é simétrica */
      segmentos.push({ pivo, dir: new THREE.Vector3(Math.cos(meio), Math.sin(meio), 0), atraso: atraso0 + (i % (P.n / 2)) * 0.05 });
    }
  }
  anelDeSegmentos(P.fundo.raio, P.fundo.tubo, P.fundo.achata, P.fundo.z, 0.5, 0);
  anelDeSegmentos(P.raio, P.tubo, P.achata, 0, 0, 0.08);

  const R = SPEC.raios;
  {
    const n = R.n, pos = [], u = [], v = [], idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * (TAU / n);
      const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
      const w0 = R.largura / 2, w1 = R.largura * 0.2;
      const b = i * 4;
      pos.push(dx * R.de + px * w0, dy * R.de + py * w0, 0, dx * R.de - px * w0, dy * R.de - py * w0, 0,
        dx * R.ate + px * w1, dy * R.ate + py * w1, 0, dx * R.ate - px * w1, dy * R.ate - py * w1, 0);
      u.push(0, 0, 1, 1);
      v.push(-1, 1, -1, 1);
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    const geo = guarda(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(u), 1));
    geo.setAttribute('aV', new THREE.BufferAttribute(new Float32Array(v), 1));
    geo.setIndex(idx);
    const raios = new THREE.Mesh(geo, shader(RAIO_VS, RAIO_FS, {
      uCor: { value: cor(R.cor) }, uTempo: { value: 0 }, uN: { value: R.pulsos }, uVel: { value: R.vel },
      uAlfa: { value: R.alfa }, uBase: { value: R.base }, uCauda: { value: R.cauda }, uForca: { value: 0 }
    }, A.raios, true));
    roda.add(raios);
  }

  /* os jatos: duas faixas no eixo vertical, mesmo shader dos raios com os
     pulsos correndo para fora (velocidade negativa). aU 0 na ponta, 1 no
     núcleo: as pontas esmaecem nos dois lados */
  const J = SPEC.jatos;
  {
    const pos = [], u = [], v = [], idx = [];
    [1, -1].forEach((lado, i) => {
      const y0 = lado * (J.de + J.comp), y1 = lado * J.de, w0 = J.largura[1] / 2, w1 = J.largura[0] / 2;
      const b = i * 4;
      pos.push(-w0, y0, 0, w0, y0, 0, -w1, y1, 0, w1, y1, 0);
      u.push(0, 0, 1, 1);
      v.push(-1, 1, -1, 1);
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    });
    const geo = guarda(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(u), 1));
    geo.setAttribute('aV', new THREE.BufferAttribute(new Float32Array(v), 1));
    geo.setIndex(idx);
    const jatos = new THREE.Mesh(geo, shader(RAIO_VS, RAIO_FS, {
      uCor: { value: cor(J.cor) }, uTempo: { value: 0 }, uN: { value: J.pulsos }, uVel: { value: -J.vel },
      uAlfa: { value: J.alfa }, uBase: { value: J.base }, uCauda: { value: J.cauda }, uForca: { value: 0 }
    }, A.jatos, true));
    raiz.add(jatos);
  }

  /* os lampejos de injeção: 12 pontos onde os raios tocam o portal, um
     material só (piscam juntos) */
  const LP = R.lampejo;
  const matLampejo = guarda(new THREE.SpriteMaterial({ map: guarda(texturaHalo(THREE, 0.05)), color: cor(R.cor), opacity: 0, depthTest: false, ...ADITIVO }));
  for (let i = 0; i < R.n; i++) {
    const a = i * (TAU / R.n);
    const sp = new THREE.Sprite(matLampejo);
    sp.position.set(Math.cos(a) * R.de, Math.sin(a) * R.de, 0);
    sp.scale.setScalar(LP.escala);
    roda.add(sp);
  }

  const G = SPEC.regua;
  const matRegua = aditivo(G.cor, G.alfa);
  {
    const marcas = new THREE.InstancedMesh(guarda(new THREE.BoxGeometry(0.0035, 0.026, 0.0035)), matRegua, G.n);
    const m = new THREE.Object3D();
    for (let i = 0; i < G.n; i++) {
      const a = (i / G.n) * TAU, longa = i % G.longa === 0;
      const r = G.raio + (longa ? 0.012 : 0);
      m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      m.rotation.set(0, 0, a - Math.PI / 2);
      m.scale.set(1, longa ? 2 : 1, 1);
      m.updateMatrix();
      marcas.setMatrixAt(i, m.matrix);
    }
    roda.add(marcas);
    descartar.push(marcas);
  }

  /* --- trilhos: anéis contínuos com pulsos correndo --- */
  const matTrilhos = [];
  for (const d of SPEC.trilhos) {
    const base = aditivo(d.cor, d.alfa * 0.25);
    raiz.add(new THREE.Mesh(guarda(new THREE.TorusGeometry(d.raio, d.tubo, 6, 220)), base));
    matTrilhos.push({ mat: base, alfa: d.alfa * 0.25 });
    raiz.add(fluxo(d.raio, d.tubo * 1.6, d, A.trilhos));
  }

  /* --- o anel do equador: vidro inteiro no plano do disco + pulsos fracos.
     Era um giroscópio de dois anéis; o vertical com o disco formava o
     símbolo do átomo (crítica rodada 3) e saiu: o eixo vertical são os
     jatos --- */
  const D = SPEC.disco;
  const E = SPEC.equador;
  const equador = new THREE.Group();
  equador.rotation.x = D.inclina;
  const anelEquador = new THREE.Group();
  anelEquador.add(fluxo(E.raio, E.tubo, E.fluxo, A.equador));
  equador.add(anelEquador);
  raiz.add(equador);

  /* --- o disco de partículas --- */
  const nDisco = celular ? D.nCelular : D.n;
  const geoD = guarda(new THREE.BufferGeometry());
  {
    const ang = new Float32Array(nDisco), raio = new Float32Array(nDisco), tam = new Float32Array(nDisco);
    for (let i = 0; i < nDisco; i++) {
      ang[i] = sorte() * TAU;
      /* `denso` das partículas no miolo (a matéria se acumula perto do núcleo) */
      const dentro = sorte() < D.denso;
      raio[i] = dentro ? mistura(D.raio[0], mistura(D.raio[0], D.raio[1], D.miolo), sorte())
        : mistura(mistura(D.raio[0], D.raio[1], D.miolo), D.raio[1], Math.sqrt(sorte()));
      tam[i] = D.tam * (0.5 + sorte() * sorte() * 1.6);
    }
    geoD.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nDisco * 3), 3));
    geoD.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
    geoD.setAttribute('aRaio', new THREE.BufferAttribute(raio, 1));
    geoD.setAttribute('aTam', new THREE.BufferAttribute(tam, 1));
  }
  const matDisco = shader(DISCO_VS, DISCO_FS, {
    uCor: { value: cor(D.cor) }, uTempo: { value: 0 }, uRmin: { value: D.raio[0] }, uRmax: { value: D.raio[1] },
    uGiro: { value: D.giro }, uKepler: { value: D.kepler }, uEscala: { value: 500 }, uAlfa: { value: D.alfa }, uRastro: { value: D.rastro }, uForca: { value: 0 }
  }, A.disco);
  const disco = new THREE.Points(geoD, matDisco);
  disco.frustumCulled = false;   /* as posições nascem no shader; a caixa da geometria é zero */
  disco.rotation.x = D.inclina;
  raiz.add(disco);

  /* --- a lente --- */
  const lente = SPEC.lente.map((d) => {
    const mat = aditivo(d.cor, d.alfa);
    const anel = new THREE.Mesh(guarda(new THREE.TorusGeometry(d.raio, d.tubo, 6, 160)), mat);
    if (d.marcas) {
      const marcas = new THREE.InstancedMesh(guarda(new THREE.BoxGeometry(0.003, 0.018, 0.003)), mat, d.marcas);
      const m = new THREE.Object3D();
      for (let i = 0; i < d.marcas; i++) {
        const a = (i / d.marcas) * TAU, longa = i % 4 === 0;
        const r = d.raio + (longa ? 0.026 : 0.02);
        m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        m.rotation.set(0, 0, a - Math.PI / 2);
        m.scale.set(1, longa ? 1.7 : 1, 1);
        m.updateMatrix();
        marcas.setMatrixAt(i, m.matrix);
      }
      anel.add(marcas);
      descartar.push(marcas);
    }
    raiz.add(anel);
    return { anel, mat, d };
  });

  /* --- o núcleo --- */
  const nucleo = new THREE.Group();
  raiz.add(nucleo);
  const ponto = new THREE.Mesh(
    guarda(new THREE.IcosahedronGeometry(SPEC.nucleo.raio, 2)),
    guarda(new THREE.MeshBasicMaterial({ color: cor('t1') }))
  );
  nucleo.add(ponto);

  /* a luz do núcleo não é ocultada pelo que passa na frente (depthTest
     desligado): o clarão lava tudo, como na referência */
  function sprite(tex, nomeCor, alfa) {
    return new THREE.Sprite(guarda(new THREE.SpriteMaterial({
      map: tex, color: cor(nomeCor), opacity: alfa, depthTest: false, ...ADITIVO
    })));
  }
  const halos = SPEC.nucleo.halos.map((h) => {
    const s = sprite(guarda(texturaHalo(THREE, h.miolo)), h.cor, h.alfa);
    s.scale.setScalar(h.escala);
    nucleo.add(s);
    return { s, h };
  });
  const RA = SPEC.nucleo.raios;
  const estrela = sprite(guarda(texturaRaios(THREE, RA.n)), RA.cor, RA.alfa);
  estrela.scale.setScalar(RA.escala);
  nucleo.add(estrela);
  const texTraco = guarda(texturaTraco(THREE));
  const tracos = SPEC.nucleo.tracos.map((d) => {
    const s = sprite(texTraco, d.cor, d.alfa);
    s.scale.set(d.largura, d.altura, 1);
    nucleo.add(s);
    return { s, d };
  });
  const O = SPEC.onda;
  const onda = sprite(guarda(texturaOnda(THREE)), O.cor, 0);
  nucleo.add(onda);

  /* ---------- por quadro ---------- */
  /* estado: { t (s), montagem 0–1, abertura 0–1, ignicao 0–1+, desdeIgnicao
     (s, −1 antes), px, py (−1–1) } */
  function atualizar(e) {
    const t = e.t, m = e.montagem, ab = e.abertura;
    const ig = e.ignicao * (0.95 + 0.05 * Math.sin(t * 1.25));   /* respira */
    const forca = ig * (1 - ab * 0.6);

    /* inclina ao ponteiro e balança devagar: mostra a profundidade sem
       perder a simetria de frente */
    raiz.rotation.x = e.py * 0.2 + Math.sin(t * 0.09) * 0.05;
    raiz.rotation.y = e.px * 0.28 + Math.sin(t * 0.12) * 0.14;

    roda.rotation.z = t * P.vel;
    for (let i = 0; i < segmentos.length; i++) {
      const s = segmentos[i];
      const k = suave((m - s.atraso) / (1 - s.atraso));
      const fora = (1 - k) * 0.9 + ab * 0.22;
      s.pivo.position.set(s.dir.x * fora, s.dir.y * fora, (1 - k) * 1.4);
      s.pivo.rotation.z = (1 - k) * 0.35;
    }

    const kEq = suave((m - 0.3) / 0.7);
    anelEquador.scale.setScalar((0.55 + 0.45 * kEq) * (1 + ab * 0.14));
    anelEquador.rotation.z = t * E.vel;

    const aparece = suave(m);
    matRegua.opacity = G.alfa * aparece;
    for (let i = 0; i < matTrilhos.length; i++) matTrilhos[i].mat.opacity = matTrilhos[i].alfa * aparece;
    for (let i = 0; i < lente.length; i++) {
      const l = lente[i];
      l.anel.rotation.z = t * l.d.vel;
      l.mat.opacity = l.d.alfa * aparece * (0.3 + 0.7 * ig);
    }

    /* o relógio dos shaders dá a volta a cada VOLTA s: o uniform é float32 e
       depois de horas o passo dele passaria de um quadro (a energia
       gaguejaria). Em 400 s todo t·vel dos pulsos fecha inteiro (0,22, 0,14,
       0,3 e 0,625 × 400), então a volta não aparece; no disco ela troca as
       partículas de lugar num quadro, com a mesma distribuição. Material
       apagado nem é desenhado (a montagem é a fase mais cara). */
    const desde = e.desdeIgnicao;
    const tShader = t % VOLTA;
    for (let i = 0; i < energia.length; i++) {
      const { m: mat, atraso } = energia[i];
      const f = desde < 0 ? 0 : forca * suave((desde - atraso) / 0.3);
      mat.uniforms.uTempo.value = tShader;
      mat.uniforms.uForca.value = f;
      mat.visible = f > 0.002;
    }

    /* a batida: o núcleo cresce um pouco a cada chegada dos pulsos dos raios
       (a cabeça chega à ponta de dentro quando t·vel passa por 0,7 mod 1) */
    const fase = (((t * R.vel - 0.7) % 1) + 1) % 1;
    const batida = 1 + R.batida * Math.exp(-fase * 9) * ig;
    /* o lampejo: a cabeça do pulso parte da borda (u = 0) quando t·vel passa
       por um inteiro; pisca e some em `dura` s */
    const partiu = ((((t * R.vel) % 1) + 1) % 1) / R.vel;
    const lampejo = desde < A.raios ? 0 : LP.alfa * Math.max(0, 1 - partiu / LP.dura) * forca;
    matLampejo.opacity = lampejo;
    matLampejo.visible = lampejo > 0.002;

    /* uCentro fica na origem: na v2 o núcleo não se move */
    vidro.uniforms.uIgnicao.value = ig;

    for (let i = 0; i < halos.length; i++) {
      const { s, h } = halos[i];
      s.material.opacity = h.alfa * (i === 0 ? 0.12 + 0.88 * ig : ig);
      s.scale.setScalar(h.escala * (0.55 + 0.45 * ig) * batida);
    }
    estrela.material.opacity = RA.alfa * ig;
    estrela.material.visible = ig > 0.002;
    for (let i = 1; i < halos.length; i++) halos[i].s.material.visible = ig > 0.002;
    estrela.material.rotation = t * 0.02;
    ponto.scale.setScalar((0.45 + 0.55 * ig) * batida);

    /* o traço é um evento: nasce do núcleo na ignição e assenta */
    const nasceu = desde < 0 ? 0 : 1 - (1 - Math.min(1, desde / SPEC.nucleo.nasce)) ** 3;
    const assentou = desde < SPEC.nucleo.nasce ? 0 : suave((desde - SPEC.nucleo.nasce) / SPEC.nucleo.assenta);
    for (let i = 0; i < tracos.length; i++) {
      const { s, d } = tracos[i];
      s.scale.x = Math.max(0.001, nasceu * mistura(d.largura, d.assenta.largura, assentou));
      s.material.opacity = (desde < 0 ? 0 : mistura(d.alfa, d.assenta.alfa, assentou)) * (1 - ab * 0.5);
      s.material.visible = desde >= 0;
    }

    /* a onda: um anel de 1 px que sai do núcleo e se desfaz; a primeira na
       própria ignição, depois a cada `periodo` s. O sprite de escala 1 tem
       o anel a 0,97 da metade: escala = 2·raio/0,97 */
    const p = desde < 0 ? 1 : (desde % O.periodo) / O.dura;
    onda.material.visible = p < 1;
    if (p < 1) {
      const k = 1 - (1 - p) ** 3;
      onda.scale.setScalar((2 * mistura(O.raio[0], O.raio[1], k)) / 0.97);
      onda.material.opacity = O.alfa * (1 - p) * forca;
    }
  }

  /* o tamanho das partículas em pixels depende da altura do canvas */
  function tamanhoTela(alturaPx, fov) {
    matDisco.uniforms.uEscala.value = alturaPx / (2 * Math.tan((fov * Math.PI) / 360));
  }

  function dispose() {
    for (const x of descartar) if (x.dispose) x.dispose();
  }

  return { raiz, atualizar, tamanhoTela, dispose };
}
