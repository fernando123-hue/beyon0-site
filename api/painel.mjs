/* ==========================================================================
   /api/painel — os números para o painel do dono (painel.html).
   Protegido pela chave PAINEL_CHAVE (variável de ambiente na Vercel, 32+
   caracteres aleatórios). Sem a chave configurada, o painel fica fechado.
     GET  ?dias=30            o resumo do período
     GET  ?csv=ads&nome=X     clientes vindos de anúncio, no formato de
                              importação de conversões off-line do Google Ads
     POST {codigo, status, valor, nota}   marca conversa/cliente num contato
     POST {codigo, excluir: true}         apaga o contato (pedido do titular, LGPD art. 18)
     POST {resolver_alerta: <id>}         marca um alerta da rotina diária como resolvido
     GET  ?fila=direcoes                  a FILA MANUAL das direções: briefing, escopo e contato de cada pedido
     POST {entregar_direcao: <id>, conteudo}  entrega uma direção produzida pelo dono (mesmo filtro da geração)
     POST {avisado: <conversa_id>}        o cliente foi avisado pelo WhatsApp: sai da fila
     GET  ?fila=pendentes[&codigo=BZ-…]   os pedidos ESPERANDO a confirmação pelo WhatsApp (lista separada; busca pelo código)
     POST {confirmar_whatsapp: <conversa_id>}  a mensagem com o código chegou do WhatsApp informado: entra na fila
     POST {descartar_pedido | arquivar_pedido: <conversa_id>}  descartar encerra e para a geração; arquivar = resolvido por fora
     POST {link_retomada: <conversa_id>}   o código do link de retomada (uso único, 7 dias; o painel monta o link)
     GET  ?fila=lembretes                 os pedidos avisados há 2 dias ou mais, ainda sem escolha e sem lembrete
     POST {lembrado: <conversa_id>}        o dono mandou o lembrete: sai da lista
     GET  ?fila=ajustes                   os PEDIDOS LIVRES na fila (PR 3a): o texto do cliente, a versão atual e a base
     POST {ajuste_feito: <id>, base_id, conteudo}  a versão nova do modelo escolhido (mesmo filtro e varredura da entrega)
     POST {ajuste_recusado: <id>}         o pedido não cabe (preço, item da tabela, fora do site): fica "não incluído"
     GET  ?fila=entregas                  as ENTREGAS (PR 3b-2): passo, material, prazo, dias desde a entrada, alertas
     GET  ?material=<BZ-código>           o pacote versão 1 (pedido.json, formulario.json) e os links de leitura de 60 s; NÃO marca nada
     POST {importado: <BZ-código>, cliente: <c-xxxxxx>}  a importação da captação passou: marca importado (começa a guarda de 7 dias)
   A ENTREGA PELO DONO (PR 3b-3; api/_entrega/painel-entrega.mjs). Só aqui, só com a chave: nada disso é alcançável pelo cliente nem pela rotina:
     POST {previa: <BZ-código>, url}          publica a prévia (https://vN.bz-<cliente>.pages.dev, do projeto desta entrega); abre a pausa do prazo
     POST {no_ar: <BZ-código>, url}           põe o site no ar, SÓ depois de o cliente aprovar (D5); com o prazo vencido, 409 com o caminho da devolução
     POST {suspender: <BZ-código>}            suspende o site (3 dias depois do aviso "no ar"; 22/10)
     POST {encerrar: <BZ-código>, motivo}     motivo de lista fechada: desistencia, atraso, producao_manual, outro (nunca silêncio nem falta de material)
     POST {material_dispensar: <BZ-código>}   dia 30, só com o número AUTORIZADO: segue sem o resto do material
     POST {aviso_feito: <BZ-código>, momento} previa | no_ar | material_parado | restante_lembrete_1 | restante_lembrete_2
     POST {religado: <BZ-código>}             o site foi religado depois do pagamento do restante
     GET  ?fila=avisos                        os avisos da D1 pendentes, com o contato para o painel montar a mensagem
     GET  ?ajustes-previa=<BZ-código>         a lista de ajustes da prévia como DADO (selo de texto suspeito; o contato do site à parte)
   As duas listas trazem "alarme": a fila no teto (o orçamento oferece o WhatsApp) ou pendentes demais.
   A resposta do GET traz também "saude": alertas abertos e a data da última rotina diária.
   ========================================================================== */
