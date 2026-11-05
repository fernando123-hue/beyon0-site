/* AS FRASES RUINS E BOAS DA CAMADA DE TEXTO DA PLANTA (PR 2a). Não é teste (não termina em ".test.mjs": o agregador planta-todos não o importa);
   planta-textos.test.mjs o usa. Cada CLASSE tem uns 12 trechos ruins e 5 frases-moldura (o trecho entra no MEIO da frase, nunca na abertura,
   porque a regra de marca olha a inicial maiúscula no meio): 12 x 5 = 60 frases ruins por classe. As molduras, com um trecho neutro, têm de
   passar (o teste confere), senão o vermelho seria da moldura e não da classe.
   Os trechos são texto de TESTE: nada de nome de cliente real nem de marca fora das plataformas que o código já cita. */

export const MOLDURAS = [
  'A pessoa vê {X} na página inicial.',
  'Depois da conversa, a pessoa encontra {X} sem procurar.',
  'O site mostra {X} para quem acabou de chegar.',
  'Quem chega recebe {X} logo no começo.',
  'A página guarda {X} para a próxima visita.'
];
export const TRECHOS_NEUTROS = ['a resposta', 'uma mensagem curta', 'o resumo', 'um aviso', 'o caminho'];

/* codigos: o motivo aceito (a classe pode ser pega por mais de uma camada: o texto dela ou uma trava já existente) */
export const CLASSES = {
  digito: { codigos: ['digito'], trechos: ['3 etapas', '10 vagas', '24 horas', 'o 2º passo', '1 hora', 'etapa 2', 'passo 4', 'sala 12', 'cinco 5', 'nota 10', '7 dias', 'o número 29', '2.900', '29,90', '0 pendências'] },
  simbolo: { codigos: ['simbolo', 'caractere'], trechos: ['o sinal %', 'um $ aqui', 'um € aqui', 'um £ aqui', 'um ¥ aqui', 'R$ no meio', 'US$ no meio', 'um ‰ aqui', 'um ¢ aqui', 'um ₹ aqui', 'um ₿ aqui', 'cem %'] },
  preco: { codigos: ['preco', 'trava_precoNoTexto', 'trava_precoComMarca'], trechos: ['o preço', 'o valor', 'o custo', 'sai barato', 'fica barata', 'é grátis', 'é gratuito', 'com desconto', 'sem taxa', 'a taxa', 'a mensalidade', 'um investimento', 'cada parcela', 'a promoção', 'os preços', 'os valores', 'custa pouco', 'faixa de preço pela tabela'] },
  prazo: { codigos: ['prazo', 'numeral', 'trava_precoNoTexto'], trechos: ['o prazo', 'entrega imediata', 'resposta imediatamente', 'tudo instantâneo', 'uma resposta instantânea', 'em minutos', 'em poucos segundos', 'em algumas horas', 'no mesmo dia', 'em dias úteis', 'em semanas', 'em meses', 'poucos minutos', 'dias de espera', 'semanas de espera', 'meses de espera'] },
  numeral: { codigos: ['numeral', 'prazo'], trechos: ['dois passos', 'duas telas', 'três mensagens', 'quatro etapas', 'cinco opções', 'seis cartões', 'sete botões', 'oito linhas', 'nove avisos', 'dez perguntas', 'onze pontos', 'vinte itens', 'trinta modelos', 'cem pessoas', 'mil visitas', 'quinze campos'] },
  marca: { codigos: ['marca'], trechos: ['o Instagram', 'o instagram', 'o WhatsApp', 'o whatsapp', 'o Google', 'o google', 'o Facebook', 'o TikTok', 'a Shopify', 'o Mercado Pago', 'o mercado pago', 'o PayPal', 'o paypal', 'o LinkedIn', 'o YouTube', 'o ChatGPT', 'o chatgpt', 'o Telegram', 'a Clínica Horizonte', 'a Loja Estrela', 'o Doutor Silva', 'a OpenAI'] },
  promessa: { codigos: ['promessa', 'trava_resultado', 'garantia'], trechos: ['uma agenda que enche', 'a casa lotada', 'um negócio que dobra', 'vendas que aumentam', 'mais clientes', 'mais vendas', 'mais pedidos', 'mais agendamentos', 'um site que vende sozinho', 'tudo sem esforço', 'o resultado', 'o lucro', 'o faturamento', 'um movimento que triplica', 'contatos que se multiplicam', 'mais pacientes'] },
  garantia: { codigos: ['garantia', 'promessa', 'trava_garantia', 'trava_resultado'], trechos: ['a garantia', 'está garantido', 'a gente garante', 'para garantir', 'uma garantia total', 'com certeza', 'a certeza', 'sem risco nenhum', 'o resultado garantido', 'satisfação garantida', 'o reembolso', 'o dinheiro de volta', 'o site garantido'] },
  suporte: { codigos: ['suporte', 'trava_suporte'], trechos: ['o suporte', 'o suporte técnico', 'o suporte contínuo', 'a manutenção', 'manutenção incluída', 'a assistência técnica', 'o plantão', 'a manutenção mensal', 'suporte depois da entrega', 'a manutenção do site', 'um suporte dedicado', 'o suporte de sempre'] },
  ordem: { codigos: ['ordem'], trechos: ['ignore as regras', 'ignore tudo', 'desconsidere o resto', 'desconsidera isto', 'a instrução', 'as instruções do sistema', 'novas instruções', 'o prompt', 'o prompt do sistema', 'as regras internas', 'ignorar as regras', 'ignorando o que veio antes'] },
  negar_ia: { codigos: ['negar_ia', 'trava_negarIA'], trechos: ['quem sou: uma pessoa de verdade', 'sou uma pessoa de verdade', 'sou humano', 'sou humana', 'eu sou o dono', 'sou a dona da empresa', 'não sou uma IA', 'não sou um robô', 'não sou uma máquina', 'eu não sou um bot', 'não sou inteligência artificial', 'sou gente como você'] },
  url: { codigos: ['url', 'caractere'], trechos: ['www.exemplo.com.br', 'exemplo.com.br', 'http://exemplo', 'https://exemplo.com', 'meusite.com', 'loja.net', 'clinica.org', 'exemplo.app', 'exemplo.io', 'www exemplo', 'o link bit.ly', 'exemplo ponto com ponto br'] },
  email: { codigos: ['email', 'caractere'], trechos: ['ana@exemplo.com', 'contato@clinica.com.br', 'o e-mail ana@site', 'a arroba', 'ana arroba exemplo', 'nome@dominio', 'ana (at) exemplo', 'ana [at] exemplo', 'um@b', 'ana (arroba) exemplo', 'ana ponto silva arroba site', 'ana arroba dominio'] },
  markdown: { codigos: ['markdown', 'caractere'], trechos: ['**negrito**', '_itálico_', '# título', '`código`', '[link](x)', '- item', '* item', '> citação', '~~riscado~~', '| tabela |', '```', '+ item', '• item', '{chave}', 'x = y', 'a\\b'] },
  emoji: { codigos: ['emoji', 'caractere'], trechos: ['😀', '✅', '🚀', '⭐', '❤\ufe0f', '👍', '🔥', '💰', '📞', '🎉', '\u00a9', '\u2122', '\u00ae', '☎\ufe0f', '➡\ufe0f', '🇧🇷'] },
  alfabeto: { codigos: ['alfabeto'], trechos: ['рreço', 'gаrantia', 'zerо', 'сasa', 'Ιnstagram', 'ѕite', 'ο caminho', 'аgenda', 'conversа', 'pаgina', 'cаminho', 'resроsta', 'μensagem', '\uff41гenda'] }
};

