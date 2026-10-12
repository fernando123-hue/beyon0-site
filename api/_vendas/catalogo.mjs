/* ==========================================================================
   O CATÁLOGO PÚBLICO da tabela ATIVA (spec §3 e §7): o que a tela mostra no
   "Quer ajustar?" e nos formatos vizinhos. Nada interno sai (prioridade,
   prazo por item, piso, limites, descontos). As frases são texto de tela,
   revisado no PR 4 (linguagem); sem "sob medida".
   ========================================================================== */
export const FRASES = {
  pagina_extra: 'Mais uma página além das que vêm no pacote.',
  textos: 'Eu escrevo os textos de cada página a partir do que você me contar.',
  imagens: 'Eu escolho as fotos e imagens que combinam com o seu negócio.',
  formulario_avancado: 'Formulário em etapas ou com envio de arquivos.',
  agendamento: 'O cliente escolhe o dia e o horário pelo site.',
  blog: 'Uma área para publicar notícias e artigos.',
  catalogo: 'Os seus produtos com foto, descrição e preço, sem venda online.',
  integracao: 'Os pedidos do site caem direto na sua planilha ou no seu sistema.',
  idioma: 'O site também em outro idioma.',
  produtos_lote_25: 'Eu cadastro mais 25 produtos na loja.',
  pagamento_extra: 'Mais uma forma de pagamento na loja.',
  frete_transportadora: 'Frete calculado por transportadora.',
  integracao_erp: 'A loja ligada ao seu sistema de nota fiscal.',
  marketplace: 'A loja ligada ao Mercado Livre ou à Shopee.',
  migracao_loja: 'Eu trago os produtos da sua loja atual.',
  loja_virtual: 'Loja feita do zero, em código próprio.',
  area_restrita: 'Uma área com login para associados, alunos ou clientes.',
  area_tela_extra: 'Mais uma tela dentro da área com login.',
  area_perfil_extra: 'Mais um tipo de acesso, como associado e diretoria.',
  area_cobranca_recorrente: 'Cobrança de mensalidade ou anuidade pela área com login.',
  area_documentos: 'Documentos e certificados para cada pessoa da área com login.',
  area_importar_usuarios: 'Eu importo a sua lista de pessoas para a área com login.',
  sistema_sob_medida: 'Um sistema ou painel feito para o seu caso.'
};
/* nomes de tela que trocam o nome da tabela (a tabela é do dono e não se mexe; a tela não diz "sob medida") */
const NOMES = {
  sistema_sob_medida: 'Sistema ou painel para o seu caso'
};
/* o nome que a tela mostra para uma chave da tabela (também na lista do "fale comigo" do simular) */
export const nomeDeTela = (chave, nome) => (Object.hasOwn(NOMES, chave) ? NOMES[chave] : nome);
/* extras que valem para qualquer ramo, e os que valem só para certos ramos */
const SEMPRE = ['pagina_extra', 'textos', 'imagens', 'formulario_avancado', 'idioma'];
const POR_RAMO = { agendamento: ['saude', 'beleza', 'servicos', 'educacao'], catalogo: ['comercio', 'alimentacao'], blog: ['saude', 'educacao', 'associacao', 'servicos'], integracao: ['servicos', 'comercio', 'associacao'] };

/* um extra como a tela o vê: sem prioridade nem prazo por item */
function extra(chave, def) {
  return { chave, nome: nomeDeTela(chave, def.nome), frase: FRASES[chave] || def.nome, valor: def.fora_do_automatico ? null : def.valor, max: def.fora_do_automatico ? null : def.max,
    requer: Array.isArray(def.requer) ? def.requer : null, fale_comigo: def.fora_do_automatico === true };
}

export function catalogoPublico(regras, { formato, ramo }) {
  const formatos = Object.entries(regras.formatos || {}).map(([chave, f]) => ({ chave, nome: nomeDeTela(chave, f.nome), a_partir_de: f.base, paginas_incluidas: f.paginas_incluidas, inclui: f.inclui || [] }));
  const principais = [], mais = [];
  for (const [chave, def] of Object.entries(regras.adicionais || {})) {
    if (Array.isArray(def.requer) && def.requer.includes('loja_plataforma') && formato !== 'loja_plataforma') continue;   /* (os da loja só com a loja) */
    const doRamo = SEMPRE.includes(chave) || (POR_RAMO[chave] || []).includes(ramo) || (formato === 'loja_plataforma' && Array.isArray(def.requer) && def.requer.includes('loja_plataforma'));
    (doRamo && !def.fora_do_automatico ? principais : mais).push(extra(chave, def));
  }
  const u = regras.multiplicadores?.urgencia;
  return { formatos, extras: { principais, mais }, urgencia: u ? { acrescimo_percentual: Math.round((u.fator - 1) * 100), prazo_fator: u.prazo_fator } : null };
}

const OBJETIVO_BRIEFING = { pedidos_whatsapp: 'gerar_leads', agendamentos: 'agendamentos', vender_online: 'vender', apresentar: 'apresentar_empresa', campanha: 'lancar_produto' };
const NOME_RAMO = { servicos: 'serviços', saude: 'saúde', beleza: 'beleza', alimentacao: 'alimentação', comercio: 'comércio', educacao: 'educação', associacao: 'associação', outro: 'outro' };
const POSSE = { tenho: 'tem', parte: 'parcial', nao: 'nao' };

/* as respostas viram o começo do briefing (o mesmo formato que o consultor monta), para a fila de modelos */
export function respostasParaBriefing(r, formato) {
  /* entrada ruim não quebra: objetivos que não é lista vira vazio; ramo/material desconhecido some do briefing */
  const lista = Array.isArray(r.objetivos) ? r.objetivos : [];
  const objetivos = [...new Set(lista.map(o => OBJETIVO_BRIEFING[o] || 'outro'))];
  const segmento = r.ramo === 'outro' && r.outro ? r.outro : NOME_RAMO[r.ramo];
  const negocio = { ...(segmento ? { segmento } : {}), ...(r.cidade ? { cidade: r.cidade } : {}) };
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
