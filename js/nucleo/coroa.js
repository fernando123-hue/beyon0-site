/* ==========================================================================
   AI CORE — a COROA: o núcleo do reator (refeito em 2026-10-04).

   Pedido do dono, vendo a versão "transbordando" (fios de plasma, bordas que
   ferviam, raios): "não quero essas deformações; gosto de quando ela era
   redondinha e certinha, o problema é que não tinha efeito, parecia sem
   charme. Retire os raios. Faça o núcleo BRILHAR, parecido com antes, mas
   melhor." Então: tudo é círculo perfeito, e o brilho é desenhado em traço
   nítido (o dono proíbe desfoque), nunca em degradê:
   - o NÚCLEO: miolo branco, faixa clara e faixa ciano, bordas exatas; o
     branco cresce com a PRESSÃO (esquenta) e no estouro da chegada;
   - o REFLEXO: um arco da borda fica branco, como a luz numa esfera de
     vidro, e corre devagar em volta; com o cursor perto ele vira para o
     lado do cursor;
   - o HALO em curvas de luz: anéis finos e juntos em volta do núcleo, cada
     vez mais fracos (os de dentro inteiros, os de fora em arcos que giram
     em sentidos alternados, como as lâminas de uma íris); a cada fôlego a
     CARGA atravessa as curvas de dentro para fora, e CINTILAÇÕES (arcos
     curtos) acendem e somem nas de dentro;
   - a EMISSÃO: anéis de 1 px que nascem no halo e saem até o vidro, mais
     rápidos com a pressão;
   - o VIDRO: o anel onde a luz para, com 48 marcas girando (ao contrário
     das pétalas, inclusive quando o reator acelera) e arcos que correm
     nele; as marcas do lado do cursor acendem;
   - a ONDA da chegada da energia (do núcleo às câmaras).

   Um quadrado de frente para a câmera, um shader só; antisserrilhado pelo
   fwidth. `premultipliedAlpha` + alfa = maior canal: onde não há traço nada
   é escrito (com alfa 1 o quadrado inteiro virava preto opaco — revisão).
   Direções por produto escalar; o único atan (as marcas) recebe a direção
   já normalizada, com desvio: nunca atan(0, 0), sem NaN no centro.
   ========================================================================== */

