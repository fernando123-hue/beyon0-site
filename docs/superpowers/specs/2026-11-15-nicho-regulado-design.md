# Saúde e advocacia com cuidado, sem trava na venda (15/11)

## 1. O que o dono decidiu (01 Empresa/Decisões.md, 15/11)

- **Sem trava na venda.** Saúde e advocacia seguem o caminho normal: conversa, mapa, valor, três modelos, entrada pelo Pix. Sai a trava "saúde não fecha pelo site" do PR #165. A **detecção** do nicho fica.
- **O cuidado vem de três coisas:**
  - o Zero conhece as regras do conselho e as aplica na conversa;
  - os modelos gerados são **conferidos por regras determinísticas** antes de aparecer. É a proteção principal: um modelo fora da regra nunca aparece;
  - o modelo de IA mais forte (Opus) entra **só onde a medição mostrar que ele acerta claramente mais**.
- **Trava na publicação, não na venda.** O site só vai ao ar com o registro profissional conferido e o texto passando na checagem (§8).
- **Ciência do dono.** O pedido chega marcado no painel e com aviso por e-mail. É aviso, não aprovação.
- **A pesquisa jurídica de 15/11** liberou o caminho de quando o registro não bate (§8.2). O texto da cláusula das condições ainda espera o dono (§8.3).

## 2. Quais nichos

A detecção é a do PR #165 (`saudeDaSessao`), estendida para devolver **qual** nicho:

- **Fontes:** todas as da sessão (o segmento e a descrição do negócio, os serviços e as mensagens do visitante).
- **O ramo "Saúde" tocado** conta como saúde genérica, que leva as regras comuns de saúde.
- **Os nichos:**
  - saúde: odontologia, medicina, fisioterapia, psicologia, nutrição, biomedicina, fonoaudiologia, enfermagem, estética;
  - **advocacia**, que é regulada mas não é saúde.

Função nova: `nichoReguladoDaSessao({ briefing, mensagens })` devolve `{ chave, conselho, tipo: 'saude' | 'advocacia' }` ou `null`. Quando há mais de um nicho na sessão, prevalece o mais restritivo; na dúvida, saúde genérica.

## 3. As regras, por conselho (fonte oficial, lida em 15/11/2026)

