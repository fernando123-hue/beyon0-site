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