import { createHash, timingSafeEqual } from 'node:crypto';
import { banco } from './_banco.mjs';
import { resumir, csvGoogleAds } from './_resumo.mjs';
import { validarMudanca, CODIGO } from './_valida.mjs';
import { criarTransporte } from './_vendas/transporte.mjs';
import { ehUuid } from './_valida-app.mjs';
import { ORG } from './_vendas/org.mjs';
import { higienizar } from './_vendas/direcao.mjs';
import { varrer } from './_vendas/varredura.mjs';
import { pareceInjecao } from './_vendas/seguranca.mjs';
import { ipDe } from './_freio.mjs';
import { PEDIDOS } from './_vendas/pedido.mjs';
import { novoCodigoRetomada, hashDaRetomada, DIAS_RETOMADA } from './_vendas/retomada.mjs';
import { montarPedido, montarFormulario, nomesDosArquivos } from './_material/pacote.mjs';
import { criarArmazem } from './_material/armazem.mjs';
import { criarAcoesDoDono } from './_entrega/painel-entrega.mjs';

const CHAVE_MINIMA = 32;
export const CORPO_MAX = 200000;          /* caracteres do POST do painel */
const PERIODOS = [7, 30, 90, 365];
const JANELA_ADS_DIAS = 90;         /* o Google Ads só aceita conversão até 90 dias depois do clique */
const TENTATIVAS = { max: 10, janelaMs: 15 * 60e3 };
const erros = new Map();            /* (por instância da função: freio contra adivinhar a chave, não um cofre) */

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const hash = s => createHash('sha256').update(String(s)).digest();
const atraso = ms => new Promise(r => setTimeout(r, ms));
const diasAtras = n => new Date(Date.now() - n * 864e5).toISOString();

async function autorizar(request, env) {
  const chave = env.PAINEL_CHAVE || '';
  if (chave.length < CHAVE_MINIMA) {
    console.error('[metricas] painel: PAINEL_CHAVE ausente ou com menos de ' + CHAVE_MINIMA + ' caracteres');
    return json({ erro: 'Painel indisponível.' }, 503);
  }
  const quem = ipDe(request);   /* (o IPv6 conta pelo /64, como nos outros freios) */
  if (erros.size > 5000) erros.clear();
  const agora = Date.now();
  const tent = (erros.get(quem) || []).filter(t => agora - t < TENTATIVAS.janelaMs);
  if (tent.length >= TENTATIVAS.max) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
  const enviada = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (enviada && timingSafeEqual(hash(enviada), hash(chave))) { erros.delete(quem); return null; }
  erros.set(quem, tent.concat(agora));
  await atraso(800);
  return json({ erro: 'Chave errada.' }, 401);
}

/* a saúde (alertas abertos e quando a rotina diária rodou bem pela última vez): sem ela, silêncio parecia saúde.
   Falhar aqui não derruba o painel: devolve null e o painel diz que não deu para ler */
async function saudeDoSistema(env) {
  const rpc = criarTransporte(env);
  if (!rpc) return null;
  try { return await rpc('rotinas_painel', { org_slug: ORG }); }
  catch (e) { console.error('[painel] saúde:', e && e.codigo); return null; }
}

