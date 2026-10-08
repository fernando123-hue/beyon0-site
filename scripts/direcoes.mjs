/* ==========================================================================
   O COMANDO DA FILA MANUAL (decisão do dono, 2026-10-08) — usado pelo
   Claude Code do dono para produzir as três direções de cada pedido.
   Procedimento completo: .claude/skills/produzir-direcoes/SKILL.md.

     node scripts/direcoes.mjs fila
     node scripts/direcoes.mjs pedido <conversa (8+ caracteres do id)>
     node scripts/direcoes.mjs conferir <arquivo.json> <conversao|autoridade|experiencia>
     node scripts/direcoes.mjs entregar <direcao_id> <arquivo.json>

   Ambiente: BZ_BASE (endereço do site, ex.: https://beyonzero.com.br) e
   PAINEL_CHAVE (a chave do painel; nunca em arquivo nem no histórico).
   PRIVACIDADE: o pedido gravado para o modelo leva SÓ o briefing, o escopo e
   as estratégias — nunca nome, telefone ou e-mail (privacidade.html, seção
   do orçamento). O contato fica no painel, para o aviso.
   A pasta de trabalho fica FORA do repositório (~/BeyonZero-direcoes).
   ========================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { higienizar, ESTRATEGIAS, ESQUEMA_DIRECAO } from '../api/_vendas/direcao.mjs';
import { SISTEMA_GERACAO } from '../api/_vendas/gerador.mjs';

export const PASTA = path.join(os.homedir(), 'BeyonZero-direcoes');

/* o que o modelo pode ver de um pedido: sem contato (só o que a geração automática também via) */
export function pedidoParaModelo(p) {
  return {
    pedido: String(p.conversa_id).slice(0, 8),
    pedido_em: p.pedido_em,
    briefing: p.briefing || {},
    formato_e_escopo: { formato: p.fatores?.formato || null, paginas: p.fatores?.paginas || null, adicionais: p.fatores?.adicionais || {} },
    direcoes: (p.direcoes || []).map(d => ({ id: d.id, numero: d.numero, estrategia: d.estrategia, status: d.status, instrucao: ESTRATEGIAS[d.estrategia] || null }))
  };
}

/* o pedido pelo começo do id (o painel mostra os 8 primeiros caracteres); ambíguo ou ausente = erro claro */
export function acharPedido(fila, prefixo) {
  const p = String(prefixo || '').trim().toLowerCase();
  if (p.length < 8) throw new Error('Informe pelo menos os 8 primeiros caracteres do pedido.');
  const achados = fila.filter(x => String(x.conversa_id).toLowerCase().startsWith(p));
  if (!achados.length) throw new Error('Pedido ' + p + ' não está na fila.');
  if (achados.length > 1) throw new Error('Mais de um pedido começa com ' + p + ': use mais caracteres.');
  return achados[0];
}

/* o mesmo filtro do servidor, antes de entregar: o que ele recusa ou corrige */
export function conferir(conteudo, estrategia) {
  if (!ESTRATEGIAS[estrategia]) return { erro: 'estratégia desconhecida: ' + estrategia };
  return higienizar(conteudo, estrategia);
}

/* as instruções da geração automática, para o modelo produzir no MESMO padrão */
export function instrucoes() {
  return { sistema: SISTEMA_GERACAO, esquema: ESQUEMA_DIRECAO, estrategias: ESTRATEGIAS };
}

/* ---------------- execução ---------------- */
function ambiente() {
  const base = String(process.env.BZ_BASE || '').replace(/\/+$/, '');
  const chave = process.env.PAINEL_CHAVE || '';
  if (!/^https?:\/\//.test(base)) throw new Error('Defina BZ_BASE com o endereço do site (ex.: https://beyonzero.com.br).');
  if (chave.length < 32) throw new Error('Defina PAINEL_CHAVE (a chave do painel) no ambiente, não em arquivo.');
  return { base, chave };
}
async function painel(metodo, consulta, corpo) {
  const { base, chave } = ambiente();
  const r = await fetch(base + '/api/painel' + consulta, { method: metodo, headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'HTTP ' + r.status);
  return j;
}
const lerJson = arquivo => JSON.parse(fs.readFileSync(arquivo, 'utf8'));

async function principal([comando, a, b]) {
  if (comando === 'fila') {
    const r = await painel('GET', '?fila=direcoes');
    if (!r.fila.length) return console.log('Nenhum pedido na fila.');
    for (const p of r.fila) {
      const prontas = p.direcoes.filter(d => d.status === 'pronta').length;
      console.log(String(p.conversa_id).slice(0, 8) + '  ' + new Date(p.pedido_em).toLocaleString('pt-BR') + '  ' + prontas + '/3 prontas  ' + (p.briefing?.negocio?.segmento || p.briefing?.negocio?.descricao || 'sem descrição').slice(0, 60));
    }
    return console.log(r.total + ' pedido(s)' + (r.truncada ? ' (mostrando os mais antigos)' : '') + '.');
  }
  if (comando === 'pedido') {
    const p = acharPedido((await painel('GET', '?fila=direcoes')).fila, a);
    const dir = path.join(PASTA, String(p.conversa_id).slice(0, 8));
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = path.join(dir, 'pedido.json');
    fs.writeFileSync(arquivo, JSON.stringify({ ...pedidoParaModelo(p), instrucoes: instrucoes() }, null, 2), { mode: 0o600 });
    return console.log('Pedido gravado (sem contato) em ' + arquivo);
  }
  if (comando === 'conferir') {
    const h = conferir(lerJson(a), b);
    if (h.erro) { console.log('RECUSADA: ' + h.erro); process.exitCode = 1; return; }
    return console.log('OK' + (h.ajustes.length ? ' (o filtro corrigiu: ' + h.ajustes.join(', ') + ')' : '') + ' · ' + h.direcao.secoes.length + ' seções · "' + h.direcao.nome_conceito + '"');
  }
  if (comando === 'entregar') {
    const r = await painel('POST', '', { entregar_direcao: a, conteudo: lerJson(b) });
    return console.log('Entregue (' + r.estrategia + ')' + (r.ajustes.length ? ', o filtro corrigiu: ' + r.ajustes.join(', ') : '') + '. Faltam ' + (r.pendentes ?? '?') + ' na fila deste pedido.');
  }
  console.log('Uso: node scripts/direcoes.mjs fila | pedido <id> | conferir <arquivo> <estrategia> | entregar <direcao_id> <arquivo>');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).catch(e => { console.error('Erro: ' + e.message); process.exitCode = 1; });
}
