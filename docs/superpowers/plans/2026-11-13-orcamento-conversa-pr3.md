# PR 3 do orçamento como conversa: o pedido dentro da conversa (plano)

> Spec: `docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md`, seção 5 (o pedido e o cartão de aceite) e Anexo B (N5, N6).
> Ramo `zero-pedido`, de `zero-pagina` (o PR 2, #148). Nível 3: migration, `api/` e `js/orcamento*`.
> **Pré-condição de promoção:** a migration é aplicada pelo dono no banco de teste e no real, a pedido da sessão principal.

## O desenho

- **O texto do aceite tem versão.** Ele mora no módulo comum `js/orcamento-rotulos.js` (`ACEITE.versao`, `ACEITE.texto`), lido pela tela e pelo servidor.
  - A tela envia a versão que mostrou (`aceite_versao`).
  - O servidor (`api/_vendas/aceite.mjs`) aceita só a vigente. Uma versão antiga ou desconhecida leva a 409 "recarregue".
  - O servidor calcula o hash do texto e o grava junto do aceite.
- **Migration `20261113120000_aceite_versao.sql`:**
  - `app.conversas` ganha `contato_aceite_versao` e `contato_aceite_hash`, com checagem de formato. Não são dado pessoal: provam qual texto foi aceito, e a retenção não precisa apagá-los.
  - Nova função `app.vendas_registrar_detalhes_com_aceite(p)`: chama a `vendas_registrar_detalhes` de hoje e grava a versão e o hash **na mesma transação**. Só o backend a executa.
- **`detalhes` (api/_vendas/fluxo-pedido.mjs):** exige a versão vigente e chama a função nova. O resto não muda: validação, freios, redação e triagem.
- **A tela:** `js/orcamento-pedido.js` (novo, ES5) leva os passos 8a a 8e para dentro da conversa. Usa o kit da conversa que o `js/orcamento-toques.js` exporta (fala, bolha, opções, foco e anúncio).
  - **8a, 8b e 8c:** campo dentro da conversa, como o "Outro", com "Seguir".
    - 8a: o nome do negócio (2 a 60);
    - 8b: o que vende (3 a 200), com as sugestões do ramo;
    - 8c: o WhatsApp, com `type="tel"`, `inputmode="tel"` e `autocomplete="tel"`.
  - **8d (opcional), em toques:**
    - "Como quer ser chamado", "Um site que eu admiro", "Para quem eu vendo" e "O que me diferencia";
    - "As redes do negócio", que abre as 5 redes e a autorização própria, nunca marcada;
    - "Não, pode seguir".
  - **8e, o cartão de aceite:**
    - o resumo do que ela passou, com "Corrigir" em cada item;
    - o texto da versão vigente e o link `/privacidade#orcamento` em nova aba (`rel="noopener"`);
    - o botão "Concordo e quero os modelos", um `<button>` real.
  - **O envio:** `API.detalhes` uma vez, com a versão. O erro do servidor vira fala do Zero no passo do campo, com a frase de hoje.
  - **Nada guardado:** nenhum dado do pedido vai ao `localStorage` nem ao `sessionStorage`. Recarregar recomeça o 8a.
- **Quando o pedido começa:** no "Quero os três modelos" (com e sem consultor) e no `pedir_contato`.
  - O `#o-contato` antigo deixa de abrir sozinho com a estimativa. Fica só o aviso de fila cheia.
  - Os textos do prompt que falam do formulário mudam: `consultor.mjs` "já aparece na tela abaixo do cartão", "indique o formulário", "pedir_contato leva a pessoa até ele".
- **Testes:**
  - API: o telefone nunca em `ia.mensagem`, logs, `vendas_registrar_evento`, `estado`, `vendas_conversa_dono` nem painel;
  - versão vigente aceita, antiga recusada (409), hash gravado;
  - banco (PGlite): a função nova, os checks e o EXECUTE só do backend;
  - unidade do `js/orcamento-pedido.js` (DOM de mentira, como `orcamento-toques.test.mjs`);
  - E2E: os detalhes pela conversa, nos dois modos.

## Ordem

1. Migration, aceite e servidor (teste vermelho).
2. Módulo da tela e unidade.
3. Integração em `orcamento.js` e `orcamento-detalhes.js`.
4. Prompt.
5. E2E.
6. Ver rodando.
7. Revisões de código, segurança e acessibilidade.
8. PR.