export const GET = request => ler(request, process.env);
export const POST = request => mudar(request, process.env);
export async function ler(request, env) {
  const negado = await autorizar(request, env);
  if (negado) return negado;
  const db = banco(env);
  if (!db.ligado) return json({ erro: 'Banco não configurado: faltam SUPABASE_URL e SUPABASE_CHAVE_SECRETA no servidor.' }, 503);   /* (só depois da chave certa) */
  const q = new URL(request.url).searchParams;
  if (q.get('fila') === 'direcoes') return filaDirecoes(env);
  if (q.get('fila') === 'pendentes') return filaPendentes(env, q.get('codigo'));
  if (q.get('fila') === 'lembretes') return filaLembretes(env);
  if (q.get('fila') === 'ajustes') return filaAjustes(env);
  if (q.get('fila') === 'entregas') return filaEntregas(env);
  if (q.get('material') !== null) return materialParaBaixar(env, q.get('material'));
  if (q.get('fila') === 'avisos') return criarAcoesDoDono(env).avisos();
  if (q.get('ajustes-previa') !== null) { const cod = codigoDaBusca(q.get('ajustes-previa')); return cod ? criarAcoesDoDono(env).ajustes(cod) : json({ erro: 'Código inválido: são 5 letras ou números depois de "BZ-".' }, 400); }
  try {
    if (q.get('csv') === 'ads') {
      const nome = (q.get('nome') || 'Cliente fechado').slice(0, 80);
      const contatos = await db.listar('contatos', 'quando', diasAtras(JANELA_ADS_DIAS));
      /* (A9: `listar` lê no máximo 2 páginas por tabela; o CSV não tem onde dizer isso, então o aviso vai por cabeçalho e o painel mostra) */
      return new Response(csvGoogleAds(contatos, nome), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="conversoes-google-ads.csv"', 'cache-control': 'no-store', ...(contatos.cortado ? { 'x-bz-cortado': '1' } : {}) } });
    }
    const dias = PERIODOS.includes(+q.get('dias')) ? +q.get('dias') : 30;
    /* (abrir o painel não apaga mais nada: a retenção de ~13 meses roda na rotina diária, api/rotinas.mjs) */
    const desde = diasAtras(dias);
    const [paginas, contatos, saude] = await Promise.all([db.listar('paginas', 'inicio', desde), db.listar('contatos', 'quando', desde), saudeDoSistema(env)]);
    const aviso = paginas.cortado || contatos.cortado ? { aviso: 'período grande demais; mostrando os mais recentes' } : {};   /* (A9: o teto de páginas por tabela, api/_banco.mjs) */
    return json({ ...resumir(paginas, contatos, { dias }), saude, ...aviso });
  } catch (e) {
    console.error('[metricas] painel:', e.message);
    return json({ erro: 'Não deu para ler o banco agora. Tente de novo em instantes.' }, 500);
  }
}

export async function mudar(request, env) {
  const negado = await autorizar(request, env);
  if (negado) return negado;
  const db = banco(env);
  if (!db.ligado) return json({ erro: 'Banco não configurado.' }, 503);
  let bruto;
  const texto = await request.text();
  if (texto.length > CORPO_MAX) return json({ erro: 'Pedido grande demais.' }, 413);   /* (uma direção higienizada cabe com folga) */
  try { bruto = JSON.parse(texto); } catch { bruto = null; }
  if (bruto && typeof bruto.entregar_direcao === 'string') return entregarDirecao(bruto, env);
  if (bruto && typeof bruto.avisado === 'string') return marcarAvisado(bruto, env);
  if (bruto && typeof bruto.link_retomada === 'string') return linkDeRetomada(bruto.link_retomada, env);
  if (bruto && typeof bruto.lembrado === 'string') return marcarLembrado(bruto.lembrado, env);
  if (bruto && typeof bruto.ajuste_feito === 'string') return ajusteFeito(bruto, env);
  if (bruto && typeof bruto.ajuste_recusado === 'string') return ajusteRecusado(bruto.ajuste_recusado, env);
  if (bruto && typeof bruto.importado === 'string') return materialImportado(bruto, env);
  /* (PR 3b-3) a entrega: prévia, no ar, suspender, encerrar, dispensar o material, avisos da D1, religado */
  const chave = bruto && typeof bruto === 'object' ? Object.keys(ACOES_ENTREGA).find(k => typeof bruto[k] === 'string') : null;
  if (chave) { const cod = codigoDaBusca(bruto[chave]); return cod ? criarAcoesDoDono(env)[ACOES_ENTREGA[chave]](cod, bruto) : json({ erro: 'Código inválido: são 5 letras ou números depois de "BZ-".' }, 400); }
  const acaoPedido = bruto && typeof bruto === 'object' ? Object.keys(ACOES_PEDIDO).find(k => typeof bruto[k] === 'string') : null;
  if (acaoPedido) return acaoDoPedido(ACOES_PEDIDO[acaoPedido], bruto[acaoPedido], env);
  /* marcar um alerta como resolvido */
  if (bruto && typeof bruto.resolver_alerta === 'string') {
    if (!ehUuid(bruto.resolver_alerta)) return json({ erro: 'Pedido inválido.' }, 400);
    const rpc = criarTransporte(env);
    if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
    try { await rpc('rotinas_resolver', { id: bruto.resolver_alerta, org_slug: ORG }); return json({ ok: true }); }
    catch (e) { return e && e.codigo === 'P0002' ? json({ erro: 'Alerta não encontrado.' }, 404) : json({ erro: 'Não deu para salvar agora.' }, 500); }
  }
  if (bruto && bruto.excluir === true && CODIGO.test(String(bruto.codigo))) {
    try { return (await db.apagarContato(bruto.codigo)) ? json({ ok: true, excluido: bruto.codigo }) : json({ erro: 'Código não encontrado.' }, 404); }
    catch (e) { console.error('[metricas] painel excluir:', e.message); return json({ erro: 'Não deu para excluir agora.' }, 500); }
  }
  const pedido = validarMudanca(bruto);
  if (!pedido) return json({ erro: 'Pedido inválido.' }, 400);
  try {
    const contato = await db.mudarContato(pedido.codigo, pedido.mudanca);
    return contato ? json({ ok: true, contato }) : json({ erro: 'Código não encontrado.' }, 404);
  } catch (e) {
    console.error('[metricas] painel mudar:', e.message);
    return json({ erro: 'Não deu para salvar agora.' }, 500);
  }
}

/* ---------- a FILA MANUAL das direções (decisão do dono, 2026-10-08) ---------- */
async function filaDirecoes(env) {
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const r = await rpc('vendas_fila_direcoes', { org_slug: ORG });
    const fila = r && Array.isArray(r.itens) ? r.itens : [];
    const total = r && Number.isInteger(r.total) ? r.total : fila.length;
    /* (PR 2a: só confirmados, sem corte; o alarme diz quando a fila chegou ao teto e o orçamento oferece o WhatsApp) */
    return json({ fila, total, alarme: total >= PEDIDOS.fila_confirmados });
  }
  catch (e) { console.error('[painel] fila de direções:', e && e.codigo); return json({ erro: 'Não deu para ler a fila agora.' }, 500); }
}

