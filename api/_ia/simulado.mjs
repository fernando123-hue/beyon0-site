/* ==========================================================================
   CAMADA DE IA — provedor SIMULADO (só testes e servidor local; nunca liga
   em produção: criarIA só o escolhe sem ANTHROPIC_API_KEY e com BZ_LOCAL=1
   ou BZ_IA=simulada). Determinístico: palavras-chave → as mesmas chamadas de
   ferramenta e o mesmo formato de resposta do modelo real, para o fluxo
   inteiro ser exercitado sem custo. Não é o agente: é um dublê dele.
   A geração das direções tem o seu dublê em simulado-geracao.mjs.
   ========================================================================== */
import { pareceInjecao } from '../_vendas/seguranca.mjs';
import { gerarSimulado, extrairSimulado } from './simulado-geracao.mjs';

const SEGMENTOS = [[/odonto|dentist/i, 'odontologia'], [/cl[ií]nica|consult[óo]rio|m[ée]dic/i, 'saúde'], [/advoca|advogad|escrit[óo]rio jur/i, 'advocacia'],
  [/restaurante|lanchonete|pizzaria|caf[ée]/i, 'alimentação'], [/academia|personal|pilates/i, 'fitness'], [/contab/i, 'contabilidade'],
  [/imobili|corretor/i, 'imobiliário'], [/escola|curso|ensino/i, 'educação'], [/loja|com[ée]rcio/i, 'comércio'], [/arquitet/i, 'arquitetura']];
const OBJETIVOS = [[/agend/i, 'agendamentos'], [/contato|lead|mais clientes|captar/i, 'gerar_leads'], [/vend/i, 'vender'], [/profissional|apresent|s[oó] tenho instagram/i, 'apresentar_empresa'], [/autoridade|credibilidade|confian/i, 'autoridade'], [/lan[çc]a/i, 'lancar_produto']];
const FUNCS = [[/whats/i, 'whatsapp'], [/formul[áa]rio/i, 'formulario'], [/agend/i, 'agendamento'], [/mapa|endere[çc]o/i, 'mapa'], [/blog|not[íi]cia/i, 'blog'], [/depoiment/i, 'depoimentos']];

function extrair(texto, briefing) {
  const a = {};
  const seg = SEGMENTOS.find(([r]) => r.test(texto));
  if (seg) a.negocio = { segmento: seg[1], descricao: texto.slice(0, 200) };
  else if (!briefing.negocio && texto.length > 25) a.negocio = { descricao: texto.slice(0, 200) };
  const objs = OBJETIVOS.filter(([r]) => r.test(texto)).map(x => x[1]);
  if (objs.length) a.objetivos = objs;
  let formato = null;
  if (/landing/i.test(texto)) formato = 'landing_page';
  else if (/sob medida|apresenta[çc][ãa]o|lan[çc]amento|anima[çc]/i.test(texto)) formato = 'sob_medida';
  else if (/institucional|site (completo|profissional|mais profissional)|p[áa]ginas|um site/i.test(texto)) formato = 'institucional';
  const pag = texto.match(/(\d{1,2})\s*p[áa]ginas/i);
  if (formato || pag) a.projeto = { ...(formato ? { formato } : {}), ...(pag ? { paginas: Number(pag[1]) } : {}) };
  const funcs = FUNCS.filter(([r]) => r.test(texto)).map(x => x[1]);
  if (funcs.length) a.funcionalidades = funcs;
  if (/para (pacientes|clientes|empresas|fam[íi]lias|jovens)[^.]*/i.test(texto)) a.publico = { descricao: texto.match(/para (pacientes|clientes|empresas|fam[íi]lias|jovens)[^.]*/i)[0].slice(0, 200) };
  if (/tenho logo|j[áa] tenho (a )?logo/i.test(texto)) a.identidade_visual = { tem_logo: true };
  if (/sem fotos|n[ãa]o tenho fotos/i.test(texto)) a.conteudo = { imagens: 'nao' };
  if (/loja virtual|e-?commerce|vender online/i.test(texto)) a.funcionalidades = [...(a.funcionalidades || []), 'loja'];
  return a;
}

