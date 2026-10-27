/* AS REGRAS DA D4 NOS QUATRO LUGARES (PR 3b-3a; achado MÉDIO-3 do 3b-1, spec §13): o escopo que o cliente confirma traz o que a Beyon vai aplicar. Sem isso, a Beyon aplicaria
   uma regra que o cliente não confirmou. Contrato (montarEscopo), consultor (montarSistema), /condicoes e a tela dizem a MESMA coisa; "Quando pago o restante?" entra com a
   parte dela; as frases da D2 e da D5 que nunca entram continuam barradas.
   Os textos do material parado e do restante são os da captação (docs/parte6/condicoes-lancamento.md), decisão do dono de 22/10, LITERAIS em /condicoes.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { montarEscopo } from '../../api/_vendas/escopo.mjs';
import { montarSistema } from '../../api/_vendas/consultor.mjs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const semComentarioJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const texto = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/ ([).,:?%])/g, '$1').trim();
const REGRAS = JSON.parse(ler('docs/fase2/regras-rascunho-v1.json'));
const ESTIMATIVA = { formato: { nome: 'Landing page', paginas_incluidas: 1 }, itens: [], valor_total: 1800, sinal: 720, sinal_percentual: 40, prazo_dias: 7, fase: 'fase1', fatores: { paginas: 1 }, multiplicadores: {} };
const DIRECAO = { nome_conceito: 'Clareza', estrategia: 'conversao', secoes: [{ tipo: 'hero' }] };

const CONTRATO = montarEscopo({ estimativa: ESTIMATIVA, direcao: DIRECAO, alteracoesAplicadas: [], briefing: { negocio: { nome: 'Clínica Sol' } } }).escopo;
const CONSULTOR = montarSistema(REGRAS, {});
const CONDICOES = texto(ler('condicoes.html'));
const TELA = texto(ler('orcamento.html')) + '\n' + fs.readdirSync(new URL('../../js/', import.meta.url)).filter(f => /^orcamento.*\.js$/.test(f)).map(f => semComentarioJs(ler('js/' + f))).join('\n');

/* as frases LITERAIS da captação (1ª pessoa do dono): /condicoes as traz exatamente assim */
const MATERIAL_1A = 'Nada vai ao ar sem o seu material e a sua autorização: enquanto ele não chegar, eu aviso que estou aguardando e o projeto fica parado.';
/* captação 8fb5208 (26/10): a frase vem logo depois da do material, no mesmo parágrafo, com "também" */
const AJUSTES_1A = "Enquanto espero a sua lista de ajustes, o prazo também fica parado.";
const RESTANTE_1A = 'Se o restante não for pago em 3 dias depois do meu aviso de que o site está no ar, ele sai do ar até o pagamento. Antes disso eu lembro duas vezes, no segundo e no terceiro dia.';

/* cada regra: um predicado por lugar (a mesma ideia, na voz do lugar: 1ª pessoa no contrato, em /condicoes e na tela; 3ª pessoa no consultor) */
const REGRAS_D4 = [
  ['prazo parado enquanto se espera a lista de ajustes', t => /(espero a sua|o cliente não manda a) lista de ajustes, o prazo (também )?fica parado./.test(t)],
  ['material: nada vai ao ar sem material e autorização; a Beyon avisa que aguarda e o projeto fica parado (22/10)', t => /Nada vai ao ar sem (o seu material e a sua autorização|o material e a autorização do cliente): enquanto ele não chegar, (eu aviso que estou|a Beyon Zero avisa que está) aguardando e o projeto fica parado\./.test(t)],
  ['restante: 3 dias depois do aviso de que o site está no ar ele sai do ar até o pagamento; dois lembretes antes (22/10)', t => /Se o restante não for pago em 3 dias depois d(o meu|o) aviso de que o site está no ar, ele sai do ar até o pagamento\. Antes disso (eu lembro|a Beyon Zero lembra) duas vezes, no segundo e no terceiro dia\./.test(t)],
  ['atraso da Beyon devolve a entrada inteira, mesmo depois dos 7 dias', t => /entrada (é devolvida )?inteira( de volta)?,? mesmo depois dos 7 dias|devolvo a entrada inteira, mesmo depois dos 7 dias/.test(t)]
];
for (const [nome, ok] of REGRAS_D4) {
  test('D4, ' + nome + ': aparece no contrato, no consultor, em /condicoes e na tela', () => {
    assert.ok(ok(CONTRATO), 'contrato (escopo.mjs): ' + CONTRATO.slice(-1100));
    assert.ok(ok(CONSULTOR), 'consultor (consultor.mjs)');
    assert.ok(ok(CONDICOES), '/condicoes (condicoes.html)');
    assert.ok(ok(TELA), 'a tela (orcamento.html e js/orcamento*.js)');
  });
}

test('22/10: /condicoes traz os trechos da captação LITERAIS, o do material em "Prazo" e o do restante em "Pagamento", depois do institucional', () => {
  const html = ler('condicoes.html');
  const secao = nome => { const i = html.indexOf('<h2>' + nome + '</h2>'); assert.ok(i >= 0, nome); return texto(html.slice(i + 1, html.indexOf('<h2>', i + 1))); };
  assert.ok(secao('Prazo').includes(MATERIAL_1A + ' ' + AJUSTES_1A), 'Prazo (o prazo parado logo depois do material parado): ' + secao('Prazo'));
  assert.equal(secao('Prazo').split('lista de ajustes, o prazo').length, 2, 'a frase do prazo parado aparece uma vez só em Prazo');
  const pagamento = secao('Pagamento');
  assert.ok(pagamento.includes(RESTANTE_1A), 'Pagamento: ' + pagamento);
  assert.ok(pagamento.indexOf('No institucional:') < pagamento.indexOf(RESTANTE_1A), 'o trecho do restante vem depois do institucional');
  assert.ok(CONDICOES.includes('Última atualização: 22 de outubro de 2026'), 'a data da versão');
});

