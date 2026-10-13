/* ==========================================================================
   MOTOR DE REGRAS COMERCIAIS (Fase 2, etapa 3; docs/fase2/01-ARQUITETURA.md)
   O preço sai DAQUI, nunca do modelo de IA. O agente escolhe FATORES (formato,
   páginas, adicionais, urgência, complexidade); estas funções validam os
   fatores contra a tabela ATIVA e calculam valor, sinal e prazo.
     base do formato + adicionais (valor × quantidade) → × multiplicadores
     → nunca abaixo do piso → arredondado → sinal pela regra.
   O PRAZO tem teto (o dono: "até 10 dias, todos os formatos"). O que não cabe
   no teto vira FASE SEGUINTE (lista separada, com o próprio valor), na ordem
   de prioridade da tabela: nada é cortado em silêncio, nada é prometido além.
   Itens marcados "fora do automático" (loja, área restrita…) e valores acima
   do limite encaminham para o diagnóstico (conversa com o dono).
   Funções puras: sem banco, sem rede. Testes: docs/testes/precos.test.mjs.
   ========================================================================== */
export const FORMATOS = ['landing_page', 'institucional', 'sob_medida', 'loja_plataforma'];
/* decisão do dono (2026-10-12): a landing page vai até 3 páginas (validarFatores; o catálogo da landing nem oferece mais) */
export const LANDING_MAX_PAGINAS = 3;
export const LANDING_GRANDE = 'A landing page vai até 3 páginas. Para 4 ou mais, escolha o site com várias páginas.';
/* a loja (tabela v2, 2026-10-09) é OPCIONAL: uma tabela ativa anterior, sem ela, continua válida; se o código subir antes
   da v2 ser ativada, o orçamento segue funcionando com os três formatos (revisão de segurança) */
const OBRIGATORIOS = ['landing_page', 'institucional', 'sob_medida'];
export const CHAVE = /^[a-z][a-z0-9_]{1,40}$/;   /* (o fluxo filtra o corpo com esta mesma: um padrão só) */
const numero = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/* ---------- a tabela (validada antes de ativar e antes de cada uso) ---------- */
const objeto = v => !!v && typeof v === 'object' && !Array.isArray(v);

