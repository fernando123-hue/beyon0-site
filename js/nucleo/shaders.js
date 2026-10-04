/* ==========================================================================
   AI CORE — os shaders das peças (vidro do portal, fluxo dos anéis, raios e
   jatos, lâminas de cristal). Saíram de pecas.js para ele ficar abaixo de 800
   linhas (revisão de código, 2026-10-03). A coroa (o núcleo) mora em coroa.js.
   ========================================================================== */

/* o vidro escuro: a única luz é o núcleo, no centro do mundo; fios de
   reflexo duros, o núcleo visto através, aresta de fresnel */
export const VIDRO_VS = /* glsl */`
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

export const VIDRO_FS = /* glsl */`
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
    gl_FragColor = vec4(c, 1.0);   /* o vidro é opaco (o alfa = maior canal é só da coroa, em coroa.js) */
    #include <colorspace_fragment>
  }
`;

/* a energia nos anéis: pulsos (cabeça forte, cauda curta) correndo em volta.
   A volta vem do uv.x do toro (0–1, com vértices duplicados na costura), não
   de atan: o atan salta de +π a −π às 9 horas e espremia os pulsos num
   tracinho fixo ali (revisão de código; quebraria a simetria) */
export const FLUXO_VS = /* glsl */`
  varying float vVolta;
  void main() {
    vVolta = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const FLUXO_FS = /* glsl */`
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
export const RAIO_VS = /* glsl */`
  attribute float aU;
  attribute float aV;
  varying float vU;
  varying float vV;
  void main() {
    vU = aU; vV = aV;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const RAIO_FS = /* glsl */`
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

/* o campo e a onda do toque, nas lâminas (preenchimento e contorno usam o
   MESMO trecho: as duas partes de uma lâmina andam juntas). Coordenadas no
   plano da própria camada (atualizar já desfaz o giro e a escala).
   uCampo: xy ponto, z força, w raio. uOnda: xy origem, z raio da frente, w
   força. uDesloca: x empurra, y ergue, z largura da frente da onda.
   vToque: quanto do campo e da onda chegou a este vértice; o fragmento
   acende o cristal com ele (num traço de 1 px, o deslocamento sozinho quase
   não se lê; a luz se lê) */
export const DESLOCA = /* glsl */`
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
export const PAINEL_VS = /* glsl */`
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
export const PAINEL_FS = /* glsl */`
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
    /* dois DEGRAUS duros (faixa de dentro acesa, a de fora fraca, depois
       nada), com antisserrilhado de 1 px; a rampa contínua de antes lia como
       brilho borrado (o dono proíbe desfoque) */
    float aa = fwidth(vR);
    float b = 0.55 * (1.0 - smoothstep(uCai * 0.32 - aa, uCai * 0.32 + aa, vR)) + 0.45 * (1.0 - smoothstep(uCai - aa, uCai + aa, vR)) + vToque * 0.5;
    b *= mix(uNevoa.z, 1.0, smoothstep(uNevoa.y, uNevoa.x, vProf));
    gl_FragColor = vec4(uCor, b * b * uAlfa * uForca * (1.0 + vToque * uAcende));
    #include <colorspace_fragment>
  }
`;

/* o contorno de cristal: a aresta recebe a luz do núcleo (forte na borda de
   dentro, aR 0, apagando para fora). Só a face da frente (2026-10-03: as
   duas faces e as quinas liam como um fantasma de cada lâmina — poluição) */
export const LINHA_VS = /* glsl */`
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
export const LINHA_FS = /* glsl */`
  uniform vec3 uCor;
  uniform float uAlfa;
  uniform vec3 uNevoa;
  uniform float uAcende;
  varying float vR;
  varying float vProf;
  varying float vToque;
  void main() {
    float b = 1.0 - 0.78 * smoothstep(0.0, 1.0, vR);
    b *= 1.0 + vToque * uAcende;
    b *= mix(uNevoa.z, 1.0, smoothstep(uNevoa.y, uNevoa.x, vProf));
    gl_FragColor = vec4(uCor, b * uAlfa);
    #include <colorspace_fragment>
  }
`;

