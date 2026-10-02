/* ==========================================================================
   AI CORE — o spec. O que a esfera É, em dados; nada aqui sabe de three.js.

   Saiu da leitura da imagem de referência (docs/restructure/moodboard/
   ai-core-referencia.png), no método do img2threejs: o spec é a verdade, o
   código que monta as peças (pecas.js) é derivado dele. Mudar a esfera é
   mudar estes números, não o emissor.

   Unidades: raio da gaiola = 1. Cores: nomes de token (lidos do CSS no boot),
   nunca hexadecimal solto, para a esfera nunca sair da paleta do site.
   Peças repetidas (arcos, cacos, poeira) são DESCRITAS por faixa e
   contagem; o emissor sorteia com semente fixa, então a esfera é a mesma em
   toda visita.
   ========================================================================== */

export const SPEC = {
  /* z: a esfera (raio ~1) ocupa a caixa do hero; o canvas é 1,44× a caixa
     (sangra para os cacos e o traço), então a meia-altura visível é ~1,5 */
  camera: { fov: 30, z: 5.6 },
  semente: 20261002,

  /* o ponto que acende. A referência estoura branco no centro com halo
     ciano e uma bruma larga; aqui o estouro é menor que lá (a V4 proíbe
     neon): o "no ar." do H1 continua sendo o ciano mais forte da tela, e só
     o núcleo pode ser branco. Rodada 1 da crítica: a estrela de raios, o
     traço fixo e a aresta acesa em tudo somados beiravam o neon. */
  nucleo: {
    raio: 0.06,
    halos: [
      { cor: 't1', escala: 0.48, alfa: 1.0, miolo: 0.12 },   /* o estouro branco */
      { cor: 'ac', escala: 1.45, alfa: 0.55, miolo: 0.04 },  /* o halo ciano */
      { cor: 'ac', escala: 3.0, alfa: 0.14, miolo: 0.0 }     /* a bruma, larga e fraca */
    ],
    raios: { cor: 'ac2', escala: 1.0, alfa: 0.2, n: 6 },   /* poucos raios, quase nada */
    /* o traço horizontal é um EVENTO: nasce do núcleo para fora na ignição
       (a luz passa e imprime) e assenta fraco e mais curto */
    tracos: [
      { cor: 'ac2', largura: 5.6, altura: 0.035, alfa: 0.8, assenta: { largura: 3.2, alfa: 0.25 } },  /* o fio */
      { cor: 'ac', largura: 1.9, altura: 0.16, alfa: 0.3, assenta: { largura: 1.2, alfa: 0.12 } }     /* o clarão */
    ],
    nasce: 0.35,     /* s: o traço cresce do centro até a largura toda */
    assenta: 1.2     /* s: depois volta ao repouso */
  },

  /* a lente: anéis finos, concêntricos, em volta do núcleo. O anel com
     marcas de régua é âmbar: amarra a esfera à marca (ciano + âmbar) e a
     tira do "orbe ciano de IA" */
  lente: [
    { raio: 0.17, tubo: 0.004, cor: 'ac2', alfa: 0.8, eixo: [0.15, 0.2, 1], vel: 0.35 },
    { raio: 0.24, tubo: 0.008, cor: 'ambar', alfa: 0.35, eixo: [0.1, -0.1, 1], vel: -0.22, marcas: 64 },
    { raio: 0.31, tubo: 0.003, cor: 'ac2', alfa: 0.5, eixo: [1, 0.3, 0.2], vel: 0.18 },
    { raio: 0.36, tubo: 0.003, cor: 'ac', alfa: 0.4, eixo: [0.3, 1, 0.4], vel: -0.14 }
  ],

  /* a gaiola: POUCAS faixas grossas de vidro escuro, partidas, que formam
     uma esfera com volume (com 26 tubos finos lia como novelo no celular).
     Camadas de fora para dentro; `arco` em voltas (1 = círculo inteiro);
     `achata` < 1 vira fita em vez de tubo. As direções são distribuídas
     por igual (espiral áurea), não sorteadas, para cobrir a bola toda. */
  gaiola: [
    { n: 5, raio: [0.90, 1.02], tubo: [0.035, 0.08], arco: [0.45, 0.85], achata: [0.45, 0.9], onda: 0.025, vel: [0.03, 0.07], inclinacao: 1.45 },
    { n: 4, raio: [0.70, 0.86], tubo: [0.025, 0.055], arco: [0.45, 0.85], achata: [0.5, 1], onda: 0.02, vel: [0.05, 0.10], inclinacao: 1.15 },
    { n: 2, raio: [0.54, 0.62], tubo: [0.016, 0.030], arco: [0.50, 0.85], achata: [0.5, 1], onda: 0.015, vel: [0.07, 0.13], inclinacao: 0.7 },
    /* a abertura: fitas largas DE FRENTE em volta da lente, como o diafragma
       que a referência tem logo atrás do núcleo */
    { n: 2, raio: [0.40, 0.46], tubo: [0.032, 0.042], arco: [0.72, 0.92], achata: [0.3, 0.4], onda: 0.006, vel: [0.04, 0.07], inclinacao: 0.22 }
  ],

  /* fios: arcos finos e claros entre os grossos */
  fios: { n: 2, raio: [0.6, 1.05], tubo: [0.0035, 0.005], arco: [0.3, 0.55], onda: 0.01, vel: [0.03, 0.07], alfa: 0.35, inclinacao: 1.2 },

  /* cacos de vidro soltos: menos e maiores, para se lerem como vidro */
  cacos: { n: 70, nCelular: 40, raio: [0.95, 1.5], tam: [0.02, 0.09] },

  /* poeira fina */
  poeira: { n: 520, nCelular: 220, raio: [0.25, 2.0], tam: 0.014 },

  /* o vidro escuro: albedo quase preto, a luz que vem DE DENTRO (o núcleo é
     a única fonte), um reflexo de ambiente falso (a faixa clara que dá o
     brilho de vidro polido) e aresta de fresnel. Sem luz de cena, sem sombra. */
  vidro: { base: 'bg', interno: 'ac', aresta: 'ac2', brilho: 't1', ambiente: 'luz' }
};
