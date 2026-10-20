/* as opções que a lista fechada recusa (PR 3a): fora da lista, campo a mais ou a menos, valor livre, formato errado e nome
   herdado do Object.prototype. A mesma lista no teste da função (opcoes.test.mjs) e no da API (ajustes-api.test.mjs) */
export const PROIBIDAS = Object.freeze([
  { operacao: 'cor', campo: 'destaque', valor: '#FF0000' }, { operacao: 'tipografia', campo: 'titulos', valor: 'serif_moderna' },
  { operacao: 'tema', valor: 'escuro' }, { operacao: 'trocar_texto', secao: 'hero', campo: 'titulo', valor: 'Grátis' },
  { operacao: 'trocar_cta_menu', valor: 'Compre' }, { operacao: 'adicional', campo: 'blog', valor: '1' }, { operacao: 'paginas', valor: '9' },
  { operacao: 'outro' }, { operacao: 'usar_paleta_de', direcao: 2, valor: '#000000' }, { operacao: 'usar_paleta_de', direcao: '2' },
  { operacao: 'usar_paleta_de', direcao: 4 }, { operacao: 'usar_paleta_de', direcao: 0 }, { operacao: 'usar_paleta_de', direcao: 1.5 },
  { operacao: 'usar_paleta_de' }, { operacao: 'mover_antes_de', secao: 'faq' }, { operacao: 'mover_antes_de', secao: 'faq', referencia: 'faq' },
  { operacao: 'mover_depois_de', secao: 'faq', referencia: 'blog' }, { operacao: 'remover_secao', secao: 'constructor' },
  { operacao: 'adicionar_secao', secao: '__proto__' }, { operacao: 'adicionar_secao', secao: 'faq', referencia: 'hero' },
  { operacao: 'constructor' }, { operacao: 'toString' }, null, 'usar_paleta_de', [], {}
]);
