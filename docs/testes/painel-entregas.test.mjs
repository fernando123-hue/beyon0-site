/* OS AVISOS DA D1 NO PAINEL (PR 3b-3c, Task 11; spec §1 item 3 e §12): os 6 momentos que o dono avisa (prévia pronta, site no ar, material parado, aviso prévio do apagamento
   do material e os 2 lembretes do restante), cada um com a mensagem pronta; o link de retomada de uso único NUNCA vai num href (nem wa.me/?text=, nem mailto com corpo): o dono
   copia e cola. Sem innerHTML (tudo por textContent). O módulo é JS de navegador (IIFE): roda aqui com um window de mentira.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MOMENTOS_DE_AVISO } from '../../api/_entrega/painel-entrega.mjs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FONTE = ler('js/painel-entregas.js'), COMUM = ler('js/painel-pedido-comum.js'), HTML = ler('painel.html'), CSS = ler('painel.css');
const janela = {};
new Function('window', 'document', FONTE)(janela, { getElementById: () => null, addEventListener() {} });   /* (sem os elementos do painel o módulo só expõe os textos) */
const T = janela.BZPainelEntregas.TEXTOS;
const LINK = 'https://x.test/orcamento#retomar=ABC';

test('há texto pronto para cada momento que a API do dono lista, nem um a mais nem a menos', () => {
  assert.deepEqual(Object.keys(T).sort(), [...MOMENTOS_DE_AVISO].sort());
  assert.equal(Object.keys(T).length, 6);
});

test('os 6 textos: o link entra, valem 7 dias e abrem uma vez, sem preço, sem "Prezado", em primeira pessoa do Fernando e sem fecho de telemarketing', () => {
  for (const [momento, esperado] of [['previa', /prévia do seu site está pronta/i], ['no_ar', /site está no ar/i], ['material_parado', /aguardando o material/i], ['material_apagar', /material do seu site está parado/i],
    ['restante_lembrete_1', /lembrar do restante/i], ['restante_lembrete_2', /último lembrete do restante/i]]) {
    const t = T[momento].texto(LINK);
    assert.match(t, esperado, momento); assert.ok(t.includes('#retomar=ABC'), momento + ': o link entra no texto');
    assert.ok(!/R\$|\d+\s?%|prezad|estimado cliente|fico à disposição|aguardo (o )?retorno|solução|fique à vontade|qualquer dúvida/i.test(t), 'sem preço nem fórmula de carta: ' + t);
    assert.match(t, /^Aqui é o Fernando, da Beyon Zero\./, momento + ': diz quem é, como o Fernando falaria (o "Oi, nome!" vem do componente)');
    assert.match(t, /vale por 7 dias e abre uma vez/, momento);
    assert.ok(!/[—–]|\*\*|^\s*[-•]/m.test(t), momento + ': sem travessão, negrito nem lista');
    assert.ok(t.split(/\s+/).length <= 70, momento + ': mensagem curta (' + t.split(/\s+/).length + ' palavras)');
  }
  assert.match(T.previa.texto('L'), /aprova ou manda a sua lista de ajustes/);
  assert.match(T.material_parado.texto('L'), /^Aqui é o Fernando, da Beyon Zero\./);
  assert.match(T.no_ar.texto('L'), /paga o restante por Pix/);
  assert.match(T.no_ar.texto('L'), /3 dias/); assert.match(T.no_ar.texto('L'), /sai do ar à meia-noite/);   /* 22/10: o aviso "no ar" diz o prazo de 3 dias */
  assert.match(T.material_parado.texto('L'), /projeto fica parado/); assert.match(T.material_parado.texto('L'), /Nada vai ao ar sem a sua autorização/);
  for (const m of ['restante_lembrete_1', 'restante_lembrete_2']) assert.match(T[m].texto('L'), /sai do ar à meia-noite, no fim do 3º dia/, m);
  assert.equal(new Set(Object.values(T).map(x => x.assunto)).size, 6, 'cada aviso tem o seu assunto');
  assert.ok(!/imagens do modelo/.test(JSON.stringify(Object.values(T).map(x => x.texto('L')))), '22/10: nenhuma promessa de imagens do modelo');
});

