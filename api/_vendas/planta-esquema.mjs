/* ==========================================================================
   O VALIDADOR DO PLANO NO SERVIDOR (spec §2.4). Servidor e tela usam a MESMA forma (js/orcamento-planta-forma.js); só os textos são do
   servidor. validarPlano(bruto, { nomeDoNegocio, regulado, travas }) -> { ok: true, plano, motivos: [], erros: [] } | { ok: false, motivos, erros }.
   Nunca lança. Os motivos são códigos (cabem no banco, sem texto do modelo ou do visitante); erros = [{ caminho, codigo }], no máximo 20.
   Ordem:
     0) o corpo grande é cortado ANTES de a forma rodar (a forma faz JSON.stringify do bruto inteiro para medir os 8 KB): uma caminhada com teto
        de nós, de fundura e de caracteres, que não chama getter nem toJSON;
     1) a forma (o módulo comum): tipos, listas fechadas, contagens por topologia, caracteres, comprimentos;
     2) a normalização de cada texto (invisíveis, NFKC, sem "<" ">" nem controles, espaço simples) e a RECONFERÊNCIA dos comprimentos (o NFKC
        pode encurtar ou alongar uma frase: a forma conferiu o texto como veio);
     3) títulos distintos (a forma confere ids únicos, não títulos repetidos);
     4) a camada de texto (api/_vendas/planta-textos.mjs) em cada texto já normalizado.
   O plano que volta é uma CÓPIA com os textos normalizados: é isso que se grava e se mostra.

   DUAS VERSÕES (PR 4, plano §5): o mapa do caso v3 (js/orcamento-mapa-forma.js) e a planta v2 (js/orcamento-planta-forma.js). A versão vem da
   CHAVE, nunca de um campo de versão: "estrutura" é v3, "topologia" é v2, as duas juntas são "versao". A opção versoes diz quais valem: o que
   vem do modelo, só ['v3'] (um v2 dá "versao_antiga", e o modelo reescreve no formato novo); a leitura do que está gravado, as duas.
   No v3 também: o texto que a redação de dados pessoais muda (redigir) é recusado como "redigido" (sem corte: o plano é refeito), e o "hoje"
   passa pela camada de texto com campo: 'hoje' (as palavras da pessoa).
   ========================================================================== */
import F from '../../js/orcamento-planta-forma.js';
import M from '../../js/orcamento-mapa-forma.js';
import { paraBusca } from './zero.mjs';
import { redigir } from './seguranca.mjs';
import { normalizarTexto, textoDoPlanoPermitido } from './planta-textos.mjs';

const L = F.LIMITES, LM = M.LIMITES_MAPA;
const VERSOES = Object.freeze(['v2', 'v3']);
const NOS_MAX = 120, FUNDURA_MAX = 6;

function falha(codigo, caminho = '') {
  return { ok: false, motivos: [codigo], erros: [{ caminho, codigo }] };
}

/* a caminhada de antes da forma: só dado próprio e simples (nada de acessor), com teto de nós, fundura e caracteres. Um plano de verdade tem
   uns 100 nós e 4 níveis; passou muito disso, não é um plano. Devolve null (cabe) ou o código */
function cabe(bruto) {
  let nos = 0, caracteres = 0;
  const pilha = [[bruto, 1]];
  while (pilha.length) {
    const [v, fundura] = pilha.pop();
    if (++nos > NOS_MAX) return 'grande';
    if (typeof v === 'string') {
      caracteres += v.length;
      if (caracteres > L.plano_bytes) return 'grande';   /* (cada caractere ocupa ao menos 1 byte: passou de 8 KB em caracteres, passou em bytes) */
    } else if (v !== null && typeof v === 'object') {
      if (fundura > FUNDURA_MAX) return 'grande';
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return 'nao_objeto';
      /* (o teto de nós vale ANTES de empilhar os filhos: um array de 200 mil itens não vira uma pilha de 200 mil) */
      if (Array.isArray(v) && nos + v.length > NOS_MAX) return 'grande';
      const chaves = Object.getOwnPropertyNames(v);
      if (nos + chaves.length > NOS_MAX + 1) return 'grande';
      for (const chave of chaves) {
        if (chave === 'length' && Array.isArray(v)) continue;
        caracteres += chave.length;
        const d = Object.getOwnPropertyDescriptor(v, chave);
        if (!d || 'get' in d || 'set' in d) return 'nao_serializavel';   /* (dado que veio de JSON.parse nunca tem acessor) */
        pilha.push([d.value, fundura + 1]);
      }
    } else if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') return 'nao_serializavel';
  }
  return null;
}

/* os campos de texto do plano e o que cada um exige de tamanho */
function camposDeTexto(p) {
  const campos = [];
  const add = (caminho, obj, chave, tipo) => { if (obj && typeof obj[chave] === 'string') campos.push({ caminho, obj, chave, tipo }); };
  add('chegada.titulo', p.chegada, 'titulo', 'titulo'); add('chegada.frase', p.chegada, 'frase', 'frase');
  (p.etapas || []).forEach((e, i) => { add('etapas[' + i + '].titulo', e, 'titulo', 'titulo'); add('etapas[' + i + '].frase', e, 'frase', 'frase'); });
  add('fim.titulo', p.fim, 'titulo', 'titulo'); add('fim.frase', p.fim, 'frase', 'frase');
  add('fecho', p, 'fecho', 'frase');
  add('rotulo_retorno', p, 'rotulo_retorno', 'rotulo');
  if (Array.isArray(p.rotulos_ramos)) p.rotulos_ramos.forEach((_, i) => add('rotulos_ramos[' + i + ']', p.rotulos_ramos, i, 'rotulo'));
  return campos;
}

