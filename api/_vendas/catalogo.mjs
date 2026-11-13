/* ==========================================================================
   O CATÁLOGO PÚBLICO da tabela ATIVA (spec §3 e §7): o que a tela mostra no
   "Quer ajustar?" e nos formatos vizinhos. Nada interno sai (prioridade,
   prazo por item, piso, limites, descontos). As frases são texto de tela,
   revisado no PR 4 (linguagem); sem "sob medida".
   ========================================================================== */
import { LANDING_MAX_PAGINAS, listaDoPacote, FORMATOS } from './precos.mjs';
import { redigir } from './seguranca.mjs';

export const FRASES = {
  pagina_extra: 'Mais uma página além das que vêm no pacote.',
  visual_exclusivo: 'Nós desenhamos o visual do seu site do zero, só para a sua marca, sem partir de um modelo.',
  textos: 'Nós escrevemos os textos de cada página a partir do que você nos contar.',
  imagens: 'Nós escolhemos as fotos e imagens que combinam com o seu negócio.',
  formulario_avancado: 'Formulário em etapas ou com envio de arquivos.',
  agendamento: 'O cliente escolhe o dia e o horário pelo site.',
  blog: 'Uma área para publicar notícias e artigos.',
  catalogo: 'Os seus produtos com foto, descrição e preço, sem venda online.',
  integracao: 'Os pedidos do site caem direto na sua planilha ou no seu sistema.',
  idioma: 'O site também em outro idioma.',
  interacao_leve: 'Um efeito que dá vida a uma seção: entrada suave, rolagem ou o que acontece quando passa o mouse.',
  interacao_assinatura: 'Uma animação interativa só sua, como as do site da Beyon Zero.',
  atendente_ia_essencial: 'Um atendente de IA no seu site (em preparo, ainda não dá para contratar).',
  atendente_ia_profissional: 'Um atendente de IA no seu site, plano Profissional (em preparo).',
  atendente_ia_avancado: 'Um atendente de IA no seu site, plano Avançado (em preparo).',
  produtos_lote_25: 'Nós cadastramos mais 25 produtos na loja.',
  pagamento_extra: 'Mais uma forma de pagamento na loja.',
  frete_transportadora: 'Frete calculado por transportadora.',
  integracao_erp: 'A loja ligada ao seu sistema de nota fiscal.',
  marketplace: 'A loja ligada ao Mercado Livre ou à Shopee.',
  migracao_loja: 'Nós trazemos os produtos da sua loja atual.',
  loja_virtual: 'Loja feita do zero, em código próprio.',
  area_restrita: 'Uma área com login para associados, alunos ou clientes.',
  area_tela_extra: 'Mais uma tela dentro da área com login.',
  area_perfil_extra: 'Mais um tipo de acesso, como associado e diretoria.',
  area_cobranca_recorrente: 'Cobrança de mensalidade ou anuidade pela área com login.',
  area_documentos: 'Documentos e certificados para cada pessoa da área com login.',
  area_importar_usuarios: 'Nós importamos a sua lista de pessoas para a área com login.',
  sistema_sob_medida: 'Um sistema ou painel feito para o seu caso.'
};
/* nomes de tela que trocam o nome da tabela (a tabela é do dono e não se mexe; a tela não diz "sob medida") */
const NOMES = {
  sistema_sob_medida: 'Sistema ou painel para o seu caso'
};
/* o nome que a tela mostra para uma chave da tabela (também na lista do "fale comigo" do simular) */
export const nomeDeTela = (chave, nome) => (Object.hasOwn(NOMES, chave) ? NOMES[chave] : nome);
/* extras que valem para qualquer ramo, e os que valem só para certos ramos */
const SEMPRE = ['pagina_extra', 'textos', 'imagens', 'formulario_avancado', 'idioma', 'interacao_leve', 'interacao_assinatura'];
const POR_RAMO = { agendamento: ['saude', 'beleza', 'servicos', 'educacao'], catalogo: ['comercio', 'alimentacao'], blog: ['saude', 'educacao', 'associacao', 'servicos'], integracao: ['servicos', 'comercio', 'associacao'] };

/* a landing vai até 3 páginas: o motor recusa o que passa disso (precos.mjs) e o catálogo da landing nem oferece.
   Quantas páginas extras a landing aceita: as 3 menos as que já vêm no pacote (1 na tabela → 2 extras) */
export const landingMaxExtras = landing => Math.max(0, LANDING_MAX_PAGINAS - (landing?.paginas_incluidas ?? 1));

/* O CARTÃO de cada extra (dono, 2026-11-10: a lista era "um amontoado de letras"): [nome curto, o benefício numa frase, o
   grupo da lista completa]. O nome da tabela (o recibo, o painel) não muda; a tela de escolher usa este. Grupos na ordem da lista */
