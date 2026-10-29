/* ==========================================================================
   A MÉTRICA DE PRAZO, prometido × real (dono, 2026-10-28: "se o trabalho não couber em 10 dias úteis, crie uma métrica para
   analisar e aumentar a quantidade de dias desde já"). Funções puras: o comando scripts/prazo-real.mjs lê as entregas e
   imprime a tabela. Testes: docs/testes/prazo-real.test.mjs.
   • Dias reais: os dias úteis do início do relógio (prazo.conta_desde: a entrada paga e o material, o mais tarde dos dois) até
     o dia em que o site foi ao ar (no_ar_em), menos os dias úteis de espera pela lista de ajustes (as pausas), com a mesma
     conta do prazo da entrega (api/_material/prazo.mjs: o dia de partida não conta; sábado, domingo e feriado nacional não
     contam; espera de antes do início não conta; espera aberta fecha no dia no ar). A nova data combinada não entra: a
     métrica compara com o prazo da tabela, o que o cliente viu.
   • No prazo: real ≤ prometido (o prazo_dias da proposta, que já soma os adicionais e a urgência).
   • Sugestão por formato: o prazo da tabela + o percentil 75 do atraso (real − prometido), arredondado para cima. Só
     aumenta (o atraso negativo mantém), nunca passa de 60 (o banco guarda de 1 a 60) e só com 3 entregas ou mais.
     Percentil pelo posto mais próximo: o valor na posição ⌈0,75 × n⌉ da lista em ordem.
   ========================================================================== */
import { FERIADOS, FUSO, diaNoFuso, diasUteisEntre, PRAZO_DIAS_MAX } from '../api/_material/prazo.mjs';

export const MINIMO_ENTREGAS = 3;
const PERCENTIL = 0.75;

const instante = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const percentil = (valores, p) => { const o = [...valores].sort((a, b) => a - b); return o[Math.max(0, Math.ceil(p * o.length) - 1)]; };
const umaCasa = v => Math.round(v * 10) / 10;

/* uma entrega no ar → { formato, prometido, real, atraso, no_prazo }; sem os dados (ou ilegível) → null */
export function medirEntrega(e, { feriados = FERIADOS, fuso = FUSO } = {}) {
  if (!e || typeof e.formato !== 'string' || !e.formato || !Number.isInteger(e.prazo_dias) || e.prazo_dias < 1) return null;
  if (!instante(e.inicio) || !instante(e.no_ar)) return null;
  const inicio = diaNoFuso(e.inicio, fuso), noAr = diaNoFuso(e.no_ar, fuso);
  const total = diasUteisEntre(inicio, noAr, feriados);
  let parados = 0;
  for (const p of Array.isArray(e.pausas) ? e.pausas : []) {
    if (!p || !instante(p.desde) || Date.parse(p.desde) < Date.parse(e.inicio)) continue;   /* (antes do início: não conta) */
    const ate = instante(p.ate) ? diaNoFuso(p.ate, fuso) : noAr;   /* (aberta quando foi ao ar: fecha no dia no ar) */
    parados += diasUteisEntre(diaNoFuso(p.desde, fuso), ate < noAr ? ate : noAr, feriados);
  }
  const real = Math.max(0, total - parados);
  return { formato: e.formato, prometido: e.prazo_dias, real, atraso: real - e.prazo_dias, no_prazo: real <= e.prazo_dias };
}

function sugerir(medidas, atual) {
  if (medidas.length < MINIMO_ENTREGAS) return { sugestao: 'manter', motivo: 'menos de ' + MINIMO_ENTREGAS + ' entregas' };
  if (!Number.isInteger(atual)) return { sugestao: 'manter', motivo: 'formato sem prazo na tabela' };
  const atraso = Math.ceil(percentil(medidas.map(m => m.atraso), PERCENTIL));
  const motivo = 'p75 do atraso: ' + atraso + ' dias úteis';
  return { sugestao: atraso > 0 ? Math.min(PRAZO_DIAS_MAX, atual + atraso) : 'manter', motivo };
}

/* a lista de entregas → por formato: n, média e p75 dos dias reais, % no prazo, prazo atual e sugestão; e quantas ficaram fora */
export function analisarPrazos(entregas, { prazosAtuais = {}, feriados = FERIADOS, fuso = FUSO } = {}) {
  const porFormato = new Map();
  let ignoradas = 0;
  for (const e of entregas || []) {
    const m = medirEntrega(e, { feriados, fuso });
    if (!m) { ignoradas++; continue; }
    porFormato.set(m.formato, [...(porFormato.get(m.formato) || []), m]);
  }
  /* (Object.fromEntries: o formato vem do banco; um "__proto__" vira chave comum, não mexe no protótipo) */
  const formatos = Object.fromEntries([...porFormato].map(([formato, medidas]) => {
    const reais = medidas.map(m => m.real);
    const atual = Object.hasOwn(prazosAtuais, formato) && Number.isInteger(prazosAtuais[formato]) ? prazosAtuais[formato] : null;
    return [formato, {
      n: medidas.length,
      media: umaCasa(reais.reduce((s, v) => s + v, 0) / reais.length),
      p75: percentil(reais, PERCENTIL),
      no_prazo_pct: Math.round(100 * medidas.filter(m => m.no_prazo).length / medidas.length),
      prazo_atual: atual,
      ...sugerir(medidas, atual)
    }];
  }));
  return { formatos, ignoradas };
}

/* um item da lista do painel (/api/painel?fila=entregas, app.vendas_entregas_lista) → a entrada de analisarPrazos */
export function deItemDoPainel(it) {
  const prazo = it && it.prazo && typeof it.prazo === 'object' ? it.prazo : {};
  return {
    formato: it ? it.formato : null,
    prazo_dias: it ? it.prazo_dias : null,
    inicio: prazo.conta_desde || null,
    no_ar: (it && it.no_ar_em) || null,
    pausas: Array.isArray(prazo.pausas) ? prazo.pausas : []
  };
}

/* o que o dono lê no terminal */
export function tabelaDePrazos({ formatos, ignoradas }) {
  const nomes = Object.keys(formatos);
  if (!nomes.length) return ['Nenhuma entrega no ar para medir ainda.' + (ignoradas ? ' (' + ignoradas + ' fora da conta, sem início do relógio ou sem dia no ar)' : '')];
  const num = v => String(v).replace('.', ',');
  const linhas = ['formato            entregas  média  p75  no prazo  prazo da tabela → sugestão'];
  for (const k of nomes) {
    const f = formatos[k];
    const sug = f.sugestao === 'manter' ? 'manter' : f.prazo_atual + ' → ' + f.sugestao;
    linhas.push(k.padEnd(18) + ' ' + String(f.n).padStart(8) + '  ' + num(f.media).padStart(5) + '  ' + String(f.p75).padStart(3) + '  ' + (f.no_prazo_pct + '%').padStart(8) + '  ' + sug + ' (' + f.motivo + ')');
  }
  if (ignoradas) linhas.push(ignoradas + (ignoradas === 1 ? ' entrega fora da conta' : ' entregas fora da conta') + ' (sem início do relógio ou sem dia no ar).');
  return linhas;
}
