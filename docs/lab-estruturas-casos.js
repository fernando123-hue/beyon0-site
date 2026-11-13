/* Os 3 casos do laboratório das estruturas (spec 2026-11-13, §7), cada um escrito nas 5 estruturas, no esquema v3 PROPOSTO (§7.3). São exemplos de
   laboratório, sem dado de cliente real: nenhum número, preço, prazo ou promessa (as travas de texto de hoje valem). Fora do deploy.
   Convenções propostas aqui, para o PR 4 decidir: o objetivo é o campo `objetivo` (nunca um nó) e as setas o chamam pelo id reservado
   "objetivo"; a palavra "Hoje:" e o nome de cada origem são postos pela tela, a partir do código. */
window.LAB_ESTRUTURAS_CASOS = (function () {
  'use strict';
  var s = function (de, para, rotulo) { return { de: de, para: para, rotulo: rotulo }; };

  var clinica = {
    nome: 'Clínica',
    hoje: { origens: ['instagram', 'indicacao'], texto: 'chamam no direct e tiro dúvida e horário um por um, na mão', trava: 'à noite e no fim de semana ninguém responde' },
    objetivo: { titulo: 'Avaliação marcada', frase: 'A pessoa escolhe o horário e chega sabendo o que esperar' },
    fecho: 'O site responde o que você responde na mão e deixa a avaliação marcada.',
    estruturas: {
      caminho: {
        nos: [
          { id: 'perfil', papel: 'origem', origem: 'instagram', icone: 'chegada', titulo: 'Vê o perfil e se interessa', frase: 'Chega pelo link do perfil, curiosa sobre o tratamento' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Página do tratamento', frase: 'Explica como é a avaliação e quem atende' },
          { id: 'horario', papel: 'acao', icone: 'agenda', titulo: 'Escolhe o horário', frase: 'Vê os horários livres e marca sem esperar resposta' }
        ],
        setas: [s('perfil', 'pagina', 'chega por'), s('pagina', 'horario', 'tira a dúvida'), s('horario', 'objetivo', 'confirma')]
      },
      antes_depois: {
        nos: [
          { id: 'direct', papel: 'hoje', icone: 'mensagem', titulo: 'Pergunta no direct', frase: 'Dúvida e horário saem um por um, na mão' },
          { id: 'noite', papel: 'trava', icone: 'aviso', titulo: 'À noite ninguém responde', frase: 'Quem pergunta fora do horário procura outra clínica' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Respostas no site', frase: 'Como funciona e como é a avaliação, mesmo de noite' },
          { id: 'horario', papel: 'acao', icone: 'agenda', titulo: 'Marca sozinha', frase: 'Escolhe o horário livre e recebe a confirmação' }
        ],
        setas: [s('direct', 'noite', 'espera'), s('noite', 'objetivo', 'às vezes chega'), s('pagina', 'horario', 'resolve'), s('horario', 'objetivo', 'confirma')]
      },
      ramos: {
        nos: [
          { id: 'perfil', papel: 'origem', origem: 'instagram', icone: 'chegada', titulo: 'Vê o perfil', frase: 'Chega pelo link do perfil' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Página da clínica', frase: 'Mostra os tratamentos e quem atende' },
          { id: 'horario', papel: 'acao', icone: 'agenda', titulo: 'Marca a avaliação', frase: 'Quem já sabe o que quer escolhe o horário' },
          { id: 'duvida', papel: 'conversa', icone: 'conversa', titulo: 'Tira a dúvida antes', frase: 'Quem ainda tem dúvida conversa e depois marca' }
        ],
        setas: [s('perfil', 'pagina', 'chega por'), s('pagina', 'horario', 'já sabe o que quer'), s('pagina', 'duvida', 'ainda tem dúvida'),
          s('horario', 'objetivo', 'confirma'), s('duvida', 'objetivo', 'decide e marca')]
      },
      ciclo: {
        nos: [
          { id: 'indica', papel: 'origem', origem: 'indicacao', icone: 'chegada', titulo: 'Chega indicada', frase: 'Alguém da família contou e mandou o link' },
          { id: 'horario', papel: 'acao', icone: 'agenda', titulo: 'Marca a avaliação', frase: 'Escolhe o horário livre no site' },
          { id: 'revisao', papel: 'volta', icone: 'lembrete', titulo: 'Lembrete da revisão', frase: 'Quando chega a época, o site avisa e oferece horário' }
        ],
        setas: [s('indica', 'horario', 'chega por'), s('horario', 'objetivo', 'confirma'), s('objetivo', 'revisao', 'depois do tratamento'), s('revisao', 'horario', 'volta para')]
      },
      mapa: {
        nos: [
          { id: 'perfil', papel: 'origem', origem: 'instagram', icone: 'chegada', titulo: 'Vê o perfil', frase: 'Chega curiosa sobre o tratamento' },
          { id: 'indica', papel: 'origem', origem: 'indicacao', icone: 'chegada', titulo: 'Indicação da família', frase: 'Chega com o nome da clínica e pouca informação' },
          { id: 'direct', papel: 'hoje', icone: 'mensagem', titulo: 'Pergunta no direct', frase: 'Dúvida e horário saem um por um, na mão' },
          { id: 'noite', papel: 'trava', icone: 'aviso', titulo: 'À noite ninguém responde', frase: 'Quem pergunta fora do horário procura outra clínica' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Respostas no site', frase: 'Como funciona e como é a avaliação, mesmo de noite' },
          { id: 'horario', papel: 'acao', icone: 'agenda', titulo: 'Escolhe o horário', frase: 'Marca sem esperar resposta' }
        ],
        setas: [s('perfil', 'direct', 'chega por'), s('indica', 'noite', 'pergunta tarde'), s('direct', 'pagina', 'o site responde'), s('noite', 'pagina', 'o site cobre'),
          s('pagina', 'horario', 'tira a dúvida'), s('horario', 'objetivo', 'confirma')]
      }
    }
  };

  var embalagens = {
    nome: 'Embalagens',
    hoje: { origens: ['google_busca', 'site_atual'], texto: 'o comprador acha o site antigo e manda e-mail sem as medidas', trava: 'cada orçamento volta com perguntas sobre a medida' },
    objetivo: { titulo: 'Pedido com as medidas', frase: 'O comprador manda modelo, medida e quantidade de uma vez' },
    fecho: 'O site faz as perguntas antes, e o pedido chega pronto para orçar.',
    estruturas: {
      caminho: {
        nos: [
          { id: 'busca', papel: 'origem', origem: 'google_busca', icone: 'chegada', titulo: 'Procura fornecedor', frase: 'Busca pelo tipo de embalagem e acha a página certa' },
          { id: 'modelos', papel: 'site', icone: 'catalogo', titulo: 'Catálogo por modelo', frase: 'Cada modelo com material, acabamento e usos' },
          { id: 'form', papel: 'acao', icone: 'formulario', titulo: 'Pede com as medidas', frase: 'Formulário com modelo, medida e quantidade' }
        ],
        setas: [s('busca', 'modelos', 'chega por'), s('modelos', 'form', 'escolhe o modelo'), s('form', 'objetivo', 'envia')]
      },
      antes_depois: {
        nos: [
          { id: 'email', papel: 'hoje', icone: 'mensagem', titulo: 'E-mail sem as medidas', frase: 'O comprador escreve sem dizer modelo nem medida' },
          { id: 'volta', papel: 'trava', icone: 'aviso', titulo: 'Volta com perguntas', frase: 'Cada orçamento pede várias trocas de e-mail' },
          { id: 'modelos', papel: 'site', icone: 'catalogo', titulo: 'Catálogo por modelo', frase: 'Cada modelo com material, acabamento e usos' },
          { id: 'form', papel: 'acao', icone: 'formulario', titulo: 'Formulário guiado', frase: 'Pede medida, material e quantidade antes de enviar' }
        ],
        setas: [s('email', 'volta', 'trava aqui'), s('volta', 'objetivo', 'demora a chegar'), s('modelos', 'form', 'escolhe o modelo'), s('form', 'objetivo', 'chega completo')]
      },
      ramos: {
        nos: [
          { id: 'busca', papel: 'origem', origem: 'google_busca', icone: 'chegada', titulo: 'Procura fornecedor', frase: 'Busca pelo tipo de embalagem' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Página da fábrica', frase: 'Mostra o que a fábrica faz e para quem' },
          { id: 'modelos', papel: 'acao', icone: 'catalogo', titulo: 'Modelos do catálogo', frase: 'Escolhe entre os modelos que já existem' },
          { id: 'medida', papel: 'acao', icone: 'formulario', titulo: 'Sob medida', frase: 'Manda o desenho e as medidas do projeto' }
        ],
        setas: [s('busca', 'pagina', 'chega por'), s('pagina', 'modelos', 'modelo pronto'), s('pagina', 'medida', 'projeto próprio'),
          s('modelos', 'objetivo', 'pede'), s('medida', 'objetivo', 'pede com desenho')]
      },
      ciclo: {
        nos: [
          { id: 'cliente', papel: 'origem', origem: 'site_atual', icone: 'chegada', titulo: 'Cliente que já compra', frase: 'Entra no site para fazer um pedido novo' },
          { id: 'form', papel: 'acao', icone: 'formulario', titulo: 'Pedido guiado', frase: 'Modelo, medida e quantidade num formulário só' },
          { id: 'repete', papel: 'volta', icone: 'retoma', titulo: 'Repetir o pedido', frase: 'O site guarda o último pedido para repetir' }
        ],
        setas: [s('cliente', 'form', 'entra para pedir'), s('form', 'objetivo', 'envia'), s('objetivo', 'repete', 'quando o estoque acaba'), s('repete', 'form', 'volta para')]
      },
      mapa: {
        nos: [
          { id: 'busca', papel: 'origem', origem: 'google_busca', icone: 'chegada', titulo: 'Procura fornecedor', frase: 'Busca pelo tipo de embalagem' },
          { id: 'antigo', papel: 'origem', origem: 'site_atual', icone: 'chegada', titulo: 'Acha o site antigo', frase: 'Só encontra o e-mail de contato' },
          { id: 'email', papel: 'hoje', icone: 'mensagem', titulo: 'E-mail sem as medidas', frase: 'O comprador escreve sem dizer modelo nem medida' },
          { id: 'volta', papel: 'trava', icone: 'aviso', titulo: 'Volta com perguntas', frase: 'Cada orçamento pede várias trocas de e-mail' },
          { id: 'modelos', papel: 'site', icone: 'catalogo', titulo: 'Catálogo por modelo', frase: 'Cada modelo com material, acabamento e usos' },
          { id: 'form', papel: 'acao', icone: 'formulario', titulo: 'Formulário guiado', frase: 'Pede medida, material e quantidade antes de enviar' }
        ],
        setas: [s('busca', 'email', 'acha o contato'), s('antigo', 'volta', 'pede sem medida'), s('email', 'modelos', 'o site organiza'), s('volta', 'modelos', 'o site resolve'),
          s('modelos', 'form', 'escolhe o modelo'), s('form', 'objetivo', 'chega completo')]
      }
    }
  };

  var loja = {
    nome: 'Loja',
    hoje: { origens: ['instagram', 'passa_na_frente'], texto: 'a cliente vê a peça no feed e pergunta o tamanho no direct', trava: 'quem comprou uma vez some e não volta' },
    objetivo: { titulo: 'Cliente que volta', frase: 'Quem comprou recebe as novidades e volta para a próxima peça' },
    fecho: 'O site responde o tamanho, vende e chama de volta quem já comprou.',
    estruturas: {
      caminho: {
        nos: [
          { id: 'feed', papel: 'origem', origem: 'instagram', icone: 'chegada', titulo: 'Vê a peça no feed', frase: 'Toca no link e cai direto na peça' },
          { id: 'vitrine', papel: 'site', icone: 'vitrine', titulo: 'Vitrine com tamanhos', frase: 'Cada peça com medidas, cores e o que tem em estoque' },
          { id: 'compra', papel: 'acao', icone: 'carrinho', titulo: 'Compra no site', frase: 'Escolhe o tamanho e finaliza sem precisar perguntar' }
        ],
        setas: [s('feed', 'vitrine', 'toca no link'), s('vitrine', 'compra', 'acha o tamanho'), s('compra', 'objetivo', 'fica com o contato')]
      },
      antes_depois: {
        nos: [
          { id: 'direct', papel: 'hoje', icone: 'mensagem', titulo: 'Pergunta o tamanho', frase: 'Cada cliente espera alguém responder no direct' },
          { id: 'some', papel: 'trava', icone: 'aviso', titulo: 'Quem comprou some', frase: 'Depois da compra, ninguém lembra de chamar de novo' },
          { id: 'vitrine', papel: 'site', icone: 'vitrine', titulo: 'Vitrine com tamanhos', frase: 'Cada peça com medidas, cores e o que tem em estoque' },
          { id: 'novidade', papel: 'acao', icone: 'lembrete', titulo: 'Aviso de novidade', frase: 'Quem comprou recebe a peça nova que combina' }
        ],
        setas: [s('direct', 'some', 'compra uma vez'), s('some', 'objetivo', 'raramente volta'), s('vitrine', 'novidade', 'guarda o contato'), s('novidade', 'objetivo', 'volta para comprar')]
      },
      ramos: {
        nos: [
          { id: 'feed', papel: 'origem', origem: 'instagram', icone: 'chegada', titulo: 'Vê a peça no feed', frase: 'Toca no link e cai direto na peça' },
          { id: 'vitrine', papel: 'site', icone: 'vitrine', titulo: 'Vitrine da loja', frase: 'Peças com medidas, cores e estoque' },
          { id: 'compra', papel: 'acao', icone: 'carrinho', titulo: 'Compra pelo site', frase: 'Quem já sabe o tamanho paga ali mesmo' },
          { id: 'prova', papel: 'acao', icone: 'mapa', titulo: 'Prova na loja', frase: 'Separa a peça e vê o endereço para provar' }
        ],
        setas: [s('feed', 'vitrine', 'toca no link'), s('vitrine', 'compra', 'já sabe o tamanho'), s('vitrine', 'prova', 'quer provar'),
          s('compra', 'objetivo', 'fica com o contato'), s('prova', 'objetivo', 'fica com o contato')]
      },
      ciclo: {
        nos: [
          { id: 'feed', papel: 'origem', origem: 'instagram', icone: 'chegada', titulo: 'Vê a peça no feed', frase: 'Toca no link e cai direto na peça' },
          { id: 'vitrine', papel: 'site', icone: 'vitrine', titulo: 'Vitrine com tamanhos', frase: 'Medidas, cores e estoque, sem perguntar' },
          { id: 'compra', papel: 'acao', icone: 'carrinho', titulo: 'Compra no site', frase: 'Escolhe o tamanho e paga' },
          { id: 'novidade', papel: 'volta', icone: 'lembrete', titulo: 'Aviso de novidade', frase: 'Quem comprou recebe a peça nova que combina' }
        ],
        setas: [s('feed', 'vitrine', 'toca no link'), s('vitrine', 'compra', 'acha o tamanho'), s('compra', 'objetivo', 'fica com o contato'),
          s('objetivo', 'novidade', 'chega peça nova'), s('novidade', 'vitrine', 'volta para')]
      },
      mapa: {
        nos: [
          { id: 'feed', papel: 'origem', origem: 'instagram', icone: 'chegada', titulo: 'Vê a peça no feed', frase: 'Toca no link e cai direto na peça' },
          { id: 'rua', papel: 'origem', origem: 'passa_na_frente', icone: 'chegada', titulo: 'Passa na frente da loja', frase: 'Entra, compra e vai embora sem deixar contato' },
          { id: 'direct', papel: 'hoje', icone: 'mensagem', titulo: 'Pergunta o tamanho', frase: 'Cada cliente espera alguém responder no direct' },
          { id: 'some', papel: 'trava', icone: 'aviso', titulo: 'Quem comprou some', frase: 'Depois da compra, ninguém lembra de chamar de novo' },
          { id: 'vitrine', papel: 'site', icone: 'vitrine', titulo: 'Vitrine com tamanhos', frase: 'Medidas, cores e estoque, sem perguntar' },
          { id: 'novidade', papel: 'volta', icone: 'lembrete', titulo: 'Aviso de novidade', frase: 'Quem comprou recebe a peça nova que combina' }
        ],
        setas: [s('feed', 'direct', 'pergunta no direct'), s('rua', 'some', 'compra e vai embora'), s('direct', 'vitrine', 'o site responde'), s('some', 'novidade', 'o site lembra'),
          s('vitrine', 'objetivo', 'compra'), s('novidade', 'objetivo', 'volta')]
      }
    }
  };

  /* ?caso=limites (sem botão): cada estrutura no limite do que o validador aceita (5 camadas, títulos de 2 linhas com quase 28 letras,
     3 origens no hoje, duas origens na mesma camada, junção dos ramos, ramo curto que pula camada por faixa vazia, origem ao lado do site).
     Existe para a conferência (docs/lab-estruturas-fotos.mjs) medir o pior caso, não para o dono escolher. */
  var limites = {
    nome: 'Limites',
    hoje: { origens: ['google_mapa', 'passa_na_frente', 'google_busca'], texto: 'quem passa na frente entra, pergunta tudo e vai embora', trava: 'ninguém lembra de quem perguntou e não voltou' },
    objetivo: { titulo: 'Atendimento marcado sozinho', frase: 'A pessoa escolhe sozinha e chega sabendo o que vai acontecer' },
    fecho: 'O site responde, guarda o contato e marca.',
    estruturas: {
      caminho: {
        nos: [
          { id: 'mapa', papel: 'origem', origem: 'google_mapa', icone: 'chegada', titulo: 'Acha a loja pelo mapa da rua', frase: 'Procura perto de casa e encontra o endereço' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Página explica o atendimento', frase: 'Mostra o que é feito, como e por quem' },
          { id: 'conversa', papel: 'conversa', icone: 'conversa', titulo: 'Conversa tira dúvida difícil', frase: 'Quem ainda não entendeu pergunta e recebe a resposta' },
          { id: 'agenda', papel: 'acao', icone: 'agenda', titulo: 'Escolhe o dia e o horário', frase: 'Vê o que está livre e marca sem esperar' }
        ],
        setas: [s('mapa', 'pagina', 'chega pelo endereço'), s('pagina', 'conversa', 'ainda tem uma dúvida'), s('conversa', 'agenda', 'entende e decide'), s('agenda', 'objetivo', 'confirma o atendimento')]
      },
      antes_depois: {
        nos: [
          { id: 'rua', papel: 'origem', origem: 'passa_na_frente', icone: 'chegada', titulo: 'Passa na frente e entra', frase: 'Entra para perguntar, sem ter marcado nada' },
          { id: 'balcao', papel: 'hoje', icone: 'mensagem', titulo: 'Pergunta tudo no balcão', frase: 'Cada dúvida é tirada por quem está atendendo no balcão' },
          { id: 'some', papel: 'trava', icone: 'aviso', titulo: 'Vai embora sem o contato', frase: 'Ninguém consegue chamar de novo quem perguntou' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Página com tudo explicado', frase: 'Responde o que se pergunta no balcão' },
          { id: 'agenda', papel: 'acao', icone: 'agenda', titulo: 'Marca e deixa o contato', frase: 'Escolhe o horário e recebe a confirmação' },
          { id: 'lembra', papel: 'volta', icone: 'lembrete', titulo: 'Recebe um lembrete antes', frase: 'O site avisa perto do horário marcado' }
        ],
        setas: [s('rua', 'balcao', 'entra'), s('balcao', 'some', 'trava aqui'), s('some', 'objetivo', 'quase nunca chega'), s('pagina', 'agenda', 'resolve'),
          s('agenda', 'lembra', 'guarda o contato'), s('lembra', 'objetivo', 'chega no dia')]
      },
      ramos: {
        nos: [
          { id: 'mapa', papel: 'origem', origem: 'google_mapa', icone: 'chegada', titulo: 'Acha pelo mapa', frase: 'Procura perto de casa' },
          { id: 'busca', papel: 'origem', origem: 'google_busca', icone: 'chegada', titulo: 'Acha pela busca', frase: 'Procura pelo serviço' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Página separa cada pedido', frase: 'Separa quem quer visitar de quem quer pedir' },
          { id: 'visita', papel: 'acao', icone: 'agenda', titulo: 'Marca uma visita', frase: 'Escolhe o dia para ir até lá' },
          { id: 'pedido', papel: 'acao', icone: 'formulario', titulo: 'Manda o pedido detalhado', frase: 'Conta o que precisa num formulário curto' },
          { id: 'retorno', papel: 'conversa', icone: 'conversa', titulo: 'Recebe o retorno do pedido', frase: 'A conversa segue com o pedido já explicado' }
        ],
        setas: [s('mapa', 'pagina', 'chega por'), s('busca', 'pagina', 'chega por'), s('pagina', 'visita', 'quer conhecer'), s('pagina', 'pedido', 'quer pedir'),
          s('pedido', 'retorno', 'chega completo'), s('visita', 'objetivo', 'marca'), s('retorno', 'objetivo', 'combina')]
      },
      ciclo: {
        nos: [
          { id: 'mapa', papel: 'origem', origem: 'google_mapa', icone: 'chegada', titulo: 'Acha a loja pelo mapa da rua', frase: 'Procura perto de casa e encontra o endereço' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Página explica o atendimento', frase: 'Mostra o que é feito, como e por quem' },
          { id: 'agenda', papel: 'acao', icone: 'agenda', titulo: 'Escolhe o dia e o horário', frase: 'Vê o que está livre e marca sem esperar' },
          { id: 'lembra', papel: 'volta', icone: 'lembrete', titulo: 'Lembrete quando chega a hora', frase: 'O site avisa e oferece um horário de novo' }
        ],
        setas: [s('mapa', 'pagina', 'chega pelo endereço'), s('pagina', 'agenda', 'entende e decide'), s('agenda', 'objetivo', 'confirma o atendimento'),
          s('objetivo', 'lembra', 'depois do atendimento'), s('lembra', 'agenda', 'volta para marcar')]
      },
      mapa: {
        nos: [
          { id: 'mapa', papel: 'origem', origem: 'google_mapa', icone: 'chegada', titulo: 'Acha a loja pelo mapa da rua', frase: 'Procura perto de casa' },
          { id: 'rua', papel: 'origem', origem: 'passa_na_frente', icone: 'chegada', titulo: 'Passa na frente e entra', frase: 'Entra para perguntar' },
          { id: 'balcao', papel: 'hoje', icone: 'mensagem', titulo: 'Pergunta tudo no balcão', frase: 'Cada dúvida é tirada por quem atende' },
          { id: 'some', papel: 'trava', icone: 'aviso', titulo: 'Vai embora sem o contato', frase: 'Ninguém consegue chamar de novo' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Página com tudo explicado', frase: 'Responde o que se pergunta no balcão' },
          { id: 'lembra', papel: 'volta', icone: 'lembrete', titulo: 'Guarda o contato e lembra', frase: 'Quem perguntou recebe um aviso depois' }
        ],
        setas: [s('mapa', 'balcao', 'vai até lá'), s('rua', 'some', 'pergunta e sai'), s('balcao', 'pagina', 'o site responde'), s('some', 'lembra', 'o site lembra'),
          s('pagina', 'objetivo', 'marca'), s('lembra', 'objetivo', 'volta e marca')]
      }
    }
  };

  return { clinica: clinica, embalagens: embalagens, loja: loja, limites: limites };
})();
