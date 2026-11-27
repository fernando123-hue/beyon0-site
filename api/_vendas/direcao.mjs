/* ==========================================================================
   UMA DIREÇÃO DE SITE como ESTRUTURA (nunca HTML do modelo; decisão técnica
   em docs/fase2/00-AUDITORIA-E-ANALISE.md §5): o modelo devolve este JSON
   (saída estruturada por JSON Schema), este módulo valida e higieniza (lista
   fechada, tamanhos, cores hexadecimais, contraste de leitura), e o renderer
   da Beyon Zero (js/previa.js) monta a prévia com textContent. Resultado:
   sem XSS, CSP sem inline preservada, acabamento consistente, e as
   alterações do cliente viram operações sobre este JSON.
   Zero dado inventado: depoimento, número, prêmio ou cliente que não vieram
   do briefing aparecem como ESPAÇO RESERVADO ("[ … ]"), nunca como fato.
   ========================================================================== */
export const ESTRATEGIAS = {
  conversao: 'CONVERSÃO: clareza imediata da oferta, chamadas para ação fortes e repetidas, hierarquia comercial, prova perto do botão, poucos cliques até o contato. O topo (hero) em split: o título diz o que o negócio faz e para quem, com o botão de contato à vista.',
  autoridade: 'AUTORIDADE: posicionamento e confiança, tom sóbrio e premium, credenciais e método, prova social em destaque, ritmo calmo e espaçoso. O topo (hero) em centro, sóbrio: o título fala do jeito de trabalhar (o cuidado, o método), nunca a lista de serviços.',
  experiencia: 'EXPERIÊNCIA: diferenciação e narrativa, a história do negócio contada em sequência, composição visual marcante, seções que surpreendem sem atrapalhar o contato. O topo (hero) em faixa: o título começa a história (o porquê ou a origem do negócio), com outras palavras que não a lista de serviços.'
};
export const TIPOS_SECAO = ['hero', 'servicos', 'sobre', 'diferenciais', 'processo', 'depoimentos', 'numeros', 'galeria', 'faq', 'cta', 'contato', 'equipe', 'destaque', 'localizacao'];
export const VARIANTES = ['split', 'centro', 'cartoes', 'lista', 'faixa', 'grade', 'linha_do_tempo'];
export const FONTES = ['sans_geometrica', 'sans_humanista', 'serif_classica', 'serif_moderna', 'mono_tecnica'];
/* O ÍCONE de cada item: lista FECHADA (o renderer, js/previa.js, desenha cada nome com traço próprio; nenhum nome fora dela chega à tela).
   O modelo escolhe pelo serviço ("raio" para elétrica, "bolo" para confeitaria); "nenhum" quando nenhum serve. Direção gravada antes do ícone
   não tem a chave e continua válida. */
export const ICONES = ['nenhum', 'calendario', 'relogio', 'local', 'mensagem', 'telefone', 'escudo', 'estrela', 'coracao', 'casa', 'raio', 'folha', 'gota', 'floco', 'sol', 'bolo', 'documento', 'caixa', 'equipe', 'check', 'lampada', 'regua',
  'dente', 'tesoura', 'ferramenta', 'pata', 'haltere', 'talher', 'camera', 'carro', 'livro', 'martelo', 'balanca', 'pincel', 'cifrao', 'musica', 'saude'];
/* O topo de cada estratégia (a regra do dono: os três modelos de um cliente nunca abrem do mesmo jeito): o código fixa, o modelo não escolhe */
export const TOPO_DA_ESTRATEGIA = { conversao: 'split', autoridade: 'centro', experiencia: 'faixa' };
/* O TRILHO de identidade (achado 1 da lapidação de 25/11; regra do dono de 20/11, nunca padronizar): as três chamadas da geração correm
   separadas e uma não vê a outra, então saíam com a mesma fonte, o mesmo tema claro e a mesma família de cor. O código reparte antes:
   títulos em três fontes diferentes, um só modelo escuro e o destaque de cada um numa família de cor diferente. A divisão gira pelo
   pedido (semente), para dois clientes também não saírem iguais. As fontes o código fixa (como o topo); tema e cor vão ao modelo no
   pedido, porque a paleta inteira tem de combinar com eles, e o higienizar() anota em `ajustes` quando o modelo saiu do tema pedido. */
