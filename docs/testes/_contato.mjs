/* AJUDA DOS TESTES DO TELEFONE/WHATSAPP E DO E-MAIL DO SITE (PR 3b-3, decisão M3 do dono de 22/10). Não é arquivo de teste. Os valores já estão NORMALIZADOS (o formato que se guarda). */
export const WHATSAPP_BONS = ['+5521977167944', '+552133334444', '+5567999990001'];
export const WHATSAPP_RUINS = ['5521977167944', '+5521', '+55219771679441', '+5501977167944', '+5521877167944', '+5521277167944', '+55 21 97716-7944', ' +5521977167944', '+5521abc7167944', '+55'.padEnd(40, '9')];
export const EMAIL_BONS = ['contato@clinicasol.com.br', 'a.b+c@x-y.co', 'joao_silva@sub.dominio.com'];
export const EMAIL_RUINS = ['a@b', 'a@b.c', 'a b@c.com', 'A@B.COM', '@x.com', 'a@.com', 'a@b..com', 'a..b@c.com', '.a@c.com', 'a.@c.com', 'a@-b.com', 'a@b.com ', 'a@b.com\n', '<a>@b.com',
  'x'.repeat(65) + '@a.com', 'a@' + 'b'.repeat(64) + '.com', 'a@' + 'b'.repeat(61) + '.' + 'c'.repeat(61) + '.' + 'd'.repeat(61) + '.com'];   /* a última passa de 120 caracteres */
