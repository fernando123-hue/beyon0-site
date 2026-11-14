/* O pedido dentro da conversa (js/orcamento-pedido.js; spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §5, PR 3):
   os passos 8a–8e, as validações, a autorização das redes que nunca vem marcada, o "Corrigir" que volta ao cartão, o envio UMA vez com a
   versão do aceite e os erros do servidor viram fala do Zero no passo certo. O módulo roda de verdade num DOM de mentira
   (docs/testes/_dom-falso.mjs); a página real é provada pelo E2E (docs/e2e-orcamento.mjs). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarConversa, tique, puro } from './_dom-falso.mjs';

const montar = o => {
  const p = montarConversa({ modulos: ['js/orcamento-pedido.js'], ...o });
  const P = p.win.BZPedido;
  const aberto = sel => p.log.querySelectorAll(sel + ':not([data-feito])')[0] || null;
  const caixa = () => { const li = aberto('.orc-toque--campo'); return li && li.querySelector('.orc-toque__campo'); };
  const seguir = v => { const c = caixa(); assert.ok(c, 'sem campo aberto'); c.digitar(v); p.botao('Seguir').clicar(); };
  const cartao = () => aberto('.orc-toque--aceite');
  const corrigir = rotulo => cartao().querySelectorAll('button').find(b => b.getAttribute('aria-label') === 'Corrigir ' + rotulo).clicar();
  return { ...p, P, aberto, caixa, seguir, cartao, corrigir };
};
/* do início ao cartão, sem opcionais */
const depoisDoErro = () => new Promise(r => setTimeout(r, 80));   /* (o texto do erro entra depois do nó do alerta, js/orcamento-pedido.js mostrarErro) */
const ateCartao = p => { p.P.iniciar(); p.seguir('Padaria Sol'); p.seguir('Pães e bolos'); p.seguir('(11) 98765-4321'); p.tocar('Não, pode seguir'); };

test('os passos: nome do negócio, o que vende (com sugestões do ramo), WhatsApp com o teclado de telefone, opcionais e o cartão', async () => {
  const p = montar();
  p.P.iniciar();
  assert.ok(p.P.ativo());
  assert.match(p.falas().at(-1), /nome do negócio/);
  assert.equal(p.caixa().getAttribute('autocomplete'), 'organization');
  assert.equal(p.caixa().getAttribute('aria-required'), 'true');
  p.seguir('B');
  await depoisDoErro();
  assert.equal(p.aberto('.orc-toque--campo').querySelector('.orc-toque__erro-campo').textContent, 'Informe o nome do negócio.');
  assert.equal(p.caixa().getAttribute('aria-invalid'), 'true', 'o erro fica preso ao campo');
  assert.equal(p.doc.activeElement, p.caixa(), 'o foco volta ao campo com erro');
  p.seguir('Padaria Sol');
  assert.equal(p.bolhas().at(-1), 'Padaria Sol');

  assert.match(p.falas().at(-1), /o que vocês vendem/);
  const sug = p.aberto('.orc-toque--campo').querySelectorAll('button.orc-op').map(b => b.textContent);
  assert.deepEqual(sug, ['Serviços', 'Produtos', 'Encomendas'], 'sem ramo tocado: as sugestões de "outro"');
  p.botao('Produtos').clicar(); p.botao('Encomendas').clicar();
  assert.equal(p.caixa().value, 'Produtos, Encomendas');
  p.botao('Produtos').clicar();
  assert.equal(p.caixa().value, 'Encomendas', 'tocar de novo tira');
  p.botao('Seguir').clicar();

  const tel = p.caixa();
  assert.equal(tel.type, 'tel');
  assert.equal(tel.getAttribute('inputmode'), 'tel');
  assert.equal(tel.getAttribute('autocomplete'), 'tel');
  p.seguir('1234');
  await depoisDoErro();
  assert.match(p.aberto('.orc-toque--campo').querySelector('.orc-toque__erro-campo').textContent, /WhatsApp com DDD/);
  p.seguir('(11) 98765-4321');

  const opc = p.abertos().at(-1).querySelectorAll('button').map(b => b.textContent);
  assert.deepEqual(opc, ['Como quer ser chamado', 'Um site que eu admiro', 'Para quem eu vendo', 'O que me diferencia', 'As redes do negócio', 'Não, pode seguir']);
  p.tocar('Como quer ser chamado');
  assert.equal(p.caixa().getAttribute('aria-required'), null, 'opcional não é obrigatório');
  p.botao('Pular').clicar();
  assert.equal(p.bolhas().at(-1), 'Pular');
  p.tocar('Para quem eu vendo');
  p.seguir('Gente do bairro');
  assert.equal(p.falas().at(-1), 'Mais alguma coisa?');
  assert.ok(!p.abertos().at(-1).querySelectorAll('button').some(b => b.textContent === 'Para quem eu vendo'), 'o que já foi contado sai da lista');
  p.tocar('Não, pode seguir');

  const c = p.cartao();
  assert.ok(c, 'o cartão de aceite abre');
  const itens = c.querySelectorAll('li.orc-aceite__item').map(li => li.querySelector('span').textContent);
  assert.deepEqual(itens, ['Nome do negócio: Padaria Sol', 'O que vende: Encomendas', 'WhatsApp: (11) 98765-4321', 'Para quem vende: Gente do bairro']);
  assert.equal(c.querySelector('p.orc-aceite__texto').textContent, p.win.BZOrcRotulos.ACEITE.texto, 'o texto da versão vigente');
  const link = c.querySelector('a.orc-aceite__link');
  assert.equal(link.href, '/privacidade#orcamento');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener');
  assert.equal(p.doc.activeElement, c, 'o foco vai ao cartão (o leitor percorre o resumo e o aceite antes do botão)');
  assert.equal(c.getAttribute('role'), 'group');
  assert.equal(c.getAttribute('tabindex'), '-1');
  assert.ok(link.textContent.includes('(abre em outra aba)'));
  assert.equal(p.pedidos.length, 0, 'nada vai ao servidor antes do aceite');
});

