/* A TELA DA PRÉVIA (PR 3b-3; spec §3 "Passo 3" e §11 D2, D4, D5). Funções puras (sem DOM) e o HTML/CSS: o endereço que o botão abre é montado pelo código só se passar na
   regra da captação (nunca texto livre); "esta é a lista 1 de 2" e a última avisa que é a última; a tela NÃO promete aprovação automática ("Seu site só segue depois da sua
   resposta."); o aprovar é um <dialog> (nada de window.confirm); botões de 44 px; nenhum blur.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL_PREVIA } from '../../api/_entrega/enderecos.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const FONTE = ler('js/orcamento-previa.js'), HTML = ler('orcamento.html'), CSS = ler('css/orcamento-previa.css');
const janela = { BZMaterialEsquema: ESQ };   /* (no navegador o esquema se põe em window.BZMaterialEsquema; aqui entra pelo import, como nos outros testes) */
new Function('window', FONTE)(janela);
const B = janela.BZPrevia;
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const texto = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const PREVIA = 'https://v1.bz-c-k7m3qa.pages.dev';
const entrega = (extra = {}) => ({ passo: 'previa', importada: true, rodadas: { usadas: 0, max: 2 }, previa: { url: PREVIA }, entrega_ate: '2026-11-05', ...extra });
const SECAO = HTML.slice(HTML.indexOf('id="o-previa"'), HTML.indexOf('</section>', HTML.indexOf('id="o-previa"')));

test('o endereço que o botão abre só existe se passar na regra da captação (a mesma de api/_entrega/enderecos.mjs)', () => {
  assert.equal(B.hrefDaPrevia(PREVIA), PREVIA);
  for (const ruim of ['http://v1.bz-c-k7m3qa.pages.dev', 'https://evil.com', 'javascript:alert(1)', PREVIA + '/x', 'https://v1.bz-c-k7m3qa.pages.dev@evil.com', '', null, undefined, 42]) assert.equal(B.hrefDaPrevia(ruim), null, String(ruim));
  /* a regra da tela é a do servidor (api/_entrega/enderecos.mjs), menos a barra final opcional: mesmo veredito nos mesmos casos */
  for (const u of [PREVIA, PREVIA + '/', 'https://v12.bz-c-k7m3qa.pages.dev', 'https://v123.bz-c-k7m3qa.pages.dev', 'https://v1.bz-c-k7m3qi.pages.dev', 'https://v1.bz-c-k7m3q1.pages.dev', 'https://bz-c-k7m3qa.pages.dev', 'http://v1.bz-c-k7m3qa.pages.dev']) {
    assert.equal(B.hrefDaPrevia(u) !== null, URL_PREVIA.test(u) && !u.endsWith('/'), u);
  }
});

test('fase: pronta pede a resposta do cliente e diz que o site só segue depois dela (D5); nunca "aprovada sozinha"', () => {
  const f = B.fase(entrega());
  assert.equal(f.fase, 'pronta'); assert.equal(f.titulo, 'Sua prévia está pronta');
  assert.equal(f.texto, 'Seu site só segue depois da sua resposta.');
  assert.equal(f.href, PREVIA); assert.equal(f.podeAjustes, true);
  assert.deepEqual([f.listaN, f.listaMax, f.ultima], [1, 2, false]);
  assert.ok(!/aprovad[ao]? (sozinh|automátic)|conta como aprovad|dias? para responder|prazo para (aprovar|responder)/i.test(JSON.stringify(f)), 'nenhum prazo nem aprovação automática (D5)');
});

test('as duas listas (D2): a 1ª é "1 de 2"; a 2ª é "2 de 2" e avisa que é a última; depois das duas, sem o botão de ajustes', () => {
  assert.deepEqual([B.fase(entrega({ rodadas: { usadas: 1, max: 2 } })).listaN, B.fase(entrega({ rodadas: { usadas: 1, max: 2 } })).ultima], [2, true]);
  const sem = B.fase(entrega({ rodadas: { usadas: 2, max: 2 } }));
  assert.equal(sem.podeAjustes, false); assert.equal(sem.fase, 'pronta');
  assert.equal(B.fase(entrega({ rodadas: { usadas: 0, max: null } })).ultima, false, 'sem limite (nulo): nunca "a última"');
});

