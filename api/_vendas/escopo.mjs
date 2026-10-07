/* ==========================================================================
   O ESCOPO FINAL (Fase 2, etapa 9): direção escolhida + alterações + escopo
   + investimento + prazo, montado pelo CÓDIGO a partir da estimativa gravada
   e da direção final — sem modelo de IA (não há o que inventar aqui). O texto
   vira app.propostas.escopo; o valor é o da última estimativa (o banco
   confere, app.vendas_apresentar_escopo).
   ========================================================================== */
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ROTULO = { conversao: 'Conversão', autoridade: 'Autoridade', experiencia: 'Experiência' };
/* o nome que o cliente lê (o tipo técnico fica só nos dados) */
const NOME_SECAO = { hero: 'abertura', servicos: 'serviços', sobre: 'sobre', diferenciais: 'diferenciais', processo: 'como funciona', depoimentos: 'depoimentos', numeros: 'números', galeria: 'galeria', faq: 'perguntas frequentes', cta: 'chamada para contato', contato: 'contato', equipe: 'equipe', destaque: 'destaque', localizacao: 'localização' };

const NOME_OP = { usar_paleta_de: 'cores da direção', usar_tipografia_de: 'fontes da direção', cor: 'cor', tipografia: 'fontes', tema: 'tema',
  mover_antes_de: 'seção movida', mover_depois_de: 'seção movida', remover_secao: 'seção removida', adicionar_secao: 'seção adicionada',
  trocar_texto: 'texto trocado', trocar_cta_menu: 'botão do menu trocado', adicional: 'item adicionado', paginas: 'número de páginas' };
const CAMPO_SEGURO = /^[a-z_]{1,40}$/;
/* a chave vem do modelo: só nomes próprios da tabela ("constructor" herdado escreveria "[native code]" no contrato) */
const daTabela = (tabela, chave) => (typeof chave === 'string' && Object.hasOwn(tabela, chave) ? tabela[chave] : undefined);
function linhaAlteracao(a) {
  const partes = [daTabela(NOME_OP, a.operacao) || 'ajuste'];
  if (a.operacao === 'usar_paleta_de' || a.operacao === 'usar_tipografia_de') { if (Number.isInteger(a.direcao)) partes[0] += ' ' + a.direcao; }
  if (daTabela(NOME_SECAO, a.secao)) partes.push(daTabela(NOME_SECAO, a.secao));
  if (a.operacao === 'cor' && /^#[0-9a-fA-F]{6}$/.test(a.valor || '')) partes.push(a.valor);
  if (a.operacao === 'tema' && ['claro', 'escuro'].includes(a.valor)) partes.push(a.valor);
  if (a.operacao === 'paginas' && /^\d{1,2}$/.test(a.valor || '')) partes.push(a.valor);
  if (a.operacao === 'adicional' && CAMPO_SEGURO.test(a.campo || '')) partes.push(a.campo.replace(/_/g, ' '));
  return partes.join(': ');
}

export function montarEscopo({ estimativa, direcao, alteracoesAplicadas, briefing }) {
  const nome = briefing?.negocio?.nome || briefing?.negocio?.segmento || 'seu negócio';
  const titulo = (estimativa.formato?.nome || 'Site') + ' — ' + nome;
  const linhas = [];
  linhas.push('DIREÇÃO ESCOLHIDA: ' + (direcao.nome_conceito || 'Direção') + ' (' + (daTabela(ROTULO, direcao.estrategia) || direcao.estrategia) + ')');
  linhas.push('Seções: ' + direcao.secoes.map(s => daTabela(NOME_SECAO, s.tipo) || s.tipo).join(', ') + '.');
  if (alteracoesAplicadas?.length) {
    linhas.push('', 'ALTERAÇÕES PEDIDAS');
    /* só campos de lista fechada: o texto livre do modelo (descricao) nunca entra no contrato */
    for (const a of alteracoesAplicadas) linhas.push('- ' + linhaAlteracao(a));
  }
  linhas.push('', 'ESCOPO');
  linhas.push('- ' + estimativa.formato.nome + ' com até ' + Math.max(estimativa.formato.paginas_incluidas, estimativa.fatores?.paginas || 0) + ' página(s).');
  for (const i of estimativa.itens || []) if (i.chave !== 'pagina_extra') linhas.push('- ' + i.nome + (i.qtd > 1 ? ' (' + i.qtd + ')' : '') + '.');
  if (estimativa.multiplicadores?.urgencia) linhas.push('- Entrega com urgência.');
  if (estimativa.fase === 'fase1' && estimativa.fase_seguinte) {
    linhas.push('', 'FICA PARA A FASE SEGUINTE (orçada à parte, sem compromisso agora)');
    for (const i of estimativa.fase_seguinte.itens) linhas.push('- ' + i.nome + (i.qtd > 1 ? ' (' + i.qtd + ')' : '') + '.');
  }
  linhas.push('', 'INVESTIMENTO: ' + brl(estimativa.valor_total) + ' — ' + estimativa.sinal_percentual + '% para começar (' + brl(estimativa.sinal) + ') e o restante na entrega.');
  linhas.push('PRAZO: até ' + estimativa.prazo_dias + ' dias, contados do sinal pago e do material recebido.');
  linhas.push('', 'Os textos, imagens e dados de prova social marcados como espaço reservado nas prévias são preenchidos com o material real do cliente.');
  return { titulo: titulo.slice(0, 160), escopo: linhas.join('\n').slice(0, 20000) };
}
