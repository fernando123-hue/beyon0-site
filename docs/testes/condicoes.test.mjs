/* A PÁGINA DE CONDIÇÕES DO LANÇAMENTO (/condicoes): texto aprovado pelo dono em 2026-10-12 (03 Projetos/captacao/docs/
   parte6/condicoes-lancamento.md), ajustado pelo coordenador em 2026-10-14. Este teste prende o que não pode derivar sem
   ninguém ver: marcador do texto aprovado que sobrou na página, valor que não fecha (R$ 800 = 320 + 480; 40% + 60%), a
   vigência (31/12/2026 ou 10º cliente), "Beyon Zero" no lugar do nome do vendedor, estilo embutido (a CSP bloqueia), a
   página no rodapé ou no sitemap (ela é só para quem recebe o link, com noindex), e a privacidade dizendo o que a captação
   faz (o que o código de 03 Projetos/captacao/negocios faz).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DOMINIO, HOST_DO_DOMINIO } from './dominio.mjs';

const RAIZ = new URL('../../', import.meta.url);
const ler = arquivo => readFileSync(new URL(arquivo, RAIZ), 'utf8');
const html = ler('condicoes.html');
const visivel = html.replace(/<!--[^]*?-->/g, '').replace(/<script[^]*?<\/script>/g, '');
const semOculto = visivel.replace(/<p[^>]*\shidden[^>]*>[^]*?<\/p>/g, '');
const limpo = h => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const texto = limpo(semOculto);
const priv = limpo(ler('privacidade.html'));

test('condições: nenhum marcador do texto aprovado sobrou na parte visível da página', () => {
  assert.deepEqual(texto.match(/\{[a-z_]+\}/g) || [], [], 'marcador {…} sem preencher');
  assert.ok(!/\[[^\]]*(?:nome|número|endereço)[^\]]*\]/i.test(texto), 'campo [entre colchetes] sem preencher à vista');
});

/* PR C, C4: com o site na Cloudflare, a política de privacidade não pode citar a hospedagem antiga. Texto marcado para a
   revisão jurídica que já é pendência do dono (cobre a privacidade inteira). */