test('ajustes recebidos e aprovada: "Previsão", nunca "Pronto até" (M2); produção e outros passos não mostram a seção', () => {
  const aj = B.fase(entrega({ passo: 'ajustes' }));
  assert.equal(aj.fase, 'ajustes'); assert.match(aj.texto, /^Recebido\. A nova prévia aparece aqui\./); assert.match(aj.texto, /Previsão: 5 de novembro\./);
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
  assert.match(s, /<fieldset[^>]*id="o-prv-contato"/); assert.match(texto(s), /Trocar o telefone ou o e-mail do site/);
  assert.match(s, /id="o-prv-wa"[^>]*type="tel"[^>]*maxlength="30"/); assert.match(s, /id="o-prv-email"[^>]*type="email"[^>]*maxlength="120"/); assert.match(s, /id="o-prv-autoriza"[^>]*type="checkbox"/);
  assert.match(s, /<label for="o-prv-wa">/); assert.match(s, /<label[^>]*for="o-prv-email">/);
  assert.match(semComentario(FONTE), /AUTORIZACAO\.texto/, 'a frase da autorização é a do material (a mesma constante), não uma escrita à mão');
  assert.match(s, /id="o-prv-ver"[^>]*target="_blank"[^>]*rel="noopener noreferrer"|id="o-prv-ver"[^>]*rel="noopener noreferrer"[^>]*target="_blank"/, 'abre em outra aba, sem referrer');
  assert.match(s, /maxlength="1500"/);
  const wa = [...s.matchAll(/href="https:\/\/wa\.me\/[^"]*"/g)];
  assert.equal(wa.length, 1, 'D3: o único WhatsApp é a "Outra dúvida?"'); assert.ok(!/\?text=/.test(wa[0][0]));
  assert.match(texto(s), /Outra dúvida\? Fale com a Beyon Zero pelo WhatsApp/);
  assert.ok(!/\sstyle="|<style/.test(s), 'CSP: nada de estilo embutido');
  assert.doesNotMatch(texto(s), /aprovad[ao]? (sozinh|automátic)|dias? para responder|prazo para (aprovar|responder)/i, 'D5: nenhuma aprovação automática nem prazo para responder');
  assert.match(HTML, /<link rel="stylesheet" href="css\/orcamento-previa\.css"/); assert.match(HTML, /<script src="js\/orcamento-previa\.js" defer>/);
});

test('a ordem: o CSS depois do orcamento-entrega.css e o script da prévia depois do material e antes de orcamento-entrega.js', () => {
  const i = s => HTML.indexOf(s);
  assert.ok(i('css/orcamento-entrega.css') > 0 && i('css/orcamento-previa.css') > i('css/orcamento-entrega.css'));
  assert.ok(i('src="js/orcamento-material.js"') < i('src="js/orcamento-previa.js"') && i('src="js/orcamento-previa.js"') < i('src="js/orcamento-entrega.js"'));
  assert.ok(i('id="o-previa"') > i('id="o-material"') && i('id="o-previa"') < i('</main>'), 'a seção fica depois do material, dentro do main');
});

test('o CSS: botões de 44 px ou mais, texto de 16 px, sem desfoque e sem sombra (regra do dono)', () => {
  assert.match(CSS, /\.orc-previa__acoes \.btn[^{]*\{[^}]*min-height:\s*44px/);
  assert.match(CSS, /\.orc-previa textarea[^{]*\{[^}]*font-size:\s*var\(--fs-b\)/);
  assert.match(CSS, /\.orc-previa input\[type="tel"\][^{]*\{[^}]*min-height:\s*44px/, 'M3: os campos do telefone e do e-mail têm 44 px e texto de 16 px');
  assert.match(CSS, /\.orc-previa__aut[^{]*\{[^}]*min-height:\s*44px/, 'a caixa de autorização também tem alvo de 44 px');
  assert.ok(!/blur\(|backdrop-filter|box-shadow|text-shadow|filter:/.test(CSS), 'nenhum desfoque nem sombra');
  assert.ok(!/blur\(|backdrop-filter/.test(ler('css/orcamento.css').match(/\.orc-dialogo[^{]*\{[^}]*\}/g).join('')), 'o fundo do <dialog> só escurece');
});

test('o dialog de aprovar: showModal, foco no "Voltar", foco volta ao botão ao fechar; nada guardado nem montado com dado do cliente', () => {
  const js = semComentario(FONTE);
  assert.match(js, /showModal\(\)/); assert.match(js, /addEventListener\('close'/);
  assert.ok(!/localStorage|sessionStorage|innerHTML|insertAdjacentHTML|document\.write/.test(js), 'nada de armazenar nem de HTML vindo de fora');
  assert.ok(!/\.href\s*=\s*[^;]*(location|texto|lista)/.test(js), 'nenhum href montado com dado do cliente');
});

test('a API do navegador: previaAjustes leva texto e rodada_base (e o contato só se preenchido); previaAprovar não leva nada além da conversa', () => {
  const api = semComentario(ler('js/orcamento-api.js'));
  assert.match(api, /previaAjustes: function \(texto, rodadaBase, contato\)/);
  assert.match(api, /'previa-ajustes'/); assert.match(api, /'previa-aprovar'/);
  assert.match(api, /rodada_base: rodadaBase/);
  assert.match(api, /corpo\.autorizo = contato\.autorizo === true/);
});

test('a volta à aba em produção recarrega o estado (a nova prévia aparece sem recarregar a página), com UMA chamada e sem relógio novo', () => {
  const esp = semComentario(ler('js/orcamento-espera.js'));
  assert.match(esp, /E\.conversa\.etapa === 'em_producao'/);
  assert.equal((esp.match(/setInterval\(/g) || []).length, 1, 'continua um relógio só (o da espera do pagamento); a volta à aba não cria outro');
  assert.ok(esp.indexOf('em_producao') > esp.indexOf("addEventListener('visibilitychange'"), 'a regra está no visibilitychange');
});
