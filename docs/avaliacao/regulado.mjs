/* ==========================================================================
   A MEDIÇÃO DE SAÚDE E ADVOCACIA com o modelo REAL (spec docs/superpowers/specs/2026-11-15-nicho-regulado-design.md §7; GASTA API).
   Sonnet 5.5 × Opus 5.5 nos dois pontos, com a conferência e o refazer reais:
     - a CONVERSA: o roteiro de cada caso pelo mesmo executarTurno do site; confere as regras gerais da fala, se o Zero pediu o registro
       e se o registro foi gravado no briefing; custo e tempo por turno;
     - a GERAÇÃO dos 3 modelos: o briefing da conversa (o mesmo para os dois modelos de IA), cada estratégia pelo gerarDirecao do site com o
       nicho; a taxa de passar na 1ª, depois do refazer e o que falhou de vez, o custo e o tempo.
   O gasto passa pelo LIVRO do servidor local (docs/ia-local.mjs: ~/.beyon-gasto-ia.json), com o teto de BZ_IA_TETO_USD (o dono subiu o
   teto dos testes para US$ 10 em 15/11): a chamada que passaria do teto não sai.
     node scripts/com-chave.mjs --so ANTHROPIC_API_KEY node docs/avaliacao/regulado.mjs [--caso odonto,advocacia] [--etapa conversa,geracao]
       [--modelos sonnet,opus] [--saida pasta]
   ========================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarCenario } from './consultor.mjs';
import { nichoReguladoDaSessao } from '../../api/_vendas/agente.mjs';
import { gerarDirecao } from '../../api/_vendas/gerador.mjs';
import { ESTRATEGIAS } from '../../api/_vendas/direcao.mjs';
import { criarIALocal, abrirLivro, tetoDe, LIVRO_PADRAO } from '../ia-local.mjs';

const MODELOS = { sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
/* os casos: o visitante conta o negócio, a dor e dá o registro quando o Zero pede (a última mensagem traz o registro de qualquer jeito) */
export const CASOS = {
  odonto: {
    sobre: 'dentista, pacientes por indicação, revisão que se perde',
    mensagens: [
      'Oi, sou dentista em Curitiba e quero um site para o meu consultório.',
      'Quase todos os pacientes vêm por indicação. O problema é que depois do tratamento eles somem e a revisão de 6 meses se perde.',
      'Quero que o paciente consiga marcar a revisão pelo site e entenda os tratamentos que eu faço: clareamento, implante e ortodontia.',
      'Acho que um site com algumas páginas resolve. Tenho logo e fotos do consultório.',
      'Meu registro é CRO-PR 12345. Pode seguir.'
    ],
    registro: /CRO-PR 12345/
  },
  advocacia: {
    sobre: 'advogada trabalhista, clientes por indicação e Instagram',
    mensagens: [
      'Olá, sou advogada trabalhista em Belo Horizonte e quero um site para o escritório.',
      'Os clientes chegam por indicação e pelo Instagram, e muita gente me chama só para tirar dúvida sobre rescisão.',
      'Quero que o site explique as áreas em que atuo e deixe a pessoa marcar uma conversa.',
      'Um site com poucas páginas está bom. Tenho logo, os textos eu não tenho.',
      'Minha OAB é OAB/MG 123.456. Pode seguir.'
    ],
    registro: /OAB-MG 123\.456/
  },
  fisio: {
    sobre: 'fisioterapeuta, pacientes que marcam e faltam',
    mensagens: [
      'Oi, tenho uma clínica de fisioterapia em Ribeirão Preto e quero um site.',
      'Os pacientes chegam pelo Instagram e marcam pelo direct. O que mais dói é falta: marca e não aparece.',
      'Queria que a pessoa marcasse sozinha e entendesse os tratamentos: pilates clínico, RPG e reabilitação.',
      'Um site com algumas páginas. Tenho logo e fotos.',
      'O registro é CREFITO-3 123456-F. Pode seguir.'
    ],
    registro: /CREFITO-3 123456-F/
  }
};
/* o Zero pediu o registro? (em algum turno antes de a pessoa dar) */
const PEDIU_REGISTRO = /\b(?:registro|cro|crm|crefito|crp|crn|oab)\b/i;

