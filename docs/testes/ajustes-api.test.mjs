/* OS AJUSTES SEM IA pela API (PR 3a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §4 e §7): a opção pronta da lista
   fechada (qualquer chave fora dela é 400 antes do banco), desfazer o último, o teto de 30, o pedido livre (até 3, na
   fila, sem IA), cada etapa recusada uma a uma, o pedido encerrado, e a IA nunca chamada (o dublê falha se alguém o
   chamar; sem IA nenhuma, os ajustes funcionam igual). Banco real (PGlite). */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { criarCenario, BASE } from './_ajustes.mjs';
import { PROIBIDAS } from './_opcoes-proibidas.mjs';
import { MAX_SECOES } from '../../api/_vendas/direcao.mjs';

let local, cen;
before(async () => { local = await montarLocal({ base: BASE }); cen = criarCenario(local); });
const ajustesNoBanco = async c => (await local.db.query('select origem, status from app.alteracoes where conversa_id = $1 order by created_at', [c])).rows;
const estimativas = async c => Number((await local.db.query('select count(*) n from app.estimativas where conversa_id = $1', [c])).rows[0].n);
const PALETA_2 = { operacao: 'usar_paleta_de', direcao: 2 };

test('ajustar: as cores do modelo 2 e "Perguntas frequentes" de outro modelo, sem IA e sem mudar o preço; o 1º ajuste trava a troca de modelo', async () => {
  const { n, c, dirs } = await cen.ateEscolher();
  const r = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2 });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(Object.keys(r.corpo).sort(), ['alteracao_id', 'rotulo']);
  assert.equal(r.corpo.rotulo, 'Cores do modelo 2');
  let e = await cen.estado(n, c);
  assert.equal(e.conversa.etapa, 'alteracoes');
  assert.equal(e.versao_final.identidade.paleta.destaque, '#7A3E0B');
  const faq = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'adicionar_secao', secao: 'faq' } });
  assert.equal(faq.status, 200, JSON.stringify(faq.corpo));
  e = await cen.estado(n, c);
  assert.ok(e.versao_final.secoes.some(s => s.tipo === 'faq' && s.titulo === 'Perguntas frequentes'), 'a seção veio do modelo 2, com o texto dele (nunca um espaço reservado)');
  assert.deepEqual(e.alteracoes.map(a => [a.origem, a.status, a.pedido]), [['opcao', 'aplicada', 'Cores do modelo 2'], ['opcao', 'aplicada', 'Com a seção perguntas frequentes']]);
  assert.equal((await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs.find(d => d.numero === 2).id })).status, 409, 'depois do 1º ajuste não dá para trocar de modelo');
  assert.equal(await estimativas(c), 1, 'opção pronta nunca muda o preço');
  assert.equal(cen.contas.ia, 0, 'nenhuma chamada à IA');
});

test('ajustar: sem IA configurada (modo econômico), funciona igual', async () => {
  const { n, c } = await cen.ateEscolher({ ia: null });
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2 })).status, 200);
  assert.equal((await n.chamar('POST', 'desfazer', { conversa_id: c })).status, 200);
  assert.equal((await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Quero o mapa no rodapé' })).status, 200);
});

