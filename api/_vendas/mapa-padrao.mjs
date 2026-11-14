/* ==========================================================================
   O MAPA PADRÃO DO CASO, v3 (plano do PR 4 §7; spec 2026-11-13 §7). Quando o modelo erra o mapa duas vezes (ou não o chama), o servidor grava
   um mapa composto SÓ do que se sabe, sem acaso: a mesma entrada dá sempre o mesmo mapa (nada de Math.random nem de data). As 5 estruturas são
   alcançáveis e a escolha segue o guia do prompt (§7.1), na ordem:
     - com 2 origens ou mais E uma trava: "mapa" (várias forças);
     - com uma trava: "antes_depois" (a dor é trabalho repetido ou perda);
     - senão, a do nicho: "ciclo" (agenda: o ganho está na volta), "ramos" (orçamento, curso, loja: dois caminhos) ou "caminho".
   As origens entram como nó (1, ou 2 nos ramos e no mapa) e em hoje.origens (até 3); o texto e a trava do "hoje" só a partir do RÓTULO que a
   pessoa tocou (zero invenção: texto livre da trava não é lido). Sem nada conhecido, o mapa vai sem "hoje".
   Os textos são da Beyon, na voz do protótipo, e passam pelo MESMO validador do plano do modelo, com as travas, em todos os nichos, regulado ou
   não (docs/testes/planta-mapa-padrao.test.mjs). O v2 (api/_vendas/planta-padrao.mjs) segue para a leitura do que está gravado.
   ========================================================================== */
import R from '../../js/orcamento-rotulos.js';
import M from '../../js/orcamento-mapa-forma.js';

const congelar = o => { if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); } return o; };
const no = (id, papel, icone, titulo, frase) => ({ id, papel, icone, titulo, frase });