test('privacidade (C4): a hospedagem do site é a Cloudflare, em nenhum lugar a Vercel', () => {
  assert.doesNotMatch(priv, /Vercel/i, 'a Vercel deixa de hospedar o site');
  assert.match(priv, /A hospedagem \(Cloudflare\) registra dados técnicos de acesso, como endereço IP, para segurança e funcionamento\./);
  assert.match(priv, /Cloudflare \(a hospedagem e a entrega deste site, que recebe o endereço IP e dados técnicos do navegador ao abrir cada página, como todo servidor de internet; /);
  assert.equal((priv.match(/, Cloudflare \(/g) || []).length, 1, 'a Cloudflare entra uma vez só na lista de terceiros, com todos os papéis');
});

test('condições: vigência até 31/12/2026 ou o 10º cliente', () => {
  assert.match(texto, /Valem até 31\/12\/2026, ou até fechar o 10º cliente, o que vier primeiro\./);
});

test('condições: o vendedor é pendência do dono, escondida como no orçamento; "Beyon Zero" não ocupa o lugar do nome', () => {
  assert.match(html, /<p[^>]*id="vendedor"[^>]*\shidden[^>]*>Vendedor: \[nome completo do responsável\]/, 'linha do vendedor escondida e marcada como pendência');
  assert.match(html, /<!--[^]*?PENDÊNCIA DO DONO[^]*?-->\s*<p[^>]*id="vendedor"/, 'comentário de pendência junto da linha escondida');
  const contato = (semOculto.match(/<h2>Contato<\/h2>([^]*?)<p class="priv__voltar"/) || [])[1] || '';
  assert.ok(contato.includes('wa.me'), 'o contato por WhatsApp está na seção Contato');
  assert.ok(!/Beyon Zero/.test(limpo(contato)), 'a seção Contato não pode pôr "Beyon Zero" no lugar do nome do vendedor');
  assert.ok(!/Vendedor:/.test(texto), 'a linha do vendedor não pode aparecer enquanto o dono não preencher');
});

test('condições: CSP sem inline e página de texto sem script próprio', () => {
  assert.ok(!/<style|\sstyle="/.test(html), 'estilo embutido (a CSP bloqueia)');
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'script embutido (a CSP bloqueia)');
});

test('condições: preço, entrada e restante fecham, e a entrada é 40%', () => {
  const [, preco, entrada, restante] = texto.match(/R\$ (\d+) por site.*?R\$ (\d+) \(40%\) para começar.*?R\$ (\d+) \(60%\) quando o site estiver no ar/) || [];
  assert.ok(preco, 'não achei preço, entrada (40%) e restante (60%) no texto');
  assert.equal(Number(entrada) + Number(restante), Number(preco), 'entrada + restante diferem do preço');
  assert.equal(Number(entrada) / Number(preco), 0.4);
  const painel = [...html.matchAll(/<dd>R\$&nbsp;(\d+)/g)].map(m => Number(m[1]));
  assert.deepEqual(painel, [Number(preco), Number(entrada), Number(restante)], 'o painel de valores diverge do texto');
});

/* fundador: landing R$ 800 e institucional R$ 1.900, nada nos outros formatos (dono, 2026-10-14) */
test('condições: o institucional de fundador custa R$ 1.900 e também fecha em 40% + 60%', () => {
  const [, preco, entrada, restante] = texto.match(/site institucional, de até 5 páginas, por R\$ ([\d.]+), nas mesmas condições: dentro das 10 vagas e até 31\/12\/2026\..*?No institucional: R\$ ([\d.]+) \(40%\) para começar e R\$ ([\d.]+) \(60%\) com o site no ar\./) || [];
  assert.ok(preco, 'não achei o institucional (nas mesmas condições) com entrada e restante');
  const n = v => Number(v.replace('.', ''));
  assert.deepEqual([n(preco), n(entrada), n(restante)], [1900, 760, 1140]);
  assert.ok(!/R\$ (4\.800|8\.900)/.test(texto), 'o preço de fundador não vale para loja nem experiência digital');
});

/* com o institucional na página, "R$ 800 por site" sozinho diria que todo site sai por 800 (revisão do PR #41) */
test('condições: os R$ 800 são sempre "por site de uma página", inclusive na descrição e no OG', () => {
  const todas = [...limpo(visivel.replace(/<p[^>]*\shidden[^>]*>[^]*?<\/p>/g, '')).matchAll(/por site(?! de uma página)/g)].length
    + [...html.matchAll(/content="[^"]*por site(?! de uma página)/g)].length;
  assert.equal(todas, 0, '"por site" sem "de uma página"');
  assert.ok((html.match(/por site de uma página/g) || []).length >= 5, 'meta, OG, Twitter, painel de valores e texto');
});

test('condições: meta, canonical e OG apontam para /condicoes no domínio vigente (decisão do dono, 2026-10-14; domínio próprio em 2026-10-21)', () => {
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const re of [new RegExp('rel="canonical" href="' + esc(DOMINIO + '/condicoes') + '"'), new RegExp('property="og:url" content="' + esc(DOMINIO + '/condicoes') + '"'),
    /property="og:title"/, new RegExp('property="og:image" content="' + esc(DOMINIO + '/assets/og-cover.jpg') + '"'), /name="description"/, /<h1>Condições do lançamento<\/h1>/]) {
    assert.match(html, re);
  }
  const externos = [...visivel.replace(/http-equiv[^>]*>/, '').matchAll(/https?:\/\/([^\/\s"'<>]+)/g)].map(m => m[1]).filter(h => h !== HOST_DO_DOMINIO && h !== 'wa.me' && h !== 'www.w3.org');
  assert.deepEqual(externos, [], 'domínio ou link externo fora do combinado');
});

/* a oferta vence em 31/12/2026 ou no 10º cliente: a página é só para quem recebe o link (decisão do coordenador, 2026-10-14) */
test('condições: só para quem recebe o link: noindex, fora do sitemap e fora do rodapé das páginas', () => {
  assert.match(html, /<meta name="robots" content="noindex, follow" \/>/);
  assert.ok(!/condicoes/.test(ler('sitemap.xml')), 'a página está no sitemap');
  const comRodape = readdirSync(RAIZ).filter(f => f.endsWith('.html') && ler(f).includes('footer__legal'));
  assert.ok(comRodape.length >= 4, 'esperava index, sites, automação e orçamento: ' + comRodape.join(', '));
  for (const f of comRodape) {
    const rodape = (ler(f).match(/<div class="footer__legal">[^]*?<\/div>/) || [''])[0];
    assert.ok(rodape.includes('/privacidade'), f + ': o rodapé perdeu o link da privacidade');
    assert.ok(!rodape.includes('/condicoes'), f + ': o link das condições não vai no rodapé');
  }
});

test('condições: desistência diz os 7 dias (CDC art. 49), a devolução inteira e como pedir', () => {
  assert.match(texto, /Até 7 dias depois de aceitar.*entrada inteira \(Código de Defesa do Consumidor, art\. 49\)/);
  /* depois dos 7 dias a entrada fica, comece ou não o trabalho (dono, 2026-10-14: "Caso ela cancele após o primeiro pagamento, ficará comigo") */
  assert.match(texto, /Depois dos 7 dias, a entrada paga o trabalho reservado para você e não é devolvida\. Se você desistir, não paga o restante, e o site não vai ao ar\./);
  assert.ok(!/se eu ainda não comecei|se eu já comecei/.test(texto), 'a regra antiga (depende de ter começado) sobrou');
  /* atraso da Beyon Zero devolve a entrada, mesmo depois dos 7 dias (dono, 2026-10-14; CDC arts. 51 e 53) */
  assert.match(texto, /Se eu não entregar no prazo combinado, devolvo a entrada inteira, mesmo depois dos 7 dias\./);
  assert.match(html, /<a data-wa="[^"]*desistir[^"]*" href="https:\/\/wa\.me\/\d+">WhatsApp da Beyon Zero<\/a>/);
  /* (a devolução imediata é só a dos 7 dias: depois deles a entrada não volta, e o texto não pode prometer o contrário) */
  assert.match(texto, /Dentro dos 7 dias, a devolução é imediata, pelo mesmo meio do pagamento \(o Pix\), com o valor corrigido/);
  assert.match(texto, /orçamento automático do site segue a tabela normal/);
});

/* o Banco Central proibiu o nome "Pix Parcelado" (dez/2025); o pagamento à Beyon Zero continua só Pix (dono, 2026-10-14) */
test('condições: parcelar é pelo banco do cliente, com o nome permitido (Pix no crédito)', () => {
  assert.match(texto, /Se quiser parcelar, dá para usar o parcelamento do seu banco \(Pix no crédito\)\./);
  assert.ok(!/Pix parcelado/i.test(texto), 'nome proibido pelo Banco Central');
});

/* a indicação virou só pedido, sem Pix; a troca do fundador é depoimento + portfólio (dono, 2026-10-14; texto de
   03 Projetos/captacao/docs/parte6/condicoes-lancamento.md, commit 97c221a) */
test('condições: indicação sem pagamento; a troca do preço de fundador é depoimento e portfólio', () => {
  /* é PEDIDO, não condição do preço (dono, 2026-10-14, depois da revisão do PR #41): o consentimento da LGPD tem de ser livre */
  assert.match(html, /<h2>Um pedido<\/h2>/);
  assert.match(texto, /Se gostar do resultado, peço um depoimento curto e a permissão de mostrar o seu site no portfólio da Beyon Zero\. E, se conhecer alguém que precisa de site, uma indicação ajuda muito \(sem obrigação\)\. Se preferir não dar, o preço não muda\./);
  assert.ok(!/em troca/i.test(texto), 'depoimento e portfólio não são contrapartida do preço');
  assert.ok(priv.includes('e o preço não depende dela'), 'a privacidade diz que o consentimento é livre');
  assert.ok(!/eu pago a você|recompensa|5%|30%/.test(texto), 'a indicação paga sobrou');
});

test('condições: a vaga é confirmada na conversa, antes do "ok"', () => {
  assert.match(texto, /A vaga é confirmada na conversa, antes do seu “ok”\./);
});

test('condições: diz, sem tom de aviso, que por enquanto não há nota fiscal (decisão do dono, 2026-10-11)', () => {
  assert.match(texto, /Por enquanto, não emito nota fiscal/);
});

/* a política de privacidade cobre o que a captação faz, conforme o código (captacao/negocios: verificar.mjs, faxina.mjs,
   receita/estabelecimentos.mjs, fila.mjs) e as decisões de 2026-10-12 */
test('privacidade: cobre o primeiro contato, a busca na web com a Anthropic, o Pix direto, o depoimento e o portfólio', () => {
  for (const trecho of ['Quando a Beyon Zero procura o seu negócio', 'cadastro público de empresas da Receita Federal',
    'legítimo interesse (artigo 7º, inciso IX', 'responda “não”', '90 dias depois do último envio', 'Pix direto', 'Depoimento e portfólio', 'com a sua autorização por escrito',
    'a Beyon Zero manda o nome, o tipo, a cidade, o estado (UF) e o celular do negócio à Anthropic', 'conta de assinatura do próprio fundador',
    'buscador usado pela Anthropic', 'anthropic.com/legal/privacy', 'A Anthropic guarda os dados conforme a política de privacidade dela',
    'o Registro.br exige o seu CPF ou CNPJ', 'a hospedagem do site dos clientes da oferta de lançamento, na conta da Beyon Zero',
    'obrigação legal (artigo 7º, inciso II', 'a ponderação do artigo 10', 'dados mínimos', 'envio um a um', 'oposição imediata',
    'A avaliação fica registrada por escrito pela Beyon Zero (este texto e as decisões internas) e é enviada a pedido',
    'De todo contato apagado, fica por 12 meses um código embaralhado do contato usado no envio', 'a data da publicação mais recente',
    'se o celular do negócio aparece nela', 'o endereço da logo', 'uma nota de 0 a 100', 'o CNPJ e a natureza jurídica',
    'todos os telefones do cadastro (fixos também)', 'atividade da empresa', 'enquanto a Beyon Zero fizer esse tipo de contato', 'execução de contrato (artigo 7º, inciso V']) assert.ok(priv.includes(trecho), 'privacidade sem: ' + trecho);
  assert.match(priv, /Anthropic \([^)]*faz uma busca na web[^)]*\)/, 'a Anthropic e a busca na web em "Com quem os dados são tratados"');
  /* o pedido de ajuste escrito (PR 3a) vai para a ferramenta de IA que a Beyon Zero usa para fazer o ajuste: a política diz */
  assert.match(priv, /Anthropic \([^)]*os pedidos de ajuste que você escreve depois de escolher o modelo[^)]*ferramenta de inteligência artificial da Anthropic[^)]*telefone, e-mail e documento tirados automaticamente[^)]*\)/,
    'o pedido de ajuste escrito vai à Anthropic, redigido');
  const retencao = 'enquanto durar a relação e, depois, pelo prazo legal de guarda de comprovantes';
  assert.equal(priv.split(retencao).length - 1, 1, 'a guarda do Pix direto, sem número de anos');
  assert.ok(priv.includes('Depoimento e portfólio: o seu consentimento (artigo 7º, inciso I)'), 'a base legal do depoimento e do portfólio');
  assert.ok(!/Quem indica um negócio|chave Pix que você informar|recompensa/.test(priv), 'a indicação paga saiu (dono, 2026-10-14): nada de guardar o Pix de quem indica');
  assert.match(priv, /Registro\.br \(o registro do domínio[^)]*CPF ou CNPJ do titular\)/, 'o Registro.br em "Com quem os dados são tratados"');
  assert.match(ler('privacidade.html'), /<a href="https:\/\/www\.anthropic\.com\/legal\/privacy"[^>]*>anthropic\.com\/legal\/privacy<\/a>/);
});

test('privacidade: não afirma o que o código não faz nem o que o dono ainda não confirmou', () => {
  for (const [re, porque] of [[/nem passados a ninguém/, 'a busca na web passa dados à Anthropic'],
    [/fora de qualquer serviço de terceiros/, 'a busca na web e a mensagem saem do computador'],
    [/não copia dados de redes sociais/, 'a busca guarda a página pública do negócio (Instagram, Facebook)'],
    [/mesmo WhatsApp de onde saem as mensagens/, 'o dono ainda vai confirmar o número'],
    [/hospedada na Cloudflare, fora do Google/, 'a parte 4 (prévias) ainda não tem código'],
    [/dois códigos embaralhados|um do número e outro do e-mail/, 'o código guarda um só resumo, do contato usado no envio'],
    [/trein/i, 'a opção de treino da Anthropic o dono ainda vai confirmar'],
    [/[0-9]+ anos/, 'o prazo legal de guarda de comprovantes não leva número de anos']]) assert.ok(!re.test(priv), 'privacidade ainda diz algo falso: ' + porque);
});