test('ajustar: a opção que não cabe não grava (422 com frase fixa)', async () => {
  const { n, c } = await cen.ateEscolher();
  for (const [opcao, frase] of [
    [{ operacao: 'usar_paleta_de', direcao: 1 }, /^Esse modelo não está disponível para este ajuste\.$/],   /* (é o escolhido) */
    [{ operacao: 'adicionar_secao', secao: 'galeria' }, /^Essa seção não existe nos outros modelos\.$/],   /* (o espaço reservado de aplicar() não é alcançável) */
    [{ operacao: 'adicionar_secao', secao: 'servicos' }, /^Essa seção já está no seu modelo\.$/],
    [{ operacao: 'remover_secao', secao: 'hero' }, /^Essa seção não pode sair\.$/],
    [{ operacao: 'mover_antes_de', secao: 'hero', referencia: 'contato' }, /^A abertura fica sempre no topo\.$/],
    [{ operacao: 'mover_antes_de', secao: 'galeria', referencia: 'contato' }, /^Essa seção não existe no seu modelo\.$/]
  ]) {
    const r = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao });
    assert.equal(r.status, 422, JSON.stringify(opcao) + ' → ' + JSON.stringify(r.corpo));
    assert.match(r.corpo.erro, frase);
  }
  assert.deepEqual(await ajustesNoBanco(c), [], 'nada gravado');
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'remover_secao', secao: 'depoimentos' } })).status, 200);
  const curta = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'remover_secao', secao: 'servicos' } });
  assert.equal(curta.status, 422);
  assert.equal(curta.corpo.erro, 'O site precisa de pelo menos três seções.');
});

test('ajustar: cores, fontes e seção só vêm de modelo PRONTO da geração atual e que não é o escolhido (o servidor confere, não só a forma)', async () => {
  const { n, c } = await cen.ateEscolher();
  /* o modelo 3 não ficou pronto (falhou): dele não saem cores, fontes nem a seção "Equipe" (que só ele tem).
     (Esta conferência é da API; o banco, por si, só confere que o modelo escolhido é o mesmo da gravação: o teste prova
     o comportamento de ponta a ponta) */
  await local.db.query("update app.direcoes set status = 'falhou' where conversa_id = $1 and numero = 3", [c]);
  for (const [opcao, frase] of [
    [{ operacao: 'usar_paleta_de', direcao: 3 }, /^Esse modelo não está disponível para este ajuste\.$/],
    [{ operacao: 'usar_tipografia_de', direcao: 3 }, /^Esse modelo não está disponível para este ajuste\.$/],
    [{ operacao: 'usar_tipografia_de', direcao: 1 }, /^Esse modelo não está disponível para este ajuste\.$/],
    [{ operacao: 'adicionar_secao', secao: 'equipe' }, /^Essa seção não existe nos outros modelos\.$/]
  ]) {
    const r = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao });
    assert.equal(r.status, 422, JSON.stringify(opcao) + ' → ' + JSON.stringify(r.corpo));
    assert.match(r.corpo.erro, frase);
  }
  assert.deepEqual(await ajustesNoBanco(c), [], 'nada gravado');
  /* e o que continua pronto segue funcionando */
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'usar_tipografia_de', direcao: 2 } })).status, 200);
  assert.equal(cen.contas.ia, 0);
});

test('ajustar: com 12 seções (o máximo) acrescentar outra é 422 com frase fixa, nada se grava e nenhum ajuste é gasto; tirar uma abre a vaga', async () => {
  const { n, c } = await cen.ateEscolher();
  /* o modelo 1 com 12 seções, sem "faq" nem "equipe" (que só os outros modelos têm) */
  const tipos = ['hero', 'servicos', 'depoimentos', 'contato', 'sobre', 'diferenciais', 'processo', 'numeros', 'galeria', 'cta', 'destaque', 'localizacao'];
  assert.equal(tipos.length, MAX_SECOES, 'o teste monta o máximo do servidor');
  const atual = (await local.db.query('select conteudo from app.direcoes where conversa_id = $1 and numero = 1', [c])).rows[0].conteudo;
  const cheio = { ...atual, secoes: tipos.map(tipo => ({ tipo, variante: 'lista', rotulo: '', titulo: 'Seção ' + tipo, subtitulo: '', texto: '', itens: [], cta: '' })) };
  await local.db.query('update app.direcoes set conteudo = $1::jsonb where conversa_id = $2 and numero = 1', [JSON.stringify(cheio), c]);
  const r = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'adicionar_secao', secao: 'faq' } });
  assert.equal(r.status, 422, JSON.stringify(r.corpo));
  assert.equal(r.corpo.erro, 'O site já tem o máximo de seções. Tire uma antes.');
  assert.deepEqual(await ajustesNoBanco(c), [], 'nada gravado: o contrato não fala de uma seção que não existe');
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'remover_secao', secao: 'localizacao' } })).status, 200);
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'adicionar_secao', secao: 'faq' } })).status, 200);
  const e = await cen.estado(n, c);
  assert.equal(e.versao_final.secoes.length, MAX_SECOES);
  assert.ok(e.versao_final.secoes.some(s => s.tipo === 'faq'), 'a seção entrou');
});