/* o shader nasce do spec (os laços do GLSL precisam de limite constante) */
function fonte(CO) {
  const H = CO.halo, V = CO.vidro, E = CO.emissao;
  return /* glsl */`
  uniform vec3 uBranco;
  uniform vec3 uCor;
  uniform vec3 uCor2;
  uniform float uR;
  uniform float uForca;
  uniform float uDisco;
  uniform float uTempo;
  uniform float uPressao;
  uniform float uEstouro;
  uniform vec4 uOnda;
  uniform vec3 uAlvo;
  uniform float uGiroVidro;
  uniform float uFluxo;
  uniform vec3 uReflexo;
  uniform float uIris;
  uniform float uCarga;
  varying vec2 vP;
  const float TAU = 6.2831853;
  const float W = TAU / 400.0;   /* uma volta do relógio dos shaders (400 s) */
  float hash(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
  /* um traço de w px centrado em d (unidades); pw = 1 px em unidades */
  float traco(float d, float w, float pw) { return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, abs(d) / pw); }
  /* dentro do raio rr, com a borda de 1 px */
  float disco(float r, float rr, float pw) { return 1.0 - smoothstep(rr - pw * 0.5, rr + pw * 0.5, r); }
  /* dentro de um arco de meia-abertura m (rad) em volta da direção u, borda exata no raio r */
  float noArco(vec2 d, vec2 u, float m, float r, float pw) {
    float ang = acos(clamp(dot(d, u), -1.0, 1.0));
    return clamp((m - ang) * r / pw + 0.5, 0.0, 1.0);
  }

  void main() {
    float r = length(vP);
    float pw = max(fwidth(r), 1e-5);
    vec2 dir = r > 1e-5 ? vP / r : vec2(1.0, 0.0);
    vec3 c = vec3(0.0);
    float pz = uPressao, R = uR;

    /* --- o núcleo: miolo branco, faixa clara, faixa ciano; o reflexo clareia um arco --- */
    float reflexo = uReflexo.z * noArco(dir, uReflexo.xy, ${CO.reflexo.abre.toFixed(2)}, max(r, R * 0.5), pw);
    /* em degraus exatos, de dentro para fora: branco (esquenta com a pressão
       e a carga do fôlego), ciano claro, ciano forte, um vão de 1 px e o aro */
    float rBranco = R * (0.4 + 0.12 * pz + 0.14 * uCarga + 0.3 * uEstouro);
    float rMeio = R * (0.64 + 0.06 * pz + 0.08 * uCarga + 0.2 * uEstouro);
    float rForte = R * 0.86;
    rMeio = min(rMeio, rForte - pw); rBranco = min(rBranco, rMeio - pw);
    float cheio = disco(r, R, pw), branco = disco(r, rBranco, pw), meio = disco(r, rMeio, pw), forte = disco(r, rForte, pw);
    float vao = traco(r - rForte - pw * 1.5, 1.0, pw);
    vec3 corMeio = mix(mix(uBranco, uCor2, 0.5), uBranco, reflexo * 0.85);
    vec3 corForte = mix(uCor, mix(uCor, uBranco, 0.75), reflexo);
    vec3 corAro = mix(uCor2 * 0.55, uBranco * 0.9, reflexo);
    c += (uBranco * branco + corMeio * (meio - branco) + corForte * (forte - meio) + corAro * (cheio - forte) * (1.0 - vao)) * uDisco;
    /* a borda do núcleo: 1,3 px branco; o lado do reflexo ganha um segundo traço por fora */
    c += uBranco * traco(r - R, 1.3, pw) * 0.95 * uDisco;
    c += uBranco * traco(r - R * 1.075, 1.0, pw) * reflexo * 0.7 * uDisco;

    /* --- o halo em curvas de luz: juntos perto do núcleo, mais fracos para fora --- */
    float VIDRO = ${V.raio.toFixed(3)};
    bool perto = r < VIDRO + 0.03;   /* fora do vidro só sobra a onda: o resto é pulado (custo por pixel) */
    for (int k = 1; k <= ${H.n}; k++) {
      if (!perto) break;
      float fk = float(k);
      float rk = R * (1.0 + ${H.passo.toFixed(3)} * pow(fk, 1.25) * (1.0 + 0.3 * pz) + 0.07 * fk * uEstouro);
      /* a carga do fôlego atravessa as curvas de dentro para fora (a luz passa) */
      float passa = exp(-(fk - uCarga * ${(H.n + 1).toFixed(1)}) * (fk - uCarga * ${(H.n + 1).toFixed(1)}) / 0.6) * uCarga;
      float alfa = ${H.alfa.toFixed(2)} * pow(0.68, fk - 1.0) * (0.6 + 0.4 * pz) + 0.5 * passa;
      float linha = traco(r - rk, 1.0, pw);
      /* do 3º para fora, arcos que giram em sentidos alternados (a íris) */
      if (k >= 3) {
        float n = fk + 1.0, s = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
        float ang = s * uIris * (0.6 + 0.15 * fk) + fk * 1.9;
        vec2 u = vec2(cos(ang), sin(ang));
        /* n arcos iguais: dobra a direção para o setor mais perto (rotação de TAU/n) */
        float melhor = -2.0;
        for (int j = 0; j < 8; j++) {
          if (float(j) >= n) break;
          float aj = float(j) * TAU / n;
          vec2 uj = vec2(u.x * cos(aj) - u.y * sin(aj), u.x * sin(aj) + u.y * cos(aj));
          melhor = max(melhor, dot(dir, uj));
        }
        float m = TAU / n * 0.32;
        linha *= clamp((m - acos(clamp(melhor, -1.0, 1.0))) * rk / pw + 0.5, 0.0, 1.0);
      }
      c += mix(uCor2, uBranco, k == 1 ? 0.35 : 0.6 * passa) * linha * alfa * (1.0 + 0.8 * reflexo) * uDisco;
    }
    /* as cintilações: arcos curtos que acendem e somem nas duas curvas de dentro */
    for (int j = 0; j < ${CO.cintila.n}; j++) {
      if (!perto) break;
      float fj = float(j);
      float tj = uTempo * ${CO.cintila.ritmo.toFixed(2)} + hash(fj + 5.0);
      float slot = floor(tj), vida = fract(tj);
      if (hash(slot * 1.31 + fj * 7.7) > 0.35 + 0.5 * pz) continue;
      float aj = hash(slot * 2.17 + fj) * TAU;
      float rk = R * (1.0 + ${H.passo.toFixed(3)} * (hash(slot + fj * 3.1) < 0.5 ? 1.0 : 2.38) * (1.0 + 0.3 * pz));
      float brilho = (1.0 - vida) * (1.0 - vida);
      c += uBranco * traco(r - rk, 1.6, pw) * noArco(dir, vec2(cos(aj), sin(aj)), 0.012 / rk + 0.12 * brilho, rk, pw) * brilho * uForca;
    }

    /* --- a emissão: anéis que nascem no halo e saem até o vidro --- */
    float de = R * ${E.de.toFixed(2)};
    for (int k = 0; k < ${E.n}; k++) {
      if (!perto) break;
      float f = fract(uFluxo + float(k) / ${E.n.toFixed(1)});
      float re = mix(de, VIDRO - 0.01, f);
      float alfa = (1.0 - f) * (1.0 - f) * smoothstep(0.0, 0.12, f) * ${E.alfa.toFixed(2)} * (0.45 + 0.55 * pz);
      c += uCor2 * traco(r - re, 1.0, pw) * alfa * uForca;
    }

    /* --- o vidro: o anel, as marcas girando e os arcos que correm nele --- */
    c += uCor2 * traco(r - VIDRO, 1.0, pw) * 0.5 * uDisco;
    {
      vec2 dv = vec2(dir.x * cos(-uGiroVidro) - dir.y * sin(-uGiroVidro), dir.x * sin(-uGiroVidro) + dir.y * cos(-uGiroVidro));
      float fm = (atan(dv.y, dv.x + 1e-6) / TAU + 0.5) * ${V.marcas.toFixed(1)};
      float im = floor(fm + 0.5);
      float longa = 1.0 - step(0.5, mod(im, 4.0));
      float r0 = VIDRO + 0.007, r1 = VIDRO + mix(0.013, 0.022, longa);
      float dentroM = step(r0, r) * step(r, r1);
      /* o lado do cursor acende */
      float paraCursor = uAlvo.z * smoothstep(0.55, 0.98, dot(dir, uAlvo.xy));
      c += mix(uCor2, uBranco, 0.4 + 0.5 * paraCursor) * traco((fm - im) * TAU / ${V.marcas.toFixed(1)} * r, 1.0, pw) * dentroM * (mix(0.3, 0.55, longa) + 0.45 * paraCursor) * uDisco;
    }
    for (int k = 0; k < ${V.arcos}; k++) {
      float fk = float(k), h = hash(fk + 71.0);
      float sentido = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
      float aa = h * TAU + sentido * uTempo * W * floor(140.0 + 90.0 * h);
      float arco = noArco(dir, vec2(cos(aa), sin(aa)), 0.03 / VIDRO, VIDRO, pw);
      c += mix(uBranco, uCor2, 0.3) * traco(r - VIDRO, 1.5, pw) * arco * (0.35 + 0.5 * pz) * uForca;
    }

    /* --- a onda da chegada da energia (do núcleo às câmaras) --- */
    for (int k = 0; k < 2; k++) {
      float tk = uOnda.x - float(k) * uOnda.y;
      if (tk > 0.0 && tk < uOnda.z) {
        float p = tk / uOnda.z;
        float rk = mix(R * 1.3, uOnda.w, 1.0 - (1.0 - p) * (1.0 - p));
        c += uCor2 * traco(r - rk, 1.2, pw) * (1.0 - p) * sqrt(1.0 - p) * ${CO.ondas.alfa.toFixed(2)} * uForca;
      }
    }

    gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
    #include <colorspace_fragment>
  }
`;
}