export function validarRegras(r) {
  const erros = [];
  if (!objeto(r)) return { erros: ['regras: esperado um objeto'] };
  if (r.moeda !== 'BRL') erros.push('moeda: só BRL');
  /* inteiro: a proposta guarda inteiro (app.propostas.sinal_percentual); com fração, o cartão mostrava um valor e o Pix
     outro. Mínimo 1: a cobrança exige valor > 0 (app.pagamentos), e 0% falharia depois de o cliente confirmar o escopo */
  if (!numero(r.sinal_percentual, 1, 100) || !Number.isInteger(r.sinal_percentual)) erros.push('sinal_percentual: inteiro de 1 a 100');
  if (!numero(r.prazo_max_dias, 1, 60)) erros.push('prazo_max_dias: 1 a 60');
  /* inteiro: com passo fracionário (3,3) o motor mostrava 1 centavo a menos do que o banco cobrava */
  if (!numero(r.arredondamento, 1, 1000) || !Number.isInteger(r.arredondamento)) erros.push('arredondamento: inteiro de 1 a 1000');
  const f = r.formatos || {};
  for (const k of FORMATOS) {
    const x = f[k];
    if (x === undefined && !OBRIGATORIOS.includes(k)) continue;
    if (!objeto(x)) { erros.push('formatos.' + k + ': falta'); continue; }
    if (!numero(x.base, 1, 1e6)) erros.push('formatos.' + k + '.base');
    if (!numero(x.piso, 0, 1e6) || x.piso > x.base) erros.push('formatos.' + k + '.piso: 0 até a base');
    if (!numero(x.prazo_dias, 1, r.prazo_max_dias || 60)) erros.push('formatos.' + k + '.prazo_dias: até o prazo máximo');
    if (!numero(x.paginas_incluidas, 1, 50)) erros.push('formatos.' + k + '.paginas_incluidas');
    if (typeof x.nome !== 'string' || !x.nome) erros.push('formatos.' + k + '.nome');
  }
  const a = r.adicionais || {};
  if (!objeto(a)) erros.push('adicionais: objeto');
  for (const [k, x] of Object.entries(a)) {
    if (!CHAVE.test(k)) erros.push('adicionais: chave inválida ' + k);
    /* (nulo ou não objeto: erro na lista, não TypeError — a tabela ativa inválida vira "em atualização", não 500) */
    if (!objeto(x)) { erros.push('adicionais.' + k + ': objeto'); continue; }
    if (typeof x.nome !== 'string' || !x.nome) erros.push('adicionais.' + k + '.nome');
    if (x.fora_do_automatico === true) continue;
    if (!numero(x.valor, 0, 1e6)) erros.push('adicionais.' + k + '.valor');
    if (!numero(x.prazo_dias, 0, 30)) erros.push('adicionais.' + k + '.prazo_dias');
    if (!numero(x.max, 1, 100)) erros.push('adicionais.' + k + '.max');
    if (!numero(x.prioridade, 1, 100)) erros.push('adicionais.' + k + '.prioridade');
    /* requer: o adicional só existe junto de um destes (formato ou outro adicional), ex.: a cobrança de anuidade só com a área restrita */
    if (Array.isArray(x.requer) && x.requer.some(r => objeto(a[r]) && numero(a[r].prioridade, 1, 100) && !(x.prioridade > a[r].prioridade))) erros.push('adicionais.' + k + '.prioridade: maior que a da base (' + x.requer.filter(r => objeto(a[r])).join(', ') + '), para entrar depois dela');
    if (x.requer !== undefined && (!Array.isArray(x.requer) || !x.requer.length || x.requer.some(r => !((FORMATOS.includes(r) && objeto(f[r])) || (r !== k && Object.hasOwn(a, r) && objeto(a[r]) && !a[r].fora_do_automatico))))) erros.push('adicionais.' + k + '.requer: formatos ou adicionais automáticos da tabela');
  }
  if (!a.pagina_extra || a.pagina_extra.fora_do_automatico) erros.push('adicionais.pagina_extra: obrigatório');
  /* toda dependência precisa terminar num formato: A exige B e B exige A nunca entraria em fase nenhuma */
  if (objeto(a)) {
    const ok = new Set();
    for (let mudou = true; mudou;) {
      mudou = false;
      for (const [k, x] of Object.entries(a)) if (objeto(x) && !ok.has(k) && (!Array.isArray(x.requer) || x.requer.some(r => FORMATOS.includes(r) || ok.has(r)))) { ok.add(k); mudou = true; }
    }
    for (const [k, x] of Object.entries(a)) if (objeto(x) && !x.fora_do_automatico && !ok.has(k)) erros.push('adicionais.' + k + '.requer: dependência circular, nunca chega a um formato');
  }
  const m = r.multiplicadores || {};
  for (const k of ['urgencia', 'complexidade_alta']) if (!numero(m[k]?.fator, 1, 3)) erros.push('multiplicadores.' + k + '.fator: 1 a 3');
  if (!numero(m.urgencia?.prazo_fator, 0.3, 1)) erros.push('multiplicadores.urgencia.prazo_fator: 0,3 a 1');
  const l = r.limites || {};
  if (!numero(l.valor_max_automatico, 100, 1e7)) erros.push('limites.valor_max_automatico');
  /* o teto do PROJETO (fase 1 + fase seguinte); o de cima vale por fase */
  if (l.valor_max_projeto !== undefined && !numero(l.valor_max_projeto, l.valor_max_automatico || 100, 1e7)) erros.push('limites.valor_max_projeto: de valor_max_automatico a 10 milhões');
  return erros.length ? { erros } : { ok: true };
}