test('ajustar: se a versão mudou entre a leitura e a gravação (outra aba, ou o "feito" do dono), 409 e nada se perde', async () => {
  let antesDeGravar = null;
  /* o banco do cenário, com um gancho: logo antes desta gravação, "outra aba" grava um ajuste sobre a mesma versão */
  const banco = async (nome, p) => {
    if (nome === 'vendas_registrar_alteracao' && antesDeGravar) { const f = antesDeGravar; antesDeGravar = null; await f(p); }
    return local.rpc(nome, p);
  };
  const { n, c } = await cen.ateEscolher({ banco });
  antesDeGravar = p => local.rpc('vendas_registrar_alteracao', { ...p, pedido: 'Fontes do modelo 2' });
  const r = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2 });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(r.corpo.erro, 'Sua versão mudou enquanto você ajustava (outra aba ou a Beyon Zero). Confira e tente de novo.');
  assert.deepEqual((await cen.estado(n, c)).alteracoes.map(a => a.pedido), ['Fontes do modelo 2'], 'a gravação da outra aba ficou; a velha não passou por cima');
});

test('ajustar: lista fechada — operação de fora, campo a mais, valor livre ou formato errado é 400 sem tocar no banco', async () => {
  const { n, c } = await cen.ateEscolher();
  const antes = cen.contas.banco;
  for (const opcao of PROIBIDAS) {
    const r = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao });
    assert.equal(r.status, 400, JSON.stringify(opcao) + ' → ' + JSON.stringify(r.corpo));
  }
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2, pedido: 'e um desconto' })).status, 400, 'campo a mais no corpo');
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: 'x', opcao: PALETA_2 })).status, 400);
  assert.equal(cen.contas.banco, antes, 'nenhuma chamada ao banco');
});

test('desfazer: volta a versão anterior; o desfeito sai da versão final; sem nada para desfazer, 409', async () => {
  const { n, c, dirs } = await cen.ateEscolher();
  assert.equal((await n.chamar('POST', 'desfazer', { conversa_id: c })).status, 409, 'na etapa "escolhida" não há o que desfazer');
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2 })).status, 200);
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: { operacao: 'mover_depois_de', secao: 'servicos', referencia: 'depoimentos' } })).status, 200);
  assert.equal((await n.chamar('POST', 'desfazer', { conversa_id: c })).status, 200);
  let e = await cen.estado(n, c);
  assert.equal(e.versao_final.identidade.paleta.destaque, '#7A3E0B', 'a paleta fica');
  const ordem = e.versao_final.secoes.map(s => s.tipo);
  assert.ok(ordem.indexOf('servicos') < ordem.indexOf('depoimentos'), 'a ordem volta: ' + ordem.join());
  assert.deepEqual(e.alteracoes.map(a => a.status), ['aplicada', 'desfeita']);
  assert.equal(e.pode_desfazer, true);
  assert.equal((await n.chamar('POST', 'desfazer', { conversa_id: c })).status, 200);
  e = await cen.estado(n, c);
  assert.equal(e.versao_final, null);
  assert.equal(e.pode_desfazer, false, 'a tela esconde o botão pelo estado');
  assert.equal(e.conversa.etapa, 'alteracoes', 'a troca de modelo continua travada');
  assert.equal((await n.chamar('POST', 'escolher', { conversa_id: c, direcao_id: dirs.find(d => d.numero === 2).id })).status, 409);
  const nada = await n.chamar('POST', 'desfazer', { conversa_id: c });
  assert.equal(nada.status, 409);
  assert.equal(nada.corpo.erro, 'Não há ajuste para desfazer.');
  assert.equal(cen.contas.ia, 0);
});

