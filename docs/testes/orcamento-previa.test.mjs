/* A TELA DA PRÉVIA (PR 3b-3; spec §3 "Passo 3" e §11 D2, D4, D5). Funções puras (sem DOM), o HTML/CSS e o comportamento de criar() com um DOM de mentira mínimo
   (como o painel-entregas.test.mjs): o endereço que o botão abre é montado pelo código só se passar na regra da captação (nunca texto livre); "esta é a lista 1 de 2" e a
   última avisa que é a última; a tela NÃO promete aprovação automática ("Seu site só segue depois da sua resposta."); o aprovar é um <dialog> (nada de window.confirm);
   botões de 44 px; nenhum blur; o global é window.BZPreviaEntrega (window.BZPrevia é do desenho das direções, js/previa.js).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL_PREVIA } from '../../api/_entrega/enderecos.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FONTE = ler('js/orcamento-previa.js'), HTML = ler('orcamento.html'), CSS = ler('css/orcamento-previa.css');
const janela = { BZMaterialEsquema: ESQ };   /* (no navegador o esquema se põe em window.BZMaterialEsquema; aqui entra pelo import, como nos outros testes) */
new Function('window', FONTE)(janela);
const B = janela.BZPreviaEntrega;
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const texto = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const PREVIA = 'https://v1.bz-c-k7m3qa.pages.dev';
const entrega = (extra = {}) => ({ passo: 'previa', importada: true, rodadas: { usadas: 0, max: 2 }, previa: { url: PREVIA }, entrega_ate: '2026-11-05', ...extra });
const SECAO = HTML.slice(HTML.indexOf('id="o-previa"'), HTML.indexOf('</section>', HTML.indexOf('id="o-previa"')));

test('o global da tela do passo 3 NÃO colide com o do desenho das direções: js/previa.js e js/orcamento-previa.js na MESMA window (orcamento.js e o visor leem window.BZPrevia)', () => {
  const w = { BZMaterialEsquema: ESQ };
  new Function('window', ler('js/previa.js'))(w);
  new Function('window', FONTE)(w);
  for (const f of ['desenhar', 'encaixar']) assert.equal(typeof w.BZPrevia[f], 'function', 'BZPrevia.' + f + ' continua sendo o do desenho das direções');
  assert.ok(w.BZPrevia.FONTES, 'BZPrevia.FONTES continua existindo');
  assert.equal(typeof w.BZPreviaEntrega.fase, 'function'); assert.equal(typeof w.BZPreviaEntrega.criar, 'function');
  assert.equal(w.BZPrevia.fase, undefined, 'a tela do passo 3 não se pendura em BZPrevia');
});

test('nenhum par de scripts de orcamento.html atribui o mesmo window.X (o último trocaria o objeto do primeiro em silêncio)', () => {
  const scripts = [...HTML.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.includes('js/previa.js') && scripts.includes('js/orcamento-previa.js') && scripts.length > 15);
  const donos = {};
  for (const s of scripts) for (const m of semComentario(ler(s)).matchAll(/\bwindow\.(\w+)\s*=(?!=)/g)) (donos[m[1]] ||= new Set()).add(s);
  assert.deepEqual(Object.entries(donos).filter(([, v]) => v.size > 1).map(([k, v]) => k + ': ' + [...v].join(' + ')), []);
  assert.deepEqual([...donos.BZPrevia], ['js/previa.js']); assert.deepEqual([...donos.BZPreviaEntrega], ['js/orcamento-previa.js']);
});

test('o endereço que o botão abre só existe se passar na regra da captação: o MESMO veredito do servidor (api/_entrega/enderecos.mjs), inclusive com a barra final', () => {
  assert.equal(B.hrefDaPrevia(PREVIA), PREVIA);
  assert.equal(B.hrefDaPrevia(PREVIA + '/'), PREVIA, 'o servidor e o banco aceitam a barra final: a tela também, e abre o endereço sem ela');
  for (const ruim of ['http://v1.bz-c-k7m3qa.pages.dev', 'https://evil.com', 'javascript:alert(1)', PREVIA + '/x', PREVIA + '?a=1', 'https://v1.bz-c-k7m3qa.pages.dev@evil.com', '', null, undefined, 42]) assert.equal(B.hrefDaPrevia(ruim), null, String(ruim));
  for (const u of [PREVIA, PREVIA + '/', PREVIA + '//', 'https://v12.bz-c-k7m3qa.pages.dev', 'https://v123.bz-c-k7m3qa.pages.dev', 'https://v1.bz-c-k7m3qi.pages.dev', 'https://v1.bz-c-k7m3q1.pages.dev', 'https://bz-c-k7m3qa.pages.dev', 'http://v1.bz-c-k7m3qa.pages.dev', 'https://v1.bz-c-k7m3qa.pages.dev/']) {
    assert.equal(B.hrefDaPrevia(u) !== null, URL_PREVIA.test(u), u);
  }
});

test('fase: pronta pede a resposta do cliente e diz que o site só segue depois dela (D5); nunca "aprovada sozinha"', () => {
  const f = B.fase(entrega());
  assert.equal(f.fase, 'pronta'); assert.equal(f.titulo, 'Sua prévia está pronta');
  assert.equal(f.texto, 'Seu site só segue depois da sua resposta.');
  assert.equal(f.href, PREVIA); assert.equal(f.podeAjustes, true); assert.equal(f.podeResponder, true);
  assert.deepEqual([f.listaN, f.listaMax, f.ultima], [1, 2, false]);
  assert.ok(!/aprovad[ao]? (sozinh|automátic)|conta como aprovad|dias? para responder|prazo para (aprovar|responder)/i.test(JSON.stringify(f)), 'nenhum prazo nem aprovação automática (D5)');
});

