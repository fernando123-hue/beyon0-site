/* ==========================================================================
   PAINEL DO DONO › ATENDENTE DO SITE DO CLIENTE: criar cliente, editar base, tabela de preços e domínios, ler conversas e contatos.
   Chamado por api/painel.mjs DEPOIS da chave do painel. Tudo volta como JSON de texto puro (a tela usa textContent). O servidor
   valida antes do banco (o banco valida de novo: cinto e suspensório). O texto das conversas é de visitantes: é DADO, nunca ordem.
   ========================================================================== */
import { ehUuid } from '../_valida-app.mjs';
import { centavosDe } from './regras.mjs';

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const COR = /^#[0-9a-f]{6}$/;
const LIMITES = { dominios: 10, base: 100 };
const PERMITIDAS = ['id', 'nome', 'whatsapp', 'privacidade_url', 'saudacao', 'cor', 'cor_texto', 'teto_dia_usd', 'ativo', 'dominios', 'base'];
const CONTROLES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const curto = (v, max) => typeof v === 'string' && !CONTROLES.test(v) && [...v.trim()].length >= 1 && [...v.trim()].length <= max;

/* { dados } pronto para o banco, ou { erro } com a frase para o dono */
export function validarCliente(c, { local = false } = {}) {
  const falha = erro => ({ erro });
  if (!c || typeof c !== 'object' || Array.isArray(c) || !Object.keys(c).every(k => PERMITIDAS.includes(k))) return falha('Pedido inválido.');
  if (c.id !== undefined && !ehUuid(c.id)) return falha('Cliente inválido.');
  if (!curto(c.nome, 80)) return falha('O nome do negócio é obrigatório (até 80 caracteres).');
  const digitos = String(c.whatsapp ?? '').replace(/\D/g, '');
  if (digitos && !/^\d{10,15}$/.test(digitos)) return falha('O WhatsApp do cliente precisa ter DDI e DDD (de 10 a 15 dígitos).');
  const priv = c.privacidade_url === undefined || c.privacidade_url === '' || c.privacidade_url === null ? '' : c.privacidade_url;
  if (priv && !(typeof priv === 'string' && /^https:\/\/[^\s<>"]{4,250}$/.test(priv))) return falha('O link de privacidade precisa começar com https://.');
  if (c.saudacao && !curto(c.saudacao, 300)) return falha('A saudação tem até 300 caracteres.');
  if (c.ativo !== false && !priv) return falha('Com o balão ligado, o link da privacidade do cliente é obrigatório.');
  if (c.ativo !== false && !digitos) return falha('Com o balão ligado, o WhatsApp do cliente é obrigatório (é para onde a conversa passa).');
  const cor = c.cor ?? '#1a1a1a', corTexto = c.cor_texto ?? '#ffffff';
  if (!COR.test(cor) || !COR.test(corTexto)) return falha('As cores precisam ser no formato #rrggbb.');
  const teto = c.teto_dia_usd ?? 1;
  if (typeof teto !== 'number' || !Number.isFinite(teto) || teto < 0 || teto > 100) return falha('O teto de gasto por dia vai de 0 a 100 dólares.');
  if (c.ativo !== undefined && typeof c.ativo !== 'boolean') return falha('Pedido inválido.');
  if (!Array.isArray(c.dominios) || c.dominios.length > LIMITES.dominios) return falha('Informe até ' + LIMITES.dominios + ' domínios.');
  const dominios = [...new Set(c.dominios.map(d => String(d).trim().toLowerCase()))];
  if (!local && dominios.some(d => d === 'localhost' || d === '127.0.0.1')) return falha('Domínio de teste (localhost) só vale no ambiente local.');
  if (dominios.some(d => !HOST.test(d) || d.includes('..'))) return falha('Domínio inválido. Use só o endereço, como "meusite.com.br" (sem https://, sem barra, sem * e sem porta).');
  if (!Array.isArray(c.base) || c.base.length > LIMITES.base) return falha('A base aceita até ' + LIMITES.base + ' itens.');
  const base = [];
  for (const b of c.base) {
    if (!b || typeof b !== 'object') return falha('Item da base inválido.');
    if (b.tipo === 'pergunta') {
      if (!curto(b.pergunta, 300) || !curto(b.resposta, 1500)) return falha('Cada pergunta tem de 1 a 300 caracteres e cada resposta de 1 a 1.500.');
      base.push({ tipo: 'pergunta', pergunta: b.pergunta.trim(), resposta: b.resposta.trim() });
    } else if (b.tipo === 'preco') {
      const centavos = typeof b.valor === 'string' && /^\d[\d.,]*$/.test(b.valor.trim()) ? centavosDe(b.valor.trim()) : null;
      if (!curto(b.item, 120) || centavos === null || centavos > 100000000) return falha('Cada preço precisa de um nome e de um valor em reais, como "180,00".');
      base.push({ tipo: 'preco', item: b.item.trim(), preco_centavos: centavos });
    } else return falha('Item da base inválido.');
  }
  return { dados: { ...(c.id ? { id: c.id } : {}), nome: c.nome.trim(), whatsapp: digitos, privacidade_url: priv, saudacao: c.saudacao ? c.saudacao.trim() : '', cor, cor_texto: corTexto, teto_dia_usd: teto, ativo: c.ativo !== false, dominios, base } };
}

export function criarAcoesAtendente(rpc, org, { local = false } = {}) {
  const guardar = async (fn, rotulo) => {
    try { return await fn(); }
    catch (e) {
      const codigo = e && (e.codigo || e.code);
      if (codigo === 'P0002') return json({ erro: 'Cliente não encontrado.' }, 404);
      if (codigo === '23514' || codigo === '22023') return json({ erro: 'O banco recusou os dados. Confira os campos.' }, 422);
      console.error('[painel] atendente ' + rotulo + ':', codigo);
      return json({ erro: 'Não deu para fazer isso agora.' }, 500);
    }
  };
  const idOu400 = id => (ehUuid(id) ? null : json({ erro: 'Cliente inválido.' }, 400));
  return {
    lista: () => guardar(async () => json(await rpc('atendente_painel_clientes', { org_slug: org })), 'lista'),
    cliente: id => idOu400(id) || guardar(async () => json(await rpc('atendente_painel_cliente', { org_slug: org, id })), 'cliente'),
    conversas: id => idOu400(id) || guardar(async () => json(await rpc('atendente_painel_conversas', { org_slug: org, id })), 'conversas'),
    salvar: bruto => {
      const v = validarCliente(bruto, { local });
      if (v.erro) return json({ erro: v.erro }, 400);
      return guardar(async () => json(await rpc('atendente_cliente_salvar', { org_slug: org, ...v.dados })), 'salvar');
    }
  };
}
