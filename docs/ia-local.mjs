/* A IA DO SERVIDOR LOCAL (docs/superpowers/specs/2026-11-14-ia-real-local-design.md). Só local: docs/ não vai para o deploy,
   e o gancho em api/_ia/provedor.mjs só a usa com ambienteDe(env) === 'local'.

   Três modos, escolhidos pelo ambiente do servidor (docs/servidor.mjs):
     real      BZ_IA_REAL=1 + ANTHROPIC_API_KEY (pela scripts/com-chave.mjs): conversa e extração no Claude; a geração dos
               3 modelos (Opus) fica na simulada, salvo BZ_IA_REAL_GERACAO=1
     fita      BZ_IA_REPRODUZIR=<arquivo .jsonl gravado>: as respostas gravadas, em ordem, por papel, no ritmo gravado
               (BZ_IA_RITMO=imediato tira a espera). Sem chave e sem gasto
     simulada  o padrão, de graça
   O LIVRO do gasto (BZ_IA_LIVRO, padrão ~/.beyon-gasto-ia.json) soma o custo de cada chamada real e sobrevive aos servidores;
   o TETO (BZ_IA_TETO_USD, padrão US$ 3) é conferido antes de cada chamada real. BZ_IA_GRAVAR=<arquivo> grava a fita.
   UM servidor real por vez: entre processos o livro soma em sequência, sem trava; duas rodadas reais ao mesmo tempo podem
   passar do teto pelo que estiver em voo nas duas (as reservas em voo são de cada processo).
   A fita guarda o texto das conversas: só com dados fictícios, fora do repositório. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ErroIA } from '../api/_ia/provedor.mjs';
import { reservaUsd } from '../api/_ia/config.mjs';

export const TETO_PADRAO_USD = 3;
export const TETO_MAXIMO_USD = 10;   /* (uma variável errada não vira gasto grande: acima disto volta ao padrão) */
export const LIVRO_PADRAO = path.join(os.homedir(), '.beyon-gasto-ia.json');
const FALA_MAX = 200;

export function tetoDe(env = {}) {
  const v = Number(String(env.BZ_IA_TETO_USD ?? '').trim() || NaN);
  return Number.isFinite(v) && v > 0 && v <= TETO_MAXIMO_USD ? v : TETO_PADRAO_USD;
}

/* o livro: { total_usd, chamadas: [{ quando, papel, modelo, custo_usd, ms, erro? }] }. Lido a cada consulta e regravado
   inteiro (arquivo temporário + rename) a cada anotação. Corrompido, recusa: zerar o gasto em silêncio furaria o teto */
export function abrirLivro(arquivo = LIVRO_PADRAO) {
  const ler = () => {
    let bruto;
    try { bruto = fs.readFileSync(arquivo, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return { total_usd: 0, chamadas: [] }; throw e; }
    try {
      const d = JSON.parse(bruto);
      if (!d || !Array.isArray(d.chamadas) || !Number.isFinite(d.total_usd)) throw new Error('formato');
      return d;
    } catch { throw new Error('o livro do gasto em ' + arquivo + ' está ilegível; confira ou apague-o de propósito'); }
  };
  ler();   /* (falha cedo, ao subir o servidor) */
  return {
    arquivo,
    total: () => ler().total_usd,
    chamadas: () => ler().chamadas,
    anotar(registro) {
      const d = ler();
      const custo = Number(registro.custo_usd) || 0;
      const novo = { total_usd: d.total_usd + custo, chamadas: [...d.chamadas, { quando: new Date().toISOString(), ...registro, custo_usd: custo }] };
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      const tmp = arquivo + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(novo, null, 1));
      fs.renameSync(tmp, arquivo);
    }
  };
}

/* cada linha: { papel, fala, ms, resposta } de uma chamada que deu certo, ou { papel, fala, ms, erro } de uma que falhou */
export function lerFita(arquivo) {
  return fs.readFileSync(arquivo, 'utf8').split('\n').filter(l => l.trim()).map((l, i) => {
    const ruim = () => new Error('fita ' + arquivo + ': linha ' + (i + 1) + ' ilegível');
    let d;
    try { d = JSON.parse(l); } catch { throw ruim(); }
    const ok = d && typeof d === 'object' && typeof d.papel === 'string'
      && ((d.resposta && typeof d.resposta === 'object' && !Array.isArray(d.resposta)) || typeof d.erro === 'string');
    if (!ok) throw ruim();
    return d;
  });
}

