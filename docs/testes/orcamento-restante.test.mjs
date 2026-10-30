/* A TELA DO PASSO 4 (PR 3b-3; spec §3 "Passo 4", §4, §5; D4): o endereço do site só abre se for o MESMO veredito do servidor (api/_entrega/enderecos.mjs); o valor do restante é o do banco
   quando ele já o criou, senão total − entrada PAGA (centavos exatos) e NÃO aparece sem a proposta (falha fechada, como a entrada no 3b-1); o aviso da tela a partir do 2º dia do aviso
   "no ar" e o fim aos 3 dias (22/10; a frase da D4 está sempre); o Pix é o MESMO componente da entrada, pedido só em Pix (o seletor de cartão nem chega a aparecer, qualquer que seja
   MP_METODOS); concluído e encerrado têm o seu texto e UM WhatsApp. O global é BZRestante (confira o teste de globais únicos em orcamento-previa.test.mjs).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { problemaDoSite, origemDoSite } from '../../api/_entrega/enderecos.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FONTE = ler('js/orcamento-restante.js'), HTML = ler('orcamento.html'), CSS = ler('css/orcamento-previa.css'), PAGAMENTO = ler('js/orcamento-pagamento.js');
const janela = { BZMaterialEsquema: ESQ };
new Function('window', ler('js/orcamento-pix.js'))(janela);
new Function('window', FONTE)(janela);
const R = janela.BZRestante;
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const texto = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const secao = id => HTML.slice(HTML.indexOf('id="' + id + '"'), HTML.indexOf('</section>', HTML.indexOf('id="' + id + '"')));
const NOAR = secao('o-noar'), FIM = secao('o-fim');
const SITE = 'https://clinicasol.com.br';

test('o endereço do site: o MESMO veredito do servidor (problemaDoSite), só https puro de domínio; o que sai é a origem; o resto não vira link', () => {
  for (const ok of [SITE, 'https://www.clinicasol.com.br', SITE + '/', 'https://CLINICASOL.com.br']) assert.equal(R.hrefDoSite(ok), origemDoSite(ok), ok);
  const todos = [SITE, SITE + '/', SITE + '//', 'https://www.clinicasol.com.br', 'https://CLINICASOL.com.br', 'http://clinicasol.com.br', SITE + '/agenda', SITE + '?a=1', SITE + '#x', 'https://user@clinicasol.com.br',
    'https://user:senha@clinicasol.com.br', 'https://clinicasol.com.br:8443', 'https://clinicasol.com.br:443', 'https://localhost', 'https://app.localhost', 'https://127.0.0.1', 'https://2130706433', 'https://[::1]',
    'https://clinica', 'javascript:alert(1)', 'https://', 'https://clinicasol.com.br evil.com', 'https://clinicasol.com.br"x', 'https://a.b', '', ' ', null, undefined, 42, {}, ['https://clinicasol.com.br']];
  for (const u of todos) assert.equal(R.hrefDoSite(u) !== null, problemaDoSite(u) === null, 'mesmo veredito do servidor para ' + JSON.stringify(u));
  for (const ruim of ['http://clinicasol.com.br', SITE + '/agenda', 'https://user@clinicasol.com.br', 'javascript:alert(1)', 'https://', '', null, undefined]) assert.equal(R.hrefDoSite(ruim), null, String(ruim));
  assert.equal(janela.BZRestante.hrefDoSite.length, 1);
  const sem = {}; new Function('window', FONTE)(sem);
  assert.equal(sem.BZRestante.hrefDoSite(SITE), null, 'sem o esquema carregado, nada abre');
});

test('o valor do restante: o do banco quando ele já o criou; senão total − entrada PAGA, em centavos exatos; sem proposta, sem percentual ou sem a entrada paga, NULL (a tela não cobra)', () => {
  const pr = { valor_total: 1999.99, sinal_percentual: 40 };
  assert.equal(R.valorDoRestante(pr, [{ parcela: 'sinal', status: 'pago', valor: '800.00' }]), 1199.99);
  assert.equal(R.valorDoRestante({ valor_total: 3000, sinal_percentual: 40 }, [{ parcela: 'sinal', status: 'pago', valor: 1200 }]), 1800);
  assert.equal(R.valorDoRestante(pr, []), 1199.99, 'sem o registro da entrada, a conta da proposta (a mesma do banco)');
  assert.equal(R.valorDoRestante(pr, undefined), 1199.99);
  const pago = { parcela: 'sinal', status: 'pago', valor: '800.00' };
  assert.equal(R.valorDoRestante(pr, [pago, { parcela: 'saldo', status: 'pendente', valor: '1199.99' }]), 1199.99);
  assert.equal(R.valorDoRestante({ valor_total: 3000, sinal_percentual: 40 }, [{ parcela: 'sinal', status: 'pago', valor: 1200 }, { parcela: 'saldo', status: 'pendente', valor: '1799.50' }]), 1799.5, 'o registro do restante que o banco criou manda (é o que o Pix cobra)');
  assert.equal(R.valorDoRestante({ valor_total: 3000, sinal_percentual: 40 }, [{ parcela: 'sinal', status: 'pago', valor: 1200 }, { parcela: 'saldo', status: 'cancelado', valor: '5.00' }]), 1800, 'restante cancelado não vale');
  assert.equal(R.valorDoRestante({ valor_total: 3000 }, [{ parcela: 'sinal', status: 'pago', valor: 1200 }]), null, 'sem o percentual da proposta, a tela não cobra');
  assert.equal(R.valorDoRestante({ valor_total: 3000, sinal_percentual: 0 }, []), null);
  assert.equal(R.valorDoRestante(null, []), null);
  assert.equal(R.valorDoRestante({ valor_total: 0, sinal_percentual: 40 }, []), null);
  assert.equal(R.valorDoRestante({ valor_total: 3000, sinal_percentual: 40 }, [{ parcela: 'sinal', status: 'pago', valor: 3000 }]), null, 'restante zero ou negativo: não cobra');
  for (const status of ['pendente', 'estornado', 'contestado', 'cancelado']) assert.equal(R.valorDoRestante({ valor_total: 3000, sinal_percentual: 40 }, [{ parcela: 'sinal', status, valor: 1200 }]), null, 'a entrada existe mas não está paga (' + status + '): o banco recusa, a tela não cobra');
  const sem = {}; new Function('window', FONTE)(sem);
  assert.equal(sem.BZRestante.valorDoRestante(pr, []), null, 'sem o módulo das contas da entrada, não cobra');
});

test('o aviso da tela (22/10: 3 dias do aviso "no ar", lembretes do dono no 2º e no 3º dia): nada antes do 2º dia; o 2º; o último dia; o fim; a suspensa; a frase da D4 fica sempre', () => {
  assert.deepEqual(R.LEMBRETES, [2, 3]);
  assert.equal(R.avisoDoRestante(null, 3, 'no_ar'), '', 'o aviso "no ar" ainda não foi registrado: a contagem não começou');
  assert.equal(R.avisoDoRestante(undefined, 3, 'no_ar'), '');
  assert.equal(R.avisoDoRestante(0, 3, 'no_ar'), ''); assert.equal(R.avisoDoRestante(1, 3, 'no_ar'), '');
  assert.match(R.avisoDoRestante(2, 3, 'no_ar'), /Faltam 2 dias/);
  assert.match(R.avisoDoRestante(3, 3, 'no_ar'), /último dia/); assert.doesNotMatch(R.avisoDoRestante(3, 3, 'no_ar'), /meia-noite|\d\s?h\b|horas/, 'o dono suspende na mão: nada de horário de corte automático');
  for (const limite of [3, 4, 5, 6]) for (let d = 2; d < limite; d++) assert.match(R.avisoDoRestante(d, limite, 'no_ar'), new RegExp('^Faltam ' + (limite - d + 1) + ' dias '), 'nunca "Falta 1 dia": entre o 2º dia e o último são sempre 2 ou mais');
  for (const dias of [4, 9]) {
    assert.equal(R.avisoDoRestante(dias, 3, 'no_ar'), 'O prazo do restante terminou. O Pix está logo abaixo.');
    assert.doesNotMatch(R.avisoDoRestante(dias, 3, 'no_ar'), /pague agora|sair do ar|sai do ar/i, 'sem pressão nem ameaça sem data');
  }
  assert.match(R.avisoDoRestante(12, 3, 'suspensa'), /saiu do ar/); assert.match(R.avisoDoRestante(12, 3, 'suspensa'), /quando o pagamento cair/i);
  assert.match(R.avisoDoRestante(null, 3, 'suspensa'), /saiu do ar/, 'suspensa mostra o aviso mesmo sem a contagem');
  assert.match(texto(NOAR), /Se o restante não for pago em 3 dias depois do meu aviso de que o site está no ar, o site sai do ar até o pagamento\./);
  for (const d of [2, 3, 4]) assert.doesNotMatch(R.avisoDoRestante(d, 3, 'no_ar'), /\d+\s*horas|fique à vontade|solução|Prezad/i);
});

test('dadosDoFim: as duas partes ✓ vêm do banco (entrada e restante pagos) e o total da proposta; sem as duas pagas, null', () => {
  const pr = { valor_total: 3000 };
  const pag = [{ parcela: 'sinal', status: 'pago', valor: '1200.00' }, { parcela: 'saldo', status: 'pago', valor: '1800.00' }];
  assert.deepEqual(R.dadosDoFim(pr, pag), { total: 3000, entrada: 1200, restante: 1800 });
  assert.equal(R.dadosDoFim(pr, [pag[0]]), null);
  assert.equal(R.dadosDoFim(pr, [pag[0], { ...pag[1], status: 'pendente' }]), null);
  assert.equal(R.dadosDoFim(null, pag), null);
  assert.equal(R.dadosDoFim(pr, undefined), null);
});

test('as seções: #o-noar com "Abrir o site" seguro e a frase do contrato; #o-fim com concluído e encerrado e UM só recado ("Outra dúvida?"); sem estilo embutido nem desfoque', () => {
  assert.ok(NOAR.length > 300 && FIM.length > 500, 'as duas seções existem');
  assert.match(NOAR, /id="o-noar-abrir"[^>]*target="_blank"[^>]*rel="noopener noreferrer"|id="o-noar-abrir"[^>]*rel="noopener noreferrer"[^>]*target="_blank"/);
  assert.match(FIM, /id="o-fim-abrir"[^>]*target="_blank"[^>]*rel="noopener noreferrer"|id="o-fim-abrir"[^>]*rel="noopener noreferrer"[^>]*target="_blank"/);
  for (const id of ['o-noar', 'o-fim']) assert.match(HTML, new RegExp('<section[^>]*id="' + id + '"[^>]*\\shidden>'), id + ' nasce escondida');
  assert.match(texto(FIM), /Pedido concluído/); assert.match(texto(FIM), /Este pedido foi encerrado/);
  assert.match(texto(FIM), /Qualquer mudança depois que o site for entregue é orçada à parte\./);
  assert.match(texto(FIM), /Outra dúvida\? Deixe um recado para a equipe/);
  assert.equal([...FIM.matchAll(/data-recado-abrir/g)].length, 1, 'D3: um recado só, o de "Outra dúvida?"');
  assert.equal([...NOAR.matchAll(/wa\.me|data-recado-abrir/g)].length, 0, 'o canal do passo 4 é o "Problema com o pagamento?" do próprio componente do Pix');
  assert.ok(!/\?text=/.test(NOAR + FIM));
  assert.ok(!/\sstyle="|<style/.test(NOAR + FIM));
  for (const id of ['o-noar-titulo', 'o-noar-endereco', 'o-noar-aviso', 'o-fim-concluido', 'o-fim-titulo', 'o-fim-entrada', 'o-fim-restante', 'o-fim-total', 'o-fim-endereco', 'o-fim-encerrado', 'o-fim-encerrado-titulo'])
    assert.equal((HTML.match(new RegExp('\\sid="' + id + '"', 'g')) || []).length, 1, id);
  assert.match(NOAR, /<h2 id="o-noar-titulo" tabindex="-1">/); assert.match(FIM, /<h2 id="o-fim-titulo" tabindex="-1">/); assert.match(FIM, /<h2 id="o-fim-encerrado-titulo" tabindex="-1">/);
  assert.doesNotMatch(texto(NOAR + FIM), /aprovad[ao]? (sozinh|automátic)|conta como aprovad|fique à vontade|Prezad|solução/i);
});

test('o Pix do restante é o mesmo componente da entrada: o #o-pagamento muda de lugar (não se copia); o que só vale antes da entrada ganha a classe que o esconde; o aviso de "indisponível" tem o recado certo', () => {
  const pag = secao('o-pagamento');
  assert.equal((HTML.match(/id="o-pix"/g) || []).length, 1, 'um só componente de Pix na página');
  const js = semComentario(FONTE);
  assert.match(js, /\.after\(/, 'muda de lugar (decisão G), não é copiado');
  assert.match(js, /metodos:\s*\['pix'\]/, 'o restante pede ao componente só Pix (B6)');
  assert.doesNotMatch(js, /o-pag-metodos|o-pix-trocar/, 'nada de esconder o seletor depois de mostrar (pisca): quem cuida é o componente, na mesma passada');
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(js));
  for (const trecho of ['href="#o-antes">Perguntas antes de pagar', 'class="orc-nota orc-perguntar', 'class="orc-antes-passos', '<details class="orc-det orc-so-entrada"']) {
    const i = pag.indexOf(trecho.replace('<details class="orc-det orc-so-entrada"', '<details class="orc-det')); assert.ok(i > 0, trecho);
  }
  const tag = re => (pag.match(re) || [''])[0];
  assert.match(tag(/<p class="[^"]*"[^>]*>\s*<a href="#o-antes">/), /orc-so-entrada/, 'o atalho "Perguntas antes de pagar" não vale no restante (o #o-antes nem existe nessa etapa)');
  assert.match(tag(/<p class="[^"]*orc-perguntar[^"]*"/), /orc-so-entrada/, 'o "Pergunte ao consultor" aponta para um campo que não está na página em produção');
  assert.match(tag(/<div class="[^"]*orc-antes-passos[^"]*"/), /orc-so-entrada/, 'o "Passo 1 de 4 · Entrada" não vale no restante');
  assert.match(tag(/<details class="[^"]*"[^>]*>\s*<summary>Ver o escopo confirmado/), /orc-so-entrada/, 'o escopo só é preenchido na etapa da entrada');
  assert.match(pag, /class="orc-so-entrada"[^>]*data-recado-abrir/); assert.match(pag, /class="orc-so-restante"[^>]*data-recado-abrir/);
  assert.match(CSS, /#o-pagamento\.is-restante \.orc-so-entrada\s*\{\s*display:\s*none/); assert.match(CSS, /#o-pagamento:not\(\.is-restante\) \.orc-so-restante\s*\{\s*display:\s*none/);
  assert.match(pag, /id="o-pag-problema"/, 'o "Problema com o pagamento?" fica (é o recado do passo 4)');
});

test('a ordem: o script do passo 4 depois da prévia e antes de orcamento-entrega.js; as seções depois da prévia, dentro do main; o CSS é o da prévia', () => {
  const i = s => HTML.indexOf(s);
  assert.ok(i('src="js/orcamento-previa.js"') < i('src="js/orcamento-restante.js"') && i('src="js/orcamento-restante.js"') < i('src="js/orcamento-entrega.js"'));
  assert.ok(i('src="js/orcamento-pagamento.js"') < i('src="js/orcamento-restante.js"') && i('src="js/orcamento-pix.js"') < i('src="js/orcamento-restante.js"'));
  assert.ok(i('id="o-previa"') < i('id="o-noar"') && i('id="o-noar"') < i('id="o-fim"') && i('id="o-fim"') < i('</main>'));
  assert.match(HTML, /<script src="js\/orcamento-restante\.js" defer>/);
});

test('o CSS do passo 4: nada de desfoque nem de sombra; o endereço quebra em linha (nunca alarga a tela); texto de 16 px', () => {
  assert.ok(!/blur\(|backdrop-filter|box-shadow|text-shadow|filter:/.test(CSS));
  assert.match(CSS, /\.orc-noar__endereco[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(CSS, /\.orc-noar \.orc-nota[^{]*\{[^}]*font-size:\s*var\(--fs-b\)/);
  assert.match(CSS, /\.orc-fim \.recibo__total[^{]*\{[^}]*font-size:\s*var\(--fs-b\)/);
});

/* ---------- um DOM de mentira que NASCE do orcamento.html: só aceita id que existe na página e começa escondido como na página ---------- */
const NO_HTML = new Map([...HTML.matchAll(/<[a-z][^>]*?\sid="([^"]+)"[^>]*>/g)].map(m => [m[1], /\shidden(?=[\s>/=])/.test(m[0])]));
function montarDoc() {
  const doc = { activeElement: null, hidden: false, els: {}, ouvintes: {} };
  doc.getElementById = id => {
    if (!NO_HTML.has(id)) throw new Error('id fora do HTML: ' + id);
    if (doc.els[id]) return doc.els[id];
    let escondido = NO_HTML.get(id);
    const e = { id, textContent: '', value: '', href: '', dataset: {}, atributos: {}, ouvintes: {}, historicoHidden: [], classes: new Set(), depois: [], filhos: [],
      get hidden() { return escondido; }, set hidden(v) { escondido = !!v; this.historicoHidden.push(escondido); },
      classList: { toggle(c, on) { if (on) e.classes.add(c); else e.classes.delete(c); }, contains: c => e.classes.has(c), add: c => e.classes.add(c), remove: c => e.classes.delete(c) },
      addEventListener(t, f) { (this.ouvintes[t] ||= []).push(f); }, async disparar(t, ev = { preventDefault() {} }) { for (const f of this.ouvintes[t] || []) await f(ev); },
      setAttribute(k, v) { this.atributos[k] = v; }, getAttribute(k) { return this.atributos[k] ?? null; }, removeAttribute(k) { delete this.atributos[k]; },
      focus() { doc.activeElement = e; }, contains: x => x === e, after(x) { this.depois.push(x); }, remove() {}, appendChild() {}, insertAdjacentElement() {}, offsetParent: {} };
    return (doc.els[id] = e);
  };
  doc.body = { id: 'body' }; doc.activeElement = doc.body;
  doc.querySelectorAll = () => []; doc.querySelector = () => ({ focus() {}, getAttribute() { return null; } });
  doc.addEventListener = (t, f) => { (doc.ouvintes[t] ||= []).push(f); };
  doc.createElement = () => ({ className: '', textContent: '', value: '', setAttribute() {}, appendChild() {}, addEventListener() {} });
  doc.documentElement = { clientWidth: 390 };
  return doc;
}
const dinheiro = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const proposta = { valor_total: 3000, sinal_percentual: 40 };
const pagos = [{ parcela: 'sinal', status: 'pago', valor: '1200.00' }];
const estado = (passo, extra = {}) => ({ conversa: { etapa: 'em_producao', ...(extra.conversa || {}) }, proposta, pagamentos: pagos,
  entrega: { passo, site: { url: SITE, no_ar_em: '2026-11-01T12:00:00Z', aviso_em: '2026-11-01T13:00:00Z', dias_do_aviso: 2, limite_dias: 3, ...(extra.site || {}) } } });
function montar({ comTela = true } = {}) {
  const doc = montarDoc(), chamadas = [];
  const win = { BZMaterialEsquema: ESQ, BZPix: janela.BZPix };
  new Function('window', 'document', FONTE)(win, doc);
  const tela = comTela ? { mostrar(...a) { chamadas.push(['mostrar', ...a]); return Promise.resolve(); }, parar() { chamadas.push(['parar']); } } : null;
  const rest = win.BZRestante.criar({ dinheiro, telaPagamento: tela });
  return { el: doc.els, doc, chamadas, rest, E: doc.getElementById.bind(doc), foco: () => doc.activeElement && doc.activeElement.id };
}

test('criar: no ar -> a seção aparece com o título, o endereço em textContent e o "Abrir o site" seguro; o #o-pagamento muda de lugar UMA vez; o Pix pede só Pix com o valor do restante', () => {
  const t = montar();
  assert.equal(t.rest.atualizar(estado('no_ar')), false, 'não é o fim');
  assert.equal(t.E('o-noar').hidden, false); assert.equal(t.E('o-fim').hidden, true);
  assert.equal(t.E('o-noar-titulo').textContent, 'Seu site está no ar'); assert.equal(t.E('o-noar-endereco').textContent, SITE);
  assert.equal(t.E('o-noar-abrir').hidden, false); assert.equal(t.E('o-noar-abrir').href, SITE);
  assert.match(t.E('o-noar-aviso').textContent, /Faltam 2 dias/); assert.equal(t.E('o-noar-aviso').hidden, false);
  assert.equal(t.E('o-noar').depois.length, 1); assert.equal(t.E('o-noar').depois[0], t.E('o-pagamento'));
  assert.equal(t.E('o-pagamento').hidden, false); assert.equal(t.E('o-pagamento').classes.has('is-restante'), true);
  assert.equal(t.E('o-pag-titulo').textContent, 'Falta o restante');
  assert.match(t.E('o-pag-lead').textContent, /R\$ 1800,00/); assert.match(t.E('o-pag-lead').textContent, /60%/); assert.match(t.E('o-pag-lead').textContent, /Pix/);
  assert.deepEqual(t.chamadas, [['mostrar', 1800, 60, { metodos: ['pix'] }]]);
  t.rest.atualizar(estado('no_ar'));
  assert.equal(t.E('o-noar').depois.length, 1, 'muda de lugar uma vez só');
  assert.equal(t.chamadas.length, 1, 'a mesma situação não pede ao Pix de novo (o componente já está esperando)');
});

test('criar: o valor ou o percentual mudaram -> pede ao componente de novo; sem proposta, sem a tela do Pix ou sem valor, NÃO cobra (o formulário fica escondido e a frase manda para o WhatsApp do "Problema com o pagamento?")', () => {
  const t = montar(); t.rest.atualizar(estado('no_ar'));
  t.rest.atualizar({ ...estado('no_ar'), proposta: { valor_total: 3500, sinal_percentual: 40 }, pagamentos: [{ parcela: 'sinal', status: 'pago', valor: '1400.00' }] });
  assert.deepEqual(t.chamadas.at(-1), ['mostrar', 2100, 60, { metodos: ['pix'] }]); assert.equal(t.chamadas.length, 2);
  for (const sem of [{ ...estado('no_ar'), proposta: null }, { ...estado('no_ar'), proposta: { valor_total: 3000 } }, { ...estado('no_ar'), pagamentos: [{ parcela: 'sinal', status: 'estornado', valor: '1200.00' }] }]) {
    const u = montar(); u.rest.atualizar(sem);
    assert.equal(u.chamadas.length, 0, 'não pediu o Pix'); assert.equal(u.E('o-pag-form').hidden, true); assert.equal(u.E('o-pag-indisponivel').hidden, true);
    assert.match(u.E('o-pag-lead').textContent, /Não consegui conferir o valor do restante/); assert.equal(u.E('o-noar').hidden, false);
  }
  const u = montar({ comTela: false }); u.rest.atualizar(estado('no_ar'));
  assert.equal(u.E('o-pag-form').hidden, true); assert.match(u.E('o-pag-lead').textContent, /Não consegui conferir/);
});

test('criar: o endereço que não passa na regra aparece só como texto, sem link; a data do aviso ainda não registrada não mostra contagem', () => {
  for (const url of ['http://clinicasol.com.br', 'https://clinicasol.com.br/agenda', 'javascript:alert(1)', null]) {
    const t = montar(); t.rest.atualizar(estado('no_ar', { site: { url, dias_do_aviso: null } }));
    assert.equal(t.E('o-noar-abrir').hidden, true, String(url)); assert.equal(t.E('o-noar-abrir').href, '', 'nenhum href');
    assert.equal(t.E('o-noar-endereco').textContent, url || ''); assert.equal(t.E('o-noar-aviso').hidden, true); assert.equal(t.E('o-noar-aviso').textContent, '');
  }
  const t = montar(); t.rest.atualizar(estado('no_ar', { site: { url: SITE + '/' } })); assert.equal(t.E('o-noar-abrir').href, SITE, 'sem a barra final');
});

test('criar: o site que saiu do ar (suspensa) ainda cobra o restante: título, aviso e o mesmo Pix; no último dia o aviso diz meia-noite', () => {
  const t = montar(); t.rest.atualizar(estado('suspensa', { site: { dias_do_aviso: 5 } }));
  assert.equal(t.E('o-noar-titulo').textContent, 'Seu site saiu do ar'); assert.match(t.E('o-noar-aviso').textContent, /quando o pagamento cair/i);
  assert.equal(t.E('o-pagamento').hidden, false); assert.deepEqual(t.chamadas, [['mostrar', 1800, 60, { metodos: ['pix'] }]]);
  const u = montar(); u.rest.atualizar(estado('no_ar', { site: { dias_do_aviso: 3 } })); assert.match(u.E('o-noar-aviso').textContent, /último dia/);
  u.rest.atualizar(estado('no_ar', { site: { dias_do_aviso: 1 } })); assert.equal(u.E('o-noar-aviso').hidden, true, 'o aviso sai quando a contagem não o justifica');
});

test('criar: fora do passo 4 (outra etapa, outro passo, sem entrega) a seção some, a classe do restante sai e o Pix não é pedido', () => {
  for (const E of [{ conversa: { etapa: 'aguardando_pagamento' }, entrega: null, proposta, pagamentos: [] }, estado('previa'), estado('aprovada'), estado('material'), { ...estado('no_ar'), conversa: { etapa: 'aguardando_pagamento' } }, { ...estado('no_ar'), entrega: null }]) {
    const t = montar(); t.E('o-noar').hidden = false; t.E('o-pagamento').classList.toggle('is-restante', true);
    assert.equal(t.rest.atualizar(E), false);
    assert.equal(t.E('o-noar').hidden, true); assert.equal(t.E('o-fim').hidden, true); assert.equal(t.E('o-pagamento').classes.has('is-restante'), false); assert.equal(t.chamadas.length, 0);
  }
});

test('criar: o pedido concluído mostra as duas partes ✓ com os valores do banco, o total e o endereço; o ar e o Pix saem; o Pix para de esperar; o foco vai ao título só na virada (não numa página que já abriu assim)', () => {
  const pg = [...pagos, { parcela: 'saldo', status: 'pago', valor: '1800.00' }];
  const fim = { ...estado('concluida'), conversa: { etapa: 'encerrada' }, pagamentos: pg };
  const t = montar(); t.rest.atualizar(estado('no_ar'));
  t.doc.activeElement = t.E('o-pix-copiar'); t.E('o-pix-copiar').offsetParent = null;   /* (o Pix some da tela quando o pagamento cai) */
  assert.equal(t.rest.atualizar(fim), true);
  assert.equal(t.E('o-fim').hidden, false); assert.equal(t.E('o-fim-concluido').hidden, false); assert.equal(t.E('o-fim-encerrado').hidden, true);
  assert.deepEqual(['o-fim-entrada', 'o-fim-restante', 'o-fim-total'].map(i => t.E(i).textContent), ['R$ 1200,00', 'R$ 1800,00', 'R$ 3000,00']);
  assert.equal(t.E('o-fim-partes').hidden, false); assert.equal(t.E('o-fim-endereco').textContent, SITE); assert.equal(t.E('o-fim-abrir').href, SITE); assert.equal(t.E('o-fim-abrir').hidden, false);
  assert.equal(t.E('o-noar').hidden, true); assert.equal(t.chamadas.filter(c => c[0] === 'parar').length >= 1, true);
  assert.equal(t.doc.activeElement.id, 'o-fim-titulo', 'o pagamento acabou de cair e o foco estava no Pix, que sumiu: vai ao título');
  const u = montar(); u.rest.atualizar(fim);
  assert.equal(u.doc.activeElement, u.doc.body, 'abriu a página já concluída: o foco não pula (quem rola é a retomada)');
  u.rest.atualizar({ ...fim, pagamentos: [pagos[0]] }); assert.equal(u.E('o-fim-partes').hidden, true, 'sem as duas pagas no estado, não inventa valores');
  const v = montar(); v.rest.atualizar({ ...fim, entrega: { ...fim.entrega, site: { url: 'http://x.com' } } }); assert.equal(v.E('o-fim-abrir').hidden, true);
});

test('criar: o pedido encerrado mostra só o texto de encerrado (o WhatsApp é o do HTML), sem valores nem site; e some se a entrega volta a andar', () => {
  const enc = { conversa: { etapa: 'encerrada' }, proposta, pagamentos: pagos, entrega: { passo: 'encerrada', site: { url: null } } };
  const t = montar();
  assert.equal(t.rest.atualizar(enc), true);
  assert.equal(t.E('o-fim').hidden, false); assert.equal(t.E('o-fim-encerrado').hidden, false); assert.equal(t.E('o-fim-concluido').hidden, true);
  assert.equal(t.E('o-noar').hidden, true);
  assert.equal(t.rest.atualizar(estado('no_ar')), false); assert.equal(t.E('o-fim').hidden, true);
  assert.equal(montar().rest.atualizar({ conversa: { etapa: 'encerrada' }, entrega: null }), false, 'conversa encerrada sem entrega: nada do passo 4');
});

test('criar: nada vindo do servidor entra por innerHTML; nenhum href montado com texto livre; sem setInterval nem relógio novo', () => {
  const js = semComentario(FONTE);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|setInterval|setTimeout/.test(js));
  assert.ok(!/\.href\s*=\s*[^;]*(\+|`)/.test(js), 'o href vem inteiro de hrefDoSite');
});

/* ---------- B6: a tela do Pix (js/orcamento-pagamento.js) aceita { metodos } em mostrar: o seletor de cartão nunca aparece no restante ---------- */
const CFG = (extra = {}) => ({ ativo: true, ambiente: 'producao', publicKey: 'TEST-x', metodos: ['pix', 'cartao'], ...extra });
async function montarPix(cfg) {
  const doc = montarDoc(), win = { BZPix: janela.BZPix };
  new Function('window', 'document', PAGAMENTO)(win, doc);
  const API = { pagamentoConfig: async () => cfg, pagamento: async () => ({ pagamento: null }), pagar: async () => ({}) };
  const tela = win.BZPagamentoTela.criar({ API, dinheiro, aoPagar() {} });
  return { tela, E: doc.getElementById.bind(doc), doc };
}
const nuncaVisivel = (e) => e.historicoHidden.every(h => h === true) && e.hidden === true;

test('B6: sem o 3º parâmetro nada muda: com o cartão no servidor, o seletor e o "Prefiro pagar com cartão" aparecem (a entrada)', async () => {
  const p = await montarPix(CFG()); await p.tela.mostrar(1200, 40);
  assert.equal(p.E('o-pag-metodos').hidden, false); assert.equal(p.E('o-pix-trocar').hidden, false);
  const so = await montarPix(CFG({ metodos: ['pix'] })); await so.tela.mostrar(1200, 40);
  assert.equal(so.E('o-pag-metodos').hidden, true); assert.equal(so.E('o-pix-trocar').hidden, true);
});

test('B6: { metodos: ["pix"] } esconde o seletor e o "trocar" NA MESMA passada, mesmo com o cartão ligado no servidor: eles nunca ficam visíveis (nada de mostrar e esconder depois)', async () => {
  const p = await montarPix(CFG()); await p.tela.mostrar(1800, 60, { metodos: ['pix'] });
  for (const id of ['o-pag-metodos', 'o-pix-trocar']) assert.ok(nuncaVisivel(p.E(id)), id + ' nunca ficou visível: ' + JSON.stringify(p.E(id).historicoHidden));
  assert.equal(p.E('o-pag-form').hidden, false); assert.match(p.E('o-pag-enviar').textContent, /^Gerar o Pix de R\$ 1800,00/);
  assert.equal(p.E('o-pag-cartao').hidden, true);
});

test('B6: as chamadas de um argumento só (nova tentativa da configuração, volta à aba) mantêm o "só Pix"; nova chamada sem a opção volta ao que o servidor diz', async () => {
  const p = await montarPix(CFG()); await p.tela.mostrar(1800, 60, { metodos: ['pix'] });
  await p.tela.mostrar(1800); assert.ok(nuncaVisivel(p.E('o-pag-metodos')) && nuncaVisivel(p.E('o-pix-trocar')), 'um argumento só: segue só Pix');
  await p.tela.mostrar(1800, 60); assert.ok(nuncaVisivel(p.E('o-pag-metodos')), 'dois argumentos: a opção continua (como o percentual)');
  await p.tela.mostrar(1800, 60, {}); assert.equal(p.E('o-pag-metodos').hidden, false, 'opção vazia solta a restrição');
  await p.tela.mostrar(1800, 60, { metodos: 'pix' }); assert.equal(p.E('o-pag-metodos').hidden, false, 'lista inválida também solta (não inventa restrição)');
});

test('B6: a pessoa escolheu cartão na entrada e o restante chega na mesma página: o cartão sai, o botão volta a ser o do Pix e o seletor some antes de qualquer pintura', async () => {
  const p = await montarPix(CFG({ ambiente: 'simulado' })); await p.tela.mostrar(1200, 40);
  await p.E('o-pix-trocar').disparar('click');
  assert.equal(p.E('o-pag-cartao').hidden, false); assert.match(p.E('o-pag-enviar').textContent, /no cartão/);
  await p.tela.mostrar(1800, 60, { metodos: ['pix'] });
  assert.equal(p.E('o-pag-metodos').hidden, true); assert.equal(p.E('o-pix-trocar').hidden, true); assert.equal(p.E('o-pag-cartao').hidden, true);
  assert.match(p.E('o-pag-enviar').textContent, /^Gerar o Pix de R\$ 1800,00/);
});

test('B6: a configuração que falhou e volta depois: o "só Pix" já estava guardado (o seletor nasce escondido no HTML e não aparece na volta)', async () => {
  let falhas = 1;
  const doc = montarDoc(), win = { BZPix: janela.BZPix }; new Function('window', 'document', PAGAMENTO)(win, doc);
  const API = { pagamentoConfig: async () => { if (falhas-- > 0) throw new Error('rede'); return CFG(); }, pagamento: async () => ({ pagamento: null }), pagar: async () => ({}) };
  const tela = win.BZPagamentoTela.criar({ API, dinheiro, aoPagar() {} });
  await tela.mostrar(1800, 60, { metodos: ['pix'] }); tela.parar();
  await tela.mostrar(1800);
  assert.ok(nuncaVisivel(doc.getElementById('o-pag-metodos')) && nuncaVisivel(doc.getElementById('o-pix-trocar')));
});

test('B6: o código do componente: a restrição vem do 3º parâmetro e é aplicada pela mesma função que aplica a configuração', () => {
  const js = semComentario(PAGAMENTO);
  assert.match(js, /opcoes/); assert.match(js, /function mostrarMetodos|function aplicarMetodos/);
  assert.equal((js.match(/mostrar\('o-pag-metodos'/g) || []).length, 1, 'um lugar só decide se o seletor aparece');
  assert.equal((js.match(/mostrar\('o-pix-trocar'/g) || []).length, 1);
});

/* ---------- a ligação: orcamento-entrega.js e orcamento.js (poucas linhas) ---------- */
test('a ligação: a entrega cria o BZRestante com a tela do Pix que o orcamento.js passa; o passo 4 é atualizado ANTES do "não está pronto"; o interruptor desligado esconde #o-noar e #o-fim', () => {
  const ent = semComentario(ler('js/orcamento-entrega.js')), orc = semComentario(ler('js/orcamento.js'));
  assert.match(ent, /window\.BZRestante\.criar\(\{ dinheiro: dinheiro, telaPagamento: o\.telaPagamento \}\)/);
  assert.match(orc, /window\.BZEntrega\.criar\(\{ API: API, dinheiro: dinheiro, telaPagamento: telaPagamento \}\)/);
  assert.ok(ent.indexOf('rest.atualizar(E)') > 0 && ent.indexOf('rest.atualizar(E)') < ent.indexOf('if (terminou || !pronto)'));
  assert.match(ent, /\$\('o-previa'\)\.hidden = true; \$\('o-noar'\)\.hidden = true; \$\('o-fim'\)\.hidden = true;\s*\n\s*if \(lead\) lead\.textContent = FRASE_DESLIGADA/);
  assert.match(ent, /if \(terminou \|\| !pronto\) \{[^}]*\$\('o-pedido'\)\.hidden = true; \$\('o-material'\)\.hidden = true; \$\('o-previa'\)\.hidden = true; return; \}/);
});

test('a ligação no orcamento.js: a barra de etapas não volta atrás no pedido concluído ou encerrado; quem volta cai no #o-fim; o Pix do restante não é parado a cada leitura', () => {
  const orc = semComentario(ler('js/orcamento.js'));
  assert.match(orc, /et === 'encerrada' && E\.entrega\)\) return 'pagamento'/);
  assert.match(orc, /pagamento: alvoDoPagamento\(\)/);
  assert.match(orc, /telaPagamento && !restanteAberto\(\)\) telaPagamento\.parar\(\)/);
  assert.match(orc, /function restanteAberto\(\) \{ return !!window\.BZRestante && window\.BZRestante\.restanteAberto\(E\); \}/);
  assert.match(orc, /window\.BZRestante\.alvoDaRetomada\(E\)/);
  assert.match(orc, /\$\('o-pag-titulo'\)\.textContent = 'Para começar'/, 'a entrada devolve o título que o restante trocou');
  assert.match(orc, /telaPagamento\.mostrar\(sinal, pct\.entrada, \{\}\)/, 'e solta o só Pix do restante');
});

/* ---------- as decisões do passo 4 que o orcamento.js usa: EXECUTADAS (o render e o retomar chamam estas funções) ---------- */
const comPasso = (passo, extra = {}) => ({ conversa: { etapa: extra.etapa || 'em_producao' }, entrega: extra.semEntrega ? null : { passo }, ...('ligada' in extra ? { entrega_ligada: extra.ligada } : {}) });
test('restanteAberto (a decisão do render: parar a espera do Pix ou não): material, prévia, aprovada e outros passos PARAM; no ar e suspensa NÃO; interruptor desligado, conversa fora da produção ou sem entrega PARAM', () => {
  const para = E => !R.restanteAberto(E);   /* orcamento.js: if (telaPagamento && !restanteAberto()) telaPagamento.parar() */
  for (const passo of ['material', 'producao', 'previa', 'ajustes', 'aprovada']) assert.equal(para(comPasso(passo)), true, passo + ': para');
  for (const passo of ['no_ar', 'suspensa']) { assert.equal(para(comPasso(passo)), false, passo + ': a espera do Pix segue'); assert.equal(para(comPasso(passo, { ligada: true })), false); }
  for (const passo of ['no_ar', 'suspensa']) assert.equal(para(comPasso(passo, { ligada: false })), true, passo + ' com o interruptor desligado com a página aberta: para');
  assert.equal(para(comPasso('no_ar', { etapa: 'encerrada' })), true); assert.equal(para(comPasso('no_ar', { etapa: 'aguardando_pagamento' })), true);
  assert.equal(para(comPasso('no_ar', { semEntrega: true })), true); assert.equal(R.restanteAberto(null), false); assert.equal(R.restanteAberto({ conversa: { etapa: 'em_producao' } }), false);
});

test('alvoDaRetomada (quem volta pelo aviso "seu site está no ar" ou pelo link cai no bloco certo; o h2 dele recebe o foco)', () => {
  assert.equal(R.alvoDaRetomada(comPasso('no_ar')), 'o-noar'); assert.equal(R.alvoDaRetomada(comPasso('suspensa')), 'o-noar');
  for (const passo of ['material', 'producao']) assert.equal(R.alvoDaRetomada(comPasso(passo)), 'o-pronto', passo + ': o recibo da entrada e a lista de passos');
  for (const passo of ['previa', 'ajustes', 'aprovada']) assert.equal(R.alvoDaRetomada(comPasso(passo)), 'o-previa', passo + ': o aviso "A prévia está pronta" leva à seção da prévia (I4)');
  for (const passo of ['previa', 'ajustes', 'aprovada']) assert.equal(R.alvoDaRetomada(comPasso(passo, { ligada: false })), 'o-pronto', passo + ' com o interruptor desligado: a seção da prévia está escondida, cai no recibo');
  assert.equal(R.alvoDaRetomada(comPasso('no_ar', { ligada: false })), 'o-pronto', 'interruptor desligado: o recibo com a frase de espera');
  assert.equal(R.alvoDaRetomada(comPasso('concluida', { etapa: 'encerrada' })), 'o-fim-concluido');
  assert.equal(R.alvoDaRetomada(comPasso('encerrada', { etapa: 'encerrada' })), 'o-fim-encerrado');
  assert.equal(R.alvoDaRetomada(comPasso('x', { etapa: 'encerrada', semEntrega: true })), 'o-pagamento');
  assert.equal(R.alvoDaRetomada({ conversa: { etapa: 'aguardando_pagamento' }, entrega: null }), 'o-pagamento');
  for (const id of ['o-noar', 'o-pronto', 'o-previa', 'o-fim-concluido', 'o-fim-encerrado', 'o-pagamento']) assert.ok(NO_HTML.has(id), id + ' existe no HTML');
  for (const id of ['o-noar', 'o-previa', 'o-fim-concluido', 'o-fim-encerrado']) assert.match(HTML.slice(HTML.indexOf('id="' + id + '"'), HTML.indexOf('id="' + id + '"') + 400), /<h2[^>]*tabindex="-1"/, id + ' tem um h2 que recebe o foco (BZRetomada.focar usa o 1º h2 do bloco)');
});

test('suspensa: o site está fora do ar, então "Abrir o site" some e o endereço fica só como texto; no ar o botão volta', () => {
  const t = montar(); t.rest.atualizar(estado('suspensa', { site: { dias_do_aviso: 5 } }));
  assert.equal(t.E('o-noar-abrir').hidden, true); assert.equal(t.E('o-noar-abrir').href, ''); assert.equal(t.E('o-noar-endereco').textContent, SITE);
  t.rest.atualizar(estado('no_ar')); assert.equal(t.E('o-noar-abrir').hidden, false); assert.equal(t.E('o-noar-abrir').href, SITE);
});

test('o restante abre sem o "Pagamento confirmado" da entrada: no ramo sem pagamento o status é limpo (o aria-live não anuncia o da entrada)', async () => {
  const doc = montarDoc(), win = { BZPix: janela.BZPix }; new Function('window', 'document', PAGAMENTO)(win, doc);
  let estadoDaApi = { pagamento: { status: 'pago' }, tentativa: null };
  const API = { pagamentoConfig: async () => CFG(), pagamento: async () => estadoDaApi, pagar: async () => ({}) };
  let pagou = 0; const tela = win.BZPagamentoTela.criar({ API, dinheiro, aoPagar() { pagou++; } });
  await tela.mostrar(1200, 40);
  assert.equal(doc.getElementById('o-pag-status').textContent, 'Pagamento confirmado pelo Mercado Pago.'); assert.equal(pagou, 1);
  estadoDaApi = { pagamento: null, parcela: 'saldo' };
  await tela.mostrar(1800, 60, { metodos: ['pix'] });
  assert.equal(doc.getElementById('o-pag-status').textContent, '', 'o restante começa com o status limpo');
  assert.equal(doc.getElementById('o-pag-form').hidden, false);
});
