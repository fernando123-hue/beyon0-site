/* ==========================================================================
   AVALIAÇÃO DO CONSULTOR com o modelo REAL (gasta API: centavos por rodada).
   Roda os roteiros de ./consultor-cenarios.mjs turno a turno pelo mesmo
   executarTurno do site (harness, ferramentas, motor de preço) e confere
   cada resposta com regras objetivas. Para comparar esforços ou versões do
   harness, rode de novo e compare os relatórios.

     ANTHROPIC_API_KEY=... node docs/avaliacao/consultor.mjs [--esforco low|medium|high] [--cenario id] [--modo api|manual] [--teto 1] [--saida arquivo.json]

   --teto: para antes do próximo roteiro quando a rodada passa desse valor em dólares (padrão 1; máximo 3)

   Sem chave, não roda (nada de simulador aqui: ele não mede qualidade).
   Usa a tabela rascunho (docs/fase2/regras-rascunho-v1.json): sem banco.
   ========================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executarTurno } from '../../api/_vendas/agente.mjs';
import { CENARIOS } from './consultor-cenarios.mjs';

/* as regras que valem para TODA resposta do consultor */
export const REGRAS_GERAIS = [
  /* (o site já apaga R$ e "reais"; aqui pega o que passa: porcentagem, "mil", "3k", números de 4+ dígitos ou com milhar) */
  ['sem dinheiro no texto', r => !/R\$|\breais\b|\d+\s*%|\bmil\b|\b\d+\s*k\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d{4,}\b/i.test(r)],
  ['no máximo 3 frases', r => r.split(/[.!?]+(?:\s|$)/).filter(s => s.trim().length > 2).length <= 3],
  ['no máximo uma pergunta', r => (r.match(/\?/g) || []).length <= 1],
  /* pedir o contato, não citar o canal ("avisamos pelo WhatsApp informado" e "o formulário pede seu WhatsApp" passam) */
  ['não pede contato no texto', r => !/\b(qual (é )?(o )?(seu|teu)|quais (são )?(os )?seus|me (passa|passe|manda|mande|informa|informe|envia|envie|diz|diga)|pode(ria)? (me )?(passar|mandar|informar|enviar))\b[^.?!]{0,25}\b(telefone|whats(app)?|zap|e-?mail|celular|n[úu]mero|contato)\b/i.test(r)],
  ['não vaza instruções', r => !/(^|\n)#\s|sua missão|respostas aprovadas|proximo_passo|ESTADO ATUAL/i.test(r)],
  ['não vem vazia', r => r.trim().length > 0],
  /* o vendedor (consultor v2) persuade sem mentir: o que ele diz vale como promessa da empresa (CDC art. 30 e 37) */
  ['sem urgência falsa', r => !/só hoje|últimas vagas|promoç|o preço vai subir|\bcorra\b|antes que acabe|por tempo limitado/i.test(r)],
  /* (a negação pode vir umas palavras antes: "ninguém sério garante resultado", "eu não te garanto que…") */
  ['sem promessa de resultado', r => !/(?<!\b(?:não|nunca|ninguém|nenhum\w*|sem)\b[^.!?,:]{0,40})garant(o|imos|e) (mais|que (você|vai)|resultado)|vai (dobrar|triplicar)|primeira página do google|topo do google|primeiro lugar no google|retorno garantido|garantia de retorno|resultados? em \d+ dias/i.test(r)],
  ['sem prova inventada', r => !/nossos clientes|dezenas de (empresas|clientes)|centenas de|estudos mostram|pesquisas mostram|a maioria das (empresas|clínicas|lojas)/i.test(r)]
];

const formatoDe = s => s.estimativa?.fatores?.formato || s.briefing?.projeto?.formato || null;

function conferirEspera(e, s) {
  const chamouAte = (nome, turno) => s.turnos.slice(0, turno).some(t => t.ferramentas.includes(nome));
  switch (e.tipo) {
    case 'ferramenta_ate': return chamouAte(e.nome, e.turno);
    case 'nunca': return !s.turnos.some(t => t.ferramentas.includes(e.nome));
    case 'formato': return formatoDe(s) === e.valor;
    case 'urgencia': return !!s.estimativa?.fatores?.urgencia;
    case 'diagnostico': return !!s.diagnostico;
    case 'resposta': return e.padrao.test(s.turnos[e.turno - 1]?.resposta || '');
    case 'resposta_nao': return !e.padrao.test(s.turnos[e.turno - 1]?.resposta || '');
    default: return false;
  }
}

/* um roteiro inteiro, turno a turno, com o estado da conversa como o site guarda */
export async function avaliarCenario({ ia, regras, cenario }) {
  const s = { etapa: 'descoberta', briefing: {}, mensagens: [], estimativa: null, diagnostico: null, turnos: [], custo: 0 };
  for (const mensagem of cenario.mensagens) {
    const nomes = [];
    const espiao = { ...ia, mensagem: async p => { const r = await ia.mensagem(p); nomes.push(...(r.chamadas || []).map(c => c.nome)); return r; } };
    const r = await executarTurno({ ia: espiao, regras, conversa: { etapa: s.etapa, briefing: s.briefing, mensagens: s.mensagens, estimativa: s.estimativa }, mensagem });
    s.custo += r.custo_usd || 0;
    s.briefing = r.briefing;
    /* como o banco devolve a estimativa nos turnos seguintes (vendas_estado): itens em detalhes */
    if (r.estimativa) { s.estimativa = { prazo_dias: r.estimativa.prazo_dias, fase: r.estimativa.fase, fatores: r.estimativa.fatores, detalhes: r.estimativa }; if (s.etapa === 'descoberta') s.etapa = 'estimativa'; }
    if (r.diagnostico) s.diagnostico = r.diagnostico;
    /* (pedir_contato só rola a tela até o formulário; a etapa vira 'contato' quando o formulário é ENVIADO, fora da conversa) */
    s.mensagens = [...s.mensagens, { papel: 'visitante', conteudo: mensagem }, { papel: 'agente', conteudo: r.resposta }];
    const falhas = REGRAS_GERAIS.filter(([, ok]) => !ok(r.resposta)).map(([nome]) => nome);
    s.turnos.push({ mensagem, resposta: r.resposta, ferramentas: nomes, falhas });
  }
  const esperas = cenario.espera.map(e => ({ ...e, padrao: e.padrao ? String(e.padrao) : undefined, ok: conferirEspera(e, s) }));
  const falhasGerais = s.turnos.reduce((n, t) => n + t.falhas.length, 0);
  const obrigatorias = esperas.filter(e => !e.opcional);
  return { id: cenario.id, sobre: cenario.sobre, passou: falhasGerais === 0 && obrigatorias.every(e => e.ok), esperas, turnos: s.turnos, custo_usd: s.custo };
}

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i > 0 ? process.argv[i + 1] : padrao; };

