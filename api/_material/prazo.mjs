/* ==========================================================================
   O PRAZO DE ENTREGA EM DIAS ÚTEIS (PR 3b-2; spec §2.1 e a decisão do dono de 21/10, que revê a de 09/10). Conta os dias no
   fuso America/Campo_Grande (-04:00); sábado, domingo e feriado NÃO contam; o dia de partida não conta; o prazo só corre com a
   entrada paga e o número dos botões enviado (o mais tarde dos dois); para enquanto se espera a lista de ajustes (os dias úteis
   da pausa, do dia seguinte ao início até o fim, inclusive, são somados, como dias úteis); uma nova data combinada substitui a base e só as pausas DEPOIS dela somam.
   Vale o prazo da proposta aceita (prazoDias), não os 10 fixos da captação (o pedido.json leva o mesmo número).
   FERIADOS nasce vazio: QUAIS feriados contam é decisão do dono (a captação hoje conta os nacionais, os móveis e os de Campo Grande,
   com a lista ainda não conferida); a lista entra aqui, com teste, quando ele disser. Os casos de teste usam só os nacionais.
   docs/testes/fixtures/captacao/prazo-casos.json tem os casos (os da captação, para-o-site.md §6, e os do site).
   ========================================================================== */
export const FUSO = 'America/Campo_Grande';
export const FERIADOS = new Set();
const DIA_MS = 86400000;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* os formatadores moram no módulo (criar um Intl.DateTimeFormat custa; o Worker grátis tem 10 ms) */
const FORMATO_DIA = new Map(), FORMATO_DESLOC = new Map();
const formatoDoDia = fuso => {
  if (!FORMATO_DIA.has(fuso)) FORMATO_DIA.set(fuso, new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }));
  return FORMATO_DIA.get(fuso);
};
const formatoDeDeslocamento = fuso => {
  if (!FORMATO_DESLOC.has(fuso)) FORMATO_DESLOC.set(fuso, new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'longOffset' }));
  return FORMATO_DESLOC.get(fuso);
};

const ms = quando => (quando instanceof Date ? quando.getTime() : Date.parse(quando));
export const diaNoFuso = (quando, fuso = FUSO) => formatoDoDia(fuso).format(new Date(ms(quando)));
const dia = d => Date.parse(d + 'T00:00:00Z');
const somarDias = (d, n) => new Date(dia(d) + n * DIA_MS).toISOString().slice(0, 10);

/* "2026-10-22T09:00:00-04:00" (o deslocamento do fuso NAQUELE instante) */
export function isoNoFuso(quando, fuso = FUSO) {
  const t = ms(quando);
  if (!Number.isFinite(t)) throw new Error('instante inválido');
  const parte = formatoDeDeslocamento(fuso).formatToParts(new Date(t)).find(p => p.type === 'timeZoneName').value;
  const off = parte === 'GMT' ? '+00:00' : parte.slice(3);
  const min = (off[0] === '-' ? -1 : 1) * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6)));
  return new Date(t + min * 60000).toISOString().slice(0, 19) + off;
}
export const maisTarde = (a, b) => (ms(a) >= ms(b) ? a : b);

/* dia útil: não é sábado, nem domingo, nem feriado */
export function ehUtil(d, feriados = FERIADOS) {
  const semana = new Date(dia(d)).getUTCDay();
  return semana !== 0 && semana !== 6 && !feriados.has(d);
}
/* o n-ésimo dia útil DEPOIS de `d` (o dia de partida não conta) */
export function somarDiasUteis(d, n, feriados = FERIADOS) {
  let atual = d, falta = n;
  while (falta > 0) { atual = somarDias(atual, 1); if (ehUtil(atual, feriados)) falta--; }
  return atual;
}
/* quantos dias úteis há depois de `de` até `ate`, inclusive (a conta da captação: a espera começa no dia `de`, que não conta) */
export function diasUteisEntre(de, ate, feriados = FERIADOS) {
  let n = 0;
  for (let a = somarDias(de, 1); a <= ate; a = somarDias(a, 1)) if (ehUtil(a, feriados)) n++;
  return n;
}

/* o prazo só começa com a entrada paga E o número enviado */
export function iniciarPrazo({ entrada_em: entrada, numero_em: numero }) {
  if (!entrada || !numero) return null;
  return { conta_desde: maisTarde(entrada, numero) };
}

export function calcularEntregarAte(prazo, { prazoDias, fuso = FUSO, feriados = FERIADOS }, agora = new Date()) {
  const { conta_desde: desde, novas_datas: novas = [], pausas = [] } = prazo || {};
  if (!desde) return null;
  const ultima = novas.length ? novas[novas.length - 1] : null;
  const base = ultima ? ultima.data : somarDiasUteis(diaNoFuso(desde, fuso), prazoDias, feriados);
  const contarDe = ms(ultima ? ultima.combinada_em : desde);
  const hoje = diaNoFuso(agora, fuso);
  const parados = pausas.filter(p => ms(p.desde) >= contarDe)
    .reduce((soma, p) => soma + diasUteisEntre(diaNoFuso(p.desde, fuso), p.ate ? diaNoFuso(p.ate, fuso) : hoje, feriados), 0);
  return somarDiasUteis(base, parados, feriados);
}

/* vencido: passou do dia combinado, e não está parado esperando a lista de ajustes */
export function prazoVencido(prazo, { prazoDias, fuso = FUSO, feriados = FERIADOS }, agora = new Date()) {
  if (((prazo && prazo.pausas) || []).some(p => p.ate === null)) return false;
  const ate = calcularEntregarAte(prazo, { prazoDias, fuso, feriados }, agora);
  return Boolean(ate) && diaNoFuso(agora, fuso) > ate;
}

/* "5 de novembro": o dia vem pronto do servidor; o fuso do aparelho não entra */
export function dataPorExtenso(diaIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(diaIso || ''));
  return m ? Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] : '';
}
