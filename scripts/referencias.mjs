/* ==========================================================================
   AS REFERÊNCIAS DE IMAGEM DE CADA PEDIDO (decisão do dono, 2026-11-11: "a pesquisa de referências deve ser 100%
   automática", "cada pesquisa específica para cada contexto"). Spec: docs/specs/2026-11-11-referencias-pexels.md.

   O comando "pedido" (scripts/direcoes.mjs) chama montarReferencias depois de preparar a pasta da sessão: uma busca
   no Pexels por estratégia (conversão, autoridade, experiência), montada SÓ com campos fechados do pedido (o ramo da
   lista e os objetivos da lista), e as fotos vão para ./referencias da pasta do pedido.
   A sessão isolada (sem internet) lê o referencias.json e olha as fotos como referência de atmosfera, luz e paleta.

   Por que Pexels (pesquisa de 2026-11-11, fontes na spec): tem busca aberta por API e a licença permite usar a foto,
   inclusive comercialmente, no site de um cliente. As bibliotecas de inspiração que o dono citou não têm busca aberta
   e os termos delas proíbem raspar.

   Regras de segurança (o briefing é texto de um desconhecido; a pasta é lida por uma sessão de IA):
   • a consulta nunca leva texto livre: o ramo "outro", o segmento escrito pelo consultor, a cidade e a descrição não
     entram; o que não casa com a lista fechada vira "geral";
   • a chave (PEXELS_API_KEY, no terminal do dono, como a PAINEL_CHAVE) só vai para api.pexels.com, nunca para a pasta
     nem para a sessão; as fotos são baixadas sem cabeçalho nenhum, só de https://images.pexels.com;
   • só JPEG, PNG ou WebP, até 2 MB cada (o download para ao passar), com tempo limite que vale também para o corpo;
     nome do arquivo fixo (<estratégia>-<n>.<ext>);
   • do que o Pexels devolve, só entram o id da foto e a cor média: nenhum texto de terceiro (descrição, nome do
     fotógrafo, endereço com palavras) chega à pasta que a sessão lê. O crédito é a página da foto, montada aqui pelo id
     (https://www.pexels.com/photo/<id>/), que mostra o fotógrafo;
   • as fotos passam pela mesma conferência de imagem do material do cliente (tipo pelos bytes e estrutura inteira:
     api/_material/bytes.mjs e scripts/imagem-estrutura.mjs);
   • qualquer falha (sem chave, sem rede, limite de buscas) só desliga as referências daquele pedido, ou só as da
     estratégia que falhou: o pedido segue.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { tipoPorBytes } from '../api/_material/bytes.mjs';
import { estruturaCompleta } from './imagem-estrutura.mjs';

export const API_PEXELS = 'https://api.pexels.com/v1/search';
const HOST_FOTOS = 'images.pexels.com';
export const PASTA_REFERENCIAS = 'referencias';
export const ARQUIVO_CREDITOS = 'referencias.json';
export const ESTRATEGIAS_REF = Object.freeze(['conversao', 'autoridade', 'experiencia']);
export const FOTOS_POR_ESTRATEGIA = 4;
const LIMITE_BYTES = 2 * 1024 * 1024;
const TEMPO_MS = 15000;

/* o ramo pela lista fechada do orçamento (api/_vendas/catalogo.mjs NOME_RAMO): o briefing traz o RÓTULO ("saúde") */
const RAMO_DO_ROTULO = Object.freeze({
  'serviços': 'servicos', 'saúde': 'saude', 'beleza': 'beleza', 'alimentação': 'alimentacao',
  'comércio': 'comercio', 'educação': 'educacao', 'associação': 'associacao'
});
/* o assunto de cada ramo (inglês: a busca do Pexels rende mais assim) e o tom de cada estratégia */
const ASSUNTO = Object.freeze({
  servicos: 'professional service business', saude: 'modern health clinic', beleza: 'beauty salon',
  alimentacao: 'restaurant food', comercio: 'retail shop', educacao: 'education classroom',
  associacao: 'community people together', geral: 'small business'
});
const TOM = Object.freeze({
  conversao: 'bright clean',          /* direto, claro, ação */
  autoridade: 'professional expert',   /* confiança, competência */
  experiencia: 'atmospheric detail'    /* textura, luz, sensação */
});
/* um detalhe pelo objetivo principal (o 1º da lista fechada do briefing que tiver detalhe) */
const DETALHE_OBJETIVO = Object.freeze({
  agendamentos: 'appointment', vender: 'products', lancar_produto: 'product', apresentar_empresa: 'team',
  autoridade: 'expert', gerar_leads: 'customer', captar_contatos: 'customer'
});

