/* ==========================================================================
   /api/atendente?c=<id público do cliente>&acao=… — a API do balão de atendimento que se cola no site do CLIENTE da Beyon.
     GET/POST config   nome, saudação, cores e link de privacidade (nada da base, do número ou de tetos)
     POST mensagem     { texto, conversa_id? }  → { conversa_id, resposta, passar_para_pessoa, whatsapp_url? }
     POST contato      { nome, telefone, conversa_id? }  (a conversa é opcional: com o teto batido ela não existe)
     OPTIONS           preflight do navegador
   Fronteira (nível 3 de segurança):
   • Interruptor: FECHADO por padrão para qualquer valor estranho; só ATENDENTE="ligado" (sem diferenciar maiúscula) liga; sem a variável, fica desligado até o 1º cliente real. Fechado = 404,
     o balão some sem erro, sem tocar no banco.
   • O cliente vem do id público; id desconhecido = 404 sem CORS. A ORIGEM (cabeçalho Origin) tem de ser igual a um domínio cadastrado
     desse cliente: o CORS devolve exatamente aquela origem, nunca "*". Sem Origin, 403. O Origin só vale no navegador: fora dele qualquer
     um forja, então os tetos (IP por hora, mensagens por conversa, gasto do cliente por dia e gasto global) valem para TODOS, com ou sem
     Origin, e são ATÔMICOS no banco: o gasto é reservado ANTES de chamar a IA e acertado depois.
   • Esta rota só ACRESCENTA CORS à própria resposta; nada de CSP nem de CORS do resto do site muda.
   • A chave da IA fica no servidor. Texto do visitante e da base vai ao modelo como DADO, e o texto do visitante passa por redigir()
     (telefone, e-mail, CPF) antes de ir à IA, ao banco e ao link do WhatsApp (api/_atendente/agente.mjs).
   • Log em uma linha JSON, sem texto do visitante, sem nome, sem telefone.
   ========================================================================== */
import { randomUUID } from 'node:crypto';
import { criarTransporte } from './_vendas/transporte.mjs';
import { criarIA } from './_ia/provedor.mjs';
import { reservaUsd } from './_ia/config.mjs';
import { ambienteDe } from './_ambiente.mjs';
import { criarFreio, ipDe } from './_freio.mjs';
import { chaveDoIp, chaveDoIp48 } from './_vendas/ip.mjs';
import { avisarDono } from './_ntfy.mjs';
import { configTurnstile, verificarHumano } from './_vendas/turnstile.mjs';
import { ehUuid } from './_valida-app.mjs';
import { origemPermitida, textoDoVisitante, linkWhatsapp, interruptorLigado, redigirVisitante } from './_atendente/regras.mjs';
import { responder, frases } from './_atendente/agente.mjs';

export const LIMITE_BYTES = 4096;
export const TETOS = Object.freeze({ msgs: 30, ip_hora: 40, global_usd: 5 });   /* mensagens por conversa; mensagens por IP (IPv6 pelo /48), por cliente, por hora; gasto do dia de todos os clientes */
const ID_PUBLICO = /^at_[0-9a-f]{32}$/;
const freioMemoria = criarFreio({ max: 60, janelaMs: 60e3 });   /* por instância: segura rajada de mensagem antes do banco */
const freioLeitura = criarFreio({ max: 120, janelaMs: 60e3 });  /* config e preflight: também antes do banco (cada um lê a base do cliente) */
const CHAVES = { config: [], mensagem: ['texto', 'conversa_id', 'turnstile'], contato: ['conversa_id', 'nome', 'telefone'] };

const log = (nivel, dados) => console[nivel === 'erro' ? 'error' : 'log'](JSON.stringify({ origem: 'atendente', nivel, ...dados }));
const resposta = (dados, status, cors, extra = {}) => new Response(status === 204 ? null : JSON.stringify(dados), {
  status, headers: { ...(status === 204 ? {} : { 'content-type': 'application/json; charset=utf-8' }), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors, ...extra }
});
const soCom = (corpo, chaves) => !!corpo && typeof corpo === 'object' && !Array.isArray(corpo) && Object.keys(corpo).every(k => chaves.includes(k));

export const GET = r => atender(r, process.env);
export const POST = r => atender(r, process.env);
export const OPTIONS = r => atender(r, process.env);