/* ---------- os fatores que o agente escolheu (lista fechada; nada de preço aqui) ---------- */
export function validarFatores(f, regras) {
  const erros = [];
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { erros: ['fatores: esperado um objeto'] };
  for (const k of Object.keys(f)) if (!['formato', 'paginas', 'adicionais', 'urgencia', 'complexidade'].includes(k)) erros.push('campo não permitido: ' + k);
  const disponiveis = FORMATOS.filter(k => objeto(regras.formatos?.[k]));   /* (só os que a tabela ATIVA traz) */
  if (!disponiveis.includes(f.formato)) erros.push('formato: um de ' + disponiveis.join(', '));
  const paginas = f.paginas === undefined ? null : f.paginas;
  if (paginas !== null && !(Number.isInteger(paginas) && paginas >= 1 && paginas <= 60)) erros.push('paginas: inteiro de 1 a 60');
  const adicionais = {};
  for (const [k, q] of Object.entries(f.adicionais || {})) {
    const def = Object.hasOwn(regras.adicionais, k) ? regras.adicionais[k] : null;   /* (constructor, toString…: não são adicionais) */
    if (!def) { erros.push('adicional desconhecido: ' + k); continue; }
    if (!(Number.isInteger(q) && q >= 0)) { erros.push('adicionais.' + k + ': quantidade inteira'); continue; }
    if (q > 0) adicionais[k] = def.fora_do_automatico ? q : Math.min(q, def.max);
  }
  /* o que depende de outro item só entra com ele: o modelo recebe o motivo e ajusta (nunca preço sem a base) */
  for (const k of Object.keys(adicionais)) {
    const req = regras.adicionais[k].requer;
    if (req && !req.some(r => r === f.formato || adicionais[r] > 0)) erros.push(k + ' exige um destes: ' + req.map(r => regras.formatos[r]?.nome || regras.adicionais[r]?.nome || r).join(', '));
  }
  /* decisão do dono (2026-10-12): a landing vai até 3 páginas; de 4 em diante, só o site com várias páginas. Aqui vale
     para todo caminho que calcula preço. As páginas a mais sobrepõem a página extra, como em estimar() */
  const landing = f.formato === 'landing_page' && objeto(regras.formatos?.landing_page) ? regras.formatos.landing_page : null;
  if (landing && !erros.length) {
    const aMais = Math.max(0, (paginas ?? landing.paginas_incluidas) - landing.paginas_incluidas) || (adicionais.pagina_extra || 0);
    if (landing.paginas_incluidas + aMais > LANDING_MAX_PAGINAS) erros.push(LANDING_GRANDE);
  }
  if (f.urgencia !== undefined && typeof f.urgencia !== 'boolean') erros.push('urgencia: sim ou não');
  if (f.complexidade !== undefined && !['normal', 'alta'].includes(f.complexidade)) erros.push('complexidade: normal ou alta');
  if (erros.length) return { erros };
  return { dados: { formato: f.formato, paginas, adicionais, urgencia: f.urgencia === true, complexidade: f.complexidade || 'normal' } };
}

const arredondar = (v, passo) => Math.round(v / passo) * passo;

