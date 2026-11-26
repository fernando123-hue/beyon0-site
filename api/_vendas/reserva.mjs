/* ==========================================================================
   A DIREÇÃO DE RESERVA (17/11, o dono viu "Este modelo não saiu desta vez" no celular: "NUNCA poderá acontecer").
   Último degrau de gerarDirecaoGarantida (gerador.mjs): se o Opus e depois o Sonnet falharem, o código monta uma direção
   a partir do briefing, sem IA, em milissegundos, e ela passa pelo MESMO higienizar() e, em nicho regulado, pela MESMA
   conferência do conselho. Sempre sai uma direção válida: o visitante nunca fica sem modelo.
   Só usa o que a pessoa contou (nome, segmento, descrição, serviços, diferenciais, cidade). Nada inventado: o que falta vira
   texto neutro, sem número, sem depoimento, sem promessa. É a rede de segurança, não a vitrine: sai marcada com o modelo
   "reserva-codigo" para o dono medir a taxa de falha. Puro (sem rede, sem relógio, sem sorte).
   ========================================================================== */
import { higienizar, cortarNaFrase } from './direcao.mjs';
export { cortarNaFrase };
import { CONSELHOS, MARCADOR_REGISTRO, registroDoNicho } from './regras-conselhos.mjs';
import { conferirDirecao } from './conferencia-regulada.mjs';

export const MODELO_RESERVA_CODIGO = 'reserva-codigo';

/* a paleta e o jeito de cada estratégia (as cores já passam no contraste de leitura; higienizar confere de novo) */
const ESTILOS = {
  conversao: {
    conceito: 'Direto ao ponto', hero: 'split', tema: 'claro', cantos: 'suaves', densidade: 'equilibrada',
    paleta: { fundo: '#FFFFFF', superficie: '#F3F6F8', texto: '#111827', texto_suave: '#4B5563', destaque: '#0F766E', destaque_texto: '#FFFFFF' },
    fontes: { titulos: 'sans_geometrica', texto: 'sans_humanista' }
  },
  autoridade: {
    conceito: 'Sóbrio e confiável', hero: 'centro', tema: 'escuro', cantos: 'retos', densidade: 'arejada',
    paleta: { fundo: '#0F172A', superficie: '#1E293B', texto: '#F8FAFC', texto_suave: '#CBD5E1', destaque: '#D4A24C', destaque_texto: '#0F172A' },
    fontes: { titulos: 'serif_moderna', texto: 'sans_humanista' }
  },
  experiencia: {
    conceito: 'Com a sua cara', hero: 'faixa', tema: 'claro', cantos: 'redondos', densidade: 'arejada',
    paleta: { fundo: '#FBF7F2', superficie: '#F1E8DC', texto: '#2A1B14', texto_suave: '#6B5648', destaque: '#B4532A', destaque_texto: '#FFFFFF' },
    fontes: { titulos: 'serif_classica', texto: 'sans_humanista' }
  }
};

/* um resumo por estratégia: se as três caírem na reserva, o cliente não vê a mesma frase três vezes */
const RESUMOS = {
  conversao: nome => 'Uma página direta para ' + nome + ': mostra o que faz e leva ao contato.',
  autoridade: nome => 'Um visual sóbrio e escuro para ' + nome + ', que passa confiança antes do primeiro contato.',
  experiencia: nome => 'Um visual claro e acolhedor para ' + nome + ', com o jeito da casa desde o topo.'
};
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const lista = (v, max, itemMax) => (Array.isArray(v) ? v.map(x => texto(x, itemMax)).filter(Boolean).slice(0, max) : []);

/* nível 0: usa o que a pessoa contou; 1: só o nome e o segmento (se o conteúdo dela esbarrou na regra do conselho); 2: só o nome;
   3: nem o nome (o próprio nome pode esbarrar na regra, ex.: "Clínica Preço Justo"): só texto fixo, que passa em qualquer entrada */
