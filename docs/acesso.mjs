/* ==========================================================================
   COMO OS SCRIPTS ALCANÇAM O STAGING ATRÁS DO ACCESS (plano da migração para a Cloudflare, § 5.4, tarefa B9).
   O Worker de prévias fica atrás do Cloudflare Access; o "service token" do agente (CF_ACCESS_CLIENT_ID e
   CF_ACCESS_CLIENT_SECRET, que o dono guarda num arquivo local e a fila do vigia carrega) é mandado em dois
   cabeçalhos. Regra de ouro: o token NUNCA vai para outro host. Só sai quando as DUAS variáveis existem e o BASE é o
   staging/prévia DA CONTA DO DONO (beyon-zero-site-previa.<SUB_CONTA>.workers.dev, https). Produção, domínio próprio,
   servidor local e o Worker de mesmo nome em OUTRA conta (qualquer pessoa cria um): nada.
   ========================================================================== */

/* O subdomínio workers.dev da conta Cloudflare do dono (pendência P3). ENQUANTO FOR null, o staging fica FECHADO: o
   token do Access (e a chave do painel, scripts/direcoes.mjs) não vão a host nenhum. Só o dono o preenche, com o
   que a Cloudflare mostra em Workers & Pages → "Your subdomain" (letras minúsculas, números e hífen). */
export const SUB_CONTA = 'contato-beyon-zero';

const NOME_DO_STAGING = 'beyon-zero-site-previa';
const SUB_VALIDO = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const subOuNulo = sub => (typeof sub === 'string' && SUB_VALIDO.test(sub) ? sub : null);

/* o host fixo do staging, montado com o SUB_CONTA (ou o sub dado, nos testes); null se ainda não há SUB */
export function hostDoStaging(sub = SUB_CONTA) {
  const s = subOuNulo(sub);
  return s ? NOME_DO_STAGING + '.' + s + '.workers.dev' : null;
}

/* staging fixo ou prévia de branch ("<branch>-beyon-zero-site-previa"), SEMPRE com o SUB da conta do dono, comparação exata */
export function ehHostDePrevia(base, sub = SUB_CONTA) {
  const staging = hostDoStaging(sub);
  if (!staging) return false;
  let u;
  try { u = new URL(String(base || '')); } catch { return false; }
  const exato = u.hostname === staging || (u.hostname.endsWith('-' + staging) && /^[a-z0-9-]+$/.test(u.hostname.slice(0, -staging.length - 1)));
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && exato;
}

/* { 'CF-Access-Client-Id': …, 'CF-Access-Client-Secret': … } ou {} (nunca lança, nunca devolve metade) */
export function cabecalhosDeAcesso(env = process.env, base = env.BASE || env.BZ_BASE, sub = SUB_CONTA) {
  const id = typeof env.CF_ACCESS_CLIENT_ID === 'string' ? env.CF_ACCESS_CLIENT_ID.trim() : '';
  const segredo = typeof env.CF_ACCESS_CLIENT_SECRET === 'string' ? env.CF_ACCESS_CLIENT_SECRET.trim() : '';
  if (!id || !segredo || !ehHostDePrevia(base, sub)) return {};
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': segredo };
}

/* Playwright: instala os cabeçalhos SÓ nos pedidos da origem do staging (rota por origem). Nunca extraHTTPHeaders, que
   mandaria o token também a terceiros que a página chama (Turnstile, Mercado Pago, Google). Nunca route.continue, que
   segue o redirecionamento COM o token (o staging redireciona para o login do Access, em outro host quando o token
   expira): busca sem seguir e entrega a resposta; o navegador segue sozinho e o pedido seguinte só leva o token se for
   da própria origem. Devolve se instalou.
   Redirecionamento na MESMA origem (o staging manda /index.html → 307 /): o Playwright só chama a rota no 1º endereço,
   e o pedido seguinte saía sem o token e caía no login do Access. Por isso a rota segue aqui, com o token, só enquanto
   o destino for a própria origem (até MAX_SALTOS); destino em outro host é entregue como veio, sem seguir.
   Só GET/HEAD seguem (o verificador só faz GET; num POST o navegador trocaria o método, e aqui o corpo iria junto):
   outro método recebe o 3xx como veio. Location malformado também: entregue como veio, nunca derruba a rota. */
const MAX_SALTOS = 5;
const METODOS_QUE_SEGUEM = new Set(['GET', 'HEAD']);
const ehRedirecionamento = status => status >= 300 && status < 400;
/* o contexto fechado com um pedido ainda em voo (fim de um alvo do verificar) não é falha do site: só esse erro é
   ignorado, pelo nome ou pelas duas mensagens exatas do Playwright (nunca um "socket has been closed" da rede) */
const ehContextoFechado = e => e?.name === 'TargetClosedError' ||
  /Request context disposed|Target (?:page, context or browser )?has been closed/.test(String(e?.message));

/* urlAtual é função: o endereço só é lido quando há um Location para resolver */
function destinoNaOrigem(resposta, urlAtual, origem) {
  const local = typeof resposta.headers === 'function' ? resposta.headers().location : undefined;
  if (!ehRedirecionamento(resposta.status()) || !local) return null;
  let destino;
  try { destino = new URL(local, urlAtual()); } catch { return null; }   /* malformado: o navegador recebe o 3xx como veio */
  return destino.origin === origem ? destino.href : null;
}

export async function autorizarContexto(ctx, base, env = process.env, sub = SUB_CONTA) {
  const cabecalhos = cabecalhosDeAcesso(env, base, sub);
  if (Object.keys(cabecalhos).length === 0) return false;
  const origem = new URL(base).origin;
  await ctx.route(origem + '/**', async route => {
    try {
      const headers = { ...route.request().headers(), ...cabecalhos };
      let resposta = await route.fetch({ headers, maxRedirects: 0 });
      let url = null;
      for (let salto = 0; salto < MAX_SALTOS; salto++) {
        const destino = destinoNaOrigem(resposta, () => url ?? route.request().url(), origem);
        if (!destino || !METODOS_QUE_SEGUEM.has(route.request().method())) break;
        url = destino;
        resposta = await route.fetch({ url, headers, maxRedirects: 0 });
      }
      await route.fulfill({ response: resposta });
    } catch (e) {
      if (!ehContextoFechado(e)) throw e;
    }
  });
  return true;
}
