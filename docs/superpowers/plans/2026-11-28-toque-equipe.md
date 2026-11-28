# Toque da equipe: "Quantas pessoas trabalham aí?" (Mapa vivo v2, seção 5, item 3)

Decisão do dono (27/11, cofre `01 Empresa/Decisões.md`): toque opcional com 4 botões (Só eu / 2 a 5 / 6 a 15 / 16 ou mais),
dá para pular; a resposta põe as pessoas na cena da miniatura e vai para o pedido. O atendente de IA continua na oferta para
QUALQUER tamanho de equipe (a faixa nunca tira nada da oferta nem mexe no preço).

## Decisões de desenho (agente, com o porquê)

1. **Onde:** um passo novo na sequência fixa, logo depois dos objetivos e antes do "Já tem site?". Na sequência fixa ninguém
   escreveu ainda, então a pergunta aparece para todos que estão tocando; quem pula ("Prefiro não dizer") segue normal.
2. **Códigos fechados:** `so_eu`, `ate_5`, `ate_15`, `mais_15` (rótulos em `js/orcamento-rotulos.js`, `EQUIPE`).
3. **Servidor:** `api/_vendas/respostas.mjs` aceita `equipe` só da lista; `respostasParaBriefingParcial` grava
   `negocio.equipe` com o código (o briefing do modelo ganha o campo, enum, para o consultor ler e para o painel do dono).
   NÃO entra no preço, NÃO entra no "Mudar as respostas" (é descrição, não muda o caso; quem quiser corrigir escreve) e
   NÃO conta na `MUDAR_MAX`.
4. **Cena:** o que ela ESCREVE vence (a regra do PR 1: equipe só quando ela diz, vale a maior dita). Sem número no texto, a
   faixa tocada dá um número representativo para o desenho: `so_eu` 1, `ate_5` 3, `ate_15` 5, `mais_15` 6 (o teto da forma).
   É desenho, não dado: nunca vira texto na tela.
5. **E2E:** `docs/e2e-toques.mjs` (`responderAteADor`) toca a faixa nova; os E2E que contam passos são ajustados.

## Passos (TDD, teste visto vermelho antes de cada código)

1. `js/orcamento-rotulos.js`: `EQUIPE` + teste.
2. `js/orcamento-toques.js`: `passoEquipe` entre objetivos e site, fala nova, "Prefiro não dizer"; `pendentes()` leva `equipe`.
   Testes em `docs/testes/orcamento-toques.test.mjs`.
3. `api/_vendas/respostas.mjs` + `api/_vendas/catalogo.mjs` + `api/_vendas/briefing.mjs` (enum `negocio.equipe`): testes.
4. `js/cena-dicionario.js` (`cenaDoCaso` aceita `equipe`) + `js/orcamento-cena-tela.js` (passa `r.equipe`): testes.
5. E2E helpers; suíte inteira; olhar em 390/320 (a pergunta nova e a cena com a faixa); revisão técnica + segurança; PR nível 3.