test('o aviso prévio do apagamento (material_apagar): diz que o material parado vai ser apagado, quando (30 dias depois da mensagem), como evitar (pelo link) e o que NÃO é apagado', () => {
  const t = T.material_apagar.texto(LINK);
  assert.match(t, /^Aqui é o Fernando, da Beyon Zero\. Faz meses que o material do seu site está parado\./, 'abre dizendo o que houve, sem pressão');
  assert.match(t, /Se você mandar ou mexer no material por este link, eu não apago nada\. Se não, eu apago o que você mandou/, 'abre pelo que o cliente pode fazer');
  assert.match(t, /30 dias depois desta mensagem/);
  assert.match(t, /\(a logomarca, as fotos e os textos\)/, 'diz o que é o material, com as palavras do cliente');
  assert.doesNotMatch(t, /logo,/, 'não é "logo" solto (parece advérbio)');
  assert.match(t, /pedido e o pagamento não são apagados/);
  assert.ok(!/projeto (será|vai ser) (apagado|cancelado)|perder o (site|projeto|pedido)|última chance|urgente/i.test(t), 'sem medo nem pressão e sem dizer que o projeto some');
});

test('o link de retomada NUNCA vai num endereço: nada de ?text=, ?subject=, &body= no componente de aviso nem no módulo novo; o WhatsApp abre só com o número', () => {
  for (const [nome, fonte] of [['painel-pedido-comum.js', COMUM], ['painel-entregas.js', FONTE]]) {
    const s = semComentario(fonte);
    assert.ok(!/\?text=|\bsubject=|\bbody=/.test(s), nome + ' monta um endereço com o texto dentro');
    assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(s), nome + ': tudo por textContent');
  }
  assert.match(semComentario(COMUM), /'https:\/\/wa\.me\/' \+ digitos(?!\s*\+)/, 'o WhatsApp abre só com o número');
  assert.match(semComentario(COMUM), /'mailto:' \+ email(?!\s*\+)/, 'o e-mail abre só com o endereço');
});

