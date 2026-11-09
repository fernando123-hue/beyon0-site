/* ==========================================================================
   O PLANO PADRÃO POR NICHO (spec §2.5). Oito planos escritos à mão (voz da Beyon, "a gente", terceira pessoa para quem chega, presente do
   indicativo, sem jargão), que passam pelo MESMO validador do plano do modelo (docs/testes/planta-padrao.test.mjs confere). O servidor grava um
   deles quando o modelo errou o desenho duas vezes ou não chamou a ferramenta em dois turnos; a tela o mostra com a nota "um desenho de exemplo
   para o seu tipo de negócio". Nada aqui afirma resultado, número, preço, prazo nem nome de terceiro. Os três primeiros nichos de saúde, indústria
   e loja são os planos aprovados do protótipo (docs/testes/fixtures/planta/*.json).

   nichoDaPlanta(briefing) escolhe a chave pelo texto de negocio.segmento + negocio.descricao (paraBusca). Precisão antes de alcance: se o texto
   indica mais de um nicho, ou nenhum, vale "generico". Advocacia é nicho regulado e cai no genérico (escrito dentro das regras de regulado).
   ========================================================================== */
import { paraBusca, nichoRegulado } from './zero.mjs';

const congelar = o => { if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); } return o; };
const e = (id, tipo, verbo, titulo, frase, extra = {}) => ({ id, tipo, verbo, ...extra, titulo, frase });

