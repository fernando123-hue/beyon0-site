/* OS TOQUES NA CONVERSA (js/orcamento-toques.js; spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §1–§4), num DOM de mentira mínimo:
   os passos fixos, as pendentes que seguem com a 1ª mensagem, o valor retido e liberado, o modo sem consultor, a dor que volta se o envio não
   entrou, o "Mudar" (inclusive na conversa retomada), a falha que vira fala e o foco que nunca se perde. O comportamento na página real é provado
   pelo E2E (docs/e2e-orcamento.mjs, com e sem consultor). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarConversa, tique, puro } from './_dom-falso.mjs';

const montar = o => montarConversa(o);
const ate = async (p, ...toques) => { for (const t of toques) { p.tocar(t); await tique(); } };
const ATE_DOR = ['Saúde', 'Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho', 'Só eu'];

test('os passos fixos: cada toque vira a bolha da pessoa, pede a conta (o radar) e traz a próxima fala, anunciada e rotulando o grupo', async () => {
  const p = montar();
  p.T.iniciar({ consultor: true });
  assert.equal(p.abertos().length, 1, 'o 1º grupo (o ramo), logo abaixo da abertura fixa');
  await ate(p, 'Saúde');
  assert.deepEqual(p.bolhas(), ['Saúde']);
  assert.deepEqual(p.definidos.at(-1), { ramo: 'saude', objetivos: [] });
  assert.match(p.falas().at(-1), /precisa trazer/);
  assert.ok(p.anuncios.some(a => /^Zero: E o que o site precisa trazer/.test(a)), 'a fala nova é anunciada');
  const grupo = p.abertos()[0].querySelector('div');
  const rotulo = grupo.getAttribute('aria-labelledby');
  assert.ok(rotulo && p.doc.getElementById(rotulo).textContent === p.falas().at(-1), 'o grupo é rotulado pela própria fala');
  await ate(p, 'Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho');
  assert.match(p.falas().at(-1), /quantas pessoas trabalham/i, 'depois do material, a equipe (dono 27/11)');
  await ate(p, 'Só eu');
  assert.deepEqual(p.bolhas(), ['Saúde', 'Agendamentos', 'Só o Instagram', 'Tenho', 'Só eu']);
  assert.match(p.falas().at(-1), /como os clientes chegam/);
});

test('pendentes: os toques (e, no passo da dor, responde dor e as sugestões) seguem com a 1ª mensagem; depois de entregues, nada', async () => {
  const p = montar();
  p.T.iniciar({ consultor: true });
  await ate(p, ...ATE_DOR);
  assert.deepEqual(puro(p.T.pendentes()), { ramo: 'saude', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho', equipe: 'so_eu', responde: 'dor' });
  p.tocar('Pelo Instagram');
  p.tocar('Pronto');
  await tique();
  assert.deepEqual(p.enviados, ['Pelo Instagram'], 'com o consultor, o "Pronto" da dor manda os rótulos como a fala dela');
  assert.deepEqual(puro(p.T.pendentes().situacao), ['instagram']);
  p.T.entregues();
  assert.equal(p.T.pendentes(), null);
  assert.equal(p.abertos().length, 0, 'as perguntas fixas que faltavam saem de cena');
});

test('a dor com vários toques vai como uma frase de gente: vírgula, "e" no fim e sem maiúscula no meio (lapidação 26/11)', async () => {
  const p = montar();
  p.T.iniciar({ consultor: true });
  await ate(p, ...ATE_DOR);
  p.tocar('Pelo Instagram');
  p.tocar('Me chamam no WhatsApp');
  p.tocar('Respondo preço e horário na mão');
  p.tocar('Pronto');
  await tique();
  assert.deepEqual(p.enviados, ['Pelo Instagram, me chamam no WhatsApp e respondo preço e horário na mão']);
  assert.deepEqual(puro(p.T.pendentes().situacao), ['instagram', 'whatsapp', 'responde_na_mao'], 'o briefing segue pelos códigos');
});

test('"Pronto" vazio: focável e lido (aria-disabled), diz o que falta e não fecha o grupo', async () => {
  const p = montar();
  p.T.iniciar();
  await ate(p, 'Saúde');
  const pronto = p.botao('Pronto');
  assert.equal(pronto.getAttribute('aria-disabled'), 'true');
  assert.equal(pronto.disabled, false, 'nunca disabled: sairia do Tab e da leitura');
  pronto.clicar();
  assert.equal(p.anuncios.at(-1), 'Escolha ao menos uma opção.');
  assert.equal(p.abertos().length, 1);
  p.tocar('Agendamentos');
  assert.equal(pronto.getAttribute('aria-disabled'), 'false');
});

test('o valor: retido desde o 1º passo, liberado uma vez só (o evento da página)', () => {
  const p = montar();
  assert.equal(p.T.reterValor(null), false, 'antes de começar e sem o fluxo novo no estado: nada retido (a página de hoje)');
  assert.equal(p.T.reterValor({ conversa: { briefing: { fluxo_conversa: true } } }), true, 'conversa do fluxo novo vinda do servidor: retido');
  p.T.iniciar();
  assert.equal(p.T.reterValor(null), true);
  p.T.liberarValor(); p.T.liberarValor();
  assert.equal(p.T.reterValor(null), false);
  assert.deepEqual(p.eventos, ['bz:valor-liberado']);
});

test('sem consultor: a dor por toques e "Não sei", depois o resumo fixo das listas fechadas e o valor liberado', async () => {
  const p = montar({ consultor: false });
  p.T.iniciar({ consultor: false });
  await ate(p, ...ATE_DOR);
  assert.match(p.falas().at(-1), /Toque no que for a sua cara/);
  await ate(p, 'Pelo Instagram', 'Paciente marca e falta', 'Pronto');
  assert.deepEqual(p.enviados, [], 'nada vai à conversa com a IA');
  assert.match(p.falas().at(-1), /^Pelo que você contou, quem chega pelo Instagram cai numa página sua que deixa a pessoa marcar/);
  assert.deepEqual(puro(p.T.situacao()), ['instagram', 'falta_consulta']);
  await new Promise(r => setTimeout(r, 1300));
  assert.deepEqual(p.eventos, ['bz:valor-liberado']);
});

test('a dor com o consultor: se o envio não entrou, as sugestões voltam com o que ela tinha marcado', async () => {
  const p = montar({ enviar: async () => false });
  p.T.iniciar();
  await ate(p, ...ATE_DOR, 'Pelo Instagram', 'Pronto');
  await tique(); await tique();
  const de = p.abertos().at(-1);
  assert.ok(de, 'o grupo da dor voltou');
  assert.equal(de.querySelectorAll('button').find(b => b.textContent === 'Pelo Instagram').getAttribute('aria-pressed'), 'true');
});

test('"Seguir tocando" no passo da dor: as sugestões voltam sem repetir a pergunta; depois de a dor ir por escrito, o resumo fixo', async () => {
  const p = montar();
  p.T.iniciar();
  await ate(p, ...ATE_DOR);
  const antes = p.falas().length;
  p.T.semConsultor();
  assert.equal(p.falas().length, antes, 'nenhuma fala repetida');
  assert.ok(p.abertos().at(-1).querySelectorAll('button').some(b => b.textContent === 'Não sei, escolha por mim'), 'sem consultor, com "Não sei"');
  const q = montar();
  q.T.iniciar();
  await ate(q, ...ATE_DOR);
  q.T.entregues();
  q.T.semConsultor();
  assert.match(q.falas().at(-1), /^Pelo que você contou/);
});

test('conversa retomada: o que ela tocou volta do briefing; o "Mudar" abre marcado, uma vez só, e a mudança vai como a fala montada', async () => {
  const p = montar();
  p.T.configurar({ consultor: true });
  p.T.atualizar({ conversa: { briefing: { fluxo_conversa: true, fluxo_toques: { ramo: 'saude', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' } } }, mensagens: [{ papel: 'visitante', conteudo: 'x' }] });
  p.T.reabrir();
  p.T.reabrir();
  assert.equal(p.log.querySelectorAll('.orc-toque--mudar').length, 1, 'um bloco por vez');
  const bloco = p.log.querySelector('.orc-toque--mudar');
  const marcado = txt => bloco.querySelectorAll('button').find(b => b.textContent === txt).getAttribute('aria-pressed');
  assert.equal(marcado('Saúde'), 'true');
  assert.equal(marcado('Agendamentos'), 'true');
  bloco.querySelectorAll('button').find(b => b.textContent === 'Beleza').clicar();
  bloco.querySelectorAll('button').find(b => b.textContent === 'Pronto').clicar();
  assert.deepEqual(p.enviados, ['Mudei minhas respostas: Beleza · Agendamentos · Só o Instagram · Logo e textos: tenho']);
  assert.deepEqual(puro(p.T.pendentes()), { ramo: 'beleza', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' });
  await tique(); await tique();
  assert.equal(p.log.querySelectorAll('.orc-toque--mudar').length, 0, 'o envio entrou: a pergunta e o bloco saem (a fala dela e a resposta entram na conversa na ordem certa)');
});

test('"Mudar" com o envio que NÃO entrou: o bloco volta e a mudança não fica pendurada para a próxima mensagem', async () => {
  const p = montar({ enviar: async () => false });
  p.T.configurar({ consultor: true });
  p.T.atualizar({ conversa: { briefing: { fluxo_conversa: true, fluxo_toques: { ramo: 'saude', objetivos: ['agendamentos'] } } }, mensagens: [{ papel: 'visitante', conteudo: 'x' }] });
  p.T.reabrir();
  const bloco = p.log.querySelector('.orc-toque--mudar');
  bloco.querySelectorAll('button').find(b => b.textContent === 'Beleza').clicar();
  bloco.querySelectorAll('button').find(b => b.textContent === 'Pronto').clicar();
  await tique(); await tique();
  assert.equal(p.T.pendentes(), null, 'nada pendurado');
  assert.equal(p.log.querySelectorAll('.orc-toque--mudar:not([data-feito])').length, 1, 'o bloco voltou, aberto');
});

test('o foco nunca se perde: com o teclado ele segue para o próximo grupo; sem próximo grupo, vai à caixa de texto', async () => {
  const p = montar();
  p.T.iniciar();
  const saude = p.botao('Saúde');
  saude.focus();
  saude.clicar(0);   /* (detail 0: Enter ou espaço no botão) */
  await tique();
  assert.equal(p.doc.activeElement, p.abertos()[0].querySelectorAll('button')[0], 'o 1º botão do grupo seguinte');
  for (const t of ['Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho', 'Só eu', 'Pelo Instagram', 'Pronto']) { p.botao(t).clicar(0); await tique(); }
  assert.equal(p.doc.activeElement, p.texto, 'depois do "Pronto" da dor: a caixa de texto');
});

