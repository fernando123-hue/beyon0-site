/* A PÁGINA DE CONDIÇÕES DO LANÇAMENTO (/condicoes): texto aprovado pelo dono em 2026-10-12 (03 Projetos/captacao/docs/
   parte6/condicoes-lancamento.md), ajustado pelo coordenador em 2026-10-14. Este teste prende o que não pode derivar sem
   ninguém ver: marcador do texto aprovado que sobrou na página, a divisão 40% + 60% (21/11: sem a oferta de lançamento, o
   preço é o do orçamento), a garantia, "Beyon Zero" no lugar do nome do vendedor, estilo embutido (a CSP bloqueia), a
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

/* 21/11 (proposta ao dono, último commit do ramo condicoes-2111, para poder sair sozinho): a oferta de lançamento (R$ 1.500 para os 10 primeiros, o institucional
   por R$ 4.500 nas mesmas condições, a vigência de 31/12/2026) sai da página e das metas; o preço é o do orçamento (regra do site: sem preço nas páginas) e a
   divisão 40% + 60% continua */
test('condições sem a oferta: nenhum preço fixo, nem "10 primeiros", nem a vigência, na página e nas metas; o preço é o do orçamento', () => {
  const metas = [...html.matchAll(/<meta (?:name|property)="(?:description|og:[a-z:]+|twitter:[a-z:]+)" content="([^"]*)"/g)].map(m => m[1]).join(' | ');
  for (const [onde, t] of [['página', texto], ['metas', metas]]) {
    assert.doesNotMatch(t, /R\$/, onde + ': preço fixo');
    assert.doesNotMatch(t, /10 primeiros|10º cliente|10 vagas|31\/12\/2026|mesmas condições|oferta de lançamento|preço de lançamento/i, onde + ': a oferta de lançamento');
  }
  assert.match(html, /<p>O preço é o do seu <a href="\/orcamento">orçamento<\/a>, sem mensalidade\.<\/p>/);
  assert.ok(!/<dl class="priv__valores">/.test(html), 'o painel de valores (preço, entrada, restante em reais) saiu com a oferta');
  assert.doesNotMatch(priv, /lançamento/i, 'a /privacidade também não fala mais da oferta');
  /* (revisão de segurança do #221) a garantia pública consta do contrato que o cliente confirma em "Li e confirmo" */
  assert.match(ler('api/_vendas/escopo.mjs'), /GARANTIA: você vê o site pronto antes de pagar o restante\. Se não gostar, não paga o restante, e o site não vai ao ar\./);
  assert.match(ler('api/_vendas/consultor.mjs'), /Só isso: a entrada volta só nos 7 dias; sem garantia de prazo nem de resultado\./);
});

/* a garantia, com o texto da proposta ao dono (21/11: aguardando o sim dele; as palavras não mudam sem ele) */
test('condições: o bloco "Nossa garantia" com as duas frases (sem o atraso, 21/11 dono), logo depois do preço do orçamento', () => {
  const i = html.indexOf('<h2>Nossa garantia</h2>');
  assert.ok(i > 0, 'o bloco Nossa garantia');
  const bloco = limpo(html.slice(i, html.indexOf('<h2>', i + 1)));
  assert.equal(bloco.trim(), 'Nossa garantia Você vê o site pronto antes de pagar o restante. Se não gostar, não paga o restante, e o site não vai ao ar. Até 7 dias depois de aceitar, você pode desistir por qualquer motivo e recebe a entrada de volta.');
  assert.ok(html.indexOf('O preço é o do seu orçamento') < i && i < html.indexOf('<h2>Pagamento</h2>'), 'a garantia vem antes do pagamento');
});

test('condições: o vendedor é pendência do dono, escondida como no orçamento; "Beyon Zero" não ocupa o lugar do nome', () => {
  assert.match(html, /<p[^>]*id="vendedor"[^>]*\shidden[^>]*>Vendedor: \[nome completo do responsável\]/, 'linha do vendedor escondida e marcada como pendência');
  assert.match(html, /<!--[^]*?PENDÊNCIA DO DONO[^]*?-->\s*<p[^>]*id="vendedor"/, 'comentário de pendência junto da linha escondida');
  const contato = (semOculto.match(/<h2>Contato<\/h2>([^]*?)<p class="priv__voltar"/) || [])[1] || '';
  assert.ok(contato.includes('mailto:contato.beyon.zero@gmail.com'), 'o contato por e-mail está na seção Contato');
  assert.ok(!/Beyon Zero/.test(limpo(contato)), 'a seção Contato não pode pôr "Beyon Zero" no lugar do nome do vendedor');
  assert.ok(!/Vendedor:/.test(texto), 'a linha do vendedor não pode aparecer enquanto o dono não preencher');
});