export const TEMPERATURAS = {
  quente: 'família quente (vermelhos, laranjas, corais, dourados)',
  fria: 'família fria (azuis, verdes, turquesas, violetas)',
  terrosa: 'família terrosa ou neutra (marrons, ocres, oliva, grafite, areia)'
};
/* para cada fonte de título, o texto que contrasta com ela (o 2º número do hash escolhe qual) */
const TEXTO_DO_TITULO = { serif_moderna: ['sans_humanista', 'sans_geometrica'], sans_geometrica: ['serif_classica', 'sans_humanista'], serif_classica: ['sans_geometrica', 'sans_humanista'] };
const TITULOS = Object.keys(TEXTO_DO_TITULO);
const PERMUTACOES = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const ORDEM_ESTRATEGIAS = ['conversao', 'autoridade', 'experiencia'];
const textoSeguro = v => (typeof v === 'string' ? v.trim().toLowerCase() : '');
/* FNV-1a de 32 bits: estável entre servidor, testes e reexecuções (o mesmo briefing dá sempre o mesmo trilho) */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
/* semente = o id do pedido (conversa_id). As três chamadas leem o briefing do banco cada uma na sua hora, e ele pode mudar entre elas (a
   pessoa segue conversando): girar pelo texto do briefing faria as três caírem em trilhos de giros diferentes e perder a garantia. Com a
   semente, as três giram igual. Sem semente (testes, medição), gira pelo nome e o segmento */
export function trilhoDaDirecao(briefing, estrategia, semente = '') {
  const i = ORDEM_ESTRATEGIAS.indexOf(estrategia);
  if (i < 0) return null;
  const n = briefing && typeof briefing === 'object' && briefing.negocio && typeof briefing.negocio === 'object' ? briefing.negocio : {};
  const chave = typeof semente === 'string' && semente ? semente : textoSeguro(n.nome) + '|' + textoSeguro(n.segmento);
  const h = hash(chave);
  const titulos = TITULOS[PERMUTACOES[h % 6][i]];
  const temperatura = Object.keys(TEMPERATURAS)[PERMUTACOES[(h >>> 3) % 6][i]];
  return {
    tipografia: { titulos, texto: TEXTO_DO_TITULO[titulos][(h >>> (6 + i)) & 1] },
    tema: (h >>> 9) % 3 === i ? 'escuro' : 'claro',
    temperatura,
    /* o molde "X, não Y" só numa das três (26/11: dois modelos abriam com a mesma ideia, "feito para a sua festa, não para a vitrine").
       Hash próprio (revisão do #271): com os bits 11+ do mesmo h, o molde caía no modelo escuro em 50% das vezes, não em 33% */
    contraste: hash('molde|' + chave) % 3 === i
  };
}
/* o trecho do pedido que leva o trilho ao modelo (fora do briefing: é do código) */
const fraseDoMolde = t => (t.contraste ? 'no máximo um título no molde "X, não Y"' : 'nenhum título no molde "X, não Y" (outro modelo do cliente usa esse recurso)');
export const pedidoDoTrilho = t => (t ? '\n\nIDENTIDADE FIXADA PELO CÓDIGO (os três modelos do cliente nunca saem iguais): tema ' + t.tema +
  ' (a paleta inteira segue o tema); a cor de destaque na ' + TEMPERATURAS[t.temperatura] + ', no tom que combina com este negócio; ' + fraseDoMolde(t) + '. A tipografia o código aplica.' : '');
/* quantos títulos de seção estão no molde de contraste ("X, não Y", também com travessão); "Não espere..." no começo não conta, e
   travessão ou hífen só valem com espaço antes ("Pós-não sei" não é contraste) */
const MOLDE_CONTRASTE = /(?:[,;]|\s[—–-])\s*n[aã]o\s/i;
export const titulosNoMolde = d => (d && Array.isArray(d.secoes) ? d.secoes.filter(s => typeof s?.titulo === 'string' && MOLDE_CONTRASTE.test(s.titulo)).length : 0);
/* o que ocupa o lugar de um número que o briefing não trouxe (o renderer o desenha como espaço reservado) */
export const NUMERO_A_CONFIRMAR = '[Número a confirmar]';
const HEX = /^#[0-9a-fA-F]{6}$/;