test('a falha da conta durante os toques vira fala do Zero (alerta com o texto depois de estar na página) e "Tentar de novo" refaz a conta', async () => {
  const p = montar();
  p.T.iniciar();
  await ate(p, 'Saúde');
  p.doc.dispatchEvent({ type: 'bz:conta-falhou', detail: { mensagem: 'Não foi possível confirmar que você não é um robô.' } });
  const erro = p.log.querySelector('.orc-toque--erro');
  const alerta = erro.children[0];
  assert.equal(alerta.getAttribute('role'), 'alert');
  assert.equal(alerta.textContent, '', 'o alerta nasce vazio');
  await tique();
  assert.equal(alerta.textContent, 'Não foi possível confirmar que você não é um robô.');
  const n = p.definidos.length;
  erro.querySelectorAll('button').find(b => b.textContent === 'Tentar de novo').clicar();
  assert.equal(p.definidos.length, n + 1);
  assert.ok(erro.hasAttribute('data-feito'));
});

test('o "Outro": a escrita curta, limpa e no tamanho do servidor; vazio diz o que falta', async () => {
  const p = montar();
  p.T.iniciar();
  p.tocar('Outro');
  const campo = p.abertos()[0].querySelectorAll('input')[0];
  assert.equal(campo.maxLength, 60);
  p.botao('Seguir').clicar();
  assert.equal(p.anuncios.at(-1), 'Escreva o tipo do seu negócio.');
  campo.value = '  pet\nshop <b>  ';
  campo.tecla('Enter');
  assert.deepEqual(p.bolhas(), ['pet shop b']);
  assert.deepEqual(p.definidos.at(-1), { ramo: 'outro', outro: 'pet shop b', objetivos: [] });
});

