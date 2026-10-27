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
export const NOME_SECAO = { hero: 'abertura', servicos: 'serviços', sobre: 'sobre', diferenciais: 'diferenciais', processo: 'como funciona', depoimentos: 'depoimentos', numeros: 'números', galeria: 'galeria', faq: 'perguntas frequentes', cta: 'chamada para contato', contato: 'contato', equipe: 'equipe', destaque: 'destaque', localizacao: 'localização' };

const NOME_OP = { usar_paleta_de: 'cores da direção', usar_tipografia_de: 'fontes da direção', cor: 'cor', tipografia: 'fontes', tema: 'tema',
  mover_antes_de: 'seção movida', mover_depois_de: 'seção movida', remover_secao: 'seção removida', adicionar_secao: 'seção adicionada',
  trocar_texto: 'texto trocado', trocar_cta_menu: 'botão do menu trocado', adicional: 'item adicionado', paginas: 'número de páginas' };
/* a chave vem do modelo: só nomes próprios da tabela ("constructor" herdado escreveria "[native code]" no contrato) */
const daTabela = (tabela, chave) => (typeof chave === 'string' && Object.hasOwn(tabela, chave) ? tabela[chave] : undefined);
/* o nome de operação que pode ir para a tela ou o contrato: só os da lista fechada; o resto é "outro" (revisão de
   segurança do lote 1, auditoria 2026-10-09) */
export const operacaoConhecida = op => (daTabela(NOME_OP, op) ? op : 'outro');
/* chave → nome dos adicionais que a TABELA de preços reconheceu na estimativa (nesta fase e na seguinte). O "campo" de
   um ajuste de adicional vem do modelo: só vira texto se a tabela o tem, e pelo nome da tabela */
