/* ==========================================================================
   O VALIDADOR DO PLANO NO SERVIDOR (spec §2.4). Servidor e tela usam a MESMA forma (js/orcamento-planta-forma.js); só os textos são do
   servidor. validarPlano(bruto, { nomeDoNegocio, regulado }) -> { ok: true, plano, motivos: [], erros: [] } | { ok: false, motivos, erros }.
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
   ========================================================================== */
import F from '../../js/orcamento-planta-forma.js';
import { paraBusca } from './zero.mjs';
import { normalizarTexto, textoDoPlanoPermitido } from './planta-textos.mjs';

const L = F.LIMITES;
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
      for (const chave of Object.getOwnPropertyNames(v)) {
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

export function validarPlano(bruto, opcoes) {
  try {
    const { nomeDoNegocio = '', regulado = false } = opcoes && typeof opcoes === 'object' ? opcoes : {};
    const corte = cabe(bruto);
    if (corte) return falha(corte);
    const forma = F.validarFormaPlano(bruto);
    if (!forma.ok) return { ok: false, motivos: forma.motivos.slice(), erros: forma.erros.slice() };
    const plano = forma.plano;   /* (uma cópia nova: a forma trabalha num instantâneo) */
    const motivos = [], erros = [];
    const reprovar = (caminho, codigo) => {
      if (!motivos.includes(codigo)) motivos.push(codigo);
      if (erros.length < L.erros_max) erros.push({ caminho, codigo });
    };
    const campos = camposDeTexto(plano);
    /* 2) normaliza e reconfere o comprimento */
    for (const c of campos) {
      c.obj[c.chave] = normalizarTexto(c.obj[c.chave]);
      const [min, max, codMin, codMax] = TAMANHOS[c.tipo];
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
      const r = textoDoPlanoPermitido(c.obj[c.chave], { nomeDoNegocio, regulado });
      if (!r.ok) reprovar(c.caminho, r.motivo);
    }
    return motivos.length ? { ok: false, motivos, erros } : { ok: true, plano, motivos: [], erros: [] };
  } catch {
    return falha('interno');   /* falha fechado */
  }
}