const TAMANHOS = {
  titulo: [L.titulo_min, L.titulo_max, 'titulo_curto', 'titulo_longo'],
  frase: [L.frase_min, L.frase_max, 'frase_curta', 'frase_longa'],
  rotulo: [L.rotulo_min, L.rotulo_max, 'rotulo', 'rotulo']
};

/* os textos do mapa v3: o "hoje" (as palavras da pessoa), os nós, as setas, o objetivo e o fecho */
function camposDeTextoV3(p) {
  const campos = [];
  const add = (caminho, obj, chave, tipo) => { if (obj && typeof obj[chave] === 'string') campos.push({ caminho, obj, chave, tipo }); };
  add('hoje.texto', p.hoje, 'texto', 'hoje'); add('hoje.trava', p.hoje, 'trava', 'hoje');
  p.nos.forEach((n, i) => { add('nos[' + i + '].titulo', n, 'titulo', 'titulo'); add('nos[' + i + '].frase', n, 'frase', 'frase'); });
  p.setas.forEach((s, i) => add('setas[' + i + '].rotulo', s, 'rotulo', 'rotulo'));
  add('objetivo.titulo', p.objetivo, 'titulo', 'titulo'); add('objetivo.frase', p.objetivo, 'frase', 'frase');
  add('fecho', p, 'fecho', 'fecho');
  return campos;
}
const TAMANHOS_V3 = {
  titulo: [LM.titulo_min, LM.titulo_max, 'titulo_curto', 'titulo_longo'],
  frase: [LM.frase_min, LM.frase_max, 'frase_curta', 'frase_longa'],
  rotulo: [LM.rotulo_min, LM.rotulo_max, 'rotulo', 'rotulo'],
  hoje: [LM.hoje_min, LM.hoje_max, 'hoje_curto', 'hoje_longo'],
  fecho: [LM.fecho_min, LM.fecho_max, 'fecho_curto', 'fecho_longo']
};
const DA_VERSAO = {
  v2: { forma: b => F.validarFormaPlano(b), campos: camposDeTexto, tamanhos: TAMANHOS, redigir: false },
  v3: { forma: b => M.validarFormaMapa(b), campos: camposDeTextoV3, tamanhos: TAMANHOS_V3, redigir: true }
};

/* a versão pela chave; a que não está em versoes não vale (o v2 vindo do modelo é "versao_antiga") */
function versaoDe(bruto, versoes) {
  const proprio = k => bruto !== null && typeof bruto === 'object' && Object.prototype.hasOwnProperty.call(bruto, k);
  if (proprio('estrutura') && proprio('topologia')) return { codigo: 'versao' };
  const v = proprio('estrutura') ? 'v3' : proprio('topologia') ? 'v2' : versoes.includes('v2') ? 'v2' : 'v3';
  if (!versoes.includes(v)) return { codigo: v === 'v2' ? 'versao_antiga' : 'versao' };
  return { v };
}

export function validarPlano(bruto, opcoes) {
  try {
    const { nomeDoNegocio = '', regulado = false, travas = true, cidade = '', versoes: pedidas } = opcoes && typeof opcoes === 'object' ? opcoes : {};
    const versoes = Array.isArray(pedidas) && pedidas.length ? pedidas.filter(v => VERSOES.includes(v)) : VERSOES;
    const corte = cabe(bruto);
    if (corte) return falha(corte);
    const qual = versaoDe(bruto, versoes);
    if (qual.codigo) return falha(qual.codigo);
    const D = DA_VERSAO[qual.v];
    const forma = D.forma(bruto);
    if (!forma.ok) return { ok: false, motivos: forma.motivos.slice(), erros: forma.erros.slice() };
    const plano = forma.plano;   /* (uma cópia nova: a forma trabalha num instantâneo) */
    const motivos = [], erros = [];
    const reprovar = (caminho, codigo) => {
      if (!motivos.includes(codigo)) motivos.push(codigo);
      if (erros.length < L.erros_max) erros.push({ caminho, codigo });
    };
    const campos = D.campos(plano);
    /* 2) normaliza e reconfere o comprimento; no v3, o que a redação de dados pessoais mudaria é recusado inteiro */
    for (const c of campos) {
      if (D.redigir && redigir(c.obj[c.chave]) !== c.obj[c.chave]) reprovar(c.caminho, 'redigido');
      c.obj[c.chave] = normalizarTexto(c.obj[c.chave]);
      const [min, max, codMin, codMax] = D.tamanhos[c.tipo];
      if (c.obj[c.chave].length < min) reprovar(c.caminho, codMin);
      else if (c.obj[c.chave].length > max) reprovar(c.caminho, codMax);
    }
    /* 3) títulos distintos: chegada, etapas e fim; mesma busca (sem caixa, acento, pontuação) é o mesmo título */
    const vistos = new Set();
    for (const c of campos) {
      if (c.chave !== 'titulo') continue;
      const busca = paraBusca(c.obj[c.chave]);
      if (vistos.has(busca)) reprovar(c.caminho, 'titulo_repetido'); else vistos.add(busca);
    }
    /* 4) cada texto na camada de texto (o texto aceito volta normalizado; é o mesmo que já está no plano) */
    for (const c of campos) {
      const r = textoDoPlanoPermitido(c.obj[c.chave], { nomeDoNegocio, regulado, travas, cidade, campo: c.tipo === 'hoje' ? 'hoje' : '' });
      if (!r.ok) reprovar(c.caminho, r.motivo);
    }
    return motivos.length ? { ok: false, motivos, erros } : { ok: true, plano, versao: qual.v, motivos: [], erros: [] };
  } catch {
    return falha('interno');   /* falha fechado */
  }
}
