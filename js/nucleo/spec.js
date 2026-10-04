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
     ciano mais forte da tela.
     2026-10-03, refeito do zero (dono: "os núcleos devem transmitir a
     sensação de que estão TRANSBORDANDO de energia"): a COROA (coroa.js) —
     núcleo de bordas que fervem, FILAMENTOS de plasma que batem no vidro da
     lente (e o rompem no estouro da chegada), ecos em curva de nível e faíscas,
     tudo em traço nítido. (A 1ª tentativa, línguas em lobos, lia como flor
     ou órbita de átomo.)
     `raio`: o núcleo (unidades do spec). `filamentos`: quantos, até onde
     vão (o raio do vidro da lente), até onde vazam no estouro, ondulação
     [larga, fina] (unidades). `faiscas`: quantas, quanto andam fora do vidro.
     `ecos`: quantos, passo (× raio), alfa do 1º. `vidro`: marcas, rad/s, arcos
     que correm nele. `pressao`: base e quanto o
     fôlego soma. `ondas`: a da chegada (s entre as duas, vida, raio final).
     `meia`: a meia-largura do quadrado (cobre a onda) */
  nucleo: {
    raio: 0.09,
    coroa: { meia: 0.55,
      filamentos: { n: 14, ate: 0.275, vaza: 0.52, ondula: [0.016, 0.005] },
      ecos: { n: 3, passo: 0.2, alfa: 0.55 },
      vidro: { marcas: 48, giro: -0.12, arcos: 3 },
      faiscas: { n: 14, alcance: 0.15 },
      pressao: { base: 0.25, folego: 0.55 },
      ondas: { intervalo: 0.2, vida: 0.5, ate: 0.52, alfa: 0.7 },
      /* o que muda no celular (custo por pixel) */
      celular: { filamentos: { n: 10, ate: 0.275, vaza: 0.52, ondula: [0.016, 0.005] }, faiscas: { n: 8, alcance: 0.15 }, ecos: { n: 2, passo: 0.2, alfa: 0.55 } } },
    /* o traço horizontal: nasce do núcleo na ignição e assenta curto (~3× a
       órbita), o reflexo achatado de antes sem desfoque. (Assentado longo e
       forte, com os jatos, formava uma mira de luneta — rodada 6) */
    tracos: [
      { cor: 'ac2', largura: 5.6, altura: 0.035, alfa: 0.8, assenta: { largura: 0.9, alfa: 0.38 } }
    ],
    nasce: 0.35,
    assenta: 1.2
  },

  /* a lente: vazia desde 2026-10-03. Os anéis em volta do núcleo poluíam e o
     último (o vidro, com 48 marcas) passou para a coroa, de frente para a
     câmera (coroa.js): inclinado, ele não batia com os contatos dos fios */
  lente: [],

  /* os raios de energia: 12 canais do portal ao núcleo. A energia corre
     neles UMA vez por fôlego (pedido do dono: os pulsos de 1,6 s "pareciam
     avulsos, sem sentido lógico"): entra pelo portal no começo da
     inspiração (o lampejo), é puxada para o centro acelerando (`puxa`:
     expoente do caminho) e chega no instante em que o núcleo está cheio,
     que então bate (`batida`). O canal fica aceso (`base`): o pulso corre
     num trilho, não flutua. `largura` fora, `ponta` dentro (piso de 1 px);
     `cauda`: o rastro, em fração do comprimento */
  raios: { n: 12, de: 0.9, ate: 0.16, largura: 0.012, ponta: 0.006, puxa: 1.6, cauda: 0.24, cor: 'ac', alfa: 0.95, base: 0.2, batida: 0.12,
    /* a injeção: onde cada raio toca o portal, um lampejo discreto na partida
       de cada pulso (forte, lia como rebites — rodada 6) */
    lampejo: { alfa: 0.3, dura: 0.4, escala: 0.055 } },

  /* os jatos: o eixo vertical (no lugar do anel vertical, que com o disco
     formava o símbolo do átomo). Terminam logo depois do portal (mais longos,
     com o traço, formavam uma mira — rodada 6). A outra metade do fôlego:
     ao expirar, o núcleo solta a energia que os raios trouxeram, PARA FORA,
     pelos jatos (`solta`: quantos comprimentos a frente anda no expirar) */
  jatos: { comp: 0.9, de: 0.09, largura: [0.006, 0.02], solta: 1.5, cauda: 0.3, cor: 'ac', alfa: 0.55, base: 0.22 },

  /* o disco de partículas e o anel do equador saíram em 2026-10-03: a
     elipse deles em volta do núcleo lia como um olho rabiscado e era o
     maior foco de poluição que o dono apontou (história: commit 4f9d1a3) */

  /* o portal: um anel FINO de vidro em 12 segmentos com micro-vãos alinhados
     aos raios (`vao` = fração vazia). `bisel`: um único reflexo que corre no
     anel, como o bisel de um relógio fino (rodada 6): meia-largura em rad
     (0,26 ≈ arco de 30°), pico e segundos por volta. (O fio fraco de trás
     saiu em 2026-10-03: lia como o portal desenhado duas vezes) */
  portal: { raio: 0.97, n: 12, vao: 0.022, tubo: 0.011, vel: 0.025,
    bisel: { meia: 0.26, alfa: 0.7, volta: 14 } },

  /* trilhos: anéis contínuos com pulsos de luz correndo em volta */
  /* (o de 1,07, entre o portal e a régua, saiu com o fio de trás: anéis
     demais lado a lado) */
  trilhos: [
    { raio: 0.85, tubo: 0.005, pulsos: 3, vel: -0.22, cor: 'ac', alfa: 0.4 }
  ],

  /* as câmaras e as pétalas: lâminas de cristal. Contorno de 1 px da face da
     frente (as duas faces e as quinas liam como um fantasma de cada lâmina,
     2026-10-03), a aresta de dentro acesa pelo núcleo e apagando para fora; preenchimento quase transparente
     (`luz`, caindo a zero em `cai` do comprimento). Câmaras ENTRE os raios,
     atrás; pétalas SOBRE os raios, à frente */
  camaras: { n: 12, raio: [0.43, 0.66], vao: 0.3, z: -0.14, contorno: 0.95, luz: 0.22, cai: 0.6, trava: -1,
    montagem: { atraso: 0.2, escala: 1.25 } },
  petalas: { n: 12, raio: [0.31, 0.385], vao: 0.42, z: 0.18, contorno: 0.72, luz: 0.3, cai: 0.9, trava: 1,
    montagem: { atraso: 0.38, escala: 1.4 } },

  /* a TRAVA (2026-10-03, dono: "a maioria gira para o mesmo lado; quero
     uma rotação mais criativa"). Câmaras e pétalas giram em sentidos
     opostos em relação ao portal (`trava` = sentido, em casas de 30° por
     fôlego) e voltam a se alinhar no instante em que a energia chega ao
     núcleo. Crítica de arte: o encaixe precisa ser um EVENTO. Depois do
     encaixe elas ficam travadas (`fica`, fração do fôlego), soltam
     acelerando e chegam com velocidade; no encaixe passam `passa` da casa
     (~2°) e voltam em `volta` do fôlego (~0,3 s), como um clique; os raios
     piscam juntos no mesmo instante. */
  trava: { fica: 0.3, passa: 0.06, volta: 0.045, pisca: 0.6 },

  /* o tracejado: 60 traços entre as câmaras e o trilho, PARADO (crítica de arte: no máximo 3 velocidades e duas referências
     fixas, a régua e ele; senão o conjunto lia como máquina de lavar) */
  tracejado: { raio: 0.755, n: 60, z: 0.05, alfa: 0.28, cor: 'ac' },

  /* a régua: 120 marcas como mostrador de relógio, PARADA (o estator: a
     referência fixa contra a qual os sentidos opostos se leem); uma longa a cada `longa`
     (8 longas, mais fortes), as curtas discretas. `marca`: largura (piso) */
  regua: { raio: 1.13, n: 120, longa: 15, cor: 'ac', alfa: 0.2, alfaLonga: 0.45, marca: 0.004 },

  /* a onda: um anel de 1 px que sai do núcleo (raio de/ate) em `dura` s, a
     cada `periodo` s; nunca uma mancha */
  onda: { periodo: 8, dura: 1.4, raio: [0.4, 1.6], alfa: 0.35, cor: 'ac' },

  /* a respiração (pedido do dono: "sempre em movimento, praticamente
     respirando; leve, suave, quase hipnotizante"). Um fôlego a cada
     `periodo` s (≈ 8,5 por minuto, o ritmo de quem está calmo): inspira em
     `inspira` do ciclo, solta no resto. Nasce no núcleo e corre para fora:
     cada camada respira [atraso s depois, crescendo amp da escala]. Com o
     atraso a respiração vira uma onda lenta que atravessa o reator, nunca o
     reator inteiro pulsando junto (isso leria como zoom) */
  respira: { periodo: 7, inspira: 0.42, luz: 0.14,
    nucleo: [0, 0.08], lente: [0.35, 0.035], petalas: [0.75, 0.028], camaras: [1.1, 0.02],
    tracejado: [1.35, 0.012], portal: [1.6, 0.01] },

  /* o campo: o ponteiro (ou o dedo) como uma força no plano do reator. As
     lâminas perto dele se afastam (`empurra`) e se erguem para a câmera
     (`ergue`), caindo em `raio`; o núcleo clareia quando o ponteiro chega
     perto dele (`perto`, `brilho`). `acende`: quanto o cristal tocado
     ganha de luz (×(1 + acende) no centro do campo e na frente da onda) */
  campo: { raio: 0.32, empurra: 0.075, ergue: 0.14, perto: 0.4, brilho: 0.22, acende: 2.2, atento: 0.16 },

  /* o olhar: o corpo do reator NÃO segue o cursor (pedido do dono); só o
     núcleo, como um olho, em qualquer ponto do hero. `alcance`: o quanto
     ele se desloca na direção do cursor (unidades do spec; o portal é ~1);
     a lente vai `lente` do caminho (profundidade). E o bisel do portal
     vira para o cursor: o anel reflete a sua luz (`bisel`: quanto do
     caminho até o ângulo do cursor ele faz) */
  olhar: { alcance: 0.075, lente: 0.45, bisel: 1 },

  /* o toque: um clique ou toque no reator solta uma onda que sai do ponto
     tocado e atravessa as lâminas (`vel` unidades/s, `largura` da frente),
     e o núcleo bate mais forte (`batida`).
     Pedido do dono (2026-10-03): no centro o efeito era rápido demais (a
     batida sumia em 0,17 s e a onda nascia na velocidade máxima, cruzando a
     lente em 0,1 s). Agora a frente ARRANCA (`arranque`: a constante de
     tempo até a velocidade plena; a lente é cruzada em ~0,37 s) e chega ao
     portal ainda forte (queda `(1 − t/dura)^queda`); a batida é um
     ENVELOPE FINITO: sobe em `sobe` s (saída cúbica) até +`batida` e
     solta em `solta` s (suave), acabando em 0,6 s. Certeira: começa no
     quadro do clique e tem fim. (A 1ª versão, com cauda exponencial, ficou
     mole: +17% e 1,3 s para sumir.) */
  toque: { vel: 1.1, largura: 0.14, dura: 1.9, queda: 1.2, batida: 0.28, arranque: 0.12, ataque: 0.05, sobe: 0.1, solta: 0.5,
    /* um novo toque com a onda ainda nascendo (< `religa` s) só bate de novo: não mata a frente em voo */
    religa: 0.35 },

  /* o acendimento corre de dentro para fora: o atraso (s) de cada camada
     depois da ignição */
  acende: { coroa: 0, raios: 0.16, jatos: 0.16, trilhos: 0.24 },

  /* o vidro escuro do portal: a única luz é o núcleo, fios de reflexo duros,
     aresta de fresnel, a luz-chave e o bisel. Sem luz de cena, sem sombra. */
  vidro: { base: 'bg', interno: 'ac', aresta: 'ac2', brilho: 't1', ambiente: 'metal' }
};
