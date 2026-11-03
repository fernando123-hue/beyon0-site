/* ==========================================================================
   O PAINEL DA CONVERSA (peças visuais do Zero, fatia 1): "o que já anotamos" e a ficha do pedido. Tudo é DERIVADO do
   briefing por código, a cada leitura do estado: nenhum token novo, nada gravado no banco.

   O briefing é o que a PESSOA contou, resumido pelo modelo e já limpo por limparAtualizacao (comprimento, sem < >).
   Aqui só se reordena e se rotula: nada é inventado, sem número de resultado nem prova. Cada dado aparece em UM só bloco:
   as anotações são o que ela contou do negócio e da situação; a ficha é a identidade do pedido (empresa, segmento, cidade),
   o que quer resolver, o formato e o prazo. O esquema é FECHADO: chaves conhecidas, strings curtas, nenhum HTML; campo vazio
   some; sem nada para mostrar, devolve null. Os rótulos vêm de listas fechadas consultadas por chave PRÓPRIA (nunca
   __proto__, constructor...). Em nicho regulado (saúde, advocacia...), o que a pessoa pediu e a Beyon não faz (depoimento,
   antes e depois) NÃO aparece como anotado: o painel falaria na voz da Beyon.
   A tela monta o DOM por textContent e valida de novo. O radar "como lemos o seu caso" e o cenário desenhado (com os três
   quadros: cenário, o que trava, onde quer chegar) ficam para a fatia 2.
   ========================================================================== */
import { limparTexto } from './briefing.mjs';
import { textoProibido } from './zero.mjs';

export const LIMITES_PAINEL = Object.freeze({ itens: 5, ficha: 6, texto: 110 });

/* rótulos públicos (o formato sob medida se chama Cume desde a troca por conflito do Beyond no INPI, 03/11) */
const FORMATO = Object.freeze({ landing_page: 'Site de uma página', institucional: 'Site com várias páginas', sob_medida: 'Cume', loja_plataforma: 'Loja virtual' });
const OBJETIVO = Object.freeze({ gerar_leads: 'Receber pedidos de orçamento', apresentar_empresa: 'Apresentar a empresa', vender: 'Vender pela internet', agendamentos: 'Receber agendamentos', autoridade: 'Ser visto como referência', captar_contatos: 'Juntar contatos', lancar_produto: 'Lançar um produto' });
const FUNCIONALIDADE = Object.freeze({ whatsapp: 'botão de WhatsApp', formulario: 'formulário de contato', agendamento: 'agendamento', mapa: 'mapa', blog: 'blog', integracao: 'integração com outro sistema', ia: 'atendente de IA', area_restrita: 'área restrita', automacao: 'automação', catalogo: 'catálogo', loja: 'loja virtual', idioma: 'mais de um idioma', galeria: 'galeria de fotos', depoimentos: 'depoimentos' });

const propria = (mapa, chave) => typeof chave === 'string' && Object.prototype.hasOwnProperty.call(mapa, chave);
const rotuloDe = (mapa, chave) => (propria(mapa, chave) ? mapa[chave] : '');
const rotulos = (ids, mapa, max) => (Array.isArray(ids) ? ids.map(i => rotuloDe(mapa, i)).filter(Boolean).slice(0, max) : []);
const juntar = lista => lista.filter(Boolean).join(', ');
/* o prefixo não come o valor: o valor é cortado ANTES de somar o prefixo, para o item caber no limite */
const comPrefixo = (prefixo, valor) => (valor ? prefixo + valor.slice(0, Math.max(0, LIMITES_PAINEL.texto - prefixo.length)) : '');

export function montarPainel(briefing, { regulado = false } = {}) {
  const b = briefing && typeof briefing === 'object' && !Array.isArray(briefing) ? briefing : {};
  const negocio = b.negocio || {}, situacao = b.situacao_atual || {}, projeto = b.projeto || {};
  /* o texto da pessoa, curto e limpo; em nicho regulado, o que cita o proibido some */
  const texto = v => {
    const s = typeof v === 'string' ? limparTexto(v, LIMITES_PAINEL.texto) || '' : '';
    return regulado && textoProibido(s) ? '' : s;
  };
  const funcionalidades = regulado && Array.isArray(b.funcionalidades) ? b.funcionalidades.filter(f => f !== 'depoimentos') : b.funcionalidades;
  const quer = rotulos(funcionalidades, FUNCIONALIDADE, 3);
  const querResolver = texto(b.objetivo_detalhe) || juntar(rotulos(b.objetivos, OBJETIVO, 2));

  const anotamos = [
    texto(negocio.descricao),
    comPrefixo('Clientes chegam por: ', texto(situacao.como_chegam)),
    comPrefixo('O que se perde hoje: ', texto(situacao.o_que_se_perde)),
    quer.length ? comPrefixo('Quer: ', juntar(quer)) : ''
  ].filter(Boolean).slice(0, LIMITES_PAINEL.itens);

  const ficha = [
    ['Empresa', texto(negocio.nome)],
    ['Segmento', texto(negocio.segmento)],
    ['Cidade', texto(negocio.cidade)],
    ['O que quer resolver', querResolver],
    ['Procura', rotuloDe(FORMATO, projeto.formato)],
    ['Prazo', projeto.urgencia === true ? 'Curto' : '']
  ].filter(([, valor]) => valor).slice(0, LIMITES_PAINEL.ficha).map(([rotulo, valor]) => ({ rotulo, valor }));

  const painel = {};
  if (anotamos.length) painel.anotamos = anotamos;
  if (ficha.length) painel.ficha = ficha;
  return Object.keys(painel).length ? painel : null;
}