function montar(briefing, estrategia, nicho, nivel) {
  const e = ESTILOS[estrategia] || ESTILOS.conversao;
  const neg = briefing?.negocio || {};
  const nome = (nivel <= 2 && texto(neg.nome, 60)) || 'Seu negócio';
  const segmento = nivel <= 1 ? texto(neg.segmento, 60) : '';
  const cidade = nivel === 0 ? texto(neg.cidade, 60) : '';
  const descricao = nivel === 0 ? cortarNaFrase(neg.descricao, 220) : '';
  const servicos = nivel === 0 ? lista(briefing?.servicos, 6, 60) : [];
  const diferenciais = nivel === 0 ? lista(briefing?.posicionamento?.diferenciais, 4, 80) : [];
  const linhaDeApoio = [segmento, cidade && 'em ' + cidade].filter(Boolean).join(' ');
  const whats = Array.isArray(briefing?.funcionalidades) && briefing.funcionalidades.includes('whatsapp');
  const cta = nicho ? 'Entrar em contato' : whats ? 'Falar no WhatsApp' : 'Pedir contato';

  const secoes = [
    { tipo: 'hero', variante: e.hero, rotulo: segmento, titulo: nome, subtitulo: descricao || linhaDeApoio || 'Conheça o nosso trabalho e fale com a gente.', texto: '', itens: [], cta }
  ];
  if (servicos.length) {
    secoes.push({ tipo: 'servicos', variante: 'cartoes', rotulo: 'O que fazemos', titulo: 'Nossos serviços', subtitulo: '', texto: '', itens: servicos.map(s => ({ titulo: s, texto: '' })), cta: '' });
  } else {
    secoes.push({ tipo: 'sobre', variante: 'split', rotulo: 'Sobre', titulo: 'Quem somos', subtitulo: '', texto: descricao || (linhaDeApoio ? nome + ': ' + linhaDeApoio + '.' : nome + '.'), itens: [], cta: '' });
  }
  if (diferenciais.length) {
    secoes.push({ tipo: 'diferenciais', variante: 'lista', rotulo: 'Por que nós', titulo: 'O que nos diferencia', subtitulo: '', texto: '', itens: diferenciais.map(d => ({ titulo: d, texto: '' })), cta: '' });
  }
  secoes.push({ tipo: 'contato', variante: 'centro', rotulo: 'Contato', titulo: 'Vamos conversar', subtitulo: 'Conte o que você precisa e a gente responde.', texto: '', itens: [], cta });

  const profissao = nicho && Object.hasOwn(CONSELHOS, nicho.chave) ? CONSELHOS[nicho.chave].profissao : '';
  const registro = nicho ? registroDoNicho(briefing?.negocio?.registro, nicho.chave) : null;
  const rodape = nicho ? nome + ', ' + profissao + ', ' + (registro || MARCADOR_REGISTRO) : nome;
  return {
    nome_conceito: e.conceito,
    resumo: RESUMOS[estrategia] ? RESUMOS[estrategia](nome) : RESUMOS.conversao(nome),
    identidade: { paleta: e.paleta, tipografia: e.fontes, estilo: { cantos: e.cantos, densidade: e.densidade, tema: e.tema } },
    navegacao: { marca: nome, itens: secoes.slice(1).map(s => s.rotulo || s.titulo).slice(0, 4), cta },
    secoes,
    rodape: { texto: rodape }
  };
}

/* devolve { direcao, ajustes, modelo, custo_usd, tentativas } no mesmo formato do gerarDirecao; nunca lança por conteúdo do briefing */
export function direcaoDeReserva({ briefing, estrategia, nicho = null, hoje = '', trilho = null }) {
  for (let nivel = 0; nivel <= 3; nivel++) {
    const h = higienizar(montar(briefing, estrategia, nicho, nivel), estrategia, trilho ? { trilho: { tipografia: trilho.tipografia } } : undefined);
    if (h.erro) continue;
    const c = nicho ? conferirDirecao(h.direcao, nicho, { hoje }) : { ok: true };
    if (c.ok) return { direcao: h.direcao, ajustes: h.ajustes, modelo: MODELO_RESERVA_CODIGO, custo_usd: 0, tentativas: 0 };
  }
  /* o nível 3 é texto fixo, sem dado do visitante: chegar aqui é erro de programação, e o teste de propriedade (nome incluído) o pega */
  throw new Error('direção de reserva inválida');
}