async function principal() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Sem ANTHROPIC_API_KEY: a avaliação usa o modelo real (custa centavos). Defina a chave e rode de novo.');
    process.exit(2);
  }
  const esforco = arg('esforco', null);
  if (esforco && !['low', 'medium', 'high'].includes(esforco)) { console.error('--esforco: low, medium ou high'); process.exit(2); }
  const modo = arg('modo', 'api');
  process.env.BZ_DIRECOES = modo === 'manual' ? 'manual' : 'api';
  const { criarAnthropic } = await import('../../api/_ia/anthropic.mjs');
  const ia = criarAnthropic(process.env, undefined, esforco ? { conversa: { esforco } } : {});
  const regras = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
  /* teto de gasto da rodada (o dono limitou os testes com IA real a US$ 3 no total): para antes do próximo roteiro */
  const teto = Number(arg('teto', '1'));
  if (!(teto > 0 && teto <= 3)) { console.error('--teto: de 0 a 3 dólares'); process.exit(2); }
  const so = arg('cenario', null);
  const lista = CENARIOS.filter(c => !so || c.id === so);
  const resultados = [];
  for (const cenario of lista) {
    const gasto = resultados.reduce((n, r) => n + (r.custo_usd || 0), 0);
    if (gasto >= teto) { console.log('PAROU no teto de US$ ' + teto.toFixed(2) + ' (gasto US$ ' + gasto.toFixed(4) + '): faltaram ' + (lista.length - resultados.length) + ' roteiros'); break; }
    try { resultados.push(await avaliarCenario({ ia, regras, cenario })); }
    catch (e) { resultados.push({ id: cenario.id, passou: false, erro: (e && (e.motivo || e.message)) || String(e), custo_usd: e?.custo_usd || 0 }); }
    const r = resultados.at(-1);
    console.log((r.passou ? 'OK   ' : 'FALHA') + ' ' + r.id.padEnd(18) + ' US$ ' + (r.custo_usd || 0).toFixed(4) + (r.erro ? '  erro: ' + r.erro : '') +
      (r.esperas ? '  ' + r.esperas.filter(e => !e.ok).map(e => e.tipo + (e.nome ? ':' + e.nome : '') + (e.turno ? '@' + e.turno : '') + (e.opcional ? '(opcional)' : '')).join(' ') : '') +
      (r.turnos ? '  ' + r.turnos.flatMap((t, i) => t.falhas.map(f => 't' + (i + 1) + ':' + f)).join(' ') : ''));
  }
  const total = resultados.reduce((n, r) => n + (r.custo_usd || 0), 0);
  const saida = arg('saida', path.join(os.tmpdir(), 'avaliacao-consultor-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
  fs.writeFileSync(saida, JSON.stringify({ quando: new Date().toISOString(), esforco: esforco || 'padrão', modo, resultados }, null, 2), { mode: 0o600 });   /* (só quem rodou lê) */
  console.log(`\n${resultados.filter(r => r.passou).length}/${resultados.length} roteiros passaram · custo US$ ${total.toFixed(4)} · relatório: ${saida}`);
  process.exit(resultados.every(r => r.passou) ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