test('condições: CSP sem inline e página de texto sem script próprio', () => {
  assert.ok(!/<style|\sstyle="/.test(html), 'estilo embutido (a CSP bloqueia)');
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'script embutido (a CSP bloqueia)');
});

/* sem a oferta, o pagamento fica em porcentagem (o valor em reais é o do orçamento): 40% para começar e 60% com o site pronto, antes de ir ao ar */
test('condições: a entrada é 40% e o restante 60%, com o site pronto, antes de ir ao ar', () => {
  assert.match(texto, /40% para começar\. 60% quando o site estiver pronto, antes de ir ao ar\./);
});

test('condições: meta, canonical e OG apontam para /condicoes no domínio vigente (decisão do dono, 2026-10-14; domínio próprio em 2026-10-21)', () => {
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const re of [new RegExp('rel="canonical" href="' + esc(DOMINIO + '/condicoes') + '"'), new RegExp('property="og:url" content="' + esc(DOMINIO + '/condicoes') + '"'),
    /property="og:title"/, new RegExp('property="og:image" content="' + esc(DOMINIO + '/assets/og-cover.jpg') + '"'), /name="description"/, /<h1>Condições<\/h1>/, /<title>Condições — Beyon Zero<\/title>/]) {
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
  /* (dono, 21/11, revê a de 14/10) o atraso não devolve a entrada por regra, só se o cliente quiser cancelar, e a página não promete
     nem anuncia isso: nenhuma frase liga atraso a devolução */
  assert.doesNotMatch(texto, /atras\w*|não entregarmos no prazo|mesmo depois dos 7 dias/i, 'a página fala de atraso ou de devolução depois dos 7 dias');
  assert.match(html, /Para desistir, escreva para <a href="mailto:contato.beyon.zero@gmail.com">/);
  /* (a devolução imediata é só a dos 7 dias: depois deles a entrada não volta, e o texto não pode prometer o contrário) */
  assert.match(texto, /Dentro dos 7 dias, a devolução é imediata, pelo mesmo meio do pagamento \(o Pix\), com o valor corrigido/);
});

/* 21/11 (dono, D1 a D3 da captação, spec captacao/docs/specs/2026-11-21-restante-antes-do-ar.md): 24 horas para o restante depois do Pix do site pronto (sem ele, o
   projeto encerra), o restante pago volta se o cliente desistir antes de o site ir ao ar, e o domínio só é registrado com o restante pago. Cada regra de dinheiro fica
   na seção em que o cliente decide (dono, 21/11: curta e à vista, nada em letra miúda) */
test('condições (21/11): 24 horas para o restante, o encerramento sem ele, o restante devolvido antes do ar e o domínio depois do restante', () => {
  const secao = nome => { const i = html.indexOf('<h2>' + nome + '</h2>'); assert.ok(i >= 0, nome); return limpo(html.slice(i, html.indexOf('<h2>', i + 1))); };
  assert.match(secao('Pagamento'), /O site só vai ao ar com o restante pago\. Quando o site fica pronto, mandamos o Pix do restante\. Você tem 24 horas para pagar\. Sem o pagamento nesse prazo, encerramos o projeto\. A entrada segue a regra da desistência, mais abaixo\./);
  assert.match(secao('Desistência'), /Se você desistir depois de pagar o restante, mas antes de o site ir ao ar, devolvemos o restante pelo Pix, para a mesma conta que pagou\./);
  assert.match(secao('O que está incluso'), /1 ano de domínio grátis, registrado no seu nome \(no seu CPF ou CNPJ\) depois que o restante é pago\./);
  /* 23/11 (dono): nós registramos o domínio no nome do cliente; ele manda os dados e confirma 2 e-mails do Registro.br; o aceite autoriza */
  assert.match(secao('O que está incluso'), /Nós fazemos o registro: você manda o nome, o CPF e a data de nascimento de quem vai ser o dono \(ou o CNPJ\) e um e-mail, e confirma 2 e-mails do Registro\.br\. Aceitar estas condições autoriza o registro no seu nome\./);
  assert.ok(!/(?:3|três) dias[^.]{0,60}restante|restante[^.]{0,60}(?:3|três) dias|sai do ar/.test(texto), 'a regra antiga (o site no ar antes do restante, 3 dias e a saída do ar) não volta');
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
  assert.match(texto, /Se gostar do resultado, pedimos um depoimento curto e a permissão de mostrar o seu site no portfólio da Beyon Zero\. E, se conhecer alguém que precisa de site, uma indicação ajuda muito \(sem obrigação\)\. Se preferir não dar, o preço não muda\./);
  assert.ok(!/em troca/i.test(texto), 'depoimento e portfólio não são contrapartida do preço');
  assert.ok(priv.includes('e o preço não depende dela'), 'a privacidade diz que o consentimento é livre');
  assert.ok(!/eu pago a você|recompensa|5%|30%/.test(texto), 'a indicação paga sobrou');
});

