# PR 2 do orçamento como conversa: a página (plano)

> Spec: `docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md` (seções 1, 2, 3, 4 e 8). Ramo `zero-pagina`, de `zero-servidor` (PR 1, #147). Nível 3 (`js/orcamento*`, `orcamento.html`).
> Celular 390 primeiro. Sem blur, sem tela de carregamento, movimento aprovado intacto, CSP sem inline, voz humana, ES5 no módulo novo.

## O desenho

- **`js/orcamento-toques.js` (novo, ES5).** É o motor dos passos fixos dentro da caixa da conversa (`#o-log`).
  - Mostra as falas fixas do Zero e as opções para tocar como itens da própria lista, só na tela: nada vai ao banco antes da 1ª mensagem.
  - Guarda as respostas até o turno entrar.
  - A cada toque, chama a conta silenciosa (`BZPerguntas.definir(respostas)`), para o radar se preencher.
  - No passo 4, abre a caixa de texto com as sugestões do ramo. Com consultor, o envio vai pelo `enviar()` de `js/orcamento.js`, levando as `respostas` e `responde: 'dor'`. Sem consultor, só sugestões e "Outro": depois vem o resumo fixo e o valor.
  - Usa os rótulos de `js/orcamento-rotulos.js`.
  - Público: `BZToques.iniciar(opcoes)`, `pendentes()`, `entregues()`, `reterValor(E)`, `liberarValor()`, `reabrir()`, `modoSemConsultor()`.
- **`js/orcamento-perguntas.js` vira os controles do pacote.**
  - Sai a tela `#o-perguntas` com "Ver o preço" e as 3 telas.
  - Ficam a conta (`calcular`), os extras, a urgência, os vizinhos, o formato sugerido e o "Quero os três modelos".
  - As respostas passam a vir de `BZPerguntas.definir(r)`.
  - Com IA e estimativa do Zero gravada, o "Quero" não chama `confirmar-pacote` (spec §2): rola até o formulário de hoje, até o PR 3.
- **Retenção do valor.**
  - `estadoDoEscopo(E, sim, at, { reterValor })` ganha o estado `entendendo`: os cantos aparecem e o miolo diz "Sai depois que eu entender o seu caso".
  - Em `js/orcamento.js`, o cartão `#o-est-cheio` não mostra o valor da simulação enquanto ele estiver retido.
  - Com IA, o valor mostrado é o da estimativa gravada, liberado:
    - depois da fala do turno do valor;
    - com a flag, depois de a planta consagrar;
    - sem a flag, 1,2 s depois da fala;
    - ao recarregar, na hora.
  - Sem IA, o valor é o da simulação, depois do resumo fixo.
- **`js/orcamento.js`.**
  - A conversa fica sempre à vista; sai o "Prefere conversar?".
  - O `enviar()` leva as respostas pendentes.
  - Erro com `recado` ou 429 ganha a saída "Seguir tocando nas opções" (modo sem consultor a partir dali).
  - Etapas: Conversa · Modelos · Ajustes · Resumo · Entrada.
- **Textos** (voz-humana e revisor):
  - em `orcamento.html`: o lead, as etapas, o cartão vazio, as metas e o `noscript`;
  - em `sites.html`: o JSON-LD e o FAQ, iguais entre si;
  - a abertura do Zero (`ABERTURA_PADRAO`, com `docs/zero/*.txt` e `zero.test.mjs`);
  - em `privacidade.html#orcamento`: a sessão no 1º toque, a IA para todos, o que o modelo recebe.
- **CSS.** As opções dentro da caixa (`orc-op` em `.orc-log`), no celular 390 e no 320, sem caixa mais larga que a tela.
- **Testes.**
  - Os que fixam o HTML (`planta-orcamento-leve`, `consultor`, `zero`, `faq-identico`, `recado-textos`, `csp`...) são atualizados.
  - Unidade do módulo novo (DOM falso, como os testes da planta).
  - O E2E `docs/e2e-orcamento.mjs` é reescrito no começo (toques na conversa) e roda nos dois modos: com consultor (IA simulada) e com `BZ_SEM_CONSULTOR=1`.
- **Verificação.** Página real local no celular 390 e no computador 1280: fotos e conferência de corte, saltos e blur (o gravador de 13/11). Depois `npm run verificar` e `npm run acessibilidade`.

## Ordem

1. Radar com retenção (unidade, visto vermelho).
2. Módulo dos toques e a sua unidade.
3. Perguntas → controles.
4. `orcamento.js` e o HTML.
5. CSS.
6. Textos, política, abertura e `sites.html`.
7. E2E.
8. Ver rodando.
9. Revisões de código, de segurança, de acessibilidade e de UI.
10. PR.