const s = (props, req) => ({ type: 'object', additionalProperties: false, properties: props, required: req || Object.keys(props) });
const texto = { type: 'string' };
const ITEM = s({ titulo: texto, texto: texto, icone: { type: 'string', enum: ICONES } });
/* o esquema que o modelo é obrigado a seguir (sem limites numéricos: o JSON Schema da API não os aceita; quem limita é higienizar()) */
export const ESQUEMA_DIRECAO = s({
  nome_conceito: texto,
  resumo: texto,
  identidade: s({
    paleta: s({ fundo: texto, superficie: texto, texto: texto, texto_suave: texto, destaque: texto, destaque_texto: texto }),
    tipografia: s({ titulos: { type: 'string', enum: FONTES }, texto: { type: 'string', enum: FONTES } }),
    estilo: s({ cantos: { type: 'string', enum: ['retos', 'suaves', 'redondos'] }, densidade: { type: 'string', enum: ['arejada', 'equilibrada', 'compacta'] }, tema: { type: 'string', enum: ['claro', 'escuro'] } })
  }),
  navegacao: s({ marca: texto, itens: { type: 'array', items: texto }, cta: texto }),
  secoes: { type: 'array', items: s({
    tipo: { type: 'string', enum: TIPOS_SECAO },
    variante: { type: 'string', enum: VARIANTES },
    rotulo: texto, titulo: texto, subtitulo: texto, texto: texto,
    itens: { type: 'array', items: ITEM },
    cta: texto
  }) },
  rodape: s({ texto: texto })
});