/* (revisão de segurança da F3 do JEV) o modo sombra: um 2º modelo da Anthropic lê a conversa só para medir; só números e rótulos ficam */
test('privacidade: diz que um segundo modelo pode ler a conversa só para medir a qualidade, e que nenhum texto é guardado dessa leitura', () => {
  for (const trecho of ['também podem ser lidas por um segundo modelo da Anthropic, só para medir a qualidade das respostas', 'com os mesmos marcadores no lugar de contato e documento',
    'dessa leitura ficam guardados só números e rótulos, nunca o texto']) assert.ok(priv.includes(trecho), 'privacidade sem: ' + trecho);
});

/* (21/11, dono) sem a oferta de lançamento não há vaga: aceitar é responder "ok"; nada de "lançamento" nem "vaga" na página */
test('condições: aceitar é responder "ok" na conversa, sem vaga nem lançamento', () => {
  assert.match(texto, /Como aceitar Responda “ok” na conversa\./);
  assert.doesNotMatch(html, /lançamento|vaga/i);
});

test('condições: diz, sem tom de aviso, que por enquanto não há nota fiscal (decisão do dono, 2026-10-11)', () => {
  assert.match(texto, /Por enquanto, não emito nota fiscal/);
});

/* a política de privacidade cobre o que a captação faz, conforme o código (captacao/negocios: verificar.mjs, faxina.mjs,
   receita/estabelecimentos.mjs, fila.mjs) e as decisões de 2026-10-12 */
