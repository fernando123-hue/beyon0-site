/* ==========================================================================
   AS REFERÊNCIAS DE IMAGEM DE CADA PEDIDO (decisão do dono, 2026-11-11: "a pesquisa de referências deve ser 100%
   automática", "cada pesquisa específica para cada contexto"). Spec: docs/specs/2026-11-11-referencias-pexels.md.

   O comando "pedido" (scripts/direcoes.mjs) chama montarReferencias logo depois de gravar o pedido.json: uma busca
   no Pexels por estratégia (conversão, autoridade, experiência), montada SÓ com campos fechados do pedido (o ramo da
   lista, os objetivos da lista e o formato), e as fotos vão para ./referencias da pasta do pedido, com os créditos.
   A sessão isolada (sem internet) olha as fotos como referência de atmosfera, luz e paleta.

   Por que Pexels e não Pinterest, Dribbble ou Behance (pesquisa de 2026-11-11, fontes na spec): os três não têm busca
   aberta por API e os termos de uso proíbem raspar o site. O Pexels tem busca aberta e a licença permite usar a foto,
   inclusive comercialmente, no site de um cliente.

   Regras de segurança (o briefing é texto de um desconhecido; a pasta é lida por uma sessão de IA):
   • a consulta nunca leva texto livre: o ramo "outro", o segmento escrito pelo consultor, a cidade e a descrição não
     entram; o que não casa com a lista fechada vira "geral";
   • a chave (PEXELS_API_KEY, no terminal do dono, como a PAINEL_CHAVE) só vai para api.pexels.com, nunca para a pasta
     nem para a sessão; as fotos são baixadas sem cabeçalho nenhum, só de https://images.pexels.com;
   • só JPEG, PNG ou WebP conferidos pelos primeiros bytes, até 2 MB cada; nome do arquivo fixo (<estratégia>-<n>.<ext>);
   • do que o Pexels devolve, só entram o nome e o perfil do fotógrafo (para o crédito), a página da foto e a cor média;
     a descrição (alt) é texto de terceiro e fica de fora;
   • qualquer falha (sem chave, sem rede, limite de buscas) só desliga as referências daquele pedido: o pedido segue.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';

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
/* nome do fotógrafo para o crédito: letras, números, espaço e pontuação simples, sem quebra nem controle, até 60 */
const nomeSeguro = v => String(v || '').normalize('NFC').replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} .'&-]/gu, '').replace(/ +/g, ' ').trim().slice(0, 60);
const corSegura = v => (/^#[0-9A-Fa-f]{6}$/.test(String(v || '')) ? String(v).toUpperCase() : null);

export function fotosDaResposta(corpo, quantas = FOTOS_POR_ESTRATEGIA) {
  const lista = corpo && Array.isArray(corpo.photos) ? corpo.photos : [];
  const fotos = [];
  for (const f of lista) {
    const src = f && f.src && typeof f.src === 'object' ? f.src : {};
    /* a "large" (até 940 px de largura) basta para ver atmosfera e paleta e pesa pouco */
    const imagem = urlDe(src.large || src.medium, [HOST_FOTOS]);
    if (!imagem || !Number.isSafeInteger(f.id)) continue;
    fotos.push({
      id: f.id,
      imagem,
      pagina: urlDe(f.url, ['www.pexels.com', 'pexels.com']),
      fotografo: nomeSeguro(f.photographer),
      perfil: urlDe(f.photographer_url, ['www.pexels.com', 'pexels.com']),
      cor_media: corSegura(f.avg_color)
    });
    if (fotos.length >= quantas) break;
  }
  return fotos;
}

/* a extensão pelos primeiros bytes (nunca pelo cabeçalho ou pela URL): JPEG, PNG ou WebP; o resto, null */
export function tipoDaImagem(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(0);
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp';
  return null;
}

const comTempo = (buscar, url, init) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TEMPO_MS);
  return buscar(url, { ...init, signal: ctl.signal, redirect: 'error' }).finally(() => clearTimeout(t));
};

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
  const tamanho = Number(r.headers.get('content-length'));
  if (tamanho > LIMITE_BYTES) throw new Error('foto grande demais');
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > LIMITE_BYTES) throw new Error('foto grande demais');
  const tipo = tipoDaImagem(bytes);
  if (!tipo) throw new Error('o arquivo não é JPEG, PNG nem WebP');
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

/* monta ./referencias da pasta do pedido. Nunca lança: devolve { ok, fotos, motivo } e o comando só avisa */
export async function montarReferencias({ dir, briefing, chave = process.env.PEXELS_API_KEY, buscar = fetch }) {
  if (!chave) return { ok: false, fotos: 0, motivo: 'sem PEXELS_API_KEY no terminal: referências desligadas' };
  const pasta = path.join(dir, PASTA_REFERENCIAS);
  try {
    /* sempre do zero: o que estava lá (de um "pedido" anterior ou plantado) sai; rmSync não segue link */
    fs.rmSync(pasta, { recursive: true, force: true });
    fs.mkdirSync(pasta, { mode: 0o700 });
    const consultas = consultasDoPedido(briefing);
    const creditos = [];
    for (const { estrategia, consulta } of consultas) {
      const fotos = await buscarFotos(consulta, { chave, buscar });
      let n = 0;
      for (const f of fotos) {
        let baixada;
        try { baixada = await baixarFoto(f.imagem, { buscar }); } catch { continue; }
        const arquivo = estrategia + '-' + (++n) + '.' + baixada.tipo;
        fs.writeFileSync(path.join(pasta, arquivo), baixada.bytes, { mode: 0o600, flag: 'wx' });
        creditos.push({ arquivo, estrategia, fotografo: f.fotografo, perfil: f.perfil, pagina: f.pagina, cor_media: f.cor_media });
      }
    }
    fs.writeFileSync(path.join(pasta, ARQUIVO_CREDITOS), JSON.stringify({
      fonte: 'Pexels', licenca: 'https://www.pexels.com/license/',
      uso: 'Referência de atmosfera, luz e paleta para a direção da mesma estratégia (o nome do arquivo começa por ela). A licença permite usar a foto no site do cliente; registre o crédito do fotógrafo.',
      consultas, fotos: creditos
    }, null, 2), { mode: 0o600, flag: 'wx' });
    return { ok: true, fotos: creditos.length, motivo: null };
  } catch (e) {
    /* meia pasta não fica: ou referências inteiras, ou nenhuma */
    fs.rmSync(pasta, { recursive: true, force: true });
    return { ok: false, fotos: 0, motivo: String(e && e.message || 'falha') };
  }
}
