/* ==========================================================================
   AI CORE — o emissor. Lê o SPEC (o reator, v2) e monta as peças em three.js.

   Nada aqui decide QUANDO o reator se mexe: `atualizar(estado)` recebe o
   estado pronto (montagem, abertura, ignição, ponteiro) de quem manda no
   tempo (boot.js no site, lab.js no laboratório). O mesmo emissor serve ao
   site, ao laboratório e a uma renderização de vídeo.

   Custo (regras do threejs-perf e da história do projeto): sem luz de cena,
   sem sombra, sem pós-processamento. O brilho é aditivo; a energia corre em
   shaders curtos (pulsos por ângulo nos anéis, por comprimento nos raios, e
   a coroa do núcleo inteira desenhada num quadrado: zero JS por traço).
   ========================================================================== */

import { criarCoroa } from './coroa.js';
import { VIDRO_VS, VIDRO_FS, FLUXO_VS, FLUXO_FS, RAIO_VS, RAIO_FS, DESLOCA, PAINEL_VS, PAINEL_FS, LINHA_VS, LINHA_FS } from './shaders.js';

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

/* o lampejo de injeção, NÍTIDO (o dono proíbe desfoque em qualquer coisa,
   2026-10-03): um disco de borda definida e dois anéis finos, no lugar do
   degradê radial que lia como brilho borrado. `miolo` dá o tamanho do disco */