/* ---------- as 8 bases (sem nó de hoje, trava nem origem: esses vêm do caso) ---------- */
/* cada base: a estrutura do nicho, o nó do site, a ação, o 2º ramo (ramos) ou a volta (ciclo), o objetivo, o fecho e os rótulos das setas */
const BASES = congelar({
  saude_agenda: {
    estrutura: 'ciclo',
    site: no('pagina', 'site', 'pagina', 'Página do tratamento', 'Explica como é a avaliação e quem atende'),
    acao: no('horario', 'acao', 'agenda', 'Escolhe o horário', 'Vê os horários livres e marca ali mesmo'),
    volta: no('revisao', 'volta', 'lembrete', 'Lembrete da revisão', 'Na época da revisão, o site avisa e oferece horário'),
    rotulos: { siteAcao: 'tira a dúvida', fim: 'confirma', sai: 'depois do tratamento', volta: 'volta para' },
    objetivo: { titulo: 'Avaliação marcada', frase: 'A pessoa escolhe o horário e chega sabendo o que esperar' },
    fecho: 'O site tira a dúvida, mostra o horário livre e deixa a avaliação marcada.'
  },
  servico_agenda: {
    estrutura: 'ciclo',
    site: no('servicos', 'site', 'vitrine', 'Serviços à vista', 'Mostra cada serviço e o trabalho já feito'),
    acao: no('horario', 'acao', 'agenda', 'Escolhe dia e horário', 'Vê os horários livres da agenda e marca'),
    volta: no('volta', 'volta', 'retoma', 'Chama de volta na época', 'Quando chega a hora de repetir, o site avisa'),
    rotulos: { siteAcao: 'escolhe o serviço', fim: 'confirma', sai: 'depois do atendimento', volta: 'volta para' },
    objetivo: { titulo: 'Horário reservado', frase: 'O horário entra na agenda com o serviço combinado' },
    fecho: 'A pessoa escolhe o serviço, marca o horário e é lembrada de voltar.'
  },
  servico_orcamento: {
    estrutura: 'ramos',
    site: no('servicos', 'site', 'vitrine', 'Serviços e obras feitas', 'Mostra cada serviço com fotos de trabalhos feitos'),
    acao: no('fotos', 'acao', 'formulario', 'Manda fotos e medidas', 'No serviço simples, manda tudo pelo celular'),
    ramo: no('visita', 'conversa', 'agenda', 'Marca a visita', 'Quando precisa ver o local, escolhe um horário'),
    rotulos: { siteAcao: 'serviço simples', siteRamo: 'precisa de visita', fim: 'recebe a proposta', fimRamo: 'aprova depois' },
    objetivo: { titulo: 'Serviço aprovado', frase: 'O pedido chega completo: o que fazer e onde' },
    fecho: 'O cliente é entendido e o pedido chega claro para a equipe fazer o serviço.'
  },
  educacao: {
    estrutura: 'ramos',
    site: no('cursos', 'site', 'aula', 'Página de cada curso', 'Mostra o conteúdo, a turma e quem ensina'),
    acao: no('matricula', 'acao', 'formulario', 'Faz a matrícula', 'Quem já decidiu escolhe a turma e se inscreve'),
    ramo: no('duvida', 'conversa', 'conversa', 'Tira a dúvida antes', 'Quem ainda tem dúvida conversa e depois decide'),
    rotulos: { siteAcao: 'já decidiu', siteRamo: 'ainda tem dúvida', fim: 'confirma', fimRamo: 'decide e se inscreve' },
    objetivo: { titulo: 'Matrícula feita', frase: 'O aluno entra na turma certa sabendo o que esperar' },
    fecho: 'O aluno entende o curso, tira a dúvida e faz a matrícula pelo site.'
  },
  loja_online: {
    estrutura: 'ramos',
    site: no('catalogo', 'site', 'catalogo', 'Catálogo com as peças', 'Mostra cada peça com fotos e tamanhos'),
    acao: no('compra', 'acao', 'carrinho', 'Escolhe e compra', 'Quem já sabe o que quer finaliza o pedido'),
    ramo: no('duvida', 'conversa', 'conversa', 'Pergunta antes de comprar', 'Quem tem dúvida de tamanho conversa e decide'),
    rotulos: { siteAcao: 'já sabe o que quer', siteRamo: 'tem dúvida', fim: 'fecha o pedido', fimRamo: 'decide e compra' },
    objetivo: { titulo: 'Pedido feito', frase: 'O pedido chega com a peça, o tamanho e a entrega' },
    fecho: 'A cliente vê a peça, tira a dúvida e faz o pedido pelo site.'
  },
  industria_b2b: {
    estrutura: 'caminho',
    site: no('familias', 'site', 'caixa', 'Famílias de produto', 'Cada família com medidas, materiais e usos'),
    acao: no('pedido', 'acao', 'briefing', 'Pedido com as medidas', 'O comprador manda as cotas e a quantidade'),
    rotulos: { siteAcao: 'acha o que precisa', fim: 'chega ao comercial' },
    objetivo: { titulo: 'Pedido pronto', frase: 'O pedido chega completo ao comercial, sem ida e volta' },
    fecho: 'O comprador acha o que precisa e o pedido chega claro para o comercial.'
  },
  alimentacao: {
    estrutura: 'caminho',
    site: no('cardapio', 'site', 'cardapio', 'Cardápio à vista', 'Mostra os pratos, as opções e como pedir'),
    acao: no('pedido', 'acao', 'carrinho', 'Monta o pedido', 'Escolhe os itens e manda o pedido completo'),
    rotulos: { siteAcao: 'escolhe', fim: 'manda o pedido' },
    objetivo: { titulo: 'Pedido recebido', frase: 'O pedido chega certo, sem precisar repetir nada' },
    fecho: 'O cliente vê o cardápio, monta o pedido e ele chega certo para a cozinha.'
  },
  generico: {
    estrutura: 'caminho',
    site: no('pagina', 'site', 'pagina', 'Página do negócio', 'Mostra o que o negócio faz e para quem'),
    acao: no('conversa', 'acao', 'conversa', 'Conversa e pede', 'A pessoa tira a dúvida e deixa o pedido'),
    rotulos: { siteAcao: 'tira a dúvida', fim: 'deixa o pedido' },
    objetivo: { titulo: 'Contato recebido', frase: 'O pedido chega claro, com o que a pessoa precisa' },
    fecho: 'A pessoa entende o que o negócio faz e chega pronta para conversar.'
  }
});
export const CHAVES_DO_MAPA = Object.freeze(Object.keys(BASES));

