# Tabela de regras comerciais — rascunho v1 (para o dono aprovar)

Arquivo com os valores: `docs/fase2/regras-rascunho-v1.json`. **Rascunho:** nenhum visitante vê esses preços até o dono aprovar e ativar uma versão.

## De onde vêm os valores

Pesquisa de mercado de 2026, sempre na **metade de cima** das faixas de freelancer e abaixo das agências grandes. O posicionamento é de acabamento premium, prazo curto e garantia de desempenho medido.

| Formato | Mercado (fonte) | Proposta | Prazo |
|---|---|---|---|
| Landing page | R$ 500 a R$ 2.500 com freelancer bom ([InfinitePay](https://www.infinitepay.io/blog/quanto-custa-criar-um-site), [Wix](https://pt.wix.com/blog/quanto-custa-uma-landing-page)) | Base R$ 1.500 (piso R$ 900) | 5 dias |
| Institucional | R$ 800 a R$ 2.000 simples; R$ 2.500 a R$ 8.000 em média ([Locaweb](https://www.locaweb.com.br/blog/temas/primeiros-passos/quanto-custa-um-site/)) | Base R$ 3.500 com 5 páginas (piso R$ 2.200; era R$ 3.200, valor aprovado pelo dono em 2026-10-09) | 8 dias |
| Experiência digital (sob medida) | R$ 2.000 a R$ 50.000 com funcionalidades ([Locaweb](https://www.locaweb.com.br/blog/temas/primeiros-passos/quanto-custa-um-site/)) | Base R$ 8.900 com 4 páginas (piso R$ 4.500; era R$ 6.500, aprovado em 2026-10-09: agência cobra de R$ 10.000 a R$ 35.000) | 10 dias |

Em 2026-10-09 o dono aprovou também: textos de R$ 150 para R$ 250 por página ("escritos pela Beyon Zero") e integração de R$ 600 para R$ 900 (pesquisa em `03 Projetos/auditoria-2026-10-09/pesquisa-precos-loja-area-sistema.md`).

Os adicionais seguem a mesma lógica: um valor por unidade, um prazo por unidade e uma prioridade. A prioridade define o que entra primeiro quando o prazo de 10 dias aperta.

- **Loja em plataforma pronta** (Nuvemshop ou Shopify, tabela v2, 2026-10-09): base R$ 4.800 (piso R$ 3.500), 8 dias, até 30 produtos. Adicionais que só existem com ela (campo `requer`): +25 produtos R$ 300, meio de pagamento extra R$ 400, frete por transportadora R$ 500, ERP/nota fiscal R$ 1.500, marketplace R$ 1.200, migração R$ 1.500. A mensalidade da plataforma é do cliente.
- **Área restrita com login** (adicional de qualquer formato): R$ 4.500, 4 dias. Extras que só existem com ela: tela R$ 700, perfil R$ 1.200, cobrança de anuidade R$ 2.500, documentos por usuário R$ 900, importar usuários R$ 400. Item dependente só fica na fase 1 se a base também ficar.
- **Fora do automático** (sempre vão para conversa com o dono): loja feita do zero, em código próprio, e sistema sob medida.
- **Urgência:** multiplica o valor por 1,3 e o prazo por 0,6.
- **Complexidade alta:** multiplica o valor por 1,25.
- **Limite automático:** R$ 15.000 por fase e R$ 60.000 por projeto (fase 1 + fase seguinte). Acima disso, o caso vai para o diagnóstico. A fase seguinte tem valor e prazo estimados.
- **Sinal:** 50%.
- **Descontos:** nenhum autorizado. O agente não dá desconto.

## Exemplos calculados pelo motor (`npm run testar`, em precos.test.mjs)

| Caso | Valor | Sinal | Prazo |
|---|---|---|---|
| Landing page simples | R$ 1.500 | R$ 750 | 5 dias |
| Landing page com urgência | R$ 1.950 | R$ 975 | 3 dias |
| Institucional com 7 páginas, textos nas 7 e agendamento | Fase 1 de R$ 5.200 | R$ 2.600 | 10 dias |
| Institucional com 10 páginas, blog e catálogo | Fase 1 de R$ 4.900 | R$ 2.450 | 10 dias |
| Experiência digital de complexidade alta | R$ 11.130 | R$ 5.565 | 10 dias |
| Qualquer formato com loja virtual | sem preço automático | — | vai para o diagnóstico |

No institucional com 7 páginas, a fase 1 traz as 2 páginas extras e os textos de 4 páginas. Ficam para a fase seguinte, com valor estimado de R$ 1.200, os textos de 3 páginas e o agendamento. No de 10 páginas, ficam para a fase seguinte, com R$ 2.750, uma página, o blog e o catálogo. É o efeito do teto de 10 dias: com base de 8 dias, o institucional tem 2 dias para adicionais. Se o dono quiser mais folga, é só baixar o prazo base ou o prazo dos adicionais.

## O que o dono decide

1. Os valores e prazos de cada linha.
2. Se o sinal fica em 50%.
3. O limite automático.
4. Se haverá algum desconto autorizado, por exemplo para pagamento à vista.

Depois disso, a versão é gravada como **ativa** e passa a valer.