function texturaHalo(THREE, miolo) {
  const n = 256, c = tela(n, n), g = c.getContext('2d'), m = n / 2;
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath(); g.arc(m, m, m * Math.max(0.07, miolo * 1.5), 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
  g.beginPath(); g.arc(m, m, m * 0.52, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2;
  g.beginPath(); g.arc(m, m, m * 0.86, 0, TAU); g.stroke();
  return new THREE.CanvasTexture(c);
}

/* o traço horizontal: um fio de 2 px que se afina para as pontas (sem a
   faixa vertical borrada de reflexo de lente) */
function texturaTraco(THREE) {
  const w = 512, h = 32, c = tela(w, h), g = c.getContext('2d');
  const gx = g.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(0.4, 'rgba(255,255,255,.45)');
  gx.addColorStop(0.5, 'rgba(255,255,255,1)');
  gx.addColorStop(0.6, 'rgba(255,255,255,.45)');
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx;
  g.fillRect(0, h / 2 - 1, w, 2);
  return new THREE.CanvasTexture(c);
}

/* um anel de 1 px: a onda de choque (o anel fica a 97% do raio da textura) */
function texturaOnda(THREE) {
  const n = 256, c = tela(n, n), g = c.getContext('2d');
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.962, 'rgba(255,255,255,0)');
  r.addColorStop(0.97, 'rgba(255,255,255,1)');
  r.addColorStop(0.978, 'rgba(255,255,255,0)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
}

/* os shaders das peças moram em shaders.js; a coroa (o núcleo), em coroa.js */

/* ---------- montagem ---------- */

export function montar(THREE, SPEC, cores, { celular = false } = {}) {
  const sorte = sorteio(SPEC.semente);
  const raiz = new THREE.Group();
  const descartar = [];   /* tudo que tem GPU por trás, para o dispose */
  const guarda = (x) => { if (x) descartar.push(x); return x; };
  const cor = (nome) => cores[nome] || new THREE.Color(1, 1, 1);
  const ADITIVO = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  /* (os materiais copiam a cor; a cena os retinge no ouro pela lista) */
  const tingiveis = [];
  const aditivo = (nomeCor, alfa) => { const m = guarda(new THREE.MeshBasicMaterial({ color: cor(nomeCor), opacity: alfa, ...ADITIVO })); tingiveis.push([m, nomeCor]); return m; };
  const tingir = () => { for (const [m, nome] of tingiveis) if (cores[nome]) m.color.copy(cores[nome]); };

  /* quem tem uniform de tempo/força (atualizados juntos por quadro), com o
     atraso de acendimento da camada: acende de dentro para fora */
  const energia = [];
  function shader(vs, fs, uniforms, atraso = 0, dupla = false) {
    /* `dupla`: as faixas de raios e jatos são montadas à mão e metade ficava
       de costas para a câmera (descartada). Nos tubos fechados não: os dois
       lados somariam a energia duas vezes no mesmo pixel */
    /* derivatives: o fwidth das aletas em degraus no WebGL1 (no WebGL2 já existe) */
    const m = guarda(new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, extensions: { derivatives: true }, ...(dupla ? { side: THREE.DoubleSide } : {}), ...ADITIVO }));
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
    const tri = [], aR = [], lin = [], linR = [];
    const ponto = (r, a) => [Math.cos(a) * r, Math.sin(a) * r, d.z];
    /* um traço do contorno: dois pontos, com o raio relativo */
    const traco = (pa, ra, pb, rb) => { lin.push(...pa, ...pb); linR.push(ra, rb); };
    for (let i = 0; i < d.n; i++) {
      const meio = (i + defasagem) * passoD, a0 = meio - larg / 2, a1 = a0 + larg;
      for (let k = 0; k < seg; k++) {
        const aa = a0 + (larg * k) / seg, ab = a0 + (larg * (k + 1)) / seg;
        const i0 = ponto(d.raio[0], aa), o0 = ponto(d.raio[1], aa), i1 = ponto(d.raio[0], ab), o1 = ponto(d.raio[1], ab);
        tri.push(...i0, ...o0, ...i1, ...i1, ...o0, ...o1);
        aR.push(0, 1, 0, 0, 1, 1);
        traco(i0, 0, i1, 0);   /* arcos de dentro e de fora */
        traco(o0, 1, o1, 1);
      }
      for (const a of [a0, a1]) traco(ponto(d.raio[0], a), 0, ponto(d.raio[1], a), 1);   /* arestas radiais */
    }
    /* o preenchimento e o contorno leem os MESMOS objetos: andam juntos */
    const campo = { uCampo: { value: vec4(0, 0, 0, CA.raio) }, uOnda: { value: vec4() }, uDesloca: desloca, uAcende: acende };
    const geoP = guarda(new THREE.BufferGeometry());
    geoP.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tri), 3));
    geoP.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(aR), 1));
    const geoL = guarda(new THREE.BufferGeometry());
    geoL.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lin), 3));
    geoL.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(linR), 1));
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
  tingiveis.push([matLampejo, R.cor]);
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
    raiz.add(curtas, longas);   /* parada: o estator (spec.regua) */
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
  const TV = SPEC.trava;
  function travar(u) {
    const n = Math.floor(u), p = u - n;
    const q = Math.max(0, (p - TV.fica) / (1 - TV.fica));
    const clique = p < TV.volta ? TV.passa * Math.sin((Math.PI * p) / TV.volta) : 0;
    return n + q * q + clique;
  }
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

  /* --- o núcleo: a coroa (coroa.js, um quadrado de frente para a câmera)
     e o traço da ignição --- */
  const NU = SPEC.nucleo, CO = NU.coroa;
  const nucleo = new THREE.Group();
  raiz.add(nucleo);
  /* no celular a coroa custa menos por pixel (menos fios, faíscas e ecos): GPU de celular fraco paga por pixel */
  const coroaN = criarCoroa(THREE, celular ? { ...CO, ...CO.celular } : CO, NU, cor, shader, A.coroa);
  guarda(coroaN.geo);
  const coroa = coroaN.malha;
  const PARAM_COROA = { raio: 0, disco: 0, folego: 0, perto: 0, toque: 0, agitacao: 0, chegou: 99, t: 0, extra: 0, alvo: { x: 0, y: 0, f: 0 } };   /* reaproveitado por quadro */
  nucleo.add(coroa);

  /* o traço e a onda grande: sprites (sempre de frente para a câmera) */
  function sprite(tex, nomeCor, alfa) {
    const m = guarda(new THREE.SpriteMaterial({ map: tex, color: cor(nomeCor), opacity: alfa, depthTest: false, ...ADITIVO }));
    tingiveis.push([m, nomeCor]);   /* (os traços e a onda do núcleo também se tingem no ouro) */
    return new THREE.Sprite(m);
  }
  const texTraco = guarda(texturaTraco(THREE));
  const tracos = NU.tracos.map((d) => {
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
    /* ...ou o cursor está numa opção do site (o reator "quer" o clique: clareia de leve) */
    const perto = c.f * CA.brilho * suave(1 - Math.hypot(c.x, c.y) / CA.perto) + (e.atento || 0) * CA.atento;
    /* a onda do toque: a frente sai do ponto tocado e perde força */
    const tocando = tq.t >= 0 && tq.t < TQ.dura;
    /* a frente arranca devagar (no centro a onda era rápida demais) e a força sobe em vez de nascer cheia */
    const frente = tocando ? TQ.vel * (tq.t - TQ.arranque * (1 - Math.exp(-tq.t / TQ.arranque))) : 0;
    const forcaOnda = tocando ? (1 - Math.exp(-tq.t / TQ.ataque)) * (1 - tq.t / TQ.dura) ** TQ.queda : 0;
    /* a batida do toque: sobe em `sobe` (saída cúbica) e solta em `solta` (suave); relógio próprio (tq.b) */
    const tb = tq.b === undefined ? tq.t : tq.b;
    const envBatida = tb < 0 ? 0 : tb < TQ.sobe ? 1 - (1 - tb / TQ.sobe) ** 3 : 1 - suave((tb - TQ.sobe) / TQ.solta);

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

    /* a TRAVA (spec.trava): câmaras e pétalas giram em sentidos opostos em
       relação ao portal, uma casa de 30° por fôlego, e se realinham no
       instante em que a energia chega ao núcleo (uT inteiro). Travadas por
       `fica` do fôlego, soltam acelerando (q²), chegam com velocidade e o
       encaixe passa `passa` da casa e volta em `volta` (o clique). A
       agitação e a rolagem (giroExtra) giram as camadas em sentidos
       alternados, como engrenagens (o arrasto de cada uma, spec.trava) */
    const uT = (t - RS.nucleo[0]) / RS.periodo - RS.inspira;
    const trava = travar(uT);
    const extra = e.giroExtra || 0;
    for (let i = 0; i < paineis.length; i++) {
      const pa = paineis[i], M = pa.d.montagem;
      /* o campo e a onda vão para o plano da camada: desfaz o giro total
         (roda + camada) e a escala (o shader compara com a posição local) */
      const rel = pa.d.trava * passo * trava + pa.d.arrasto * extra;   /* spec.trava: o arrasto é relativo à roda */
      pa.grupo.rotation.z = rel;
      const cg = Math.cos(-giro - rel), sg = Math.sin(-giro - rel);
      const k = suave((m - M.atraso) / (1 - M.atraso));
      const esc = mistura(M.escala, 1, k) * (1 + ab * 0.1) * (1 + respira(t, pa.respira));
      pa.grupo.scale.setScalar(esc);
      pa.matL.uniforms.uAlfa.value = pa.d.contorno * k * (1 - ab * 0.6);
      pa.matL.visible = k > 0.002;
      por4(pa.campo.uCampo.value, (c.x * cg - c.y * sg) / esc, (c.x * sg + c.y * cg) / esc, c.f * k, CA.raio / esc);
      por4(pa.campo.uOnda.value, (tq.x * cg - tq.y * sg) / esc, (tq.x * sg + tq.y * cg) / esc, frente / esc, forcaOnda * k);
    }
    /* o tracejado fica parado (spec.tracejado): não gira */
    tracejado.scale.setScalar(1 + respira(t, RS.tracejado));
    matTracejado.opacity = TR.alfa * suave(m);

    const aparece = suave(m);
    matRegua.opacity = G.alfa * aparece;
    matReguaLonga.opacity = G.alfaLonga * aparece;
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
       gaguejaria). Em 400 s o t·vel dos pulsos do trilho fecha inteiro
       (0,22 × 400) e o tremor da coroa usa frequências inteiras na volta,
       então ela não aparece. Material
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
    /* + a energia que o CAMPO entrega (js/rede.js → boot.js): o ciclo fecha no reator */
    /* ...e no encaixe da trava (a chegada ao núcleo) os 12 canais piscam juntos */
    fluxoRaios.uBase.value = R.base * (1 + 1.8 * chegada + TV.pisca * 5 * Math.exp(-chegou * 6)) + 0.08 * (e.entrega || 0);
    const batida = (1 + R.batida * Math.exp(-chegou * 5) * ig) * (1 + (TQ.batida + (tq.amp || 0)) * envBatida);
    const inspira = 1 + respira(t, RS.nucleo);
    /* o lampejo: a energia entra pelo portal no começo do fôlego */
    const lampejo = desde < A.raios ? 0 : LP.alfa * Math.max(0, 1 - (x * RS.periodo) / LP.dura) * forca;
    matLampejo.opacity = lampejo;
    matLampejo.visible = lampejo > 0.002;

    /* a luz do vidro vem de onde o núcleo está (no mundo: o reator só gira) */
    vidro.uniforms.uCentro.value.copy(centro.copy(nucleo.position).applyEuler(raiz.rotation));
    vidro.uniforms.uIgnicao.value = ig * (1 + perto * 0.5);

    /* a coroa: bate e respira; a pressão sobe ao inspirar, com o cursor perto,
       no toque e na agitação; na chegada da energia, o estouro (coroa.js) */
    const pc = PARAM_COROA;
    pc.raio = NU.raio * (0.55 + 0.45 * ig) * batida * inspira * (1 + perto * 0.3);
    pc.disco = (0.12 + 0.88 * ig) * (1 + perto);
    pc.folego = folego(t - RS.nucleo[0], RS.periodo, RS.inspira);
    pc.perto = perto; pc.toque = envBatida; pc.agitacao = e.agitacao || 0; pc.chegou = chegou; pc.t = t; pc.extra = extra;
    /* o cursor puxa os fios: forte perto do núcleo, de leve em qualquer ponto do hero */
    pc.alvo.x = o.x; pc.alvo.y = o.y; pc.alvo.f = Math.min(1, o.f * 0.5 + perto * 2.5);
    coroaN.atualizar(pc);
    coroa.quaternion.copy(raiz.quaternion).invert();   /* de frente para a câmera */

    /* o traço é um evento: nasce do núcleo na ignição e assenta */
    const nasceu = desde < 0 ? 0 : 1 - (1 - Math.min(1, desde / NU.nasce)) ** 3;
    const assentou = desde < NU.nasce ? 0 : suave((desde - NU.nasce) / NU.assenta);
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

  function dispose() {
    for (const x of descartar) if (x.dispose) x.dispose();
  }

  return { raiz, atualizar, dispose, tingir, pose: () => pose };
}
