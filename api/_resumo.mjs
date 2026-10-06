/* ==========================================================================
   MÉTRICAS PRÓPRIAS — o resumo que o painel mostra (2026-10-06).
   Função pura: recebe as linhas de páginas e de contatos, devolve os números.
   Uma VISITA é uma aba (o id some quando a aba fecha); a origem dela é a da
   primeira página vista. Conversa e cliente vêm do que o dono marca no painel.
   ========================================================================== */
const ORIGENS = { anuncio: 'Anúncio', busca: 'Busca orgânica', social: 'Redes sociais', mensagem: 'WhatsApp e mensagens', email: 'E-mail', referencia: 'Outros sites', direto: 'Direto (digitou ou favorito)' };
export const nomeOrigem = meio => (Object.hasOwn(ORIGENS, meio) ? ORIGENS[meio] : meio);

const somar = (mapa, chave, campo, n = 1) => {
  const l = mapa.get(chave) || { chave, visitas: 0, contatos: 0, conversas: 0, clientes: 0, valor: 0 };
  l[campo] += n;
  mapa.set(chave, l);
};
const ordenar = mapa => [...mapa.values()].sort((a, b) => b.visitas - a.visitas || b.contatos - a.contatos);
const diaBrasilia = iso => new Date(Date.parse(iso) - 3 * 36e5).toISOString().slice(0, 10);   /* (sem horário de verão desde 2019) */
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const media = xs => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const mediana = xs => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function agruparVisitas(paginas) {
  const visitas = new Map();
  for (const p of paginas) {
    const v = visitas.get(p.visita) || { id: p.visita, paginas: [], entrada: null };
    v.paginas.push(p);
    /* a página de entrada é a marcada como 1ª da visita; sem marca (pacote perdido), a mais antiga */
    const melhor = !v.entrada || (p.entrada && !v.entrada.entrada) || (p.entrada === v.entrada.entrada && p.inicio < v.entrada.inicio);
    if (melhor) v.entrada = p;
    visitas.set(p.visita, v);
  }
  return [...visitas.values()];
}

