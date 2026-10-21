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
  const briefing = JSON.parse(txt.split('<briefing>\n')[1].split('\n</briefing>')[0]);   /* (o delimitador de gerador.mjs) */
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
