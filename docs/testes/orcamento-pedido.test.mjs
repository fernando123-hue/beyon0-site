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
const ateCartao = p => { p.P.iniciar(); p.seguir('Padaria Sol'); p.seguir('Pães e bolos'); p.seguir('(11) 98765-4321'); p.tocar('Não, pode seguir'); };

test('os passos: nome do negócio, o que vende (com sugestões do ramo), WhatsApp com o teclado de telefone, opcionais e o cartão', () => {
  const p = montar();
  p.P.iniciar();
  assert.ok(p.P.ativo());
  assert.match(p.falas().at(-1), /nome do negócio/);
  assert.equal(p.caixa().getAttribute('autocomplete'), 'organization');
  p.seguir('B');
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
  assert.match(p.aberto('.orc-toque--campo').querySelector('.orc-toque__erro-campo').textContent, /WhatsApp com DDD/);
  p.seguir('(11) 98765-4321');

  const opc = p.abertos().at(-1).querySelectorAll('button').map(b => b.textContent);
  assert.deepEqual(opc, ['Como quer ser chamado', 'Um site que eu admiro', 'Para quem eu vendo', 'O que me diferencia', 'As redes do negócio', 'Não, pode seguir']);
  p.tocar('Como quer ser chamado');
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
  assert.equal(p.doc.activeElement, p.botao('Concordo e quero os modelos'));
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

test('as redes: a autorização nunca vem marcada e é exigida quando há endereço; sem endereço, segue sem autorização', () => {
  const p = montar();
  p.P.iniciar(); p.seguir('Padaria Sol'); p.seguir('Pães'); p.seguir('11987654321');
  p.tocar('As redes do negócio');
  const redes = p.aberto('.orc-toque--redes');
  const autoriza = p.botao('Autorizo a Beyon Zero a olhar essas redes para preparar os modelos');
  assert.equal(autoriza.getAttribute('aria-pressed'), 'false');
  redes.querySelectorAll('input')[0].value = '@padariasol';
  p.botao('Seguir').clicar();
  assert.match(redes.querySelector('.orc-toque__erro-campo').textContent, /toque na autorização/);
  assert.equal(p.doc.activeElement, autoriza);
  autoriza.clicar();
  assert.equal(autoriza.getAttribute('aria-pressed'), 'true');
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
  await tique();
  assert.equal(p.pedidos.length, 1);
  assert.deepEqual(puro(p.pedidos[0]), { negocio: 'Padaria Sol', vende: 'Pães e bolos', telefone: '(11) 98765-4321', nome: '', publico: '', diferencial: '', admira: '',
    redes: {}, autoriza_redes: false, aceite: true, aceite_versao: 'a1' });
  assert.deepEqual(p.eventos, ['bz:detalhes-enviados:BZ-K7M3Q']);
  assert.equal(p.bolhas().at(-1), 'Concordo e quero os modelos');
  assert.ok(!p.P.ativo());
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
  assert.equal(p.pedidos.length, 1);
  assert.deepEqual(p.eventos, []);
});

test('fila cheia: a fala do Zero, o aviso da página aparece e o pedido termina', async () => {
  const p = montar({ detalhes: async () => { throw Object.assign(new Error('A fila de pedidos está cheia agora.'), { status: 409, dados: { fila_cheia: true } }); } });
  ateCartao(p);
  p.botao('Concordo e quero os modelos').clicar();
  await tique();
  assert.equal(p.falas().at(-1), 'A fila de pedidos está cheia agora.');
  assert.equal(p.fila.hidden, false);
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