const normalizar = s => String(s || '').trim().toLowerCase();

/* o ramo do pedido: só o rótulo EXATO da lista; o resto (outro, texto do consultor, nada) é "geral" */
export function ramoDoBriefing(briefing) {
  const rotulo = normalizar(briefing && briefing.negocio && briefing.negocio.segmento);
  return Object.hasOwn(RAMO_DO_ROTULO, rotulo) ? RAMO_DO_ROTULO[rotulo] : 'geral';
}

/* as consultas do pedido, uma por estratégia, SÓ com palavras deste arquivo (nada do briefing entra como texto) */
export function consultasDoPedido(briefing) {
  const ramo = ramoDoBriefing(briefing);
  const objetivos = Array.isArray(briefing && briefing.objetivos) ? briefing.objetivos : [];
  const chave = objetivos.find(o => typeof o === 'string' && Object.hasOwn(DETALHE_OBJETIVO, o));
  const detalhe = chave ? DETALHE_OBJETIVO[chave] : '';
  return ESTRATEGIAS_REF.map(estrategia => ({
    estrategia,
    consulta: [TOM[estrategia], ASSUNTO[ramo], estrategia === 'experiencia' ? '' : detalhe].filter(Boolean).join(' ')
  }));
}

/* ---------- a resposta do Pexels: só o que serve, conferido ---------- */
const urlDe = (v, hosts) => {
  let u;
  try { u = new URL(String(v || '')); } catch { return null; }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts.includes(u.hostname) ? u.href : null;
};
const corSegura = v => (/^#[0-9A-Fa-f]{6}$/.test(String(v || '')) ? String(v).toUpperCase() : null);

export function fotosDaResposta(corpo, quantas = FOTOS_POR_ESTRATEGIA) {
  const lista = corpo && Array.isArray(corpo.photos) ? corpo.photos : [];
  const fotos = [];
  for (const f of lista) {
    const src = f && f.src && typeof f.src === 'object' ? f.src : {};
    /* a "large" (até 940 px de largura) basta para ver atmosfera e paleta e pesa pouco */
    const imagem = urlDe(src.large || src.medium, [HOST_FOTOS]);
    if (!imagem || !Number.isSafeInteger(f.id)) continue;
    /* (nada de texto do Pexels: a página do crédito é montada aqui, pelo id) */
    fotos.push({ id: f.id, imagem, pagina: 'https://www.pexels.com/photo/' + f.id + '/', cor_media: corSegura(f.avg_color) });
    if (fotos.length >= quantas) break;
  }
  return fotos;
}

/* o tempo limite vale até o fim do corpo (AbortSignal.timeout, como o resto do repositório), não só até os cabeçalhos */
const comTempo = (buscar, url, init) => buscar(url, { ...init, signal: AbortSignal.timeout(TEMPO_MS), redirect: 'error' });

/* lê o corpo parando ao passar do limite: sem Content-Length (resposta em pedaços), o arrayBuffer() leria tudo antes */
async function lerAte(r, limite) {
  if (!r.body) return new Uint8Array(await r.arrayBuffer());
  const leitor = r.body.getReader(), pedacos = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > limite) { await leitor.cancel(); throw new Error('foto grande demais'); }
    pedacos.push(value);
  }
  return new Uint8Array(Buffer.concat(pedacos));
}

export async function buscarFotos(consulta, { chave, buscar = fetch, quantas = FOTOS_POR_ESTRATEGIA }) {
  const url = API_PEXELS + '?' + new URLSearchParams({ query: consulta, per_page: String(quantas + 2), orientation: 'landscape' });
  const r = await comTempo(buscar, url, { headers: { Authorization: chave } });
  if (r.status === 429) throw new Error('o limite de buscas do Pexels acabou por agora');
  if (r.status === 401 || r.status === 403) throw new Error('a PEXELS_API_KEY foi recusada');
  if (!r.ok) throw new Error('o Pexels respondeu ' + r.status);
  return fotosDaResposta(await r.json(), quantas);
}