test('desfazer: o último ajuste da Beyon Zero (pedido livre feito) não se desfaz pelo botão do cliente', async () => {
  const { n, c } = await cen.ateEscolher();
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2 })).status, 200);
  const livre = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Quero o mapa no rodapé' });
  assert.equal(livre.status, 200, JSON.stringify(livre.corpo));
  /* o dono faz o pedido: a versão nova (aplicada agora) vale mais que a opção pronta anterior */
  const e0 = await cen.estado(n, c);
  const feito = await local.rpc('vendas_resolver_pedido_livre', { org_slug: 'beyon-zero', alteracao_id: livre.corpo.alteracao_id, acao: 'feito', base_id: e0.ajuste_atual, resultado: e0.versao_final });
  assert.equal(feito.ok, true, JSON.stringify(feito));
  assert.equal((await cen.estado(n, c)).pode_desfazer, false);
  const r = await n.chamar('POST', 'desfazer', { conversa_id: c });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(r.corpo.erro, 'O último ajuste foi da Beyon Zero; escreva um pedido.');
});

test('teto: 30 ajustes por pedido (aplicados e desfeitos contam); o 31º é 409 com a frase fixa e o WhatsApp', async () => {
  const { n, c } = await cen.ateEscolher();
  /* (desfazer não apaga a linha: 30 ajustes desfeitos são 30 linhas. São 61 chamadas mais as ~7 do cenário, abaixo do freio
     geral de 90 por minuto por IP de api/vendas.mjs) */
  for (let i = 0; i < 30; i++) {
    assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2 })).status, 200, 'ajuste ' + (i + 1));
    assert.equal((await n.chamar('POST', 'desfazer', { conversa_id: c })).status, 200);
  }
  const r = await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2 });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(r.corpo.erro, 'Você chegou ao limite de 30 ajustes neste pedido. Para mudar mais, fale com a Beyon Zero pelo WhatsApp.');
  assert.equal(r.corpo.whatsapp, true);
});