test('prévia pronta mas sem endereço que passe na regra: o cliente não pode aprovar o que não consegue ver (nada de aprovar nem de ajustes; só a frase e o WhatsApp)', () => {
  for (const previa of [null, {}, { url: 'https://evil.com' }, { url: 'http://v1.bz-c-k7m3qa.pages.dev' }]) {
    const f = B.fase(entrega({ previa }));
    assert.equal(f.fase, 'pronta'); assert.equal(f.href, null); assert.equal(f.podeResponder, false); assert.equal(f.podeAjustes, false);
    assert.match(f.texto, /não abriu/); assert.doesNotMatch(f.texto, /só segue depois/);
  }
});

test('as duas listas (D2): a 1ª é "1 de 2"; a 2ª é "2 de 2" e avisa que é a última; depois das duas, sem o botão de ajustes', () => {
  assert.deepEqual([B.fase(entrega({ rodadas: { usadas: 1, max: 2 } })).listaN, B.fase(entrega({ rodadas: { usadas: 1, max: 2 } })).ultima], [2, true]);
  const sem = B.fase(entrega({ rodadas: { usadas: 2, max: 2 } }));
  assert.equal(sem.podeAjustes, false); assert.equal(sem.podeResponder, true); assert.equal(sem.fase, 'pronta');
  assert.equal(B.fase(entrega({ rodadas: { usadas: 0, max: null } })).ultima, false, 'sem limite (nulo): nunca "a última"');
});

test('ajustes recebidos e aprovada: "Previsão", nunca "Pronto até" (M2); sem "Recebido." repetido; produção e outros passos não mostram a seção', () => {
  const aj = B.fase(entrega({ passo: 'ajustes' }));
  assert.equal(aj.fase, 'ajustes'); assert.equal(aj.titulo, 'Recebemos a sua lista');
  assert.equal(aj.texto, 'A nova prévia aparece aqui. Previsão: 5 de novembro.');
  assert.equal(B.fase(entrega({ passo: 'ajustes', entrega_ate: null })).texto, 'A nova prévia aparece aqui.');
  for (const importada of [true, false]) assert.doesNotMatch(B.fase(entrega({ passo: 'ajustes', importada })).texto, /Pronto até/, 'M2: só "Previsão" até existir o importar-site da captação (importada: ' + importada + ')');
  const ap = B.fase(entrega({ passo: 'aprovada' }));
  assert.equal(ap.fase, 'aprovada'); assert.match(ap.texto, /pôr o site no ar/);
  for (const p of ['material', 'producao', 'no_ar', 'suspensa', 'concluida', 'encerrada']) assert.equal(B.fase(entrega({ passo: p })).fase, 'nenhuma', p);
  assert.equal(B.fase(null).fase, 'nenhuma');
  assert.doesNotMatch(semComentario(FONTE) + SECAO, /Pronto até/);
});

test('validarLista: vazia sem contato, só espaço, com CPF/CNPJ e acima de 1.500 caracteres são recusadas com a frase certa; só o contato do site também vale (M3)', () => {
  assert.equal(B.validarLista('Trocar a foto da capa.'), null);
  assert.match(B.validarLista('   '), /Escreva/); assert.match(B.validarLista('x'.repeat(1501)), /1\.500/);
  assert.match(B.validarLista('meu CPF 123.456.789-09'), /CPF/);
  assert.equal(B.validarLista('   ', true), null, 'sem texto, mas com o telefone ou o e-mail do site preenchido: vale');
  assert.equal(B.MAX_LISTA, 1500);
});

test('M3 (22/10): validarContato usa a MESMA regra do servidor (ESQ.contatoDoSite) e exige a autorização de uso quando algum dos dois campos está preenchido', () => {
  assert.equal(B.validarContato('', '', false), null, 'os dois campos são opcionais');
  assert.equal(B.validarContato('(21) 97716-7944', 'contato@clinicasol.com.br', true), null);
  assert.match(B.validarContato('abc', '', true), /WhatsApp/); assert.match(B.validarContato('', 'a@b', true), /e-mail/);
  assert.match(B.validarContato('(21) 97716-7944', '', false), /autorização/i, 'trocar o contato exige a mesma autorização de uso do material');
  assert.match(B.validarContato('', 'contato@clinicasol.com.br', false), /autorização/i);
});

test('as frases de recusa do contato na tela são as da API (api/_vendas/fluxo-previa.mjs): o mesmo texto nos dois lados', async () => {
  const { FRASES } = await import('../../api/_vendas/fluxo-previa.mjs');
  assert.equal(B.validarContato('abc', '', true), FRASES.whatsapp);
  assert.equal(B.validarContato('', 'a@b', true), FRASES.email);
  assert.equal(B.validarContato('(21) 97716-7944', '', false), FRASES.autorizacao);
});