export const GRUPOS = ['conteudo', 'negocio', 'loja', 'visual', 'alcance', 'area', 'sistema'];
const CARTAO = {
  textos: ['Nós escrevemos os textos', 'Você não precisa escrever nada.', 'conteudo'],
  imagens: ['Nós escolhemos as imagens', 'Fotos que combinam com o seu negócio.', 'conteudo'],
  agendamento: ['Agendamento pelo site', 'O cliente marca o horário sozinho, a qualquer hora.', 'negocio'],
  catalogo: ['Catálogo de produtos', 'Seus produtos com foto e preço, sem venda online.', 'negocio'],
  blog: ['Blog', 'Uma área para publicar notícias e artigos.', 'negocio'],
  integracao: ['Pedidos na sua planilha', 'Os pedidos do site caem direto no seu sistema.', 'negocio'],
  formulario_avancado: ['Formulário com etapas', 'Em etapas ou com envio de arquivos.', 'negocio'],
  produtos_lote_25: ['Mais 25 produtos cadastrados', 'Nós cadastramos mais 25 produtos na loja.', 'loja'],
  pagamento_extra: ['Outra forma de pagamento', 'Mais um jeito de o cliente pagar.', 'loja'],
  frete_transportadora: ['Frete por transportadora', 'O frete calculado na hora da compra.', 'loja'],
  integracao_erp: ['Ligação com a nota fiscal', 'A loja ligada ao seu sistema de nota fiscal.', 'loja'],
  marketplace: ['Mercado Livre e Shopee', 'A loja ligada ao Mercado Livre ou à Shopee.', 'loja'],
  migracao_loja: ['Trazer a loja atual', 'Nós trazemos os produtos da sua loja atual.', 'loja'],
  loja_virtual: ['Loja em código próprio', 'Loja feita do zero, em código próprio.', 'loja'],
  visual_exclusivo: ['Visual exclusivo', 'Desenhado do zero, só para a sua marca.', 'visual'],
  interacao_leve: ['Animações no site', 'Entrada suave e movimento ao rolar a página.', 'visual'],
  interacao_assinatura: ['Animação de assinatura', 'Uma animação interativa só sua.', 'visual'],
  idioma: ['Outro idioma', 'O site também em outro idioma.', 'alcance'],
  pagina_extra: ['Página extra', 'Mais uma página além das que vêm no pacote.', 'alcance'],
  area_restrita: ['Área com login', 'Para associados, alunos ou clientes.', 'area'],
  area_tela_extra: ['Tela extra na área', 'Mais uma tela dentro da área com login.', 'area'],
  area_perfil_extra: ['Outro tipo de acesso', 'Como associado e diretoria.', 'area'],
  area_cobranca_recorrente: ['Mensalidade pela área', 'Cobrança de mensalidade ou anuidade.', 'area'],
  area_documentos: ['Documentos por pessoa', 'Documentos e certificados de cada pessoa.', 'area'],
  area_importar_usuarios: ['Importar a sua lista', 'Nós importamos a sua lista de pessoas.', 'area'],
  sistema_sob_medida: ['Sistema para o seu caso', 'Um sistema ou painel feito para você.', 'sistema']
};
/* as SUGESTÕES do painel (no máximo 3): pelo formato e pelo ramo, nunca por "mais vendido". Depois do que é do ramo, conteúdo e movimento */
const SUGESTAO_RAMO = { saude: ['agendamento'], beleza: ['agendamento'], servicos: ['agendamento'], educacao: ['agendamento'], comercio: ['catalogo'], alimentacao: ['catalogo'], associacao: ['blog'] };
const SUGESTAO_LOJA = ['frete_transportadora', 'pagamento_extra'];
const SUGESTAO_SEMPRE = ['textos', 'imagens', 'interacao_leve'];
export const MAX_SUGESTOES = 3;

/* um extra como a tela o vê: sem prioridade nem prazo por item */
function extra(chave, def) {
  const nome = nomeDeTela(chave, def.nome), frase = FRASES[chave] || def.nome, c = CARTAO[chave];
  return { chave, nome, frase, valor: def.fora_do_automatico ? null : def.valor, max: def.fora_do_automatico ? null : def.max,
    requer: Array.isArray(def.requer) ? def.requer : null, fale_comigo: def.fora_do_automatico === true,
    curto: c ? c[0] : nome, beneficio: c ? c[1] : frase, grupo: c ? c[2] : 'negocio', por_pagina: /por p[áa]gina/i.test(def.nome || '') };
}
function sugestoes(formato, ramo, principais) {
  const pode = new Set(principais.filter(x => x.valor != null && !x.fale_comigo).map(x => x.chave));
  /* (o ramo vem do visitante: só a chave própria, nunca "constructor" ou "__proto__" do protótipo) */
  const doRamo = typeof ramo === 'string' && Object.hasOwn(SUGESTAO_RAMO, ramo) ? SUGESTAO_RAMO[ramo] : [];
  const ordem = (formato === 'loja_plataforma' ? SUGESTAO_LOJA : doRamo).concat(SUGESTAO_SEMPRE);
  return [...new Set(ordem)].filter(k => pode.has(k)).slice(0, MAX_SUGESTOES);
}

