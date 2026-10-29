# Tabela de regras comerciais — rascunho v1 (para o dono aprovar)

Arquivo com os valores: `docs/fase2/regras-rascunho-v1.json`. **Rascunho:** nenhum visitante vê esses preços até o dono aprovar e ativar uma versão.

## De onde vêm os valores

Pesquisa de mercado de 2026, sempre na **metade de cima** das faixas de freelancer e abaixo das agências grandes. O posicionamento é de acabamento premium, prazo curto e garantia de desempenho medido.

| Formato | Mercado (fonte) | Proposta | Prazo |
|---|---|---|---|
| Landing page | R$ 500 a R$ 2.500 com freelancer bom ([InfinitePay](https://www.infinitepay.io/blog/quanto-custa-criar-um-site), [Wix](https://pt.wix.com/blog/quanto-custa-uma-landing-page)) | Base R$ 1.800 (piso R$ 900; era R$ 1.500, revisto pelo dono em 2026-10-14) | 5 dias |
| Institucional | R$ 800 a R$ 2.000 simples; R$ 2.500 a R$ 8.000 em média ([Locaweb](https://www.locaweb.com.br/blog/temas/primeiros-passos/quanto-custa-um-site/)) | Base R$ 3.900 com 5 páginas (piso R$ 2.200; era R$ 3.200, depois R$ 3.500 em 2026-10-09; R$ 3.900 desde 2026-10-14) | 8 dias |
| Experiência digital (sob medida) | R$ 2.000 a R$ 50.000 com funcionalidades ([Locaweb](https://www.locaweb.com.br/blog/temas/primeiros-passos/quanto-custa-um-site/)) | Base R$ 8.900 com 4 páginas (piso R$ 4.500; era R$ 6.500, aprovado em 2026-10-09: agência cobra de R$ 10.000 a R$ 35.000) | 10 dias |

Em 2026-10-09 o dono aprovou também: textos de R$ 150 para R$ 250 por página ("escritos pela Beyon Zero") e integração de R$ 600 para R$ 900 (pesquisa em `03 Projetos/auditoria-2026-10-09/pesquisa-precos-loja-area-sistema.md`).

**Revisão de 2026-10-14** (dono; relatório `reports/Preço premium para pequenos negócios.md` e `01 Empresa/Decisões.md` do Vault): landing R$ 1.800 e institucional R$ 3.900, o preço regular, que vale do 11º cliente em diante (o preço de fundador, R$ 800 e R$ 1.900, fica só na página `/condicoes`, para quem recebe o link); loja e experiência paradas até 3 entregas de cada; textos de R$ 250 para R$ 350 por página; área restrita sai do automático ("a partir de R$ 4.500, com escopo escrito"), junto com os extras que dependiam dela.

**Revisão de 2026-10-28** (dono, `01 Empresa/Decisões.md`: "subir todos os preços com base em dados"; dados em `01 Empresa/Preços - proposta de aumento 2026-10-28.md`, no Vault): landing R$ 2.900 (piso R$ 1.500), institucional R$ 7.900 (piso R$ 4.500), experiência digital R$ 19.900 (piso R$ 9.900), loja em plataforma R$ 8.900 (piso R$ 6.500, proporcional, sem dado direto); adicionais sem mudança. Sem trava de valor ("o objetivo é ser tudo 100% automático": limites no máximo do validador, R$ 10 milhões) e sem trava de prazo ("se o trabalho não couber em 10 dias úteis, crie uma métrica para analisar e aumentar a quantidade de dias desde já"): `prazo_max_dias` 60, o máximo do validador e do banco, e o projeto sai numa entrega só, com o prazo que a soma do trabalho pedir. A métrica é `scripts/prazo-real.mjs` (prometido × real por formato, ver `02-OPERACAO.md`). Os valores e prazos das colunas acima são os de antes desta revisão; os atuais estão no JSON e nos exemplos abaixo.

Os adicionais seguem a mesma lógica: um valor por unidade, um prazo por unidade e uma prioridade. Cada adicional soma o seu prazo ao do formato. A prioridade define o que entra primeiro numa tabela com teto de prazo (a tabela ativa pode ter um; o rascunho de 2026-10-28 tem 60 dias, e só um pedido extremo de loja chega lá).

- **Loja em plataforma pronta** (Nuvemshop ou Shopify, tabela v2, 2026-10-09): base R$ 8.900 desde 2026-10-28 (piso R$ 6.500; era R$ 4.800), 8 dias, até 30 produtos. Adicionais que só existem com ela (campo `requer`): +25 produtos R$ 300, meio de pagamento extra R$ 400, frete por transportadora R$ 500, ERP/nota fiscal R$ 1.500, marketplace R$ 1.200, migração R$ 1.500. A mensalidade da plataforma é do cliente.
- **Área restrita com login**: fora do automático desde 2026-10-14; começa em R$ 4.500 e é orçada numa conversa, com o escopo escrito. Na tabela v2 era adicional de R$ 4.500, 4 dias, com extras dependentes (tela R$ 700, perfil R$ 1.200, cobrança de anuidade R$ 2.500, documentos R$ 900, importar usuários R$ 400); os testes do mecanismo de dependentes usam essa cópia (`docs/testes/_area-v2.mjs`). Item dependente só fica na fase 1 se a base também ficar.
- **Fora do automático** (sempre vão para conversa com o dono): área restrita, loja feita do zero, em código próprio, e sistema sob medida.
- **Urgência:** multiplica o valor por 1,3 e o prazo por 0,6.
- **Complexidade alta:** multiplica o valor por 1,25.
- **Limite automático:** sem limite desde 2026-10-28 (R$ 10 milhões, o máximo do validador; era R$ 15.000 por fase e R$ 60.000 por projeto). O motor continua sabendo mandar para o diagnóstico acima de um limite e dividir em fases acima de um teto de prazo; os testes desse mecanismo usam uma cópia com os limites antigos (`docs/testes/_motor-fases.mjs`).
- **Sinal (entrada):** 40%; o restante, 60%, com o site no ar. Decisão do dono de 20/10 (Decisões.md, "O site vende sozinho", 1 D - Sim). A tabela ATIVA de produção o dono aplica pelo caminho de sempre.
- **Descontos:** nenhum autorizado. O agente não dá desconto.

## Exemplos calculados pelo motor (`npm run testar`, em precos.test.mjs)

| Caso | Valor | Sinal | Prazo |
|---|---|---|---|
| Landing page simples | R$ 2.900 | R$ 1.160 | 5 dias |
| Landing page com urgência | R$ 3.770 | R$ 1.508 | 3 dias |
| Institucional com 7 páginas, textos nas 7 e agendamento | R$ 11.500 | R$ 4.600 | 12 dias |
| Institucional com 10 páginas, blog e catálogo | R$ 12.050 | R$ 4.820 | 16 dias |
| Experiência digital de complexidade alta | R$ 24.880 | R$ 9.952 | 10 dias |
| Qualquer formato com loja virtual | sem preço automático | — | vai para o diagnóstico |

Sem teto de prazo, os dois institucionais saem numa entrega só: 8 dias da base + 2 × 0,5 (páginas) + 7 × 0,25 (textos) + 1 (agendamento) = 11,75, arredondado para 12; 8 + 5 × 0,5 + 2 (blog) + 3 (catálogo) = 15,5, arredondado para 16. Com o teto antigo de 10 dias, os mesmos pedidos davam fase 1 de R$ 10.000 (fase seguinte de R$ 1.500) e fase 1 de R$ 9.300 (fase seguinte de R$ 2.750).

## O que o dono decide

1. Os valores e prazos de cada linha.
2. ~~Se o sinal fica em 50%.~~ Decidido em 20/10: 40%.
3. O limite automático.
4. Se haverá algum desconto autorizado, por exemplo para pagamento à vista.

Depois disso, a versão é gravada como **ativa** e passa a valer.