| Conselho | Preço no site | Antes e depois / depoimento | Proibido também | Obrigatório | Fonte |
|---|---|---|---|---|---|
| **CFO** (odontologia) | proibido, inclusive forma de pagamento (CEO art. 44, I) | só com TCLE e caso próprio (Res. 196/2019, art. 2º) | sensacionalismo, promessa, mercantilização, "popular", sorteio ou brinde, vídeo do procedimento | nome, "cirurgião-dentista", CRO; o RT na clínica; especialidade só registrada | [CEO](https://website.cfo.org.br/wp-content/uploads/2018/03/codigo_etica.pdf), [Res. 271/2025](https://sistemas.cfo.org.br/visualizar/atos/RESOLU%C3%87%C3%83O/SEC/2025/271), [Res. 196/2019](https://website.cfo.org.br/wp-content/uploads/2019/01/Resolu%c3%a7%c3%a3o-CFO-196-2019.pdf) |
| **CFM** (medicina) | **permitido** o valor da consulta (Res. 2.336/2023, art. 9º, VI) | permitido com condições (art. 14, II); depoimento sóbrio | garantir resultado, "o único", "melhor médico", sensacionalismo, medo, "milagroso", grátis em consultório particular | nome, CRM, "MÉDICO"; especialidade só com RQE; na página principal | [Res. 2.336/2023](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2023/2336_2023.pdf) |
| **COFFITO** (fisioterapia) | valor fora do local de atendimento (Res. 424/2013, art. 40, I; ler como "sem preço no site" é interpretação) | só com autorização formal prévia (arts. 10, 15, 32) | "resultado infalível", captação indigna, título não reconhecido | nome, profissão, CREFITO (art. 48) | [Res. 424/2013](https://www.coffito.gov.br/nsite/?p=3187) |
| **CFP** (psicologia) | proibido como propaganda; também "preço social", "desconto", "pacote", "valor acessível", cupom, sorteio | não (permitido com consentimento escrito, mas não recomendado) | previsão taxativa de resultado, sensacionalismo, autopromoção | nome, "psicóloga"/"psicólogo", CRP | [CEP](https://site.cfp.org.br/wp-content/uploads/2012/07/codigo-de-etica-psicologia.pdf), [Nota Técnica 1/2022](https://site.cfp.org.br/wp-content/uploads/2022/06/SEI_CFP-0612475-Nota-Tecnica.pdf) |
| **CFN** (nutrição) | proibido até 22/01/2027; **permitido a partir de 23/01/2027** (Res. 856/2026, art. 68) | proibido, mesmo com autorização (599/2018, art. 58; 856/2026, art. 69) | garantir resultado, sensacionalismo, sorteio, promoção | nome, profissão, CRN; aviso "os resultados podem não ocorrer da mesma forma para todos" | [Res. 599/2018](https://cfn.org.br/wp-content/uploads/resolucoes/Res_599_2018.html), [Res. 856/2026](https://sisnormas.cfn.org.br/viewPage.html?id=856), [Res. 858/2026](https://sisnormas.cfn.org.br/viewPage.html?id=858) |
| **CFBM** (biomedicina, estética) | sem regra explícita: usa a comum de saúde | sem regra explícita: usa a comum | autopromoção, sensacionalismo (Res. 240/2014, art. 9º; **não confirmado** se é a mais recente) | nome, especialidade registrada, CRBM | [Res. 240/2014](https://cfbm.gov.br/wp-content/uploads/2016/06/Res-2014-240.pdf) |
| **OAB** (advocacia) | proibidos honorários, forma de pagamento, gratuidade e desconto (Prov. 205/2021, art. 3º, I) | depoimento: proibido por interpretação (não divulgar clientes nem resultados) | autoengrandecimento, comparação, brinde, incitar ação, citar decisões e resultados, promessa, lista de clientes, captação, mercantilização, símbolo da OAB | nome (ou da sociedade) e número da OAB (CED art. 44) | [Prov. 205/2021](https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021), [CED](https://www.oab.org.br/arquivos/resolucao-n-022015-ced-2030601765.pdf) |

- **Fonoaudiologia (CFFa):** não foi achada norma oficial clara; usa a regra comum de saúde.
- **Revisão em andamento:** a revisão do capítulo de publicidade do CFO (Decisão CFO 05/2025) está pendente de confirmação.
- **Escolha de projeto:** no modelo gerado, que é uma prévia e não tem paciente real, **antes e depois e depoimento nunca entram**, em nenhum nicho regulado. O que cabe com TCLE fica para o site de verdade, com o dono.

## 4. O Zero na conversa

- **O aviso do nicho ao modelo** (`avisoRegulado`) passa a trazer o resumo das regras do conselho daquele nicho (§3), com o que fica de fora e o que cabe. O texto atual de recusa vira cuidado:
  - explicar uma vez, como a gente, sem citar lei nem prever punição;
  - seguir com a venda.
- **O registro profissional:** o Zero pergunta **uma vez**, com naturalidade, o número do registro (CRO, CRM, CREFITO, CRP, CRN, CRBM ou OAB, com a UF) para pôr no site. Se a pessoa não souber ou não quiser, segue sem insistir.
  - O número vai para o briefing em `negocio.registro`, validado: sigla da lista, UF e de 1 a 8 dígitos.
  - Nunca vai para o mapa nem para a conversa de volta.
- **Voz humana em tudo, nunca o nome de ninguém da equipe.** A lista do que vale é a das falas fixas.

## 5. A geração dos três modelos

- **O prompt da geração** (`gerador.mjs`) ganha, para nicho regulado, um bloco com as regras do nicho:
  - o que não pode;
  - o que é obrigatório: a linha de identificação no rodapé com nome, profissão, sigla do conselho e o número do briefing, ou o marcador `[número do registro]` quando a pessoa não deu;
  - as seções que não entram: depoimentos, galeria de antes e depois, números de resultado.
- **A conferência** (§6) roda **antes de gravar** a direção:
  - passou, grava;
  - falhou, **refaz uma vez** mandando ao modelo a lista do que falhou (só o caminho e a regra, nunca o texto dele, como já se faz no mapa);
  - falhou de novo, a direção fica **"falhou"** e nunca aparece. O custo das duas chamadas entra no teto da conversa.

## 6. A conferência (o coração)

- **Módulo novo:** `api/_vendas/conferencia-regulada.mjs`, puro e determinístico. `conferirDirecao(direcao, nicho)` devolve `{ ok, falhas: [{ regra, caminho }] }`.
  - Ele percorre os textos da direção com a mesma função da varredura (`textosDe`).
  - Normaliza como as travas: minúsculas, sem acento, sem invisíveis.
- **Regras comuns de saúde**, sempre:
  - garantia ou promessa: "garantido", "resultado garantido", "100%", "infalível", "sem dor", "milagroso", "revolucionário";
  - superlativos: "o melhor", "a melhor", "o único", "número 1", "melhor ... da cidade", "referência em";
  - gratuidade, sorteio, brinde, cupom;
  - urgência e medo: "últimas vagas", "último dia", "só hoje", "corra";
  - seção do tipo `depoimentos`, texto "antes e depois", "depoimento";
  - a linha de identificação ausente: rodapé ou contato sem a sigla do conselho.
- **Regras de cada conselho:**
  - preço, "R$", valor e forma de pagamento: falha em CFO, COFFITO, CFP, CFN (até 22/01/2027), CFBM, OAB e saúde genérica; **passa em CFM**;
  - "desconto" e "promoção": falha em CFP, CFN e OAB;
  - "popular": falha no CFO;
  - "preço social", "valor acessível", "pacote": falha no CFP;
  - CFN: o aviso "os resultados podem não ocorrer da mesma forma para todos", se houver texto de orientação.
- **Advocacia:**
  - honorários, "R$", "parcelamos", "consulta gratuita", "desconto";
  - resultado: "ganhamos", "causa ganha", "vitória", "sentença favorável", "garantimos";
  - autoengrandecimento: "o melhor", "mais experiente", "líder", "referência";
  - clientes: "nossos clientes", seção de depoimentos;
  - incitação: "entre com sua ação", "não perca seu direito", "último dia";
  - a linha "OAB/UF nº" ausente.
- **Na dúvida, falha:** um falso positivo custa refazer; um falso negativo põe a Beyon em risco com o conselho. Cada regra tem um caso que passa e um que falha nos testes, com os textos honestos que não podem cair (ex.: "Atendemos convênios", "Como agendar").
- **A mesma conferência roda também:**
  - na entrega manual de direção pelo dono (`api/painel.mjs`);
  - na publicação (§8).

## 7. Qual modelo, medido (dono: "Opus não em tudo; medir antes")

**A verba:** o dono aprovou em 15/11 subir o teto do teste com IA real de US$ 3 para **US$ 10** no total ("para testes completos e diminuirmos a nossa taxa de erro ao máximo"). Já tinham sido gastos US$ 1,70, então sobram ~US$ 8,30. O teto local (`BZ_IA_TETO_USD`, livro `~/.beyon-gasto-ia.json`) passa a 10. O gasto vai no relatório **por etapa**.

**A medição completa:**
- 2 casos de saúde (odontologia e fisioterapia) e 1 de advocacia;
- em cada um, **Sonnet 5.5 × Opus 5.5**, com a mesma conferência e o refazer reais;
- nos dois pontos:
  - **conversa:** respeita as regras na fala, pede o registro uma vez, custo e tempo por turno;
  - **geração dos 3 modelos:** a taxa de passar na conferência na 1ª tentativa, depois do refazer e o que falhou de vez, o custo e o tempo.
- O objetivo é a **taxa de erro mínima**: nenhum modelo fora da regra aparece, e o menor número possível de "falhou".

**A decisão:**
- o Opus fica onde errar claramente menos;
- onde empatar, o Sonnet, que custa a metade;
- o palpite é Opus na geração (que já é Opus hoje) e Sonnet na conversa.

O papel novo `conversa_regulada` (em `api/_ia/config.mjs`) existe só se a medição mandar. Os tetos de custo existentes (`TETOS`) valem e são revistos com o custo medido.

## 8. A conferência do registro e a publicação (pesquisa jurídica de 15/11: `01 Empresa/Pesquisas/reports/Riscos legais saúde e advocacia.md`)

### 8.1 Conferir o registro: logo depois do Pix, antes de produzir

- **Quando:** logo **depois da entrada paga e antes de produzir**. Isso resolve o arrependimento de 7 dias, a retenção e a prova de boa-fé.
- **Onde:** o painel do dono ganha a tarefa **"Conferir registro"**, com:
  - os dados: nome, conselho, UF ou seccional e número;
  - o **link pronto da consulta pública** do conselho certo (o CNA da OAB, a busca de médicos do CFM, os sites dos CROs e CREFITOs; os endereços são conferidos no PR deste passo).
- **O que se confere é a SITUAÇÃO do registro, não só o número.** Atuar com registro suspenso ou cancelado também é crime (Lei 15.425/2026).
- **A prova da consulta fica guardada na tarefa:** a data, a fonte (o link), o resultado (ativo, suspenso, cancelado ou não encontrado) e, se houver, o print. É a prova de boa-fé.
- **Dados:** só nome, número, UF ou seccional e conselho. **Nunca CPF nem data de nascimento** (LGPD, necessidade).
- **Fica fora:**
  - robô, captcha ou raspagem de site de conselho;
  - APIs de terceiros para a OAB (Provimento 95/2000);
  - o webservice do CFM, que só aceita CNPJ.
  - A consulta é manual: um clique e uns 30 s.
- **A OAB proíbe repassar o cadastro:** só consultar, sem guardar além do necessário.

### 8.2 Quando o registro não bate (liberado pela pesquisa jurídica)

- **Não bate, ou não foi achado:** aviso ao cliente com **prazo para corrigir**. A produção espera.
  - Corrigiu e confere: segue.
- **Confirmado falso, suspenso ou cancelado:** não produz, não publica e cancela a venda.
- **O valor:**
  - se ainda nada foi produzido (o caso comum, porque a conferência vem antes da produção e dentro dos 7 dias), **devolve a entrada inteira**;
  - se já houve trabalho, retém só o valor do trabalho feito, **documentado por etapa**;
  - **nunca** multa somada à entrada.
- **Também na publicação:** o texto final do site passa pela conferência (§6) antes de ir ao ar.

### 8.3 A cláusula nas condições de venda: o TEXTO aguarda o dono

- **O que diz:** o cliente declara que os dados do registro são verdadeiros e estão em dia, e responde pelo conteúdo. A lista de cláusulas está no relatório da pesquisa.
- **Onde aparece:** num **resumo em destaque antes do Pix** (Decreto 7.962/2013, art. 4º).
- **O que espera:** o texto é do dono. O lugar no resumo pode ser preparado; o texto, não.

### 8.4 Outras regras da pesquisa jurídica

- **Advocacia:** o chatbot no site do advogado serve só para "primeiras dúvidas", sem consulta jurídica (Provimento 205/2021). Vale para o atendente vendido ao cliente advogado, fora deste trabalho.
- **Saúde:**
  - nada de imagem gerada por IA como "resultado";
  - nunca "cura garantida" nem "infalível", mesmo com registro válido (charlatanismo, art. 283 do Código Penal). A conferência (§6) já recusa; "cura garantida" entra na lista de promessas.

## 9. A ciência do dono

- **No painel**, o pedido traz o selo **"Saúde"** ou **"Advocacia"**, com a sigla do conselho e o registro, se houver, e o resultado da conferência dos modelos.
  - Substitui o "Saúde: com o dono" do #165.
- **Por e-mail** (o canal de `api/_aviso.mjs`), um aviso novo com texto fixo, sem dado do cliente: "Pedido novo de saúde ou advocacia na fila. Detalhes no painel." É ciência, não aprovação: nada espera o dono.

## 10. Os PRs, nesta ordem

1. **O cuidado na geração:**
   - a conferência (§6), com os testes de cada regra;
   - o bloco de regras no prompt da geração e o refazer uma vez (§5);
   - `negocio.registro` no briefing, e o Zero pedindo o registro com as regras no aviso (§4).
2. **A medição Sonnet × Opus** (§7) e o papel que ela decidir.
3. **Sem trava e com ciência:**
   - tira "saúde não fecha" (fluxo, estado, textos da página e o teste), mantendo a detecção;
   - o selo e o aviso (§9).

   Entra depois do 1, para a saúde nunca vender sem a conferência.
4. **A conferência do registro depois do Pix:** a tarefa "Conferir registro", com a prova da consulta (§8.1), e o que acontece quando não bate (§8.2). O texto da cláusula (§8.3) entra quando o dono aprovar.

## 11. Testes e evidência (nível 3)

- **A conferência:** cada regra com um caso que passa e um que falha, por conselho.
  - **A trava de data do CFN** (preço proibido até 22/01/2027) com relógio injetado.
  - **Mutação:** sabotar cada grupo de regras tem de ficar vermelho.
- **A geração:**
  - um modelo regulado com falha é refeito uma vez;
  - com falha de novo vira "falhou", e o custo das duas tentativas entra;
  - o nicho comum não muda.
- **A conversa:** o aviso de cada nicho traz as regras; o Zero pede o registro; `negocio.registro` é validado.
- **Sem trava:** saúde e advocacia chegam ao Pix; o selo e o aviso aparecem; o nicho comum continua igual.
- **IA real:** o teste pequeno do §7, com custo e taxa de acerto no relatório.