export function resumir(paginas, contatos, { dias }) {
  const porVisita = new Map(contatos.map(c => [c.visita, c]));
  const visitas = agruparVisitas(paginas);
  const origem = new Map(), campanha = new Map(), entrada = new Map(), dispositivo = new Map(), dia = new Map();
  const ouro = { com: { visitas: 0, contatos: 0 }, sem: { visitas: 0, contatos: 0 } };
  const tempos = [];

  for (const v of visitas) {
    const e = v.entrada;
    const c = porVisita.get(v.id);
    const contatou = !!c || v.paginas.some(p => p.contato);
    const conversa = c && (c.status === 'conversa' || c.status === 'cliente');
    const cliente = c && c.status === 'cliente';
    const valor = cliente ? Number(c.valor) || 0 : 0;
    const chaves = [
      [origem, e.meio],
      [entrada, e.pagina],
      [dispositivo, e.dispositivo],
      [dia, diaBrasilia(e.inicio)]
    ];
    if (e.meio === 'anuncio') chaves.push([campanha, (e.campanha || '(sem campanha)') + (e.termo ? ' · ' + e.termo : '')]);
    for (const [mapa, chave] of chaves) {
      somar(mapa, chave, 'visitas');
      if (contatou) somar(mapa, chave, 'contatos');
      if (conversa) somar(mapa, chave, 'conversas');
      if (cliente) { somar(mapa, chave, 'clientes'); somar(mapa, chave, 'valor', valor); }
    }
    const comOuro = v.paginas.some(p => p.ouro) ? ouro.com : ouro.sem;
    comOuro.visitas++; if (contatou) comOuro.contatos++;
    tempos.push(v.paginas.reduce((s, p) => s + (p.ativo_s || 0), 0));
  }

  /* por página: quantas vezes foi vista, até onde rolaram, quais seções viram */
  const porPagina = new Map();
  const form = { abriram: 0, enviaram: 0, abandono: new Map() };
  const botoes = new Map();
  for (const p of paginas) {
    const l = porPagina.get(p.pagina) || { pagina: p.pagina, vistas: 0, rolagens: [], tempos: [], cargas: [], secoes: new Map(), contatos: 0 };
    l.vistas++; l.rolagens.push(p.rolagem || 0); l.tempos.push(p.ativo_s || 0);
    if (p.carga_ms) l.cargas.push(p.carga_ms);
    for (const s of p.secoes || []) l.secoes.set(s, (l.secoes.get(s) || 0) + 1);
    if (p.contato) { l.contatos++; botoes.set(p.contato, (botoes.get(p.contato) || 0) + 1); }
    porPagina.set(p.pagina, l);
    if (p.form) form.abriram++;
    if (p.form === 'enviou') form.enviaram++;
    else if (p.form === 'abriu') { const k = p.form_campo || 'nenhum campo'; form.abandono.set(k, (form.abandono.get(k) || 0) + 1); }
  }

  const total = { visitas: visitas.length, paginas: paginas.length, contatos: 0, conversas: 0, clientes: 0, valor: 0 };
  for (const l of origem.values()) { total.contatos += l.contatos; total.conversas += l.conversas; total.clientes += l.clientes; total.valor += l.valor; }

  return {
    dias,
    total,
    funil: [
      { etapa: 'Visitas', n: total.visitas },
      { etapa: 'Clicaram para conversar', n: total.contatos, pct: pct(total.contatos, total.visitas) },
      { etapa: 'Conversa de verdade', n: total.conversas, pct: pct(total.conversas, total.contatos) },
      { etapa: 'Viraram cliente', n: total.clientes, pct: pct(total.clientes, total.conversas) }
    ],
    tempoMediano_s: mediana(tempos),
    origens: ordenar(origem).map(l => Object.assign({ nome: nomeOrigem(l.chave), taxa: pct(l.contatos, l.visitas) }, l)),
    campanhas: ordenar(campanha).map(l => Object.assign({ taxa: pct(l.contatos, l.visitas) }, l)),
    entradas: ordenar(entrada).map(l => Object.assign({ taxa: pct(l.contatos, l.visitas) }, l)),
    dispositivos: ordenar(dispositivo).map(l => Object.assign({ taxa: pct(l.contatos, l.visitas) }, l)),
    dias_lista: [...dia.values()].sort((a, b) => (a.chave < b.chave ? -1 : 1)),
    botoes: [...botoes].map(([botao, n]) => ({ botao, n })).sort((a, b) => b.n - a.n),
    paginas: [...porPagina.values()].sort((a, b) => b.vistas - a.vistas).map(l => ({
      pagina: l.pagina, vistas: l.vistas, contatos: l.contatos, taxa: pct(l.contatos, l.vistas),
      rolagemMedia: media(l.rolagens), tempoMediano_s: mediana(l.tempos), cargaMediana_ms: mediana(l.cargas),
      secoes: [...l.secoes].map(([id, n]) => ({ id, pct: pct(n, l.vistas) })).sort((a, b) => b.pct - a.pct)
    })),
    formulario: { abriram: form.abriram, enviaram: form.enviaram, taxa: pct(form.enviaram, form.abriram),
      abandono: [...form.abandono].map(([campo, n]) => ({ campo, n })).sort((a, b) => b.n - a.n) },
    ouro: { com: Object.assign({ taxa: pct(ouro.com.contatos, ouro.com.visitas) }, ouro.com), sem: Object.assign({ taxa: pct(ouro.sem.contatos, ouro.sem.visitas) }, ouro.sem) },
    contatos: [...contatos].sort((a, b) => (a.quando < b.quando ? 1 : -1)).slice(0, 300).map(c => ({
      codigo: c.codigo, quando: c.quando, origem: nomeOrigem(c.meio), fonte: c.fonte, campanha: c.campanha, termo: c.termo,
      pagina: c.pagina, botao: c.botao, dispositivo: c.dispositivo, status: c.status || 'clicou', valor: c.valor, nota: c.nota, temGclid: !!c.gclid
    }))
  };
}

/* CSV para "Importar conversões off-line" do Google Ads: só clientes que vieram de clique em anúncio (gclid) */
export function csvGoogleAds(contatos, nomeConversao, fuso = '-0300') {
  const linhas = ['Parameters:TimeZone=' + fuso, 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency'];
  const aspas = s => '"' + String(s).replace(/"/g, '""') + '"';
  for (const c of contatos) {
    if (c.status !== 'cliente' || !c.gclid) continue;
    const t = new Date(c.atualizado || c.quando);
    const local = new Date(t.getTime() - 3 * 36e5).toISOString().replace('T', ' ').slice(0, 19);   /* (Brasília, sem horário de verão) */
    linhas.push([c.gclid, aspas(nomeConversao), local, c.valor ?? '', 'BRL'].join(','));
  }
  return linhas.join('\n') + '\n';
}
