/* ==========================================================================
   O PAINEL DA CONVERSA (peças visuais do Zero, fatia 1): "o que já anotamos", a ficha do pedido e os três quadros do
   caso. Tudo é DERIVADO do briefing por código, a cada leitura do estado: nenhum token novo, nada gravado no banco.

   O briefing é o que a PESSOA contou, resumido pelo modelo e já limpo por limparAtualizacao (comprimento, sem < >).
   Aqui só se reordena e se rotula: nada é inventado, sem número de resultado nem prova. O esquema é FECHADO: chaves
   conhecidas, strings curtas, nenhum HTML; campo vazio some; sem nada para mostrar, devolve null. A tela monta o DOM por
   textContent e valida de novo. O radar "como lemos o seu caso" fica para a fatia 2 (precisa de decisão sobre os eixos).
   ========================================================================== */
import { limparTexto } from './briefing.mjs';

export const LIMITES_PAINEL = Object.freeze({ itens: 5, ficha: 6, texto: 110 });

/* rótulos públicos: o nome do formato sob medida fica neutro até a checagem do nome no INPI */
const FORMATO = Object.freeze({ landing_page: 'Site de uma página', institucional: 'Site com várias páginas', sob_medida: 'Site sob medida', loja_plataforma: 'Loja virtual' });
const OBJETIVO = Object.freeze({ gerar_leads: 'Receber pedidos de orçamento', apresentar_empresa: 'Apresentar a empresa', vender: 'Vender pela internet', agendamentos: 'Receber agendamentos', autoridade: 'Ser visto como referência', captar_contatos: 'Juntar contatos', lancar_produto: 'Lançar um produto' });
const FUNCIONALIDADE = Object.freeze({ whatsapp: 'botão de WhatsApp', formulario: 'formulário de contato', agendamento: 'agendamento', mapa: 'mapa', blog: 'blog', integracao: 'integração com outro sistema', ia: 'atendente de IA', area_restrita: 'área restrita', automacao: 'automação', catalogo: 'catálogo', loja: 'loja virtual', idioma: 'mais de um idioma', galeria: 'galeria de fotos', depoimentos: 'depoimentos' });

const texto = v => (typeof v === 'string' ? limparTexto(v, LIMITES_PAINEL.texto) || '' : '');
const rotulos = (ids, mapa, max) => (Array.isArray(ids) ? ids.map(i => mapa[i]).filter(Boolean).slice(0, max) : []);
const juntar = lista => lista.filter(Boolean).join(', ');

export function montarPainel(briefing) {
  const b = briefing && typeof briefing === 'object' && !Array.isArray(briefing) ? briefing : {};
  const negocio = b.negocio || {}, situacao = b.situacao_atual || {}, projeto = b.projeto || {};
  const objetivos = rotulos(b.objetivos, OBJETIVO, 2);
  const querResolver = texto(b.objetivo_detalhe) || juntar(objetivos);
  const onde = [texto(negocio.segmento), texto(negocio.cidade)].filter(Boolean);
  const cenario = texto(negocio.descricao) || (onde.length ? onde.join(' em ') : '');
  const trava = texto(situacao.o_que_se_perde);
  const destino = querResolver;

  const anotamos = [
    cenario,
    destino,
    situacao.como_chegam ? 'Clientes chegam por: ' + texto(situacao.como_chegam) : '',
    trava ? 'O que se perde hoje: ' + trava : '',
    rotulos(b.funcionalidades, FUNCIONALIDADE, 3).length ? 'Quer: ' + juntar(rotulos(b.funcionalidades, FUNCIONALIDADE, 3)) : ''
  ].map(s => texto(s)).filter(Boolean).slice(0, LIMITES_PAINEL.itens);

  const ficha = [
    ['Empresa', texto(negocio.nome)],
    ['Segmento', texto(negocio.segmento)],
    ['Cidade', texto(negocio.cidade)],
    ['O que quer resolver', querResolver],
    ['Procura', FORMATO[projeto.formato] || ''],
    ['Prazo', projeto.urgencia === true ? 'Curto' : '']
  ].filter(([, valor]) => valor).slice(0, LIMITES_PAINEL.ficha).map(([rotulo, valor]) => ({ rotulo, valor }));

  const caso = Object.fromEntries([['cenario', cenario], ['trava', trava], ['destino', destino]].filter(([, v]) => v));

  const painel = {};
  if (anotamos.length) painel.anotamos = anotamos;
  if (ficha.length) painel.ficha = ficha;
  if (Object.keys(caso).length) painel.caso = caso;
  return Object.keys(painel).length ? painel : null;
}
