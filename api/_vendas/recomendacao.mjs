/* ==========================================================================
   QUAL DOS TRÊS MODELOS O ZERO RECOMENDA (decisão do dono, 15/11, 21h40: os três modelos ficam; depois de gerar, o Zero
   recomenda um, com o motivo ligado ao caso). Regra fixa, sem IA: a estratégia que casa com os OBJETIVOS que a pessoa deu
   (a lista fechada do briefing, nunca o texto livre dela), e o motivo diz esse objetivo e o que o modelo faz. Nada inventado:
   sem objetivo que case, a frase não finge que é sob medida ("eu começaria pelo…"). O PRIMEIRO objetivo que a pessoa disse decide.
   Só recomenda um modelo PRONTO (o estado já traz só a geração atual: app.vendas_estado filtra por geracao).
   O mesmo cálculo serve à tela (o estado) e à medição (a escolha registra se era o recomendado).
   ========================================================================== */
import { nichoRegulado } from './zero.mjs';

/* o nome de cada estratégia para quem não é do meio (tela, Zero e painel falam igual) */
export const NOMES_DAS_ESTRATEGIAS = Object.freeze({ conversao: 'Para vender mais', autoridade: 'Para passar confiança', experiencia: 'Para encantar' });

/* o objetivo (lista fechada do briefing) → a estratégia que serve a ele e como dizê-lo numa frase */
const OBJETIVO = Object.freeze({
  vender: ['conversao', 'vender mais'],
  gerar_leads: ['conversao', 'receber mais orçamentos'],
  agendamentos: ['conversao', 'ter mais agendamentos'],
  captar_contatos: ['conversao', 'receber mais contatos'],
  autoridade: ['autoridade', 'passar confiança'],
  apresentar_empresa: ['autoridade', 'apresentar bem a empresa'],
  lancar_produto: ['experiencia', 'lançar um produto']
});
/* o que o modelo de cada estratégia faz (a estratégia da geração, api/_vendas/direcao.mjs ESTRATEGIAS), em palavras de gente e curtas
   (dono, 24/11: menos texto na parte das prévias; a frase inteira fica em até 15 palavras, docs/testes/modelos-recomendacao.test.mjs) */
const O_QUE_FAZ = Object.freeze({
  conversao: 'ele mostra logo o que você oferece',
  autoridade: 'ele passa segurança com calma',
  experiencia: 'ele conta sua história pelo visual'
});

/* o PRIMEIRO objetivo da lista que a pessoa deu decide (a ordem dela, não a quantidade); sem nenhum, em saúde e advocacia a
   confiança, nos outros a venda */
function estrategiaDoCaso(briefing) {
  const objetivos = Array.isArray(briefing?.objetivos) ? briefing.objetivos.slice(0, 10) : [];
  const objetivo = objetivos.find((o) => typeof o === 'string' && Object.hasOwn(OBJETIVO, o)) || null;
  if (objetivo) return { estrategia: OBJETIVO[objetivo][0], objetivo };
  const texto = [briefing?.negocio?.segmento, briefing?.negocio?.descricao].filter((x) => typeof x === 'string').join(' ').slice(0, 2000);
  return { estrategia: nichoRegulado(texto) ? 'autoridade' : 'conversao', objetivo: null };
}

/* { direcao_id, numero, estrategia, nome, texto } ou null (sem o modelo da estratégia pronto, ainda não recomenda) */
export function recomendar(briefing, direcoes) {
  const prontas = (Array.isArray(direcoes) ? direcoes : []).filter((d) => d && d.status === 'pronta' && Object.hasOwn(O_QUE_FAZ, d.estrategia));
  if (!prontas.length) return null;
  const { estrategia, objetivo } = estrategiaDoCaso(briefing);
  const d = prontas.find((x) => x.estrategia === estrategia);
  if (!d) return null;
  const nome = NOMES_DAS_ESTRATEGIAS[estrategia];
  /* (o nome da estratégia não entra: o cartão logo abaixo já diz "01 · Para vender mais") */
  const texto = objetivo
    ? 'Eu iria no ' + d.numero + ': para ' + OBJETIVO[objetivo][1] + ', ' + O_QUE_FAZ[estrategia] + '.'
    : 'Eu começaria pelo ' + d.numero + ': ' + O_QUE_FAZ[estrategia] + '.';
  return { direcao_id: d.id, numero: d.numero, estrategia, nome, texto };
}