const PLANOS = congelar({
  saude_agenda: {
    topologia: 'laco',
    chegada: { origens: ['busca', 'mapa', 'indicacao'], titulo: 'Busca, mapa e indicação', frase: 'A pessoa chega pela busca, pelo mapa ou porque alguém indicou.' },
    etapas: [
      e('pagina', 'pagina', 'Recebe', 'Uma página para cada tratamento', 'Cai na página do tratamento que procurava, com a resposta que quer ler primeiro.'),
      e('conversa', 'conversa', 'Conduz', 'Pergunta o que incomoda e a urgência', 'A conversa entende o que incomoda e quão urgente é, sem formulário.', { decisao: true }),
      e('horario', 'agenda', 'Agenda', 'Escolhe o horário da avaliação', 'Mostra só os horários livres e a pessoa escolhe um ali mesmo.'),
      e('confirma', 'confirmacao', 'Confirma', 'Confirmação na hora da marcação', 'Assim que marca, a pessoa recebe a confirmação com endereço e como chegar.'),
      e('vespera', 'lembrete', 'Lembra', 'Lembrete na véspera', 'Na véspera chega o lembrete, para a pessoa não esquecer a hora.'),
      e('pos', 'mensagem', 'Responde', 'Dúvidas depois da consulta', 'Quem ficou com dúvida volta à conversa e encontra a resposta.'),
      e('revisao', 'retoma', 'Reativa', 'Chama de volta na hora da revisão', 'Chegou a época da revisão: o site chama a pessoa de volta.', { retorno: true })
    ],
    fim: { titulo: 'Avaliação marcada', frase: 'A avaliação já aparece na agenda da clínica, com o horário combinado.' },
    fecho: 'A pessoa chegou, foi entendida, marcou e vai ser lembrada. A clínica entra só no dia.',
    rotulo_retorno: 'o site continua'
  },
  servico_agenda: {
    topologia: 'laco',
    chegada: { origens: ['mapa', 'rede', 'indicacao'], titulo: 'Mapa, rede social e indicação', frase: 'A pessoa chega pelo mapa, pela rede social ou porque alguém indicou.' },
    etapas: [
      e('servicos', 'vitrine', 'Mostra', 'Serviços e trabalhos à vista', 'A página mostra cada serviço e o trabalho feito, para a pessoa já se imaginar ali.'),
      e('conversa', 'conversa', 'Conduz', 'Pergunta o serviço e o profissional', 'A conversa entende o que a pessoa quer fazer e com quem prefere ser atendida.', { decisao: true }),
      e('horario', 'agenda', 'Agenda', 'Escolhe o dia e o horário livre', 'Mostra só os horários livres da agenda e a pessoa escolhe o melhor para ela.'),
      e('confirma', 'confirmacao', 'Confirma', 'Confirmação assim que marca', 'Ao marcar, chega a confirmação com o endereço e como chegar ao local.'),
      e('vespera', 'lembrete', 'Lembra', 'Lembrete na véspera', 'Na véspera chega o lembrete, e quem não puder vir remarca sem precisar ligar.'),
      e('cuidados', 'mensagem', 'Orienta', 'Cuidados depois do atendimento', 'Depois do atendimento, a pessoa recebe os cuidados e tira dúvidas pela conversa.'),
      e('volta', 'retoma', 'Reativa', 'Chama de volta na hora de renovar', 'Chegou a época de repetir o serviço: o site chama a pessoa de volta.', { retorno: true })
    ],
    fim: { titulo: 'Horário reservado', frase: 'O horário entra reservado na agenda, com a pessoa e o serviço combinados.' },
    fecho: 'A pessoa chegou, escolheu o serviço, marcou e vai ser lembrada. O atendimento começa no dia.',
    rotulo_retorno: 'o site continua'
  },
  servico_orcamento: {
    topologia: 'bifurca',
    chegada: { origens: ['busca', 'mapa', 'indicacao'], titulo: 'Busca, mapa e indicação', frase: 'O cliente chega procurando o serviço perto de casa ou por indicação de quem já contratou.' },
    etapas: [
      e('servicos', 'vitrine', 'Mostra', 'Serviços e obras já feitas', 'A página mostra cada serviço com fotos de trabalhos feitos, para dar confiança antes da conversa.'),
      e('conversa', 'conversa', 'Pergunta', 'Pergunta o que precisa e onde', 'A conversa entende o que o cliente precisa, onde fica o local e se já tem as medidas.', { decisao: true }),
      e('fotos', 'formulario', 'Levanta', 'Fotos e medidas pelo celular', 'No serviço simples, o cliente manda fotos e medidas direto pelo celular, na própria conversa.', { ramo: 0 }),
      e('envio', 'proposta', 'Propõe', 'Proposta escrita sem visita', 'Com as fotos e as medidas, monta a proposta por escrito e envia para o cliente avaliar.', { ramo: 0 }),
      e('visita', 'agenda', 'Agenda', 'Visita marcada na agenda', 'Quando o serviço pede ver o local, o cliente escolhe um horário livre para a visita.', { ramo: 1 }),
      e('aviso', 'lembrete', 'Lembra', 'Lembrete antes da visita', 'Antes da visita, o cliente recebe o lembrete com o endereço e o que deixar à vista.', { ramo: 1 }),
      e('aprova', 'confirmacao', 'Aprova', 'Aprovação com as condições', 'O cliente aprova a proposta pelo celular e as condições ficam registradas por escrito.'),
      e('retoma', 'retoma', 'Retoma', 'Retoma a proposta parada', 'Se a proposta ficou parada, o site escreve de novo para a pessoa, no momento combinado.')
    ],
    fim: { titulo: 'Serviço aprovado', frase: 'O pedido chega à equipe completo: o que fazer, onde e o que ficou combinado.' },
    fecho: 'O cliente foi entendido e a proposta chegou clara. A equipe entra só para fazer o serviço.',
    rotulos_ramos: ['serviço simples', 'precisa de visita']
  },
  industria_b2b: {
    topologia: 'bifurca',
    chegada: { origens: ['busca', 'indicacao'], titulo: 'Busca técnica e indicação', frase: 'O comprador chega procurando um tipo de embalagem ou por indicação de outro cliente.' },
    etapas: [
      e('familias', 'caixa', 'Mostra', 'Famílias de embalagem e seus usos', 'Cada família de embalagem tem a sua página, com medidas, materiais e usos.'),
      e('conversa', 'conversa', 'Decide', 'Pergunta o uso, a medida e a quantidade', 'A conversa pergunta para que é, qual a medida e quanto precisa, e escolhe o caminho.', { decisao: true }),
      e('tabela', 'tabela', 'Calcula', 'Medida de catálogo pela tabela', 'Se a medida é de catálogo, a conversa consulta a tabela da fábrica e já orienta o comprador.', { ramo: 0 }),
      e('acabamento', 'acabamento', 'Escolhe', 'Acabamento e cor do catálogo', 'O comprador já escolhe acabamento e cor antes de pedir a proposta.', { ramo: 0 }),
      e('briefing', 'briefing', 'Levanta', 'Briefing técnico com as cotas', 'Se é sob medida, pede as cotas e o material, passo a passo.', { ramo: 1 }),
      e('amostra', 'amostra', 'Combina', 'Amostra antes da tiragem', 'Combina uma amostra para o comprador aprovar antes de produzir a tiragem.', { ramo: 1 }),
      e('proposta', 'proposta', 'Propõe', 'Proposta escrita com as condições', 'Monta a proposta por escrito, com as condições, no nome da fábrica.'),
      e('retoma', 'retoma', 'Retoma', 'Retoma a proposta parada', 'Se a proposta ficou parada, o site escreve de novo para a pessoa, no momento combinado.')
    ],
    fim: { titulo: 'Pedido pronto para o comercial', frase: 'O pedido chega ao comercial completo: o quê, para quando e quem decide.' },
    fecho: 'O comprador foi entendido e o pedido chegou claro. A fábrica entra só para fechar.',
    rotulos_ramos: ['medida de catálogo', 'sob medida']
  },
  loja_online: {
    topologia: 'espinha',
    chegada: { origens: ['rede', 'anuncio', 'busca'], titulo: 'Rede social, anúncio e busca', frase: 'A pessoa chega da rede social, de um anúncio ou da busca.' },
    etapas: [
      e('vitrine', 'vitrine', 'Mostra', 'Vitrine da coleção por ocasião', 'A vitrine agrupa a coleção por ocasião: trabalho, festa, dia a dia.'),
      e('look', 'cabide', 'Combina', 'Sugere a peça que combina', 'Ao ver uma peça, sugere a que combina para levar junto.', { satelite_de: 'vitrine', lado: 'cima' }),
      e('peca', 'produto', 'Convence', 'Página da peça com fotos e tamanhos', 'A página da peça mostra fotos, tecido e tamanhos disponíveis.'),
      e('guia', 'guia', 'Mede', 'Guia de medidas em um toque', 'Um toque abre o guia de medidas, para a pessoa não ficar na dúvida do tamanho.', { satelite_de: 'peca', lado: 'baixo' }),
      e('sacola', 'carrinho', 'Reúne', 'Sacola com frete calculado', 'A sacola junta as peças e já calcula o frete pelo endereço.'),
      e('esquecida', 'lembrete', 'Lembra', 'Avisa quem esqueceu a sacola', 'Quem deixou a sacola cheia recebe um aviso e volta para ela.', { satelite_de: 'sacola', lado: 'baixo', laco: true }),
      e('pagamento', 'pagamento', 'Cobra', 'Pagamento em uma tela', 'O pagamento acontece numa tela só, sem cadastro longo.')
    ],
    fim: { titulo: 'Pedido pago', frase: 'O pedido entra pago e segue para a separação.' },
    fecho: 'A pessoa viu, escolheu o tamanho e pagou numa tela. Quem esqueceu a sacola é lembrada.'
  },
  alimentacao: {
    topologia: 'espinha',
    chegada: { origens: ['mapa', 'rede', 'direto'], titulo: 'Mapa, rede social e link direto', frase: 'A pessoa chega pelo mapa, pela rede social ou direto pelo link que já conhece.' },
    etapas: [
      e('cardapio', 'cardapio', 'Mostra', 'Cardápio com foto de cada prato', 'O cardápio mostra cada prato com foto e descrição, separado por tipo, fácil de percorrer.'),
      e('destaques', 'galeria', 'Apresenta', 'Pratos do dia em destaque', 'No topo ficam os pratos do dia e as novidades, para quem ainda não decidiu.', { satelite_de: 'cardapio', lado: 'cima' }),
      e('conversa', 'conversa', 'Responde', 'Tira dúvida de ingrediente e sabor', 'A conversa responde sobre ingredientes, restrições e sabores, sem a pessoa ter de ligar.'),
      e('sacola', 'carrinho', 'Reúne', 'Pedido montado na sacola', 'A pessoa junta os itens, escolhe retirar ou receber em casa e confere tudo antes de enviar.'),
      e('adicional', 'catalogo', 'Sugere', 'Sugere o que combina', 'Ao fechar o pedido, sugere a bebida ou a sobremesa que combina com o prato.', { satelite_de: 'sacola', lado: 'baixo' }),
      e('pagamento', 'pagamento', 'Cobra', 'Pagamento no próprio pedido', 'O pagamento acontece na mesma tela do pedido, sem a pessoa precisar sair para outro lugar.'),
      e('aviso', 'aviso', 'Avisa', 'Aviso de pedido confirmado e saída', 'A pessoa é avisada quando o pedido é confirmado e quando ele sai para a entrega.'),
      e('volta', 'retoma', 'Reativa', 'Chama quem já pediu de volta', 'Quem já pediu antes recebe uma lembrança dos pratos de que mais gostou, no momento certo.', { satelite_de: 'aviso', lado: 'baixo', laco: true })
    ],
    fim: { titulo: 'Pedido a caminho', frase: 'O pedido chega à cozinha completo, com o que foi pedido e como será entregue.' },
    fecho: 'A pessoa viu o cardápio, montou o pedido e pagou numa tela só. Quem já pediu volta a ser lembrado.'
  },
  educacao: {
    topologia: 'laco',
    chegada: { origens: ['busca', 'indicacao', 'rede'], titulo: 'Busca, indicação e rede social', frase: 'O aluno chega pela busca, por indicação de quem já estuda ou pela rede social.' },
    etapas: [
      e('cursos', 'catalogo', 'Apresenta', 'Cursos e turmas explicados', 'Cada curso tem a sua página, com o conteúdo, para quem é e como são as aulas.'),
      e('conversa', 'conversa', 'Orienta', 'Pergunta o objetivo e o nível', 'A conversa entende o que o aluno quer aprender e em que ponto ele está hoje.', { decisao: true }),
      e('aula', 'aula', 'Mostra', 'Aula experimental para conhecer', 'O aluno vê como é uma aula ou um trecho do material antes de decidir.'),
      e('matricula', 'formulario', 'Registra', 'Matrícula num passo só', 'A matrícula é preenchida numa tela simples, com os dados que a escola precisa.'),
      e('boasvindas', 'documento', 'Envia', 'Boas-vindas e informações por escrito', 'Chegam por escrito as informações do curso, as combinações da turma e o contato da escola.'),
      e('lembrete', 'lembrete', 'Lembra', 'Lembrete da aula e do material', 'Antes de cada aula chega o lembrete, com o material que o aluno precisa levar.'),
      e('proximo', 'retoma', 'Reativa', 'Chama de volta no fim do curso', 'Quando o curso termina, o site apresenta o próximo nível para quem quer seguir.', { retorno: true })
    ],
    fim: { titulo: 'Aluno matriculado', frase: 'A matrícula entra na lista da turma, com os dados completos para a escola.' },
    fecho: 'O aluno chegou, foi entendido, conheceu uma aula e se matriculou. A escola entra só na primeira aula.',
    rotulo_retorno: 'o aluno continua'
  },
  generico: {
    topologia: 'laco',
    chegada: { origens: ['busca', 'indicacao', 'direto'], titulo: 'Busca, indicação e link direto', frase: 'A pessoa chega procurando o que o negócio faz, por indicação ou direto pelo endereço.' },
    etapas: [
      e('pagina', 'pagina', 'Recebe', 'Página que explica o negócio', 'A página mostra o que o negócio faz e para quem, com a resposta que a pessoa busca primeiro.'),
      e('conversa', 'conversa', 'Conduz', 'Pergunta o que a pessoa precisa', 'A conversa entende o que a pessoa precisa e leva para o caminho certo, sem formulário longo.', { decisao: true }),
      e('opcoes', 'catalogo', 'Apresenta', 'Apresenta o que serve para ela', 'Mostra só o serviço ou o produto que combina com o que a pessoa contou, sem excesso.'),
      e('contato', 'formulario', 'Registra', 'Registra o contato e o pedido', 'O contato e o pedido ficam registrados num passo só, para ninguém precisar repetir.'),
      e('confirma', 'confirmacao', 'Confirma', 'Confirma que o pedido chegou', 'A pessoa recebe a confirmação de que o pedido chegou e do que acontece em seguida.'),
      e('novidade', 'aviso', 'Avisa', 'Avisa quando há novidade', 'Se algo muda, a pessoa é avisada pelo mesmo caminho em que conversou com o site.'),
      e('volta', 'retoma', 'Reativa', 'Chama de volta no momento certo', 'Passado um tempo, o site escreve de novo para quem já conversou, com algo útil.', { retorno: true })
    ],
    fim: { titulo: 'Pedido registrado', frase: 'O pedido chega ao negócio completo: quem é, o que quer e como prefere ser atendido.' },
    fecho: 'A pessoa chegou, foi entendida e deixou o pedido claro. O negócio entra só para atender.',
    rotulo_retorno: 'o site continua'
  }
});

