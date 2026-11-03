/* ==========================================================================
   O JUIZ POR CÓDIGO da lapidação do Zero (estudo do JEV, fase 0b): conta o que
   o dono pôs no critério de PRONTO e que um juiz de modelo erra de tanto em
   tanto: valor repetido sem a pessoa pedir, aviso de IA repetido sem a pessoa
   perguntar, recado empurrado de novo, abertura igual em falas seguidas e
   frase igual em falas diferentes. Grátis, determinístico, sem modelo.
   Uso: node docs/zero/repeticao.mjs <arquivo.md ou pasta>  (o formato das
   conversas simuladas: linhas "Zero: ..." e "Cliente: ...").
   ========================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizar } from '../../api/_vendas/promessa.mjs';
import { pedeValor } from '../../api/_vendas/zero.mjs';

const limpa = t => normalizar(t).replace(/[^a-z0-9$%,.\s]/g, ' ').replace(/\s+/g, ' ').trim();

const VALOR = /r\$\s?\d[\d.]*(?:,\d{2})?/gi;
const AVISO_DE_IA = /\b(?:sou\s+(?:uma?\s+)?(?:ia|inteligencia artificial|robo|bot|assistente virtual)|(?:uma?\s+)?(?:ia|inteligencia artificial|assistente virtual)\s+(?:mesmo|sim)|nao\s+sou\s+(?:uma\s+)?pessoa|a ia da beyon|sou\b[^.!?]{0,30}?\b(?:ia|inteligencia artificial|robo|bot)\b)/;
const PERGUNTA_SOBRE_IA = /\b(?:robo|bot|ia|inteligencia artificial|maquina|humano|pessoa de verdade|gente de verdade|automatico|real)\b/;
const RECADO = /deix(?:ar|e|o) (?:um |o )?recado/;
/* o mesmo valor escrito de jeitos diferentes ("R$ 8.900," "R$ 8.900." "R$ 8.900,00") é um valor só */
const valorNormal = v => v.replace(/r\$|\s/gi, '').replace(/[.,]+$/, '').replace(/,00$/, '').replace(/\./g, '');
/* pediu o valor: a trava do código (pedeValor) ou qualquer menção a preço, para o juiz não acusar quem pediu de novo com outras palavras */
const MENCIONA_VALOR = /\b(?:valor|preco|quanto|custo|custa|total|entrada|sinal|pagar|parcela)\b/;
const pediuValor = c => pedeValor(c) || MENCIONA_VALOR.test(limpa(c));
const ABERTURAS_VAZIAS = ['entendi', 'perfeito', 'otimo', 'otima pergunta', 'claro', 'certo', 'show', 'beleza', 'com certeza', 'legal', 'que bom', 'combinado', 'boa'];

/* as conversas: [{ zero, cliente }] em ordem; a fala do cliente é a que veio ANTES da resposta do Zero (a abertura fixa não tem) */
export function lerConversa(texto) {
  const turnos = [];
  let cliente = '';
  for (const linha of String(texto).replace(/^﻿/, '').split(/\r?\n/)) {
    const c = /^Cliente:\s*(.*)$/.exec(linha);
    if (c) { cliente = c[1]; continue; }
    const z = /^Zero:\s*(.*)$/.exec(linha);
    if (z) { turnos.push({ zero: z[1], cliente }); cliente = ''; continue; }
    if (turnos.length && linha.trim() && !linha.startsWith('(') && !linha.startsWith('#') && !cliente) turnos[turnos.length - 1].zero += ' ' + linha.trim();
  }
  return turnos;
}

/* a frase termina em ponto, ! ou ? seguido de espaço (o ponto de "8.900" não corta), e a frase fixa do recado já é contada como recado */
const frasesDe = t => String(t).split(/(?<=[.!?;])\s+|\n+/).map(limpa).filter(f => f.split(' ').length >= 5 && !RECADO.test(f));
const primeiras = (t, n) => limpa(t).replace(/[.,]/g, ' ').split(' ').filter(Boolean).slice(0, n).join(' ');

/* medirRepeticao(turnos) → { turnos, valor, avisoIA, recado, abertura, frase, total, detalhes } */
export function medirRepeticao(turnos) {
  const detalhes = [];
  const marca = (tipo, i, nota) => detalhes.push({ tipo, turno: i + 1, nota });
  const valoresVistos = new Set();
  const frasesVistas = new Map();
  let avisoVisto = false, recadoVisto = false;
  turnos.forEach(({ zero, cliente }, i) => {
    const valores = (zero.match(VALOR) ?? []).map(valorNormal);
    if (valores.length && valores.every(v => valoresVistos.has(v)) && !pediuValor(cliente)) marca('valor', i, valores.join(' '));
    valores.forEach(v => valoresVistos.add(v));

    const aviso = AVISO_DE_IA.test(limpa(zero));
    const perguntou = PERGUNTA_SOBRE_IA.test(limpa(cliente));
    const seguido = aviso && AVISO_DE_IA.test(limpa(turnos[i - 1]?.zero ?? ''));
    if (aviso && avisoVisto && (seguido || !perguntou)) marca('avisoIA', i, seguido ? (perguntou ? 'em falas seguidas, a pessoa insistiu' : 'em falas seguidas') : 'sem a pessoa perguntar');
    avisoVisto = avisoVisto || aviso;

    if (RECADO.test(limpa(zero))) { if (recadoVisto) marca('recado', i); recadoVisto = true; }

    const abre = ABERTURAS_VAZIAS.find(a => primeiras(zero, a.split(' ').length) === a);
    const anterior = turnos[i - 1]?.zero;
    if (abre && anterior && primeiras(anterior, 1) === primeiras(zero, 1)) marca('abertura', i, abre);
    else if (anterior && primeiras(anterior, 3) === primeiras(zero, 3) && primeiras(zero, 3).split(' ').length === 3) marca('abertura', i, primeiras(zero, 3));

    for (const f of frasesDe(zero)) {
      const antes = frasesVistas.get(f);
      if (antes !== undefined && antes !== i) marca('frase', i, f.slice(0, 60));
      if (antes === undefined) frasesVistas.set(f, i);
    }
  });
  const conta = tipo => detalhes.filter(d => d.tipo === tipo).length;
  return { turnos: turnos.length, valor: conta('valor'), avisoIA: conta('avisoIA'), recado: conta('recado'), abertura: conta('abertura'), frase: conta('frase'), total: detalhes.length, detalhes };
}

function arquivosDe(alvo) {
  if (!statSync(alvo).isDirectory()) return [alvo];
  return readdirSync(alvo).filter(n => /\.md$/i.test(n) && /^P\d+/i.test(n)).sort().map(n => path.join(alvo, n));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const alvo = process.argv[2];
  if (!alvo) { console.error('uso: node docs/zero/repeticao.mjs <arquivo.md ou pasta com P01.md...>'); process.exit(2); }
  const somas = { valor: 0, avisoIA: 0, recado: 0, abertura: 0, frase: 0 };
  for (const arq of arquivosDe(alvo)) {
    const r = medirRepeticao(lerConversa(readFileSync(arq, 'utf8')));
    Object.keys(somas).forEach(k => { somas[k] += r[k]; });
    console.log(path.basename(arq).padEnd(8), `falas ${String(r.turnos).padStart(2)}  valor ${r.valor}  avisoIA ${r.avisoIA}  recado ${r.recado}  abertura ${r.abertura}  frase ${r.frase}`);
  }
  console.log('TOTAL   ', JSON.stringify(somas));
}