test('as sugestões seguem o ramo tocado na conversa', () => {
  const p = montar();
  p.T.iniciar({ consultor: true });
  p.tocar('Saúde');
  assert.equal(p.T.respostas().ramo, 'saude');
  p.P.iniciar(); p.seguir('Clínica Boa');
  assert.deepEqual(p.aberto('.orc-toque--campo').querySelectorAll('button.orc-op').map(b => b.textContent), ['Consultas', 'Exames', 'Fisioterapia', 'Tratamentos estéticos']);
});

test('sem ramo tocado nesta visita (recarregou com o pacote gravado): as sugestões vêm do ramo que o servidor guardou no caso', () => {
  const p = montar();
  p.P.configurar({ sessaoTerminou: () => false, avisarSessao: () => {}, estado: () => ({ conversa: { briefing: { negocio: { segmento: 'saúde' } } } }) });
  p.P.iniciar(); p.seguir('Clínica Boa');
  assert.deepEqual(p.aberto('.orc-toque--campo').querySelectorAll('button.orc-op').map(b => b.textContent), ['Consultas', 'Exames', 'Fisioterapia', 'Tratamentos estéticos']);
  const q = montar();
  q.P.configurar({ sessaoTerminou: () => false, avisarSessao: () => {}, estado: () => ({ conversa: { briefing: { negocio: { segmento: '<script>' } } } }) });
  q.P.iniciar(); q.seguir('Loja');
  assert.deepEqual(q.aberto('.orc-toque--campo').querySelectorAll('button.orc-op').map(b => b.textContent), ['Serviços', 'Produtos', 'Encomendas'], 'segmento desconhecido: as de "outro"');
});

