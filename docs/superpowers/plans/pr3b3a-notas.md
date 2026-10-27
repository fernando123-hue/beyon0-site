# PR 3b-3a: notas de execução (textos da D4)

Base: `origin/main` = `36a790f` (o 3b-2 já mesclado). Plano: `2026-10-22-pr3b3-previa-no-ar.md` (Tasks 1, 12 e 17). Mesclar não é ir ao ar: nada aqui liga o `BZ_ENTREGA` nem promove a Vercel.

## Task 1: base e pré-requisitos

- `node_modules` por junção (PowerShell `New-Item -ItemType Junction`; o `mklink` do Git Bash falha). `pglite ok`.
- Os arquivos do 3b-2 existem; a captação (`../captacao/config/entrega.json`) já traz `condicoes_versao` `2026-10-22`, `restante_fora_do_ar_dias` 3 e `lembretes_restante` [2, 3].
- Linha de base: 775 testes na `origin/main` (a do plano). A rodada que fiz com a worktree já em edição acusou 2 falhas, que eram dos próprios testes de texto que a Task 12 muda: não vale como base.

## Task 12: as regras da D4 nos quatro lugares

### Decisões do dono de 22/10 que valem acima do plano

- Texto de `/condicoes` LITERAL da captação (`docs/parte6/condicoes-lancamento.md`): em **Pagamento**, depois do institucional: "Se o restante não for pago em 3 dias depois do meu aviso de que o site está no ar, ele sai do ar até o pagamento. Antes disso eu lembro duas vezes, no segundo e no terceiro dia."; em **Prazo**, no lugar da frase dos 30 dias: "Nada vai ao ar sem o seu material e a sua autorização: enquanto ele não chegar, eu aviso que estou aguardando e o projeto fica parado." Versão `2026-10-22`.
- Isso troca as frases do plano (que ainda falavam dos 30 dias e do "o site sai do ar"): os testes e os textos seguem a captação. Os 30 dias do material não aparecem mais em lugar nenhum (o teste confere).
- O cliente parado fica com a vaga e nada encerra o pedido (o teste barra "encerrar por falta de material"). O apagamento depois de 6 meses NÃO está neste PR (o teste barra qualquer promessa disso; vai para o PR da privacidade).

### Teste visto vermelho (`textos-d4`, `pagar-sem-medo`, `prazo-uteis-textos` antes de mexer no código)

12 falhas de 30 testes:

- "Quando fica pronto?": dias úteis, e a regra do material parado (22/10, sem prazo de 30 dias) no lugar da antiga (2.1372ms)
- /condicoes mostra a data de hoje em "Última atualização" e é a MESMA condicoes_versao da captação (quando a captação está ao lado) (4.2424ms)
- 22/10: /condicoes traz os trechos da captação LITERAIS, o do material em "Prazo" e o do restante em "Pagamento", depois do institucional (1.0076ms)
- 22/10: as promessas antigas saíram dos quatro lugares ("imagens do modelo", "10 dias" do restante, os 30 dias do material) e nenhum texto fala de encerrar por falta de material (1.3009ms)
- D4 (21/10): a regra do prazo é a mesma no contrato, no consultor, em /condicoes e em "Quando fica pronto?" (13.6173ms)
- D4, atraso da Beyon devolve a entrada inteira, mesmo depois dos 7 dias: aparece no contrato, no consultor, em /condicoes e na tela (0.3702ms)
- D4, material: nada vai ao ar sem material e autorização; a Beyon avisa que aguarda e o projeto fica parado (22/10): aparece no contrato, no consultor, em /condicoes e na tela (0.4839ms)
- D4, prazo parado enquanto se espera a lista de ajustes: aparece no contrato, no consultor, em /condicoes e na tela (4.8286ms)
- D4, restante: 3 dias depois do aviso de que o site está no ar ele sai do ar até o pagamento; dois lembretes antes (22/10): aparece no contrato, no consultor, em /condicoes e na tela (0.392ms)
- a pergunta do restante promete a tela do restante: nasce escondida e só aparece com a entrega ligada e a proposta (como as outras promessas) (1.8335ms)
- a tela diz "Quando pago o restante?" com a porcentagem da proposta (nunca escrita à mão) e a regra dos 3 dias; os rótulos "Na entrega" saíram (24.4491ms)
- o contrato diz que o restante é pago quando o site estiver no ar (não "na entrega") e os dias úteis continuam como a 3b-2 deixou (0.8959ms)

Mensagens-chave: `contrato (escopo.mjs): DIREÇÃO ESCOLHIDA: Clareza (Conversão)…` (as regras não estavam no escopo); `condições ainda promete as imagens do modelo`; `The input did not match /Quando pago o restante\?/`; `o-faq-restante nasce escondido`; `a captação (config/entrega.json) tem de trocar condicoes_versao para 2026-10-21` (a data da página era 21/10 e a captação já estava em 22/10).

### Verde

Os 12 arquivos de teste da tarefa: 170 testes, 170 passam (`textos-d4`, `pagar-sem-medo`, `consultor`, `agente`, `condicoes`, `prazo-uteis-textos`, `so-pix-textos`, `alteracoes`, `faq-identico`, `precos`, `fluxo-api`, `orcamento-entrega`). O teste da `condicoes_versao` passa de verdade (não ficou `todo`): a captação já está em `2026-10-22`.

### Desvios (o teste decide)

1. Sem o "30 dias" e sem "o site sai do ar" do plano: valem os trechos da captação, literais.
2. O contrato e a tela dizem também "Antes disso eu lembro duas vezes, no segundo e no terceiro dia" (o plano mandava o contrato calar sobre os lembretes). O dono pôs a frase em `/condicoes` e mandou os outros textos dizerem o mesmo; os lembretes são dele, à mão, e a frase não promete envio automático.
3. "Quando pago o restante?" promete "nesta mesma página", que só existe com a tela do restante (3b-3c). Por isso a pergunta e o atalho (`o-faq-restante`, `o-atalho-restante`) nascem escondidos e entram em `PROMESSAS`: só aparecem com a entrega ligada e com a porcentagem da proposta. Com a entrega desligada (o padrão do merge), a página não promete a tela do restante.
4. O rótulo `Na entrega` saiu também do resumo (`#o-est-resto`), não só do recibo; o teste confere a página inteira.
5. Os testes antigos que citavam a frase dos 30 dias (`pagar-sem-medo`, `prazo-uteis-textos`) foram atualizados para a frase nova; o cabeçalho de `prazo-uteis-textos` trocou "30 dias sem material, 10 dias sem o restante" por "3 dias sem o restante".

### O que o dono precisa fazer

- Nada novo para a `condicoes_versao`: a captação já está em `2026-10-22`, igual à página.
- Promover `/condicoes` na Vercel só depois de ler o texto novo (a revisão de voz está no relatório do PR).