export const CHAVES = Object.freeze(Object.keys(PLANOS));
const PADRAO = 'generico';

/* uma cópia nova (quem recebe pode mexer); chave desconhecida, ou de protótipo, vale "generico" */
export function planoPadrao(chave) {
  const k = typeof chave === 'string' && Object.hasOwn(PLANOS, chave) ? chave : PADRAO;
  return JSON.parse(JSON.stringify(PLANOS[k]));
}

/* ---------- o nicho pelo texto do briefing ---------- */
const TEXTO_MAX = 2000;
const VETERINARIO = /\b(?:veterin\w*|pets?|petshop|pet shop|banho e tosa)\b/;
const NICHOS = {
  saude_agenda: /\b(?:clinicas?|consultorios?|dentist\w*|odonto\w*|psicolog\w*|nutri\w*|fisioterap\w*|fonoaudio\w*|dermato\w*|estetic\w*|medic[oa]s?|terapeutas?|psicanalis\w*)\b/,
  servico_agenda: /\b(?:saloes|salao|barbearias?|barbeiros?|cabeleireir\w*|manicures?|tatuag\w*|tattoo|personal|pilates|yoga|academias?|crossfit|massag\w*|depilac\w*|sobrancelhas?|lash\w*|spa|banho e tosa|petshop|pet shop|pets?|veterin\w*)\b/,
  servico_orcamento: /\b(?:reformas?|marcenaria|marceneiros?|serralheria|instalac\w+|ar condicionado|limpeza|pintura|pintores?|eletricistas?|encanadores?|construc\w+|paisagismo|jardinagem|vidracaria|dedetizac\w+|mudancas?|gesso|pedreiros?|obras?)\b/,
  industria_b2b: /\b(?:industrias?|industrial|fabricas?|atacado|atacadista|distribuidoras?|embalagens?|usinagem|metalurgica|b2b|fornecedor\w*)\b/,
  loja_online: /\b(?:lojas?|moda|roupas?|varejo|e commerce|ecommerce|boutiques?|acessorios|calcados|joias|semijoias|cosmetic\w+|perfumaria|brech[oó]s?)\b/,
  alimentacao: /\b(?:restaurantes?|confeitaria|delivery|pizzarias?|lanchonetes?|padarias?|cafeterias?|hamburguerias?|marmit\w+|doceria|sorveterias?|buffet|cardapio|bolos?|salgados?)\b/,
  educacao: /\b(?:cursos?|escolas?|aulas?|professor\w*|idiomas|ingles|treinamentos?|cursinho|reforco escolar|escolinha|autoescola|mentoria)\b/
};

/* briefing -> chave do plano padrão. Nunca lança. Ambíguo, desconhecido ou advocacia: "generico" */
export function nichoDaPlanta(briefing) {
  try {
    const n = briefing && typeof briefing === 'object' && !Array.isArray(briefing) && briefing.negocio && typeof briefing.negocio === 'object' ? briefing.negocio : {};
    const partes = [n.segmento, n.descricao].filter(v => typeof v === 'string');
    const texto = partes.join(' ').slice(0, TEXTO_MAX);
    if (!texto.trim()) return PADRAO;
    const regulado = nichoRegulado(texto);
    if (regulado && regulado.chave === 'advocacia') return PADRAO;
    const busca = paraBusca(texto);
    const veterinario = VETERINARIO.test(busca);
    const achados = new Set();
    for (const [chave, re] of Object.entries(NICHOS)) {
      if (chave === 'saude_agenda' && veterinario) continue;   /* (médico veterinário e pet não são saúde humana) */
      if (re.test(busca)) achados.add(chave);
    }
    if (regulado) achados.add('saude_agenda');
    return achados.size === 1 ? [...achados][0] : PADRAO;
  } catch {
    return PADRAO;
  }
}