test('pedido livre: até 3, curto, redigido, numa linha, na fila e sem IA; o 4º é 409; o resumo só conta, sem o texto', async () => {
  const { n, c } = await cen.ateEscolher();
  for (const texto of [undefined, '', '   ', 123, 'a'.repeat(301), 'a@b.co '.repeat(40)]) {
    const r = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto });
    assert.equal(r.status, 400, String(JSON.stringify(texto)).slice(0, 40) + ' → ' + JSON.stringify(r.corpo));
  }
  assert.equal((await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'oi', extra: 1 })).status, 400, 'campo a mais');
  const r = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Quero o mapa da clínica\n\nno rodapé, meu e-mail é ana@exemplo.com' });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.restantes, 2);
  assert.deepEqual(Object.keys(r.corpo).sort(), ['alteracao_id', 'restantes']);
  const linha = (await local.db.query('select pedido, status, origem, mudancas from app.alteracoes where id = $1', [r.corpo.alteracao_id])).rows[0];
  assert.deepEqual(linha, { pedido: 'Quero o mapa da clínica no rodapé, meu e-mail é [e-mail]', status: 'na_fila', origem: 'livre', mudancas: [] });
  assert.equal((await cen.estado(n, c)).conversa.etapa, 'alteracoes', 'o pedido livre também trava a troca de modelo');
  assert.equal((await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Segundo pedido' })).corpo.restantes, 1);
  assert.equal((await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Terceiro pedido' })).corpo.restantes, 0);
  /* (o banco também recusa o 4º com 23514: o teste prova o comportamento, não só a camada da API) */
  const quarto = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Quarto pedido' });
  assert.equal(quarto.status, 409);
  assert.equal(quarto.corpo.erro, 'Você já fez os 3 pedidos escritos deste orçamento. Para mais, fale com a Beyon Zero pelo WhatsApp.');
  const esc = await n.chamar('POST', 'escopo', { conversa_id: c });
  assert.equal(esc.status, 200, JSON.stringify(esc.corpo));
  assert.ok(esc.corpo.escopo.includes('- Pedidos escritos: 3 não incluídos neste valor (aguardando ou recusados).'), esc.corpo.escopo);
  assert.ok(!esc.corpo.escopo.includes('Quero o mapa') && !esc.corpo.escopo.includes('Segundo pedido'), 'o texto da pessoa fica fora do contrato');
  assert.equal(cen.contas.ia, 0, 'pedido livre nunca chama IA');
});

test('pedido livre: caractere de controle (tabulação, DEL, C1) vira espaço; nunca vira erro do banco', async () => {
  const { n, c } = await cen.ateEscolher();
  const r = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Quero\to\x7fmapa\x85no' + String.fromCharCode(0x2028, 0x2029) + 'rodapé' });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal((await local.db.query('select pedido from app.alteracoes where id = $1', [r.corpo.alteracao_id])).rows[0].pedido, 'Quero o mapa no rodapé');
});

test('pedido livre: dado pessoal separado por DEL, C1 ou linhas em branco também é redigido (normaliza antes e depois de redigir)', async () => {
  const { n, c } = await cen.ateEscolher();
  const casos = [
    ['Meu CPF é 123\x7f456\x7f789\x7f09, obrigado', /\[documento\]/, /123|789/],
    ['Ligue para 21\n\n98765-4321 amanhã', /\[telefone\]/, /98765|4321/]
  ];
  for (const [texto, esperado, proibido] of casos) {
    const r = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const gravado = (await local.db.query('select pedido from app.alteracoes where id = $1', [r.corpo.alteracao_id])).rows[0].pedido;
    assert.match(gravado, esperado, gravado);
    assert.doesNotMatch(gravado, proibido, gravado);
  }
});

test('pedido livre: caracteres invisíveis (formato, uso privado, substituto solto) saem na entrada; só eles = texto vazio', async () => {
  const { n, c } = await cen.ateEscolher();
  const etiqueta = String.fromCodePoint(0xe0041, 0xe0042);   /* "tag characters" (U+E0000 a E007F), que não aparecem na tela */
  const invisiveis = String.fromCharCode(0x206a, 0x061c, 0x180e, 0xfff9, 0xe000);
  const solto = String.fromCharCode(0xd800);   /* substituto sem par */
  const r = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Quero' + etiqueta + ' o' + invisiveis + ' mapa' + solto });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal((await local.db.query('select pedido from app.alteracoes where id = $1', [r.corpo.alteracao_id])).rows[0].pedido, 'Quero o mapa');
  for (const texto of [etiqueta, invisiveis, solto, etiqueta + ' ' + invisiveis]) {
    const v = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto });
    assert.equal(v.status, 400, JSON.stringify(v.corpo));
    assert.equal(v.corpo.erro, 'Escreva o pedido em até 300 caracteres.');
  }
});

