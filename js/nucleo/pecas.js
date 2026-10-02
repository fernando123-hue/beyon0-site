/* ==========================================================================
   AI CORE — o emissor. Lê o SPEC e monta as peças em three.js.

   Nada aqui decide QUANDO a esfera se mexe: `atualizar(estado)` recebe o
   estado pronto (montagem, abertura, ignição, ponteiro) de quem manda no
   tempo (boot.js no site, lab.js no laboratório). Assim o mesmo emissor
   serve ao site, ao laboratório e, um dia, a uma renderização de vídeo.

   Custo medido em mente (regras do threejs-perf e da história do projeto):
   sem luz de cena, sem sombra, sem pós-processamento. O brilho vem de
   sprites aditivos com textura gerada UMA vez; o vidro, de um shader curto
   em que a única fonte de luz é o próprio núcleo.
   ========================================================================== */

const TAU = Math.PI * 2;

/* gerador pseudoaleatório com semente: a esfera é a mesma em toda visita
   (e no laboratório e num vídeo), não uma nova a cada carga */
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

function texturaRaios(THREE, nRaios, sorte) {
  const n = 256, c = tela(n, n), g = c.getContext('2d');
  g.translate(n / 2, n / 2);
  for (let i = 0; i < nRaios; i++) {
    const a = (i / nRaios) * TAU + sorte() * 0.3;
    const comp = n * (0.2 + sorte() * 0.28);
    const grad = g.createLinearGradient(0, 0, Math.cos(a) * comp, Math.sin(a) * comp);
    grad.addColorStop(0, 'rgba(255,255,255,.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grad;
    g.lineWidth = 1 + sorte() * 1.5;
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
  /* afina em cima e embaixo: um fio, não uma faixa */
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(0.5, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy;
  g.fillRect(0, 0, w, h);
  return new THREE.CanvasTexture(c);
}

/* ---------- o vidro escuro ----------
   A única luz é o núcleo, no centro do mundo: a face de dentro dos arcos de
   trás acende em ciano, a face de fora dos arcos da frente fica escura com
   aresta de fresnel e um reflexo de ambiente falso (uma faixa clara no
   horizonte do vetor refletido) que dá o brilho de vidro polido da
   referência. */
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
    float queda = 1.0 / (1.0 + d * d * 3.6);
    float difusa = max(dot(N, L), 0.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float espec = pow(max(dot(N, normalize(L + V)), 0.0), 90.0);
    vec3 R = reflect(-V, N);
    float faixa = exp(-R.y * R.y * 140.0);             /* o horizonte refletido: um fio */
    float topo = smoothstep(0.82, 1.0, R.y);           /* o céu refletido */
    /* a metade de trás recua: a aresta e os reflexos dela apagam, para não
       competirem com os arcos da frente (lia como novelo — crítica rodada 1) */
    float frente = mix(0.25, 1.0, smoothstep(-0.6, 0.6, vP.z - uCentro.z));
    /* vidro, não borracha (crítica rodada 2): corpo quase preto, a difusa
       mais contida, dois fios de reflexo duros em vez de um brilho largo, e
       o núcleo visto ATRAVÉS do arco quando ele passa na frente da luz */
    float atraves = pow(max(dot(-V, L), 0.0), 10.0);
    float faixa2 = exp(-(R.y - 0.38) * (R.y - 0.38) * 260.0);
    vec3 c = uBase * 0.45;
    c += uInterno * difusa * difusa * queda * (0.04 + 0.85 * ig) * mix(0.55, 1.0, frente);
    c += uInterno * atraves * 0.32 * ig;
    c += uBrilho * faixa2 * 0.22 * (0.3 + 0.7 * fres) * frente;
    /* aresta com teto de ~60% da primeira versão: só o núcleo é branco e o
       "no ar." do H1 continua o ciano mais forte da tela */
    c += uAresta * fres * (0.03 + 0.16 * ig) * frente;
    c += uBrilho * espec * queda * 3.2 * ig;
    c += (mix(uInterno, uBrilho, 0.45) * faixa * 0.32 + uBrilho * topo * 0.14) * (0.25 + 0.75 * fres) * frente;
    c += uAmbiente * fres * 0.05;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ---------- montagem ---------- */

export function montar(THREE, SPEC, cores, { celular = false } = {}) {
  const sorte = sorteio(SPEC.semente);
  const entre = ([a, b]) => mistura(a, b, sorte());
  const raiz = new THREE.Group();
  const descartar = [];   /* tudo que tem GPU por trás, para o dispose */
  const guarda = (x) => { descartar.push(x); return x; };
  const cor = (nome) => cores[nome] || new THREE.Color(1, 1, 1);
  const aditivo = (nomeCor, alfa) => guarda(new THREE.MeshBasicMaterial({
    color: cor(nomeCor), transparent: true, opacity: alfa,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));

  /* --- o vidro (um material só, compartilhado: um programa, uma troca) --- */
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

  /* --- um arco: círculo levemente ondulado, pontas afinando --- */
  class Anel extends THREE.Curve {
    constructor(raio, arco, onda, f1, f2) {
      super();
      Object.assign(this, { raio, arco, onda, f1, f2 });
    }
    getPoint(u, alvo = new THREE.Vector3()) {
      const a = u * this.arco * TAU;
      const r = this.raio * (1 + this.onda * Math.sin(a * 3 + this.f1));
      return alvo.set(Math.cos(a) * r, Math.sin(a) * r, this.raio * this.onda * Math.sin(a * 2 + this.f2));
    }
  }

  function geometriaArco(raio, tubo, arco, onda, achata) {
    const curva = new Anel(raio, arco, onda, sorte() * TAU, sorte() * TAU);
    const segs = Math.max(24, Math.ceil(150 * arco));
    const radiais = 8;
    const geo = new THREE.TubeGeometry(curva, segs, tubo, radiais, false);
    /* pontas de vidro partido: a seção estreita perto das duas pontas (curta
       e só até 40%: afinar até a ponta lia como garra); e a fita (achata < 1)
       comprime a seção no eixo normal ao plano do anel. A normal da elipse é
       a radial ORIGINAL com o z dividido por `achata` — sem o fator da ponta
       (multiplicá-lo tombava a normal para z justo nas pontas; revisão). */
    /* e as duas pontas levam um CORTE OBLÍQUO (~40°): o anel da ponta é
       empurrado ao longo da tangente proporcionalmente ao lado da seção, como
       vidro partido num golpe. A ponta arredondada lia como mangueira
       (crítica rodada 2). */
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const centro = new THREE.Vector3(), o = new THREE.Vector3(), n = new THREE.Vector3(), tg = new THREE.Vector3();
    const corte = Math.tan(0.7) * tubo;
    const f1Corte = sorte() * TAU;   /* a direção do golpe, uma por arco */
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      curva.getPointAt(u, centro);
      const ponta = i === 0 ? 1 : i === segs ? -1 : 0;
      if (ponta) curva.getTangentAt(u, tg);
      const f = 0.7 + 0.3 * suave(u / 0.05) * suave((1 - u) / 0.05);
      for (let j = 0; j <= radiais; j++) {
        const k = i * (radiais + 1) + j;
        o.fromBufferAttribute(pos, k).sub(centro);
        n.set(o.x, o.y, o.z / achata).normalize();
        const lado = o.length() ? (o.x * Math.cos(f1Corte) + o.y * Math.sin(f1Corte)) / tubo : 0;
        o.multiplyScalar(f);
        o.z *= achata;
        if (ponta) o.addScaledVector(tg, ponta * lado * corte);
        pos.setXYZ(k, centro.x + o.x, centro.y + o.y, centro.z + o.z);
        nor.setXYZ(k, n.x, n.y, n.z);
      }
    }
    return guarda(geo);
  }

  const arcos = [];
  const Z = new THREE.Vector3(0, 0, 1);
  const AUREO = Math.PI * (3 - Math.sqrt(5));
  /* `fracao` (0–1) e `camada` posicionam o arco: as direções seguem uma
     espiral áurea dentro do cone de `inclinacao`, cobrindo a esfera por
     igual (sorteadas, embolavam de um lado e deixavam buracos) */
  function fazerArco(geo, material, vel, inclinacao, fracao, camada) {
    const malha = new THREE.Mesh(geo, material);
    /* pivô externo = inclinação fixa; malha interna = giro em torno do
       próprio eixo. Dois níveis para o estado mexer num sem desmontar o
       outro. A normal do anel fica a no máximo `inclinacao` do eixo da
       câmera: o anel aparece como elipse EM VOLTA do núcleo. De perfil
       (normal a 90°) ele vira um risco atravessando o centro e esconde o
       núcleo — foi o que a segunda passada mostrou. */
    const pivo = new THREE.Group();
    const ang = Math.acos(mistura(Math.cos(inclinacao), 1, fracao));
    const az = (fracao * 7 + camada) * AUREO * 2.3 + sorte() * 0.3;
    pivo.quaternion.setFromUnitVectors(Z, new THREE.Vector3(Math.sin(ang) * Math.cos(az), Math.sin(ang) * Math.sin(az), Math.cos(ang)));
    malha.rotation.z = sorte() * TAU;
    pivo.add(malha);
    raiz.add(pivo);
    /* de onde o arco vem na montagem: perto (0,9 do raio) e destorcendo
       40°. Vindo de 2,4 os arcos cruzavam o quadro como macarrão voando
       (crítica rodada 1). De fora para dentro: cada camada começa um
       pouco depois da de fora. */
    const de = new THREE.Vector3(sorte() - 0.5, sorte() - 0.5, sorte() * 0.4).normalize();
    arcos.push({
      pivo, malha, de,
      vel: vel * (sorte() < 0.5 ? -1 : 1),
      giro0: malha.rotation.z,
      atraso: camada * 0.06 + sorte() * 0.05,
      torce: -0.7
    });
  }

  SPEC.gaiola.forEach((camada, c) => {
    for (let i = 0; i < camada.n; i++) {
      const geo = geometriaArco(entre(camada.raio), entre(camada.tubo), entre(camada.arco), camada.onda, entre(camada.achata));
      fazerArco(geo, vidro, entre(camada.vel), camada.inclinacao, (i + 0.5) / camada.n, c);
    }
  });

  const F = SPEC.fios;
  const matFio = aditivo('ac2', F.alfa);
  for (let i = 0; i < F.n; i++) {
    fazerArco(geometriaArco(entre(F.raio), entre(F.tubo), entre(F.arco), F.onda, 1), matFio, entre(F.vel), F.inclinacao, (i + 0.5) / F.n, 1);
  }

  /* --- a lente: anéis finos em volta do núcleo --- */
  const lente = [];
  for (const d of SPEC.lente) {
    const mat = aditivo(d.cor, d.alfa);
    const anel = new THREE.Mesh(guarda(new THREE.TorusGeometry(d.raio, d.tubo, 6, 160)), mat);
    const pivo = new THREE.Group();
    pivo.quaternion.setFromUnitVectors(Z, new THREE.Vector3().fromArray(d.eixo).normalize());
    pivo.add(anel);
    if (d.marcas) {
      /* marcas de régua: o vocabulário de instrumento do site (régua de
         1px, índice) dentro da esfera */
      const marcas = new THREE.InstancedMesh(guarda(new THREE.BoxGeometry(0.003, 0.02, 0.003)), mat, d.marcas);
      const m = new THREE.Object3D();
      for (let i = 0; i < d.marcas; i++) {
        const a = (i / d.marcas) * TAU;
        const longa = i % 8 === 0;
        const r = d.raio + (longa ? 0.03 : 0.022);
        m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        m.rotation.set(0, 0, a - Math.PI / 2);
        m.scale.set(1, longa ? 1.8 : 1, 1);
        m.updateMatrix();
        marcas.setMatrixAt(i, m.matrix);
      }
      anel.add(marcas);
      descartar.push(marcas);
    }
    raiz.add(pivo);
    lente.push({ anel, mat, alfa: d.alfa, vel: d.vel });
  }

  /* --- o núcleo --- */
  const nucleo = new THREE.Group();
  raiz.add(nucleo);
  const ponto = new THREE.Mesh(
    guarda(new THREE.IcosahedronGeometry(SPEC.nucleo.raio, 2)),
    guarda(new THREE.MeshBasicMaterial({ color: cor('t1') }))
  );
  nucleo.add(ponto);

  /* a luz do núcleo não é ocultada pelos arcos da frente (depthTest
     desligado): na referência o clarão lava tudo o que passa na frente dele.
     Com teste de profundidade, um arco cruzando o centro apagava o núcleo
     (visto no hero do desktop). */
  function sprite(tex, nomeCor, alfa) {
    return new THREE.Sprite(guarda(new THREE.SpriteMaterial({
      map: guarda(tex), color: cor(nomeCor), transparent: true, opacity: alfa,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    })));
  }
  const halos = SPEC.nucleo.halos.map((h) => {
    const s = sprite(texturaHalo(THREE, h.miolo), h.cor, h.alfa);
    s.scale.setScalar(h.escala);
    nucleo.add(s);
    return { s, escala: h.escala, alfa: h.alfa };
  });
  const RA = SPEC.nucleo.raios;
  const raios = sprite(texturaRaios(THREE, RA.n, sorte), RA.cor, RA.alfa);
  raios.scale.setScalar(RA.escala);
  nucleo.add(raios);
  /* os dois traços dividem a mesma textura (a guarda do primeiro basta) */
  const texTraco = texturaTraco(THREE);
  const tracos = SPEC.nucleo.tracos.map((d, i) => {
    const s = sprite(i === 0 ? texTraco : null, d.cor, d.alfa);
    if (i > 0) s.material.map = texTraco;
    s.scale.set(d.largura, d.altura, 1);
    s.renderOrder = 2;
    nucleo.add(s);
    return { s, d };
  });
  const NASCE = SPEC.nucleo.nasce, ASSENTA_TRACO = SPEC.nucleo.assenta;

  /* --- cacos: um InstancedMesh só --- */
  const C = SPEC.cacos;
  const nCacos = celular ? C.nCelular : C.n;
  const geoCaco = guarda(new THREE.IcosahedronGeometry(1, 0));
  {
    /* um poliedro torto (vértices deslocados) em vez de uma pedra perfeita:
       caco de vidro, não bolinha. Deslocar POR POSIÇÃO mantém fechadas as
       faces que dividem o vértice. */
    const pos = geoCaco.attributes.position;
    const mapa = new Map();
    for (let i = 0; i < pos.count; i++) {
      const k = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
      if (!mapa.has(k)) mapa.set(k, 0.5 + sorte() * 1.0);
      const f = mapa.get(k);
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.45, pos.getZ(i) * f);
    }
    geoCaco.computeVertexNormals();
  }
  const cacos = new THREE.InstancedMesh(geoCaco, vidro, nCacos);
  cacos.frustumCulled = false;
  descartar.push(cacos);
  const dadosCacos = [];
  for (let i = 0; i < nCacos; i++) {
    /* mais densos na faixa do equador (onde a referência tem mais estilhaço) */
    const y = (sorte() * 2 - 1) * (sorte() < 0.6 ? 0.4 : 1);
    const a = sorte() * TAU;
    const rr = Math.sqrt(1 - y * y);
    dadosCacos.push({
      dir: new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr),
      raio: mistura(C.raio[0], C.raio[1], sorte() ** 1.6),
      tam: mistura(C.tam[0], C.tam[1], sorte() ** 2.2),
      orbita: (0.02 + sorte() * 0.06) * (sorte() < 0.5 ? -1 : 1),
      eixo: new THREE.Vector3(sorte() - 0.5, sorte() - 0.5, sorte() - 0.5).normalize(),
      giro: 0.15 + sorte() * 0.6,
      fase: sorte() * TAU,
      atraso: sorte() * 0.5
    });
  }
  raiz.add(cacos);

  /* --- poeira --- */
  const P = SPEC.poeira;
  const nPoeira = celular ? P.nCelular : P.n;
  const posP = new Float32Array(nPoeira * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < nPoeira; i++) {
    v.set(sorte() * 2 - 1, (sorte() * 2 - 1) * 0.7, sorte() * 2 - 1).normalize();
    v.multiplyScalar(mistura(P.raio[0], P.raio[1], Math.sqrt(sorte())));
    v.toArray(posP, i * 3);
  }
  const geoP = guarda(new THREE.BufferGeometry());
  geoP.setAttribute('position', new THREE.BufferAttribute(posP, 3));
  const matP = guarda(new THREE.PointsMaterial({
    color: cor('ac2'), size: P.tam, map: guarda(texturaHalo(THREE, 0.05)),
    transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  const poeira = new THREE.Points(geoP, matP);
  raiz.add(poeira);

  /* ---------- por quadro ---------- */
  const tmp = new THREE.Object3D();
  const q = new THREE.Quaternion();
  const EIXO_Y = new THREE.Vector3(0, 1, 0);

  /* estado: { t (s), montagem 0–1, abertura 0–1, ignicao 0–1, px, py (−1–1) } */
  function atualizar(e) {
    const t = e.t, m = e.montagem, ab = e.abertura;
    const ig = e.ignicao * (0.94 + 0.06 * Math.sin(t * 1.25));   /* respira */

    /* um balanço lento de guinada mostra que a esfera tem fundo (girar
       360° deixaria os anéis de perfil e cruzaria o núcleo); o ponteiro
       inclina por cima disso */
    raiz.rotation.x = e.py * 0.22 + Math.sin(t * 0.09) * 0.08;
    raiz.rotation.y = e.px * 0.32 + Math.sin(t * 0.12) * 0.3;
    nucleo.position.set(e.px * 0.03, -e.py * 0.03, 0);

    for (const a of arcos) {
      const k = suave((m - a.atraso) / (1 - a.atraso));
      a.pivo.position.copy(a.de).multiplyScalar((1 - k) * 0.9 + ab * 0.3);
      a.malha.rotation.z = a.giro0 + t * a.vel + (1 - k) * a.torce;
      a.pivo.scale.setScalar(1 + ab * 0.12);
    }

    for (const l of lente) {
      l.anel.rotation.z = t * l.vel;
      l.mat.opacity = l.alfa * (0.2 + 0.8 * ig);
    }

    vidro.uniforms.uIgnicao.value = ig;
    nucleo.getWorldPosition(vidro.uniforms.uCentro.value);

    for (let i = 0; i < halos.length; i++) {
      const h = halos[i];
      h.s.material.opacity = h.alfa * (i === 0 ? 0.12 + 0.88 * ig : ig);
      h.s.scale.setScalar(h.escala * (0.55 + 0.45 * ig));
    }
    raios.material.opacity = RA.alfa * ig;
    raios.material.rotation = t * 0.03;

    /* o traço é um evento: nasce do núcleo para fora na ignição (a luz passa
       e imprime) e assenta fraco e mais curto. Antes da ignição, nada. */
    const desde = e.desdeIgnicao;
    const nasceu = desde < 0 ? 0 : 1 - (1 - Math.min(1, desde / NASCE)) ** 3;
    const assentou = desde < NASCE ? 0 : suave((desde - NASCE) / ASSENTA_TRACO);
    for (let i = 0; i < tracos.length; i++) {
      const { s, d } = tracos[i];
      s.scale.x = Math.max(0.001, nasceu * mistura(d.largura, d.assenta.largura, assentou));
      s.material.opacity = (desde < 0 ? 0 : mistura(d.alfa, d.assenta.alfa, assentou)) * (1 - ab * 0.5);
    }
    ponto.scale.setScalar(0.45 + 0.55 * ig);

    for (let i = 0; i < nCacos; i++) {
      const d = dadosCacos[i];
      const k = suave((m - d.atraso) / (1 - d.atraso));
      const r = d.raio * (1 + (1 - k) * 1.8 + ab * 0.55);
      q.setFromAxisAngle(EIXO_Y, t * d.orbita);
      tmp.position.copy(d.dir).applyQuaternion(q).multiplyScalar(r);
      tmp.quaternion.setFromAxisAngle(d.eixo, d.fase + t * d.giro);
      tmp.scale.setScalar(d.tam);
      tmp.updateMatrix();
      cacos.setMatrixAt(i, tmp.matrix);
    }
    cacos.instanceMatrix.needsUpdate = true;

    poeira.rotation.y = t * 0.015;
    matP.opacity = 0.2 + 0.45 * ig;
  }

  function dispose() {
    for (const x of descartar) if (x && x.dispose) x.dispose();
  }

  return { raiz, atualizar, dispose };
}