const VS = /* glsl */`
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TAU = Math.PI * 2;

/* monta a coroa. `shader(vs, fs, uniforms, atraso)` é o de pecas.js (entra no
   ciclo de força/tempo/visível de todos); `cor(nome)` lê os tokens */
export function criarCoroa(THREE, CO, NU, cor, shader, atraso) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0].map((v) => v * CO.meia)), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const mat = shader(VS, fonte(CO), {
    uBranco: { value: cor('t1') }, uCor: { value: cor('ac') }, uCor2: { value: cor('ac2') },
    uR: { value: NU.raio }, uForca: { value: 0 }, uDisco: { value: 0 }, uTempo: { value: 0 },
    uPressao: { value: 0 }, uEstouro: { value: 0 }, uAlvo: { value: new THREE.Vector3() }, uGiroVidro: { value: 0 },
    uFluxo: { value: 0 }, uReflexo: { value: new THREE.Vector3(1, 0, 0) }, uIris: { value: 0 }, uCarga: { value: 0 },
    uOnda: { value: { x: 99, y: CO.ondas.intervalo, z: CO.ondas.vida, w: CO.ondas.ate } }
  }, atraso);
  mat.depthTest = false;              /* a luz do núcleo não é ocultada pelo que passa na frente */
  mat.premultipliedAlpha = true;      /* ver o fim do shader */
  const malha = new THREE.Mesh(geo, mat);
  malha.renderOrder = 2;
  const u = mat.uniforms;

  /* fases acumuladas aqui (a velocidade muda com a pressão: somar a fase não
     salta, multiplicar o tempo saltaria) */
  let tAntes = null, fluxo = 0, iris = 0, rx = 1, ry = 0;

  /* por quadro. p: { raio (já com batida e fôlego), disco, folego 0–1, perto,
     toque (envelope 0–1), agitacao 0–1, chegou (s desde a chegada; 99 = não),
     alvo { x, y, f } (a direção do cursor e quanto ele puxa), extra (rad, o
     giro a mais da rolagem e da agitação), t } */
  function atualizar(p) {
    const dt = tAntes === null ? 0 : Math.min(0.1, Math.max(0, p.t - tAntes));
    tAntes = p.t;
    u.uR.value = p.raio;
    u.uDisco.value = p.disco;
    const estouro = Math.exp(-p.chegou * 3.2);
    u.uEstouro.value = estouro;
    const pz = Math.min(1, CO.pressao.base + CO.pressao.folego * p.folego + p.perto * 1.4 + p.toque * 0.6 + p.agitacao * 0.8 + estouro * 0.5);
    u.uPressao.value = pz;
    u.uCarga.value = p.folego;
    u.uOnda.value.x = p.chegou;
    const af = Math.hypot(p.alvo.x, p.alvo.y);
    u.uAlvo.value.set(af > 1e-4 ? p.alvo.x / af : 0, af > 1e-4 ? p.alvo.y / af : 0, af > 1e-4 ? p.alvo.f : 0);
    /* as marcas do vidro giram ao contrário das pétalas, também no impulso */
    u.uGiroVidro.value = (p.t * CO.vidro.giro + (p.extra || 0) * CO.vidro.arrasto) % TAU;
    fluxo = (fluxo + dt * CO.emissao.vel * (1 + 1.6 * pz + 3 * estouro)) % 1;
    u.uFluxo.value = fluxo;
    iris = (iris + dt * (CO.reflexo.iris + 0.5 * (p.agitacao || 0))) % (TAU * 100);
    u.uIris.value = iris;
    /* o reflexo corre em volta; com o cursor, vira para ele (mistura de
       DIREÇÕES, pelo caminho mais curto) */
    const aR = p.t * CO.reflexo.giro;
    let bx = Math.cos(aR), by = Math.sin(aR);
    const w = Math.min(1, (p.alvo.f || 0) * 1.4);
    if (w > 0.001 && af > 1e-4) { bx += (p.alvo.x / af - bx) * w; by += (p.alvo.y / af - by) * w; }
    const nb = Math.hypot(bx, by) || 1;
    rx += (bx / nb - rx) * Math.min(1, dt * 6); ry += (by / nb - ry) * Math.min(1, dt * 6);
    const nr = Math.hypot(rx, ry) || 1;
    u.uReflexo.value.set(rx / nr, ry / nr, CO.reflexo.forca * (0.65 + 0.35 * pz));
    mat.visible = true;   /* o núcleo aparece (fraco) já antes da ignição */
  }
  return { malha, geo, atualizar };
}
