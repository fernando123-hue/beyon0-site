/* ==========================================================================
   /api/vendas?acao=… — a API do agente de vendas (uma função; cada ação é um
   passo do fluxo, em api/_vendas/fluxo.mjs).
     GET  estado, pagamento, pagamento-config, sessao-config, catalogo
     POST sessao, retomar, renovar, mensagem, gerar, gerar-direcao, escolher,
          ajustar, desfazer, pedido-livre, escopo, confirmar, pagar, simular, confirmar-pacote, detalhes,
          material-salvar, material-reservar, material-conferir, material-remover, material-enviar (PR 3b-2: o material da entrega;
          só com BZ_ENTREGA=ligada), link-pedido, sair-do-aparelho, outro-aparelho, abrir-pedido (PR 3b-2: o link do pedido),
          previa-ajustes, previa-aprovar (PR 3b-3: a lista de ajustes e a aprovação da prévia; só com BZ_ENTREGA=ligada)
   (PR 2a: o contato vem pelos detalhes; a ação "contato" saiu, porque passava por cima dos freios do pedido)
   (PR 3a: o ajuste pela IA, "alterar", saiu; os ajustes são opções prontas e o pedido livre vai para a fila do dono)
   Fronteira: freio por IP, JSON obrigatório (um formulário de outro site não
   chega aqui), corpo limitado, token do visitante em cada ação (exceto criar
   ou retomar a sessão), erro interno genérico (detalhe só no log, sem dado pessoal).
   ========================================================================== */
import { criarFluxo, traduzirErro } from './_vendas/fluxo.mjs';
import { criarTransporte, ErroBanco } from './_vendas/transporte.mjs';
import { criarVisitantes } from './_vendas/visitante.mjs';
import { configPagamentos, configPublica } from './_pagamentos/config.mjs';
import { criarServicoPagamentos } from './_pagamentos/servico.mjs';
import { criarIA } from './_ia/provedor.mjs';
import { modoDirecoes } from './_ia/config.mjs';
import { ambienteDe } from './_ambiente.mjs';
import { criarFreio, ipDe } from './_freio.mjs';
import { randomUUID } from 'node:crypto';
import { criarArmazem } from './_material/armazem.mjs';
import { configTurnstile, verificarHumano } from './_vendas/turnstile.mjs';

export const ACOES = {
  GET: { estado: 'estado', pagamento: 'pagamento', 'pagamento-config': 'pagamentoConfig', 'sessao-config': 'sessaoConfig', catalogo: 'catalogo' },
  POST: { sessao: 'sessao', retomar: 'retomar', renovar: 'renovar', mensagem: 'mensagem', gerar: 'gerar', 'gerar-direcao': 'gerarDirecao',
    escolher: 'escolher',
    ajustar: 'ajustar', desfazer: 'desfazer', 'pedido-livre': 'pedidoLivre', escopo: 'escopo', confirmar: 'confirmar', pagar: 'pagar',
    simular: 'simular', 'confirmar-pacote': 'confirmarPacote', detalhes: 'detalhes',
    'material-salvar': 'materialSalvar', 'material-reservar': 'materialReservar', 'material-conferir': 'materialConferir',
    'material-remover': 'materialRemover', 'material-enviar': 'materialEnviar',
    'link-pedido': 'linkPedido', 'sair-do-aparelho': 'sairDoAparelho', 'outro-aparelho': 'outroAparelho', 'abrir-pedido': 'abrirPedido',
    'previa-ajustes': 'previaAjustes', 'previa-aprovar': 'previaAprovar' }
};
const PRECISA_IA = new Set(['mensagem', 'gerarDirecao']);
export const LIMITE_BYTES = 16384;
export const freioGeral = criarFreio({ max: 90, janelaMs: 60e3 });
export const freioSessao = criarFreio({ max: 8, janelaMs: 10 * 60e3 });   /* criar visitante anônimo: poucos por IP */

/* toda resposta leva o x-request-id: o mesmo do log e do registro das chamadas de IA (app.ia_chamadas) */
const json = (dados, status = 200, requestId) => new Response(JSON.stringify(dados), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(requestId ? { 'x-request-id': requestId } : {}) }
});
/* log em uma linha JSON, sem dado pessoal: dá para filtrar por pedido no painel da Vercel */
const log = (nivel, dados) => console[nivel === 'erro' ? 'error' : 'log'](JSON.stringify({ origem: 'vendas', nivel, ...dados }));

export const GET = request => atender(request, process.env, 'GET');
export const POST = request => atender(request, process.env, 'POST');