/* (mapa vivo, fase 4, parte 2; revisão técnica do ramo mapa-vivo-coerencia-tela) o "Sim, ajuste" da pergunta de coerência: trocarRamo devolve a
   promessa do envio; o ramo da tela só muda depois que o envio ENTROU; se não entrou, nada muda e o bloco do "Mudar" não abre sozinho; com o
   bloco aberto ou outra mudança a caminho, recusa sem mandar nada */
const RETOMADA = { conversa: { briefing: { fluxo_conversa: true, fluxo_toques: { ramo: 'saude', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' } } }, mensagens: [{ papel: 'visitante', conteudo: 'x' }] };
const retomada = o => { const p = montar(o); p.T.configurar({ consultor: true }); p.T.atualizar(RETOMADA); return p; };

test('trocarRamo: o envio entrou, o ramo muda (fala montada, só o ramo); a promessa diz true', async () => {
  let soltar;
  const p = retomada({ enviar: () => new Promise(r => { soltar = r; }) });
  const promessa = p.T.trocarRamo('alimentacao');
  assert.ok(promessa && typeof promessa.then === 'function', 'devolve a promessa do envio');
  assert.deepEqual(p.enviados, ['Mudei minhas respostas: Alimentação · Agendamentos · Só o Instagram · Logo e textos: tenho']);
  assert.equal(puro(p.T.pendentes()).ramo, 'alimentacao', 'a mudança segue com o envio');
  assert.equal(p.T.respostas().ramo, 'saude', 'antes de o envio entrar, a tela não muda');
  soltar(true);
  assert.equal(await promessa, true);
  assert.equal(p.T.respostas().ramo, 'alimentacao');
  assert.equal(p.definidos.at(-1).ramo, 'alimentacao');
});

test('trocarRamo: o envio NÃO entrou (limite de mudanças, conversa ocupada) ou falhou: nada muda, nada pendurado, o "Mudar" não abre sozinho', async () => {
  for (const enviar of [async () => false, async () => { throw new Error('rede'); }]) {
    const p = retomada({ enviar });
    assert.equal(await p.T.trocarRamo('alimentacao'), false);
    assert.equal(p.T.respostas().ramo, 'saude');
    assert.equal(p.T.pendentes(), null);
    assert.equal(p.log.querySelectorAll('.orc-toque--mudar').length, 0);
    assert.ok(!p.definidos.some(d => d.ramo === 'alimentacao'));
  }
});

test('trocarRamo recusa sem mandar nada: "Mudar" aberto, outra mudança a caminho, o mesmo ramo, "outro", fora da lista, sem consultor', async () => {
  const p = retomada({ enviar: () => new Promise(() => {}) });
  p.T.reabrir();
  assert.equal(await p.T.trocarRamo('alimentacao'), false, 'bloco do Mudar aberto');
  const q = retomada({ enviar: () => new Promise(() => {}) });
  q.T.trocarRamo('alimentacao');
  assert.equal(await q.T.trocarRamo('beleza'), false, 'outra mudança a caminho');
  assert.equal(q.enviados.length, 1);
  const r = retomada();
  for (const ramo of ['saude', 'outro', 'banco', '__proto__', 42]) assert.equal(await r.T.trocarRamo(ramo), false, String(ramo));
  assert.equal(r.enviados.length, 0);
  assert.equal(p.enviados.length, 0);
});

test('trocarRamo que não entrou: a fala montada não fica na caixa de texto (a conversa a devolve lá quando o envio falha sem gravar)', async () => {
  let p;
  p = retomada({ enviar: async t => { p.texto.value = t; return false; } });
  assert.equal(await p.T.trocarRamo('alimentacao'), false);
  assert.equal(p.texto.value, '', 'a fala de mudança não fica para ir como texto solto');
  let q;
  q = retomada({ enviar: async () => { q.texto.value = 'o que ela escreveu'; return false; } });
  await q.T.trocarRamo('alimentacao');
  assert.equal(q.texto.value, 'o que ela escreveu', 'o texto dela fica');
});

test('a equipe (dono 27/11): 4 faixas de lista fechada, opcional ("Prefiro não dizer" segue sem o campo), e a resposta vai com a 1ª mensagem', async () => {
  const p = montar();
  assert.deepEqual(Object.keys(p.win.BZOrcRotulos.EQUIPE), ['so_eu', 'ate_5', 'ate_15', 'mais_15']);
  assert.deepEqual(Object.values(p.win.BZOrcRotulos.EQUIPE), ['Só eu', '2 a 5', '6 a 15', '16 ou mais']);
  p.T.iniciar({ consultor: true });
  await ate(p, 'Saúde', 'Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho');
  assert.ok(p.botao('Só eu') && p.botao('16 ou mais'), 'os 4 botões');
  await ate(p, 'Prefiro não dizer');
  assert.equal(p.bolhas().at(-1), 'Prefiro não dizer');
  assert.match(p.falas().at(-1), /como os clientes chegam/);
  assert.equal(puro(p.T.pendentes()).equipe, undefined, 'pulou: nada de equipe');
  const q = montar();
  q.T.iniciar({ consultor: true });
  await ate(q, 'Saúde', 'Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho', '6 a 15');
  assert.equal(puro(q.T.pendentes()).equipe, 'ate_15');
  assert.equal(puro(q.T.respostas()).equipe, 'ate_15', 'a miniatura e a cena leem a faixa');
});