test('o contrato diz que o restante é pago quando o site estiver no ar (não "na entrega") e os dias úteis continuam como a 3b-2 deixou', () => {
  assert.match(CONTRATO, /e o restante quando o site estiver no ar/);
  assert.doesNotMatch(CONTRATO, /restante na entrega/);
  assert.match(CONTRATO, /PRAZO: até 7 dias úteis, contados do sinal pago e do material recebido\. Sábado, domingo e feriado nacional não contam\./);
  assert.match(CONTRATO, /2 listas de ajuste/);
});

test('22/10: as promessas antigas saíram dos quatro lugares ("imagens do modelo", "10 dias" do restante, os 30 dias do material) e nenhum texto fala de encerrar por falta de material', () => {
  for (const [nome, t] of [['contrato', CONTRATO], ['consultor', CONSULTOR], ['condições', CONDICOES], ['tela', TELA]]) {
    assert.ok(!/imagens do modelo/i.test(t), nome + ' ainda promete as imagens do modelo');
    assert.ok(!/em até 10 dias depois de o site ir ao ar|restante[^.]{0,60}\b10 dias/i.test(t), nome + ' ainda diz 10 dias para o restante');
    assert.ok(!/material[^.]{0,60}\b30 dias|\b30 dias[^.]{0,60}material/i.test(t), nome + ' ainda diz os 30 dias do material');
    assert.ok(!/(encerr|cancel)\w*[^.]{0,60}(sem|falta d\w*) (o )?material|sem_material/i.test(t), nome + ' fala de encerrar por falta de material');
    assert.ok(!/(apag|exclu|delet)\w*[^.]{0,60}(6 meses|seis meses)/i.test(t), nome + ' promete o apagamento do material parado (isso é do PR da privacidade)');
  }
});

test('a tela diz "Quando pago o restante?" com a porcentagem da proposta (nunca escrita à mão) e a regra dos 3 dias; os rótulos "Na entrega" saíram', () => {
  const html = ler('orcamento.html');
  const antes = html.slice(html.indexOf('id="o-antes"'), html.indexOf('</section>', html.indexOf('id="o-antes"')));
  assert.match(texto(antes), /Quando pago o restante\?/);
  assert.match(texto(antes), /Quando o site estiver no ar: os outros.{0,40}% do total, por Pix, nesta mesma página\./);
  assert.ok(texto(antes).includes(RESTANTE_1A), 'a pergunta traz a regra dos 3 dias literal');
  assert.ok(/id="o-ap-resto-pct"/.test(antes), 'o percentual do restante vem da proposta (js/orcamento-entrega.js), não do HTML');
  assert.ok(!/\b60\s?%/.test(texto(antes)), 'nenhum 60% à mão');
  assert.ok(!/Na entrega/.test(texto(html)), 'nenhum rótulo "Na entrega" (resumo e recibo): o restante é quando o site estiver no ar');
});

test('a pergunta do restante promete a tela do restante: nasce escondida e só aparece com a entrega ligada e a proposta (como as outras promessas)', () => {
  const html = ler('orcamento.html');
  assert.match((html.match(/<details[^>]*id="o-faq-restante"[^>]*>/) || [''])[0], /\shidden[\s>]/, 'o-faq-restante nasce escondido');
  const js = semComentarioJs(ler('js/orcamento-entrega.js'));
  assert.ok(/'o-faq-restante'/.test(js), 'o código da tela liga e desliga a pergunta pelo estado');
  assert.ok(/o-ap-resto-pct/.test(js), 'o código preenche a porcentagem');
});

test('o que NUNCA entra continua barrado (D2: "quantos precisar"; D5: aprovada sozinha) nos quatro lugares', () => {
  const proibidas = [/quantos precisar|sem limite de ajustes/i, /(conta|vale) como aprovad|considerad\w* (como )?aprovad|aprova(d\w*|ção)? (sozinh|automátic|automatic)|sem resposta[^.]{0,40}aprovad/i];
  for (const [nome, t] of [['contrato', CONTRATO], ['consultor', CONSULTOR], ['condições', CONDICOES], ['tela', TELA]]) for (const re of proibidas) assert.ok(!re.test(t), nome + ' traz frase barrada ' + re);
});

test('/condicoes mostra a data de hoje em "Última atualização" e é a MESMA condicoes_versao da captação (quando a captação está ao lado)', () => {
  const m = /Última atualização: (\d{1,2}) de (\p{L}+) de (\d{4})/u.exec(CONDICOES);
  assert.ok(m, 'a data da página');
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const iso = m[3] + '-' + String(MESES.indexOf(m[2]) + 1).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  const pasta = process.env.BZ_CAPTACAO || path.resolve(import.meta.dirname, '../../../captacao');
  const cfg = path.join(pasta, 'config', 'entrega.json');
  if (!fs.existsSync(cfg)) return console.warn('[textos-d4] pasta da captação não encontrada: a condicoes_versao NÃO foi comparada (' + iso + ')');
  const versao = JSON.parse(fs.readFileSync(cfg, 'utf8')).condicoes_versao;
  assert.equal(versao, iso, 'a captação (config/entrega.json) tem de trocar condicoes_versao para ' + iso + ' junto com esta página: ela recusa aceite de data anterior à versão em vigor');
});
