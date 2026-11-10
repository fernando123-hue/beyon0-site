/* O resumo do modo sombra (F3 do JEV): das linhas de app.jev_sombra (só ids, rótulos, probabilidades e custo; nenhum texto),
   a concordância código × Haiku por pergunta e por texto lido (entrada, saída do modelo, resposta final), as falhas por
   motivo e o custo por dia. Função pura; quem lê o banco é scripts/relatorio-jev-sombra.mjs. */

export function resumir(linhas) {
  const perguntas = new Map(), falhas = {}, dias = new Map();
  for (const l of linhas) {
    const d = dias.get(l.dia) ?? { dia: l.dia, leituras: 0, custo_usd: 0, ms: [] };
    d.leituras++; d.custo_usd += Number(l.custo_usd) || 0;
    if (Number.isFinite(l.ms)) d.ms.push(l.ms);
    dias.set(l.dia, d);
    if (!l.disponivel) { falhas[l.motivo ?? 'sem motivo'] = (falhas[l.motivo ?? 'sem motivo'] ?? 0) + 1; continue; }
    const divergentes = new Map((l.divergencias ?? []).map(x => x.split(':')));
    for (const pergunta of Object.keys(l.codigo ?? {})) {
      const chave = l.alvo + '|' + pergunta;
      const p = perguntas.get(chave) ?? { tarefa: l.tarefa, alvo: l.alvo, pergunta, leituras: 0, concordam: 0, so_haiku: 0, so_codigo: 0 };
      p.leituras++;
      const lado = divergentes.get(pergunta);
      if (lado === 'so_haiku') p.so_haiku++; else if (lado === 'so_codigo') p.so_codigo++; else p.concordam++;
      perguntas.set(chave, p);
    }
  }
  const mediana = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  return {
    perguntas: [...perguntas.values()],
    falhas,
    dias: [...dias.values()].sort((a, b) => String(a.dia).localeCompare(String(b.dia))).map(({ ms, ...d }) => ({ ...d, ms_mediana: mediana(ms) }))
  };
}
