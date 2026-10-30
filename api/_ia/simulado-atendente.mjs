/* ==========================================================================
   DUBLÊ DO ATENDENTE DO SITE DO CLIENTE (só testes e servidor local, como api/_ia/simulado.mjs). Determinístico: acha na base (no
   contexto, entre <dados_do_negocio>) o item que mais combina com as palavras da pergunta. Não é o agente: o agente é o código
   de api/_atendente/agente.mjs, que confere tudo o que sai daqui.
   ========================================================================== */
const SEM_ACENTO = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PARADAS = new Set('qual quais quanto quanta como onde quando que de da do das dos em no na nos nas um uma uns umas para por com sem e ou a o as os voces voce vcs vc tem ter ha esta sao foi ser meu minha seu sua isso esse essa mais muito'.split(' '));
const palavras = s => SEM_ACENTO(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !PARADAS.has(w));
const BR = c => 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ehPreco = t => /\b(quanto|pre[cç]o|valor|custa|custo|sai por|cobram)\b/i.test(t);

function itensDoContexto(contexto) {
  const m = /<dados_do_negocio>\n([\s\S]*?)\n<\/dados_do_negocio>/.exec(String(contexto || ''));
  try { return m ? JSON.parse(m[1]) : []; } catch { return []; }
}
function visitante(mensagens) {
  const u = [...mensagens].reverse().find(x => x.role === 'user');
  const m = u && /<mensagem_do_visitante>([\s\S]*)<\/mensagem_do_visitante>/.exec(u.content);
  return m ? m[1] : '';
}
const pontos = (chaves, texto) => { const t = new Set(palavras(texto)); return chaves.filter(w => t.has(w)).length; };
const saida = (resposta, passar = false) => ({ texto: '', json: { resposta, passar_para_pessoa: passar }, chamadas: [], conteudo: [], parada: 'fim', modelo: 'simulado', uso: { entrada: 0, saida: 0 }, custo_usd: 0 });

export function atendenteSimulado({ contexto, mensagens }) {
  const texto = visitante(mensagens), itens = itensDoContexto(contexto), chaves = palavras(texto);
  if (!chaves.length) return saida('Pode me contar um pouco mais sobre o que você precisa?');
  const precos = itens.filter(i => i.preco).map(i => ({ ...i.preco, p: pontos(palavras(i.preco.item), texto) })).sort((a, b) => b.p - a.p);
  if (ehPreco(texto)) {
    if (precos[0] && precos[0].p > 0) return saida(`${precos[0].item}: R$ ${precos[0].valor_reais}.`);
    return saida('Esse valor eu não tenho aqui, e prefiro não chutar. Vou te passar para a equipe.', true);
  }
  const qa = itens.filter(i => i.pergunta).map(i => ({ ...i, p: pontos(palavras(i.pergunta), texto) })).sort((a, b) => b.p - a.p);
  if (qa[0] && qa[0].p > 0) return saida(qa[0].resposta);
  if (precos[0] && precos[0].p > 0) return saida(`${precos[0].item}: R$ ${precos[0].valor_reais}.`);
  return saida('Essa eu não sei responder com segurança, e prefiro não inventar. Vou te passar para a equipe.', true);
}
export { BR };