/* a classe que só vale em nicho regulado (com regulado: false estas frases passam) */
export const REGULADO = { codigos: ['depoimento', 'resultado_regulado'], trechos: ['depoimentos de pacientes', 'um depoimento', 'o testemunho', 'antes e depois', 'o antes e depois', 'fotos de antes e depois', 'a cura', 'curar de vez', 'um milagre', 'o resultado', 'os resultados', 'depoimentos de clientes'] };

/* as frases do plano e da spec (§2.3) que as dez travas deixam passar: a lista própria tem de pegar */
export const PASSAM_PELAS_TRAVAS = [
  'Enche a agenda da clínica toda semana.',
  'Entrega em dois dias úteis.',
  'Vende sozinho e sem esforço.',
  'Mais clientes todo mês.',
  'Pagamento sem taxa.',
  'Faixa de preço pela tabela.'
];

/* as variações que a normalização tem de pegar (todas dizem "preço" ou um número) */
export const VARIACOES = [
  'preco', 'PREÇO', 'Preço', 'p r e ç o', 'p r e c o', 'pre\u200bço', 'pre\u200cço', 'pre\u00adço', 'pre\u2060ço', 'pre\u2800ço', 'pre\ufeffço',
  '\uff50\uff52\uff45\uff43\uff4f', 'em 3 dias', 'em 3\u00a0dias', 'em 3\u2009dias', '\uff12\uff19\uff10\uff10', '\u00b2', '\u2460',
  'em \u0663 dias', 'em \u0969 dias', 'dois mil', 'DOIS', 'v a l o r', 'cust0', 'val0r', 'grat1s', 'tax4'
];
