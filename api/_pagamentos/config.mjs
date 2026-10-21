/* ==========================================================================
   CONFIGURAÇÃO DOS PAGAMENTOS — por ambiente, DECLARADO (nunca deduzido: o
   Access Token de teste e o de produção começam igual, "APP_USR").
     MP_AMBIENTE            teste | producao
     MP_ACCESS_TOKEN        SECRETO, só servidor (Vercel/Infisical)
     MP_PUBLIC_KEY          público (vai ao navegador para os campos do cartão)
     MP_WEBHOOK_SEGREDO     SECRETO: a "assinatura secreta" do webhook no painel
     MP_USER_ID             a conta Mercado Pago da Beyon Zero (obrigatório em produção)
     MP_3DS                 desligado (padrão) | on_fraud_risk
     CRON_SECRET            SECRETO: autoriza a reconciliação agendada
   Travas:
   • na Vercel, produção exige MP_AMBIENTE=producao; preview e development exigem
     "teste" (credencial de produção NUNCA em prévia, e vice-versa);
   • faltou algo: pagamentos DESLIGADOS (o site responde "indisponível"), nunca
     um modo meio-ligado;
   • "simulado" só existe no servidor local (docs/servidor.mjs), fora da Vercel.
   Nenhum valor secreto sai deste módulo para log ou resposta.
   ========================================================================== */
import { segredoDoCron } from '../_cron.mjs';
import { ambienteDe } from '../_ambiente.mjs';

export function configPagamentos(env = process.env) {
  const amb = ambienteDe(env);
  const local = globalThis.__BZ_LOCAL && amb === 'local';
  if (local && !env.MP_ACCESS_TOKEN && globalThis.__BZ_LOCAL.mp) {
    const s = globalThis.__BZ_LOCAL.mp;
    return { ativo: true, ambiente: 'simulado', provedor: 'mercadopago', token: s.token, publicKey: 'simulado', segredoWebhook: s.segredo,
      contaEsperada: s.userId, tresDS: null, pixExpiracao: 'PT1H', base: 'https://api.mercadopago.com', fetch: s.fetch, cronSecret: s.cronSecret };
  }
  const desligado = motivo => ({ ativo: false, motivo });
  const ambiente = env.MP_AMBIENTE;
  if (!ambiente) return desligado('MP_AMBIENTE não definido');
  if (!['teste', 'producao'].includes(ambiente)) return desligado('MP_AMBIENTE inválido');
  if (amb !== 'local') {
    const prod = amb === 'producao';
    if (prod && ambiente !== 'producao') return desligado('produção exige MP_AMBIENTE=producao');
    if (!prod && ambiente !== 'teste') return desligado('prévia exige MP_AMBIENTE=teste');
  } else if (ambiente === 'producao') {
    return desligado('credencial de produção fora da produção');
  }
  const token = env.MP_ACCESS_TOKEN, publicKey = env.MP_PUBLIC_KEY, segredo = env.MP_WEBHOOK_SEGREDO;
  if (!token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) return desligado('MP_ACCESS_TOKEN ausente ou malformado');
  if (!publicKey || !/^[A-Za-z0-9_-]{20,200}$/.test(publicKey)) return desligado('MP_PUBLIC_KEY ausente ou malformada');
  if (!segredo || segredo.length < 16) return desligado('MP_WEBHOOK_SEGREDO ausente');
  const contaEsperada = env.MP_USER_ID && /^\d{3,20}$/.test(env.MP_USER_ID) ? env.MP_USER_ID : null;
  if (!contaEsperada) return desligado('MP_USER_ID obrigatório (a conta do Mercado Pago da Beyon Zero)');
  /* o Access Token do MP termina no id da conta (APP_USR-<app>-<data>-<hash>-<user_id>): token colado de outra conta = desligado */
  const sufixo = token.match(/-(\d{3,20})$/);
  if (sufixo && sufixo[1] !== contaEsperada) return desligado('MP_ACCESS_TOKEN não é da conta MP_USER_ID');
  const tresDS = env.MP_3DS === 'on_fraud_risk' ? 'on_fraud_risk' : null;
  return { ativo: true, ambiente, provedor: 'mercadopago', token, publicKey, segredoWebhook: segredo, contaEsperada, tresDS,
    pixExpiracao: 'PT1H', base: 'https://api.mercadopago.com', fetch: null, cronSecret: segredoDoCron(env) };
}

/* o que pode ir ao navegador */
export function configPublica(cfg) {
  if (!cfg.ativo) return { ativo: false };
  return { ativo: true, ambiente: cfg.ambiente, publicKey: cfg.publicKey, parcelasMax: 12 };
}
