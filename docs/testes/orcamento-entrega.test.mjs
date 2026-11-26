/* "SEU PEDIDO" (PR 3b-2; spec §1 e §3): os 4 passos com a data prevista que vem do servidor, o link do pedido (sem NENHUM
   href com o código, sem wa.me/?text=), a agenda feita no aparelho, a volta pelo #pedido=. O módulo é JS de navegador
   (IIFE): roda aqui com um window de mentira, sem document (as funções puras não tocam no DOM).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataPorExtenso as dataDoServidor } from '../../api/_material/prazo.mjs';
import { criarDoc, tique } from './_dom-falso.mjs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const FONTE = ler('js/orcamento-entrega.js');
const janela = {};
new Function('window', FONTE)(janela);
const B = janela.BZEntrega;
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HTML = ler('orcamento.html');

const material = { status: 'rascunho', enviado_em: null };
test('passos com o material por enviar: entrada feita, material agora, o resto depois; os valores vêm da proposta', () => {
  const p = B.passos({ passo: 'material', entrega_ate: null, material }, { entrada: 1200, restante: 1800 });
  assert.deepEqual(p.map(x => [x.n, x.estado]), [[1, 'feito'], [2, 'agora'], [3, 'depois'], [4, 'depois']]);
  assert.deepEqual(p.map(x => x.nome), ['Entrada paga', 'Seu material', 'Prévia do site', 'O restante e o ar']);
  assert.equal(p[1].nota, 'O prazo começa quando você enviar.');
  assert.deepEqual([p[0].valor, p[3].valor], [1200, 1800]);
  assert.deepEqual(B.passos({ passo: 'material', material }, null).map(x => x.valor), [null, null, null, null], 'sem valor conhecido, nenhum valor inventado');
});

test('passos depois do envio: a data do servidor ("5 de novembro") e o dia do envio no fuso de Campo Grande', () => {
  const e = { passo: 'producao', entrega_ate: '2026-11-05', material: { status: 'enviado', enviado_em: '2026-10-23T02:00:00+00:00' } };
  const p = B.passos(e, null);
  assert.deepEqual(p.map(x => x.estado), ['feito', 'feito', 'agora', 'depois']);
  assert.equal(p[1].nota, 'Enviado em 22 de outubro.', '02:00 UTC ainda é 22/10 em Campo Grande');
  assert.equal(p[2].nota, 'Previsão do seu site: 5 de novembro. Você vê a prévia aqui mesmo.');
  assert.equal(B.passos({ ...e, entrega_ate: null }, null)[2].nota, 'Estamos preparando o seu site. Você vê a prévia aqui mesmo.');
});

test('dataPorExtenso e diaDoInstante: a mesma conta do servidor, sem depender do fuso do aparelho', () => {
  for (const d of ['2026-01-01', '2026-11-05', '2026-12-31', '2026-03-09']) assert.equal(B.dataPorExtenso(d), dataDoServidor(d), d);
  assert.equal(B.dataPorExtenso('lixo'), '');
  assert.equal(B.diaDoInstante('2026-10-26T01:00:00Z'), '2026-10-25');
});

test('a agenda: um evento de dia inteiro na data prevista, feito no aparelho, sem nome nem telefone', () => {
  const ics = B.arquivoCalendario({ id: 'e1', entrega_ate: '2026-11-05' }, 'BZ-K7M3Q', new Date('2026-10-22T13:00:00Z'));
  const linhas = ics.split('\r\n');
  assert.equal(linhas[0], 'BEGIN:VCALENDAR'); assert.equal(linhas[linhas.length - 2], 'END:VCALENDAR');
  assert.ok(linhas.includes('DTSTART;VALUE=DATE:20261105') && linhas.includes('DTEND;VALUE=DATE:20261106'));
  assert.ok(linhas.includes('DTSTAMP:20261022T130000Z') && linhas.includes('UID:e1@beyonzero'));
  assert.ok(linhas.some(l => l.startsWith('SUMMARY:Previsão do site')));
  assert.ok(!/@(?!beyonzero)|\+55|\d{4}-\d{4}/.test(ics), 'nenhum contato dentro do arquivo');
  assert.equal(B.arquivoCalendario({ id: 'e1', entrega_ate: null }, 'BZ-K7M3Q', new Date()), null);
  assert.equal(B.arquivoCalendario({ id: 'e1', entrega_ate: '31/12' }, 'BZ-K7M3Q', new Date()), null);
});

test('o link do pedido leva o código no # (nunca na query): a origem + /orcamento#pedido=', () => {
  assert.equal(B.linkDoPedido('https://beyonzero.com.br', 'A'.repeat(32)), 'https://beyonzero.com.br/orcamento#pedido=' + 'A'.repeat(32));
});

test('nenhum href com o código, nenhum wa.me/?text=, compartilhamento pelo próprio aparelho (navigator.share)', () => {
  const js = semComentario(FONTE) + semComentario(ler('js/orcamento-material.js')) + semComentario(ler('js/orcamento-envio.js'));   /* (os arquivos novos do 3b-2) */
  const linhas = js.split('\n');
  assert.deepEqual(linhas.filter(l => /href/.test(l) && /(codigo|link|pedido=|retomar=)/i.test(l)), [], 'href com o código');
  assert.ok(!/wa\.me/.test(semComentario(FONTE)), 'o link do pedido nunca vai para um endereço de terceiro');
  assert.ok(!/[?&]text=/.test(js), 'nada de ?text=');
  assert.ok(/navigator\.share\(/.test(FONTE), 'Mandar para mim = o compartilhamento do aparelho');
  assert.ok(!/window\.open\(|location\.(href|assign)\s*=/.test(semComentario(FONTE)), 'nada de abrir/navegar com o código');
  /* a tela de abrir o pedido (do PR 2b-2) já tem um wa.me com texto FIXO para pedir link novo: o código nunca entra nele */
  assert.ok(!/whatsapp\([^)]*codigo/.test(semComentario(ler('js/orcamento-retomada.js'))), 'o código não vai para o WhatsApp');
});