/* ---------- o nó de cada origem (sem marca: o nome do canal é posto pela tela, pelo código) ---------- */
const NO_DE_ORIGEM = congelar({
  instagram: ['Vê o perfil', 'Chega pelo link do perfil, curiosa'],
  whatsapp: ['Manda mensagem', 'Chega pela conversa no celular'],
  google_busca: ['Procura e acha', 'Chega pela busca, procurando o serviço'],
  google_mapa: ['Acha no mapa', 'Procura perto de casa e chega pelo mapa'],
  indicacao: ['Chega indicada', 'Alguém contou e mandou o caminho'],
  passa_na_frente: ['Passa na frente', 'Vê a fachada e entra para perguntar'],
  facebook: ['Vê a página', 'Chega pela página do negócio na rede'],
  tiktok: ['Vê um vídeo', 'Chega curiosa depois de ver um vídeo'],
  site_atual: ['Acha o site antigo', 'Chega pelo site de hoje, sem resposta'],
  outro: ['Chega por outro canal', 'Ouve falar do negócio e procura']
});

/* ---------- a trava tocada vira dois nós (o que acontece hoje e o que se perde) e o rótulo vai para hoje.trava ---------- */
const TRAVA_V3 = congelar({
  responde_na_mao: [['Pergunta por mensagem', 'Cada dúvida é respondida na mão'], ['Responde uma por uma', 'O tempo vai embora repetindo a mesma resposta']],
  pergunta_e_some: [['Pergunta e espera', 'A dúvida fica sem resposta'], ['Some sem voltar', 'Quem perguntou vai embora e não volta']],
  nao_me_acham: [['Procura o serviço', 'Quem procura não encontra o negócio'], ['Acha outro lugar', 'Sem achar, a pessoa escolhe outro']],
  falta_consulta: [['Marca a consulta', 'A marcação fica sem confirmação'], ['Falta no dia', 'O horário fica vazio e ninguém avisa']],
  horario_vago: [['Agenda com buracos', 'Horários livres ficam sem ninguém saber'], ['Horário vago', 'O tempo livre passa sem atendimento']],
  visita_perdida: [['Pede uma visita', 'O pedido chega no meio do dia corrido'], ['A visita se perde', 'Ninguém retoma e o cliente desiste']],
  pedido_perdido: [['Pede na correria', 'O pedido chega solto, por vários lados'], ['O pedido se perde', 'Fica faltando item ou ninguém vê']],
  pergunta_estoque: [['Pergunta se tem', 'Cada um quer saber se tem a peça'], ['Responde de novo', 'A mesma pergunta volta o dia inteiro']],
  matricula_demora: [['Quer se matricular', 'A matrícula espera alguém responder'], ['Desiste de esperar', 'Sem resposta, procura outra escola']],
  ninguem_sabe: [['Tem evento marcado', 'O evento acontece e pouca gente sabe'], ['Fica de fora', 'Quem gostaria de ir nem fica sabendo']]
});

