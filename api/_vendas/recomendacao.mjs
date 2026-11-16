/* ==========================================================================
   QUAL DOS TRÊS MODELOS O ZERO RECOMENDA (decisão do dono, 15/11, 21h40: os três modelos ficam; depois de gerar, o Zero
   recomenda um, com o motivo ligado ao caso). Regra fixa, sem IA: a estratégia que casa com os OBJETIVOS que a pessoa deu
   (a lista fechada do briefing, nunca o texto livre dela), e o motivo diz esse objetivo e o que o modelo faz. Nada inventado:
   sem objetivo que case, o motivo fala só do que o modelo faz. Só recomenda um modelo PRONTO da geração atual.
   O mesmo cálculo serve à tela (o estado) e à medição (a escolha registra se era o recomendado).
   ========================================================================== */
import { nichoRegulado } from './zero.mjs';

/* o nome de cada estratégia para quem não é do meio (tela, Zero e painel falam igual) */
export const NOMES_DAS_ESTRATEGIAS = Object.freeze({ conversao: 'Para vender mais', autoridade: 'Para passar confiança', experiencia: 'Para encantar' });

/* o objetivo (lista fechada do briefing) → a estratégia que serve a ele e como dizê-lo numa frase */
const OBJETIVO = Object.freeze({
  vender: ['conversao', 'vender mais'],
  gerar_leads: ['conversao', 'receber mais pedidos de orçamento'],
  agendamentos: ['conversao', 'ter mais agendamentos'],
  captar_contatos: ['conversao', 'receber mais contatos'],
  autoridade: ['autoridade', 'passar mais confiança'],
  apresentar_empresa: ['autoridade', 'apresentar bem a empresa'],
  lancar_produto: ['experiencia', 'lançar um produto']
});
/* o que o modelo de cada estratégia faz (a estratégia da geração, api/_vendas/direcao.mjs ESTRATEGIAS), em palavras de gente */
const O_QUE_FAZ = Object.freeze({
  conversao: 'ele leva quem chega direto a falar com você, com o botão sempre à vista',
  autoridade: 'ele mostra com calma o seu jeito de trabalhar, num tom sóbrio que passa segurança',
  experiencia: 'ele conta a história do seu negócio em sequência e chama atenção pelo visual'
});
const ORDEM = ['conversao', 'autoridade', 'experiencia'];

/* a estratégia que mais casa com os objetivos; empate: em saúde e advocacia a confiança vem antes, nos outros a venda */
function estrategiaDoCaso(briefing) {
  const objetivos = Array.isArray(briefing?.objetivos) ? briefing.objetivos.filter((o) => Object.hasOwn(OBJETIVO, o)) : [];
  const pontos = { conversao: 0, autoridade: 0, experiencia: 0 };
  objetivos.forEach((o, i) => { pontos[OBJETIVO[o][0]] += 10 - i; });   /* (o objetivo dito primeiro pesa um pouco mais) */
  const regulado = !!nichoRegulado([briefing?.negocio?.segmento, briefing?.negocio?.descricao].filter((x) => typeof x === 'string').join(' '));
  const desempate = regulado ? ['autoridade', 'conversao', 'experiencia'] : ORDEM;
  const melhor = desempate.reduce((a, b) => (pontos[b] > pontos[a] ? b : a));
  const objetivo = objetivos.find((o) => OBJETIVO[o][0] === melhor);
  return { estrategia: pontos[melhor] > 0 ? melhor : desempate[0], objetivo: pontos[melhor] > 0 ? objetivo : null };
}

/* { direcao_id, numero, estrategia, nome, texto } ou null (sem o modelo da estratégia pronto, ainda não recomenda) */
export function recomendar(briefing, direcoes) {
  const lista = Array.isArray(direcoes) ? direcoes : [];
  const geracao = Math.max(0, ...lista.map((d) => Number(d?.geracao) || 0));
  const prontas = lista.filter((d) => d && d.status === 'pronta' && (Number(d.geracao) || 0) === geracao && Object.hasOwn(O_QUE_FAZ, d.estrategia));
  if (!prontas.length) return null;
  const { estrategia, objetivo } = estrategiaDoCaso(briefing);
  const d = prontas.find((x) => x.estrategia === estrategia);
  if (!d) return null;
  const nome = NOMES_DAS_ESTRATEGIAS[estrategia];
  const porque = objetivo ? 'você quer ' + OBJETIVO[objetivo][1] + ', e ' + O_QUE_FAZ[estrategia] : O_QUE_FAZ[estrategia];
  return { direcao_id: d.id, numero: d.numero, estrategia, nome, texto: 'No seu caso eu iria no ' + d.numero + ' (' + nome.toLowerCase() + '), porque ' + porque + '.' };
}