/* a direção produzida pelo dono passa pelo MESMO filtro da geração automática (lista fechada, tamanhos, cores,
   contraste, sem lorem ipsum); a estratégia vem do banco, nunca do arquivo; só entra direção que está na fila */
async function entregarDirecao(bruto, env) {
  if (!ehUuid(bruto.entregar_direcao) || !bruto.conteudo || typeof bruto.conteudo !== 'object' || Array.isArray(bruto.conteudo)) return json({ erro: 'Pedido inválido.' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const d = await rpc('vendas_direcao_info', { direcao_id: bruto.entregar_direcao, org_slug: ORG });
    if (d.status !== 'gerando') return json({ erro: 'Esta direção não está na fila (status: ' + d.status + ').' }, 409);
    const h = higienizar(bruto.conteudo, d.estrategia);
    if (h.erro) return json({ erro: 'Direção recusada pelo filtro: ' + h.erro + '.' }, 422);
    /* defesa em profundidade: a mesma varredura do entregar-pedido do dono, agora no servidor (endereço, caminho, chave,
       e-mail, telefone, invisível...). O erro diz só os tipos, nunca os trechos */
    const achados = varrer(h.direcao);
    if (achados.length) return json({ erro: 'A direção tem conteúdo que não pode ir ao cliente: ' + [...new Set(achados.map(a => a.tipo))].join(', ') + '.' }, 422);
    const r = await rpc('vendas_concluir_direcao', { direcao_id: d.id, conteudo: h.direcao, modelo: 'claude-code (dono)' });
    if (r && r.ignorado) return json({ erro: 'Esta direção não está mais na fila.' }, 409);
    return json({ ok: true, direcao_id: d.id, estrategia: d.estrategia, ajustes: h.ajustes, pendentes: r ? r.pendentes : null });
  } catch (e) {
    if (e && e.codigo === 'P0002') return json({ erro: 'Direção não encontrada.' }, 404);
    console.error('[painel] entregar direção:', e && e.codigo);
    return json({ erro: 'Não deu para salvar agora.' }, 500);
  }
}

async function marcarAvisado(bruto, env) {
  if (!ehUuid(bruto.avisado)) return json({ erro: 'Pedido inválido.' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try { return json({ ok: true, ...(await rpc('vendas_marcar_avisado', { conversa_id: bruto.avisado, org_slug: ORG })) }); }
  catch (e) {
    if (e && e.codigo === 'P0002') return json({ erro: 'Conversa não encontrada.' }, 404);
    console.error('[painel] marcar avisado:', e && e.codigo);
    return json({ erro: 'Não deu para salvar agora.' }, 500);
  }
}

/* ---------- o LINK DE RETOMADA e o LEMBRETE (PR 2b-2) ---------- */
const DIAS_LEMBRETE = 2;
/* o código sai UMA vez, nesta resposta, para o painel montar a mensagem; o banco guarda só o hash. Pedir de novo
   apaga o anterior que não foi usado (um link valendo por vez) */
async function linkDeRetomada(conversaId, env) {
  if (!ehUuid(conversaId)) return json({ erro: 'Pedido inválido.' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  const codigo = novoCodigoRetomada();
  try {
    const r = await rpc('vendas_criar_retomada', { org_slug: ORG, conversa_id: conversaId, codigo_hash: hashDaRetomada(codigo), dias: DIAS_RETOMADA });
    return json({ codigo, expira_em: r.expira_em });
  } catch (e) {
    if (e && e.codigo === 'P0002') return json({ erro: 'Conversa não encontrada.' }, 404);
    if (e && e.codigo === '55000') return json({ erro: 'Este pedido não está confirmado ou já passou do resumo: sem link de retomada.' }, 409);
    console.error('[painel] link de retomada:', e && e.codigo);
    return json({ erro: 'Não deu para gerar o link agora.' }, 500);
  }
}

async function filaLembretes(env) {
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const r = await rpc('vendas_lembretes', { org_slug: ORG, dias: DIAS_LEMBRETE });
    const itens = r && Array.isArray(r.itens) ? r.itens : [];
    return json({ lembretes: itens, total: itens.length });
  } catch (e) { console.error('[painel] lembretes:', e && e.codigo); return json({ erro: 'Não deu para ler os lembretes agora.' }, 500); }
}

async function marcarLembrado(conversaId, env) {
  if (!ehUuid(conversaId)) return json({ erro: 'Pedido inválido.' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try { return json({ ok: true, ...(await rpc('vendas_marcar_lembrete', { org_slug: ORG, conversa_id: conversaId })) }); }
  catch (e) { console.error('[painel] marcar lembrete:', e && e.codigo); return json({ erro: 'Não deu para salvar agora.' }, 500); }
}

/* ---------- os PEDIDOS LIVRES (PR 3a; spec §4, "A fila"): o dono faz a versão nova ou recusa ---------- */
/* (o selo de texto suspeito sai daqui, como na fila de direções; o texto em si é dado, nunca instrução) */
/* (o banco entrega no máximo 50, os mais antigos, e o total da fila inteira: como a fila de pedidos pendentes) */
async function lerAjustes(rpc) {
  const r = await rpc('vendas_pedidos_livres', { org_slug: ORG });
  const itens = (r && Array.isArray(r.itens) ? r.itens : []).map(a => ({ ...a, suspeito: pareceInjecao(String(a.texto || '')) }));
  return { itens, total: r && Number.isInteger(r.total) ? Math.max(r.total, itens.length) : itens.length };
}
async function filaAjustes(env) {
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try { const { itens, total } = await lerAjustes(rpc); return json({ ajustes: itens, total, truncada: total > itens.length }); }
  catch (e) { console.error('[painel] ajustes:', e && e.codigo); return json({ erro: 'Não deu para ler os ajustes agora.' }, 500); }
}
const AJUSTE_FORA = 'Este ajuste não está mais na fila: já foi resolvido, o pedido não está confirmado ou a conversa passou da etapa de ajustes.';
function erroDoAjuste(e, rotulo) {
  if (e && e.codigo === 'P0002') return json({ erro: 'Ajuste não encontrado.' }, 404);
  if (e && e.codigo === '55000') return json({ erro: 'A conversa já passou da etapa de ajustes (ou o pedido não está confirmado): nada foi gravado.' }, 409);
  if (e && e.codigo === '40001') return json({ erro: 'O cliente mudou a versão depois que você baixou. Apague a pasta do ajuste e rode "ajustes" de novo para refazer sobre a versão nova.' }, 409);
  console.error('[painel] ' + rotulo + ':', e && e.codigo);
  return json({ erro: 'Não deu para salvar agora.' }, 500);
}
/* a versão nova passa pelo MESMO filtro e pela MESMA varredura da entrega de direção; a estratégia vem do banco */
async function ajusteFeito(bruto, env) {
  const base = bruto.base_id == null ? null : bruto.base_id;
  if (!ehUuid(bruto.ajuste_feito) || (base !== null && !ehUuid(base)) || !bruto.conteudo || typeof bruto.conteudo !== 'object' || Array.isArray(bruto.conteudo)) return json({ erro: 'Pedido inválido.' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const item = (await lerAjustes(rpc)).itens.find(a => a.alteracao_id === bruto.ajuste_feito);
    if (!item) return json({ erro: AJUSTE_FORA }, 409);
    const h = higienizar(bruto.conteudo, item.estrategia);
    if (h.erro) return json({ erro: 'Versão recusada pelo filtro: ' + h.erro + '.' }, 422);
    const achados = varrer(h.direcao);
    if (achados.length) return json({ erro: 'A versão tem conteúdo que não pode ir ao cliente: ' + [...new Set(achados.map(a => a.tipo))].join(', ') + '.' }, 422);
    const r = await rpc('vendas_resolver_pedido_livre', { org_slug: ORG, alteracao_id: item.alteracao_id, acao: 'feito', resultado: h.direcao, base_id: base });
    if (!r || r.ok !== true) return json({ erro: AJUSTE_FORA, status: r && r.status }, 409);
    return json({ ok: true, status: r.status, ajustes: h.ajustes });
  } catch (e) { return erroDoAjuste(e, 'ajuste feito'); }
}
async function ajusteRecusado(id, env) {
  if (!ehUuid(id)) return json({ erro: 'Pedido inválido.' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const r = await rpc('vendas_resolver_pedido_livre', { org_slug: ORG, alteracao_id: id, acao: 'recusado' });
    if (!r || r.ok !== true) return json({ erro: AJUSTE_FORA, status: r && r.status }, 409);
    return json({ ok: true, status: r.status });
  } catch (e) { return erroDoAjuste(e, 'ajuste recusado'); }
}

/* ---------- o PEDIDO DE MODELOS (orçamento sem IA, PR 2a): confirmação pelo WhatsApp, descartar e arquivar ---------- */
const ACOES_ENTREGA = { previa: 'previaPublicar', no_ar: 'noAr', suspender: 'suspender', encerrar: 'encerrar', material_dispensar: 'dispensar', aviso_feito: 'avisoFeito', religado: 'religado' };
const ACOES_PEDIDO = { confirmar_whatsapp: 'confirmar', descartar_pedido: 'descartar', arquivar_pedido: 'arquivar' };
/* o que `ler` (GET: ?fila=…, ?csv=ads ou o resumo) e `mudar` (POST: a chave do corpo) despacham: a bancada de CPU (M1) e o
   limite por rota do Worker conferem esta lista contra o código. `excluir` e `mudar_contato` são os dois POST sem chave
   própria no despacho de `mudar` (apagar contato; status/valor/nota por `codigo`) */
export const ACOES_PAINEL = Object.freeze({
  GET: ['resumo', 'csv-ads', 'fila-direcoes', 'fila-pendentes', 'fila-lembretes', 'fila-ajustes', 'fila-entregas', 'material', 'fila-avisos', 'ajustes-previa'],
  POST: ['entregar_direcao', 'avisado', 'link_retomada', 'lembrado', 'ajuste_feito', 'ajuste_recusado', 'resolver_alerta', 'excluir', 'mudar_contato', 'importado',
    ...Object.keys(ACOES_ENTREGA), ...Object.keys(ACOES_PEDIDO)]
});
const CODIGO_PEDIDO = /^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/;
/* o código como o dono digitar ("bz-k7m3q", "K7M3Q", "BZK7M3Q"): normaliza ou null */
export function codigoDaBusca(v) {
  const s = String(v || '').toUpperCase().replace(/\s+/g, '');
  const c = s.startsWith('BZ-') ? s : 'BZ-' + s.replace(/^BZ/, '');
  return CODIGO_PEDIDO.test(c) ? c : null;
}

async function filaPendentes(env, busca) {
  const codigo = busca == null || busca === '' ? null : codigoDaBusca(busca);
  if (busca != null && busca !== '' && !codigo) return json({ erro: 'Código inválido: são 5 letras ou números depois de "BZ-".' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const r = await rpc('vendas_pedidos_pendentes', { org_slug: ORG, ...(codigo ? { codigo } : {}) });
    const itens = r && Array.isArray(r.itens) ? r.itens : [];
    const total = r && Number.isInteger(r.total) ? r.total : itens.length;
    return json({ pendentes: itens, total, truncada: total > itens.length, alarme: !codigo && total >= PEDIDOS.alarme_pendentes });
  } catch (e) { console.error('[painel] pendentes:', e && e.codigo); return json({ erro: 'Não deu para ler os pedidos agora.' }, 500); }
}

async function acaoDoPedido(acao, conversaId, env) {
  if (!ehUuid(conversaId)) return json({ erro: 'Pedido inválido.' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const r = acao === 'confirmar'
      ? await rpc('vendas_confirmar_whatsapp', { org_slug: ORG, conversa_id: conversaId })
      : await rpc('vendas_mudar_pedido', { org_slug: ORG, conversa_id: conversaId, acao });
    if (r && r.ok === false) {
      const erro = r.status === 'expirado' ? 'Este pedido expirou: passou de 72 horas sem a confirmação. Peça à pessoa um orçamento novo.'
        : 'Este pedido não está esperando confirmação (situação: ' + r.status + ').';
      return json({ erro, status: r.status }, 409);
    }
    return json({ ok: true, ...r });
  } catch (e) {
    if (e && e.codigo === 'P0002') return json({ erro: 'Pedido não encontrado.' }, 404);
    if (e && (e.codigo === '55000' || e.codigo === '23514')) return json({ erro: 'Este pedido não pode mudar agora (etapa ou situação).' }, 409);
    console.error('[painel] pedido:', acao, e && e.codigo);
    return json({ erro: 'Não deu para salvar agora.' }, 500);
  }
}

/* ---------- A ENTREGA (PR 3b-2): a lista, o pacote para baixar e o "importado" ---------- */
async function filaEntregas(env) {
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const r = await rpc('vendas_entregas_lista', { org_slug: ORG });
    const itens = r && Array.isArray(r.itens) ? r.itens : [];
    return json({ entregas: itens, total: itens.length });
  } catch (e) { console.error('[painel] entregas:', e && e.codigo); return json({ erro: 'Não deu para ler as entregas agora.' }, 500); }
}

/* o pacote versão 1 (spec §6): pedido.json e formulario.json montados aqui, os links de leitura de 60 s (UM pedido ao armazém
   para todos). NÃO marca nada: "baixado" não existe; "importado" é o comando seguinte, depois de a captação importar */
async function materialParaBaixar(env, busca) {
  const codigo = codigoDaBusca(busca);
  if (!codigo) return json({ erro: 'Código inválido: são 5 letras ou números depois de "BZ-".' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  let r;
  try { r = await rpc('vendas_material_para_baixar', { org_slug: ORG, codigo }); }
  catch (e) {
    if (e && e.codigo === 'P0002') return json({ erro: 'Pedido não encontrado.' }, 404);
    if (e && e.codigo === '55000') return json({ erro: 'O cliente ainda não enviou o material.' }, 409);
    console.error('[painel] material:', e && e.codigo);
    return json({ erro: 'Não deu para ler o material agora.' }, 500);
  }
  let pedido, formulario;
  try {
    const cidade = (r.material.negocio && r.material.negocio.cidade) || r.negocio.cidade;
    pedido = montarPedido({ codigo, negocio: { ...r.negocio, cidade, uf: r.material.negocio && r.material.negocio.uf }, proposta: r.proposta,
      entradaPagaEm: r.entrada_paga_em, whatsappContato: r.whatsapp_contato });
    formulario = montarFormulario({ material: r.material, arquivos: r.arquivos });
  } catch (e) { return json({ erro: e.message }, 422); }   /* (o que falta, ou "produção manual": o dono resolve com o cliente) */
  const armazem = criarArmazem(env);
  if (!armazem) return json({ erro: 'Armazém não configurado.' }, 503);
  const nomes = nomesDosArquivos(r.arquivos);
  let links;
  try { links = await armazem.linksDeLeitura(nomes.map(a => a.caminho), 60); }
  catch (e) { console.error('[painel] links de leitura:', e && e.name); return json({ erro: 'Não deu para assinar os arquivos agora.' }, 502); }
  const arquivos = nomes.map(a => ({ nome: a.nome, papel: a.papel, tipo_real: a.tipo_real, tamanho: Number(a.tamanho_real), url: links[a.caminho] || null }));
  if (arquivos.some(a => !a.url)) return json({ erro: 'Um arquivo do pedido sumiu do armazém: ' + arquivos.filter(a => !a.url).map(a => a.nome).join(', ') }, 502);
  /* B7 (spec §8, "Injeção no Claude"): o selo de texto suspeito POR CAMPO; o agente da produção lê o material como DADO, nunca como instrução */
  const campos = [...Object.entries(r.material.dados || {}), ...Object.entries(r.material.negocio || {}).map(([k, v]) => ['negocio.' + k, v])];
  const suspeitos = campos.filter(([, v]) => pareceInjecao(typeof v === 'string' ? v : JSON.stringify(v))).map(([k]) => k);
  return json({ pedido, formulario, arquivos, suspeitos });
}

async function materialImportado(bruto, env) {
  const codigo = codigoDaBusca(bruto.importado);
  if (!codigo || !/^c-[abcdefghjkmnpqrstuvwxyz23456789]{6}$/.test(String(bruto.cliente))) return json({ erro: 'Pedido inválido: o código BZ-… e o id do cliente da captação (c-xxxxxx).' }, 400);
  const rpc = criarTransporte(env);
  if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
  try {
    const r = await rpc('vendas_material_importado', { org_slug: ORG, codigo, cliente: bruto.cliente });
    if (!r || r.ok !== true) return json({ erro: 'Este pedido já foi importado como outro cliente da captação.' }, 409);
    return json({ ok: true, ...(r.ja ? { ja: true } : {}) });
  } catch (e) {
    if (e && e.codigo === 'P0002') return json({ erro: 'Pedido não encontrado.' }, 404);
    if (e && e.codigo === '55000') return json({ erro: 'O cliente ainda não enviou o material.' }, 409);
    console.error('[painel] importado:', e && e.codigo);
    return json({ erro: 'Não deu para salvar agora.' }, 500);
  }
}