test('as redes: a autorização nunca vem marcada e é exigida quando há endereço; sem endereço, segue sem autorização', async () => {
  const p = montar();
  p.P.iniciar(); p.seguir('Padaria Sol'); p.seguir('Pães'); p.seguir('11987654321');
  p.tocar('As redes do negócio');
  const redes = p.aberto('.orc-toque--redes');
  const autoriza = p.botao('Autorizo a Beyon Zero a olhar essas redes para preparar os modelos');
  assert.equal(autoriza.getAttribute('aria-pressed'), 'false');
  redes.querySelectorAll('input')[0].value = '@padariasol';
  assert.equal(redes.getAttribute('role'), 'group', 'os 5 campos num grupo rotulado pela pergunta');
  p.botao('Seguir').clicar();
  await depoisDoErro();
  const erroRedes = redes.querySelector('.orc-toque__erro-campo');
  assert.match(erroRedes.textContent, /toque na autorização/);
  assert.equal(p.doc.activeElement, autoriza);
  assert.equal(autoriza.getAttribute('aria-describedby'), erroRedes.id, 'o botão focado diz o motivo');
  autoriza.clicar();
  assert.equal(autoriza.getAttribute('aria-pressed'), 'true');
  assert.equal(erroRedes.textContent, '', 'tocar na autorização limpa o erro');
  p.botao('Seguir').clicar();
  assert.equal(p.bolhas().at(-1), 'Instagram');
  p.tocar('Não, pode seguir');
  p.botao('Concordo e quero os modelos').clicar();
  assert.deepEqual(puro(p.pedidos[0].redes), { instagram: '@padariasol' });
  assert.equal(p.pedidos[0].autoriza_redes, true);

  const q = montar();
  q.P.iniciar(); q.seguir('Padaria Sol'); q.seguir('Pães'); q.seguir('11987654321');
  q.tocar('As redes do negócio');
  q.botao('Autorizo a Beyon Zero a olhar essas redes para preparar os modelos').clicar();
  q.botao('Seguir').clicar();
  assert.equal(q.bolhas().at(-1), 'Pular');
  q.tocar('Não, pode seguir');
  q.botao('Concordo e quero os modelos').clicar();
  assert.equal(q.pedidos[0].autoriza_redes, false, 'autorização sem rede nenhuma não vale');
});

test('a conversa vai ao servidor (ou o consultor cai) no meio do pedido: os toques fecham os grupos deles, nunca o passo do pedido', () => {
  const p = montar();
  p.T.iniciar({ consultor: true });
  p.P.iniciar(); p.seguir('Padaria Sol');
  const passo = p.aberto('.orc-toque--campo');
  p.T.entregues();
  assert.equal(passo.hasAttribute('data-feito'), false, 'segue aberto');
  assert.equal(p.caixa(), passo.querySelector('.orc-toque__campo'));
  p.T.semConsultor();
  assert.equal(passo.hasAttribute('data-feito'), false);
});

test('as sugestões marcadas acompanham a caixa: ao corrigir com o texto de antes e ao escrever à mão; o que não cabe é avisado', () => {
  const p = montar();
  ateCartao(p);
  p.corrigir('o que vende');
  const marcadas = () => p.aberto('.orc-toque--campo').querySelectorAll('button.orc-op').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent);
  p.seguir('Produtos, Encomendas');
  p.corrigir('o que vende');
  assert.deepEqual(marcadas(), ['Produtos', 'Encomendas'], 'o texto de antes já vem marcado');
  p.caixa().digitar('Serviços');
  assert.deepEqual(marcadas(), ['Serviços']);
  p.caixa().digitar('x'.repeat(195));
  p.botao('Produtos').clicar();
  assert.equal(p.caixa().value.length, 195, 'não passa do limite');
  assert.match(p.anuncios.at(-1), /Não cabe mais: até 200 caracteres/);
});

test('"Corrigir" volta ao campo com o valor e, depois, direto ao cartão', () => {
  const p = montar();
  ateCartao(p);
  p.corrigir('whatsapp');
  assert.ok(!p.cartao(), 'o cartão antigo sai de cena');
  assert.equal(p.caixa().value, '(11) 98765-4321');
  p.seguir('(21) 99999-0000');
  assert.ok(p.cartao(), 'volta ao cartão sem repetir os passos');
  assert.ok(p.cartao().querySelectorAll('span').some(s => s.textContent === 'WhatsApp: (21) 99999-0000'));
});

