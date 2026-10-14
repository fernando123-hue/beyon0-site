/* ==========================================================================
   O PEDIDO DE MODELOS (orçamento sem IA, PR 2a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §0 e §3).
   • validarDetalhes: o corpo da ação "detalhes" num ESQUEMA FECHADO (campo de fora = recusa), com os tamanhos
     da tela (60 a 200 caracteres), redigir() em todo texto antes de gravar e a triagem do classificador pelas
     REGRAS (texto suspeito vira selo no painel; nada é bloqueado por isso; o JEV nunca entra aqui).
   • as redes do negócio (as cinco, pedido do dono; decisão D4): só o USUÁRIO de cada rede, tirado do que a
     pessoa colou; o link é montado por quem mostra (o painel), sempre no domínio fixo da rede. Só com a
     autorização da pessoa; ninguém busca nada nelas automaticamente.
   • chaveDoTelefone: HMAC do número normalizado com o segredo do servidor; os freios do banco nunca recebem o
     número (o número do contato vai para app.leads, como sempre). Na Vercel sem segredo: null (fecha).
   ========================================================================== */
import { createHmac } from 'node:crypto';
import { normalizarTelefone } from '../_valida-app.mjs';
import { redigir } from './seguranca.mjs';
import { limparAtualizacao } from './briefing.mjs';
import { classificar } from '../_classificador/index.mjs';
import { textoLimpo } from '../_classificador/contrato.mjs';

/* os freios do pedido, passados ao banco a cada chamada (o banco tem os mesmos números como padrão). O teto da fila é
   a decisão D1 (plano docs/superpowers/plans/2026-10-13-orcamento-sem-ia-pr2a.md); o alarme dos pendentes avisa o
   dono no painel quando a lista de não confirmados cresce além do normal */
export const PEDIDOS = Object.freeze({ por_ip_dia: 3, por_telefone_dia: 2, fila_confirmados: 10, horas_para_confirmar: 72, alarme_pendentes: 20 });

/* as redes aceitas: o domínio fixo e o formato do usuário (o MESMO de js/painel-pedido-comum.js) */
export const REDES = Object.freeze({
  instagram: { nome: 'Instagram', dominio: 'instagram.com', usuario: /^[A-Za-z0-9._]{1,30}$/ },
  facebook: { nome: 'Facebook', dominio: 'facebook.com', usuario: /^[A-Za-z0-9.]{5,50}$/ },
  tiktok: { nome: 'TikTok', dominio: 'tiktok.com', usuario: /^[A-Za-z0-9._]{2,24}$/ },
  youtube: { nome: 'YouTube', dominio: 'youtube.com', usuario: /^[A-Za-z0-9._-]{3,30}$/ },
  linkedin: { nome: 'LinkedIn', dominio: 'linkedin.com', usuario: /^[A-Za-z0-9-]{3,100}$/ }
});
const CAMPOS = ['conversa_id', 'negocio', 'vende', 'telefone', 'nome', 'publico', 'diferencial', 'admira', 'redes', 'autoriza_redes', 'aceite'];
/* campo: [mínimo (0 = opcional), máximo, como a tela chama] */
const TEXTOS = {
  negocio: [2, 60, 'o nome do negócio'],
  vende: [3, 200, 'o que você vende'],
  nome: [0, 60, 'como quer ser chamado'],
  publico: [0, 200, 'para quem você vende'],
  diferencial: [0, 200, 'o que diferencia o seu negócio'],
  admira: [0, 60, 'o site que você admira']
};
const SEM_SEGREDO = 'beyon-zero-local-sem-segredo';   /* (só servidor local e testes) */
const TRIAGEM = { cfg: { jev: false, prazoMs: 0 } };   /* (a triagem dos detalhes é sempre das regras) */

export function chaveDoTelefone(e164, segredo, env = process.env) {
  if (!segredo && (env.VERCEL || env.VERCEL_ENV)) return null;   /* (na Vercel, sem o segredo do freio: fecha) */
  return createHmac('sha256', segredo || SEM_SEGREDO).update('telefone|' + e164).digest('hex');
}

/* o usuário de uma rede a partir do que a pessoa colou ("@loja", "instagram.com/loja/?hl=pt", "linkedin.com/company/loja").
   '' = em branco; null = não é desta rede ou não é um usuário válido */
export function usuarioDaRede(rede, valor) {
  const def = Object.hasOwn(REDES, rede) ? REDES[rede] : null;
  if (!def || typeof valor !== 'string') return null;
  let s = valor.trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^(www|m)\./i, '');
  const temDominio = s.toLowerCase().startsWith(def.dominio + '/');
  if (temDominio) s = s.slice(def.dominio.length + 1);
  s = s.split(/[?#]/)[0].replace(/\/+$/, '');
  if (temDominio) s = s.replace(/^(company|in|c)\//i, '');
  s = s.replace(/^@/, '');
  return def.usuario.test(s) ? s : null;
}

function redesDoCorpo(corpo) {
  const redes = {};
  if (corpo.redes === undefined) return { redes };
  if (!corpo.redes || typeof corpo.redes !== 'object' || Array.isArray(corpo.redes)) return { erro: 'Confira as redes do negócio.' };
  for (const [rede, valor] of Object.entries(corpo.redes)) {
    if (!Object.hasOwn(REDES, rede)) return { erro: 'Rede não aceita: ' + String(rede).slice(0, 20) + '.' };
    const u = usuarioDaRede(rede, valor);
    if (u === null) return { erro: 'Confira o endereço do ' + REDES[rede].nome + '.' };
    if (u) redes[rede] = u;
  }
  return { redes };
}

export async function validarDetalhes(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return { erros: ['Envie os dados do formulário.'] };
  const fora = Object.keys(corpo).find(k => !CAMPOS.includes(k));
  if (fora) return { erros: ['Campo não aceito: ' + String(fora).slice(0, 40) + '.'] };
  const t = {};
  for (const [campo, [minimo, maximo, nome]] of Object.entries(TEXTOS)) {
    const v = textoLimpo(corpo[campo]);
    if (minimo && v.length < minimo) return { erros: ['Informe ' + nome + '.'] };
    if (v.length > maximo) return { erros: ['Encurte ' + nome + ': até ' + maximo + ' caracteres.'] };
    t[campo] = v;
  }
  const telefone = normalizarTelefone(typeof corpo.telefone === 'string' ? corpo.telefone : '');
  if (!telefone) return { erros: ['Informe o seu WhatsApp com DDD.'] };
  const r = redesDoCorpo(corpo);
  if (r.erro) return { erros: [r.erro] };
  if (Object.keys(r.redes).length && corpo.autoriza_redes !== true) return { erros: ['Para usar as suas redes nos modelos, marque a autorização (ou deixe as redes em branco).'] };
  if (corpo.aceite !== true) return { erros: ['É preciso concordar com o uso dos dados para receber os modelos.'] };
  /* (o que vai para o banco é o texto redigido: telefone, e-mail e documento viram marcadores) */
  const red = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v ? redigir(v) : '']));
  const briefing = limparAtualizacao({
    negocio: { nome: red.negocio, descricao: red.vende },
    ...(red.publico ? { publico: { descricao: red.publico } } : {}),
    ...(red.diferencial ? { posicionamento: { diferenciais: [red.diferencial] } } : {}),
    ...(red.admira ? { referencias: [red.admira] } : {})
  });
  const triagem = await classificar('triar_pedido', { textos: Object.values(t) }, TRIAGEM);
  return { dados: { briefing, nome: red.nome, telefone, redes: r.redes, suspeito: triagem.dados.suspeito === true } };
}
