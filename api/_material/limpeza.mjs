/* ==========================================================================
   A LIMPEZA E A RECONCILIAÇÃO DO ARMAZÉM (PR 3b-2; spec §7, §9, §10), na rotina diária que já existe (sem cron novo).
   1 chamada ao banco (a lista vem de storage.objects), 1 remoção EM LOTE no armazém, 1 chamada ao banco para marcar.
   A ordem importa: apaga no armazém ANTES de marcar; se o armazém cair, nada é marcado e a rotina de amanhã repete.
   ========================================================================== */
const CAMINHO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function limparMaterial({ banco, armazem, lote = 100 }) {
  const pend = await banco('rotinas_material_pendencias', { limite: lote });
  const caminhos = (Array.isArray(pend && pend.caminhos) ? pend.caminhos : []).filter(c => typeof c === 'string' && CAMINHO.test(c));
  if (caminhos.length) await armazem.remover(caminhos);
  const r = await banco('rotinas_material_baixar', { caminhos });
  return { removidos: caminhos.length, limpos: r.limpos, balde_pct: pend.balde_pct, alarme: pend.alarme === true, resto: caminhos.length >= lote };
}