/* ---------- o que se sabe do caso: origens (até 3) e a trava, pelo briefing ---------- */
const TEXTO_MAX = 2000;
/* palavras-chave do texto livre (minúsculas, sem acento); "nao/nunca" até 3 palavras antes, na mesma oração, anula */
const ORIGEM_POR_PALAVRA = [
  ['instagram', /\b(?:instagram|insta|direct|reels?)\b/],
  ['whatsapp', /\b(?:whatsapp|whats|zap|zapzap|wpp)\b/],
  ['google_mapa', /\b(?:mapas?|maps|endereco)\b/],
  ['google_busca', /\b(?:google|busca|buscando|pesquisa\w*)\b/],
  ['indicacao', /\b(?:indica\w*|boca a boca)\b/],
  ['passa_na_frente', /\bpass\w* na frente\b|\bfachada\b/]
];
const NEGACAO = /\b(?:nao|nunca)(?: \w+){0,3}$/;
const temChave = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const textoDe = v => (typeof v === 'string' ? v.slice(0, TEXTO_MAX) : '');

export function oQueSeSabe(briefing) {
  const saber = { origens: [], trava: null, travaRotulo: '' };
  try {
    const s = briefing && typeof briefing === 'object' && briefing.situacao_atual && typeof briefing.situacao_atual === 'object' ? briefing.situacao_atual : {};
    const chegam = textoDe(s.como_chegam), perde = textoDe(s.o_que_se_perde);
    const tocadas = [], doTexto = [];
    /* 1) os rótulos tocados, como trecho exato */
    for (const [codigo, sug] of Object.entries(R.SUGESTOES)) {
      if (sug.campo === 'como_chegam' && chegam.includes(sug.rotulo) && temChave(M.ORIGEM_DA_SUGESTAO, codigo)) tocadas.push(M.ORIGEM_DA_SUGESTAO[codigo]);
    }
    /* 2) o texto livre: a palavra-chave vale se ALGUMA ocorrência não estiver negada dentro da MESMA oração ("não tenho site, só WhatsApp" é
       WhatsApp: a vírgula, o ponto, "mas" e "só" fecham a oração da negação; revisão técnica do PR 4). A pontuação fica (sem acento, minúsculas) */
    const texto = chegam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const [cod, re] of ORIGEM_POR_PALAVRA) {
      const todas = new RegExp(re.source, 'g');
      let m;
      while ((m = todas.exec(texto))) {
        const oracao = texto.slice(0, m.index).split(/[,;.!?\n]|\b(?:mas|so|porem)\b/).pop().trim();
        if (!NEGACAO.test(oracao)) { doTexto.push(cod); break; }
      }
    }
    /* o google do texto, com mapa e sem falar de busca, é só o mapa; ANTES do corte de 3 (senão a busca tomava a vaga de uma origem real) */
    const soMapa = doTexto.includes('google_mapa') && /\bgoogle\b/.test(texto) && !/\bbusca\w*|pesquisa\w*/.test(texto);
    const todas = [...tocadas, ...doTexto.filter(o => !(soMapa && o === 'google_busca' && !tocadas.includes(o)))];
    saber.origens = todas.filter((o, i) => todas.indexOf(o) === i).slice(0, M.LIMITES_MAPA.hoje_origens_max);
    /* 3) a trava: só o rótulo exato de uma sugestão (texto livre não é lido: não se inventa dor) */
    for (const [codigo, sug] of Object.entries(R.SUGESTOES)) {
      if (sug.campo === 'o_que_se_perde' && perde.includes(sug.rotulo) && temChave(TRAVA_V3, codigo)) { saber.trava = codigo; saber.travaRotulo = sug.rotulo; break; }
    }
  } catch { /* nada se sabe */ }
  return saber;
}

/* ---------- a composição: sempre a mesma função de (nicho, origens, trava) ---------- */
const s = (de, para, rotulo) => ({ de, para, rotulo });
const copia = v => JSON.parse(JSON.stringify(v));
function nosDeOrigem(origens, quantos) {
  return origens.slice(0, quantos).map((cod, i) => no('origem' + (i + 1), 'origem', 'chegada', NO_DE_ORIGEM[cod][0], NO_DE_ORIGEM[cod][1])).map((n, i) => ({ ...n, origem: origens[i] }));
}

