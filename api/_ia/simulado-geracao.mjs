/* ==========================================================================
   Dublê determinístico da GERAÇÃO de direções (testes e servidor local).
   Monta uma direção coerente a partir do briefing, com paleta e ordem de
   seções diferentes por estratégia. Não é a qualidade do Opus: serve para o
   fluxo inteiro (prévias, comparação, escolha) funcionar sem custo.
   Segue a regra de zero dado inventado: prova social vira espaço reservado.
   ========================================================================== */
const PALETAS = {
  conversao: { fundo: '#FFFFFF', superficie: '#F2F6F7', texto: '#14202B', texto_suave: '#4A5A66', destaque: '#0B7A75', destaque_texto: '#FFFFFF' },
  autoridade: { fundo: '#0F1419', superficie: '#182028', texto: '#F2F2EE', texto_suave: '#AEB7BF', destaque: '#C9A45C', destaque_texto: '#111111' },
  experiencia: { fundo: '#FBF7F2', superficie: '#F1E8DD', texto: '#2B1E16', texto_suave: '#6E5A4C', destaque: '#D2552F', destaque_texto: '#FFFFFF' }
};
const ORDEM = {
  conversao: ['hero', 'servicos', 'diferenciais', 'depoimentos', 'processo', 'faq', 'cta', 'contato'],
  autoridade: ['hero', 'sobre', 'diferenciais', 'numeros', 'servicos', 'depoimentos', 'equipe', 'contato'],
  experiencia: ['hero', 'destaque', 'sobre', 'processo', 'galeria', 'servicos', 'depoimentos', 'cta']
};

export function gerarSimulado({ mensagens }) {
  const txt = mensagens[0].content;
  const briefing = JSON.parse(txt.split('BRIEFING DO CLIENTE:\n')[1].split('\n\n')[0]);
  const estrategia = /AUTORIDADE/.test(txt) ? 'autoridade' : /EXPERIÊNCIA/.test(txt) ? 'experiencia' : 'conversao';
  const neg = briefing.negocio || {};
  const marca = neg.nome || (neg.segmento ? 'Sua ' + neg.segmento : 'Sua empresa');
  const servicos = (briefing.servicos?.length ? briefing.servicos : ['Serviço principal', 'Segundo serviço', 'Terceiro serviço']).slice(0, 4);
  const conteudo = {
    hero: { variante: estrategia === 'experiencia' ? 'split' : 'centro', rotulo: neg.cidade || '', titulo: estrategia === 'autoridade' ? marca + ': referência em ' + (neg.segmento || 'seu setor') : 'O cuidado que você procura, sem complicação', subtitulo: neg.descricao ? neg.descricao.slice(0, 180) : 'Atendimento claro do primeiro contato ao resultado.', cta: estrategia === 'conversao' ? 'Agendar agora' : 'Conhecer' },
    servicos: { variante: 'cartoes', titulo: 'O que fazemos', itens: servicos.map(s => ({ titulo: s, texto: 'Como ' + s.toLowerCase() + ' resolve o problema do seu cliente.' })) },
    diferenciais: { variante: 'grade', titulo: 'Por que escolher a ' + marca, itens: [{ titulo: 'Atendimento próximo', texto: 'Você fala com quem resolve.' }, { titulo: 'Clareza', texto: 'Tudo explicado antes de começar.' }, { titulo: 'Cuidado', texto: 'Detalhe em cada etapa.' }] },
    depoimentos: { variante: 'faixa', titulo: 'Quem já passou por aqui', itens: [{ titulo: '[Nome do cliente]', texto: '[Depoimento real de um cliente sobre o atendimento]' }] },
    processo: { variante: 'linha_do_tempo', titulo: 'Como funciona', itens: [{ titulo: 'Contato', texto: 'Você conta o que precisa.' }, { titulo: 'Avaliação', texto: 'Entendemos o seu caso.' }, { titulo: 'Atendimento', texto: 'Cuidamos de tudo.' }] },
    faq: { variante: 'lista', titulo: 'Perguntas frequentes', itens: [{ titulo: 'Como agendar?', texto: 'Pelo botão desta página ou pelo WhatsApp.' }, { titulo: 'Onde fica?', texto: neg.cidade ? 'Em ' + neg.cidade + '.' : '[Endereço]' }] },
    cta: { variante: 'faixa', titulo: 'Vamos conversar?', texto: 'Resposta rápida pelo WhatsApp.', cta: 'Falar agora' },
    contato: { variante: 'split', titulo: 'Fale com a ' + marca, texto: 'WhatsApp, formulário e endereço.', cta: 'Enviar mensagem' },
    sobre: { variante: 'split', titulo: 'Sobre a ' + marca, texto: neg.descricao ? neg.descricao.slice(0, 300) : '[História da empresa]' },
    numeros: { variante: 'grade', titulo: 'Em números', itens: [{ titulo: '[Anos de experiência]', texto: '' }, { titulo: '[Clientes atendidos]', texto: '' }] },
    equipe: { variante: 'cartoes', titulo: 'Quem cuida de você', itens: [{ titulo: '[Nome do profissional]', texto: '[Formação e especialidade]' }] },
    destaque: { variante: 'faixa', titulo: 'Uma experiência diferente desde a chegada', texto: 'Cada detalhe pensado para você.' },
    galeria: { variante: 'grade', titulo: 'Conheça o espaço', itens: [{ titulo: '[Foto do ambiente]', texto: '' }, { titulo: '[Foto da equipe]', texto: '' }] }
  };
  const secoes = ORDEM[estrategia].map(tipo => ({ tipo, variante: 'centro', rotulo: '', titulo: '', subtitulo: '', texto: '', itens: [], cta: '', ...conteudo[tipo] }));
  const json = {
    nome_conceito: { conversao: 'Clareza que converte', autoridade: 'Presença de referência', experiencia: 'Uma história para viver' }[estrategia],
    resumo: 'Direção de ' + estrategia + ' para ' + marca + '.',
    identidade: { paleta: PALETAS[estrategia], tipografia: { titulos: estrategia === 'autoridade' ? 'serif_classica' : estrategia === 'experiencia' ? 'serif_moderna' : 'sans_geometrica', texto: 'sans_humanista' }, estilo: { cantos: estrategia === 'autoridade' ? 'retos' : 'suaves', densidade: estrategia === 'autoridade' ? 'arejada' : 'equilibrada', tema: estrategia === 'autoridade' ? 'escuro' : 'claro' } },
    navegacao: { marca, itens: ['Início', 'Serviços', 'Sobre', 'Contato'], cta: 'Agendar' },
    secoes,
    rodape: { texto: marca + (neg.cidade ? ' · ' + neg.cidade : '') }
  };
  return { texto: JSON.stringify(json), json, chamadas: [], conteudo: [], parada: 'fim', modelo: 'simulado', uso: {}, custo_usd: 0 };
}

