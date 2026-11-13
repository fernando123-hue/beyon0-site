# PR 1 do orçamento como conversa: o servidor do fluxo (plano)

> Spec: `docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md` (revisão 3, seções 2, 6 e 8). Ramo `zero-servidor`. Nível 3.
> Regra que segura a produção coerente: **o portão novo do preço só vale para a conversa que nasceu no fluxo novo**. O servidor marca a conversa (`fluxo: 'conversa'`, chave só do código, escondida do modelo) quando a 1ª mensagem chega com `respostas`. A página de hoje não manda `respostas`, então o Zero de hoje continua igual até o PR 2.

| # | Tarefa | Teste visto vermelho |
|---|---|---|
| 1 | `js/orcamento-rotulos.js` (ES5, cliente e servidor): os rótulos das listas fechadas, as sugestões do passo 4 por ramo (código → rótulo e campo da `situacao_atual`), o molde da fala do "Mudar" | `orcamento-conversa.test.mjs`: listas iguais às do contrato; toda sugestão de ramo existe; molde estável |
| 2 | `respostasParciais` (esquema fechado, sem padrão, sem `cidade`; "Outro" limpo, redigido e com `pareceInjecao`) | campo desconhecido recusado, ausente não vira padrão, erro sem eco do valor |
| 3 | Briefing: `presenca.site_atual`; `fluxo` escondido do modelo; `respostasParaBriefingParcial` (com a `situacao`) | o modelo nunca vê `fluxo`; parcial não grava padrão |
| 4 | `mensagem` com `respostas`: só em `ETAPAS_PACOTE` (409), fusão antes do turno, fala do "Mudar" conferida e teto de 4, rede da dor (`respostas.responde = 'dor'`) | 409 fora do preço aberto; fusão chega ao modelo; fala errada 400; 5º "Mudar" 429; dor gravada pelo código se o modelo não gravou |
| 5 | `turnoDoValor` (caso entendido ou pediu o preço duas vezes; só no fluxo novo): recusa do `estimar`, `pedePlanta`, `resolverDesenho`, `atualizar_briefing`, `proximoPasso` (1º turno de texto, dor antes do formato, ordem do turno do valor) e `caso_entendido` no `estado` | no fluxo novo: `estimar` recusado antes do caso; liberado depois e na 2ª pergunta de preço; planta pedida no turno do valor; fluxo antigo idêntico |
| 6 | `confirmar-pacote` aceita `situacao` (modo sem consultor) | `situacao_atual` gravada pelos rótulos |
| 7 | Prompt: o trecho "preço logo de cara" passa a seguir o `proximo_passo`; descrição da ferramenta da planta; `docs/zero/prompt-efetivo.txt` regravado | testes de prompt atualizados; diff para o dono |
| 8 | Simulado: no fluxo novo, lê a dor e segue planta → estimar | E2E local com o simulado |
| 9 | Alarme de 80% do custo do dia (`AVISOS.custo_dia`, com freio de 1 por hora) | aviso chamado uma vez acima de 80%, nunca abaixo |

Depois: suíte inteira, `code-reviewer` + `security-reviewer`, PR com as seções do processo, checks lidos um a um, `--match-head-commit`.