/* ---------- o cálculo ---------- */
export function estimar(fatoresBrutos, regras) {
  const vr = validarRegras(regras);
  if (vr.erros) throw new Error('regras inválidas: ' + vr.erros.join('; '));
  const vf = validarFatores(fatoresBrutos, regras);
  if (vf.erros) return { erros: vf.erros };
  const f = vf.dados, fmt = regras.formatos[f.formato];

  /* itens fora do automático: não há preço; a conversa vai para o diagnóstico */
  const fora = Object.keys(f.adicionais).filter(k => regras.adicionais[k].fora_do_automatico);
  if (fora.length) {
    return { encaminhar_diagnostico: true, motivo: 'itens que pedem diagnóstico', itens_diagnostico: fora.map(k => ({ chave: k, nome: regras.adicionais[k].nome })) };
  }

  /* as páginas além das incluídas viram o adicional pagina_extra */
  const extras = Math.max(0, (f.paginas || fmt.paginas_incluidas) - fmt.paginas_incluidas);
  const pedidos = Object.entries({ ...f.adicionais, ...(extras ? { pagina_extra: extras } : {}) })
    .map(([k, q]) => ({ chave: k, nome: regras.adicionais[k].nome, qtd: q, unitario: regras.adicionais[k].valor, prazo_unitario: regras.adicionais[k].prazo_dias, prioridade: regras.adicionais[k].prioridade, requer: regras.adicionais[k].requer }))
    .sort((a, b) => a.prioridade - b.prioridade || a.chave.localeCompare(b.chave));

  const urg = f.urgencia ? regras.multiplicadores.urgencia : null;
  const fatorPrazo = urg ? urg.prazo_fator : 1;
  const teto = regras.prazo_max_dias;
  /* cabe no prazo, item a item, na ordem de prioridade; o que não cabe vai para a fase seguinte (por unidade) */
  let prazo = fmt.prazo_dias * fatorPrazo;
  const nestaFase = [], proximaFase = [];
  const naFase = new Set();   /* o que já entrou na fase 1 */
  for (const p of pedidos) {
    /* o que depende de outro item só entra na fase 1 se a base entrou (a importação de usuários sem a área restrita
       não existe); senão vai inteiro para a fase seguinte, junto com a base */
    if (p.requer && !p.requer.some(r => r === f.formato || naFase.has(r))) { proximaFase.push({ ...p }); continue; }
    let cabem = 0;
    for (let i = 0; i < p.qtd; i++) {
      if (prazo + p.prazo_unitario * fatorPrazo <= teto + 1e-9) { prazo += p.prazo_unitario * fatorPrazo; cabem++; } else break;
    }
    if (cabem) { nestaFase.push({ ...p, qtd: cabem }); naFase.add(p.chave); }
    if (p.qtd - cabem > 0) proximaFase.push({ ...p, qtd: p.qtd - cabem });
  }

  const mult = (urg ? urg.fator : 1) * (f.complexidade === 'alta' ? regras.multiplicadores.complexidade_alta.fator : 1);
  const somar = lista => lista.reduce((s, p) => s + p.unitario * p.qtd, 0);
  const bruto = (fmt.base + somar(nestaFase)) * mult;
  const valor = arredondar(Math.max(bruto, fmt.piso), regras.arredondamento);
  const sinal = Math.round(valor * regras.sinal_percentual) / 100;
  const prazoDias = Math.min(teto, Math.max(1, Math.ceil(prazo - 1e-9)));
  const valorFase2 = proximaFase.length ? arredondar(somar(proximaFase) * mult, regras.arredondamento) : 0;
  /* o prazo da fase seguinte também é estimado (pode passar do teto: vira mais de uma fase, cada uma de até o teto) */
  const prazoFase2 = proximaFase.length ? Math.max(1, Math.ceil(proximaFase.reduce((s, p) => s + p.prazo_unitario * p.qtd * fatorPrazo, 0) - 1e-9)) : 0;

  if (valor > regras.limites.valor_max_automatico) {
    return { encaminhar_diagnostico: true, motivo: 'valor acima do limite automático', itens_diagnostico: [] };
  }
  if (regras.limites.valor_max_projeto !== undefined && valor + valorFase2 > regras.limites.valor_max_projeto) {
    return { encaminhar_diagnostico: true, motivo: 'projeto acima do limite automático', itens_diagnostico: [] };
  }
  return {
    formato: { chave: f.formato, nome: fmt.nome, base: fmt.base, paginas_incluidas: fmt.paginas_incluidas },
    itens: nestaFase.map(p => ({ chave: p.chave, nome: p.nome, qtd: p.qtd, valor: p.unitario * p.qtd })),
    multiplicadores: { urgencia: !!urg, complexidade_alta: f.complexidade === 'alta', fator: mult },
    valor_total: valor,
    sinal,
    sinal_percentual: regras.sinal_percentual,
    prazo_dias: prazoDias,
    fase: proximaFase.length ? 'fase1' : 'unica',
    fase_seguinte: proximaFase.length ? { itens: proximaFase.map(p => ({ chave: p.chave, nome: p.nome, qtd: p.qtd })), valor_estimado: valorFase2, prazo_dias: prazoFase2, fases: Math.ceil(prazoFase2 / teto), prazo_max_fase: teto } : null,
    fatores: f
  };
}