/* Dublê da TRADUÇÃO de pedidos de alteração (papel 'extracao'): frases comuns → operações */
const NUM = { primeira: 1, '1': 1, segunda: 2, '2': 2, terceira: 3, '3': 3 };
const SECAO = { 'depoimentos': 'depoimentos', 'serviços': 'servicos', 'servicos': 'servicos', 'faq': 'faq', 'perguntas': 'faq', 'contato': 'contato', 'sobre': 'sobre', 'processo': 'processo', 'equipe': 'equipe', 'galeria': 'galeria', 'diferenciais': 'diferenciais' };
const vazio = { secao: '', referencia: '', campo: '', valor: '', direcao: 0, descricao: '' };
export function extrairSimulado({ mensagens }) {
  const pedido = mensagens[0].content.split('PEDIDO DO CLIENTE: ')[1] || '';
  const mudancas = [];
  const pal = pedido.match(/(?:cor|cores|paleta)\s+da\s+(primeira|segunda|terceira|[123])/i);
  if (pal) mudancas.push({ ...vazio, tipo: 'visual', operacao: 'usar_paleta_de', direcao: NUM[pal[1].toLowerCase()] });
  const mov = pedido.match(/(depoimentos|servi[çc]os|faq|perguntas|contato|sobre|processo|equipe|galeria|diferenciais)\s+(antes|depois)\s+d[oae]s?\s+(depoimentos|servi[çc]os|faq|perguntas|contato|sobre|processo|equipe|galeria|diferenciais)/i);
  if (mov) mudancas.push({ ...vazio, tipo: 'estrutura', operacao: mov[2].toLowerCase() === 'antes' ? 'mover_antes_de' : 'mover_depois_de', secao: SECAO[mov[1].toLowerCase().replace('ç', 'ç')] || SECAO[mov[1].toLowerCase()], referencia: SECAO[mov[3].toLowerCase()] });
  const rem = pedido.match(/(?:tira|tirar|remove|remover)\s+(?:a\s+|o\s+|as\s+|os\s+)?(faq|perguntas|galeria|equipe|depoimentos)/i);
  if (rem) mudancas.push({ ...vazio, tipo: 'estrutura', operacao: 'remover_secao', secao: SECAO[rem[1].toLowerCase()] });
  const tit = pedido.match(/t[íi]tulo(?: principal)?\s*(?:para|:)\s*"?([^".]{3,80})"?/i);
  if (tit) mudancas.push({ ...vazio, tipo: 'conteudo', operacao: 'trocar_texto', secao: 'hero', campo: 'titulo', valor: tit[1].trim() });
  if (/\bblog\b/i.test(pedido)) mudancas.push({ ...vazio, tipo: 'escopo', operacao: 'adicional', campo: 'blog', valor: '1' });
  if (/app|aplicativo/i.test(pedido)) mudancas.push({ ...vazio, tipo: 'nao_suportado', operacao: 'outro', descricao: 'aplicativo de celular' });
  const json = { mudancas, resposta: mudancas.length ? 'Certo, vou aplicar essas mudanças.' : 'Não identifiquei uma mudança. Pode descrever de outro jeito?' };
  return { texto: JSON.stringify(json), json, chamadas: [], conteudo: [], parada: 'fim', modelo: 'simulado', uso: {}, custo_usd: 0 };
}