/* ---------- contraste (WCAG 2.x) ---------- */
function luminancia(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const legivelSobre = fundo => (contraste('#111111', fundo) >= contraste('#FFFFFF', fundo) ? '#111111' : '#FFFFFF');

/* ---------- higienização (o que vai para o banco e para a tela) ---------- */
const t = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const LOREM = /lorem ipsum|dolor sit amet/i;

/* o teto de seções de um modelo: o higienizar corta aqui; ajustar confere antes de acrescentar (fluxo-ajustes.mjs) */
export const MAX_SECOES = 12;

/* corta na última frase inteira que cabe no limite (ou, sem ponto, na última palavra): nunca no meio da palavra nem com parêntese aberto.
   (17/11, dono: a descrição do modelo saía com 400 caracteres e cortada em "(bolo") */
export function cortarNaFrase(s, max) {
  const t = typeof s === 'string' ? s.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (t.length <= max) return t;
  const pedaco = t.slice(0, max);
  const ponto = Math.max(pedaco.lastIndexOf('. '), pedaco.lastIndexOf('! '), pedaco.lastIndexOf('? '));
  if (ponto >= max * 0.4) return pedaco.slice(0, ponto + 1);
  const espaco = pedaco.lastIndexOf(' ');
  return (espaco > 0 ? pedaco.slice(0, espaco) : pedaco).replace(/[,;:(\-–]+$/, '').trim();
}
/* o rótulo curto acima do título (40 caracteres, dito ao modelo no SISTEMA_GERACAO): passou do limite, corta entre palavras e tira o
   que ficou pendurado no fim (separador ou conectivo), para nunca sair "previdenciária e" nem "· Ca" (27/11, rodada real em 8 ramos) */
export const MAX_ROTULO = 40;
const PENDURADO = /(?:[\s,;:·–-]+|\s(?:e|ou|em|de|do|da|dos|das|no|na|nos|nas|para|com|por|a|o|à))$/i;
function cortarRotulo(v) {
  const s = t(v, Infinity);
  if (s.length <= MAX_ROTULO) return s;
  const espaco = s.lastIndexOf(' ', MAX_ROTULO);
  let corte = /\s/.test(s[MAX_ROTULO]) || espaco <= 0 ? s.slice(0, MAX_ROTULO) : s.slice(0, espaco);
  while (PENDURADO.test(corte)) corte = corte.replace(PENDURADO, '');
  return corte.trim();
}

/* o que cada modelo diz de si na tela: até 2 frases e 180 caracteres (as pessoas não gostam de ler) */
export const MAX_RESUMO = 180;
export function resumoCurto(s) {
  const corte = cortarNaFrase(s, MAX_RESUMO);
  const frases = corte.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [corte];
  return frases.slice(0, 2).join('').trim();
}

/* Zero dado inventado: o número da seção "numeros" só fica se TODOS os grupos de dígitos dele aparecem no briefing (grupo inteiro: "1000" não vale
   por um telefone terminado em 1000). Senão vira espaço reservado. Só a geração passa o briefing; ajuste do cliente e fila manual não passam por aqui. */
/* separador de milhar não separa o número: "1.000" e "1000" são o mesmo (vale nos dois lados da conferência) */
const semMilhar = v => v.replace(/(?<=\d)[.,](?=\d{3}(?!\d))/g, '');
const gruposDeDigitos = v => semMilhar(String(v).normalize('NFKC')).match(/\p{Nd}+/gu) || [];   /* NFKC + \p{Nd}: "１００" (largura total) conta como 100 */
/* os VALORES de texto e número do briefing (as chaves e os ids técnicos não contam: a chave "q1" não autoriza "1 ano"); iterativo e com teto, porque o briefing é
   dado do visitante. A trava é uma heurística (grupo curto como "5" quase sempre aparece em algum endereço ou data); a primeira linha de defesa é o prompt. */
const MAX_NOS_DO_BRIEFING = 5000;
function textosDoBriefing(briefing) {
  const fila = [briefing], achados = [];
  for (let n = 0; fila.length && n < MAX_NOS_DO_BRIEFING; n++) {
    const v = fila.pop();
    if (typeof v === 'string' || typeof v === 'number') achados.push(String(v));
    else if (Array.isArray(v)) for (const x of v) fila.push(x);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) fila.push(x);
  }
  return achados.join(' ');
}
/* true quando o texto tem número que o briefing não trouxe. O espaço reservado legítimo ("[Anos de oficina]") não tem dígito e passa por isso;
   "[100%]" tem dígito e NÃO passa (a revisão técnica do PR achou que o atalho dos colchetes deixava o número inventado na tela) */
function numeroInventado(texto, digitosDoBriefing) {
  if (!digitosDoBriefing) return false;
  const grupos = gruposDeDigitos(texto);
  return grupos.length > 0 && !grupos.every(g => digitosDoBriefing.has(g));
}

/* opcoes (só a GERAÇÃO passa; ajuste do cliente, fila manual e painel chamam sem elas e nada muda para eles):
   briefing  = o briefing da geração, para a conferência do número;
   fixarTopo = o topo (hero) é o da estratégia (TOPO_DA_ESTRATEGIA), não o que o modelo escolheu;
   trilho    = as fontes são as do trilho (trilhoDaDirecao), não as do modelo; trilho com fonte fora da lista não vale. */
export function higienizar(bruta, estrategia, opcoes) {
  const { briefing, fixarTopo, trilho } = opcoes || {};
  if (!bruta || typeof bruta !== 'object') return { erro: 'direção vazia' };
  /* só a geração (api/_vendas/gerador.mjs) tem o briefing e o passa; a fila manual (o POST do painel que grava a direção) não o tem: lá o número
     do arquivo da sessão do dono segue como veio (a conferência da sessão e a revisão dela cobrem esse caminho) */
  const digitosDoBriefing = briefing && typeof briefing === 'object' ? new Set(gruposDeDigitos(textosDoBriefing(briefing))) : null;
  const d = bruta;
  const pal = d.identidade?.paleta || {};
  const cor = (v, padrao) => (HEX.test(v || '') ? v.toUpperCase() : padrao);
  const paleta = {
    fundo: cor(pal.fundo, '#FFFFFF'), superficie: cor(pal.superficie, '#F4F4F4'),
    texto: cor(pal.texto, '#111111'), texto_suave: cor(pal.texto_suave, '#555555'),
    destaque: cor(pal.destaque, '#1CB5B9'), destaque_texto: cor(pal.destaque_texto, '#FFFFFF')
  };
  /* contraste de leitura: texto ≥ 4,5:1 sobre fundo e superfície; botão ≥ 4,5:1 — corrigido, não recusado */
  const ajustes = [];
  if (contraste(paleta.texto, paleta.fundo) < 4.5 || contraste(paleta.texto, paleta.superficie) < 4.5) { paleta.texto = legivelSobre(paleta.fundo); ajustes.push('texto'); }
  if (contraste(paleta.texto_suave, paleta.fundo) < 3) { paleta.texto_suave = paleta.texto; ajustes.push('texto_suave'); }
  if (contraste(paleta.destaque_texto, paleta.destaque) < 4.5) { paleta.destaque_texto = legivelSobre(paleta.destaque); ajustes.push('destaque_texto'); }

  const tipT = trilho?.tipografia;
  const trilhoValido = tipT && FONTES.includes(tipT.titulos) && FONTES.includes(tipT.texto);
  const tip = trilhoValido ? tipT : (d.identidade?.tipografia || {}), est = d.identidade?.estilo || {};
  const secoes = (Array.isArray(d.secoes) ? d.secoes : []).filter(x => x && TIPOS_SECAO.includes(x.tipo)).slice(0, MAX_SECOES).map(x => ({
    tipo: x.tipo,
    variante: VARIANTES.includes(x.variante) ? x.variante : 'centro',
    rotulo: cortarRotulo(x.rotulo), titulo: t(x.titulo, 120), subtitulo: t(x.subtitulo, 220), texto: t(x.texto, 700),
    itens: (Array.isArray(x.itens) ? x.itens : []).slice(0, 8).map(i => {
      const item = { titulo: t(i?.titulo, 80), texto: t(i?.texto, 300) };
      if (x.tipo === 'numeros') {   /* o número e o rótulo dele: um "300 clientes" no rótulo também é número inventado */
        if (numeroInventado(item.titulo, digitosDoBriefing)) item.titulo = NUMERO_A_CONFIRMAR;
        if (numeroInventado(item.texto, digitosDoBriefing)) item.texto = '';
      }
      const icone = typeof i?.icone === 'string' && i.icone !== 'nenhum' && ICONES.includes(i.icone) ? i.icone : '';
      return icone ? { ...item, icone } : item;
    }).filter(i => i.titulo || i.texto),
    cta: t(x.cta, 40)
  })).filter(x => x.titulo || x.texto || x.itens.length);

  if (secoes.length < 3) return { erro: 'direção com poucas seções' };
  if (secoes[0].tipo !== 'hero') secoes.unshift({ tipo: 'hero', variante: 'centro', rotulo: '', titulo: t(d.navegacao?.marca, 120) || 'Seu negócio', subtitulo: '', texto: '', itens: [], cta: t(d.navegacao?.cta, 40) });
  const topo = fixarTopo && Object.hasOwn(TOPO_DA_ESTRATEGIA, estrategia) ? TOPO_DA_ESTRATEGIA[estrategia] : null;
  if (topo) secoes[0] = { ...secoes[0], variante: topo };
  const direcao = {
    nome_conceito: t(d.nome_conceito, 60) || 'Direção',
    estrategia,
    resumo: resumoCurto(d.resumo),
    identidade: {
      paleta,
      tipografia: { titulos: FONTES.includes(tip.titulos) ? tip.titulos : 'sans_geometrica', texto: FONTES.includes(tip.texto) ? tip.texto : 'sans_humanista' },
      estilo: { cantos: ['retos', 'suaves', 'redondos'].includes(est.cantos) ? est.cantos : 'suaves', densidade: ['arejada', 'equilibrada', 'compacta'].includes(est.densidade) ? est.densidade : 'equilibrada', tema: est.tema === 'escuro' ? 'escuro' : 'claro' }
    },
    navegacao: { marca: t(d.navegacao?.marca, 60) || 'Sua marca', itens: (Array.isArray(d.navegacao?.itens) ? d.navegacao.itens : []).map(i => t(i, 24)).filter(Boolean).slice(0, 6), cta: t(d.navegacao?.cta, 30) || 'Fale conosco' },
    secoes,
    rodape: { texto: t(d.rodape?.texto, 200) }
  };
  if (LOREM.test(JSON.stringify(direcao))) return { erro: 'texto de preenchimento (lorem ipsum)' };
  /* o tema e o molde não se forçam (a paleta do modelo é feita para o tema dele; reescrever título é do modelo): só se anota o desvio,
     para a medição ver se o modelo obedece */
  const temaFora = trilhoValido && (trilho.tema === 'escuro' || trilho.tema === 'claro') && trilho.tema !== direcao.identidade.estilo.tema;
  const moldeFora = trilhoValido && trilho.contraste === false && titulosNoMolde(direcao) > 0;
  return { direcao, ajustes: [...ajustes, ...(temaFora ? ['tema_fora_do_trilho'] : []), ...(moldeFora ? ['molde_x_nao_y'] : [])] };
}