export function catalogoPublico(regras, { formato, ramo }) {
  /* inclui = "Já vem no pacote": a mesma lista limpa que vai gravada com a estimativa (listaDoPacote), para a tela não mudar ao recarregar */
  const formatos = Object.entries(regras.formatos || {}).map(([chave, f]) => ({ chave, nome: nomeDeTela(chave, f.nome), a_partir_de: f.base, paginas_incluidas: f.paginas_incluidas, inclui: listaDoPacote(f.inclui) }));
  const principais = [], mais = [];
  for (const [chave, def] of Object.entries(regras.adicionais || {})) {
    if (def.em_preparo === true) continue;   /* (em preparo: está na tabela, mas a pessoa ainda não pode contratar; o consultor só registra o interesse) */
    /* o que só existe em certos formatos (os da loja, o visual exclusivo do institucional) só aparece neles, e neles é principal */
    const soEmFormatos = Array.isArray(def.requer) && def.requer.length > 0 && def.requer.every(r => FORMATOS.includes(r));
    if (soEmFormatos && !def.requer.includes(formato)) continue;
    const doRamo = SEMPRE.includes(chave) || (POR_RAMO[chave] || []).includes(ramo) || soEmFormatos;
    const x = extra(chave, def);
    const limitado = chave === 'pagina_extra' && formato === 'landing_page' && x.max != null ? { ...x, max: Math.min(x.max, landingMaxExtras(regras.formatos?.landing_page)) } : x;
    (doRamo && !def.fora_do_automatico ? principais : mais).push(limitado);
  }
  const u = regras.multiplicadores?.urgencia;
  return { formatos, extras: { principais, mais }, recomendados: sugestoes(formato, ramo, principais), urgencia: u ?{ acrescimo_percentual: Math.round((u.fator - 1) * 100), prazo_fator: u.prazo_fator } : null };
}

const OBJETIVO_BRIEFING = { pedidos_whatsapp: 'gerar_leads', agendamentos: 'agendamentos', vender_online: 'vender', apresentar: 'apresentar_empresa', campanha: 'lancar_produto' };
export const NOME_RAMO = { servicos: 'serviços', saude: 'saúde', beleza: 'beleza', alimentacao: 'alimentação', comercio: 'comércio', educacao: 'educação', associacao: 'associação', outro: 'outro' };
const POSSE = { tenho: 'tem', parte: 'parcial', nao: 'nao' };

/* as respostas viram o começo do briefing (o mesmo formato que o consultor monta), para a fila de modelos */
export function respostasParaBriefing(r, formato) {
  /* entrada ruim não quebra: objetivos que não é lista vira vazio; ramo/material desconhecido some do briefing */
  const lista = Array.isArray(r.objetivos) ? r.objetivos : [];
  const objetivos = [...new Set(lista.map(o => OBJETIVO_BRIEFING[o] || 'outro'))];
  /* o texto livre (outro ramo, cidade) passa por redigir(): telefone, e-mail e documento viram marcadores (privacidade) */
  const segmento = r.ramo === 'outro' && r.outro ? redigir(r.outro) : NOME_RAMO[r.ramo];
  const negocio = { ...(segmento ? { segmento } : {}), ...(r.cidade ? { cidade: redigir(r.cidade) } : {}) };
  const sabeMaterial = Boolean(POSSE[r.material]);
  /* grupo vazio não entra (o limparAtualizacao também o descartaria) */
  const b = {
    ...(Object.keys(negocio).length ? { negocio } : {}),
    ...(objetivos.length ? { objetivos } : {}),
    ...(sabeMaterial ? { conteudo: { textos: POSSE[r.material] }, identidade_visual: { tem_logo: r.material === 'tenho' } } : {}),
    projeto: { formato }
  };
  if (lista.includes('achado_google')) b.objetivo_detalhe = 'ser achado no Google';
  return b;
}

/* (orçamento como conversa, spec 2026-11-13 §6.1) as respostas TOCADAS que chegam junto da mensagem, já validadas por respostasParciais
   (api/_vendas/respostas.mjs): só o que veio entra, sem padrão nenhum, e cada campo respondido vence o que estava (é a resposta explícita
   dela). O "Outro" já chega limpo e redigido. A situação (sugestões do passo 4) vem pronta, em frases da lista fechada */
export function respostasParaBriefingParcial(d, situacao = null) {
  const b = {};
  const segmento = d.ramo === 'outro' && d.outro ? d.outro : (d.ramo ? NOME_RAMO[d.ramo] : null);
  if (segmento) b.negocio = { segmento };
  if (d.objetivos && d.objetivos.length) {
    b.objetivos = [...new Set(d.objetivos.map(o => OBJETIVO_BRIEFING[o] || 'outro'))];
    if (d.objetivos.includes('achado_google')) b.objetivo_detalhe = 'ser achado no Google';
  }
  if (POSSE[d.material]) { b.conteudo = { textos: POSSE[d.material] }; b.identidade_visual = { tem_logo: d.material === 'tenho' }; }
  if (d.site_atual) b.presenca = { site_atual: d.site_atual };
  if (situacao) b.situacao_atual = situacao;
  return b;
}