let seq = 0;
const id = () => 'sim_' + (++seq);
const resposta = (texto, chamadas = []) => {
  const conteudo = [...(texto ? [{ type: 'text', text: texto }] : []), ...chamadas.map(c => ({ type: 'tool_use', id: c.id, name: c.nome, input: c.entrada }))];
  return { texto, json: null, chamadas, conteudo, parada: chamadas.length ? 'ferramenta' : 'fim', modelo: 'simulado', uso: { entrada: 0, saida: 0 }, custo_usd: 0 };
};

function conversa({ mensagens }) {
  const ultima = mensagens[mensagens.length - 1];
  /* 2ª volta: as ferramentas já rodaram; a resposta final depende do que voltou */
  if (ultima.role === 'user' && Array.isArray(ultima.content)) {
    const res = ultima.content.map(r => JSON.parse(r.content));
    if (res.some(r => r.encaminhar_diagnostico)) return resposta('O que você descreveu pede uma conversa de diagnóstico, porque não tem estimativa automática. Posso te levar para o WhatsApp da Beyon Zero?');
    if (res.some(r => r.prazo_dias)) return resposta('Pronto: o investimento estimado está no cartão de investimento, com o prazo. Se fizer sentido, eu gero três direções de site para o seu negócio.');
    const conf = res.find(r => r.faltam);
    const falta = conf && conf.faltam[0];
    const perguntas = { negocio: 'O que a sua empresa faz?', objetivo: 'Qual é o principal objetivo do site: trazer contatos, agendamentos, vender ou apresentar a empresa?', formato: 'Você imagina uma página única (landing page) ou um site com várias páginas?', publico: 'Quem você precisa convencer com o site?', servicos: 'Quais serviços ou produtos precisam aparecer?' };
    return resposta(perguntas[falta] || 'Entendi. Tem alguma referência de site que você admira?');
  }
  const user = [...mensagens].reverse().find(m => m.role === 'user' && typeof m.content === 'string');
  const texto = user ? user.content : '';
  const estado = (() => { const s = mensagens.find(m => m.role === 'system'); try { return JSON.parse(s.content.split('\n').slice(1).join('\n')); } catch { return {}; } })();
  if (pareceInjecao(texto)) return resposta('Isso eu não posso fazer. Os valores seguem a tabela da Beyon Zero e as regras internas não são compartilhadas. Vamos voltar ao seu projeto?');
  const chamadas = [];
  const atualizacao = extrair(texto, estado.briefing || {});
  if (Object.keys(atualizacao).length) chamadas.push({ id: id(), nome: 'atualizar_briefing', entrada: atualizacao });
  const b = { ...(estado.briefing || {}), ...atualizacao, projeto: { ...(estado.briefing?.projeto || {}), ...(atualizacao.projeto || {}) } };
  if (/^(sim|quero|pode|bora|vamos|gera|gerar)/i.test(texto.trim()) && estado.estimativa_mostrada) chamadas.push({ id: id(), nome: 'pedir_contato', entrada: {} });
  else if (b.projeto?.formato && (b.negocio || atualizacao.negocio) && (b.objetivos || atualizacao.objetivos)) {
    const adicionais = {};
    if ((b.funcionalidades || []).includes('loja')) adicionais.loja_virtual = 1;
    if ((b.funcionalidades || []).includes('agendamento')) adicionais.agendamento = 1;
    if ((b.funcionalidades || []).includes('blog')) adicionais.blog = 1;
    chamadas.push({ id: id(), nome: 'estimar', entrada: { formato: b.projeto.formato, ...(b.projeto.paginas ? { paginas: b.projeto.paginas } : {}), adicionais } });
  }
  if (/atendimento|responder (os )?clientes|whats(app)? cheio/i.test(texto)) chamadas.push({ id: id(), nome: 'sugerir_solucao_ia', entrada: { ideia: 'Atendente com IA no WhatsApp', motivo: 'Responder dúvidas comuns e agendar fora do horário' } });
  if (!chamadas.length) return resposta('Entendi. Pode me contar um pouco mais sobre o seu negócio e o que o site precisa fazer?');
  return resposta('', chamadas);
}

export function criarSimulada({ geracao = gerarSimulado, extracao = extrairSimulado } = {}) {
  return {
    nome: 'simulada',
    async mensagem(pedido) {
      if (pedido.papel === 'conversa') return conversa(pedido);
      if (pedido.papel === 'geracao' && geracao) return geracao(pedido);
      if (pedido.papel === 'extracao' && extracao) return extracao(pedido);
      throw new Error('simulada: papel sem dublê: ' + pedido.papel);
    }
  };
}
