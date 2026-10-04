/* ==========================================================================
   AI CORE — a COROA: o núcleo do reator, refeito do zero (2026-10-03, pedido
   do dono: "os núcleos devem transmitir a sensação de que estão
   TRANSBORDANDO de energia, especialmente o principal").

   O que transborda, tudo em traço nítido de 1 px (o dono proíbe desfoque):
   - o NÚCLEO: miolo branco e uma casca ciano-clara, com as bordas FERVENDO
     (contornos de cinco frequências inteiras, em sentidos opostos) e três
     ECOS por fora, cada vez mais fracos e mais largos com a pressão: o
     "brilho" desenhado como curvas de nível, nunca desfocado;
   - o VIDRO: o anel onde os fios batem, desenhado AQUI (de frente para a
     câmera, como os fios: o anel inclinado da lente não batia com os
     contatos), com 48 marcas girando devagar e ARCOS que correm na borda;
   - os FILAMENTOS (a referência é o globo de plasma): fios ondulados que
     saem do núcleo, vagam em sentidos diferentes e BATEM no vidro, com um
     arco aceso no contato. Transbordam o tempo todo: de tempos em tempos um
     fio FURA o vidro sozinho; o CURSOR os atrai (como o dedo num globo de
     plasma: o fio mais perto engrossa e se estica até ele); no ESTOURO (a
     chegada da energia) todos rompem o vidro em raios com galho, afinando na
     ponta, até as câmaras;
   - as FAÍSCAS: riscos curtos que escapam POR FORA da lente e somem;
   - a ONDA da chegada da energia (do núcleo às câmaras).
   A PRESSÃO (0–1) amarra tudo: sobe ao inspirar, com o cursor perto, no
   toque e na agitação; na chegada da energia há um ESTOURO (todos os fios
   rompem o vidro, mais faíscas).

   Um quadrado de frente para a câmera, um shader só; antisserrilhado pelo
   fwidth. `premultipliedAlpha` + alfa = maior canal: onde não há traço nada
   é escrito (com alfa 1 o quadrado inteiro virava preto opaco — revisão).
   ========================================================================== */

