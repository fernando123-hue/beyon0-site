/* A VARREDURA (api/_vendas/varredura.mjs), pendência PR2b1-varredura-fp: cada falso negativo conhecido vira achado e
   cada falso positivo conhecido deixa de ser, um teste por caso. O que já passava continua passando (fila-direcoes). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { varrer } from '../../api/_vendas/varredura.mjs';

const tipos = texto => varrer({ t: texto }).map(a => a.tipo);
const acha = (texto, tipo) => assert.ok(tipos(texto).includes(tipo), JSON.stringify(texto) + ' devia achar ' + tipo + ' (achou: ' + tipos(texto).join(', ') + ')');
const limpo = texto => assert.deepEqual(tipos(texto), [], JSON.stringify(texto) + ' não devia achar nada');

test('falsos negativos: domínio fora da lista de TLDs', () => {
  for (const t of ['acesse golpe.pt', 'veja promo.digital agora', 'site loja.fr']) acha(t, 'endereço de site');
});
test('falsos negativos: telefone com o 9 solto e sem parênteses', () => {
  for (const t of ['ligue 21 9 8765-4321', 'ligue 21 9.8765.4321', 'ligue 21-9-8765-4321']) acha(t, 'telefone');
});
test('falsos negativos: ponto disfarçado com espaço ou sinal', () => {
  for (const t of ['golpe . com', 'golpe(dot)com', 'golpe[dot]net', 'golpe·com']) acha(t, 'endereço de site');
});

test('falsos positivos: faixa de preço não é telefone', () => limpo('Planos de R$ 2500-3500 por mês'));
test('falsos positivos: IPv4 com octeto acima de 255 não é endereço', () => limpo('Versão 300.400.500.600 do catálogo'));
test('falsos positivos: texto longo com hífens não é chave', () => limpo('passo-1-escolha-2-confirme-3-pague-4-receba-5'));
test('falsos positivos: um achado não vira dois (chave AIza não é também telefone)', () => {
  assert.deepEqual(tipos('AIza' + 'SyA1234567890abcdefghijklmn'), ['chave']);
});
test('falsos positivos: "um ponto com desconto" é texto', () => limpo('Ganhe um ponto com desconto na segunda compra'));
test('falsos positivos: símbolo de outro alfabeto fora de palavra (10 Ω) não é disfarce', () => {
  limpo('Resistores de 10 Ω');
  acha('acesse gоlpe', 'letra de outro alfabeto');   /* (o "о" é cirílico, dentro de palavra latina: continua achado) */
});
test('falsos positivos: código de barras e 11 dígitos sem dígito verificador válido não são documento', () => {
  limpo('Código 78912345678901');
  limpo('Lote 12345678901');
  acha('CPF 529.982.247-25', 'documento');   /* (CPF de exemplo com dígitos válidos) */
  acha('CNPJ 11.222.333/0001-81', 'documento');   /* (CNPJ de exemplo com dígitos válidos) */
});

/* o que a correção não pode soltar nem criar de novo (além dos casos acima) */
test('limites: o que continua achado', () => {
  acha('Golpe.pt tem promoção', 'endereço de site');   /* domínio com maiúscula no começo da frase */
  acha('veja Niterói.com', 'endereço de site');   /* acento antes do ponto */
  acha('golpe ponto com/promo', 'endereço de site');
  acha('golpe ponto com barra oferta', 'endereço de site');
  acha('golpe ponto com ponto br', 'endereço de site');
  acha('golpe (ponto net', 'endereço de site');   /* sinal de um lado só */
  acha('golpe ponto) net', 'endereço de site');
  acha('golpe .com', 'endereço de site');
  acha('fale com @clinica.sol', 'perfil de rede social');   /* um perfil é contato: o dono lê */
  acha('Clínica Ա', 'letra de outro alfabeto');
  acha('голос.com', 'endereço de site');
  acha('ligue 2133-4455', 'telefone');   /* fixo sem DDD, sem R$ e sem outro número antes */
  acha('CNPJ 12.345.678/0001-90', 'documento');   /* com pontuação é documento mesmo com dígito verificador errado (erro de digitação) */
  acha('CPF 12345678900', 'documento');   /* sem pontuação, mas com o rótulo CPF, também */
});
test('limites: o que continua texto', () => {
  limpo('Feito com Next.js');
  limpo('O fim.Começo de tudo');
  limpo('Clínica · Online');   /* separador com espaço dos dois lados não é ponto */
  limpo('Medida 2.5.mm');
  limpo('Ganhe um ponto com desconto');
});
test('documento: CPF e CNPJ de exemplo têm dígito verificador válido, sequência repetida não', async () => {
  const { cpfValido, cnpjValido } = await import('../../api/_vendas/varredura.mjs');
  assert.ok(cpfValido('52998224725'));
  assert.ok(cnpjValido('11222333000181'));
  assert.ok(!cpfValido('52998224724') && !cpfValido('11111111111') && !cpfValido('1234'));
  assert.ok(!cnpjValido('11222333000182') && !cnpjValido('11111111111111') && !cnpjValido('78912345678901'));
});

