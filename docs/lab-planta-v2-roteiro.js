/* PLANTA VIVA v2 (laboratório): o ROTEIRO de três conversas com o Zero, turno a turno. Só dados, ES5: window.BZPlantaRoteiro (e CommonJS para os
   testes). Cada turno traz a fala da pessoa, a resposta do Zero e o que o briefing passa a ter depois dele (as chaves de api/_vendas/painel.mjs;
   no site quem escreve isso é o servidor, aqui é o roteiro). O fim traz o plano que o desenhar_planta devolveria (validado por BZPlantaForma
   na carga do laboratório). Os nomes de negócio são genéricos de propósito: nada de empresa real. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZPlantaRoteiro = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var clinica = {
    rotulo: 'Clínica com agenda',
    abertura: 'Oi, eu sou o Zero. Me conta do seu negócio que eu monto o orçamento com você.',
    turnos: [
      { pessoa: 'Oi! Tenho uma clínica odontológica aqui no bairro.',
        zero: 'Me conta uma coisa: hoje, como os pacientes novos chegam até a clínica?',
        briefing: { negocio: { segmento: 'Odontologia' } } },
      { pessoa: 'A maioria acha a gente no Google e no mapa. E muita gente vem por indicação.',
        zero: 'Indicação diz muito: quem vem, gosta. E quando a pessoa chega, o que ela mais procura com vocês?',
        briefing: { situacao_atual: { como_chegam: 'Google, mapa e indicação' } } },
      { pessoa: 'Implante, clareamento e aparelho. A avaliação é o primeiro passo de tudo.',
        zero: 'Então cada tratamento merece a sua página, e todas levam para a avaliação. Hoje, onde vocês sentem que perdem paciente?',
        briefing: { negocio: { descricao: 'Implante, clareamento e aparelho; tudo começa na avaliação' } } },
      { pessoa: 'No Instagram. Perguntam preço pelo direct, a gente demora e a pessoa some.',
        zero: 'Muitas vezes a pergunta de preço esconde outra: se dói, quanto tempo leva. Dá para responder isso no próprio site. E a avaliação, como marca hoje?',
        briefing: { situacao_atual: { como_chegam: 'Google, mapa, indicação e Instagram', o_que_se_perde: 'Perguntam preço pelo direct e somem' } } },
      { pessoa: 'Pelo telefone, no horário da recepção. Queria que marcassem sozinhos.',
        zero: 'Dá para fazer: a pessoa vê os horários livres e marca a avaliação ali mesmo. A recepção só confere. Vocês querem manter o WhatsApp para quem prefere falar com alguém?',
        briefing: { objetivos: ['agendamentos'], funcionalidades: ['agendamento'] } },
      { pessoa: 'Quero. Tem paciente mais velho que só confia falando com a gente.',
        zero: 'Faz sentido. O botão fica, e a mensagem já sai com o tratamento que a pessoa estava vendo. Com isso eu já monto o seu orçamento.',
        briefing: { funcionalidades: ['agendamento', 'whatsapp'] } }
    ],
    fim: {
      zero: 'Pronto. O orçamento está montado, e eu desenhei a planta do seu site: o caminho de quem chega até a avaliação marcada.',
      nome: 'Clínica do bairro',
      plano: {
        topologia: 'laco',
        chegada: { origens: ['busca', 'mapa', 'indicacao', 'rede'], titulo: 'Busca, mapa, indicação e rede social', frase: 'A pessoa chega pela busca, pelo mapa, por indicação ou pela rede social.' },
        etapas: [
          { id: 'pagina', tipo: 'pagina', verbo: 'Recebe', titulo: 'Uma página para cada tratamento', frase: 'Cai na página do tratamento que procurava, com a resposta que quer ler primeiro.' },
          { id: 'conversa', tipo: 'conversa', verbo: 'Conduz', decisao: true, titulo: 'Pergunta o que incomoda e a urgência', frase: 'A conversa entende o que incomoda e quão urgente é, sem formulário.' },
          { id: 'horario', tipo: 'agenda', verbo: 'Agenda', titulo: 'Escolhe o horário da avaliação', frase: 'Mostra só os horários livres e a pessoa escolhe um ali mesmo.' },
          { id: 'confirma', tipo: 'confirmacao', verbo: 'Confirma', titulo: 'Confirmação na hora da marcação', frase: 'Assim que marca, a pessoa recebe a confirmação com endereço e como chegar.' },
          { id: 'vespera', tipo: 'lembrete', verbo: 'Lembra', titulo: 'Lembrete na véspera', frase: 'Na véspera chega o lembrete, para a pessoa não esquecer a hora.' },
          { id: 'pos', tipo: 'mensagem', verbo: 'Responde', titulo: 'Dúvidas seguem no WhatsApp', frase: 'Quem ficou com dúvida segue para o WhatsApp da clínica, com o tratamento já escrito.' },
          { id: 'revisao', tipo: 'retoma', verbo: 'Reativa', retorno: true, titulo: 'Chama de volta na hora da revisão', frase: 'Chegou a época da revisão: o site chama a pessoa de volta.' }
        ],
        fim: { titulo: 'Avaliação marcada', frase: 'A avaliação já aparece na agenda da clínica, com o horário combinado.' },
        fecho: 'A pessoa chega, tira a dúvida e marca a avaliação sozinha. A recepção só confere a agenda.',
        rotulo_retorno: 'o site continua'
      }
    }
  };

  var servico = {
    rotulo: 'Serviço com agenda',
    abertura: 'Oi, eu sou o Zero. Me conta do seu negócio que eu monto o orçamento com você.',
    turnos: [
      { pessoa: 'Trabalho com instalação e limpeza de ar-condicionado.',
        zero: 'Serviço que todo mundo lembra quando esquenta. Como os clientes te encontram hoje?',
        briefing: { negocio: { segmento: 'Ar-condicionado' } } },
      { pessoa: 'Pelo Google, quando procuram técnico perto de casa. E por indicação de cliente.',
        zero: 'Indicação de cliente vale muito nesse ramo. E o que mais sai, limpeza ou instalação?',
        briefing: { situacao_atual: { como_chegam: 'Google e indicação' } } },
      { pessoa: 'Limpeza sai toda semana. Instalação é menos, mas é a que dá mais trabalho para orçar.',
        zero: 'Então são dois caminhos: a limpeza pode ser marcada direto, a instalação precisa de um olhar antes. Onde você perde cliente hoje?',
        briefing: { negocio: { descricao: 'Limpeza toda semana; instalação precisa de orçamento' } } },
      { pessoa: 'Quando estou em cima do telhado não consigo atender, e o cliente liga para outro.',
        zero: 'É o problema de quem está sempre no serviço. O site pode responder por você enquanto você trabalha. Você gostaria que a pessoa marcasse a visita sozinha?',
        briefing: { situacao_atual: { como_chegam: 'Google e indicação', o_que_se_perde: 'Não atende no serviço e o cliente liga para outro' } } },
      { pessoa: 'Seria ótimo. Hoje anoto tudo num caderno.',
        zero: 'Então a pessoa escolhe o dia da limpeza e você só confere a agenda. E o WhatsApp, fica?',
        briefing: { objetivos: ['agendamentos'], funcionalidades: ['agendamento'] } },
      { pessoa: 'Fica. É por onde o cliente manda a foto do aparelho.',
        zero: 'Ótimo, a foto ajuda muito a orçar a instalação. Vou montar o seu orçamento.',
        briefing: { funcionalidades: ['agendamento', 'whatsapp'] } }
    ],
    fim: {
      zero: 'Pronto. O orçamento está montado, e eu desenhei a planta do seu site com os dois caminhos: limpeza marcada direto e instalação com foto antes.',
      nome: 'Técnico de ar-condicionado',
      plano: {
        topologia: 'bifurca',
        chegada: { origens: ['busca', 'indicacao'], titulo: 'Busca e indicação', frase: 'A pessoa chega pela busca ou por indicação de outro cliente.' },
        etapas: [
          { id: 'pagina', tipo: 'pagina', verbo: 'Mostra', titulo: 'Limpeza e instalação explicadas', frase: 'Cada serviço tem a sua página, com o que está incluído e como é a visita.' },
          { id: 'conversa', tipo: 'conversa', verbo: 'Decide', decisao: true, titulo: 'Pergunta o aparelho e o que precisa', frase: 'A conversa entende se é limpeza ou instalação e escolhe o caminho certo.' },
          { id: 'dia', tipo: 'agenda', verbo: 'Agenda', ramo: 0, titulo: 'Escolhe o dia da limpeza', frase: 'Para limpeza, mostra os dias livres e a pessoa marca a visita ali mesmo.' },
          { id: 'foto', tipo: 'formulario', verbo: 'Recebe', ramo: 1, titulo: 'Manda a foto do local', frase: 'Para instalação, a pessoa manda a foto do local e da parede, sem cadastro.' },
          { id: 'proposta', tipo: 'proposta', verbo: 'Propõe', ramo: 1, titulo: 'Orçamento escrito da instalação', frase: 'Com a foto, o técnico manda o orçamento por escrito e a pessoa aprova.' },
          { id: 'confirma', tipo: 'confirmacao', verbo: 'Confirma', titulo: 'Confirma a visita com o endereço', frase: 'A visita fica confirmada com o endereço e o que vai ser feito.' },
          { id: 'whats', tipo: 'mensagem', verbo: 'Responde', titulo: 'Dúvida segue para o WhatsApp', frase: 'Quem prefere falar com o técnico segue para o WhatsApp com o serviço já escrito.' }
        ],
        fim: { titulo: 'Visita marcada', frase: 'A visita entra na agenda do técnico, com o endereço e o serviço.' },
        fecho: 'A pessoa foi entendida, seguiu o caminho certo e marcou. O técnico só confere a agenda.',
        rotulos_ramos: ['limpeza', 'instalação']
      }
    }
  };

  var loja = {
    rotulo: 'Loja',
    abertura: 'Oi, eu sou o Zero. Me conta do seu negócio que eu monto o orçamento com você.',
    turnos: [
      { pessoa: 'Tenho uma loja de roupa feminina.',
        zero: 'Roupa feminina, boa. E hoje as clientes te encontram por onde?',
        briefing: { negocio: { segmento: 'Loja de roupa feminina' } } },
      { pessoa: 'Pelo Instagram e por anúncio. Algumas acham no Google.',
        zero: 'Instagram e anúncio puxam bastante gente. E o que você mais vende?',
        briefing: { situacao_atual: { como_chegam: 'Instagram, anúncio e Google' } } },
      { pessoa: 'Vestidos e conjuntos, para trabalho e para festa.',
        zero: 'Dá para organizar a vitrine por ocasião: trabalho, festa, dia a dia. E onde a venda emperra hoje?',
        briefing: { negocio: { segmento: 'Loja de roupa feminina', descricao: 'Vestidos e conjuntos para trabalho e festa' } } },
      { pessoa: 'Perguntam tamanho no direct, eu demoro para responder e a pessoa desiste.',
        zero: 'Tamanho é a dúvida de quem compra roupa sem provar. O site pode responder na hora, com as medidas de cada peça. Você quer vender pelo site, com pagamento?',
        briefing: { situacao_atual: { como_chegam: 'Instagram, anúncio e Google', o_que_se_perde: 'Perguntam tamanho no direct e desistem' } } },
      { pessoa: 'Quero. Hoje faço tudo por Pix na conversa.',
        zero: 'Então a pessoa monta a sacola, vê o frete e paga numa tela só. E o WhatsApp, você quer manter?',
        briefing: { objetivos: ['vender'], funcionalidades: ['loja'] } },
      { pessoa: 'Quero. Muita cliente gosta de mandar foto e perguntar.',
        zero: 'Fica, então: a mensagem já vai com a peça que ela estava olhando. Agora eu monto o orçamento.',
        briefing: { funcionalidades: ['loja', 'whatsapp'] } }
    ],
    fim: {
      zero: 'Pronto. O orçamento está montado, e eu desenhei a planta da sua loja: da vitrine ao pedido pago.',
      nome: 'Loja de roupa feminina',
      plano: {
        topologia: 'espinha',
        chegada: { origens: ['rede', 'anuncio', 'busca'], titulo: 'Rede social, anúncio e busca', frase: 'A pessoa chega da rede social, de um anúncio ou da busca.' },
        etapas: [
          { id: 'vitrine', tipo: 'vitrine', verbo: 'Mostra', titulo: 'Vitrine da coleção por ocasião', frase: 'A vitrine agrupa a coleção por ocasião: trabalho, festa, dia a dia.' },
          { id: 'look', tipo: 'cabide', verbo: 'Sugere', satelite_de: 'vitrine', lado: 'cima', titulo: 'Sugere a peça que combina', frase: 'Ao ver uma peça, sugere a que combina para levar junto.' },
          { id: 'peca', tipo: 'produto', verbo: 'Convence', titulo: 'Página da peça com fotos e tamanhos', frase: 'A página da peça mostra fotos, tecido e os tamanhos que tem.' },
          { id: 'duvida', tipo: 'conversa', verbo: 'Responde', satelite_de: 'peca', lado: 'baixo', titulo: 'Responde a dúvida de tamanho', frase: 'A dúvida de tamanho tem resposta ali mesmo, com as medidas de cada peça.' },
          { id: 'sacola', tipo: 'carrinho', verbo: 'Reúne', titulo: 'Sacola com o frete calculado', frase: 'A sacola junta as peças e já calcula o frete pelo endereço.' },
          { id: 'whats', tipo: 'mensagem', verbo: 'Responde', satelite_de: 'sacola', lado: 'baixo', titulo: 'Segue no WhatsApp com a peça', frase: 'Quem quer perguntar segue para o WhatsApp com a peça já escrita na mensagem.' },
          { id: 'pagamento', tipo: 'pagamento', verbo: 'Cobra', titulo: 'Pagamento em uma tela', frase: 'O pagamento acontece numa tela só, sem cadastro longo.' }
        ],
        fim: { titulo: 'Pedido pago', frase: 'O pedido entra pago e segue para a separação.' },
        fecho: 'A pessoa viu, tirou a dúvida do tamanho e pagou numa tela. A loja só separa.'
      }
    }
  };

  return Object.freeze({ NICHOS: ['clinica', 'servico', 'loja'], clinica: clinica, servico: servico, loja: loja });
});