/* o shader nasce do spec (os laços do GLSL precisam de limite constante) */
function fonte(CO) {
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
  varying vec2 vP;
  const float TAU = 6.2831853;
  /* W: uma volta do relógio dos shaders (400 s). Velocidades em múltiplos
     inteiros de W fecham na volta: nada salta quando ele recomeça */
  const float W = TAU / 400.0;
  float hash(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
  /* um traço de w px centrado em d (unidades); pw = 1 px em unidades */
  float traco(float d, float w, float pw) { return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, abs(d) / pw); }
  float angDif(float a, float b) { return mod(a - b + 3.14159265, TAU) - 3.14159265; }
  /* um raio: deslocamento aleatório em nós a cada 0,018 unidade, ligados em reta (uma
     polilinha quebrada, nítida); a semente troca 12× por segundo: o raio treme */
  float quebra(float r, float semente) {
    float x = r / 0.018, n = floor(x);
    return mix(hash(n + semente) - 0.5, hash(n + 1.0 + semente) - 0.5, x - n) * 2.0;
  }

  /* a borda que ferve: o raio relativo no ângulo a (s: sentido) */
  float ferve(float a, float s) {
    return 0.45 * sin(5.0 * a + s * uTempo * W * 70.0)
         + 0.28 * sin(7.0 * a - s * uTempo * W * 110.0 + 1.3)
         + 0.15 * sin(11.0 * a + s * uTempo * W * 170.0 + 2.1)
         + 0.08 * sin(17.0 * a - s * uTempo * W * 260.0 + 0.4)
         + 0.05 * sin(23.0 * a + s * uTempo * W * 330.0 + 2.9);
  }

  void main() {
    float r = length(vP);
    float pw = max(fwidth(r), 1e-5);
    float a = atan(vP.y, vP.x);
    vec3 c = vec3(0.0);
    float pz = uPressao;

    /* --- o núcleo: miolo branco, casca ciano-clara; as duas bordas fervem --- */
    float borda = uR * (1.0 + 0.05 * ferve(a, 1.0));
    float dentro = uR * (0.58 + 0.04 * ferve(a + 1.7, -1.0));
    float casca = 1.0 - smoothstep(borda - pw * 0.5, borda + pw * 0.5, r);
    float miolo = 1.0 - smoothstep(dentro - pw * 0.5, dentro + pw * 0.5, r);
    c += (uCor2 * 0.8 * (casca - miolo) + uBranco * miolo) * uDisco;
    c += uBranco * traco(r - borda, 1.3, pw) * 0.9 * uDisco;
    /* os ecos: curvas de nível que fervem fora do núcleo (o brilho em traço) */
    for (int e = 1; e <= ${CO.ecos.n}; e++) {
      float fe = float(e);
      float re = borda * (1.0 + (${CO.ecos.passo.toFixed(2)} + 0.1 * pz) * fe) + uR * 0.05 * fe * ferve(a + fe * 2.3, mod(fe, 2.0) < 0.5 ? 1.0 : -1.0);
      c += uCor2 * traco(r - re, 1.0, pw) * pow(0.58, fe - 1.0) * ${CO.ecos.alfa.toFixed(2)} * (0.6 + 0.4 * pz) * uDisco;
    }

    /* --- o vidro: o anel, as 48 marcas girando devagar e os arcos que correm nele --- */
    float FIO = ${CO.filamentos.ate.toFixed(3)};
    c += uCor2 * traco(r - FIO, 1.0, pw) * 0.5 * uDisco;
    {
      float fm = (a - uGiroVidro) / TAU * ${CO.vidro.marcas.toFixed(1)};
      float im = floor(fm + 0.5);
      float longa = 1.0 - step(0.5, mod(im, 4.0));
      float r0 = FIO + 0.007, r1 = FIO + mix(0.013, 0.022, longa);
      float dentroM = step(r0, r) * step(r, r1);
      c += mix(uCor2, uBranco, 0.4) * traco((fm - im) * TAU / ${CO.vidro.marcas.toFixed(1)} * r, 1.0, pw) * dentroM * mix(0.3, 0.55, longa) * uDisco;
    }
    for (int k = 0; k < ${CO.vidro.arcos}; k++) {
      float fk = float(k), h = hash(fk + 71.0);
      float sentido = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
      float aa = h * TAU + sentido * uTempo * W * floor(140.0 + 90.0 * h);
      float noArco = 1.0 - smoothstep(0.0, pw * 1.5, abs(angDif(a, aa)) * FIO - 0.03);
      c += mix(uBranco, uCor2, 0.3) * traco(r - FIO, 1.5, pw) * noArco * (0.35 + 0.5 * pz) * uForca;
    }

    /* --- os filamentos: do núcleo ao vidro; furam o vidro (sozinhos, atraídos pelo cursor, ou no estouro) --- */
    /* atan(0, 0) é indefinido (o cursor parado no centro / sem cursor): sem direção, sem puxão */
    float puxa = dot(uAlvo.xy, uAlvo.xy) > 1e-6 ? uAlvo.z : 0.0;
    float tgt = puxa > 0.0 ? atan(uAlvo.y, uAlvo.x) : 0.0;
    float VAZA = ${CO.filamentos.vaza.toFixed(2)};
    /* fora do alcance máximo dos fios, o laço inteiro é pulado (custo por pixel) */
    for (int k = 0; k < ${CO.filamentos.n}; k++) {
      if (r > VAZA + 0.02) break;
      float fk = float(k), h = hash(fk + 1.0), h2 = hash(fk + 11.0);
      /* acende pela pressão: os primeiros sempre, os outros conforme ela sobe */
      float liga = clamp((0.45 + 0.75 * pz + uEstouro) * ${CO.filamentos.n.toFixed(1)} - fk, 0.0, 1.0);
      if (liga < 0.01) continue;
      /* cada fio VAGA em volta do seu lugar (sem amontoar), em sentidos alternados;
         o cursor puxa todos para o lado dele */
      float sentido = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
      float a0 = (fk + 0.5 * h) / ${CO.filamentos.n.toFixed(1)} * TAU
               + sentido * (0.55 * sin(uTempo * W * floor(30.0 + 50.0 * h2) + h * TAU) + 0.25 * sin(uTempo * W * floor(90.0 + 60.0 * h) + h2 * TAU));
      a0 += angDif(tgt, a0) * puxa * 0.45;
      float da = angDif(a0, tgt);
      float perto = exp(-da * da / 0.05) * puxa;   /* o fio que aponta para o cursor (sem pow de base negativa: indefinido em GLSL) */
      /* de tempos em tempos este fio fura o vidro sozinho (o transbordar em repouso) */
      /* período que divide os 400 s do relógio: na volta, nada salta */
      float nf = floor(400.0 / (2.2 + 2.6 * h2)), per = 400.0 / nf;
      float tt = uTempo + h * per, ciclo = mod(floor(tt / per), nf), u = mod(tt, per);
      float fura = (u < 0.45 && hash(ciclo * 5.3 + fk) < 0.45) ? 1.0 - u / 0.45 : 0.0;
      float vaza = max(uEstouro, max(fura, perto * 0.7));
      float alcance = mix(FIO, VAZA * (0.75 + 0.25 * h), vaza);
      if (r < borda || r > alcance + pw * 2.0) continue;
      float x = (r - borda) / max(alcance - borda, 1e-4);
      /* ondula (dois senos que correm) e, depois do vidro, quebra em raio */
      float lado = ${CO.filamentos.ondula[0].toFixed(3)} * sin(r * 55.0 + uTempo * W * floor(300.0 + 200.0 * h) + h * 9.0) * x
                 + ${CO.filamentos.ondula[1].toFixed(3)} * sin(r * 130.0 - uTempo * W * floor(500.0 + 300.0 * h2)) * x;
      float semente = h * 50.0 + floor(uTempo * 12.0);
      lado += 0.018 * quebra(r, semente) * smoothstep(FIO, FIO + 0.015, r);
      float d = angDif(a, a0) * r - lado;
      float tremula = 0.72 + 0.28 * sin(uTempo * W * floor(900.0 + 700.0 * h) + h2 * TAU);
      /* tronco grosso afinando na ponta; o fio do cursor mais grosso e mais branco */
      float largura = mix(2.0, 0.8, x) + 1.2 * perto;
      c += mix(uBranco, uCor2, x * (1.0 - perto)) * traco(d, largura, pw) * liga * tremula * uForca;
      /* o galho: depois do vidro, um ramo fino que diverge do tronco */
      float rb = FIO + 0.03;
      float galho = smoothstep(0.3, 0.6, vaza);
      if (galho > 0.01 && r > rb && r < rb + (alcance - FIO) * 0.6) {
        float lb = 0.018 * quebra(r, semente + 17.0) + (h > 0.5 ? 1.0 : -1.0) * (r - rb) * 0.9;
        c += uCor2 * traco(angDif(a, a0) * r - lado * 0.4 - lb, 0.9, pw) * liga * tremula * uForca * galho;
      }
      /* o contato: um arco curto aceso NO vidro, onde o fio bate (não quando fura) */
      float contato = 1.0 - smoothstep(0.3, 0.6, vaza);
      if (contato > 0.01) {
        float xv = (FIO - borda) / max(alcance - borda, 1e-4);   /* a ondulação do fio NO vidro (x lá) */
        float ladoV = xv * (${CO.filamentos.ondula[0].toFixed(3)} * sin(FIO * 55.0 + uTempo * W * floor(300.0 + 200.0 * h) + h * 9.0)
                    + ${CO.filamentos.ondula[1].toFixed(3)} * sin(FIO * 130.0 - uTempo * W * floor(500.0 + 300.0 * h2)));
        float av = a0 + ladoV / FIO;
        float noArco = 1.0 - smoothstep(pw * 3.0, pw * 4.0, abs(angDif(a, av)) * FIO);
        c += uBranco * traco(r - FIO, 1.8, pw) * noArco * liga * tremula * contato * uForca;
      }
    }

    /* --- as faíscas: riscos curtos que escapam em espiral --- */
    for (int k = 0; k < ${CO.faiscas.n}; k++) {
      float fk = float(k);
      float nf = floor(400.0 / (0.7 + 0.8 * hash(fk + 21.0))), per = 400.0 / nf;   /* divide os 400 s */
      float tt = uTempo + hash(fk + 33.0) * per;
      float ciclo = mod(floor(tt / per), nf), u = mod(tt, per) / per;
      if (hash(ciclo * 3.7 + fk * 1.9) > 0.45 + 0.55 * pz + uEstouro) continue;
      float rs = ${CO.filamentos.ate.toFixed(3)} + 0.01 + u * ${CO.faiscas.alcance.toFixed(2)};   /* nascem no vidro e escapam por fora */
      float as = hash(ciclo * 1.7 + fk) * TAU + u * 0.5 * (hash(fk) > 0.5 ? 1.0 : -1.0);
      float comp = 0.012 + 0.012 * pz;
      if (r < rs - comp || r > rs) continue;
      c += mix(uBranco, uCor, u) * traco(angDif(a, as) * r, 1.0, pw) * (1.0 - u) * uForca;
    }

    /* --- a onda da chegada da energia (do núcleo às câmaras) --- */
    for (int k = 0; k < 2; k++) {
      float tk = uOnda.x - float(k) * uOnda.y;
      if (tk > 0.0 && tk < uOnda.z) {
        float p = tk / uOnda.z;
        float rk = mix(uR * 1.3, uOnda.w, 1.0 - (1.0 - p) * (1.0 - p));
        c += uCor2 * traco(r - rk, 1.2, pw) * pow(1.0 - p, 1.5) * ${CO.ondas.alfa.toFixed(2)} * uForca;
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
    uOnda: { value: { x: 99, y: CO.ondas.intervalo, z: CO.ondas.vida, w: CO.ondas.ate } }
  }, atraso);
  mat.depthTest = false;              /* a luz do núcleo não é ocultada pelo que passa na frente */
  mat.premultipliedAlpha = true;      /* ver o fim do shader */
  const malha = new THREE.Mesh(geo, mat);
  malha.renderOrder = 2;
  const u = mat.uniforms;

  /* por quadro. p: { raio (já com batida e fôlego), disco, folego 0–1, perto,
     toque (envelope 0–1), agitacao 0–1, chegou (s desde a chegada; 99 = não),
     alvo { x, y, f } (a direção do cursor e a força com que ele puxa os fios), t } */
  function atualizar(p) {
    u.uR.value = p.raio;
    u.uDisco.value = p.disco;
    const estouro = Math.exp(-p.chegou * 3.2);
    u.uEstouro.value = estouro;
    u.uPressao.value = Math.min(1, CO.pressao.base + CO.pressao.folego * p.folego + p.perto * 1.4 + p.toque * 0.6 + p.agitacao * 0.8 + estouro * 0.5);
    u.uOnda.value.x = p.chegou;
    u.uAlvo.value.set(p.alvo.x, p.alvo.y, p.alvo.f);
    u.uGiroVidro.value = (p.t * CO.vidro.giro) % (Math.PI * 2);
    mat.visible = true;   /* o núcleo aparece (fraco) já antes da ignição */
  }
  return { malha, geo, atualizar };
}