export function nomesDosItens(estimativa) {
  const itens = [...(estimativa?.itens || []), ...(estimativa?.fase_seguinte?.itens || [])];
  return new Map(itens.filter(i => i && typeof i.chave === 'string' && typeof i.nome === 'string').map(i => [i.chave, i.nome]));
}
/* (também a frase de um ajuste antigo no resumo; o rótulo das opções prontas é de opcoes.mjs) */
export function linhaAlteracao(a, adicionais = new Map()) {
  const partes = [daTabela(NOME_OP, a.operacao) || 'ajuste'];
  if (a.operacao === 'usar_paleta_de' || a.operacao === 'usar_tipografia_de') { if (Number.isInteger(a.direcao)) partes[0] += ' ' + a.direcao; }
  if (daTabela(NOME_SECAO, a.secao)) partes.push(daTabela(NOME_SECAO, a.secao));
  if (a.operacao === 'cor' && /^#[0-9a-fA-F]{6}$/.test(a.valor || '')) partes.push(a.valor);
  if (a.operacao === 'tema' && ['claro', 'escuro'].includes(a.valor)) partes.push(a.valor);
  if (a.operacao === 'paginas' && /^\d{1,2}$/.test(a.valor || '')) partes.push(a.valor);
  if (a.operacao === 'adicional' && adicionais.has(a.campo)) partes.push(adicionais.get(a.campo));
  return partes.join(': ');
}

/* (PR 3a) os pedidos livres no resumo: só uma linha FIXA do código, com as contas. O texto da pessoa nunca entra no
   contrato (spec §7, "pedido livre fora do contrato"): a proposta fica imutável depois de enviada, a retenção não a limpa
   e a privacidade promete apagar os pedidos de ajuste em 2 meses. O texto de cada pedido aparece só na tela */
export function linhaDosPedidosLivres(pedidosLivres) {
  const conta = s => (pedidosLivres || []).filter(p => p && p.status === s).length;
  const feitos = conta('aplicada'), fora = conta('na_fila') + conta('recusada');
  if (!feitos && !fora) return null;
  const partes = [];
  if (feitos) partes.push(feitos + (feitos === 1 ? ' feito' : ' feitos') + ' pela Beyon Zero');
  if (fora) partes.push(fora + (fora === 1 ? ' não incluído neste valor (aguardando ou recusado)' : ' não incluídos neste valor (aguardando ou recusados)'));
  return '- Pedidos escritos: ' + partes.join(', ') + '.';
}

export function montarEscopo({ estimativa, direcao, alteracoesAplicadas, briefing, pedidosLivres = [] }) {
  const nome = briefing?.negocio?.nome || briefing?.negocio?.segmento || 'seu negócio';
  const titulo = (estimativa.formato?.nome || 'Site') + ' — ' + nome;
  const linhas = [];
  linhas.push('DIREÇÃO ESCOLHIDA: ' + (direcao.nome_conceito || 'Direção') + ' (' + (daTabela(ROTULO, direcao.estrategia) || direcao.estrategia) + ')');
  linhas.push('Seções: ' + direcao.secoes.map(s => daTabela(NOME_SECAO, s.tipo) || s.tipo).join(', ') + '.');
  /* adicional que a tabela não reconheceu nesta estimativa não entra no contrato (nem como "item adicionado" vazio) */
  const adicionais = nomesDosItens(estimativa);
  const aplicadas = (alteracoesAplicadas || []).filter(a => a.operacao !== 'adicional' || adicionais.has(a.campo));
  if (aplicadas.length) {
    linhas.push('', 'ALTERAÇÕES PEDIDAS');
    /* só campos de lista fechada: o texto livre do modelo (descricao) nunca entra no contrato */
    for (const a of aplicadas) linhas.push('- ' + linhaAlteracao(a, adicionais));
  }
  const pedidosEscritos = linhaDosPedidosLivres(pedidosLivres);
  if (pedidosEscritos) linhas.push('', 'PEDIDOS ESCRITOS', pedidosEscritos);
  linhas.push('', 'ESCOPO');
  linhas.push('- ' + estimativa.formato.nome + ' com até ' + Math.max(estimativa.formato.paginas_incluidas, estimativa.fatores?.paginas || 0) + ' página(s).');
  for (const i of estimativa.itens || []) if (i.chave !== 'pagina_extra') linhas.push('- ' + i.nome + (i.qtd > 1 ? ' (' + i.qtd + ')' : '') + '.');
  if (estimativa.multiplicadores?.urgencia) linhas.push('- Entrega com urgência.');
  if (estimativa.fase === 'fase1' && estimativa.fase_seguinte) {
    linhas.push('', 'FICA PARA A FASE SEGUINTE (orçada à parte, sem compromisso agora' + (estimativa.fase_seguinte.prazo_dias ? '; prazo estimado de ' + estimativa.fase_seguinte.prazo_dias + ' dias úteis' + (estimativa.fase_seguinte.fases > 1 ? ', em ' + estimativa.fase_seguinte.fases + ' fases de até ' + estimativa.fase_seguinte.prazo_max_fase + ' dias úteis cada, contados do início de cada uma' : ', contados do início dela') : '') + ')');
    for (const i of estimativa.fase_seguinte.itens) linhas.push('- ' + i.nome + (i.qtd > 1 ? ' (' + i.qtd + ')' : '') + '.');
  }
  linhas.push('', 'INVESTIMENTO: ' + brl(estimativa.valor_total) + ' — ' + estimativa.sinal_percentual + '% para começar (' + brl(estimativa.sinal) + ') e o restante quando o site estiver no ar.');
  linhas.push('PRAZO: até ' + estimativa.prazo_dias + ' dias úteis, contados do sinal pago e do material recebido. Sábado, domingo e feriado nacional não contam. Enquanto espero a sua lista de ajustes, o prazo fica parado.');   /* (úteis: decisão do dono de 21/10, que revê a de 09/10; o prazo parado é a D4 de 21/10) */
  /* (PR 3b-3a, MÉDIO-3 do 3b-1) as outras regras da D4 que a Beyon vai aplicar: o cliente as confirma aqui, em "Li e confirmo". O texto é o de /condicoes, literal da captação (decisão do dono de 22/10; o teste de coerência confere) */
  linhas.push('MATERIAL: Nada vai ao ar sem o seu material e a sua autorização: enquanto ele não chegar, eu aviso que estou aguardando e o projeto fica parado.');
  linhas.push('AJUSTES: 2 listas de ajuste na prévia (uma lista é o conjunto de pedidos que você manda de uma vez). O que passar das duas listas é orçado à parte.');
  linhas.push('RESTANTE: você paga o restante por Pix quando o site estiver no ar. Se o restante não for pago em 3 dias depois do meu aviso de que o site está no ar, ele sai do ar até o pagamento. Antes disso eu lembro duas vezes, no segundo e no terceiro dia.');
  linhas.push('ATRASO: se eu não entregar no prazo combinado, devolvo a entrada inteira, mesmo depois dos 7 dias.');
  linhas.push('', 'Os textos, imagens e dados de prova social marcados como espaço reservado nas prévias são preenchidos com o material real do cliente.');
  return { titulo: titulo.slice(0, 160), escopo: linhas.join('\n').slice(0, 20000) };
}