export async function atender(request, env, deps = {}) {
  const requestId = randomUUID();
  const metodo = request.method;
  const query = new URL(request.url).searchParams;
  const publico = query.get('c') || '';
  const acao = query.get('acao') || '';
  const falha = (status, erro, cors = {}) => resposta({ erro }, status, cors, { 'x-request-id': requestId });
  if (!ID_PUBLICO.test(publico)) return falha(404, 'Não encontrado.');
  if (!interruptorLigado(env.ATENDENTE)) return falha(404, 'Não encontrado.');   /* o interruptor: o balão não aparece e ninguém vê erro */
  const ip = ipDe(request);
  if (freioLeitura(ip)) return falha(429, 'Muitas requisições. Espere um minuto.');

  const banco = deps.banco || criarTransporte(env);
  if (!banco) { log('erro', { request_id: requestId, evento: 'banco não configurado' }); return falha(503, 'Atendente indisponível agora.'); }
  let cliente;
  try { cliente = await banco('atendente_config', { publico }); }
  catch (e) { log('erro', { request_id: requestId, evento: 'config', codigo: e && (e.codigo || e.code) || null }); return falha(503, 'Atendente indisponível agora.'); }
  if (!cliente) return falha(404, 'Não encontrado.');

  /* a ORIGEM: igual a um domínio do cliente. Sem isso, nenhum cabeçalho CORS e nada da base. */
  const origem = request.headers.get('origin');
  if (!origemPermitida(origem, cliente.dominios)) return falha(403, 'Origem não permitida.');
  const cors = { 'access-control-allow-origin': origem, vary: 'Origin' };

  if (metodo === 'OPTIONS') {
    return resposta(null, 204, { ...cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' });
  }
  /* config também por POST: o navegador não manda Origin num GET do mesmo site, e o POST sempre manda */
  if (acao === 'config' && (metodo === 'GET' || metodo === 'POST')) {
    return resposta({ nome: cliente.nome, saudacao: cliente.saudacao, cor: cliente.cor, cor_texto: cliente.cor_texto, privacidade_url: cliente.privacidade_url }, 200, cors);
  }
  if (metodo !== 'POST' || !Object.hasOwn(CHAVES, acao)) return falha(404, 'Não encontrado.', cors);

  if (freioMemoria(ip)) return falha(429, 'Muitas requisições. Espere um minuto.', cors);
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return falha(415, 'Envie JSON.', cors);
  const bruto = await request.text();
  if (bruto.length > LIMITE_BYTES) return falha(413, 'Corpo grande demais.', cors);
  let corpo;
  try { corpo = JSON.parse(bruto); } catch { return falha(400, 'JSON inválido.', cors); }
  if (!soCom(corpo, CHAVES[acao])) return falha(400, 'Pedido inválido.', cors);
  if (corpo.conversa_id !== undefined && corpo.conversa_id !== null && !ehUuid(corpo.conversa_id)) return falha(400, 'Pedido inválido.', cors);

  const local = ambienteDe(env) === 'local';
  const segredo = Object.hasOwn(deps, 'segredoFreio') ? deps.segredoFreio : (env.FREIO_SEGREDO || env.SUPABASE_CHAVE_SECRETA);
  /* a chave do IP: o IPv6 pelo /48 (a casa ou a empresa recebe um /48 inteiro), como o resto do site; o IPv4 como veio */
  const chaveIp = chaveDoIp48(ip, segredo, new Date(), 'atendente') || chaveDoIp(ip, segredo, new Date(), 'atendente');
  if (!chaveIp && !local) { log('erro', { request_id: requestId, evento: 'sem a chave do IP' }); return falha(503, 'O atendente está indisponível agora.', cors); }   /* sem ela o freio do banco sumiria calado */

  try {
    return acao === 'mensagem' ? await mensagem({ env, deps, banco, cliente, corpo, chaveIp, cors, requestId, falha })
      : await contato({ env, deps, banco, cliente, corpo, chaveIp, cors, falha });
  } catch (e) {
    const codigo = e && (e.codigo || e.code) || null;   /* (ErroBanco.codigo em produção; .code do Postgres no PGlite dos testes) */
    if (codigo === 'P0002' || codigo === '22P02') return falha(404, 'Não encontrado.', cors);
    if (codigo === '22023') return falha(422, 'Dados inválidos.', cors);
    log('erro', { request_id: requestId, acao, codigo, erro: e && e.name || 'erro' });   /* (sem mensagem: pode citar dado pessoal) */
    return falha(500, 'Erro interno.', cors);
  }
}

async function mensagem({ env, deps, banco, cliente, corpo, chaveIp, cors, requestId, falha }) {
  const limpo = textoDoVisitante(corpo.texto);
  const texto = limpo ? redigirVisitante(limpo) : '';   /* telefone, e-mail, CPF, RG e CEP viram marcador ANTES da IA e do banco */
  if (!texto) return falha(422, 'Escreva uma mensagem de até 1.000 caracteres.', cors);
  const ia = Object.hasOwn(deps, 'ia') ? deps.ia : await criarIA(env);
  if (!ia) { log('erro', { request_id: requestId, evento: 'IA não configurada' }); return falha(503, 'O atendente está indisponível agora.', cors); }

  /* o anti-robô, só na 1ª mensagem de uma conversa e só quando ligado (ATENDENTE_TURNSTILE=1): o widget no balão é um passo do 1º cliente real */
  if (env.ATENDENTE_TURNSTILE === '1' && !corpo.conversa_id) {
    const h = await verificarHumano(configTurnstile(env), corpo.turnstile, deps.buscarTurnstile || fetch);
    if (!h.ok) return falha(403, 'Não foi possível confirmar que você não é um robô. Recarregue a página.', cors);
  }

  const max = { ...TETOS, ...(deps.max || {}) };
  const tetoGlobal = Number(env.ATENDENTE_TETO_GLOBAL_USD) > 0 ? Number(env.ATENDENTE_TETO_GLOBAL_USD) : max.global_usd;
  /* tudo atômico no banco: IP, mensagens da conversa e a RESERVA do gasto (cliente e global), antes de chamar a IA */
  const turno = await banco('atendente_turno_abrir', { publico: cliente.publico, conversa_id: corpo.conversa_id || null, chave_ip: chaveIp,
    max_msgs: max.msgs, max_ip_hora: max.ip_hora, reserva_usd: reservaUsd('atendente'), teto_global_usd: tetoGlobal });
  const f = frases(cliente.nome);
  const historico = Array.isArray(turno.historico) ? turno.historico : [];
  const comLink = (textoResposta, extra = {}) => {
    const url = linkWhatsapp(cliente);   /* resumo FIXO: as falas do visitante não vão no link */
    return { resposta: textoResposta, passar_para_pessoa: true, ...(url ? { whatsapp_url: url } : {}), ...extra };
  };
  if (!turno.ok) {
    if (turno.avisar) { /* o dono é avisado UMA vez por dia, com texto fixo (sem dado pessoal) */
      await (deps.avisar || avisarDono)(env, turno.avisar === 'global' ? 'atendente_global' : 'atendente_cliente');
      log('erro', { request_id: requestId, evento: 'teto de gasto do atendente batido', escopo: turno.avisar });
    }
    return resposta(comLink(f[turno.motivo] || f.falhou, { conversa_id: turno.conversa_id }), 200, cors);   /* o teto bateu: honesto e com a saída para pessoa */
  }

  let r;
  try { r = await responder({ cliente, historico, texto, ia }); }
  catch (e) { await devolverReserva(banco, cliente, turno, 0, requestId); throw e; }
  if (r.via === 'falha') log('erro', { request_id: requestId, evento: 'IA falhou no atendente', motivo: r.motivo || null });
  try {
    await banco('atendente_turno_gravar', { publico: cliente.publico, conversa_id: turno.conversa_id, texto_visitante: texto, texto_atendente: r.resposta,
      custo_usd: r.custo_usd, reservado_usd: turno.reservado_usd });
  } catch (e) { await devolverReserva(banco, cliente, turno, r.custo_usd, requestId); throw e; }
  log('info', { request_id: requestId, evento: 'turno', via: r.via, passar: r.passar });   /* (só o caminho da resposta, nunca o texto) */
  const url = r.passar ? linkWhatsapp(cliente) : null;
  const semLink = r.passar && !url && r.via === 'fixa';   /* "continue no WhatsApp" sem WhatsApp cadastrado seria promessa vazia */
  return resposta({ conversa_id: turno.conversa_id, resposta: semLink ? f.pessoaSemLink : r.resposta, passar_para_pessoa: r.passar, ...(url ? { whatsapp_url: url } : {}) }, 200, cors);
}

/* a IA ou a gravação falhou: devolve a reserva (e soma o custo que a IA já cobrou). Se nem isto der, a reserva vence sozinha em 60 s. */
async function devolverReserva(banco, cliente, turno, custo, requestId) {
  try { await banco('atendente_turno_desfazer', { publico: cliente.publico, reservado_usd: turno.reservado_usd, custo_usd: custo }); }
  catch (e) { log('erro', { request_id: requestId, evento: 'reserva não devolvida (vence sozinha)', codigo: e && (e.codigo || e.code) || null }); }
}

async function contato({ env, deps, banco, cliente, corpo, chaveIp, cors, falha }) {
  const nome = typeof corpo.nome === 'string' ? corpo.nome.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim() : '';
  const telefone = typeof corpo.telefone === 'string' ? corpo.telefone.replace(/\D/g, '') : '';
  if (!nome || [...nome].length > 80 || !/^\d{10,15}$/.test(telefone)) return falha(422, 'Confira o nome e o telefone com DDD.', cors);
  const r = await banco('atendente_contato_criar', { publico: cliente.publico, conversa_id: corpo.conversa_id || null, nome, telefone, chave_ip: chaveIp, max_dia: (deps.max || {}).contatos_dia });
  if (r && r.avisar) await (deps.avisar || avisarDono)(env, 'atendente_contatos');   /* uma vez por dia, texto fixo */
  if (!r || r.ok !== true) {
    const frase = { cheio: 'Hoje o recebimento de contatos por aqui já lotou. Fale com a equipe pelo WhatsApp ou tente amanhã.', limite: 'Já recebi os seus contatos nesta conversa.' }[r && r.motivo];
    return falha(429, frase || 'Você já deixou o contato por aqui. Tente de novo mais tarde.', cors);
  }
  return resposta({ ok: true }, 200, cors);
}