test('a seção #o-previa: aprovar num <dialog> (nunca confirm), o campo único com o aviso, o prazo parado (D4), o link seguro e UM só WhatsApp ("Outra dúvida?")', () => {
  const s = SECAO;
  assert.ok(s.length > 500, 'a seção existe');
  assert.match(s, /<dialog class="orc-dialogo" id="o-prv-dialogo"/); assert.ok(!/window\.confirm|\bconfirm\(/.test(semComentario(FONTE)));
  assert.match(texto(s), /Depois de aprovar, o próximo passo é pôr o site no ar\./);
  assert.match(texto(s), /Escreva tudo de uma vez/); assert.match(texto(s), /Enquanto espero a sua lista de ajustes, o prazo fica parado\./);
  assert.match(texto(s), /Não escreva CPF, CNPJ nem dados de outras pessoas\./);
  assert.match(texto(s), /Telefone e e-mail escritos aqui são apagados\. Para trocar os do site, use os campos abaixo\./);   /* M3: a lista de texto livre é redigida no servidor; a tela avisa antes e aponta os campos */
  assert.equal((s.match(/id="o-prv-aviso"/g) || []).length, 1); assert.ok(!/id="o-prv-apaga"/.test(s), 'o aviso do CPF e o do telefone são UMA nota só');
  assert.match(s, /<fieldset[^>]*id="o-prv-contato"/); assert.match(texto(s), /Trocar o telefone ou o e-mail do site/);
  assert.match(s, /id="o-prv-wa"[^>]*type="tel"[^>]*maxlength="30"/); assert.match(s, /id="o-prv-email"[^>]*type="email"[^>]*maxlength="120"/); assert.match(s, /id="o-prv-autoriza"[^>]*type="checkbox"/);
  assert.match(s, /<label for="o-prv-wa">/); assert.match(s, /<label[^>]*for="o-prv-email">/);
  assert.match(semComentario(FONTE), /AUTORIZACAO\.texto/, 'a frase da autorização é a do material (a mesma constante), não uma escrita à mão');
  assert.match(s, /id="o-prv-ver"[^>]*target="_blank"[^>]*rel="noopener noreferrer"|id="o-prv-ver"[^>]*rel="noopener noreferrer"[^>]*target="_blank"/, 'abre em outra aba, sem referrer');
  assert.match(s, /maxlength="1500"/);
  assert.match(s, /<textarea id="o-prv-lista"[^>]*autocomplete="off"/, 'Info 3: o navegador não repõe a lista que ainda não foi enviada depois de um F5');
  const wa = [...s.matchAll(/href="https:\/\/wa\.me\/[^"]*"/g)];
  assert.equal(wa.length, 1, 'D3: o único WhatsApp é a "Outra dúvida?"'); assert.ok(!/\?text=/.test(wa[0][0]));
  assert.match(texto(s), /Outra dúvida\? Fale com a Beyon Zero pelo WhatsApp/);
  assert.ok(!/\sstyle="|<style/.test(s), 'CSP: nada de estilo embutido');
  assert.doesNotMatch(texto(s), /aprovad[ao]? (sozinh|automátic)|dias? para responder|prazo para (aprovar|responder)/i, 'D5: nenhuma aprovação automática nem prazo para responder');
  for (const id of ['o-prv-erro', 'o-prv-erro-form']) assert.match(s, new RegExp('<p class="orc-erro" id="' + id + '" role="alert"></p>'), id + ': a região de aviso nasce vazia e presente (sem hidden)');
  assert.match(HTML, /<link rel="stylesheet" href="css\/orcamento-previa\.css"/); assert.match(HTML, /<script src="js\/orcamento-previa\.js" defer>/);
});

test('a ordem: o CSS depois do orcamento-entrega.css e o script da prévia depois do material e antes de orcamento-entrega.js', () => {
  const i = s => HTML.indexOf(s);
  assert.ok(i('css/orcamento-entrega.css') > 0 && i('css/orcamento-previa.css') > i('css/orcamento-entrega.css'));
  assert.ok(i('src="js/orcamento-material.js"') < i('src="js/orcamento-previa.js"') && i('src="js/orcamento-previa.js"') < i('src="js/orcamento-entrega.js"'));
  assert.ok(i('id="o-previa"') > i('id="o-material"') && i('id="o-previa"') < i('</main>'), 'a seção fica depois do material, dentro do main');
});

test('o CSS: botões de 44 px ou mais, texto de 16 px, sem desfoque e sem sombra (regra do dono); o erro mantém o tom do .orc-erro e a região de aviso não some do leitor', () => {
  assert.match(CSS, /\.orc-previa__acoes \.btn[^{]*\{[^}]*min-height:\s*44px/);
  assert.match(CSS, /\.orc-previa textarea[^{]*\{[^}]*font-size:\s*var\(--fs-b\)/);
  assert.match(CSS, /\.orc-previa input\[type="tel"\][^{]*\{[^}]*min-height:\s*44px/, 'M3: os campos do telefone e do e-mail têm 44 px e texto de 16 px');
  assert.match(CSS, /\.orc-previa__aut[^{]*\{[^}]*min-height:\s*44px/, 'a caixa de autorização também tem alvo de 44 px');
  assert.ok(!/blur\(|backdrop-filter|box-shadow|text-shadow|filter:/.test(CSS), 'nenhum desfoque nem sombra');
  assert.ok(!/blur\(|backdrop-filter/.test(ler('css/orcamento.css').match(/\.orc-dialogo[^{]*\{[^}]*\}/g).join('')), 'o fundo do <dialog> só escurece');
  assert.ok(!/orc-erro[^{]*\{[^}]*\bcolor:/.test(CSS), 'o erro usa o tom do .orc-erro original, não um branco da seção');
  assert.ok(!/orc-erro[^{]*:empty[^{]*\{[^}]*display:\s*none/.test(CSS), 'role="alert" vazio não nasce em display:none (o leitor não anunciaria o 1º erro)');
});

test('o dialog de aprovar: showModal, foco no "Voltar", foco volta ao botão ao fechar; nada guardado nem montado com dado do cliente', () => {
  const js = semComentario(FONTE);
  assert.match(js, /showModal\(\)/); assert.match(js, /addEventListener\('close'/);
  assert.ok(!/localStorage|sessionStorage|innerHTML|insertAdjacentHTML|document\.write/.test(js), 'nada de armazenar nem de HTML vindo de fora');
  assert.ok(!/\.href\s*=\s*[^;]*(location|texto|lista)/.test(js), 'nenhum href montado com dado do cliente');
});

/* ---------- o comportamento de criar(), com um DOM de mentira mínimo ---------- */
const IDS = ['o-previa', 'o-prv-titulo', 'o-prv-texto', 'o-prv-ver-acoes', 'o-prv-ver', 'o-prv-botoes', 'o-prv-aprovar', 'o-prv-ajustes', 'o-prv-sem-listas', 'o-prv-duvida', 'o-prv-form', 'o-prv-lista-n',
  'o-prv-lista', 'o-prv-contador', 'o-prv-contato', 'o-prv-wa', 'o-prv-email', 'o-prv-autoriza', 'o-prv-autoriza-texto', 'o-prv-erro-form', 'o-prv-erro', 'o-prv-enviar', 'o-prv-cancelar', 'o-prv-dialogo',
  'o-prv-voltar', 'o-prv-confirmar', 'o-prv-duvida-lead', 'o-prv-duvida-wa'];
const falha = (status, mensagem, dados = {}) => Object.assign(new Error(mensagem), { status, dados });
const estado = (passo = 'previa', rodadas = { usadas: 0, max: 2 }, url = PREVIA) => ({ conversa: { etapa: 'em_producao' }, entrega: { passo, rodadas, previa: { url }, entrega_ate: '2026-11-05' } });

function montar({ comEsquema = true } = {}) {
  const doc = { activeElement: null, body: null, getElementById(id) { if (!this.els[id]) throw new Error('id fora do HTML: ' + id); return this.els[id]; }, els: {} };
  for (const id of IDS) {
    doc.els[id] = { id, textContent: '', hidden: false, value: '', checked: false, href: '', open: false, atributos: {}, ouvintes: {}, filhos: [],
      addEventListener(t, f) { (this.ouvintes[t] ||= []).push(f); },
      setAttribute(k, v) { this.atributos[k] = v; }, removeAttribute(k) { delete this.atributos[k]; },
      focus() { doc.activeElement = this; }, showModal() { this.open = true; },
      close() { if (!this.open) return; this.open = false; for (const f of this.ouvintes.close || []) f({}); },
      contains(x) { return x === this || this.filhos.includes(x); },
      async disparar(t, ev = { preventDefault() {} }) { for (const f of this.ouvintes[t] || []) await f(ev); } };
  }
  doc.els['o-prv-dialogo'].filhos = [doc.els['o-prv-voltar'], doc.els['o-prv-confirmar']];
  doc.body = { id: 'body' }; doc.activeElement = doc.body;
  const ctx = { chamadas: [], recargas: 0, falhaDaRecarga: null, proximo: null, falhaDaAcao: null, travar: null };
  const API = {
    async previaAjustes(...a) { ctx.chamadas.push(['ajustes', ...a]); if (ctx.travar) await ctx.travar; if (ctx.falhaDaAcao) throw ctx.falhaDaAcao; return { ok: true }; },
    async previaAprovar(...a) { ctx.chamadas.push(['aprovar', ...a]); if (ctx.falhaDaAcao) throw ctx.falhaDaAcao; return { ok: true }; }
  };
  const win = {};
  if (comEsquema) win.BZMaterialEsquema = ESQ;
  win.BZMaterialRecarregar = async () => { ctx.recargas++; if (ctx.falhaDaRecarga) throw ctx.falhaDaRecarga; if (ctx.proximo) P.atualizar(ctx.proximo); };
  new Function('window', 'document', FONTE)(win, doc);
  const P = win.BZPreviaEntrega.criar({ API });
  return { el: doc.els, doc, ctx, P, foco: () => doc.activeElement && doc.activeElement.id };
}
const preencher = (t, { lista = 'Trocar a foto da capa.', wa = '', email = '', autoriza = false } = {}) => { t.el['o-prv-lista'].value = lista; t.el['o-prv-wa'].value = wa; t.el['o-prv-email'].value = email; t.el['o-prv-autoriza'].checked = autoriza; };

test('criar: a prévia pronta mostra o botão de ver e os dois de resposta; o formulário e o WhatsApp ficam escondidos', () => {
  const t = montar(); t.P.atualizar(estado());
  assert.equal(t.el['o-previa'].hidden, false); assert.equal(t.el['o-prv-titulo'].textContent, 'Sua prévia está pronta');
  assert.equal(t.el['o-prv-ver-acoes'].hidden, false); assert.equal(t.el['o-prv-ver'].href, PREVIA);
  assert.deepEqual([t.el['o-prv-botoes'].hidden, t.el['o-prv-ajustes'].hidden, t.el['o-prv-form'].hidden, t.el['o-prv-duvida'].hidden, t.el['o-prv-sem-listas'].hidden], [false, false, true, true, true]);
  assert.equal(t.el['o-prv-autoriza-texto'].textContent, ESQ.AUTORIZACAO.texto, 'a frase da autorização é a constante do esquema');
  assert.equal(t.el['o-prv-contato'].hidden, false);
  assert.equal(montar({ comEsquema: false }).el['o-prv-contato'].hidden, true, 'sem o esquema carregado, a tela não oferece trocar o contato (não dá para conferir)');
});

test('criar: sem endereço que passe na regra, NÃO mostra aprovar nem ajustes: só a frase de que a prévia não abriu e o único WhatsApp', () => {
  const t = montar(); t.P.atualizar(estado('previa', { usadas: 0, max: 2 }, 'https://evil.com'));
  assert.match(t.el['o-prv-texto'].textContent, /não abriu/);
  assert.equal(t.el['o-prv-ver-acoes'].hidden, true); assert.equal(t.el['o-prv-botoes'].hidden, true); assert.equal(t.el['o-prv-form'].hidden, true);
  assert.equal(t.el['o-prv-duvida'].hidden, false); assert.equal(t.el['o-prv-sem-listas'].hidden, true);
  t.P.atualizar(estado()); assert.equal(t.el['o-prv-botoes'].hidden, false, 'com o endereço bom, volta o normal'); assert.equal(t.el['o-prv-duvida'].hidden, true);
});

test('criar: depois das duas listas some "Quero ajustes", fica "Aprovar" e entra a frase com o WhatsApp', () => {
  const t = montar(); t.P.atualizar(estado('previa', { usadas: 2, max: 2 }));
  assert.deepEqual([t.el['o-prv-botoes'].hidden, t.el['o-prv-ajustes'].hidden, t.el['o-prv-sem-listas'].hidden, t.el['o-prv-duvida'].hidden], [false, true, false, false]);
});

test('criar: enviar a lista -> a API recebe texto aparado, a rodada que a tela viu e o contato; limpa o formulário, recarrega uma vez e leva o foco ao título', async () => {
  const t = montar(); t.P.atualizar(estado());
  await t.el['o-prv-ajustes'].disparar('click');
  assert.equal(t.el['o-prv-form'].hidden, false); assert.equal(t.el['o-prv-botoes'].hidden, true); assert.equal(t.foco(), 'o-prv-lista');
  preencher(t, { lista: '  Trocar a foto da capa.  ', wa: '(21) 97716-7944', autoriza: true });
  t.ctx.proximo = estado('ajustes', { usadas: 1, max: 2 });
  await t.el['o-prv-form'].disparar('submit');
  assert.deepEqual(t.ctx.chamadas, [['ajustes', 'Trocar a foto da capa.', 0, { whatsapp: '(21) 97716-7944', email: '', autorizo: true }]]);
  assert.deepEqual(['o-prv-lista', 'o-prv-wa', 'o-prv-email'].map(i => t.el[i].value), ['', '', '']); assert.equal(t.el['o-prv-autoriza'].checked, false);
  assert.equal(t.ctx.recargas, 1); assert.equal(t.foco(), 'o-prv-titulo');
  assert.equal(t.el['o-prv-titulo'].textContent, 'Recebemos a sua lista'); assert.equal(t.el['o-prv-form'].hidden, true);
  assert.equal(t.el['o-prv-erro'].textContent + t.el['o-prv-erro-form'].textContent, '');
  assert.equal(t.el['o-prv-enviar'].atributos['aria-disabled'], undefined, 'o botão volta a valer');
});

test('criar: sem contato, a API recebe contato nulo; só o contato (sem texto) também vale', async () => {
  const t = montar(); t.P.atualizar(estado()); await t.el['o-prv-ajustes'].disparar('click');
  preencher(t); await t.el['o-prv-form'].disparar('submit');
  assert.equal(t.ctx.chamadas[0][3], null);
  await t.el['o-prv-ajustes'].disparar('click'); preencher(t, { lista: '', email: 'contato@clinicasol.com.br', autoriza: true });
  await t.el['o-prv-form'].disparar('submit');
  assert.deepEqual(t.ctx.chamadas[1].slice(1), ['', 0, { whatsapp: '', email: 'contato@clinicasol.com.br', autorizo: true }]);
});

test('criar: a ação deu certo e a releitura falhou -> NÃO mostra falha de envio (o erro da releitura é engolido; a pessoa já mandou)', async () => {
  const t = montar(); t.P.atualizar(estado()); await t.el['o-prv-ajustes'].disparar('click'); preencher(t);
  t.ctx.falhaDaRecarga = falha(0, 'Sem conexão.');
  await t.el['o-prv-form'].disparar('submit');
  assert.equal(t.ctx.chamadas.length, 1); assert.equal(t.ctx.recargas, 1);
  assert.equal(t.el['o-prv-erro'].textContent + t.el['o-prv-erro-form'].textContent, '', 'nenhuma mensagem de falha');
  assert.equal(t.foco(), 'o-prv-titulo'); assert.equal(t.el['o-prv-form'].hidden, true);
  const t2 = montar(); t2.P.atualizar(estado()); t2.ctx.falhaDaRecarga = falha(0, 'Sem conexão.');
  await t2.el['o-prv-aprovar'].disparar('click'); await t2.el['o-prv-confirmar'].disparar('click');
  assert.equal(t2.el['o-prv-erro'].textContent, ''); assert.equal(t2.el['o-prv-dialogo'].open, false); assert.equal(t2.foco(), 'o-prv-titulo');
});

test('criar: lista vazia ou contato sem autorização não chamam a API: a frase aparece no formulário (textContent) e o foco vai ao campo certo', async () => {
  const t = montar(); t.P.atualizar(estado()); await t.el['o-prv-ajustes'].disparar('click');
  preencher(t, { lista: '   ' }); await t.el['o-prv-form'].disparar('submit');
  assert.match(t.el['o-prv-erro-form'].textContent, /^Escreva/); assert.equal(t.foco(), 'o-prv-lista');
  preencher(t, { wa: '(21) 97716-7944', autoriza: false }); await t.el['o-prv-form'].disparar('submit');
  assert.match(t.el['o-prv-erro-form'].textContent, /autorização/); assert.equal(t.foco(), 'o-prv-autoriza');
  preencher(t, { wa: 'abc', autoriza: true }); await t.el['o-prv-form'].disparar('submit');
  assert.match(t.el['o-prv-erro-form'].textContent, /WhatsApp/); assert.equal(t.foco(), 'o-prv-wa');
  assert.equal(t.ctx.chamadas.length, 0);
});

test('criar: 422 (e outros erros comuns) aparece no formulário, em textContent, sem recarregar; com a saída pelo WhatsApp só quando a API manda', async () => {
  const t = montar(); t.P.atualizar(estado()); await t.el['o-prv-ajustes'].disparar('click'); preencher(t);
  t.ctx.falhaDaAcao = falha(422, 'Não escreva CPF, CNPJ nem números soltos de 11 ou 14 dígitos aqui. Telefone e e-mail do site vão nos campos próprios.');
  await t.el['o-prv-form'].disparar('submit');
  assert.match(t.el['o-prv-erro-form'].textContent, /^Não escreva CPF/); assert.equal(t.el['o-prv-erro'].textContent, ''); assert.equal(t.ctx.recargas, 0);
  assert.equal(t.el['o-prv-duvida'].hidden, true); assert.equal(t.el['o-prv-form'].hidden, false, 'o formulário segue aberto com o que a pessoa escreveu');
  assert.equal(t.el['o-prv-lista'].value, 'Trocar a foto da capa.');
  t.ctx.falhaDaAcao = falha(503, 'Recebemos a sua entrada. A Beyon Zero fala com você pelo WhatsApp para o próximo passo.', { whatsapp: true });
  await t.el['o-prv-form'].disparar('submit');
  assert.match(t.el['o-prv-erro-form'].textContent, /Beyon Zero fala com você/); assert.equal(t.el['o-prv-duvida'].hidden, false, 'a API mandou a saída pelo WhatsApp: o único link aparece');
  t.ctx.falhaDaAcao = null; t.ctx.proximo = estado('ajustes', { usadas: 1, max: 2 }); await t.el['o-prv-form'].disparar('submit');
  assert.equal(t.el['o-prv-duvida'].hidden, true, 'depois de mandar, a saída some'); assert.equal(t.el['o-prv-erro-form'].textContent, '');
});

test('criar: 409 "a prévia mudou" -> recarrega ANTES e a frase aparece FORA do formulário (o recarregar fecha o formulário), em textContent', async () => {
  const t = montar(); t.P.atualizar(estado()); await t.el['o-prv-ajustes'].disparar('click'); preencher(t);
  t.ctx.falhaDaAcao = falha(409, 'A prévia mudou enquanto você escrevia (outra aba?). Confira e tente de novo.');
  t.ctx.proximo = estado('previa', { usadas: 1, max: 2 }, 'https://v2.bz-c-k7m3qa.pages.dev');
  await t.el['o-prv-form'].disparar('submit');
  assert.equal(t.ctx.recargas, 1);
  assert.equal(t.el['o-prv-erro'].textContent, 'A prévia mudou enquanto você escrevia (outra aba?). Confira e tente de novo.', 'a frase sobrevive à releitura e fica onde a pessoa vê');
  assert.equal(t.el['o-prv-erro-form'].textContent, ''); assert.equal(t.el['o-prv-form'].hidden, true);
  assert.equal(t.el['o-prv-ver'].href, 'https://v2.bz-c-k7m3qa.pages.dev', 'e a tela já mostra a prévia nova');
  assert.equal(t.el['o-prv-lista-n'].textContent.startsWith('Esta é a lista 2 de 2.'), true);
  /* 409 com a saída pelo WhatsApp (passo errado) */
  const u = montar(); u.P.atualizar(estado()); await u.el['o-prv-ajustes'].disparar('click'); preencher(u);
  u.ctx.falhaDaAcao = falha(409, 'As duas listas de ajuste já foram usadas. O que passar disso é orçado à parte: fale com a Beyon Zero pelo WhatsApp.', { whatsapp: true });
  u.ctx.proximo = estado('previa', { usadas: 2, max: 2 }); await u.el['o-prv-form'].disparar('submit');
  assert.match(u.el['o-prv-erro'].textContent, /duas listas/); assert.equal(u.el['o-prv-duvida'].hidden, false);
});

test('criar: o envio duplo é bloqueado (dois submits seguidos chamam a API uma vez só)', async () => {
  const t = montar(); t.P.atualizar(estado()); await t.el['o-prv-ajustes'].disparar('click'); preencher(t);
  let soltar; t.ctx.travar = new Promise(r => { soltar = r; });
  const a = t.el['o-prv-form'].disparar('submit'), b = t.el['o-prv-form'].disparar('submit');
  assert.equal(t.el['o-prv-enviar'].atributos['aria-disabled'], 'true'); assert.equal(t.el['o-prv-form'].atributos['aria-busy'], 'true');
  soltar(); await Promise.all([a, b]);
  assert.equal(t.ctx.chamadas.length, 1);
});

test('criar: "Voltar" do formulário devolve os botões e o foco; aprovar abre o dialog com o foco no "Voltar", Esc devolve o foco ao botão', async () => {
  const t = montar(); t.P.atualizar(estado());
  await t.el['o-prv-ajustes'].disparar('click'); await t.el['o-prv-cancelar'].disparar('click');
  assert.equal(t.el['o-prv-form'].hidden, true); assert.equal(t.el['o-prv-botoes'].hidden, false); assert.equal(t.foco(), 'o-prv-ajustes');
  await t.el['o-prv-aprovar'].disparar('click');
  assert.equal(t.el['o-prv-dialogo'].open, true); assert.equal(t.foco(), 'o-prv-voltar');
  t.el['o-prv-dialogo'].close();   /* (Esc fecha o dialog do navegador e dispara 'close') */
  assert.equal(t.foco(), 'o-prv-aprovar');
  await t.el['o-prv-aprovar'].disparar('click'); await t.el['o-prv-voltar'].disparar('click');
  assert.equal(t.el['o-prv-dialogo'].open, false); assert.equal(t.foco(), 'o-prv-aprovar'); assert.equal(t.ctx.chamadas.length, 0, 'voltar não aprova nada');
});

test('B1: aprovar manda a rodada da prévia que está na tela, e uma releitura (volta à aba) troca a rodada junto com a prévia', async () => {
  const t = montar(); t.P.atualizar(estado('previa', { usadas: 1, max: 2 }));
  await t.el['o-prv-aprovar'].disparar('click'); await t.el['o-prv-confirmar'].disparar('click');
  assert.deepEqual(t.ctx.chamadas, [['aprovar', 1]]);
  const u = montar(); u.P.atualizar(estado('previa', { usadas: 0, max: 2 })); u.P.atualizar(estado('previa', { usadas: 1, max: 2 }));
  await u.el['o-prv-aprovar'].disparar('click'); await u.el['o-prv-confirmar'].disparar('click');
  assert.deepEqual(u.ctx.chamadas, [['aprovar', 1]], 'a tela releu e mostra a v2: manda a rodada da v2');
});

test('erros sem frase da API: voz de pessoa ("Não consegui mandar/aprovar agora"); a frase que vem da API continua mandando', async () => {
  const t = montar(); t.P.atualizar(estado());
  await t.el['o-prv-ajustes'].disparar('click'); preencher(t); t.ctx.falhaDaAcao = falha(0, '');
  await t.el['o-prv-form'].disparar('submit');
  assert.equal(t.el['o-prv-erro-form'].textContent, 'Não consegui mandar agora. Tente de novo.');
  const u = montar(); u.P.atualizar(estado()); await u.el['o-prv-aprovar'].disparar('click'); u.ctx.falhaDaAcao = falha(0, '');
  await u.el['o-prv-confirmar'].disparar('click');
  assert.equal(u.el['o-prv-erro'].textContent, 'Não consegui aprovar agora. Tente de novo.');
  assert.doesNotMatch(semComentario(FONTE), /Não foi possível/, 'nenhum erro genérico de sistema na tela da prévia');
});

test('rodadas ausente na entrega: a tela não quebra, trata como a 1ª lista e aprova com a rodada 0 (fase() já tolerava)', async () => {
  const sem = { conversa: { etapa: 'em_producao' }, entrega: { passo: 'previa', previa: { url: PREVIA }, entrega_ate: '2026-11-05' } };
  const t = montar(); t.P.atualizar(sem);
  assert.equal(t.el['o-previa'].hidden, false); assert.equal(t.el['o-prv-lista-n'].textContent, 'Esta é a lista 1 de 2.');
  await t.el['o-prv-aprovar'].disparar('click'); await t.el['o-prv-confirmar'].disparar('click');
  assert.deepEqual(t.ctx.chamadas, [['aprovar', 0]]);
});

test('"Outra dúvida?" acompanha a fase: sem endereço que abra diz "Não conseguiu abrir? Fale comigo pelo WhatsApp."; nas outras, a frase de sempre; sempre UM link', () => {
  const t = montar(); t.P.atualizar(estado('previa', { usadas: 0, max: 2 }, 'https://evil.com'));
  assert.equal(t.el['o-prv-duvida'].hidden, false);
  assert.equal(t.el['o-prv-duvida-lead'].textContent, 'Não conseguiu abrir? '); assert.equal(t.el['o-prv-duvida-wa'].textContent, 'Fale comigo pelo WhatsApp');
  t.P.atualizar(estado('previa', { usadas: 2, max: 2 }));
  assert.equal(t.el['o-prv-duvida'].hidden, false);
  assert.equal(t.el['o-prv-duvida-lead'].textContent, 'Outra dúvida? '); assert.equal(t.el['o-prv-duvida-wa'].textContent, 'Fale com a Beyon Zero pelo WhatsApp');
  assert.match(SECAO, /<span id="o-prv-duvida-lead">Outra dúvida\? <\/span><a id="o-prv-duvida-wa"/, 'o HTML nasce com a frase de sempre');
  assert.equal([...SECAO.matchAll(/href="https:\/\/wa\.me\//g)].length, 1, 'continua um link de WhatsApp só');
});

test('1.500 vem de uma constante: o HTML (maxlength), a tela e o servidor concordam, e as frases geradas por JS usam a MAX_LISTA', async () => {
  const { MAX_LISTA: DOSERVIDOR } = await import('../../api/_vendas/fluxo-previa.mjs');
  assert.equal(B.MAX_LISTA, DOSERVIDOR); assert.equal(Number(/id="o-prv-lista"[^>]*maxlength="(\d+)"/.exec(HTML)[1]), B.MAX_LISTA);
  assert.doesNotMatch(semComentario(FONTE), /1\.500/, 'o 1.500 das frases sai de MAX_LISTA, não de texto escrito à mão');
  assert.equal(B.validarLista('x'.repeat(B.MAX_LISTA + 1), false), 'A lista passou de 1.500 caracteres. Resuma ou tire o que não for essencial.');
});

test('criar: aprovar chama a API uma vez, fecha o dialog, recarrega e leva o foco ao título; o erro da API aparece fora do formulário e fecha o dialog', async () => {
  const t = montar(); t.P.atualizar(estado());
  await t.el['o-prv-aprovar'].disparar('click');
  t.ctx.proximo = estado('aprovada');
  const a = t.el['o-prv-confirmar'].disparar('click'), b = t.el['o-prv-confirmar'].disparar('click');
  await Promise.all([a, b]);
  assert.deepEqual(t.ctx.chamadas, [['aprovar', 0]], 'toque duplo aprova uma vez só, dizendo a rodada que a tela viu (B1)');
  assert.equal(t.el['o-prv-dialogo'].open, false); assert.equal(t.ctx.recargas, 1); assert.equal(t.foco(), 'o-prv-titulo');
  assert.equal(t.el['o-prv-titulo'].textContent, 'Prévia aprovada');
  /* erro: 409 do servidor (passo mudou) com a saída pelo WhatsApp */
  const u = montar(); u.P.atualizar(estado()); await u.el['o-prv-aprovar'].disparar('click');
  u.ctx.falhaDaAcao = falha(409, 'Esta etapa não está disponível agora. Se precisar, fale com a Beyon Zero pelo WhatsApp.', { whatsapp: true });
  u.ctx.proximo = estado('previa'); await u.el['o-prv-confirmar'].disparar('click');
  assert.equal(u.el['o-prv-dialogo'].open, false); assert.match(u.el['o-prv-erro'].textContent, /não está disponível/); assert.equal(u.el['o-prv-duvida'].hidden, false);
  assert.equal(u.el['o-prv-confirmar'].atributos['aria-disabled'], undefined);
  const v = montar(); v.P.atualizar(estado()); await v.el['o-prv-aprovar'].disparar('click'); v.ctx.falhaDaAcao = falha(0, 'Sem conexão. Confira a internet e tente de novo.');
  await v.el['o-prv-confirmar'].disparar('click');
  assert.equal(v.el['o-prv-erro'].textContent, 'Sem conexão. Confira a internet e tente de novo.'); assert.equal(v.ctx.recargas, 0, 'sem rede não adianta reler');
});

test('criar: o dialog aberto fecha sozinho se a seção deixa de estar ativa ou de ser a prévia pronta; o erro velho some quando a prévia ou o passo muda; o formulário se esvazia', async () => {
  const t = montar(); t.P.atualizar(estado());
  await t.el['o-prv-aprovar'].disparar('click'); assert.equal(t.el['o-prv-dialogo'].open, true);
  t.P.atualizar(estado('aprovada')); assert.equal(t.el['o-prv-dialogo'].open, false, 'outra aba aprovou: o dialog não fica aberto');
  const u = montar(); u.P.atualizar(estado()); await u.el['o-prv-aprovar'].disparar('click');
  u.P.atualizar({ conversa: { etapa: 'concluido' }, entrega: null }); assert.equal(u.el['o-prv-dialogo'].open, false); assert.equal(u.el['o-previa'].hidden, true);
  /* erro velho */
  const v = montar(); v.P.atualizar(estado()); await v.el['o-prv-aprovar'].disparar('click');
  v.ctx.falhaDaAcao = falha(0, 'Sem conexão.'); await v.el['o-prv-confirmar'].disparar('click'); assert.equal(v.el['o-prv-erro'].textContent, 'Sem conexão.');
  v.P.atualizar(estado()); assert.equal(v.el['o-prv-erro'].textContent, 'Sem conexão.', 'uma releitura igual NÃO apaga o aviso');
  v.P.atualizar(estado('previa', { usadas: 1, max: 2 })); assert.equal(v.el['o-prv-erro'].textContent, '', 'outra prévia: o aviso velho some');
  /* formulário */
  const w = montar(); w.P.atualizar(estado()); await w.el['o-prv-ajustes'].disparar('click'); preencher(w, { wa: '(21) 97716-7944', autoriza: true });
  w.P.atualizar(estado('aprovada'));
  assert.deepEqual(['o-prv-lista', 'o-prv-wa', 'o-prv-email'].map(i => w.el[i].value), ['', '', '']); assert.equal(w.el['o-prv-autoriza'].checked, false); assert.equal(w.el['o-prv-form'].hidden, true);
  /* uma releitura da mesma prévia NÃO fecha a lista que a pessoa escreve */
  const x = montar(); x.P.atualizar(estado()); await x.el['o-prv-ajustes'].disparar('click'); preencher(x); x.P.atualizar(estado());
  assert.equal(x.el['o-prv-form'].hidden, false); assert.equal(x.el['o-prv-lista'].value, 'Trocar a foto da capa.');
});

test('criar: a lista vai só em textContent/value: nada de innerHTML, e o contador conta o que foi digitado', async () => {
  const t = montar(); t.P.atualizar(estado()); await t.el['o-prv-ajustes'].disparar('click');
  t.el['o-prv-lista'].value = '<b>oi</b>'; await t.el['o-prv-lista'].disparar('input');
  assert.equal(t.el['o-prv-contador'].textContent, '9 de 1.500 caracteres');
});

/* ---------- a API do navegador, com um fetch simulado ---------- */
function carregarApi() {
  const CONV = '11111111-1111-4111-8111-111111111111', pedidos = [];
  const guardado = JSON.stringify({ token: 'T0KEN', refresh: 'R', expira_em: 4e9, conversa_id: CONV });
  const ctx = vm.createContext({ window: { addEventListener() {} }, document: { dispatchEvent() {} }, localStorage: { getItem: k => (k === 'bz-orcamento' ? guardado : null), setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null }, AbortController, setTimeout, clearTimeout, encodeURIComponent,
    fetch: async (url, init) => { pedidos.push({ url, init }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
  vm.runInContext(ler('js/orcamento-api.js'), ctx);
  return { API: ctx.window.BZOrcamento, pedidos, CONV };
}

test('a API do navegador: previaAjustes manda por POST o corpo que o servidor aceita (conversa_id, texto, rodada_base e só o contato preenchido); previaAprovar a conversa e a rodada que a tela viu (B1)', async () => {
  const { API, pedidos, CONV } = carregarApi();
  const ACEITOS = ['conversa_id', 'texto', 'rodada_base', 'whatsapp', 'email', 'autorizo'];   /* = soCom(corpo, [...]) de api/_vendas/fluxo-previa.mjs */
  await API.previaAjustes('Trocar a foto.', 1, null);
  await API.previaAjustes('Trocar a foto.', 0, { whatsapp: '(21) 97716-7944', email: '', autorizo: true });
  await API.previaAjustes('', 0, { whatsapp: '', email: 'contato@clinicasol.com.br', autorizo: true });
  await API.previaAprovar(1);
  const corpos = pedidos.map(p => JSON.parse(p.init.body));
  assert.deepEqual(corpos, [
    { conversa_id: CONV, texto: 'Trocar a foto.', rodada_base: 1 },
    { conversa_id: CONV, texto: 'Trocar a foto.', rodada_base: 0, whatsapp: '(21) 97716-7944', autorizo: true },
    { conversa_id: CONV, texto: '', rodada_base: 0, email: 'contato@clinicasol.com.br', autorizo: true },
    { conversa_id: CONV, rodada_base: 1 }]);
  for (const c of corpos) for (const k of Object.keys(c)) assert.ok(ACEITOS.includes(k), 'campo que o servidor recusaria: ' + k);
  assert.deepEqual(pedidos.map(p => [p.init.method, p.url]), [['POST', '/api/vendas?acao=previa-ajustes'], ['POST', '/api/vendas?acao=previa-ajustes'], ['POST', '/api/vendas?acao=previa-ajustes'], ['POST', '/api/vendas?acao=previa-aprovar']]);
  assert.equal(pedidos[0].init.headers.authorization, 'Bearer T0KEN');
});

test('a volta à aba em produção recarrega o estado (a nova prévia aparece sem recarregar a página), com UMA chamada e sem relógio novo (executado com um DOM de mentira)', () => {
  const ouvintes = {}, doc = { hidden: false, addEventListener(t, f) { ouvintes[t] = f; } };
  let relogios = 0;
  const win = {}; new Function('window', 'document', 'setInterval', ler('js/orcamento-espera.js'))(win, doc, () => { relogios++; return 1; });
  let leituras = 0, E = { conversa: { etapa: 'em_producao' } };
  win.BZEspera.criar({ recarregar: async () => { leituras++; }, estado: () => E, emVoo: () => false, temSessao: () => true, relogioDosCartoes() {}, avisar() {}, falhou() {}, sessaoTerminou: () => false, avisarSessao() {} });
  assert.equal(typeof ouvintes.visibilitychange, 'function', 'a espera escuta a volta à aba');
  ouvintes.visibilitychange(); assert.equal(leituras, 1, 'em produção: uma leitura ao voltar'); assert.equal(relogios, 0, 'e nenhum relógio novo');
  doc.hidden = true; ouvintes.visibilitychange(); assert.equal(leituras, 1, 'aba escondida: não lê');
  doc.hidden = false; E = { conversa: { etapa: 'conversa' } }; ouvintes.visibilitychange(); assert.equal(leituras, 1, 'etapa que não espera nada de fora: não lê');
  E = { conversa: { etapa: 'aguardando_pagamento' } }; ouvintes.visibilitychange(); assert.equal(leituras, 2, 'o pagamento por fora continua lendo');
});