export function planoDoCaso(chave, saberBruto) {
  const b = copia(temChave(BASES, chave) ? BASES[chave] : BASES.generico);
  const saber = saberBruto && typeof saberBruto === 'object' ? saberBruto : {};
  const origens = Array.isArray(saber.origens) ? saber.origens.filter(o => temChave(NO_DE_ORIGEM, o)).slice(0, M.LIMITES_MAPA.hoje_origens_max) : [];
  const trava = temChave(TRAVA_V3, saber.trava) ? saber.trava : null;
  const hoje = { origens };
  if (trava && typeof saber.travaRotulo === 'string' && saber.travaRotulo) hoje.trava = saber.travaRotulo;
  const plano = { estrutura: b.estrutura, nos: [], setas: [], objetivo: b.objetivo, fecho: b.fecho };
  const { site, acao, rotulos: r } = b;

  if (trava) {
    const [antes, perde] = TRAVA_V3[trava];
    const nHoje = no('hoje1', 'hoje', 'mensagem', antes[0], antes[1]), nTrava = no('trava1', 'trava', 'aviso', perde[0], perde[1]);
    if (origens.length >= 2) {
      /* várias forças: duas origens, a trava e o site que resolve */
      const [o1, o2] = nosDeOrigem(origens, 2);
      plano.estrutura = 'mapa';
      plano.nos = [o1, o2, nHoje, nTrava, site, acao];
      plano.setas = [s(o1.id, nHoje.id, 'chega por'), s(o2.id, nTrava.id, 'chega por'), s(nHoje.id, site.id, 'o site responde'), s(nTrava.id, site.id, 'o site cobre'),
        s(site.id, acao.id, r.siteAcao), s(acao.id, 'objetivo', r.fim)];
    } else {
      /* antes e depois: a faixa de hoje (o que acontece e o que se perde) e a do site */
      plano.estrutura = 'antes_depois';
      const o = nosDeOrigem(origens, 1);
      plano.nos = [...o, nHoje, nTrava, site, acao];
      plano.setas = [...o.map(x => s(x.id, nHoje.id, 'chega por')), s(nHoje.id, nTrava.id, 'espera'), s(nTrava.id, 'objetivo', 'às vezes chega'),
        s(site.id, acao.id, r.siteAcao), s(acao.id, 'objetivo', r.fim)];
    }
  } else if (b.estrutura === 'ramos') {
    const o = nosDeOrigem(origens, 2);
    plano.nos = [...o, site, acao, b.ramo];
    plano.setas = [...o.map(x => s(x.id, site.id, 'chega por')), s(site.id, acao.id, r.siteAcao), s(site.id, b.ramo.id, r.siteRamo),
      s(acao.id, 'objetivo', r.fim), s(b.ramo.id, 'objetivo', r.fimRamo)];
  } else if (b.estrutura === 'ciclo') {
    const o = nosDeOrigem(origens, 1);
    plano.nos = [...o, site, acao, b.volta];
    plano.setas = [...o.map(x => s(x.id, site.id, 'chega por')), s(site.id, acao.id, r.siteAcao), s(acao.id, 'objetivo', r.fim),
      s('objetivo', b.volta.id, r.sai), s(b.volta.id, acao.id, r.volta)];
  } else {
    const o = nosDeOrigem(origens, 1);
    plano.nos = [...o, site, acao];
    plano.setas = [...o.map(x => s(x.id, site.id, 'chega por')), s(site.id, acao.id, r.siteAcao), s(acao.id, 'objetivo', r.fim)];
  }
  /* sem nada conhecido, o mapa vai sem "hoje" (a forma aceita; o "hoje" vazio não vale) */
  return origens.length || hoje.trava ? { estrutura: plano.estrutura, hoje, nos: plano.nos, setas: plano.setas, objetivo: plano.objetivo, fecho: plano.fecho } : plano;
}