export async function atender(request, env, metodo, deps) {
  const requestId = randomUUID();
  const responder = (dados, status) => json(dados, status, requestId);
  const query = new URL(request.url).searchParams;
  const nome = query.get('acao');
  const acao = Object.hasOwn(ACOES, metodo) && Object.hasOwn(ACOES[metodo], nome) ? ACOES[metodo][nome] : null;   /* (não "constructor", "__proto__"…) */
  if (!acao) return responder({ erro: 'Ação inválida.' }, 404);
  const ip = ipDe(request);
  const criaSessao = acao === 'sessao' || acao === 'retomar' || acao === 'abrirPedido';   /* (a retomada também cria um visitante anônimo e testa códigos: mesma cota) */
  if (freioGeral(ip) || (criaSessao && freioSessao(ip))) return responder({ erro: 'Muitas requisições. Espere um minuto.' }, 429);

  let corpo = null;
  if (metodo === 'POST') {
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return responder({ erro: 'Envie JSON.' }, 415);
    const texto = await request.text();
    if (texto.length > LIMITE_BYTES) return responder({ erro: 'Corpo grande demais.' }, 413);
    try { corpo = texto ? JSON.parse(texto) : {}; } catch { return responder({ erro: 'JSON inválido.' }, 400); }
  }

  /* a configuração pública do pagamento (Public Key e ambiente): sem sessão, sem segredo */
  if (acao === 'pagamentoConfig') return responder(configPublica(deps && deps.cfgPagamentos ? deps.cfgPagamentos : configPagamentos(env)));
  /* a chave PÚBLICA do anti-robô (api/_vendas/turnstile.mjs): sem sessão, sem segredo */
  const cfgTurnstile = deps && deps.cfgTurnstile ? deps.cfgTurnstile : configTurnstile(env);
  /* consultor: se há IA para a conversa (a tela sem IA mostra só o formulário do orçamento). BZ_SEM_CONSULTOR=1 só
     no servidor local (docs/servidor.mjs, BZ_LOCAL) e nunca na Vercel: o E2E testa a tela sem consultor com a IA
     simulada ainda ligada para gerar os modelos */
  const semConsultorLocal = env.BZ_LOCAL === '1' && env.BZ_SEM_CONSULTOR === '1' && ambienteDe(env) === 'local';
  if (acao === 'sessaoConfig') return responder({ turnstile: cfgTurnstile.siteKey, consultor: semConsultorLocal ? false : deps ? !!deps.ia : !!(await criarIA(env)) });

  /* segredoFreio: o HMAC do IP no freio diário (api/_vendas/ip.mjs); um segredo próprio, ou o do servidor do Supabase */
  const d = deps || { banco: criarTransporte(env), visitantes: criarVisitantes(env, { ip }), ia: await criarIA(env), segredoFreio: env.FREIO_SEGREDO || env.SUPABASE_CHAVE_SECRETA, armazem: criarArmazem(env) };
  if (!deps && d.banco) {
    const cfg = configPagamentos(env);
    if (cfg.ativo) d.pagamentos = criarServicoPagamentos({ banco: d.banco, cfg });
    else if (cfg.motivo) log('erro', { request_id: requestId, evento: 'pagamentos desligados', motivo: cfg.motivo });
  }
  if (!d.banco || !d.visitantes) { log('erro', { request_id: requestId, evento: 'banco ou autenticação não configurados' }); return responder({ erro: 'Serviço indisponível.' }, 503); }
  if (PRECISA_IA.has(acao) && !d.ia) { log('erro', { request_id: requestId, evento: 'IA não configurada (ANTHROPIC_API_KEY)' }); return responder({ erro: 'O consultor está indisponível agora. Fale com a Beyon Zero pelo WhatsApp.', whatsapp: true }, 503); }

  /* o visitante anônimo (sessão nova ou retomada) só nasce depois do anti-robô */
  if (criaSessao) {
    const humano = await verificarHumano(cfgTurnstile, corpo && corpo.turnstile, (deps && deps.buscarTurnstile) || fetch);
    if (!humano.ok) {
      log('erro', { request_id: requestId, evento: 'anti-robô', motivo: humano.motivo, codigos: humano.codigos || null, config: cfgTurnstile.motivo || null });
      if (humano.motivo === 'nao_configurado' || humano.motivo === 'indisponivel') return responder({ erro: 'O orçamento está indisponível agora. Fale com a Beyon Zero pelo WhatsApp.', whatsapp: true }, 503);
      return responder({ erro: 'Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo.' }, 403);
    }
  }

  try {
    return responder(await criarFluxo({ ...d, env: d.env || env, direcoes: d.direcoes || modoDirecoes(env), requestId })[acao]({ request, query, corpo }));
  } catch (e) {
    const r = traduzirErro(e);
    /* a falha passageira (IA, Auth, banco lento) também fica no log, com o motivo técnico (a pessoa só lê a frase) */
    if (r && r.status >= 500 && e !== r) log('erro', { request_id: requestId, acao, evento: 'falha recuperável', erro: e && e.message ? e.message.slice(0, 120) : 'erro' });
    /* o 22P02 (texto que o banco não converte em uuid ou número) é 400 para a pessoa, mas é sinal de bug ou de sondagem:
       fica no log, com o código e a ação e SEM a mensagem do banco (ela cita o valor que o visitante mandou) */
    if (e instanceof ErroBanco && e.codigo === '22P02') console.error(JSON.stringify({ origem: 'vendas', nivel: 'aviso', evento: 'parâmetro malformado no banco (22P02)', request_id: requestId, acao, codigo: '22P02' }));
    if (r) return responder({ erro: r.message, ...(r.extra || {}) }, r.status);
    log('erro', { request_id: requestId, acao, codigo: e && e.codigo ? e.codigo : null, erro: e && e.message ? e.message.slice(0, 120) : 'erro' });
    return responder({ erro: 'Erro interno.', pedido: requestId }, 500);   /* (o código do pedido: a pessoa cita, a equipe acha no log) */
  }
}
