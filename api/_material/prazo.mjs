/* ==========================================================================
   O PRAZO DE ENTREGA EM DIAS ÚTEIS (PR 3b-2; spec §2.1 e a decisão do dono de 21/10, que revê a de 09/10). Conta os dias no
   fuso America/Campo_Grande (-04:00); sábado, domingo e feriado NÃO contam; o dia de partida não conta; o prazo só corre com a
   entrada paga e o número dos botões enviado (o mais tarde dos dois); para enquanto se espera a lista de ajustes (os dias úteis
   da pausa, do dia seguinte ao início até o fim, inclusive, são somados, como dias úteis); uma nova data combinada substitui a base e só as pausas DEPOIS dela somam.
   Vale o prazo da proposta aceita (prazoDias), não os 10 fixos da captação (o pedido.json leva o mesmo número).
   FERIADOS = só os nacionais (decisão do dono de 21/10; a captação conta também móveis e os de Campo Grande, e vai alinhar). Texto ao cliente:
   "Sábado, domingo e feriado nacional não contam."
   docs/testes/fixtures/captacao/prazo-casos.json tem os casos (os da captação, para-o-site.md §6, e os do site).
   ========================================================================== */
export const FUSO = 'America/Campo_Grande';

/* Os feriados que não contam: SÓ OS NACIONAIS (decisão do dono, 21/10: nenhum estadual ou municipal). Os nove de data fixa mais a
   Sexta-feira Santa (nacional por lei, data móvel). Carnaval e Corpus Christi são ponto facultativo, não feriado: contam como dia útil.
   FERIADOS responde `.has('AAAA-MM-DD')` para qualquer ano; quem quiser outra lista passa um Set no parâmetro `feriados`. */
export const NACIONAIS_FIXOS = Object.freeze(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);
function sextaSanta(ano) {   /* Páscoa pelo algoritmo de Meeus/Jones/Butcher; a Sexta-feira Santa é 2 dias antes */
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), diaDoMes = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, diaDoMes - 2)).toISOString().slice(0, 10);
}
export function feriadosNacionais(ano) {
  return new Set([...NACIONAIS_FIXOS.map(mmdd => ano + '-' + mmdd), sextaSanta(ano)]);
}
const POR_ANO = new Map();
export const FERIADOS = Object.freeze({
  has(diaIso) {
    const ano = Number(String(diaIso).slice(0, 4));
    if (!POR_ANO.has(ano)) POR_ANO.set(ano, feriadosNacionais(ano));
    return POR_ANO.get(ano).has(diaIso);
  }
});
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
/* quantos dias úteis há depois de `de` até `ate`, inclusive (a conta da captação: a espera começa no dia `de`, que não conta).
   `limite` (B1): para de contar ao chegar nele (um dia útil aparece a cada 4 dias corridos no máximo: o laço nunca passa de ~4x o limite, por mais longe que seja `ate`) */
export function diasUteisEntre(de, ate, feriados = FERIADOS, limite = Infinity) {
  let n = 0;
  for (let a = somarDias(de, 1); a <= ate && n < limite; a = somarDias(a, 1)) if (ehUtil(a, feriados)) n++;
  return n;
}

/* o prazo só começa com a entrada paga E o número enviado */
export function iniciarPrazo({ entrada_em: entrada, numero_em: numero }) {
  if (!entrada || !numero) return null;
  return { conta_desde: maisTarde(entrada, numero) };
}

/* Os limites (B1, revisão de segurança): o prazo_dias do banco é inteiro de 1 a 60 (check do banco); os dias úteis parados SOMADOS têm teto (~1 ano de pausas: acima disso o pedido
   é caso para a pessoa olhar, não para um laço). Fora disso, RangeError com mensagem clara (o erro que os chamadores já tratam) e imediato. */
export const PRAZO_DIAS_MAX = 60;
export const PARADOS_DIAS_UTEIS_MAX = 260;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const instante = (quando, nome) => { if (!Number.isFinite(ms(quando))) throw new RangeError(nome + ' ilegível no prazo'); return quando; };
const listaDe = x => (Array.isArray(x) ? x : []);

