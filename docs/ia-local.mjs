/* A IA DO SERVIDOR LOCAL (docs/superpowers/specs/2026-11-14-ia-real-local-design.md). Só local: docs/ não vai para o deploy,
   e o gancho em api/_ia/provedor.mjs só a usa com ambienteDe(env) === 'local'.

   Três modos, escolhidos pelo ambiente do servidor (docs/servidor.mjs):
     real      BZ_IA_REAL=1 + ANTHROPIC_API_KEY (pela scripts/com-chave.mjs): conversa e extração no Claude; a geração dos
               3 modelos (Opus) fica na simulada, salvo BZ_IA_REAL_GERACAO=1
     fita      BZ_IA_REPRODUZIR=<arquivo .jsonl gravado>: as respostas gravadas, em ordem, por papel, no ritmo gravado
               (BZ_IA_RITMO=imediato tira a espera). Sem chave e sem gasto
     simulada  o padrão, de graça
   O LIVRO do gasto (BZ_IA_LIVRO, padrão ~/.beyon-gasto-ia.json) soma o custo de cada chamada real e sobrevive aos servidores;
   o TETO (BZ_IA_TETO_USD, padrão US$ 3) é conferido antes de cada chamada real. BZ_IA_GRAVAR=<arquivo> grava a fita. */
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
      const tmp = arquivo + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(novo, null, 1));
      fs.renameSync(tmp, arquivo);
    }
  };
}

export function lerFita(arquivo) {
  return fs.readFileSync(arquivo, 'utf8').split('\n').filter(l => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new Error('fita ' + arquivo + ': linha ' + (i + 1) + ' ilegível'); }
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

export function criarIALocal({ real = null, simulada, livro, teto = TETO_PADRAO_USD, geracaoReal = false, gravar = null, fita = null, ritmo = 'gravado', esperar = dormir, agora = Date.now }) {
  if (fita) {
    const filas = Object.create(null);
    for (const l of fita) (filas[l.papel] ||= []).push(l);
    return {
      nome: 'fita', modo: 'fita',
      async mensagem(pedido) {
        if (pedido.papel === 'geracao' && !geracaoReal) return simulada.mensagem(pedido);
        const l = (filas[pedido.papel] || []).shift();
        if (!l) throw new ErroIA('indisponivel', 'a fita acabou para o papel ' + pedido.papel);
        if (ritmo !== 'imediato') await esperar(Number(l.ms) || 0);
        return l.resposta;
      }
    };
  }
  if (!real) return { nome: 'simulada', modo: 'simulada', mensagem: p => simulada.mensagem(p) };
  let emVoo = 0;
  return {
    nome: 'anthropic', modo: 'real',
    async mensagem(pedido) {
      if (pedido.papel === 'geracao' && !geracaoReal) return simulada.mensagem(pedido);
      const reserva = reservaUsd(pedido.papel);
      const gasto = livro.total();
      if (gasto + emVoo + reserva > teto) {
        throw new ErroIA('limite', 'teto local da IA real: ' + brl(gasto) + ' gastos (+ ' + brl(emVoo) + ' em voo) de ' + brl(teto) + '; a chamada não saiu');
      }
      emVoo += reserva;
      const t0 = agora();
      try {
        const r = await real.mensagem(pedido);
        const ms = agora() - t0;
        livro.anotar({ papel: pedido.papel, modelo: r.modelo || '', custo_usd: r.custo_usd, ms });
        if (gravar) fs.appendFileSync(gravar, JSON.stringify({ papel: pedido.papel, fala: ultimaFala(pedido), ms, resposta: r }) + '\n');
        return r;
      } catch (e) {
        livro.anotar({ papel: pedido.papel, modelo: '', custo_usd: e?.custo_usd || 0, ms: agora() - t0, erro: e?.motivo || 'falha' });
        throw e;
      } finally {
        emVoo -= reserva;
      }
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
    ? 'IA REAL (custa): teto ' + brl(comum.teto) + ', já gastos ' + brl(livro.total()) + ' (livro ' + livro.arquivo + ')' + (comum.geracaoReal ? ', geração no Opus' : ', geração simulada') + (env.BZ_IA_GRAVAR ? ', gravando a fita' : '')
    : ia.modo === 'fita' ? 'IA da fita ' + env.BZ_IA_REPRODUZIR + ' (sem gasto)' : 'IA simulada (de graça)';
  return ia;
}
