/* ==========================================================================
   AI CORE — o spec. O que o reator É, em dados; nada aqui sabe de three.js.

   História (docs/restructure/PLANO-AI-CORE.md): a v1 (esfera de vidro lida
   da imagem do dono) foi vista como "emaranhado de fios"; a v2 virou um
   reator simétrico de frente (grandeza, equilíbrio, energia); a v3 (pedido
   do dono: "as bordas espessas dão um ar pesado, rústico; quero algo
   elegante, de outro patamar") troca massa por precisão: anéis finos,
   lâminas de cristal de 1 px iluminadas por dentro, régua de relógio.

   Unidades: raio do portal ≈ 1. Cores: nomes de token (lidos do CSS no
   boot), nunca hexadecimal solto. O emissor é pecas.js.

   PISO DE ESPESSURA: no celular (canvas ~500 px CSS, pixel ratio 1,5) uma
   unidade vale ~250 px; nada fino fica abaixo de 0,004 (≈ 1 px), senão some
   ou tremeluz justamente onde a maioria acessa (revisão de código, v3).
   ========================================================================== */

export const SPEC = {
  camera: { fov: 30, z: 5.6 },
  semente: 20261002,

  /* profundidade: o reator inteiro inclinado (≈ 24°, olhamos de cima: o
     portal fica elíptico parado) e névoa — o que está mais longe da câmera
     escurece (vidro do portal, lâminas e contornos) */
  inclina: -0.42,
  nevoa: { perto: 0.4, longe: -0.8, minimo: 0.42 },

  /* o núcleo: a fonte. Só ele é branco; o "no ar." do H1 continua sendo o
     ciano mais forte da tela */
  nucleo: {
    raio: 0.065,
    halos: [
      { cor: 't1', escala: 0.5, alfa: 1.0, miolo: 0.12 },    /* o estouro branco */
      { cor: 'ac', escala: 1.5, alfa: 0.55, miolo: 0.04 },   /* o halo */
      { cor: 'ac', escala: 3.2, alfa: 0.14, miolo: 0.0 }     /* a bruma */
    ],
    raios: { cor: 'ac2', escala: 1.0, alfa: 0.22, n: 12 },   /* 12, como tudo */
    /* o traço horizontal: nasce do núcleo na ignição e assenta QUASE apagado
       (assentado forte, com os jatos, formava uma mira de luneta — rodada 6) */
    tracos: [
      { cor: 'ac2', largura: 5.6, altura: 0.035, alfa: 0.8, assenta: { largura: 2.0, alfa: 0.1 } },
      { cor: 'ac', largura: 1.9, altura: 0.16, alfa: 0.3, assenta: { largura: 1.2, alfa: 0.05 } }
    ],
    nasce: 0.35,
    assenta: 1.2
  },

  /* a lente: anéis finos de frente em volta do núcleo; a régua de marcas amarra
     o reator à marca */
  lente: [
    { raio: 0.15, tubo: 0.004, cor: 'ac2', alfa: 0.85, vel: 0.3 },
    { raio: 0.21, tubo: 0.005, cor: 'ambar', alfa: 0.45, vel: -0.18, marcas: 48, marca: 0.004 },
    { raio: 0.28, tubo: 0.004, cor: 'ac', alfa: 0.5, vel: 0.12 }
  ],

  /* os raios de energia: a energia dominante. 12 feixes do portal ao núcleo,
     pulsos correndo PARA DENTRO, em fase, chegando a cada 1/vel s (1,6 s); o
     núcleo bate a cada chegada. `largura` fora, `ponta` dentro (piso de 1 px);
     `cauda`: expoente do pulso (3,4 ≈ 18% do raio) */
  raios: { n: 12, de: 0.9, ate: 0.16, largura: 0.012, ponta: 0.006, pulsos: 2, vel: 0.625, cauda: 3.4, cor: 'ac', alfa: 0.95, base: 0.11, batida: 0.08,
    /* a injeção: onde cada raio toca o portal, um lampejo discreto na partida
       de cada pulso (forte, lia como rebites — rodada 6) */
    lampejo: { alfa: 0.3, dura: 0.4, escala: 0.055 } },

  /* os jatos: o eixo vertical (no lugar do anel vertical, que com o disco
     formava o símbolo do átomo). Terminam logo depois do portal (mais longos,
     com o traço, formavam uma mira — rodada 6), pulsos PARA FORA */
  jatos: { comp: 0.9, de: 0.09, largura: [0.006, 0.02], pulsos: 2, vel: 0.625, cauda: 7, cor: 'ac', alfa: 0.55, base: 0.22 },

  /* o disco: matéria em órbita só DENTRO da lente, no plano do equador
     (π/2: horizontal; com a inclinação vira uma elipse fina). As de dentro
     giram mais rápido (`kepler`); `denso` delas no `miolo`; cada uma é um
     risco ao longo da órbita (`rastro`). Espalhado até o portal virava
     chuvisco (rodada 5) */
  disco: { n: 500, nCelular: 260, raio: [0.2, 0.3], inclina: 1.5708, giro: 0.35, kepler: 0.63, tam: 0.03, cor: 'ac2', alfa: 0.4,
    denso: 0.6, miolo: 0.35, rastro: 4 },

  /* o equador: um fio de pulsos fracos no plano do disco */
  equador: { raio: 0.62, tubo: 0.004, vel: -0.1, fluxo: { cor: 'ac2', pulsos: 2, vel: -0.3, alfa: 0.15 } },

  /* o portal: um anel FINO de vidro em 12 segmentos com micro-vãos alinhados
     aos raios (`vao` = fração vazia). `bisel`: um único reflexo que corre no
     anel, como o bisel de um relógio fino (rodada 6): meia-largura em rad
     (0,26 ≈ arco de 30°), pico e segundos por volta. `fio`: a linha de trás,
     fraca, para o deslocamento ler como profundidade e não como imagem
     duplicada */
  portal: { raio: 0.97, n: 12, vao: 0.022, tubo: 0.011, vel: 0.025,
    bisel: { meia: 0.26, alfa: 0.7, volta: 14 },
    fio: { raio: 0.905, z: -0.22, tubo: 0.004, cor: 'ac2', alfa: 0.15 } },

  /* trilhos: anéis contínuos com pulsos de luz correndo em volta */
  trilhos: [
    { raio: 0.85, tubo: 0.005, pulsos: 3, vel: 0.22, cor: 'ac', alfa: 0.4 },
    { raio: 1.07, tubo: 0.004, pulsos: 2, vel: -0.14, cor: 'ac2', alfa: 0.32 }
  ],

  /* as câmaras e as pétalas: lâminas de cristal. Contorno de 1 px nas duas
     faces com as arestas de espessura (volume sem peso), a aresta de dentro
     acesa pelo núcleo e apagando para fora; preenchimento quase transparente
     (`luz`, caindo a zero em `cai` do comprimento). Câmaras ENTRE os raios,
     atrás; pétalas SOBRE os raios, à frente */
  camaras: { n: 12, raio: [0.43, 0.66], vao: 0.3, z: -0.14, espessura: 0.045, contorno: 0.75, luz: 0.22, cai: 0.6,
    montagem: { atraso: 0.2, escala: 1.25 } },
  petalas: { n: 12, raio: [0.31, 0.385], vao: 0.42, z: 0.18, espessura: 0.025, contorno: 0.55, luz: 0.3, cai: 0.9,
    montagem: { atraso: 0.38, escala: 1.4 } },

  /* o tracejado: 60 traços entre as câmaras e o trilho, girando devagar ao
     contrário da roda */
  tracejado: { raio: 0.755, n: 60, z: 0.05, vel: -0.04, alfa: 0.28, cor: 'ac' },

  /* a luz de fundo: um disco de luz bem atrás do portal (paralaxe) */
  fundo: { escala: 2.1, alfa: 0.16, z: -0.6, cor: 'ac' },

  /* a régua: 120 marcas como mostrador de relógio; uma longa a cada `longa`
     (8 longas, mais fortes), as curtas discretas. `marca`: largura (piso) */
  regua: { raio: 1.13, n: 120, longa: 15, cor: 'ac', alfa: 0.2, alfaLonga: 0.45, marca: 0.004 },

  /* a onda: um anel de 1 px que sai do núcleo (raio de/ate) em `dura` s, a
     cada `periodo` s; nunca uma mancha */
  onda: { periodo: 8, dura: 1.4, raio: [0.4, 1.6], alfa: 0.35, cor: 'ac' },

  /* o acendimento corre de dentro para fora: o atraso (s) de cada camada
     depois da ignição */
  acende: { disco: 0, equador: 0.08, raios: 0.16, jatos: 0.16, trilhos: 0.24 },

  /* o vidro escuro do portal: a única luz é o núcleo, fios de reflexo duros,
     aresta de fresnel, a luz-chave e o bisel. Sem luz de cena, sem sombra. */
  vidro: { base: 'bg', interno: 'ac', aresta: 'ac2', brilho: 't1', ambiente: 'luz' }
};
