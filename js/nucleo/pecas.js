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

/* um vec4 de uniform sem THREE.Vector4 (fora do three reduzido): o setter do
   three lê x, y, z, w de qualquer objeto */
const vec4 = (x = 0, y = 0, z = 0, w = 0) => ({ x, y, z, w });
const por4 = (v, x, y, z, w) => { v.x = x; v.y = y; v.z = z; v.w = w; };

/* o fôlego: 0 (vazio) → 1 (cheio) → 0 em `periodo` s; inspira em `insp` do
   ciclo e solta no resto, mais devagar. Derivada zero nas duas viradas: o
   reator nunca dá tranco ao mudar de direção */
function folego(t, periodo, insp) {
  const x = (((t / periodo) % 1) + 1) % 1;
  return x < insp ? suave(x / insp) : 1 - suave((x - insp) / (1 - insp));
}

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
  uniform vec3 uNevoa;
  uniform vec3 uBisel;
  uniform float uBiselCos;
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
    /* estreito (40): só o que está mesmo na frente do núcleo, na linha de
       visão, deixa a luz passar */
    float atraves = pow(max(dot(-V, L), 0.0), 40.0);
    vec3 c = uBase * 0.45;
    c += uInterno * difusa * difusa * queda * (0.05 + 0.95 * ig);
    c += uInterno * atraves * 0.32 * ig;
    c += uAresta * fres * (0.03 + 0.12 * ig);
    c += uBrilho * espec * queda * 3.2 * ig;
    c += (mix(uInterno, uBrilho, 0.45) * faixa * 0.2 + uBrilho * faixa2 * 0.12 + uBrilho * topo * 0.1) * (0.06 + 0.94 * fres);   /* reflexo só de raspão: face de frente fica escura (lia como azulejo cinza) */
    c += uAmbiente * fres * 0.05;
    /* uma luz-chave fixa de cima à esquerda: o anel não brilha igual em toda
       a volta */
    vec3 K = normalize(vec3(-0.5, 0.7, 0.55));
    c += uBrilho * pow(max(dot(N, normalize(K + V)), 0.0), 70.0) * 0.18;
    /* o bisel: um único reflexo que corre no anel (uBisel.xy = direção,
       uBisel.z = pico); branco no meio, ciano nas pontas */
    float cosD = dot(normalize(vP.xy + 1e-5), uBisel.xy);
    float bisel = smoothstep(uBiselCos, 1.0, cosD);   /* uBiselCos = cos(meia-largura do arco) */
    c += mix(uInterno, uBrilho, bisel) * bisel * bisel * uBisel.z * ig;
    /* névoa: quanto mais longe da câmera, mais escuro. A câmera está no eixo
       z e o núcleo na origem, então a profundidade é só o z */
    float prof = vP.z - uCentro.z;
    c *= mix(uNevoa.z, 1.0, smoothstep(uNevoa.y, uNevoa.x, prof));
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

