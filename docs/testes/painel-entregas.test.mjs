/* OS AVISOS DA D1 NO PAINEL (PR 3b-3c, Task 11; spec §1 item 3 e §12): os 6 momentos que o dono avisa (prévia pronta, site no ar, material parado, aviso prévio do apagamento
   do material e os 2 lembretes do restante), cada um com a mensagem pronta; o link de retomada de uso único NUNCA vai num href (nem wa.me/?text=, nem mailto com corpo): o dono
   copia e cola. Sem innerHTML (tudo por textContent). O módulo é JS de navegador (IIFE): roda aqui com um window de mentira.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  assert.match(T.no_ar.texto('L'), /paga o restante por Pix/);
  assert.match(T.no_ar.texto('L'), /3 dias/); assert.match(T.no_ar.texto('L'), /sai do ar à meia-noite/);   /* 22/10: o aviso "no ar" diz o prazo de 3 dias */
  assert.match(T.material_parado.texto('L'), /projeto fica parado/); assert.match(T.material_parado.texto('L'), /Nada vai ao ar sem a sua autorização/);
  for (const m of ['restante_lembrete_1', 'restante_lembrete_2']) assert.match(T[m].texto('L'), /sai do ar à meia-noite, no fim do 3º dia/, m);
  assert.equal(new Set(Object.values(T).map(x => x.assunto)).size, 6, 'cada aviso tem o seu assunto');
  assert.ok(!/imagens do modelo/.test(JSON.stringify(Object.values(T).map(x => x.texto('L')))), '22/10: nenhuma promessa de imagens do modelo');
});

test('o aviso prévio do apagamento (material_apagar): diz que o material parado vai ser apagado, quando (30 dias depois da mensagem), como evitar (pelo link) e o que NÃO é apagado', () => {
  const t = T.material_apagar.texto(LINK);
  assert.match(t, /vou apagar/); assert.match(t, /30 dias depois desta mensagem/);
  assert.match(t, /logo, fotos e textos/, 'diz o que é o material');
  assert.match(t, /mandar ou mexer no material pelo link/, 'dá para evitar');
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