test('o HTML: o acompanhamento dentro do recibo, o link do pedido sem href, o CSS e os scripts na ordem', () => {
  const ped = HTML.slice(HTML.indexOf('id="o-pedido"'), HTML.indexOf('id="o-material"'));
  assert.ok(ped.length > 200, 'o bloco existe');
  for (const id of ['o-ped-codigo', 'o-ped-passos', 'o-link', 'o-link-campo', 'o-link-texto', 'o-link-acoes', 'o-link-copiar', 'o-link-enviar', 'o-link-gerar', 'o-link-novo', 'o-link-outro', 'o-link-sair', 'o-agenda']) assert.ok(ped.includes('id="' + id + '"'), id);
  assert.equal((ped.match(/<li class="orc-passo"/g) || []).length, 4);
  assert.ok(!/<a\b/.test(ped.slice(ped.indexOf('id="o-link"'))), 'o cartão do link não tem <a> (só botões e um campo de leitura)');
  assert.ok(!/wa\.me/.test(ped), 'nenhum WhatsApp no cartão (D3)');
  assert.ok(ped.includes('Guarde o link do seu pedido') && ped.includes('Pôr na minha agenda') && ped.includes('Sair deste aparelho') && ped.includes('Gerar um link novo') && ped.includes('Continuar no computador'));
  assert.ok(HTML.includes('css/orcamento-entrega.css'));
  const ordem = ['orcamento-material-esquema.js', 'orcamento-envio.js', 'orcamento-material.js', 'orcamento-entrega.js', 'js/orcamento.js'].map(s => HTML.indexOf('src="' + (s.startsWith('js/') ? s : 'js/' + s)));
  assert.ok(ordem.every((p, i) => p > 0 && (i === 0 || p > ordem[i - 1])), 'ordem dos scripts: ' + ordem.join(','));
  assert.ok(!/ style="|<style/.test(HTML), 'CSP: nenhum style inline');
  assert.ok(/aria-live="polite"/.test(ped), 'o aviso de copiado/erro é lido pelo leitor de tela');
});

test('a volta pelo #pedido=: o 1º quadro (ancoras.js) e a abertura (orcamento-retomada.js) aceitam os dois prefixos; a API recebe a ação', () => {
  assert.match(ler('js/ancoras.js'), /#\(retomar\|pedido\)=/);
  const r = ler('js/orcamento-retomada.js');
  assert.ok(r.includes("'#pedido='") && r.includes("'abrir-pedido'") && r.includes("'#retomar='") && /retomar\(codigo, acao\)/.test(r));
  assert.match(ler('js/orcamento-api.js'), /http\('POST', acao \|\| 'retomar'/);
});

test('M4: o cartão do link — copiar quando o código está na página e não foi guardado; gerar de novo quando o link existe mas este aparelho não o guardou', () => {
  assert.equal(B.modoDoCartao({ codigo: 'x', guardado: false, linkPedido: false }), 'copiar');
  assert.equal(B.modoDoCartao({ codigo: 'x', guardado: false, linkPedido: true }), 'copiar');
  assert.equal(B.modoDoCartao({ codigo: null, guardado: false, linkPedido: true }), 'gerar', 'recarregou antes de copiar: o código se perdeu');
  assert.equal(B.modoDoCartao({ codigo: null, guardado: true, linkPedido: true }), 'nenhum');
  assert.equal(B.modoDoCartao({ codigo: 'x', guardado: true, linkPedido: true }), 'nenhum');
  assert.equal(B.modoDoCartao({ codigo: null, guardado: false, linkPedido: false }), 'nenhum', 'ainda criando');
  const api = ler('js/orcamento-api.js');
  assert.match(api, /bz-link-guardado/, 'a marca de "este aparelho já guardou o link" mora na API do navegador');
  assert.match(api, /acao === 'abrir-pedido'/, 'abrir pelo link grava a marca (quem abriu pelo link já o tem)');
});

test('o link no e-mail (19/11): a página não pede para gerar outro (o que revogaria o do e-mail); diz que ele está no e-mail; o formato é o mesmo do servidor', async () => {
  assert.equal(B.modoDoCartao({ codigo: null, guardado: false, linkPedido: true, noEmail: true }), 'email', 'o link existe e foi por e-mail: nada de "gerar"');
  assert.equal(B.modoDoCartao({ codigo: 'x', guardado: false, linkPedido: true, noEmail: false }), 'copiar', 'gerou um novo aqui: copiar, como sempre');
  assert.equal(B.modoDoCartao({ codigo: null, guardado: true, linkPedido: true, noEmail: true }), 'nenhum', 'abriu pelo link do e-mail: já o tem');
  assert.equal(B.modoDoCartao({ codigo: null, guardado: false, linkPedido: false, noEmail: true }), 'nenhum', 'sem link vivo, o do e-mail não conta');
  assert.match(FONTE, /e\.link_no_email/, 'lê o estado do servidor');
  assert.match(FONTE, /\$\('o-link-gerar'\)\.hidden = copiar;/, 'no modo e-mail o "Gerar o link e guardar" continua: o e-mail pode não ter chegado');
  for (const t of [B.textoEmail('f***@gmail.com'), B.textoEmail(null)]) { assert.match(t, /e-mail/); assert.doesNotMatch(t + B.TITULO_EMAIL, /c[óo]digo|!|—/); }
  const { linkDoPedido } = await import('../../api/_pagamentos/confirmacao.mjs');
  const X = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  assert.equal(linkDoPedido(X), B.linkDoPedido('https://beyonzero.com.br', X), 'o e-mail e a página montam o mesmo link');
});

test('entrega desligada (M5): a frase do recibo é a do servidor', async () => {
  const { FRASE_DESLIGADA } = await import('../../api/_material/interruptor.mjs');
  assert.equal(B.FRASE_DESLIGADA, FRASE_DESLIGADA);
  assert.ok(FONTE.includes('entrega_ligada === false'));
});

test('o recibo não diz mais que a Beyon Zero fala com o cliente (D1: o site vende sozinho); diz o próximo passo', () => {
  assert.ok(!/A Beyon Zero fala com você pelo contato informado/.test(HTML));
  assert.ok(/Entrada recebida\. O próximo passo é mandar o material do seu site, aqui mesmo, logo abaixo\./.test(HTML));
});

test('A1 (revisão): com a entrega desligada a página não promete o material "aqui mesmo" antes do pagamento', () => {
  /* a promessa nasce escondida e só o servidor ligado (entrega_ligada === true) a mostra: o padrão do merge é desligado */
  const tag = id => (HTML.match(new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>')) || [''])[0];
  for (const id of ['o-antes-passos', 'o-faq-fotos', 'o-atalho-fotos']) assert.match(tag(id), /\shidden[\s>]/, id + ' nasce escondido');
  assert.equal(B.promessasVisiveis({ entrega_ligada: true }), true);
  for (const E of [{ entrega_ligada: false }, {}, null, { entrega_ligada: 'ligada' }]) assert.equal(B.promessasVisiveis(E), false, JSON.stringify(E));
  const js = semComentario(FONTE);
  assert.ok(/promessasVisiveis\(E\)/.test(js) && ['o-antes-passos', 'o-faq-fotos', 'o-atalho-fotos'].every(id => js.includes("'" + id + "'")), 'atualizar liga e desliga os três pelo estado');
  /* a frase do FAQ e a do passo 2 continuam no HTML (o guarda de frases confere o texto), só escondidas */
  assert.ok(HTML.includes('Aqui mesmo, depois da entrada. Não precisa mandar nada pelo WhatsApp.'));
});

test('B6 (revisão): pedido encerrado não vira "passo 2 agora"; B5: a falha passageira do link é tentada de novo; B7: uma declaração por linha', () => {
  const m = { status: 'enviado', enviado_em: '2026-10-23T02:00:00+00:00' };
  const enc = B.passos({ passo: 'encerrada', entrega_ate: null, material: m }, null);
  assert.ok(!enc.some(p => p.estado === 'agora'), 'nenhum passo "agora" num pedido encerrado');
  assert.equal(B.passos({ passo: 'material', material }, null)[1].estado, 'agora', 'e o passo do material segue como antes');
  const js = semComentario(FONTE);
  assert.ok(!/\}[ \t]+async function/.test(js), 'duas declarações na mesma linha');
  assert.ok(/falhasLink\s*>=\s*3/.test(js), 'o link é tentado de novo (até 3 vezes) nas leituras seguintes do estado');
  assert.ok(!/pedindo = tentou = true/.test(js), 'uma falha passageira não esconde o cartão até recarregar');
});

test('copiar o link: se a área de transferência moderna recusar, cai para o copiar antigo (Task 19: o E2E headless não tem a permissão)', () => {
  assert.match(semComentario(FONTE), /writeText\(texto\)\.catch\(legado\)/);
});

test('as notas dos passos 3 e 4 por passo da entrega (3b-3c): "Previsão", nunca "Pronto até" (M2), com a entrega importada ou não', () => {
  const m = { status: 'enviado', enviado_em: '2026-10-23T02:00:00+00:00' };
  const nota = (passo, extra = {}, i = 2) => B.passos({ passo, entrega_ate: '2026-11-05', material: m, ...extra }, null)[i].nota;
  assert.equal(nota('previa'), 'Esperando a sua resposta.', 'a seção da prévia já diz o resto: a nota do passo é curta');
  assert.equal(nota('ajustes'), 'Lista recebida. Previsão: 5 de novembro.');
  assert.equal(nota('ajustes', { entrega_ate: null }), 'Lista recebida.');
  assert.equal(nota('aprovada'), 'Prévia aprovada.'); assert.equal(nota('aprovada', {}, 3), 'Site pronto. Com o restante pago, ele vai ao ar.');   /* (19/11: o restante na aprovação, o ar com ele pago) */
  assert.equal(nota('no_ar', {}, 3), 'Seu site está no ar. Falta o restante.');
  assert.equal(nota('suspensa', {}, 3), 'O restante não foi pago em 3 dias: o site saiu do ar até o pagamento.', 'sem o limite do servidor, o padrão de 3 dias');
  assert.equal(nota('suspensa', { site: { limite_dias: 5 } }, 3), 'O restante não foi pago em 5 dias: o site saiu do ar até o pagamento.', 'o número é o do servidor (site.limite_dias), como na seção do passo 4');
  assert.equal(nota('suspensa', { site: { limite_dias: 0 } }, 3), 'O restante não foi pago em 3 dias: o site saiu do ar até o pagamento.', 'limite inválido volta ao padrão');
  assert.equal(nota('concluida', {}, 3), 'Pago. Pedido concluído.');
  for (const importada of [true, false]) for (const passo of ['producao', 'previa', 'ajustes', 'aprovada', 'no_ar', 'suspensa', 'concluida']) {
    const todas = B.passos({ passo, importada, entrega_ate: '2026-11-05', material: m }, null).map(p => p.nota).join(' | ');
    assert.doesNotMatch(todas, /Pronto até/, passo + ' importada=' + importada);
  }
  assert.doesNotMatch(semComentario(FONTE), /Pronto até/, 'só "Previsão" até existir o importar-site da captação');
});

test('I1: o recibo de cima só promete o material enquanto o material é o próximo passo; da prévia em diante diz só "Entrada recebida."', () => {
  const PADRAO = 'Entrada recebida. O próximo passo é mandar o material do seu site, aqui mesmo, logo abaixo.';
  assert.ok(HTML.includes(PADRAO), 'a frase protegida segue no HTML');
  for (const passo of ['material', 'producao']) assert.equal(B.leadDoRecibo(passo, PADRAO), PADRAO, passo + ': o próximo passo ainda é o material');
  for (const passo of ['previa', 'ajustes', 'aprovada', 'no_ar', 'suspensa', 'concluida', 'encerrada']) assert.equal(B.leadDoRecibo(passo, PADRAO), 'Entrada recebida.', passo + ': o material já foi');
  for (const semPasso of [undefined, null, '']) assert.equal(B.leadDoRecibo(semPasso, PADRAO), PADRAO, 'sem entrega: a frase de sempre');
  assert.match(semComentario(FONTE), /lead\.textContent = leadDoRecibo\(e \? e\.passo : null, lead\.dataset\.padrao\)/, 'o atualizar troca o lead pelo passo da entrega');
});

test('o orcamento-entrega.js liga a tela da prévia (BZPreviaEntrega; BZPrevia é do desenho das direções) e esconde #o-previa quando a entrega some', () => {
  const js = semComentario(FONTE);
  assert.match(js, /window\.BZPreviaEntrega/); assert.doesNotMatch(js, /window\.BZPrevia\b(?!Entrega)/); assert.match(js, /prev\.atualizar\(E\)/);
  assert.equal((js.match(/\$\('o-previa'\)\.hidden = true/g) || []).length, 2, 'os dois return antecipados (interruptor desligado e sem entrega pronta)');
});

/* ---------- o cartão do link, com um DOM de mentira (revisões de 26/11: S1, T2, T3) ---------- */
const IDS = ['o-pedido', 'o-material', 'o-previa', 'o-noar', 'o-fim', 'o-ped-codigo', 'o-ped-agenda', 'o-agenda', 'o-link', 'o-link-titulo', 'o-link-texto',
  'o-link-campo', 'o-link-acoes', 'o-link-gerar', 'o-link-enviar', 'o-link-copiar', 'o-link-novo', 'o-link-outro', 'o-link-sair', 'o-link-aviso', 'o-link-outro-campo'];
function montarCartao({ linkPedido = async () => ({ criado: true, codigo: 'C'.repeat(32) }) } = {}) {
  const doc = criarDoc();
  doc.querySelector = () => null;
  const el = {};
  for (const id of IDS) { el[id] = doc.createElement('div'); el[id].id = id; el[id].dataset = {}; }
  el['o-link-gerar'].textContent = 'Gerar o link e guardar';
  const passos = doc.createElement('ol'); passos.id = 'o-ped-passos';
  for (let i = 0; i < 4; i++) { const li = doc.createElement('li'); for (let j = 0; j < 4; j++) li.appendChild(doc.createElement('span')); passos.appendChild(li); }
  const chamadas = [];
  const API = { linkPedido: novo => { chamadas.push(novo); return linkPedido(novo); } };
  const win = {};
  new Function('window', 'document', 'localStorage', 'location', 'navigator', FONTE)(win, doc, { getItem: () => null, setItem() {}, removeItem() {} }, { origin: 'https://beyonzero.com.br' }, {});
  const tela = win.BZEntrega.criar({ API, dinheiro: v => 'R$ ' + v });
  const estado = entrega => ({ conversa: { id: 'c1', etapa: 'em_producao' }, entrega_ligada: true, pedido: { codigo: 'BZ-1' },
    entrega: { id: 'e1', passo: 'material', entrega_ate: null, material: { status: 'rascunho' }, ...entrega } });
  return { el, tela, estado, chamadas };
}

test('S1: no modo e-mail o cartão mostra PARA ONDE o link foi, mascarado e por textContent; sem o dado, a frase geral', async () => {
  const m = montarCartao();
  m.tela.atualizar(m.estado({ link_pedido: true, link_no_email: true, link_no_email_para: 'f***@gmail.com' }));
  await tique();
  assert.equal(m.el['o-link'].hidden, false);
  assert.equal(m.el['o-link-titulo'].textContent, B.TITULO_EMAIL);
  assert.match(m.el['o-link-texto'].textContent, /f\*\*\*@gmail\.com/);
  assert.equal(m.chamadas.length, 0, 'o link existe: a página não pede outro');
  const n = montarCartao();
  n.tela.atualizar(n.estado({ link_pedido: true, link_no_email: true, link_no_email_para: null }));
  assert.match(n.el['o-link-texto'].textContent, /o e-mail que você usou no pagamento/);
});

test('T3: no modo e-mail, "Gerar o link e guardar" pede confirmação (o do e-mail deixa de valer); o 2º toque gera', async () => {
  const m = montarCartao();
  m.tela.atualizar(m.estado({ link_pedido: true, link_no_email: true, link_no_email_para: 'f***@gmail.com' }));
  await m.el['o-link-gerar'].onclick();
  assert.deepEqual(m.chamadas, [], 'o 1º toque não revoga nada');
  assert.match(m.el['o-link-aviso'].textContent, /e-mail/);
  await m.el['o-link-gerar'].onclick();
  assert.deepEqual(m.chamadas, [true], 'o 2º toque gera o novo');
  assert.equal(m.el['o-link-campo'].hidden, false, 'e mostra o link novo para copiar');
  /* no modo "gerar" de sempre (o link existe e não foi por e-mail), um toque basta, como antes */
  const g = montarCartao();
  g.tela.atualizar(g.estado({ link_pedido: true, link_no_email: false }));
  await g.el['o-link-gerar'].onclick();
  assert.deepEqual(g.chamadas, [true]);
});

test('T2: a corrida com o link do e-mail (o estado ainda sem link, o servidor diz que já existe): o cartão não some', async () => {
  const m = montarCartao({ linkPedido: async () => ({ criado: false }) });
  m.tela.atualizar(m.estado({ link_pedido: false, link_no_email: false }));
  for (let i = 0; i < 3; i++) await tique();
  assert.deepEqual(m.chamadas, [false]);
  assert.equal(m.el['o-link'].hidden, false, 'o link existe: o cartão aparece (gerar), em vez de sumir');
});
