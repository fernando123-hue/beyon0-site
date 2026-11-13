/* Os 3 casos do laboratório das estruturas (spec 2026-11-13, §7), cada um escrito nas 5 estruturas, no esquema v3 PROPOSTO (§7.3). São exemplos de
   laboratório, sem dado de cliente real: nenhum número, preço, prazo ou promessa (as travas de texto de hoje valem). Fora do deploy.
   Convenções propostas aqui, para o PR 4 decidir: o objetivo é o campo `objetivo` (nunca um nó) e as setas o chamam pelo id reservado
   "objetivo"; a palavra "Hoje:" e o nome de cada origem são postos pela tela, a partir do código. */
window.LAB_ESTRUTURAS_CASOS = (function () {
  'use strict';
  var s = function (de, para, rotulo) { return { de: de, para: para, rotulo: rotulo }; };

  var clinica = {
    nome: 'Clínica',
    hoje: { origens: ['instagram', 'indicacao'], texto: 'chamam no direct e eu respondo preço e horário um por um', trava: 'à noite e no fim de semana ninguém responde' },
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
          { id: 'direct', papel: 'hoje', icone: 'mensagem', titulo: 'Pergunta no direct', frase: 'Preço e horário saem um por um, na mão' },
          { id: 'noite', papel: 'trava', icone: 'aviso', titulo: 'À noite ninguém responde', frase: 'Quem pergunta fora do horário procura outra clínica' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Respostas no site', frase: 'Como funciona e quanto custa, a qualquer hora' },
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
          { id: 'direct', papel: 'hoje', icone: 'mensagem', titulo: 'Pergunta no direct', frase: 'Preço e horário saem um por um, na mão' },
          { id: 'noite', papel: 'trava', icone: 'aviso', titulo: 'À noite ninguém responde', frase: 'Quem pergunta fora do horário procura outra clínica' },
          { id: 'pagina', papel: 'site', icone: 'pagina', titulo: 'Respostas no site', frase: 'Como funciona e quanto custa, a qualquer hora' },
          { id: 'horario', papel: 'acao', icone: 'agenda', titulo: 'Escolhe o horário', frase: 'Marca sem esperar resposta' }
        ],
        setas: [s('perfil', 'direct', 'chega por'), s('indica', 'noite', 'pergunta tarde'), s('direct', 'pagina', 'o site responde'), s('noite', 'pagina', 'o site cobre'),
          s('pagina', 'horario', 'tira a dúvida'), s('horario', 'objetivo', 'confirma')]
      }
    }
  };

  var embalagens = {
    nome: 'Embalagens',
    hoje: { origens: ['google_busca', 'site_atual'], texto: 'o comprador acha o site antigo e manda e-mail sem as medidas', trava: 'cada orçamento volta com perguntas antes do preço' },
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
          { id: 'email', papel: 'hoje', icone: 'mensagem', titulo: 'E-mail sem as medidas', frase: 'O comprador escreve só pedindo preço' },
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
          { id: 'email', papel: 'hoje', icone: 'mensagem', titulo: 'E-mail sem as medidas', frase: 'O comprador escreve só pedindo preço' },
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
          { id: 'compra', papel: 'acao', icone: 'carrinho', titulo: 'Compra no site', frase: 'Escolhe o tamanho e paga sem precisar perguntar' }
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

  return { clinica: clinica, embalagens: embalagens, loja: loja };
})();
