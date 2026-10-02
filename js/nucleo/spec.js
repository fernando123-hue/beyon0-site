/* ==========================================================================
   AI CORE — o spec. O que o reator É, em dados; nada aqui sabe de three.js.

   Versão 2 (docs/restructure/PLANO-AI-CORE.md, seção 11). A v1 (arcos de
   vidro partidos em ângulos variados, lida da imagem do dono) foi vista pelo
   dono como "um emaranhado de fios e cabos". Ele pediu grandeza, equilíbrio,
   alta simetria e grande energia passando. A v2 é um reator visto de frente:
   simetria radial de 12 tempos, peças inteiras e usinadas, energia correndo
   dos anéis para o núcleo.

   Unidades: raio do portal ≈ 1. Cores: nomes de token (lidos do CSS no
   boot), nunca hexadecimal solto. O emissor é pecas.js.
   ========================================================================== */

export const SPEC = {
  camera: { fov: 30, z: 5.6 },
  semente: 20261002,

  /* o núcleo: a fonte. Só ele é branco; o "no ar." do H1 continua sendo o
     ciano mais forte da tela */
  nucleo: {
    raio: 0.065,
    halos: [
      { cor: 't1', escala: 0.5, alfa: 1.0, miolo: 0.12 },    /* o estouro branco */
      { cor: 'ac', escala: 1.5, alfa: 0.55, miolo: 0.04 },   /* o halo ciano */
      { cor: 'ac', escala: 3.2, alfa: 0.14, miolo: 0.0 }     /* a bruma */
    ],
    raios: { cor: 'ac2', escala: 1.0, alfa: 0.22, n: 12 },   /* 12, como tudo */
    /* o traço horizontal: nasce do núcleo na ignição e assenta */
    tracos: [
      { cor: 'ac2', largura: 5.6, altura: 0.035, alfa: 0.8, assenta: { largura: 3.2, alfa: 0.22 } },
      { cor: 'ac', largura: 1.9, altura: 0.16, alfa: 0.3, assenta: { largura: 1.2, alfa: 0.1 } }
    ],
    nasce: 0.35,
    assenta: 1.2
  },

  /* a lente: anéis finos DE FRENTE em volta do núcleo; a régua âmbar amarra
     o reator à marca (ciano + âmbar) */
  lente: [
    { raio: 0.15, tubo: 0.004, cor: 'ac2', alfa: 0.85, vel: 0.3 },
    { raio: 0.21, tubo: 0.005, cor: 'ambar', alfa: 0.45, vel: -0.18, marcas: 48 },
    { raio: 0.28, tubo: 0.003, cor: 'ac', alfa: 0.5, vel: 0.12 }
  ],

  /* os raios de energia: A energia dominante (crítica rodada 3: com tudo
     brilhando igual lia como mostrador, não como potência). 12 feixes do
     portal ao núcleo, pulsos correndo PARA DENTRO, todos em fase, chegando a
     cada 1/vel s (1,6 s); o núcleo bate a cada chegada. `cauda`: expoente
     do pulso (7 ≈ 10% do raio de comprimento) */
  raios: { n: 12, de: 0.9, ate: 0.16, largura: 0.024, pulsos: 2, vel: 0.625, cauda: 3.4, cor: 'ac', alfa: 0.95, base: 0.11, batida: 0.08,
    /* a injeção: onde cada raio toca o portal, um lampejo na partida de cada
       pulso (12 em fase): o anel inteiro injeta energia no centro */
    lampejo: { alfa: 0.6, dura: 0.4, escala: 0.16 } },

  /* os jatos: o eixo vertical do reator (no lugar do anel vertical, que com
     o disco formava o símbolo do átomo). Finos, saindo pelos polos até
     passar da régua, com pulsos PARA FORA no mesmo compasso dos raios */
  jatos: { comp: 1.2, de: 0.09, largura: [0.006, 0.02], pulsos: 2, vel: 0.625, cauda: 7, cor: 'ac', alfa: 0.55, base: 0.22 },

  /* o disco: partículas em órbita no plano do equador, como um disco de
     acreção (as de dentro giram ~2,5× mais rápido que as de fora: `kepler`
     é o expoente). `inclina`: quanto o plano deita (0 = de frente,
     π/2 = de perfil; 1,36 ≈ 12° do horizonte) */
  disco: { n: 900, nCelular: 420, raio: [0.2, 0.86], inclina: 1.36, giro: 0.35, kepler: 0.63, tam: 0.032, cor: 'ac2', alfa: 0.65,
    /* matéria correndo, não anel de Saturno: `denso` das partículas ficam na
       fração `miolo` de dentro, e cada uma é um risco ao longo da órbita
       (`rastro`: comprimento/largura) */
    denso: 0.6, miolo: 0.35, rastro: 3 },

  /* o equador: só um fio de pulsos fracos no plano do disco (o anel sólido
     de vidro lia como Saturno — crítica rodada 4) */
  equador: { raio: 0.62, tubo: 0.004, vel: -0.1, fluxo: { cor: 'ac2', pulsos: 2, vel: -0.3, alfa: 0.15 } },

  /* o portal: o anel grande em 12 segmentos de vidro, com vãos alinhados aos
     raios de energia. `vao` = fração de cada segmento que fica vazia;
     `achata` < 1 = fita larga de frente, não tubo */
  portal: { raio: 0.97, n: 12, vao: 0.07, tubo: 0.06, achata: 0.42, vel: 0.025,
    /* a segunda camada, atrás e defasada meio passo: dá corpo e profundidade
       (uma camada só lia como mostrador plano) */
    fundo: { raio: 0.9, z: -0.16, tubo: 0.045, achata: 0.5 } },

  /* trilhos: anéis contínuos com pulsos de luz correndo em volta */
  trilhos: [
    { raio: 0.85, tubo: 0.005, pulsos: 3, vel: 0.22, cor: 'ac', alfa: 0.4 },
    { raio: 1.07, tubo: 0.0035, pulsos: 2, vel: -0.14, cor: 'ac2', alfa: 0.32 }
  ],

  /* a régua: 72 marcas em volta de tudo, uma longa a cada `longa` (8 longas) */
  regua: { raio: 1.13, n: 72, longa: 9, cor: 'ac', alfa: 0.3 },

  /* a onda: um anel de 1 px que sai do núcleo (raio de/ate) em `dura` s, a
     cada `periodo` s; nunca uma mancha (crítica rodada 3) */
  onda: { periodo: 8, dura: 1.4, raio: [0.4, 1.6], alfa: 0.35, cor: 'ac' },

  /* o acendimento corre de dentro para fora: o atraso (s) de cada camada
     depois da ignição */
  acende: { disco: 0, equador: 0.08, raios: 0.16, jatos: 0.16, trilhos: 0.24 },

  /* o vidro escuro: a única luz é o núcleo (de dentro), fios de reflexo duros,
     aresta de fresnel. Sem luz de cena, sem sombra. */
  vidro: { base: 'bg', interno: 'ac', aresta: 'ac2', brilho: 't1', ambiente: 'luz' }
};