/* baixa UMA foto: só do host de fotos do Pexels, sem cabeçalho (a chave nunca vai junto), até 2 MB, tipo conferido */
export async function baixarFoto(url, { buscar = fetch } = {}) {
  if (!urlDe(url, [HOST_FOTOS])) throw new Error('foto fora do host do Pexels');
  const r = await comTempo(buscar, url, {});
  if (!r.ok) throw new Error('a foto respondeu ' + r.status);
  if (Number(r.headers.get('content-length')) > LIMITE_BYTES) { await r.body?.cancel(); throw new Error('foto grande demais'); }
  const bytes = await lerAte(r, LIMITE_BYTES);
  const tipo = tipoPorBytes(bytes.subarray(0, 16));
  if (!tipo) throw new Error('o arquivo não é JPEG, PNG nem WebP');
  if (!estruturaCompleta(Buffer.from(bytes))) throw new Error('a foto veio cortada');
  return { bytes, tipo };
}

/* o nome que a pasta aceita (a entrega confere: nada fora disto sai) */
export const NOME_FOTO = /^(conversao|autoridade|experiencia)-[1-9]\.(jpg|png|webp)$/;

/* a pasta ./referencias de um pedido só pode ter as fotos com nome fixo e o arquivo de créditos, todos arquivos comuns
   (sem link, junção nem subpasta). Usada pela entrega (scripts/direcoes.mjs planejarEntrega): devolve os nomes estranhos */
export function estranhosNasReferencias(pastaPedido) {
  const dir = path.join(pastaPedido, PASTA_REFERENCIAS);
  const st = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!st) return [];
  if (!st.isDirectory() || st.isSymbolicLink()) return [PASTA_REFERENCIAS];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !(e.isFile() && (NOME_FOTO.test(e.name) || e.name === ARQUIVO_CREDITOS)))
    .map(e => PASTA_REFERENCIAS + '/' + e.name).sort();
}

/* monta ./referencias da pasta do pedido. Nunca lança: devolve { ok, fotos, motivo } e o comando só avisa.
   Cada estratégia é independente: a que falhar (limite de buscas, rede) fica sem fotos e as outras seguem */
export async function montarReferencias({ dir, briefing, chave = process.env.PEXELS_API_KEY, buscar = fetch }) {
  const pasta = path.join(dir, PASTA_REFERENCIAS);
  /* sempre do zero, ANTES de tudo (inclusive sem chave): o que estava lá (de um "pedido" anterior ou plantado) sai, e a
     sessão nunca usa fotos velhas com o terminal dizendo "desligadas"; rmSync não segue link */
  fs.rmSync(pasta, { recursive: true, force: true });
  if (!chave) return { ok: false, fotos: 0, motivo: 'sem PEXELS_API_KEY no terminal' };
  const falhas = [];
  try {
    fs.mkdirSync(pasta, { mode: 0o700 });
    const consultas = consultasDoPedido(briefing);
    const lista = [];
    for (const { estrategia, consulta } of consultas) {
      let fotos;
      try { fotos = await buscarFotos(consulta, { chave, buscar }); } catch (e) { falhas.push(estrategia + ': ' + String(e && e.message || 'falha')); continue; }
      /* os downloads de uma estratégia saem juntos; o número segue a ordem da busca, pulando a que falhou */
      const baixadas = await Promise.allSettled(fotos.map(f => baixarFoto(f.imagem, { buscar })));
      let n = 0;
      baixadas.forEach((b, i) => {
        if (b.status !== 'fulfilled') return;
        const arquivo = estrategia + '-' + (++n) + '.' + b.value.tipo;
        fs.writeFileSync(path.join(pasta, arquivo), b.value.bytes, { mode: 0o600, flag: 'wx' });
        lista.push({ arquivo, estrategia, cor_media: fotos[i].cor_media, pagina: fotos[i].pagina });
      });
    }
    if (!lista.length) throw new Error(falhas.length ? falhas.join('; ') : 'nenhuma foto achada');
    fs.writeFileSync(path.join(pasta, ARQUIVO_CREDITOS), JSON.stringify({
      fonte: 'Pexels', licenca: 'https://www.pexels.com/license/',
      uso: 'Leia esta lista e abra cada "arquivo": é referência de atmosfera, luz e paleta para a direção da mesma estratégia. Nunca para copiar. A licença permite usar a foto no site do cliente; o crédito é a "pagina" da foto.',
      consultas, fotos: lista
    }, null, 2), { mode: 0o600, flag: 'wx' });
    return { ok: true, fotos: lista.length, motivo: falhas.length ? 'parcial (' + falhas.join('; ') + ')' : null };
  } catch (e) {
    /* nada de meia pasta: sem nenhuma foto, a pasta sai */
    fs.rmSync(pasta, { recursive: true, force: true });
    return { ok: false, fotos: 0, motivo: String(e && e.message || 'falha') };
  }
}