test('etapas: as três ações recusadas uma a uma fora das etapas de ajuste, sem gravar nada; conversa de outro visitante é 404', async () => {
  const { n, c } = await cen.ateEscolher();
  const ACOES = [['ajustar', { conversa_id: c, opcao: PALETA_2 }], ['desfazer', { conversa_id: c }], ['pedido-livre', { conversa_id: c, texto: 'Quero o mapa' }]];
  const ANTES_DA_ESCOLHA = ['descoberta', 'estimativa', 'contato', 'gerando', 'direcoes'];
  for (const etapa of [...ANTES_DA_ESCOLHA, 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada']) {
    await cen.forcarEtapa(c, etapa);
    /* antes da escolha a frase é "escolha um modelo"; depois do resumo, "ajustes fechados" (cada etapa, a sua frase) */
    const frase = ANTES_DA_ESCOLHA.includes(etapa) ? 'Escolha um modelo antes.' : 'Os ajustes desta proposta já foram fechados.';
    for (const [acao, corpo] of ACOES) {
      const r = await n.chamar('POST', acao, corpo);
      assert.equal(r.status, 409, etapa + ' ' + acao + ': ' + JSON.stringify(r.corpo));
      assert.equal(r.corpo.erro, frase, etapa + ' ' + acao);
    }
  }
  assert.deepEqual(await ajustesNoBanco(c), [], 'nada gravado em nenhuma etapa');
  const outro = cen.navegador();
  await outro.iniciar();
  for (const [acao, corpo] of ACOES) assert.equal((await outro.chamar('POST', acao, corpo)).status, 404, acao);
});

test('pedido descartado: ajustar, desfazer e pedido-livre dizem "encerrado" com o WhatsApp', async () => {
  const { n, c } = await cen.ateEscolher();
  assert.equal((await cen.painelPost({ descartar_pedido: c })).status, 200);
  for (const [acao, corpo] of [['ajustar', { conversa_id: c, opcao: PALETA_2 }], ['desfazer', { conversa_id: c }], ['pedido-livre', { conversa_id: c, texto: 'Quero o mapa' }]]) {
    const r = await n.chamar('POST', acao, corpo);
    assert.equal(r.status, 409, acao);
    assert.match(r.corpo.erro, /^Este pedido foi encerrado\./, acao);
    assert.equal(r.corpo.whatsapp, true, acao);
  }
});

test('pedido arquivado (resolvido por fora): o pedido livre vai para o WhatsApp; a opção pronta continua', async () => {
  const { n, c } = await cen.ateEscolher();
  assert.equal((await cen.painelPost({ arquivar_pedido: c })).status, 200);
  const r = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Quero o mapa' });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(r.corpo.erro, 'Este pedido segue com a Beyon Zero pelo WhatsApp: escreva por lá o que quer mudar.');
  assert.equal(r.corpo.whatsapp, true);
  assert.deepEqual(await ajustesNoBanco(c), [], 'nada ficou "aguardando" para sempre');
  assert.equal((await n.chamar('POST', 'ajustar', { conversa_id: c, opcao: PALETA_2 })).status, 200);
});

test('pedido livre: o dono arquivou entre a leitura e a gravação (55000 do banco) e a pessoa recebe a frase do WhatsApp, não a genérica de etapa', async () => {
  let antesDeGravar = null;
  const banco = async (nome, p) => {
    if (nome === 'vendas_pedido_livre' && antesDeGravar) { const f = antesDeGravar; antesDeGravar = null; await f(); }
    return local.rpc(nome, p);
  };
  const { n, c } = await cen.ateEscolher({ banco });
  antesDeGravar = () => cen.painelPost({ arquivar_pedido: c });
  const r = await n.chamar('POST', 'pedido-livre', { conversa_id: c, texto: 'Quero o mapa' });
  assert.equal(r.status, 409, JSON.stringify(r.corpo));
  assert.equal(r.corpo.erro, 'Este pedido segue com a Beyon Zero pelo WhatsApp: escreva por lá o que quer mudar.');
  assert.equal(r.corpo.whatsapp, true);
  assert.deepEqual(await ajustesNoBanco(c), [], 'nada ficou "aguardando"');
});

test('a ação antiga "alterar" (o ajuste pela IA) não existe mais: 404 antes de qualquer coisa', async () => {
  const { n, c } = await cen.ateEscolher();
  const antes = cen.contas.banco;
  const r = await n.chamar('POST', 'alterar', { conversa_id: c, pedido: 'quero a cor da primeira' });
  assert.equal(r.status, 404, JSON.stringify(r.corpo));
  assert.equal(r.corpo.erro, 'Ação inválida.');
  assert.equal(cen.contas.banco, antes, 'nem tocou no banco');
  assert.equal(cen.contas.ia, 0, 'nem chamou a IA');
});