test('o envio vai uma vez só, com a versão do aceite, e avisa a página; nada guardado no aparelho', async () => {
  const p = montar();
  ateCartao(p);
  const b = p.botao('Concordo e quero os modelos');
  b.clicar(); b.clicar();
  assert.equal(b.textContent, 'Enviando…');
  assert.equal(b.getAttribute('aria-disabled'), 'true');
  assert.deepEqual(p.enviandoNoLog, [true], 'avisa a caixa uma vez, com o cartão marcado em envio (a faixa da planta se recolhe)');
  assert.equal(p.anuncios.at(-1), 'Enviando o seu pedido…');
  await tique();
  assert.equal(p.log.querySelectorAll('[aria-busy]').length, 0, 'terminado o envio, nada fica marcado em envio');
  assert.equal(p.pedidos.length, 1);
  assert.deepEqual(puro(p.pedidos[0]), { negocio: 'Padaria Sol', vende: 'Pães e bolos', telefone: '(11) 98765-4321', nome: '', publico: '', diferencial: '', admira: '',
    redes: {}, autoriza_redes: false, aceite: true, aceite_versao: 'a1' });
  assert.deepEqual(p.eventos, ['bz:detalhes-enviados:BZ-K7M3Q']);
  assert.equal(p.bolhas().at(-1), 'Concordo e quero os modelos');
  assert.ok(!p.P.ativo());
  const n = p.log.children.length;
  p.P.iniciar();
  assert.equal(p.log.children.length, n, 'pedido que já entrou: um "Quero" que sobrou não abre outro');
  assert.equal(p.enviados.length, 0, 'nada do pedido vira mensagem da conversa (não vai ao modelo)');
  const fonte = fs.readFileSync(new URL('../../js/orcamento-pedido.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fonte, /localStorage|sessionStorage|document\.cookie|indexedDB/);
});

test('um segundo "iniciar" com o pedido aberto leva ao passo aberto, sem duplicar', () => {
  const p = montar();
  p.P.iniciar(); p.seguir('Padaria Sol');
  const antes = p.log.children.length;
  p.doc.activeElement = null;
  p.P.iniciar();
  assert.equal(p.log.children.length, antes);
  assert.equal(p.doc.activeElement, p.caixa());
});

test('o Zero fala no meio do pedido: o passo aberto (a pergunta e a caixa) volta ao fim da conversa, com o foco onde estava', () => {
  const p = montar();
  p.P.iniciar(); p.seguir('Padaria Sol');
  const caixa = p.caixa();
  const outra = p.doc.createElement('li'); outra.className = 'msg msg--visitante'; p.log.appendChild(outra);
  const fala = p.doc.createElement('li'); fala.className = 'msg msg--agente'; fala.textContent = 'Resposta do Zero'; p.log.appendChild(fala);
  caixa.focus();
  p.P.trazerAoFim();
  const ultimos = p.log.children.slice(-2);
  assert.match(ultimos[0].textContent, /o que vocês vendem/, 'a pergunta do passo vem logo depois da resposta');
  assert.equal(ultimos[1], p.aberto('.orc-toque--campo'));
  assert.equal(p.doc.activeElement, caixa);
});

test('"Quero" de novo com os opcionais abertos: leva ao passo aberto, sem recomeçar o pedido', () => {
  const p = montar();
  p.P.iniciar(); p.seguir('Padaria Sol'); p.seguir('Pães'); p.seguir('11987654321');
  const antes = p.log.children.length;
  p.P.iniciar();
  assert.equal(p.log.children.length, antes, 'nada novo na conversa');
  assert.ok(p.botao('Não, pode seguir'), 'os opcionais seguem abertos');
  assert.equal(p.doc.activeElement && p.doc.activeElement.textContent, 'Como quer ser chamado');
});

test('erro 400 do servidor: a fala do Zero e o campo certo reabre; corrigido, volta ao cartão e envia de novo', async () => {
  let n = 0;
  const p = montar({ detalhes: async () => { if (n++ === 0) throw Object.assign(new Error('Informe o seu WhatsApp com DDD.'), { status: 400 }); return { codigo: 'BZ-OK' }; } });
  ateCartao(p);
  p.botao('Concordo e quero os modelos').clicar();
  await tique();
  assert.ok(p.falas().includes('Informe o seu WhatsApp com DDD.'));
  assert.equal(p.caixa().type, 'tel', 'o campo do WhatsApp reabre');
  p.seguir('(11) 91234-5678');
  p.botao('Concordo e quero os modelos').clicar();
  await tique();
  assert.equal(p.pedidos.length, 2);
  assert.equal(p.pedidos[1].telefone, '(11) 91234-5678');
  assert.deepEqual(p.eventos, ['bz:detalhes-enviados:BZ-OK']);
});

test('409 com a versão velha do aceite: pede para recarregar e o cartão fica (sem reenviar sozinho)', async () => {
  const p = montar({ detalhes: async () => { throw Object.assign(new Error('O texto do aceite foi atualizado. Recarregue a página e confira de novo antes de enviar.'), { status: 409 }); } });
  ateCartao(p);
  p.botao('Concordo e quero os modelos').clicar();
  await tique();
  assert.match(p.falas().at(-1), /Recarregue/);
  const b = p.botao('Concordo e quero os modelos');
  assert.equal(b.getAttribute('aria-disabled'), null);
  assert.equal(p.cartao().getAttribute('aria-busy'), null, 'o cartão sai do envio');
  assert.equal(p.pedidos.length, 1);
  assert.deepEqual(p.eventos, []);
});

test('outro 409 (o pedido já entrou por outra aba): o cartão sai, o Zero diz o motivo e a página relê o estado', async () => {
  const p = montar({ detalhes: async () => { throw Object.assign(new Error('Os detalhes vêm depois do preço e só uma vez. Se precisar mudar algo, deixe um recado para a equipe.'), { status: 409 }); } });
  let relidas = 0;
  p.P.configurar({ sessaoTerminou: () => false, avisarSessao: () => {}, reler: () => { relidas++; } });
  ateCartao(p);
  p.botao('Concordo e quero os modelos').clicar();
  await tique();
  assert.match(p.falas().at(-1), /só uma vez/);
  assert.ok(!p.cartao());
  assert.equal(relidas, 1);
  assert.ok(!p.P.ativo());
});

test('erro 400 do servidor: o erro fica preso ao campo reaberto (alerta e aria-invalid), sem anúncio de fala por cima', async () => {
  const p = montar({ detalhes: async () => { throw Object.assign(new Error('Informe o seu WhatsApp com DDD.'), { status: 400 }); } });
  ateCartao(p);
  const antes = p.anuncios.length;
  p.botao('Concordo e quero os modelos').clicar();
  await tique();
  assert.deepEqual(p.anuncios.slice(antes), ['Enviando o seu pedido…'], 'nem a fala do erro nem a pergunta passam pela região viva');
  const caixa = p.caixa(), erro = p.aberto('.orc-toque--campo').querySelector('.orc-toque__erro-campo');
  assert.equal(p.doc.activeElement, caixa);
  assert.equal(caixa.getAttribute('aria-invalid'), 'true');
  assert.equal(caixa.getAttribute('aria-describedby'), erro.id);
  await depoisDoErro();
  assert.equal(erro.textContent, 'Informe o seu WhatsApp com DDD.');
});

test('erro corrigido antes do tique: o texto velho não volta', async () => {
  const p = montar();
  p.P.iniciar();
  p.seguir('B');
  p.caixa().digitar('Padaria');
  await depoisDoErro();
  assert.equal(p.aberto('.orc-toque--campo').querySelector('.orc-toque__erro-campo').textContent, '');
});

test('fila cheia: a fala do Zero, o aviso da página aparece e o pedido termina', async () => {
  const p = montar({ detalhes: async () => { throw Object.assign(new Error('A fila de pedidos está cheia agora.'), { status: 409, dados: { fila_cheia: true } }); } });
  ateCartao(p);
  p.botao('Concordo e quero os modelos').clicar();
  await tique();
  assert.equal(p.falas().at(-1), 'A fila de pedidos está cheia agora.');
  assert.equal(p.fila.hidden, false);
  assert.equal(p.contato.hidden, false, 'o bloco do aviso aparece (no modo conversa ele fica escondido)');
  assert.equal(p.doc.activeElement, p.fila, 'o foco vai para o aviso');
  assert.ok(!p.P.ativo());
  assert.ok(!p.cartao());
});

test('sessão que terminou: o gancho da página avisa e o cartão fica', async () => {
  const p = montar({ detalhes: async () => { throw Object.assign(new Error('sessão'), { status: 401 }); } });
  const avisos = [];
  p.P.configurar({ sessaoTerminou: e => e.status === 401, avisarSessao: () => avisos.push(1) });
  ateCartao(p);
  const falas = p.falas().length;
  p.botao('Concordo e quero os modelos').clicar();
  await tique();
  assert.equal(avisos.length, 1);
  assert.equal(p.falas().length, falas, 'sem fala do Zero: o aviso da sessão é da página');
  assert.ok(p.cartao());
});