test('o painel ganha o bloco dos avisos e carrega o módulo; sem estilo embutido (CSP)', () => {
  assert.match(HTML, /id="bloco-avisos"/); assert.match(HTML, /id="avisos"/); assert.match(HTML, /id="avisos-estado"[^>]*role="status"/);
  assert.match(HTML, /id="t-avisos" tabindex="-1"/, 'o título recebe o foco depois do "Já avisei"');
  assert.match(HTML, /<script src="js\/painel-entregas\.js" defer><\/script>/);
  assert.ok(HTML.indexOf('<script src="js/painel-pedido-comum.js"') < HTML.indexOf('<script src="js/painel-entregas.js"'), 'o componente comum carrega antes');
  assert.ok(!/<style|\sstyle="/.test(HTML));
});

test('o módulo marca o aviso como feito (POST aviso_feito com o momento), devolve o foco ao título e nunca guarda o link', () => {
  const s = semComentario(FONTE);
  assert.match(s, /aviso_feito: a\.codigo, momento: a\.momento/);
  assert.match(s, /\$\('t-avisos'\)\.focus\(\)/);
  assert.ok(!/localStorage|sessionStorage|console\.(log|info|debug)/.test(s), 'o link de uso único não vai para armazenamento nem console');
});

test('o telefone vem como o banco manda ({nome, telefone, email}) e é mostrado por C.telefone; o cartão passa o contato inteiro ao aviso', () => {
  const s = semComentario(FONTE);
  assert.match(s, /C\.telefone\(a\.contato && a\.contato\.telefone\)/);
  assert.match(s, /contato: a\.contato \|\| \{\}/);
});

test('o CSS do painel: a caixa da mensagem e o bloco não ganham blur, sombra nem brilho, e não alargam a tela (largura 100%, sem largura fixa)', () => {
  const bloco = CSS.split('\n').filter(l => /pn__aviso-(pronto|texto)|#bloco-avisos|#avisos-atualizar/.test(l)).join('\n');
  assert.match(bloco, /\.pn__aviso-pronto/); assert.match(bloco, /\.pn__aviso-texto/);
  assert.match(bloco, /\.pn__aviso-texto[^{]*\{[^}]*width: 100%/); assert.match(bloco, /\.pn__aviso-texto[^{]*\{[^}]*box-sizing: border-box/);
  assert.match(bloco, /\.pn__aviso-texto[^{]*\{[^}]*font-size: 1rem/, 'texto que importa com 16 px');
  assert.ok(!/blur|box-shadow|text-shadow|drop-shadow|backdrop|filter/.test(bloco), 'sem blur nem sombra');
  assert.ok(!/blur\(|box-shadow|text-shadow|drop-shadow|backdrop-filter/.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '')), 'o CSS do painel inteiro segue sem blur nem sombra');
});

test('acessibilidade do aviso: caixa só de leitura com aria-label, "Copiar a mensagem" e o estado com role=status', () => {
  const s = semComentario(COMUM);
  assert.match(s, /msg\.readOnly = true/); assert.match(s, /msg\.setAttribute\('aria-label', 'Mensagem pronta: '/);
  assert.match(s, /'Copiar a mensagem'/); assert.match(s, /estado\.setAttribute\('role', 'status'\)/);
});

/* ---- o módulo de verdade, com um DOM de mentira mínimo (cartão, leitura da fila, "Já avisei") ---- */
function no(tag, classe, texto) {
  let filhos = [], texto_ = texto === undefined || texto === null ? '' : String(texto);
  const n = {
    tag, className: classe || '', attrs: {}, ouvintes: {}, disabled: false, hidden: false, focado: false,
    get children() { return filhos; }, get childNodes() { return filhos; },
    get textContent() { return texto_; }, set textContent(v) { texto_ = String(v); filhos = []; },
    appendChild(f) { filhos.push(f); return f; }, replaceChild(novo, velho) { filhos[filhos.indexOf(velho)] = novo; return velho; },
    setAttribute(k, v) { n.attrs[k] = String(v); }, addEventListener(t, f) { (n.ouvintes[t] = n.ouvintes[t] || []).push(f); },
    focus() { n.focado = true; }, clicar() { (n.ouvintes.click || []).forEach(f => f()); }
  };
  return n;
}
const achar = (raiz, pred) => { if (pred(raiz)) return raiz; for (const f of raiz.children) { const r = achar(f, pred); if (r) return r; } return null; };
const esperar = () => new Promise(r => setTimeout(r, 5));
const PASSO_DO = { previa: 'previa', no_ar: 'no_ar', material_parado: 'material', material_apagar: 'material', restante_lembrete_1: 'no_ar', restante_lembrete_2: 'no_ar' };   /* (o passo que a fila traz: vendas_avisos_lista, 28/10) */
const ITEM = (momento, i) => ({ conversa_id: '1111111' + i + '-1111-4111-8111-111111111111', codigo: 'BZ-0000' + i, momento, passo: PASSO_DO[momento], desde: '2026-10-20T12:00:00Z', contato: { nome: 'Ana ' + i, telefone: '+55679912345' + i + '0', email: null } });

function montarPainel({ itens, aoPostar }) {
  const ids = {}, ouvintes = {}, chamadas = [];
  for (const id of ['avisos', 'avisos-estado', 'bloco-avisos', 't-avisos', 'avisos-atualizar']) ids[id] = no('x');
  ids['bloco-avisos'].hidden = true;
  const P = {
    el: no, data: d => 'dia ' + String(d).slice(0, 10), recusada: e => !!(e && e.status === 401),
    pedir(caminho, opcoes) {
      const corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null;
      chamadas.push({ caminho, metodo: opcoes && opcoes.method, corpo });
      if (caminho === '?fila=avisos') return Promise.resolve({ json: () => Promise.resolve({ itens: P.itens, total: P.itens.length }) });
      return aoPostar(corpo);
    },
    itens
  };
  const janela = { BZPainel: P };
  const doc = { getElementById: id => ids[id], addEventListener: (t, f) => { ouvintes[t] = f; } };
  const contexto = vm.createContext({ window: janela, document: doc, location: { origin: 'https://x.test' }, navigator: {}, setTimeout, clearTimeout });
  vm.runInContext(COMUM, contexto); vm.runInContext(FONTE, contexto);
  return { ids, ouvintes, chamadas, P };
}
const ok = corpo => () => Promise.resolve({ json: () => Promise.resolve(corpo) });
const MOMENTOS = ['previa', 'no_ar', 'material_parado', 'material_apagar', 'restante_lembrete_1', 'restante_lembrete_2'];

test('o painel de verdade: um cartão por momento, momento desconhecido ignorado sem quebrar, e a contagem diz só o que foi desenhado', async () => {
  const itens = [...MOMENTOS.map(ITEM), ITEM('momento_que_ninguem_conhece', 9)];
  const { ids, ouvintes } = montarPainel({ itens, aoPostar: ok({ ok: true }) });
  ouvintes['bz-painel:entrou']();
  await esperar();
  assert.equal(ids['bloco-avisos'].hidden, false, 'o bloco aparece');
  assert.equal(ids.avisos.children.length, 6, 'seis cartões, o desconhecido fica de fora');
  assert.equal(ids['avisos-estado'].textContent, '6 avisos para mandar.');
  const titulos = ids.avisos.children.map(c => achar(c, n => / desde dia/.test(n.textContent)).textContent.split(' desde ')[0]);
  assert.deepEqual(titulos, MOMENTOS.map(m => T[m].titulo), 'cada cartão usa o título do seu momento');
  for (const c of ids.avisos.children) {
    assert.ok(achar(c, n => n.tag === 'button' && /^Preparar /.test(n.textContent)), 'tem "Preparar"');
    assert.ok(achar(c, n => n.tag === 'button' && n.textContent === 'Já avisei'), 'tem "Já avisei"');
  }
  assert.ok(achar(ids.avisos.children[0], n => n.textContent === 'WhatsApp +55 67 99123-4500'), 'o telefone vem como o banco manda e aparece formatado');
});

test('o painel de verdade: o aviso "no ar" de uma entrega que não está no ar (suspensa, encerrada, concluída ou sem o passo) NÃO vira cartão: não se oferece "O seu site está no ar!"', async () => {
  for (const passo of ['suspensa', 'encerrada', 'concluida', undefined]) {
    const { ids, ouvintes } = montarPainel({ itens: [{ ...ITEM('no_ar', 5), passo }], aoPostar: ok({}) });
    ouvintes['bz-painel:entrou'](); await esperar();
    assert.equal(ids.avisos.children.length, 0, 'passo ' + passo + ': nenhum cartão');
    assert.equal(ids['avisos-estado'].textContent, 'Nenhum aviso para mandar hoje.');
  }
  const certo = montarPainel({ itens: [ITEM('no_ar', 5)], aoPostar: ok({}) });
  certo.ouvintes['bz-painel:entrou'](); await esperar();
  assert.equal(certo.ids.avisos.children.length, 1, 'no ar de verdade: o cartão aparece');
});

test('o painel de verdade: fila vazia diz que não há aviso; um item só diz "1 aviso"', async () => {
  const vazio = montarPainel({ itens: [], aoPostar: ok({}) });
  vazio.ouvintes['bz-painel:entrou'](); await esperar();
  assert.equal(vazio.ids['avisos-estado'].textContent, 'Nenhum aviso para mandar hoje.');
  assert.equal(vazio.ids.avisos.children.length, 0);
  const um = montarPainel({ itens: [ITEM('previa', 1)], aoPostar: ok({}) });
  um.ouvintes['bz-painel:entrou'](); await esperar();
  assert.equal(um.ids['avisos-estado'].textContent, '1 aviso para mandar.');
});

test('o painel de verdade: "Já avisei" manda {aviso_feito: código, momento}, e "Aviso marcado." só aparece com resposta ok (o foco volta ao título)', async () => {
  const itens = MOMENTOS.map(ITEM);
  const { ids, ouvintes, chamadas, P } = montarPainel({ itens, aoPostar: ok({ ok: true }) });
  ouvintes['bz-painel:entrou'](); await esperar();
  const quarto = ids.avisos.children[3];   /* material_apagar */
  P.itens = itens.filter(i => i.momento !== 'material_apagar');   /* (depois de marcar, o servidor já não lista o aviso) */
  achar(quarto, n => n.tag === 'button' && n.textContent === 'Já avisei').clicar();
  await esperar();
  const post = chamadas.filter(c => c.metodo === 'POST');
  assert.deepEqual(post, [{ caminho: '', metodo: 'POST', corpo: { aviso_feito: 'BZ-00003', momento: 'material_apagar' } }]);
  assert.match(ids['avisos-estado'].textContent, /^Aviso marcado\. 5 avisos para mandar\.$/);
  assert.equal(ids['t-avisos'].focado, true, 'o foco volta ao título do bloco');
  assert.equal(ids.avisos.children.length, 5, 'a lista foi lida de novo');
});

test('o painel de verdade: se o POST falha, mostra a mensagem do servidor, não diz "Aviso marcado." e libera o botão para tentar de novo', async () => {
  const itens = [ITEM('no_ar', 2)];
  const falha = () => Promise.reject(Object.assign(new Error('Este aviso não é mais devido.'), { status: 409 }));
  const { ids, ouvintes, chamadas } = montarPainel({ itens, aoPostar: falha });
  ouvintes['bz-painel:entrou'](); await esperar();
  const feito = achar(ids.avisos.children[0], n => n.tag === 'button' && n.textContent === 'Já avisei');
  feito.clicar();
  assert.equal(feito.disabled, true, 'um toque só enquanto espera');
  await esperar();
  assert.equal(ids['avisos-estado'].textContent, 'Este aviso não é mais devido.');
  assert.ok(!/Aviso marcado/.test(ids['avisos-estado'].textContent));
  assert.equal(feito.disabled, false, 'o botão volta');
  assert.equal(chamadas.filter(c => c.caminho === '?fila=avisos').length, 1, 'não recarregou a lista como se tivesse dado certo');
  assert.equal(ids['t-avisos'].focado, false);
});

test('o painel de verdade: sair do painel esvazia o bloco (nome, telefone e links dos clientes não ficam na página)', async () => {
  const { ids, ouvintes } = montarPainel({ itens: [ITEM('previa', 1)], aoPostar: ok({}) });
  ouvintes['bz-painel:entrou'](); await esperar();
  assert.equal(ids.avisos.children.length, 1);
  ouvintes['bz-painel:saiu']();
  assert.equal(ids.avisos.children.length, 0); assert.equal(ids['avisos-estado'].textContent, ''); assert.equal(ids['bloco-avisos'].hidden, true);
});

test('o painel de verdade: "Preparar" pede o link de retomada da conversa do aviso e a mensagem do momento chega pronta, com o link e sem endereço de terceiro', async () => {
  const itens = MOMENTOS.map(ITEM);
  const codigo = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  const { ids, ouvintes, chamadas } = montarPainel({ itens, aoPostar: ok({ codigo }) });
  ouvintes['bz-painel:entrou'](); await esperar();
  const cartao = ids.avisos.children[3];   /* material_apagar */
  achar(cartao, n => n.tag === 'button' && /^Preparar /.test(n.textContent)).clicar();
  await esperar();
  assert.deepEqual(chamadas.filter(c => c.metodo === 'POST').map(c => c.corpo), [{ link_retomada: itens[3].conversa_id }], 'o link é da conversa deste aviso');
  const msg = achar(cartao, n => n.tag === 'textarea');
  assert.ok(msg.value.startsWith('Oi, Ana! Aqui é o Fernando, da Beyon Zero.'));
  assert.ok(msg.value.includes('https://x.test/orcamento#retomar=' + codigo) && /eu apago o que você mandou/.test(msg.value));
  assert.equal(achar(cartao, n => n.tag === 'a').href, 'https://wa.me/5567991234530');
});

test('a voz é uma só no painel: as mensagens da fila de modelos e do lembrete dos modelos também abrem com "Aqui é o Fernando, da Beyon Zero."', () => {
  for (const f of ['js/painel-fila.js', 'js/painel-lembretes.js', 'js/painel-entregas.js']) {
    const s = ler(f);
    assert.doesNotMatch(s, /Aqui é da Beyon Zero/, f + ': a mensagem do dono diz quem é, com o nome dele');
    assert.match(s, /Aqui é o Fernando, da Beyon Zero\./, f);
  }
});
