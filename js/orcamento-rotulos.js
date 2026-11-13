/* ==========================================================================
   OS RÓTULOS DO ORÇAMENTO COMO CONVERSA (spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md, seções 1 e 6).
   Um módulo só, para a tela e para o servidor (como js/orcamento-planta-forma.js): os rótulos das listas fechadas que a
   pessoa toca, as sugestões do passo 4 por ramo (cada código diz em que campo da situação de hoje entra) e o molde da
   fala do "Mudar o que eu respondi". O servidor remonta essa fala a partir das respostas e só a aceita se for igual:
   assim a tela e o banco guardam o mesmo texto, e ninguém escreve outra coisa no lugar dela.
   ES5 sintático (var, function), como os módulos da planta.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcRotulos = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var congelar = function (o) { return Object.freeze(o); };

  /* as mesmas listas de api/_classificador/contrato.mjs (um teste confere), com o texto que a tela mostra */
  var RAMOS = congelar({ servicos: 'Serviços', saude: 'Saúde', beleza: 'Beleza', alimentacao: 'Alimentação', comercio: 'Comércio',
    educacao: 'Educação', associacao: 'Associação ou entidade', outro: 'Outro' });
  var OBJETIVOS = congelar({ pedidos_whatsapp: 'Receber pedidos e orçamentos pelo WhatsApp', achado_google: 'Ser achado no Google e no mapa',
    agendamentos: 'Agendamentos', vender_online: 'Vender online', apresentar: 'Apresentar a empresa', campanha: 'Uma campanha ou lançamento' });
  var SITE_ATUAL = congelar({ nao: 'Não tenho site', instagram: 'Só o Instagram', tenho_site: 'Tenho site', so_endereco: 'Tenho só o endereço (.com.br)' });
  var MATERIAL = congelar({ tenho: 'Tenho', parte: 'Tenho uma parte', nao: 'Não tenho' });

  /* as sugestões do passo 4 ("como os clientes chegam hoje e o que mais dá trabalho"): a pessoa toca em vez de escrever.
     campo: em que parte de situacao_atual o rótulo entra (o briefing já tem os dois campos) */
  var chega = function (rotulo) { return congelar({ rotulo: rotulo, campo: 'como_chegam' }); };
  var trava = function (rotulo) { return congelar({ rotulo: rotulo, campo: 'o_que_se_perde' }); };
  var SUGESTOES = congelar({
    instagram: chega('Pelo Instagram'),
    whatsapp: chega('Me chamam no WhatsApp'),
    indicacao: chega('Por indicação'),
    google: chega('Me acham no Google'),
    passa_na_frente: chega('Passam na frente da loja'),
    responde_na_mao: trava('Respondo preço e horário na mão'),
    pergunta_e_some: trava('Muita gente pergunta e some'),
    nao_me_acham: trava('Quem procura não me acha'),
    falta_consulta: trava('Paciente marca e falta'),
    horario_vago: trava('Fica horário vago na agenda'),
    visita_perdida: trava('Visita se perde no meio do dia'),
    pedido_perdido: trava('Pedido se perde na correria'),
    pergunta_estoque: trava('Perguntam o tempo todo se tem o produto'),
    matricula_demora: trava('A matrícula depende de eu responder'),
    ninguem_sabe: trava('Pouca gente fica sabendo dos eventos')
  });
  var SUGESTOES_POR_RAMO = congelar({
    servicos: congelar(['whatsapp', 'indicacao', 'google', 'responde_na_mao', 'visita_perdida', 'nao_me_acham']),
    saude: congelar(['instagram', 'whatsapp', 'indicacao', 'responde_na_mao', 'falta_consulta', 'nao_me_acham']),
    beleza: congelar(['instagram', 'whatsapp', 'indicacao', 'horario_vago', 'responde_na_mao']),
    alimentacao: congelar(['instagram', 'whatsapp', 'passa_na_frente', 'pedido_perdido', 'responde_na_mao']),
    comercio: congelar(['instagram', 'passa_na_frente', 'whatsapp', 'pergunta_estoque', 'nao_me_acham']),
    educacao: congelar(['instagram', 'indicacao', 'whatsapp', 'matricula_demora', 'responde_na_mao']),
    associacao: congelar(['instagram', 'indicacao', 'whatsapp', 'ninguem_sabe', 'pergunta_e_some']),
    outro: congelar(['instagram', 'whatsapp', 'indicacao', 'google', 'responde_na_mao', 'pergunta_e_some'])
  });

  /* o molde da fala do "Mudar": o servidor reconhece a mensagem por ele (e conta quantas já houve) */
  var MOLDE_MUDAR = 'Mudei minhas respostas: ';
  var SEP = ' · ';
  var minuscula = function (s) { return s.charAt(0).toLowerCase() + s.slice(1); };

  /* respostas (já validadas) -> a fala, ou null se não há resposta nenhuma. A ordem é a dos toques: ramo, objetivos, site, material */
  function falaDoMudar(r) {
    var partes = [], i;
    r = r || {};
    if (r.ramo && RAMOS[r.ramo]) partes.push(r.ramo === 'outro' && r.outro ? 'Outro: ' + r.outro : RAMOS[r.ramo]);
    if (r.objetivos && r.objetivos.length) for (i = 0; i < r.objetivos.length; i++) if (OBJETIVOS[r.objetivos[i]]) partes.push(OBJETIVOS[r.objetivos[i]]);
    if (r.site_atual && SITE_ATUAL[r.site_atual]) partes.push(SITE_ATUAL[r.site_atual]);
    if (r.material && MATERIAL[r.material]) partes.push('Logo e textos: ' + minuscula(MATERIAL[r.material]));
    return partes.length ? MOLDE_MUDAR + partes.join(SEP) : null;
  }

  /* ---------- o resumo fixo do passo 6 sem o consultor (spec §3): o que o site faz por ela, montado só de listas fechadas ----------
     Mecanismo, nunca promessa de resultado. A ordem: de onde chegam, o que a página faz (os objetivos) e a trava que ela tocou */
  var CHEGADA = congelar({ instagram: 'pelo Instagram', whatsapp: 'pelo WhatsApp', indicacao: 'por indicação', google: 'pelo Google', passa_na_frente: 'passando na frente' });
  var FAZ = congelar({
    pedidos_whatsapp: 'leva a pessoa direto para o seu WhatsApp, já sabendo o que você faz',
    achado_google: 'organiza o que você faz do jeito que quem procura no Google entende',
    agendamentos: 'deixa a pessoa marcar sem precisar te chamar',
    vender_online: 'mostra os produtos com preço e leva até a compra',
    apresentar: 'mostra o seu trabalho do jeito que você quer ser visto',
    campanha: 'dá à sua campanha uma página só dela'
  });
  var ALIVIA = congelar({
    responde_na_mao: 'Preço e horário ficam na página, e você responde menos coisa na mão.',
    pergunta_e_some: 'A dúvida mais comum já tem resposta ali, antes de a pessoa desistir.',
    nao_me_acham: 'Fica fácil entender quem você é e o que você faz.',
    falta_consulta: 'Quem marca já sai com o dia e a hora por escrito.',
    horario_vago: 'Os horários livres ficam à vista para quem quer marcar.',
    visita_perdida: 'O pedido de visita chega organizado, com o que você precisa saber.',
    pedido_perdido: 'O pedido chega organizado, sem se perder na correria.',
    pergunta_estoque: 'O que você tem fica à vista, com o jeito de pedir.',
    matricula_demora: 'Quem quer se matricular já encontra o caminho ali.',
    ninguem_sabe: 'Os eventos ficam num lugar só, fácil de passar adiante.'
  });
  function juntar(partes) { return partes.length < 2 ? partes.join('') : partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1]; }
  function resumoFixo(r, situacao) {
    var cods = situacao || [], i, chegadas = [], alivio = '', faz = [];
    for (i = 0; i < cods.length; i++) {
      if (CHEGADA[cods[i]]) chegadas.push(CHEGADA[cods[i]]);
      else if (!alivio && ALIVIA[cods[i]]) alivio = ALIVIA[cods[i]];
    }
    var obj = (r && r.objetivos) || [];
    for (i = 0; i < obj.length && !faz.length; i++) if (FAZ[obj[i]]) faz.push(FAZ[obj[i]]);
    if (!faz.length) faz.push(FAZ.apresentar);
    return 'Pelo que você contou, quem chega' + (chegadas.length ? ' ' + juntar(chegadas) : ' até você') + ' cai numa página sua que ' + juntar(faz) + '.' + (alivio ? ' ' + alivio : '');
  }

  /* ---------- o texto do aceite (spec §5, cartão 8e), com VERSÃO: a tela manda a versão que mostrou e o servidor só aceita a vigente,
     gravando a versão e o hash deste texto junto do aceite (LGPD art. 8º §2º: a prova do consentimento é do controlador). Mudou uma
     vírgula, sobe a versão (um teste fixa o hash da vigente) ---------- */
  var ACEITE = congelar({
    versao: 'a1',
    texto: 'A Beyon Zero guarda estes dados e a nossa conversa para preparar os três modelos e te avisar no WhatsApp quando ficarem prontos. ' +
      'Não vendemos os seus dados. Usamos empresas que fazem o serviço funcionar (guardar os dados e a inteligência artificial que conversa com você e ajuda a montar os modelos); a lista está em "Como tratamos os dados". ' +
      'Sem contrato, a conversa é apagada em 2 meses e o contato em 12 meses, ou antes, se você pedir. As redes do negócio, se você passar, são apagadas em 60 dias.'
  });

  return congelar({
    RAMOS: RAMOS, OBJETIVOS: OBJETIVOS, SITE_ATUAL: SITE_ATUAL, MATERIAL: MATERIAL,
    SUGESTOES: SUGESTOES, SUGESTOES_POR_RAMO: SUGESTOES_POR_RAMO,
    MOLDE_MUDAR: MOLDE_MUDAR, falaDoMudar: falaDoMudar, resumoFixo: resumoFixo, ACEITE: ACEITE
  });
});