/* a última fala da pessoa no pedido (para a fita e o relatório), cortada */
function ultimaFala(pedido) {
  const m = [...(pedido.mensagens || [])].reverse().find(x => x.role === 'user');
  if (!m) return '';
  const c = typeof m.content === 'string' ? m.content : (m.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
  return c.slice(0, FALA_MAX);
}

const dormir = ms => new Promise(r => setTimeout(r, ms));
const brl = v => 'US$ ' + v.toFixed(2);
const avisar = msg => console.error('[ia-local] ' + msg);
/* um custo que dá para somar, ou null */
const custoValido = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

export function criarIALocal({ real = null, simulada, livro, teto = TETO_PADRAO_USD, geracaoReal = false, gravar = null, fita = null, ritmo = 'gravado', esperar = dormir, agora = Date.now }) {
  if (fita) {
    const filas = Object.create(null);
    for (const l of fita) (filas[l.papel] ||= []).push(l);
    return {
      nome: 'fita', modo: 'fita',
      async mensagem(pedido) {
        if (pedido.papel === 'geracao' && !geracaoReal) return simulada.mensagem(pedido);
        const l = (filas[pedido.papel] || []).shift();
        if (!l) { avisar('a fita acabou para o papel ' + pedido.papel + ': a conversa passou do que foi gravado'); throw new ErroIA('indisponivel', 'a fita acabou para o papel ' + pedido.papel); }
        if (ritmo !== 'imediato') await esperar(Number(l.ms) || 0);
        if (l.erro) throw new ErroIA(l.erro, 'da fita: ' + l.erro);
        return l.resposta;
      }
    };
  }
  if (!real) return { nome: 'simulada', modo: 'simulada', mensagem: p => simulada.mensagem(p) };
  let emVoo = 0, naoAnotado = 0;
  /* uma chamada já paga não pode sumir do teto nem derrubar a resposta: o livro que não grava (arquivo preso pelo antivírus,
     disco cheio) fica com o valor na memória deste servidor, em voz alta */
  function registrar(reg) {
    try { livro.anotar(reg); } catch (e) {
      naoAnotado += reg.custo_usd;
      avisar('o livro não gravou ' + brl(reg.custo_usd) + ' (' + (e?.code || e?.message) + '); o teto deste servidor conta pela memória');
    }
  }
  function gravarFita(linha) {
    if (!gravar) return;
    try { fs.appendFileSync(gravar, JSON.stringify(linha) + '\n', { mode: 0o600 }); } catch (e) { avisar('a fita não gravou a chamada: ' + (e?.code || e?.message)); }
  }
  return {
    nome: 'anthropic', modo: 'real',
    async mensagem(pedido) {
      if (pedido.papel === 'geracao' && !geracaoReal) return simulada.mensagem(pedido);
      const reserva = reservaUsd(pedido.papel);
      const gasto = livro.total() + naoAnotado;
      if (gasto + emVoo + reserva > teto) {
        throw new ErroIA('limite', 'teto local da IA real: ' + brl(gasto) + ' gastos (+ ' + brl(emVoo) + ' em voo) de ' + brl(teto) + '; a chamada não saiu');
      }
      emVoo += reserva;
      const t0 = agora(), papel = pedido.papel, fala = ultimaFala(pedido);
      let r;
      try {
        r = await real.mensagem(pedido);
      } catch (e) {
        const ms = agora() - t0, motivo = e?.motivo || 'falha';
        registrar({ papel, modelo: '', custo_usd: custoValido(e?.custo_usd) ?? 0, ms, erro: motivo });
        gravarFita({ papel, fala, ms, erro: motivo });
        throw e;
      } finally {
        emVoo -= reserva;
      }
      const ms = agora() - t0;
      /* sem custo que dê para somar, entra a reserva do papel (o pior caso previsto), nunca zero */
      let custo = custoValido(r?.custo_usd), estimado = false;
      if (custo === null) { custo = reserva; estimado = true; avisar('a resposta veio sem custo; anotei a reserva do papel ' + papel + ' (' + brl(reserva) + ')'); }
      registrar({ papel, modelo: r?.modelo || '', custo_usd: custo, ms, ...(estimado ? { custo_estimado: true } : {}) });
      gravarFita({ papel, fala, ms, resposta: r });
      return r;
    }
  };
}

/* monta a partir do ambiente do servidor local. Sem chave com BZ_IA_REAL=1, recusa subir (melhor que cair na simulada achando
   que é a real). A fita vence a real: reproduzir nunca gasta */
export async function montarIALocal(env = process.env) {
  const { criarSimulada } = await import('../api/_ia/simulado.mjs');
  const simulada = criarSimulada();
  const livro = abrirLivro(env.BZ_IA_LIVRO || LIVRO_PADRAO);
  const comum = { simulada, livro, teto: tetoDe(env), geracaoReal: env.BZ_IA_REAL_GERACAO === '1' };
  let ia;
  if (env.BZ_IA_REPRODUZIR) {
    ia = criarIALocal({ ...comum, fita: lerFita(env.BZ_IA_REPRODUZIR), ritmo: env.BZ_IA_RITMO === 'imediato' ? 'imediato' : 'gravado' });
  } else if (env.BZ_IA_REAL === '1') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('BZ_IA_REAL=1 sem ANTHROPIC_API_KEY: rode pelo scripts/com-chave.mjs --so ANTHROPIC_API_KEY');
    const { criarAnthropic } = await import('../api/_ia/anthropic.mjs');
    ia = criarIALocal({ ...comum, real: criarAnthropic(env), gravar: env.BZ_IA_GRAVAR || null });
  } else {
    ia = criarIALocal(comum);
  }
  ia.descricao = ia.modo === 'real'
    ? 'IA REAL (custa): teto ' + brl(comum.teto) + ', já gastos ' + brl(livro.total()) + ' (livro ' + livro.arquivo + ')' + (comum.geracaoReal ? ', geração no Opus' : ', geração simulada') + (env.BZ_IA_GRAVAR ? ', gravando a fita em ' + env.BZ_IA_GRAVAR + ' (ela guarda o texto das conversas: só dados fictícios)' : '')
    : ia.modo === 'fita' ? 'IA da fita ' + env.BZ_IA_REPRODUZIR + ' (sem gasto)' : 'IA simulada (de graça)';
  return ia;
}