export function calcularEntregarAte(prazo, { prazoDias, fuso = FUSO, feriados = FERIADOS }, agora = new Date()) {
  const { conta_desde: desde } = prazo || {};
  const novas = listaDe(prazo && prazo.novas_datas), pausas = listaDe(prazo && prazo.pausas);
  if (!desde) return null;
  instante(desde, 'conta_desde');
  const ultima = novas.length ? novas[novas.length - 1] : null;
  let base;
  if (ultima) {
    if (!DATA_ISO.test(String(ultima.data))) throw new RangeError('data combinada ilegível no prazo');
    instante(ultima.combinada_em, 'combinada_em');
    base = ultima.data;
  } else {
    if (!Number.isInteger(prazoDias) || prazoDias < 1 || prazoDias > PRAZO_DIAS_MAX) throw new RangeError('prazo_dias fora de um inteiro de 1 a ' + PRAZO_DIAS_MAX);
    base = somarDiasUteis(diaNoFuso(desde, fuso), prazoDias, feriados);
  }
  const contarDe = ms(ultima ? ultima.combinada_em : desde);
  const hoje = diaNoFuso(agora, fuso);
  let parados = 0;
  for (const p of pausas) {
    if (!p || !(ms(p.desde) >= contarDe)) continue;   /* (antes da data combinada, ou data ilegível sem número: não soma) */
    if (p.ate !== null && p.ate !== undefined) instante(p.ate, 'fim da pausa');
    parados += diasUteisEntre(diaNoFuso(p.desde, fuso), p.ate ? diaNoFuso(p.ate, fuso) : hoje, feriados, PARADOS_DIAS_UTEIS_MAX - parados);
    if (parados >= PARADOS_DIAS_UTEIS_MAX) break;
  }
  return somarDiasUteis(base, parados, feriados);
}

/* vencido: passou do dia combinado, e não está parado esperando a lista de ajustes */
export function prazoVencido(prazo, { prazoDias, fuso = FUSO, feriados = FERIADOS }, agora = new Date()) {
  if (listaDe(prazo && prazo.pausas).some(p => p && p.ate === null)) return false;
  const ate = calcularEntregarAte(prazo, { prazoDias, fuso, feriados }, agora);
  return Boolean(ate) && diaNoFuso(agora, fuso) > ate;
}

/* a PAUSA do prazo (spec §2.1, D4): abre quando a prévia sai e fecha quando o cliente responde (lista ou aprovação). Nunca mexe no objeto
   recebido; as duas são idempotentes. `calcularEntregarAte` soma os dias úteis parados e `prazoVencido` é falso com uma pausa aberta. */
export function abrirPausa(prazo, desde) {
  const pausas = Array.isArray(prazo && prazo.pausas) ? prazo.pausas : [];
  if (pausas.some(p => p.ate === null)) return { ...prazo, pausas };
  return { ...prazo, pausas: [...pausas, { desde, ate: null }] };
}
export function fecharPausa(prazo, ate) {
  const pausas = (Array.isArray(prazo && prazo.pausas) ? prazo.pausas : []).map(p => (p.ate === null ? { ...p, ate } : p));
  return { ...prazo, pausas };
}
/* dias CORRIDOS entre o dia de `de` e o dia de `agora` no fuso da captação: 30 sem material, 3 do restante (contados do aviso "no ar", 22/10), 7 de desistência (não são prazo de entrega) */
export function diasCorridosDesde(de, agora = new Date(), fuso = FUSO) {
  return Math.round((dia(diaNoFuso(agora, fuso)) - dia(diaNoFuso(de, fuso))) / DIA_MS);
}

/* "5 de novembro": o dia vem pronto do servidor; o fuso do aparelho não entra */
export function dataPorExtenso(diaIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(diaIso || ''));
  return m ? Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] : '';
}
