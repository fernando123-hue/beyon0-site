/* AS FORMAS VÁLIDAS DA PLANTA, geradas por código, para os testes do desenho (layout, DOM). Não é teste (o agregador só importa
   planta-*.test.mjs). Cada plano sai daqui já conferido pelo módulo de forma: se o gerador errar, o teste que o usa acusa. */
import F from '../../js/orcamento-planta-forma.js';

const TIPOS = F.TIPOS_ETAPA;
const VERBOS = F.VERBOS;
const frase = (i) => 'Frase de teste número ' + 'abcdefghij'[i % 10] + ' para a etapa, com tamanho suficiente.';

function etapa(i, extra) {
  return Object.assign({ id: 'e' + i, tipo: TIPOS[i % TIPOS.length], verbo: VERBOS[i % VERBOS.length], titulo: 'Etapa ' + i + ' do teste de layout', frase: frase(i) }, extra || {});
}
const base = (topologia, etapas, extra) => Object.assign({
  topologia,
  chegada: { origens: ['busca', 'mapa'], titulo: 'Busca e mapa', frase: 'A pessoa chega pela busca ou pelo mapa do aparelho.' },
  etapas,
  fim: { titulo: 'Objetivo do teste', frase: 'O objetivo do teste aparece no fim, sem ninguém ter atendido.' },
  fecho: 'A pessoa chegou, foi entendida e o pedido saiu pronto para a equipe.'
}, extra || {});

export function laco(n) {
  const e = [];
  for (let i = 0; i < n; i++) e.push(etapa(i, i === 1 ? { decisao: true } : i === n - 1 ? { retorno: true } : {}));
  return base('laco', e, { rotulo_retorno: 'o site continua' });
}

/* e = etapas de entrada (a última decide), r0 e r1 = tamanhos dos ramos, s = saída */
export function bifurca(e, r0, r1, s) {
  const lista = [];
  let i = 0;
  for (let k = 0; k < e; k++) lista.push(etapa(i++, k === e - 1 ? { decisao: true } : {}));
  for (let k = 0; k < r0; k++) lista.push(etapa(i++, { ramo: 0 }));
  for (let k = 0; k < r1; k++) lista.push(etapa(i++, { ramo: 1 }));
  for (let k = 0; k < s; k++) lista.push(etapa(i++));
  return base('bifurca', lista, { rotulos_ramos: ['caminho da esquerda', 'caminho da direita'] });
}

/* t = tronco; sats = [{ host (índice no tronco), lado, laco }]; antes = põe os satélites antes do tronco no array (a forma não exige ordem) */
export function espinha(t, sats, antes) {
  const tronco = [];
  for (let k = 0; k < t; k++) tronco.push(etapa(k));
  const satelites = sats.map((s, j) => etapa(100 + j, Object.assign({ satelite_de: 'e' + s.host, lado: s.lado }, s.laco ? { laco: true } : {})));
  return base('espinha', antes ? satelites.concat(tronco) : tronco.concat(satelites));
}

/* todas as formas válidas de 8 e 9 caixas (7 e 8 etapas), nas três topologias */
export function todasAsFormas() {
  const out = [];
  for (const n of [7, 8]) out.push({ nome: 'laco-' + n, plano: laco(n) });
  for (let e = 1; e <= 6; e++) for (let r0 = 1; r0 <= 2; r0++) for (let r1 = 1; r1 <= 2; r1++) for (let s = 1; s <= 2; s++) {
    if (e + r0 + r1 + s < 7 || e + r0 + r1 + s > 8) continue;
    out.push({ nome: 'bifurca-' + [e, r0, r1, s].join('-'), plano: bifurca(e, r0, r1, s) });
  }
  const casos = [[4, [0, 2, 3]], [4, [0, 1, 2, 3]], [5, [1, 4]], [5, [0, 2, 4]]];
  const lados = [['cima', 'cima', 'cima', 'cima'], ['baixo', 'baixo', 'baixo', 'baixo'], ['cima', 'baixo', 'cima', 'baixo']];
  for (const [t, hosts] of casos) {
    lados.forEach((ld, li) => {
      [false, true].forEach((comLaco) => {
        const sats = hosts.map((h, i) => ({ host: h, lado: ld[i], laco: comLaco && i === 1 }));
        out.push({ nome: 'espinha-' + t + '-' + hosts.length + '-l' + li + (comLaco ? '-laco' : ''), plano: espinha(t, sats, li === 2) });
      });
    });
  }
  /* o último passo do tronco com satélite em cima (o desenho o desce no computador) */
  out.push({ nome: 'espinha-ultimo-cima', plano: espinha(5, [{ host: 1, lado: 'baixo' }, { host: 4, lado: 'cima' }]) });
  return out;
}