/* os raios e os jatos: faixas com aU 0…1 ao longo e aV −1…1 através. UMA
   frente de energia por fôlego (uFrente, em aU), com rastro atrás dela;
   uDir +1 corre para aU maior (raios: para dentro), −1 para menor (jatos:
   para fora). uPulso: a força da frente; uBase: o canal aceso */
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
  uniform float uFrente;
  uniform float uDir;
  uniform float uPulso;
  uniform float uAlfa;
  uniform float uBase;
  uniform float uCauda;
  uniform float uForca;
  varying float vU;
  varying float vV;
  void main() {
    float d = (vU - uFrente) * uDir;   /* > 0: à frente da cabeça; < 0: o rastro */
    float pulso = d > 0.0 ? exp(-d * d * 800.0) : exp(d / uCauda);
    float atravessa = 1.0 - vV * vV;
    float pontas = smoothstep(0.0, 0.12, vU) * (1.0 - smoothstep(0.82, 1.0, vU));
    float b = (pulso * uPulso + uBase) * atravessa * atravessa * pontas;
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

/* o campo e a onda do toque, nas lâminas (preenchimento e contorno usam o
   MESMO trecho: as duas partes de uma lâmina andam juntas). Coordenadas no
   plano da própria camada (atualizar já desfaz o giro e a escala).
   uCampo: xy ponto, z força, w raio. uOnda: xy origem, z raio da frente, w
   força. uDesloca: x empurra, y ergue, z largura da frente da onda.
   vToque: quanto do campo e da onda chegou a este vértice; o fragmento
   acende o cristal com ele (num traço de 1 px, o deslocamento sozinho quase
   não se lê; a luz se lê) */
const DESLOCA = /* glsl */`
  uniform vec4 uCampo;
  uniform vec4 uOnda;
  uniform vec3 uDesloca;
  varying float vToque;
  vec3 deslocar(vec3 p) {
    vec2 d = p.xy - uCampo.xy;
    float k = exp(-dot(d, d) / (uCampo.w * uCampo.w)) * uCampo.z;
    vec2 o = p.xy - uOnda.xy;
    float r = length(o);
    float e = (r - uOnda.z) / uDesloca.z;
    float w = exp(-e * e) * uOnda.w;
    p.xy += d / (length(d) + 1e-4) * k * uDesloca.x + o / (r + 1e-4) * w * uDesloca.x;
    p.z += (k + w) * uDesloca.y;
    vToque = k + w;
    return p;
  }
`;

/* o painel de vidro delicado: preenchimento aditivo que recebe a luz do
   núcleo. aR 0 na borda de dentro → 1 na de fora; a luz cai a zero em uCai */
const PAINEL_VS = /* glsl */`
  attribute float aR;
  varying float vR;
  varying float vProf;
  ${DESLOCA}
  void main() {
    vR = aR;
    vec4 w = modelMatrix * vec4(deslocar(position), 1.0);
    vProf = w.z;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const PAINEL_FS = /* glsl */`
  uniform vec3 uCor;
  uniform float uAlfa;
  uniform float uCai;
  uniform float uForca;
  uniform vec3 uNevoa;
  uniform float uAcende;
  varying float vR;
  varying float vProf;
  varying float vToque;
  void main() {
    float b = (1.0 - smoothstep(0.0, uCai, vR)) + vToque * 0.5;
    b *= mix(uNevoa.z, 1.0, smoothstep(uNevoa.y, uNevoa.x, vProf));
    gl_FragColor = vec4(uCor, b * b * uAlfa * uForca * (1.0 + vToque * uAcende));
    #include <colorspace_fragment>
  }
`;

/* o contorno de cristal: a aresta recebe a luz do núcleo (forte na borda de
   dentro, aR 0, apagando para fora) e a face de trás (aFace 0) fica mais
   fraca que a da frente — é o que dá volume a um traço de 1 px */
const LINHA_VS = /* glsl */`
  attribute float aR;
  attribute float aFace;
  varying float vR;
  varying float vFace;
  varying float vProf;
  ${DESLOCA}
  void main() {
    vR = aR; vFace = aFace;
    vec4 w = modelMatrix * vec4(deslocar(position), 1.0);
    vProf = w.z;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const LINHA_FS = /* glsl */`
  uniform vec3 uCor;
  uniform float uAlfa;
  uniform vec3 uNevoa;
  uniform float uAcende;
  varying float vR;
  varying float vFace;
  varying float vProf;
  varying float vToque;
  void main() {
    float b = (1.0 - 0.78 * smoothstep(0.0, 1.0, vR)) * mix(0.4, 1.0, vFace);
    b *= 1.0 + vToque * uAcende;
    b *= mix(uNevoa.z, 1.0, smoothstep(uNevoa.y, uNevoa.x, vProf));
    gl_FragColor = vec4(uCor, b * uAlfa);
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
      uIgnicao: { value: 0 },
      uNevoa: { value: new THREE.Vector3(SPEC.nevoa.perto, SPEC.nevoa.longe, SPEC.nevoa.minimo) },
      uBisel: { value: new THREE.Vector3(1, 0, 0) },
      uBiselCos: { value: Math.cos(SPEC.portal.bisel.meia) }
    }
  }));
  const nevoa = vidro.uniforms.uNevoa;   /* o MESMO objeto nos cristais: uma névoa só */
  const CA = SPEC.campo, TQ = SPEC.toque;
  const desloca = { value: new THREE.Vector3(CA.empurra, CA.ergue, TQ.largura) };
  const acende = { value: CA.acende };

  /* uma camada de painéis (câmaras ou pétalas): os n setores numa geometria
     só (preenchimento) e o contorno de 1 px de todos numa LineSegments só.
     Duas chamadas por camada, em vez das 12 placas extrudadas da v2 */
  function camadaDePaineis(d, defasagem) {
    const passoD = TAU / d.n, larg = passoD * (1 - d.vao), seg = 14;
    const tri = [], aR = [], lin = [], linR = [], linF = [];
    const ponto = (r, a, z = d.z) => [Math.cos(a) * r, Math.sin(a) * r, z];
    const zT = d.z - d.espessura / 2, zF = d.z + d.espessura / 2;
    /* um traço do contorno: dois pontos, com o raio relativo e a face */
    const traco = (pa, ra, pb, rb, fa, fb) => { lin.push(...pa, ...pb); linR.push(ra, rb); linF.push(fa, fb); };
    for (let i = 0; i < d.n; i++) {
      const meio = (i + defasagem) * passoD, a0 = meio - larg / 2, a1 = a0 + larg;
      for (let k = 0; k < seg; k++) {
        const aa = a0 + (larg * k) / seg, ab = a0 + (larg * (k + 1)) / seg;
        const i0 = ponto(d.raio[0], aa), o0 = ponto(d.raio[1], aa), i1 = ponto(d.raio[0], ab), o1 = ponto(d.raio[1], ab);
        tri.push(...i0, ...o0, ...i1, ...i1, ...o0, ...o1);
        aR.push(0, 1, 0, 0, 1, 1);
        for (const [z, f] of [[zT, 0], [zF, 1]]) {           /* arcos de dentro e de fora, nas duas faces */
          traco(ponto(d.raio[0], aa, z), 0, ponto(d.raio[0], ab, z), 0, f, f);
          traco(ponto(d.raio[1], aa, z), 1, ponto(d.raio[1], ab, z), 1, f, f);
        }
      }
      for (const a of [a0, a1]) {
        for (const [z, f] of [[zT, 0], [zF, 1]]) traco(ponto(d.raio[0], a, z), 0, ponto(d.raio[1], a, z), 1, f, f);   /* arestas radiais */
        traco(ponto(d.raio[0], a, zT), 0, ponto(d.raio[0], a, zF), 0, 0, 1);    /* as arestas de espessura (quinas) */
        traco(ponto(d.raio[1], a, zT), 1, ponto(d.raio[1], a, zF), 1, 0, 1);
      }
    }
    /* o preenchimento e o contorno leem os MESMOS objetos: andam juntos */
    const campo = { uCampo: { value: vec4(0, 0, 0, CA.raio) }, uOnda: { value: vec4() }, uDesloca: desloca, uAcende: acende };
    const geoP = guarda(new THREE.BufferGeometry());
    geoP.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tri), 3));
    geoP.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(aR), 1));
    const geoL = guarda(new THREE.BufferGeometry());
    geoL.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lin), 3));
    geoL.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(linR), 1));
    geoL.setAttribute('aFace', new THREE.BufferAttribute(new Float32Array(linF), 1));
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh(geoP, shader(PAINEL_VS, PAINEL_FS, {
      uCor: { value: cor('ac') }, uAlfa: { value: d.luz }, uCai: { value: d.cai }, uForca: { value: 0 }, uNevoa: nevoa, ...campo
    }, A.raios, true)));
    const matL = guarda(new THREE.ShaderMaterial({
      vertexShader: LINHA_VS, fragmentShader: LINHA_FS, ...ADITIVO,
      uniforms: { uCor: { value: cor('ac2') }, uAlfa: { value: d.contorno }, uNevoa: nevoa, ...campo }
    }));
    grupo.add(new THREE.LineSegments(geoL, matL));
    roda.add(grupo);
    return { grupo, matL, d, campo };
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
  function anelDeSegmentos(raio, tubo, z, defasagem, atraso0) {
    const geo = guarda(new THREE.TorusGeometry(raio, tubo, 10, 40, passo * (1 - P.vao)));
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
  anelDeSegmentos(P.raio, P.tubo, 0, 0, 0.08);
  /* o fio de trás: uma linha contínua e fraca (com segmentos de vidro lia
     como imagem duplicada do portal — rodada 6) */
  const matFio = aditivo(P.fio.cor, P.fio.alfa);
  const fio = new THREE.Mesh(guarda(new THREE.TorusGeometry(P.fio.raio, P.fio.tubo, 4, 220)), matFio);
  fio.position.z = P.fio.z;
  raiz.add(fio);

  const R = SPEC.raios;
  let fluxoRaios, fluxoJatos;   /* os uniforms da frente de energia (atualizar) */
  {
    const n = R.n, pos = [], u = [], v = [], idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * (TAU / n);
      const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
      const w0 = R.largura / 2, w1 = R.ponta / 2;
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
      uCor: { value: cor(R.cor) }, uFrente: { value: 0 }, uDir: { value: 1 }, uPulso: { value: 0 },
      uAlfa: { value: R.alfa }, uBase: { value: R.base }, uCauda: { value: R.cauda }, uForca: { value: 0 }
    }, A.raios, true));
    roda.add(raios);
    fluxoRaios = raios.material.uniforms;
  }

  /* os jatos: duas faixas no eixo vertical, mesmo shader dos raios com a
     frente correndo para fora (uDir −1). aU 0 na ponta, 1 no núcleo: as
     pontas esmaecem nos dois lados */
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
      uCor: { value: cor(J.cor) }, uFrente: { value: 0 }, uDir: { value: -1 }, uPulso: { value: 0 },
      uAlfa: { value: J.alfa }, uBase: { value: J.base }, uCauda: { value: J.cauda }, uForca: { value: 0 }
    }, A.jatos, true));
    raiz.add(jatos);
    fluxoJatos = jatos.material.uniforms;
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
  /* duas forças: as curtas discretas e uma longa a cada `longa` mais forte
     (um material só para tudo deixava a régua inteira com o mesmo peso) */
  const matRegua = aditivo(G.cor, G.alfa);
  const matReguaLonga = aditivo(G.cor, G.alfaLonga);
  {
    const geoMarca = guarda(new THREE.BoxGeometry(G.marca, 0.02, G.marca));
    const nLongas = Math.ceil(G.n / G.longa);
    const curtas = new THREE.InstancedMesh(geoMarca, matRegua, G.n - nLongas);
    const longas = new THREE.InstancedMesh(geoMarca, matReguaLonga, nLongas);
    const m = new THREE.Object3D();
    let ic = 0, il = 0;
    for (let i = 0; i < G.n; i++) {
      const a = (i / G.n) * TAU, longa = i % G.longa === 0;
      const r = G.raio + (longa ? 0.012 : 0);
      m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      m.rotation.set(0, 0, a - Math.PI / 2);
      m.scale.set(1, longa ? 2 : 1, 1);
      m.updateMatrix();
      if (longa) longas.setMatrixAt(il++, m.matrix); else curtas.setMatrixAt(ic++, m.matrix);
    }
    roda.add(curtas, longas);
    descartar.push(curtas, longas);
  }

  /* --- as câmaras (entre os raios) e as pétalas (sobre os raios) --- */
  const RS = SPEC.respira;
  const paineis = [camadaDePaineis(SPEC.camaras, 0.5), camadaDePaineis(SPEC.petalas, 0)];
  paineis[0].respira = RS.camaras;
  paineis[1].respira = RS.petalas;
  /* quanto a camada [atraso, amp] cresceu no instante t */
  const respira = (t, c) => folego(t - c[0], RS.periodo, RS.inspira) * c[1];
  const SEM_CAMPO = { x: 0, y: 0, f: 0 }, SEM_TOQUE = { x: 0, y: 0, t: -1 }, SEM_OLHAR = { x: 0, y: 0, f: 0 };
  const OL = SPEC.olhar;
  /* a pose do último quadro: a rede (js/rede.js) prende a constelação do hero
     aos 12 pontos de entrada dos raios, que giram com a roda */
  const pose = { giro: 0, rx: 0, ry: 0, entrada: SPEC.raios.de };
  const centro = new THREE.Vector3();

  const TR = SPEC.tracejado;
  const matTracejado = aditivo(TR.cor, TR.alfa);
  const tracejado = new THREE.InstancedMesh(guarda(new THREE.BoxGeometry(0.022, 0.004, 0.004)), matTracejado, TR.n);
  {
    const m = new THREE.Object3D();
    for (let i = 0; i < TR.n; i++) {
      const a = (i / TR.n) * TAU;
      m.position.set(Math.cos(a) * TR.raio, Math.sin(a) * TR.raio, TR.z);
      m.rotation.set(0, 0, a + Math.PI / 2);
      m.updateMatrix();
      tracejado.setMatrixAt(i, m.matrix);
    }
  }
  descartar.push(tracejado);
  raiz.add(tracejado);

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
      const marcas = new THREE.InstancedMesh(guarda(new THREE.BoxGeometry(d.marca, 0.018, d.marca)), mat, d.marcas);
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
  const texHalo = {};
  const halo = (miolo) => texHalo[miolo] || (texHalo[miolo] = guarda(texturaHalo(THREE, miolo)));
  const halos = SPEC.nucleo.halos.map((h) => {
    const s = sprite(halo(h.miolo), h.cor, h.alfa);
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
     (s, −1 antes), giroExtra (rad, o impulso da rolagem), campo { x, y, f }
     (o ponteiro no plano do reator, força 0–1), toque { x, y, t } (onde e
     há quantos s; t < 0: nenhum), olhar { x, y, f } (a direção do cursor,
     comprimento ≤ 1) }. Os quatro últimos são opcionais (o laboratório e o
     vídeo podem não ter) */
  function atualizar(e) {
    const t = e.t, m = e.montagem, ab = e.abertura;
    const c = e.campo || SEM_CAMPO, tq = e.toque || SEM_TOQUE, o = e.olhar || SEM_OLHAR;
    /* o núcleo clareia ao inspirar (±luz/2 em volta do repouso) */
    const ig = e.ignicao * (1 + RS.luz * (folego(t - RS.nucleo[0], RS.periodo, RS.inspira) - 0.5));
    const forca = ig * (1 - ab * 0.6);
    const giro = t * P.vel + (e.giroExtra || 0);
    /* o ponteiro perto do núcleo: ele "percebe" e clareia */
    const perto = c.f * CA.brilho * suave(1 - Math.hypot(c.x, c.y) / CA.perto);
    /* a onda do toque: a frente sai do ponto tocado e perde força */
    const tocando = tq.t >= 0 && tq.t < TQ.dura;
    const frente = tocando ? TQ.vel * tq.t : 0;
    const forcaOnda = tocando ? (1 - tq.t / TQ.dura) ** 2 : 0;

    /* balança devagar, sozinho: mostra a profundidade sem perder a simetria
       de frente. NÃO segue o cursor (pedido do dono: só o núcleo segue) */
    raiz.rotation.x = SPEC.inclina + Math.sin(t * 0.09) * 0.05;
    raiz.rotation.y = Math.sin(t * 0.12) * 0.14;
    pose.giro = giro; pose.rx = raiz.rotation.x; pose.ry = raiz.rotation.y;

    roda.rotation.z = giro;
    const foraPortal = P.raio * respira(t, RS.portal);
    for (let i = 0; i < segmentos.length; i++) {
      const s = segmentos[i];
      const k = suave((m - s.atraso) / (1 - s.atraso));
      const fora = (1 - k) * 0.9 + ab * 0.22 + foraPortal;
      s.pivo.position.set(s.dir.x * fora, s.dir.y * fora, (1 - k) * 1.4);
      s.pivo.rotation.z = (1 - k) * 0.35;
    }

    /* o campo e a onda vão para o plano de cada camada: desfaz o giro da
       roda e a escala da camada (o shader compara com a posição local) */
    const cg = Math.cos(-giro), sg = Math.sin(-giro);
    for (let i = 0; i < paineis.length; i++) {
      const pa = paineis[i], M = pa.d.montagem;
      const k = suave((m - M.atraso) / (1 - M.atraso));
      const esc = mistura(M.escala, 1, k) * (1 + ab * 0.1) * (1 + respira(t, pa.respira));
      pa.grupo.scale.setScalar(esc);
      pa.matL.uniforms.uAlfa.value = pa.d.contorno * k * (1 - ab * 0.6);
      pa.matL.visible = k > 0.002;
      por4(pa.campo.uCampo.value, (c.x * cg - c.y * sg) / esc, (c.x * sg + c.y * cg) / esc, c.f * k, CA.raio / esc);
      por4(pa.campo.uOnda.value, (tq.x * cg - tq.y * sg) / esc, (tq.x * sg + tq.y * cg) / esc, frente / esc, forcaOnda * k);
    }
    /* o tracejado gira ao contrário da roda, também no impulso da rolagem
       (engrenagens) */
    tracejado.rotation.z = t * TR.vel - (e.giroExtra || 0) * 0.5;
    tracejado.scale.setScalar(1 + respira(t, RS.tracejado));
    matTracejado.opacity = TR.alfa * suave(m);

    const kEq = suave((m - 0.3) / 0.7);
    anelEquador.scale.setScalar((0.55 + 0.45 * kEq) * (1 + ab * 0.14));
    anelEquador.rotation.z = t * E.vel;

    const aparece = suave(m);
    matRegua.opacity = G.alfa * aparece;
    matReguaLonga.opacity = G.alfaLonga * aparece;
    matFio.opacity = P.fio.alfa * aparece;
    /* o bisel corre uma volta a cada `volta` s; com o cursor no hero ele
       vira para o lado do cursor (o anel reflete a sua luz), pelo caminho
       mais curto. No mundo o plano do reator está inclinado: o y encolhe */
    /* A mistura é de DIREÇÕES (vetores), não de ângulos: misturar ângulos
       saltava ~50° toda vez que a volta própria passava pelo lado oposto ao
       cursor (revisão de código) */
    const aB = (t / P.bisel.volta) * TAU, w = o.f * OL.bisel;
    let bx = Math.cos(aB), by = Math.sin(aB);
    if (w > 0.001) {
      const cx = o.x, cy = o.y * Math.cos(SPEC.inclina), r = Math.hypot(cx, cy);
      if (r > 1e-3) { bx = mistura(bx, cx / r, w); by = mistura(by, cy / r, w); }
      const rb = Math.hypot(bx, by) || 1;
      bx /= rb; by /= rb;
    }
    vidro.uniforms.uBisel.value.set(bx, by, P.bisel.alfa);
    for (let i = 0; i < matTrilhos.length; i++) matTrilhos[i].mat.opacity = matTrilhos[i].alfa * aparece;
    /* o olhar: o núcleo vai na direção do cursor (quem amacia é o gesto); a
       lente vai parte do caminho e o resto fica: lê como profundidade */
    nucleo.position.set(o.x * OL.alcance * o.f, o.y * OL.alcance * o.f, 0);
    const escLente = 1 + respira(t, RS.lente);
    for (let i = 0; i < lente.length; i++) {
      const l = lente[i];
      l.anel.rotation.z = t * l.d.vel;
      l.anel.position.set(nucleo.position.x * OL.lente, nucleo.position.y * OL.lente, 0);
      l.anel.scale.setScalar(escLente);
      l.mat.opacity = l.d.alfa * aparece * (0.3 + 0.7 * ig);
    }

    /* o relógio dos shaders dá a volta a cada VOLTA s: o uniform é float32 e
       depois de horas o passo dele passaria de um quadro (a energia
       gaguejaria). Em 400 s todo t·vel dos pulsos dos anéis fecha inteiro
       (0,22, 0,14 e 0,3 × 400), então a volta não aparece; no disco ela troca as
       partículas de lugar num quadro, com a mesma distribuição. Material
       apagado nem é desenhado (a montagem é a fase mais cara). */
    const desde = e.desdeIgnicao;
    const tShader = t % VOLTA;
    for (let i = 0; i < energia.length; i++) {
      const { m: mat, atraso } = energia[i];
      const f = desde < 0 ? 0 : forca * suave((desde - atraso) / 0.3);
      if (mat.uniforms.uTempo) mat.uniforms.uTempo.value = tShader;   /* o painel não usa tempo */
      mat.uniforms.uForca.value = f;
      mat.visible = f > 0.002;
    }

    /* o ciclo da energia, preso ao fôlego do núcleo (x: 0 → 1 por fôlego).
       Inspira: a frente entra pelo portal (o lampejo) e é puxada pelos raios,
       acelerando, até o núcleo, onde chega no fôlego cheio (x = inspira) e
       ele bate. Expira: os jatos soltam a energia para fora. */
    const x = ((((t - RS.nucleo[0]) / RS.periodo) % 1) + 1) % 1;
    const insp = RS.inspira;
    /* sai do portal já no começo (linear) e é puxada acelerando depois (x^puxa);
       passa de 1 depois da chegada: o rastro entra no núcleo e some */
    const u = x / insp;
    fluxoRaios.uFrente.value = mistura(u, u ** R.puxa, suave(u / 0.25));
    fluxoRaios.uPulso.value = suave(x / 0.05);
    const xs = (x - insp) / (1 - insp);                 /* 0 → 1 no expirar */
    fluxoJatos.uFrente.value = xs < 0 ? 2 : 1 - xs * J.solta;
    fluxoJatos.uPulso.value = xs < 0 ? 0 : suave(xs / 0.04) * (1 - xs);
    const chegou = xs < 0 ? 99 : xs * (1 - insp) * RS.periodo;   /* s desde a chegada */
    /* a CHEGADA da rede (a onda do fundo do hero chega ao portal no começo do
       fôlego): os 12 canais acendem juntos (a faísca nos pontos de entrada é
       desenhada pela rede, js/rede.js; o flash no núcleo estava no lugar
       errado: nesse instante a energia está na borda) */
    const chegada = Math.exp(-(x * RS.periodo) / 0.12);
    fluxoRaios.uBase.value = R.base * (1 + 1.8 * chegada);
    const batida = (1 + R.batida * Math.exp(-chegou * 5) * ig) * (1 + (tocando ? TQ.batida * Math.exp(-tq.t * 6) : 0));
    const inspira = 1 + respira(t, RS.nucleo);
    /* o lampejo: a energia entra pelo portal no começo do fôlego */
    const lampejo = desde < A.raios ? 0 : LP.alfa * Math.max(0, 1 - (x * RS.periodo) / LP.dura) * forca;
    matLampejo.opacity = lampejo;
    matLampejo.visible = lampejo > 0.002;

    /* a luz do vidro vem de onde o núcleo está (no mundo: o reator só gira) */
    vidro.uniforms.uCentro.value.copy(centro.copy(nucleo.position).applyEuler(raiz.rotation));
    vidro.uniforms.uIgnicao.value = ig * (1 + perto * 0.5);

    for (let i = 0; i < halos.length; i++) {
      const { s, h } = halos[i];
      s.material.opacity = h.alfa * (i === 0 ? 0.12 + 0.88 * ig : ig) * (1 + perto);
      s.scale.setScalar(h.escala * (0.55 + 0.45 * ig) * batida * inspira * (1 + perto * 0.5));
    }
    estrela.material.opacity = RA.alfa * ig;
    estrela.material.visible = ig > 0.002;
    for (let i = 1; i < halos.length; i++) halos[i].s.material.visible = ig > 0.002;
    estrela.material.rotation = t * 0.02;
    ponto.scale.setScalar((0.45 + 0.55 * ig) * batida * inspira);

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

  return { raiz, atualizar, tamanhoTela, dispose, pose: () => pose };
}