test('privacidade: cobre o primeiro contato, a busca na web com a Anthropic, o Pix direto, o depoimento e o portfólio', () => {
  for (const trecho of ['Quando a Beyon Zero procura o seu negócio', 'cadastro público de empresas da Receita Federal',
    'legítimo interesse (artigo 7º, inciso IX', 'responda “não”', '90 dias depois do último envio', 'Pix direto', 'Depoimento e portfólio', 'com a sua autorização por escrito',
    'a Beyon Zero manda o nome, o tipo, a cidade, o estado (UF) e o celular do negócio à Anthropic', 'conta de assinatura da Beyon Zero no Claude',
    'buscador usado pela Anthropic', 'anthropic.com/legal/privacy', 'A Anthropic guarda os dados conforme a política de privacidade dela',
    'o Registro.br exige o seu CPF ou CNPJ', 'pedimos esses dados pela nossa conversa por WhatsApp ou e-mail (não pela tela do orçamento), depois do restante pago, e usamos só para fazer o registro', 'a data de nascimento, se for CPF, e o e-mail do titular', 'a hospedagem do site dos clientes: na conta da Beyon Zero até o restante ser pago, depois numa conta no nome do próprio cliente',
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
  assert.match(priv, /Registro\.br \(o registro do domínio[^)]*CPF ou CNPJ[^)]*do titular\)/, 'o Registro.br em "Com quem os dados são tratados"');
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

/* dono, 03/11 (opção A): as páginas e o contrato falam em "nós", nunca no "eu" de uma pessoa só.
   O "eu" do visitante ("E se eu já tenho um site?", "Quero o meu site") e o do Zero ("eu sou o Zero, a IA") não entram aqui. */
const PAGINAS = ['index.html', 'sites.html', 'automacao.html', 'condicoes.html', 'orcamento.html', 'resumo.html', 'privacidade.html', '404.html'];
const ARQUIVOS = [...PAGINAS, 'api/_vendas/escopo.mjs', 'api/_vendas/catalogo.mjs', 'js/painel-entregas.js'];
const EU_DA_EMPRESA = [
  /\bvocê me (conta|contar|passa|passar|manda|mandar)\b/i,
  /(^|[>.!?]\s*|["'])(Faço|Construo|Entrego|Confiro|Desenho|Publico|Entendo|Coloco|Conecto|Monto|Testo|Deixo|Olho|Escrevo|Cuido|Atendo)\b/m,
  /\be (coloco|conecto|passo|confiro|construo|entrego|publico|monto|testo) (o|a|os|as|no|ao|nos|acessos|ao)\b/i,
  /\bnão ganho\b|\bEstou aguardando\b|\bmeu computador\b/i,
  /\beu (faço|monto|testo|desenho|digo|entrego|aviso|lembro|escrevo|escolho|cadastro|trago|importo|deixo|olho|apago|uso|peço|indico|cuido)\b/i,
  /\b(meu|minha) (aviso|conta)\b/i,
  /\bdepender de mim\b/i,
  /\batendo todo o Brasil\b/i,
  /\bEnquanto espero\b/i,
  /\bSe eu (precisar|não entregar)\b/i,
  /\bpara quem vou desenhar\b/i
];

for (const arq of ARQUIVOS) {
  test('voz da empresa em ' + arq + ': "nós", sem o "eu" de uma pessoa só', () => {
    const texto = readFileSync(new URL('../../' + arq, import.meta.url), 'utf8');
    for (const re of EU_DA_EMPRESA) {
      const m = texto.match(re);
      assert.equal(m, null, 'voz no singular em ' + arq + ': "' + (m && m[0]) + '"');
    }
  });
}

test('voz da empresa: o contrato e /condicoes usam a mesma voz no plural', () => {
  const escopo = readFileSync(new URL('../../api/_vendas/escopo.mjs', import.meta.url), 'utf8');
  const condicoes = readFileSync(new URL('../../condicoes.html', import.meta.url), 'utf8');
  for (const t of [escopo, condicoes]) {
    assert.match(t, /nós avisamos que estamos aguardando/);
    assert.match(t, /O site só vai ao ar com o restante pago\./);   /* (19/11, a ordem nova: os 3 dias e os lembretes saíram junto com o site no ar antes do restante) */
  }
});

test('26/11 (dono): /condicoes diz, logo depois do encerramento por restante não pago, que dá para retomar em até 6 meses pagando só o restante, com mudanças à parte e recomeço depois', () => {
  const html = readFileSync(new URL('../../condicoes.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const pagamento = html.slice(html.indexOf('<h2>Pagamento</h2>'), html.indexOf('<h2>O que está incluso</h2>'));
  const enc = pagamento.indexOf('Sem o pagamento nesse prazo, encerramos o projeto.');
  const ret = pagamento.indexOf('<p>Se o projeto for encerrado porque o restante não foi pago, e a entrada não foi devolvida, dá para voltar em até&nbsp;6&nbsp;meses.');
  const fimEnc = pagamento.indexOf('</p>', enc);
  assert.ok(enc > 0 && ret > enc && pagamento.slice(fimEnc + 4, ret).trim() === '', 'a volta é o parágrafo seguinte ao do encerramento, em "Pagamento"');
  assert.match(pagamento, /Você paga só o restante do mesmo pedido, e o site, que fica guardado, vai ao&nbsp;ar\./);
  assert.match(pagamento, /O que mudar em relação ao pedido é orçado à parte\./);
  assert.match(pagamento, /Passados os 6&nbsp;meses, o projeto recomeça do zero, com um orçamento novo, e a entrada paga antes não&nbsp;conta\./);
  /* a privacidade diz o mesmo prazo de guarda (dono, 26/11: o site e o material ficam para a volta funcionar) */
  const priv = readFileSync(new URL('../../privacidade.html', import.meta.url), 'utf8');
  assert.match(priv, /Se o projeto for encerrado porque o restante não foi pago, a cópia do material e o site pronto ficam guardados por 6 meses, para você poder voltar pagando só o restante; depois, são apagados\./);
});