/* ---- correção da revisão da Task 7 (I1 e menores 1 a 11) ---- */
test('I1: palavra inteira em letras gregas que imitam as latinas é achada (não só a letra grega colada a latina)', () => {
  for (const t of ['acesse ΟΡΤΟ.pt', 'acesse ΡΟΡ.digital', 'ΟΡΤΟ . com', 'ΟΡΤΟ(dot)com', 'ΟΡΤΟ ponto com.', 'siga @ΟΡΤΟ']) acha(t, 'letra de outro alfabeto');
  acha('Clínica Ωmega', 'letra de outro alfabeto');
  acha('Αθήνα', 'letra de outro alfabeto');
  limpo('Resistores de 10 Ω');
  limpo('π = 3,14');
  limpo('Clínica São José · Niterói — 24h');
});
test('1: "ponto com" solto seguido de emoji, hífen ou parênteses é achado; "um ponto com desconto" segue texto', () => {
  for (const t of ['golpe ponto com \u{1F642}', 'golpe ponto com - promo', 'golpe ponto com (link)']) acha(t, 'endereço de site');
  limpo('Ganhe um ponto com desconto');
  limpo('um ponto com 10% de desconto');
});
test('2: domínio fora da lista com ponto separado ou disfarçado é achado, como golpe(dot)pt', () => {
  for (const t of ['golpe(dot)pt', 'golpe . pt', 'golpe .pt', 'golpe (ponto) pt', 'golpe [ponto] digital']) acha(t, 'endereço de site');
});
test('3: extensão em maiúscula é achada', () => {
  for (const t of ['GOLPE.PT', 'golpe.PT', 'GOLPE . COM', 'acesse GOLPE.DIGITAL']) acha(t, 'endereço de site');
  limpo('Abra o ARQUIVO.PDF e a FOTO.PNG');
  limpo('Leia o README.TXT');
});
test('4: nome com acento antes do ponto é achado', () => {
  for (const t of ['promoção.pt', 'niterói.digital', 'veja São-José.fr']) acha(t, 'endereço de site');
  acha('fale com @clinica.sol', 'perfil de rede social');
  limpo('Medida 2.5.mm');
});
test('5: outros pontos médios colados viram ponto; com espaço dos dois lados são só separador', () => {
  for (const t of ['golpe•com', 'golpe⋅com', 'golpe‧com', 'golpe・com', 'golpe･com']) acha(t, 'endereço de site');
  limpo('Café • Almoço ⋅ Jantar');
  limpo('Clínica ・ Online');
});
test('6: falsos alarmes que dá para tirar sem abrir buraco; os que não dão ficam como aceitos com alarme', () => {
  for (const t of ['foto.mp4', 'Sr.joão']) limpo(t);
  /* aceitos com alarme: a abreviação com ponto colado é idêntica a "Golpe.pt"; só uma lista de TLDs reais separaria, e ela envelhece.
     "Pedimos desculpas . Com isso" e "fim . Me ligue" têm a mesma forma de "golpe . Com" (TLD da lista só com a inicial maiúscula,
     depois de espaço e ponto): limpá-los abria o buraco, e na dúvida entre achar e limpar a regra é achar */
  for (const t of ['Av.paulista 100', 'Seg.sex 8h', 'Cia.ltda', 'Pedimos desculpas . Com isso', 'fim . Me ligue']) acha(t, 'endereço de site');
  for (const t of ['golpe . Com', 'acesse golpe .Com agora', 'Golpe . Br', 'golpe\u2009. Com']) acha(t, 'endereço de site');
});
test('7: chave com pedaços curtos e mistos é achada; frase com hífens (letras ou dígitos) segue texto', () => {
  acha('A1B2C-3D4E5-F6G7H-8I9J0-K1L2M-N3O4P', 'chave');
  limpo('passo-1-escolha-2-confirme-3-pague-4-receba-5');
  limpo('Atendimento-personalizado-para-clinicas-e-consultorios');
});
test('8: faixa de preço encadeada não é telefone (guarda a regra de fixoSemDdd)', () => {
  limpo('Planos 1000-2500-3500');
  limpo('Planos de R$ 2500-3500 por mês');
  acha('ligue 2133-4455', 'telefone');
});
test('9: perfil depois de aspas ou dois-pontos é achado', () => {
  for (const t of ['Siga "@golpe.pt"', 'Siga:@golpe.pt', 'Siga (@golpe_oficial)']) acha(t, 'perfil de rede social');
  limpo('Fale com a equipe');
});
test('10: .zip é TLD de verdade e é achado; extensões de arquivo seguem texto', () => {
  acha('baixe golpe.zip', 'endereço de site');
  limpo('Feito com Next.js e arquivo.pdf');
});
test('11: rótulo CPF/CNPJ com "nº", "n°" ou "no" ainda marca o documento', () => {
  for (const t of ['CPF nº 12345678900', 'CPF n° 12345678900', 'CPF no 12345678900', 'CPF nº: 12345678900', 'CNPJ nº 12345678000190']) acha(t, 'documento');
  limpo('Lote nº 12345678901');
});
/* ---- 2ª correção da Task 7 (I1 e menores 1 a 6 da revisão) ---- */
test('fix2 I1: TLD da lista só com a inicial maiúscula, depois de espaço e ponto, é achado', () => {
  for (const t of ['golpe . Com', 'acesse golpe .Com agora', 'Golpe . Br', 'golpe . Net', 'golpe\u2009. Com']) acha(t, 'endereço de site');
});
test('fix2 1: "(ponto de venda)" e afins são texto de loja; com TLD só vale a lista quando o sinal está de um lado só', () => {
  for (const t of ['Loja física (ponto de venda)', 'Retirada no local (ponto de coleta)', 'Estamos no ponto) de ônibus']) limpo(t);
  for (const t of ['golpe (ponto) pt', 'golpe [ponto] digital', 'golpe (ponto) net', 'golpe (ponto) com', 'golpe (ponto com', 'golpe ponto) com', 'golpe(dot)pt']) acha(t, 'endereço de site');
  /* aceito com alarme: dos dois lados do parêntese, qualquer palavra curta é TLD */
  acha('Nosso (ponto) de encontro', 'endereço de site');
});
test('fix2 2: "pontocom" colado é achado; "a bolha pontocom" fica como aceito com alarme', () => {
  for (const t of ['acesse golpepontocom', 'golpe pontocom.', 'golpe pontobr']) acha(t, 'endereço de site');
  acha('a bolha pontocom', 'endereço de site');
});
test('fix2 3: mais pontos médios de outras escritas colados viram ponto; com espaço são separador', () => {
  for (const t of ['golpe\u1427com', 'golpe\uA78Fcom', 'golpe\u2E31com', 'golpe\u2E33com', 'golpe\u16EBcom', 'golpe\u0701com']) acha(t, 'endereço de site');
  limpo('Café \u2E31 Almoço');
  limpo('Clínica \u16EB Online');
});
test('fix2 5: letra grega só no fim de palavra latina e frase com hífens e maiúsculas (mutações sobreviventes da revisão)', () => {
  acha('acesse golp\u0395', 'letra de outro alfabeto');   /* Épsilon grego depois de letra latina */
  acha('TOYOT\u0391', 'letra de outro alfabeto');         /* Alfa grego depois de letra latina */
  limpo('Passo-1-Escolha-2-Confirme-3-Pague-4-Receba-5');
});
test('fix2 6: domínio com TLD curto da lista de golpe, em qualquer caixa, é achado; abreviação e perfil seguem como estavam', () => {
  for (const t of ['Golpe.Pt', 'golpe.Pt', 'golpe.pT', 'GoLpE.pT', 'Golpe.Digital', 'golpe.Bet', 'Golpe.Fr agora']) acha(t, 'endereço de site');
  for (const t of ['Dr.Silva', 'fim.Começo', 'Fim.Ok', 'Av. Paulista']) limpo(t);
  assert.deepEqual(tipos('Siga "@golpe.pt"'), ['perfil de rede social']);
});
test('fix3 I1: "ponto" por extenso com sinal de um lado só vale para todo TLD da lista e da lista de golpe', () => {
  for (const t of ['golpe (ponto pt', 'golpe ponto) me', 'golpe (ponto online', 'golpe(pontodigital', 'golpe [ponto io']) acha(t, 'endereço de site');
  for (const t of ['Loja física (ponto de venda)', 'Retirada no local (ponto de coleta)', 'Estamos no ponto) de ônibus']) limpo(t);
  /* aceitos com alarme: "(ponto" seguido de palavra que também é TLD */
  for (const t of ['Atendimento (ponto online e físico)', 'Quiosque (ponto top)']) acha(t, 'endereço de site');
});
test('fix3 I2: CPF com ponto no lugar do hífen é documento com dígito válido ou rótulo; lote com pontos segue texto', () => {
  for (const t of ['CPF 529.982.247.25', '529.982.247.25', 'CPF: 529.982.247.24']) acha(t, 'documento');
  limpo('Lote 123.456.789.01');
  acha('IP 192.168.100.10', 'endereço de site');
});
test('regex sem backtracking catastrófico: 300 caracteres adversários (o tamanho máximo de um texto higienizado)', () => {
  const entradas = ['a-'.repeat(150), 'a.'.repeat(150), 'A1-'.repeat(100), ' . '.repeat(100), 'ponto '.repeat(50), '9'.repeat(300), 'ΟΡ'.repeat(150), 'a@'.repeat(150), 'ç.'.repeat(150), '(ponto '.repeat(43), 'a .'.repeat(100), 'ponto) '.repeat(43), 'a pontocom'.repeat(30)];
  for (const entrada of entradas) {
    const inicio = performance.now();
    varrer({ t: entrada });
    assert.ok(performance.now() - inicio < 1000, 'varredura lenta demais para ' + entrada.slice(0, 12) + '… (' + entrada.length + ')');
  }
});