const arg = (nome, padrao) => { const i = process.argv.indexOf('--' + nome); return i > 0 ? process.argv[i + 1] : padrao; };
const lista = (nome, padrao, validos) => {
  const v = String(arg(nome, padrao)).split(',').map((x) => x.trim()).filter(Boolean);
  for (const x of v) if (!validos.includes(x)) { console.error('--' + nome + ': ' + x + ' não é ' + validos.join(', ')); process.exit(2); }
  return v;
};

async function principal() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error('Sem ANTHROPIC_API_KEY: rode por scripts/com-chave.mjs --so ANTHROPIC_API_KEY'); process.exit(2); }
  const casos = lista('caso', 'odonto,advocacia', Object.keys(CASOS));
  const etapas = lista('etapa', 'conversa,geracao', ['conversa', 'geracao']);
  const modelos = lista('modelos', 'sonnet,opus', Object.keys(MODELOS));
  process.env.BZ_DIRECOES = 'api';
  const { criarAnthropic } = await import('../../api/_ia/anthropic.mjs');
  const { criarSimulada } = await import('../../api/_ia/simulado.mjs');
  const livro = abrirLivro(process.env.BZ_IA_LIVRO || LIVRO_PADRAO), teto = tetoDe(process.env);
  /* a IA de cada modelo: a real, com o modelo trocado nos dois papéis, atrás do livro e do teto */
  const iaDe = (m) => criarIALocal({ real: criarAnthropic(process.env, undefined, { conversa: { modelo: MODELOS[m] }, geracao: { modelo: MODELOS[m] } }), simulada: criarSimulada(), livro, teto, geracaoReal: true });
  const regras = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
  const pasta = arg('saida', path.join(os.tmpdir(), 'medicao-regulado-' + new Date().toISOString().replace(/[:.]/g, '-')));
  fs.mkdirSync(pasta, { recursive: true });
  const relatorio = { quando: new Date().toISOString(), teto_usd: teto, gasto_antes_usd: livro.total(), conversas: [], geracoes: [] };
  const etapaGasto = (nome, antes) => { const g = livro.total() - antes; console.log('  [gasto da etapa ' + nome + ': US$ ' + g.toFixed(4) + ' · livro US$ ' + livro.total().toFixed(4) + ' de ' + teto + ']'); return g; };
  const briefings = {};
  for (const caso of casos) {
    const c = CASOS[caso];
    if (etapas.includes('conversa')) {
      for (const m of modelos) {
        const antes = livro.total(), t0 = Date.now();
        try {
          const r = await avaliarCenario({ ia: iaDe(m), regras, cenario: { id: caso + '-' + m, sobre: c.sobre, mensagens: c.mensagens, espera: [] } });
          const pediu = r.turnos.slice(0, -1).some((t) => PEDIU_REGISTRO.test(t.resposta));
          const linha = { caso, modelo: m, custo_usd: etapaGasto('conversa ' + caso + ' ' + m, antes), ms: Date.now() - t0, turnos: r.turnos.length,
            falhas_da_fala: r.turnos.flatMap((t, i) => t.falhas.map((f) => 't' + (i + 1) + ':' + f)), pediu_registro: pediu, briefing: r.briefing || null, respostas: r.turnos.map((t) => t.resposta) };
          relatorio.conversas.push(linha);
          if (m === 'sonnet' || !briefings[caso]) briefings[caso] = r.briefing;
          console.log((linha.falhas_da_fala.length ? 'FALHA' : 'OK   ') + ' conversa ' + caso + ' ' + m + ' · pediu o registro: ' + pediu + ' · falhas: ' + (linha.falhas_da_fala.join(' ') || 'nenhuma'));
        } catch (e) {
          relatorio.conversas.push({ caso, modelo: m, erro: e?.motivo || e?.message || String(e), custo_usd: etapaGasto('conversa ' + caso + ' ' + m, antes) });
          console.log('ERRO  conversa ' + caso + ' ' + m + ': ' + (e?.motivo || e?.message));
          if (e?.motivo === 'limite') break;
        }
      }
    }
    if (etapas.includes('geracao')) {
      /* o briefing: o da conversa (Sonnet), ou um mínimo do caso se a conversa não rodou */
      const briefing = briefings[caso] || { negocio: { nome: 'Caso ' + caso, descricao: c.mensagens.join(' ').slice(0, 600), registro: (c.mensagens.at(-1).match(/(CRO|OAB|CREFITO)[^.]*/) || [''])[0] } };
      const nicho = nichoReguladoDaSessao({ briefing, mensagens: c.mensagens.map((t) => ({ papel: 'visitante', conteudo: t })) });
      for (const m of modelos) {
        for (const [i, estrategia] of Object.keys(ESTRATEGIAS).entries()) {
          const antes = livro.total(), t0 = Date.now(), tentativas = [];
          const linha = { caso, nicho: nicho?.chave || null, modelo: m, estrategia };
          try {
            const g = await gerarDirecao({ ia: iaDe(m), briefing, estrategia, numero: i + 1, fatores: { formato: 'institucional' }, nicho, hoje: new Date().toISOString().slice(0, 10),
              aoTentar: (t) => tentativas.push(t) });
            Object.assign(linha, { ok: true, tentativas: g.tentativas, rodape: g.direcao?.rodape?.texto || '' });
            fs.writeFileSync(path.join(pasta, 'direcao-' + caso + '-' + m + '-' + estrategia + '.json'), JSON.stringify(g.direcao, null, 1), { mode: 0o600 });
          } catch (e) {
            Object.assign(linha, { ok: false, erro: e?.motivo || e?.message || String(e) });
          }
          /* cada tentativa que falhou, com o texto de cada caminho que falhou (para separar o superlativo de verdade do falso positivo) */
          tentativas.forEach((t) => {
            if (!t.falhas.length) return;
            const valor = (c) => c.split(/\.|\[(\d+)\]/).filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), t.direcao);
            fs.writeFileSync(path.join(pasta, 'falhou-' + caso + '-' + m + '-' + estrategia + '-t' + t.tentativa + '.json'),
              JSON.stringify({ falhas: t.detalhe.map((f) => ({ ...f, texto: typeof valor(f.caminho) === 'string' ? valor(f.caminho) : JSON.stringify(valor(f.caminho)).slice(0, 300) })), direcao: t.direcao }, null, 1), { mode: 0o600 });
          });
          Object.assign(linha, { falhas_por_tentativa: tentativas.map((t) => t.falhas), custo_usd: etapaGasto('geração ' + caso + ' ' + m + ' ' + estrategia, antes), ms: Date.now() - t0 });
          relatorio.geracoes.push(linha);
          console.log((linha.ok ? 'OK   ' : 'FALHA') + ' geração ' + caso + ' ' + m + ' ' + estrategia + ' · tentativas: ' + (linha.tentativas || tentativas.length) +
            ' · falhas: ' + (tentativas.map((t) => '[' + t.falhas.join(',') + ']').join(' ') || '-') + (linha.erro ? ' · erro: ' + linha.erro : ''));
          if (linha.erro === 'limite') break;
        }
      }
    }
  }
  relatorio.gasto_depois_usd = livro.total();
  /* o resumo por modelo: a 1ª tentativa, depois do refazer, o que não saiu, o custo médio */
  relatorio.resumo = Object.keys(MODELOS).map((m) => {
    const gs = relatorio.geracoes.filter((g) => g.modelo === m);
    const cs = relatorio.conversas.filter((c) => c.modelo === m);
    return { modelo: m, geracoes: gs.length, passou_na_1a: gs.filter((g) => g.ok && g.tentativas === 1).length, passou_no_refazer: gs.filter((g) => g.ok && g.tentativas === 2).length,
      nao_saiu: gs.filter((g) => !g.ok).length, custo_medio_geracao: gs.length ? gs.reduce((s, g) => s + g.custo_usd, 0) / gs.length : 0,
      conversas: cs.length, conversas_sem_falha: cs.filter((c) => !c.erro && !c.falhas_da_fala.length).length, pediram_registro: cs.filter((c) => c.pediu_registro).length,
      custo_medio_conversa: cs.length ? cs.reduce((s, c) => s + c.custo_usd, 0) / cs.length : 0 };
  }).filter((r) => r.geracoes || r.conversas);
  fs.writeFileSync(path.join(pasta, 'medicao.json'), JSON.stringify(relatorio, null, 1), { mode: 0o600 });
  console.log('\nresumo: ' + JSON.stringify(relatorio.resumo) + '\ngasto desta rodada: US$ ' + (relatorio.gasto_depois_usd - relatorio.gasto_antes_usd).toFixed(4) + ' · relatório: ' + path.join(pasta, 'medicao.json'));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal().catch((e) => { console.error(e?.message || e); process.exit(1); });
