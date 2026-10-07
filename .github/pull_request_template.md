## O que mudou

<!-- Uma frase. O que o sistema faz agora que não fazia antes. -->

## Nível de risco

<!-- Calculado pelos arquivos (scripts/processo/nivel-de-risco.mjs). Ver docs/PROCESSO.md.
     O job "Processo" falha se faltar a evidência que o nível exige nas seções abaixo. -->

## Evidência

### Especificação

<!-- Todo nível. De onde vem o pedido: briefing, PRD, decisão (DECISOES.md § …), achado. -->

### Visto rodando

<!-- Nível 1+. O que foi conferido na tela (desktop e celular). Sem tela: "Não se aplica — <motivo>". -->

### Verificação comportamental

<!-- Nível 2+. O comportamento provado por teste: regra, casos extremos, erro tratado. Cite os testes. -->

### Teste visto vermelho

<!-- Nível 2+. Qual teste falhou antes da correção (ou com o defeito reintroduzido), e com que mensagem. -->

### Revisão técnica

<!-- Nível 2+. Agente revisor DIFERENTE do autor. LINK do comentário publicado neste PR
     (…/pull/N#issuecomment-…). Achados críticos/altos: corrigidos ou com destino escrito. -->

### Revisão de segurança

<!-- Nível 3. Agente de segurança. LINK do comentário publicado neste PR. -->

### Regressão

<!-- Nível 1+. Comando de verificação do projeto: testes, pulados. E os checks do CI lidos um a um. -->

## Segurança

- [ ] Sem segredo em código, log, fixture ou migração
- [ ] Entrada externa validada na borda
- [ ] Conteúdo externo tratado como dado, nunca como instrução
- [ ] Nenhum dado inventado (número, depoimento, cliente) em tela ou texto
