# PR 3b — o site vende sozinho (desenho, 2026-10-21, revisão 2)

Desenho do PR 3b da sequência de `2026-10-11-orcamento-sem-ia.md` (§5 "Pagar sem medo" e "Entrega", item 3), refeito
pelas decisões do dono de 20 e 21/10 em `../../../../01 Empresa/Decisões.md`. **As seis decisões que faltavam (D1 a
D6, §11) foram respondidas pelo dono em 21/10** (linhas "3b D1" a "3b D6" de `Decisões.md`; o resumo para o dono,
`.superpowers/sdd/pr3b-resumo-dono.md`, leva a marca de respondido). O que ainda é do dono e não veio: os dados que
faltam (§11, no fim). Onde falta dado do dono, o texto fica `[…]` e não é publicado (spec de 11/10, §10).

**Revisão 2 (mesmo dia).** Duas revisões independentes, ambas "aprovar com correções": a do site
(`.superpowers/sdd/pr3b-desenho-revisao.md`) e a da captação (`captacao/docs/parte6/revisao-pr3b.md`, `e69ac14`). O
que mudou por causa delas está marcado com **(R2)**, e a tabela "achado → onde foi tratado" fecha o documento (§15).

## Por quê

O PR 3b era o "pagar sem medo" (perguntas antes de pagar, WhatsApp à mão, Pix copia e cola primeiro, passos depois
da entrada). Em 20/10 o dono mudou o rumo do que vem depois do pagamento:

> "O ideal é que ele passe o material dentro do próprio site, e o site já entregar aqui pro claude e terminamos por
> aqui. O ideal é o site vender sozinho e eu não ter interação com o cliente. Apenas na entrega por enquanto."

Hoje a história acaba no recibo da entrada (`#o-pronto` em `orcamento.html`): o "material" está previsto como
"Mandar pelo WhatsApp" (spec de 11/10, §3, "Espera útil"), não existe tela para o restante e nada leva o pedido
pago até a produção. Este PR fecha o caminho: entrada → material → prévia → no ar → restante, tudo na página.

## Decisões do dono que mandam

| # | Decisão (data, linha de `Decisões.md`) | O que muda aqui |
|---|---|---|
| 1 | O site vende sozinho; o dono só entra na ENTREGA (20/10, :25) | material, prévia, ajustes e restante acontecem na página. **(R2)** Continuam os dois toques do dono que já existem ou dependem da D1: marcar a confirmação do pedido pelo WhatsApp (como hoje, spec de 11/10 §3) e mandar os avisos prontos nos 2 momentos da D1 (prévia pronta, site no ar; resposta de 21/10) |
| 2 | Material (textos, fotos, logo) enviado DENTRO do site, e o site entrega direto para a produção pelo Claude (20/10, :25) | formulário de material com envio de arquivos; pacote no formato da captação (§6) |
| 3 | Passo 4: site no ar → cliente paga o restante, 60% (20/10, :25, "1 D - Sim") | entrada de 40%; tela do restante (§5). **(R2)** O 40/60 foi estendido ao orçamento em 20/10; as outras regras do lançamento valem também desde 21/10 (D4, linha 10 desta tabela) |
| 4 | Lançar SÓ com Pix, sem cartão (21/10, :14) | o cartão sai pela tarefa A7 do plano da Cloudflare (`MP_METODOS`), §4 |
| 5 | Nome no Pix: "Fernando Ferreira Dos Santos"; outros bancos podem abreviar (21/10, :22) | frase fixa antes do código Pix (§4) |
| 6 | Cloudflare Workers no plano GRÁTIS, 10 ms de CPU por pedido (21/10, :14) | rotas leves; arquivo nunca passa pelo Worker (§7, §9) |
| 7 | Formulário de material pedido pela captação, parte 6 (`captacao/docs/parte6/para-o-site.md` §3) | mesmos campos, limites e formato de troca versão 1, mais o `pedido.json` que a captação pediu (§6) |
| 8 | ~~Ajustes "sem limite, dentro do que foi combinado no resumo" (11/10, :112 e :115)~~ **revista em 21/10 (D2): 2 listas de ajuste** | `rodadas_max` = 2 (o número da captação); o que passar das 2 listas é orçado à parte. Página ou item novo continua orçado à parte (11/10) |
| 9 | Celular primeiro, sem blur, sem dado inventado (regras do projeto) | telas desenhadas em 390 px (§3); preço, prazo e textos de dono em `[…]` |
| 10 | **D4 (21/10, "Sim, as mesmas")**: as regras do lançamento valem também para o orçamento, e aparecem na tela | prazo contado da entrada paga e do envio do material, parado enquanto se espera a lista de ajustes; 30 dias sem material, o site sai com as imagens do modelo; 10 dias sem o restante, o site sai do ar; atraso da Beyon devolve a entrada. A frase de prazo do contrato (`escopo.mjs:77`) e a do consultor (`consultor.mjs:92,96`) ficam |
| 11 | **D6 (21/10)**: o orçamento segue a tabela normal e não conta as 10 vagas do lançamento | a captação passa a aceitar os valores da proposta (§6, §13) |
| 12 | **D1, D5, D3 (21/10)** | tela + o dono avisa nos 2 momentos; prévia sem resposta nunca é aprovada sozinha, o projeto para; sem botão fixo de WhatsApp (§11) |

**O que o dono decidiu em 21/10 sobre as regras do lançamento (D4).** As regras de `/condicoes` (prazo contado da
entrada e do material; "se o material não chegar em 30 dias, o site sai com as imagens do modelo"; restante não pago
em 10 dias → o site sai do ar; "se eu não entregar no prazo combinado, devolvo a entrada inteira"; 2 listas de
ajuste) eram da **oferta de lançamento** (`condicoes.html`; Decisões.md :49, :55, :91). Em 21/10 ele respondeu que
**valem as mesmas para o orçamento e que elas aparecem na tela** (D4, §11; ajustes: D2, 2 listas). O desenho deixa de
guardar o lugar delas desligado: estados, alertas e frases entram com a parte que as cumpre (§13), e a data da tela é
o compromisso "pronto até" (§2.1).

Fatos técnicos que valem nos dois casos: desistência em 7 dias devolve a entrada inteira (CDC art. 49, é lei); a
produção regrava toda imagem como WebP sem metadados (`captacao/entrega/imagens.mjs`).

**Números deste desenho que são escolha do agente, não do dono** (podem mudar no plano; os que vão para a privacidade
o dono aprova com ela): 10 MB por foto, 5 MB a logo, 20 fotos, 30 reservas e 150 MB por pedido, teto de 800 MB e
alarme em 70% no armazém, freios por hora, 24 h para reserva não conferida, 7 dias de guarda depois da importação, 30
dias para pedido nunca importado, 1.500 caracteres na lista de ajustes.

## 1. O caminho do cliente depois do resumo

```
 resumo confirmado
      │
      ▼
 PASSO 1  Entrada (40%) por Pix ──► recibo + "Guarde o link do seu pedido" + "Seus próximos passos"
      │
      ▼
 PASSO 2  Material na página (logo, fotos, contatos, serviços…) ─► "Enviar" ─► data prevista
      │                                                   └──► pacote para a produção pelo Claude (§6)
      ▼
 PASSO 3  Prévia pronta ─► "Aprovar" ou "Mandar a lista de ajustes" ─► nova prévia
      │
      ▼  (o dono entra aqui: publica)
 PASSO 4  Site no ar ─► Pix do restante (60%) ─► recibo final ─► pedido concluído
```

- **Uma página só.** Tudo continua em `/orcamento`, na mesma sessão anônima do visitante: o bloco `#o-pronto` vira
  "Seu pedido" (o acompanhamento dos 4 passos) e o passo da vez abre embaixo.
- **(R2) Não perder o pedido.** A sessão vive no `localStorage` (`js/orcamento-api.js`), e o Safari do iPhone apaga
  esse armazenamento depois de 7 dias de uso do navegador sem visita ao site (webkit.org/blog/10218). Entre a entrada
  e a prévia passam dias sem motivo para abrir a página. Por isso, três caminhos de volta:
  1. **"Guarde o link do seu pedido"**, logo depois da entrada paga, com o porquê em palavra simples ("Se o celular
     apagar os dados do site, é por este link que você volta ao pedido. Mande para você mesmo no WhatsApp ou salve
     nos favoritos."). É um **link do pedido**: vale até o pedido terminar (mais 30 dias), o código vai no `#`, o
     banco guarda só o hash. **(R2, rodada 2) O link é fixo durante o pedido: usar não o troca** (se trocasse, o link
     salvo no WhatsApp morreria no primeiro uso, e o código novo ficaria só no armazenamento que o iPhone apaga). Ele
     só muda em dois casos: o cliente toca "Gerar um link novo" (o anterior para de valer e a página pede para
     guardar o novo) ou "Sair deste aparelho" (invalida o link e a sessão). Abrir pelo link leva o pedido para o
     aparelho que abriu; o anterior perde o acesso, como na retomada. Revisão de segurança própria no 3b-2.
     "Mandar para mim" usa o compartilhamento do próprio aparelho (`navigator.share`) ou "Copiar"; **nunca** um
     `wa.me/?text=` ou outro `href` com o código (ele iria na query de um endereço de terceiro e nos registros dele).
  2. **"Continuar no computador"**, a pedido do cliente: o link de retomada do PR 2b-2 (uso único, 7 dias).
  3. **Todo aviso da D1 (os 2 momentos, resposta de 21/10) leva um link de retomada novo** (o do PR 2b-2: uso único, 7 dias), gerado pelo painel (que
     já gera: `api/painel.mjs`; hoje recusa depois do resumo). Não é o link do pedido: se a mensagem vazar, vale pouco
     e uma vez, e o link fixo que o cliente guardou continua valendo. O painel mostra a mensagem com "Copiar" e abre a
     conversa só com o número (`wa.me/<número>`, sem `?text=`); o dono cola. A retomada passa a valer em
     `em_producao` (`privado.etapa_retomavel`).
- **O dono.** Fica fora dos passos 1 a 3, menos os dois toques do item 1 da tabela acima. No passo 4 ele publica (a
  "entrega" da decisão de 20/10) e registra o endereço do site. **(R2)** Até a captação ganhar a rotina automática
  (§6), o dono também roda à mão, por pedido, os comandos que levam o material à produção e marcam a prévia.
- **Desistência e problemas de pagamento** continuam pelo WhatsApp, porque a lei pede um canal (CDC art. 49). Com a
  D3 (a), é o único motivo para o cliente escrever antes da entrega.

## 2. Os estados da entrega (banco)

A conversa já termina em `aguardando_pagamento → em_producao` (`pagamentos_aplicar`, sinal pago). Depois disso ela
não tem mais etapas; o que acontece até o restante vira uma **entrega**, com transições conferidas no banco como as
da conversa (`privado.transicoes_conversa`, `20261008120100`).

**`app.entregas`** (uma por proposta paga; criada por `pagamentos_aplicar` no mesmo passo que cria o projeto):
`id`, `org_id`, `conversa_id` (único), `proposta_id` (único), `projeto_id`, `passo`, `prazo_dias` (copiado da
proposta), `prazo` (jsonb: as datas que contam, §2.1), `entrega_ate` (data prevista, calculada no servidor),
`rodadas_usadas`, `rodadas_max` (**2**, decisão D2 de 21/10: 2 listas; é o mesmo número da captação, `max_rodadas` em
`captacao/config/entrega.json`; nulo = sem limite fica só como valor que o banco aceita, sem uso no orçamento),
`previa_url`, `previa_em`, `site_url`, `no_ar_em`,
`created_at`, `updated_at`.

| De → para | Quem | Quando |
|---|---|---|
| (nada) → `material` | `pagamentos_aplicar` (sinal pago) | a entrada caiu |
| `material` → `producao` | `vendas_material_enviar` | o cliente enviou o material (mínimo: WhatsApp dos botões + caixa de autorização) |
| `material` → `producao` | painel, `material_dispensar` | **D4 (21/10)**: 30 dias sem material, sai com as imagens do modelo; exige o número dos botões já salvo no rascunho (bate com a captação) |
| `producao` → `previa`, `ajustes` → `previa` | painel, `previa` (com o endereço) | a produção publicou uma versão de prévia |
| `previa` → `ajustes` | `vendas_previa_ajustes` | o cliente mandou a lista (conta 1 rodada; recusa a 3ª lista: acima de `rodadas_max` = 2, D2) |
| `previa` → `aprovada` | `vendas_previa_aprovar` | o cliente aprovou |
| `previa` → `aprovada` | **ninguém além do cliente** | **D5 (21/10): não existe aprovação automática.** Sem resposta, o projeto PARA na prévia até o cliente responder; nenhuma rotina, prazo ou `previa_sem_resposta` aprova por ele |
| `aprovada` → `no_ar` | painel, `no_ar` (com o endereço e o código sorteado) | **o dono publicou**: abre o Pix do restante |
| `no_ar` → `suspensa` | painel, `suspender` | **D4 (21/10)**: 10 dias sem o restante; o site sai do ar (o dono tira, pela captação) |
| `no_ar` ou `suspensa` → `concluida` | `pagamentos_aplicar` (saldo pago) | o restante caiu; conversa `em_producao → encerrada`; projeto `entregue` |
| qualquer um, menos `concluida` → `encerrada` | painel, `encerrar` (motivo de lista fechada) | desistência, atraso da Beyon com a devolução da entrada (D4), ou outro fim que o dono decidir à mão; **nunca por silêncio do cliente na prévia (D5)** |

- **D4 e D5 (21/10): sem ajuste que desliga regra** (o `BZ_REGRAS_ENTREGA` do desenho anterior sai). As ações da D4
  (`material_dispensar`, `suspender`, a devolução no atraso) são do painel, com alerta da rotina diária quando o prazo
  vence; **nenhuma transição automática de `previa`** (D5). O teste confere que, em `previa`, o passo só sai por ação
  do cliente (`vendas_previa_ajustes`, `vendas_previa_aprovar`) ou pelo `encerrar` do painel, por mais dias que passem.
- Ordem de travas, a mesma do PR 3a, estendida: direções por id → conversa → **entrega** → material e arquivos.
- Códigos de erro, os mesmos: P0002, 55000 (passo), 22023 (dado), 23514 (limite), 40001 (corrida: `passo_base` ou
  `rodada_base` que não bate com o que está gravado), 42501.
- Eventos novos no funil: `material_salvo` (só a 1ª vez), `material_arquivo`, `material_recusado`,
  `material_enviado`, `material_importado`, `material_limpo`, `previa_pronta`, `previa_ajustes`, `previa_aprovada`,
  `site_no_ar`, `restante_iniciado`, `restante_pago`, `entrega_suspensa`, `entrega_encerrada`, `prazo_vencido`
  (sem `previa_sem_resposta`: D5).
  Nenhum leva texto do cliente.

**`app.materiais`** (um por entrega): `dados` (jsonb, a lista fechada da captação, §6), `autorizacao` (texto exato da
caixa, versão, marcada, e as respostas sobre fotos com pessoas e depoimentos), `status` (`rascunho` → `enviado` →
`importado` → `limpo`), `enviado_em`, `importado_em`, `limpo_em`. **(R2)** Sem `textos`/`sobre`: a captação não tem
esse campo e a produção não o usaria (fica para uma versão 2 do formato, combinada com a captação).

**`app.material_arquivos`**: `id`, `entrega_id`, `papel` (`logo` | `foto`), `ordem`, `caminho` (sorteado pelo
servidor, `<entrega_id>/<uuid>`; nunca o nome do arquivo do cliente), `tipo_declarado`, `tamanho_declarado`,
`tipo_real`, `tamanho_real`, `status` (`reservado` → `conferido` | `recusado` → `removido`), datas.

**`app.entrega_ajustes`**: `entrega_id`, `rodada`, `texto` (1 a 1.500 caracteres, depois de `limparMensagem` e
`redigir`), `status` (`na_fila` | `feito`), datas. Fica fora do resumo (o contrato), como o pedido livre do PR 3a.

**`app.links_pedido`** **(R2)**: o "link do pedido" do §1 (hash do código, conversa, `valido_ate`, `ultimo_uso_em`,
`revogado_em`, `motivo_revogacao`: `novo_a_pedido` | `sair_do_aparelho` | `fim_do_pedido`), um vivo por conversa,
separado da retomada de 7 dias para não mudar as regras dela. Usar não revoga (rodada 2).

O `vendas_estado` ganha `entrega` (passo, datas, rodadas, endereços conferidos, percentuais da proposta, resumo do
material: campos preenchidos e arquivos `{ id, papel, ordem, tamanho_real, status }`), para a tela abrir com uma
chamada só.

### 2.1 O prazo **(R2)**: uma regra só, a da captação

A captação calcula `prazo.entregar_ate` com regras que o site não tinha: o prazo só corre com o número dos botões
autorizado (`numero_em`) e a entrada paga; para enquanto espera a lista de ajustes (por rodada); e conta os dias no
fuso `America/Campo_Grande` (-04:00). Duas contas diferentes dariam um dia de diferença perto da meia-noite. **(D4,
21/10)** Essas regras (inclusive a pausa) são do lançamento e o dono disse que valem também para o orçamento: a conta
do site é a da captação, e a tela mostra a regra e a data como compromisso. Por isso:
- o site usa a **mesma regra**, com os **mesmos casos de teste** (uma cópia fixa dos casos da captação, com teste de
  igualdade, como o `CPF_CNPJ`), e guarda em `entregas.prazo` as datas que contam (`entrada_em`, `numero_em`, pausas);
- a tela diz "previsão" até a produção confirmar; quando o painel recebe `previa` (ou um `prazo` da rotina), a data
  da captação passa a ser a mostrada;
- `enviado_em` e as datas do pacote vão em -04:00, o fuso da captação.
- **Pela D4**, a data é compromisso na tela ("pronto até"); "previsão" fica só para o tempo entre o envio do material e
  a primeira data confirmada pela produção.
- A rotina diária avisa no painel quando `entrega_ate` passa sem prévia (`prazo_vencido`); pela D4, atraso da Beyon
  vira devolução da entrada.

## 3. As telas (celular primeiro, 390 px)

Regras de sempre: texto que importa com 16 px ou mais; botões de 44 px ou mais, em frase normal; mono só em rótulo,
índice e dado; nenhum desfoque, sombra difusa ou brilho suave (nem no fundo do `<dialog>`); nenhuma caixa mais larga
que a tela; tudo que vem do cliente ou do banco entra por `textContent`; CSP sem inline. **(R2)** Nenhum percentual
escrito à mão: "40%" e "60%" na tela vêm da proposta (`sinal_percentual` e `100 − sinal_percentual`).

**"Seu pedido" (o acompanhamento, sempre no topo depois da entrada).** Lista vertical de 4 passos, cada um numa
linha com a régua de 1 px do site: feito (✓), agora (só o rótulo em ciano, que é dado) ou depois. Embaixo do passo,
uma frase com data quando houver ("Previsão: 6 de novembro"; a data vem do servidor, §2.1). O passo da vez abre
abaixo. Logo depois da entrada, o cartão "Guarde o link do seu pedido" (§1) fica no topo até o cliente tocar
"Copiar" ou "Mandar para mim" (compartilhamento do aparelho, nunca `wa.me/?text=`, §1).

```
┌─ 390 px ─────────────────────────────┐
│ SEU PEDIDO · BZ-K7M3Q                │
│ ✓ 1  Entrada paga          R$ […]    │
│ ● 2  Seu material          agora     │
│      O prazo começa quando você      │
│      enviar.                         │
│ ○ 3  Prévia do site                  │
│ ○ 4  No ar e o restante    R$ […]    │
│ Guardar o link do pedido →           │
│ Continuar no computador →            │
└──────────────────────────────────────┘
```

**Passo 2, material.** Uma tela com 6 blocos curtos (módulos separados por vão, como os cartões do site); cada campo
é salvo sozinho, com um "Salvo" discreto ao lado (como nos detalhes do PR 2a). Os limites são os da captação
(`CAMPOS_DADOS`), conferidos na tela e no servidor. Ordem:

1. **Logo e fotos.** "Escolher a logo" (1) e "Escolher fotos" (até 20, várias de uma vez). Cada arquivo vira uma
   linha com miniatura (feita do próprio arquivo no aparelho, sem baixar nada), tamanho, barra de envio e "×". Erro
   em palavra simples, na linha do arquivo: "Esse arquivo não é uma foto que o site aceita. Use JPG, PNG ou WebP.",
   "Foto grande demais (até 10 MB).", "Você chegou ao limite de 20 fotos.". A pergunta da captação fica aqui: "As
   pessoas que aparecem nas fotos autorizaram?" (Sim / Não tem pessoa / Não sei; "Não sei" e "Não" fazem a produção
   não usar foto com pessoa).
2. **Contatos do site.** WhatsApp dos botões (obrigatório), com a caixa "Usar o mesmo número do pedido" (vem
   desmarcada: o número do pedido é contato pessoal e só vai para o site pela escolha dele); telefone para ligação;
   até 2 e-mails; até 4 redes (`https://`).
3. **Serviços.** Até 12: nome (2 a 60) e, se quiser, uma frase (2 a 140). "+ Outro serviço".
4. **Onde e quando.** Cidade e estado do negócio (vêm preenchidos do orçamento; o estado é escolhido numa lista, porque
   a captação precisa da UF); até 7 linhas de dias e horas (2 a 40 cada); até 20 bairros (2 a 40); endereço (5 a 120)
   só com a caixa "Quero mostrar o endereço no site".
5. **Provas e depoimentos.** Até 4 provas ("garantia de 90 dias", "orçamento por escrito"; 2 a 60); até 3
   depoimentos (texto 5 a 300, autor 2 a 60) com a pergunta "Esses clientes autorizaram?" (só "Sim" deixa o campo
   seguir). Aviso fixo: "Não escreva CPF, CNPJ nem dados de outras pessoas."
6. **Cor e envio.** Cor da marca (seletor, ou "Não sei: usar a cor da logo"), a caixa de autorização (texto exato e
   versionado, §8) e "Enviar o material". Embaixo: "O que você não mandar fica como no modelo. Depois de enviar,
   mudanças entram na lista de ajustes da prévia."

Bloco ou lista vazia não vai no pacote (**(R2)** a captação exige ao menos 1 item em toda lista: o site omite o campo,
nunca manda `[]`).

```
┌─ 390 px ─────────────────────────────┐   ┌─ 390 px ─────────────────────────────┐
│ PASSO 2 DE 4 · SEU MATERIAL          │   │ 6 · COR E ENVIO                      │
│ 1 · Logo e fotos                     │   │ Cor da marca  [■ #1a7f5a]            │
│ [ Escolher a logo ]                  │   │ [x] Autorizo a Beyon Zero a usar     │
│ ▣ logo.png       48 KB  ✓ enviada ×  │   │     este material no meu site.       │
│ [ Escolher fotos ]        3 de 20    │   │ Falta: o WhatsApp dos botões (2).    │
│ ▣ IMG_2231.jpg 2,1 MB  ██████░░   ×  │   │ [ Enviar o material ]   (desligado)  │
│ ▣ IMG_2232.jpg 1,8 MB  ✓ enviada  ×  │   │ O que você não mandar fica como no   │
│ As pessoas das fotos autorizaram?    │   │ modelo.                              │
│ (•) Sim  ( ) Não tem  ( ) Não sei    │   │                                      │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
```

Depois de enviar: "Recebido. Previsão do seu site: [data]. Você vê a prévia aqui mesmo." O material vira só leitura
(a lista do que foi, sem miniatura depois de recarregar: a página nunca baixa os arquivos de volta).

**Passo 3, prévia.** "Sua prévia está pronta" e "Ver a prévia" (abre em outra aba, `rel="noopener noreferrer"`, link
montado pelo código a partir do endereço conferido no servidor). Dois caminhos:
- "Está bom: aprovar" → `<dialog>` "Depois de aprovar, o próximo passo é pôr o site no ar." → aprovado.
- "Quero ajustes" → um campo só, "Escreva tudo de uma vez", com "esta é a lista 1 de 2" (ou "2 de 2"; D2: 2 listas, o
  que passar disso é orçado à parte, e na 2ª lista a tela avisa que é a última), até 1.500 caracteres, com o aviso de
  dados pessoais. A frase "Enquanto espero a sua lista de ajustes, o prazo fica parado" **entra** (D4: a pausa é regra
  do lançamento, §2.1). Depois de mandar: "Recebido. A nova prévia aparece aqui."
- **Sem resposta, o projeto para (D5).** A tela não diz "conta como aprovada" nem põe data de aprovação automática:
  diz só "Seu site só segue depois da sua resposta." O pedido fica na prévia até o cliente aprovar, mandar a lista
  ou desistir. Lembrete ao cliente não foi decidido e não existe.

**Passo 4, no ar e o restante.** "Seu site está no ar: [endereço]" e "Abrir o site"; logo abaixo, o Pix do restante,
no mesmo componente da entrada (§4). A frase "Se o restante não for pago em até 10 dias depois de o site ir ao ar, o
site sai do ar até o pagamento" aparece (D4). Pago: recibo final com as duas partes ✓ e "Pedido concluído".

## 4. Só Pix e "pagar sem medo" (o que sobra do 3b original)

**(R2) O cartão sai por UMA chave só: `MP_METODOS`, da tarefa A7 do plano da Cloudflare**
(`docs/superpowers/plans/2026-10-21-migracao-cloudflare.md`, "Task A7: só Pix fora do local": ausente ou inválido = só
Pix; `cfg.metodos` e `configPublica(cfg).metodos`; o servidor recusa o cartão antes do banco; a tela esconde o seletor).
O 3b não cria chave própria. Quem faz a A7 (o plano ou o 3b-1) se combina com a sessão do plano; o 3b-1 só depende
de `configPublica(cfg).metodos` para desenhar a tela sem o seletor. O código do cartão fica no repositório, desligado.

**A tela do Pix, nesta ordem** (spec de 11/10, §5, agora com o dado do dono):

```
┌─ 390 px ─────────────────────────────┐
│ PASSO 1 DE 4 · ENTRADA               │
│ R$ […]   [pct]% do total, por Pix    │
│ No seu banco vai aparecer:           │
│ Fernando Ferreira Dos Santos         │
│ (alguns bancos mostram o nome        │
│ abreviado)                           │
│ [   Copiar o código Pix   ]          │
│ 1 Abra o app do seu banco            │
│ 2 Pix › Pix copia e cola             │
│ 3 Cole o código e confirme           │
│ Esperando o pagamento. Esta tela     │
│ muda sozinha quando ele cair.        │
│ ▸ Pagar por outro aparelho (QR Code) │
└──────────────────────────────────────┘
```

- "Quem paga" (nome, sobrenome, e-mail, CPF ou CNPJ) continua antes do código, com a nota "o Mercado Pago pede para
  emitir o Pix" junto do CPF. Nada disso fica guardado no site (como hoje).
- O QR Code vai para dentro de "Pagar por outro aparelho" (`<details>`), fechado no celular e aberto a partir de
  768 px (no computador, o QR é o caminho natural).

**Perguntas antes de pagar** (fixas, em `<details>`, no resumo e na entrada, sem IA; spec de 11/10, §5):

| Pergunta | Resposta (texto) | Quando entra |
|---|---|---|
| Quando pago o restante? | "Quando o site estiver no ar: os outros [100 − pct]%, por Pix, nesta mesma página." | com o 3b-3 |
| Posso desistir? | "Até 7 dias depois de aceitar (confirmar o resumo), por qualquer motivo, você recebe a entrada de volta (Código de Defesa do Consumidor, art. 49). Depois dos 7 dias, a entrada fica com a Beyon Zero." (decisão de 11/10, Decisões.md :112, já vale para o orçamento; rodada 2) + "Se a Beyon Zero não entregar no prazo combinado, você recebe a entrada inteira de volta, mesmo depois dos 7 dias." (D4, 21/10) | 3b-1 (os 7 dias, a entrada que fica e a devolução no atraso) |
| Quando fica pronto? | "O prazo está no resumo do seu pedido, em dias corridos, contados do pagamento da entrada e do envio do seu material. Se o material não chegar em 30 dias, o site sai com as imagens do modelo." (D4, 21/10; texto de `/condicoes`) | 3b-1 |
| Quantos ajustes? | "Duas listas de ajuste na prévia. O que passar disso é orçado à parte." (D2, 21/10; revê a decisão de 11/10) | 3b-1 |
| O que eu recebo? | o site no ar no seu endereço; domínio e hospedagem: `[…]` (DADO DO DONO, spec de 11/10 §10.2) | com o dado |
| Nota fiscal? | `[…]` (hoje opera no CPF; a frase de `/condicoes` vale só para o lançamento até o dono dizer) | com o dado |
| Como mando fotos e textos? | "Aqui mesmo, depois da entrada. Não precisa mandar nada pelo WhatsApp." | com o 3b-2 |

**Antes de pagar, os passos.** Logo acima do botão do Pix, a lista de 4 passos do acompanhamento, sem datas. **(R2)**
Entra com o 3b-2; até lá, a tela fica com o texto de hoje. Um teste confere que nenhuma frase da coluna "Quando entra"
aparece antes da parte dela existir.

**A entrada é 40% (R2).** Hoje o 50 está em quatro lugares: o rascunho da tabela (`docs/fase2/regras-rascunho-v1.json`),
o valor-reserva do servidor (`coalesce(pr.sinal_percentual, 50)` em `20261007130000_pagamentos.sql` e
`20261007120100_vendas_funcoes.sql`), a tela (`js/orcamento.js`) e um teste (`docs/testes/vendas-banco.test.mjs`). O 3b-1:
- troca o valor-reserva por **falha fechada** (proposta sem percentual não cobra: 23514), com teste;
- faz a tela ler sempre o percentual da proposta (teste com uma proposta a 40 e outra a 50: a tela diz o que cobra);
- passa o rascunho a 40, citando a decisão de 20/10 (Decisões.md :25);
- e deixa para o dono aplicar a tabela ativa com `sinal_percentual: 40` (o caminho de sempre, `npm run
  validar:regras`). Propostas já feitas guardam o percentual delas, e a tela mostra o delas.

## 5. O restante

- O servidor decide a parcela, nunca o navegador: com a entrega em `no_ar` ou `suspensa`, `pagar` cobra o `saldo`;
  com a conversa em `aguardando_pagamento`, o `sinal`; em qualquer outro caso, 55000.
- Valor do saldo = `valor_total − sinal` da proposta aceita (a diferença exata fecha o total sem erro de
  arredondamento). `app.pagamentos` já aceita `parcela = 'saldo'` e já tem o índice de "uma cobrança viva por
  parcela"; `pagamentos_iniciar` ganha o caminho do saldo.
- O aviso do Mercado Pago segue o caminho de hoje (assinatura, consulta da order, `pagamentos_aplicar`). Saldo pago:
  entrega `concluida`, conversa `encerrada` (transição nova), projeto `entregue`, evento `restante_pago`. Se a
  entrega estava `suspensa`, o painel mostra "religar o site" (quem religa é a produção, na captação).
- Estorno ou contestação do saldo: as regras de hoje (fail closed, alerta no painel); a entrega não volta sozinha.
- **Pela D4**, a rotina diária marca no painel quem está há 10 dias em `no_ar` sem o saldo ("suspender") e os 2
  lembretes em 10 dias da regra da captação (os mesmos dias que ela usar). Pela D1, o cliente vê os lembretes só na
  tela (o dono não manda lembrete; ele só avisa nos 2 momentos "prévia pronta" e "site no ar").
- **(R2) Desistência em dois lugares.** O estorno no Mercado Pago e o `encerrar` são do painel do site; `desistiu` e
  `devolucao` são da captação. Até a rotina fazer a ponte, o passo a passo do dono (no `scripts/entregas.mjs encerrar`)
  lembra das duas marcações.

## 6. Do site para a produção pelo Claude

**O formato é o da captação, versão 1** (`captacao/docs/parte6/para-o-site.md` §3; `captacao/entrega/material.mjs`,
`lerFormulario` e `CAMPOS_DADOS`; conferido campo a campo pela captação na revisão). O site não inventa formato: a
mesma esteira de produção da captação monta o site do cliente que veio do orçamento.

**(R2) O pacote de um pedido tem duas pastas** (a `material/` da captação só aceita `logo.*`, `foto-NN.*` e
`dados.json`; um JSON a mais ali reprova o material inteiro):

```
<destino>/<BZ-código>/
  pedido-site/
    pedido.json       (R2) quem é o cliente, para a captação criar o registro (abaixo)
    formulario.json   { "versao": 1, "enviado_em": "<ISO com -04:00>", "autorizacao": { "texto": "<texto exato>",
                        "marcada": true }, "dados": { … só campos de CAMPOS_DADOS, sem lista vazia … },
                        "arquivos": ["logo.png", "foto-01.jpg", …] }
  material/
    logo.png | logo.jpg | logo.webp, foto-01.jpg … foto-20.webp   (nomes dados pelo servidor, na ordem do cliente)
```

**`pedido.json`, versão 1 (R2, pedido I1 da captação).** Sem ele, `novo --origem site --pedido <BZ>` não tem como
criar o cliente (exige nome, tipo, cidade, UF, ramo, plano e WhatsApp; depois, `aceitou` e `entrada`):

```
{ "versao": 1, "codigo": "BZ-K7M3Q",
  "negocio": { "nome_exibicao": "…", "tipo_exibicao": "…", "cidade": "…", "uf": "RJ",
               "ramo": "<chave de captacao/config/nichos.json>" | null, "saude": false },
  "plano": "landing" | "institucional",
  "valores": { "total": 0, "entrada": 0, "restante": 0 },
  "aceite": { "em": "<ISO -04:00>", "texto": "<texto exato confirmado no resumo, com a versão>" },
  "entrada_paga_em": "<ISO -04:00, do aviso do Mercado Pago>",
  "whatsapp_contato": "+55…" }
```

- Nada de CPF/CNPJ nem dado além do que a captação já guarda. Os valores vêm da proposta aceita (inteiros em reais
  se forem inteiros; o formato exato se combina com a captação no `importar-site`).
- `ramo`: um mapa fixo, com teste, dos ramos do orçamento para as chaves de `config/nichos.json`; ramo sem par vai
  `null` e a captação decide. Ramo de saúde vai `saude: true`; a captação só aceita cliente de saúde depois do modelo
  de saúde (decisão de 15/10), e o orçamento já vende para saúde hoje: a importação recusa e o painel mostra o alerta.
  Fica como risco (§14).
- `plano`: Landing page → `landing`, Site institucional → `institucional`. Outros formatos (loja, sob medida) não
  têm esteira na captação: o pacote sai, a importação recusa, o painel mostra "produção manual".

**Regras do `formulario.json`** (as da captação, à risca): `whatsapp` e `telefone` em `+55` + DDD + número; listas
com 1 item ou mais (campo vazio não vai); `depoimentos` só com "sim" à pergunta deles; `fotos_com_pessoas: true` só
com "Sim"; `como_funciona` não vai (é do modelo da captação); `redes` com as regras de `problemaDoLink`; CPF ou CNPJ
em qualquer campo é recusado na tela e no servidor (`CPF_CNPJ` de `captacao/clientes/esquema.mjs`, copiada com teste
de igualdade); texto da autorização de 5 a 600 caracteres, exatamente como estava na tela. O site valida campo a campo
ao salvar e o pacote inteiro ao enviar, com as mesmas funções; a captação valida de novo na importação.

**(R2) Preço e vagas: duas fontes hoje (I2 da captação).** A captação grava os valores do lançamento
(`config/oferta.json`) e `registrarEntrada` recusa valor diferente; ela também conta as 10 vagas só com os clientes
dela. Uma venda do orçamento por outro valor, ou depois de 10 vagas vendidas, seria recusada na importação **depois**
de o cliente pagar. **D6 (21/10): o orçamento segue a tabela normal e não conta as 10 vagas**; a captação passa a
aceitar os valores da proposta (pedido separado, §13). O 3b não vai ao ar para cliente real antes de ela aceitar.

**Quem leva o pacote até a produção.** A produção roda na máquina do dono (Claude Code), como a captação. O site não
"empurra" nada para o PC; o PC busca:

- `scripts/entregas.mjs` (repositório do site, roda no PC do dono, com `PAINEL_CHAVE`): `listar` (entregas por passo,
  com alertas); `baixar <código> --destino <pasta>` (pede `GET /api/painel?material=<código>`, recebe os dois JSON e
  links de leitura de 60 s, baixa cada arquivo, confere de novo os primeiros bytes com `tipoPorBytes`, o tamanho e a
  estrutura inteira da imagem (os percorredores de `captacao/entrega/imagens.mjs` pegam arquivo cortado), e grava as
  duas pastas; **não** marca nada); **(R2)** `importado <código>` (só depois de a importação da captação passar: é
  ela que marca o material `importado` e começa a contar os 7 dias da nuvem); `previa <código> <endereço>`;
  `no-ar <código> <endereço>` (pede o código sorteado `NO-AR-XXXX`, como o `ENTREGAR-XXXX`); `suspender`;
  `encerrar <código> <motivo>`.
- A esteira da captação faz o resto (`novo --origem site`, `material --formulario`, `montar`, `checklist`,
  `enviar-versao`, `revisao`, `publicar`), com a regravação das imagens em WebP sem metadados.
- **A rotina automática é da captação** e foi aceita por ela (revisão da captação §5, tamanho médio): `importar-site
  <pasta>` (lê `pedido.json` e `formulario.json`, cria o cliente, grava aceite e entrada, importa o material;
  idempotente pelo código BZ) e o laço agendado `baixar` → `importar-site` → `importado` → `montar` → `checklist` →
  `enviar-versao` → revisão por outro agente → `previa`. Ela começa depois que este desenho fixar o `pedido.json` e o
  dono decidir a D6 (decidida em 21/10: tabela normal; falta só a captação aceitar os valores). Depende também da
  `PAINEL_CHAVE` no PC (no Infisical, com o sim do dono, nunca no repositório).
- **(R2) Até a rotina existir, o passo é manual:** por pedido, o dono roda `baixar`, a importação na captação (com os
  dados do `pedido.json`), `importado` e, quando a versão estiver boa, `previa`; a revisão da prévia é dele. O
  `listar` mostra para cada pedido o próximo comando, pronto para copiar.
- Os textos do cliente (material e lista de ajustes) chegam à produção como DADO, dentro da moldura do briefing
  (`briefingDelimitado`), com o selo de `pareceInjecao` quando couber; a saída passa pela `varredura` antes de
  publicar (as regras do PR 2 e do 3a).

## 7. O envio dos arquivos (sem passar pelo Worker)

**Onde ficam: Supabase Storage, num balde privado `material`** (escolha do agente; o dono pode trocar).

| Critério | Supabase Storage | Cloudflare R2 |
|---|---|---|
| Conta e cobrança | já usada pelo site; nada novo | exige ativar uma assinatura do R2 pelo checkout da Cloudflare (developers.cloudflare.com/r2/get-started) |
| Segredos | nenhum novo (a chave de serviço que o servidor já tem) | 2 novos (chave de acesso S3 do R2) |
| Limite no próprio armazém | o balde recusa o **tipo declarado** e o tamanho fora da regra (`allowed_mime_types`, `file_size_limit`) | o link assinado não limita tamanho; seria preciso assinar o `content-length` exato |
| Grátis (conferido em 21/10) | 1 GB de arquivos, até 50 MB por arquivo, 5 GB de saída (supabase.com/pricing) | 10 GB-mês, saída sem custo (r2/pricing) |
| Privacidade | mesma empresa que já guarda o pedido | a Cloudflare já está na lista (hospedagem) |
| CPU no Worker | criar o link é um pedido ao Supabase (espera de rede, não CPU) | a assinatura é calculada no Worker (pouca CPU) |

Por que o Supabase: menos peças (nenhuma conta, segredo ou assinatura nova), e o próprio armazém barra arquivo fora da
regra mesmo se o nosso código falhar. O 1 GB cabe porque os arquivos saem da nuvem 7 dias depois de importados pela
produção (§10): um pedido usa no máximo ~150 MB e, em média, bem menos. Os 10 MB por foto cabem nos 50 MB do plano.
O projeto grátis do Supabase pausa depois de 1 semana sem atividade; a rotina diária já o mantém ativo. Se o volume
crescer, o R2 entra trocando um arquivo só (`api/_material/armazem.mjs`: `linkDeEnvio`, `inicioDoArquivo`,
`tamanhoDoObjeto`, `remover`, `linksDeLeitura`).

**O caminho de um arquivo:**

```
 navegador                          Worker (/api/vendas)                Supabase
 ─────────                          ────────────────────                ────────
 escolhe a foto; se > 2560 px ou
 > 3 MB, reduz no aparelho (canvas,
 JPEG 0,85); a logo vai como está
 1. reservar {papel, tipo, tamanho} ─► confere sessão, passo, cotas ──► app.material_reservar (linha "reservado")
                                       pede o link de envio ──────────► /storage/v1/object/upload/sign/material/<caminho>
    ◄── { arquivo_id, link } ◄──────── devolve só o link (token)
 2. PUT do arquivo direto no link ───────────────────────────────────► balde privado (tipo declarado e tamanho)
 3. conferir {arquivo_id} ───────────► lê os 16 primeiros bytes e o ──► (Range 0-15 e dados do objeto)
                                       tamanho real; PNG/JPEG/WebP e
                                       tamanho real = declarado?
                                       sim: "conferido"; não: remove ──► app.material_conferir
    ◄── { status, motivo? }
```

- A redução no aparelho é um acréscimo (economiza dados do celular e espaço); se o navegador não conseguir, vai o
  original dentro do limite. O tamanho declarado é o do arquivo que vai mesmo (já reduzido).
- Envio um arquivo por vez (barra de progresso por arquivo; "Tentar de novo" na linha que falhar).
- **(R2) O link de envio vale 2 horas e não é de uso único** (doc do `createSignedUploadUrl`: "valid for 2 hours";
  `upsert: false` só impede sobrescrever um objeto que existe). Depois de `recusado` ou `removido`, o mesmo link
  poderia gravar de novo no mesmo caminho. Fechado em três pontos: `material-conferir` só aceita linha em
  `reservado`; o teto do balde conta o tamanho real dos objetos (`storage.objects`, `metadata->>'size'`), mais as
  reservas abertas pelo limite do papel, e não só os conferidos; e a rotina diária **reconcilia**: apaga o objeto
  sem linha, com linha `recusado` ou `removido`, ou com linha `reservado` há mais de 24 h. **(R2, rodada 2)** Reserva
  com menos de 24 h é poupada (um envio em andamento às 06:41 não some). A lista dos objetos vem do banco
  (`storage.objects` do balde, 1 chamada), não da listagem paginada do Storage. O abuso, de todo jeito, exige ter
  pago a entrada.
- Reserva não conferida em 24 h some (a rotina diária apaga a linha e o objeto).
- `material-remover` (antes de enviar) apaga o objeto e marca `removido`.
- Os nomes dos arquivos no aparelho do cliente nunca vão ao servidor; os nomes do pacote (`logo.png`, `foto-01.jpg`)
  saem do papel, da ordem e do tipo conferido.
- **`[conferir no plano]`, com teste real:** (1) o Storage responder ao pedido parcial (o código do servidor do
  Supabase indica que sim: esperar 206 e `Content-Range: bytes 0-15/…`); se não, o `conferir` fica só com o tamanho
  real e a conferência de bytes passa toda para o `baixar` (que já confere), sem nunca puxar o arquivo inteiro pelo
  Worker; (2) se o envio pelo link assinado exige o cabeçalho `apikey` (a chave pública do Supabase): se exigir, ela
  passa a ir para o navegador, o que é aceitável (é pública) mas muda a CSP e a lista de conferência; (3) o HEIC do
  iPhone virando JPEG quando o campo aceita só JPG, PNG e WebP (E2E com aparelho real).

**Limites (servidor e balde; a tela só repete para avisar antes; escolhas do agente):**

| O quê | Limite | Quem confere |
|---|---|---|
| Tipos | `image/png`, `image/jpeg`, `image/webp` (SVG nunca: pode levar código) | balde (tipo declarado) e `conferir` (bytes) |
| Logo | 1, até 5 MB | `reservar` e `conferir` (o balde tem um limite só, o de 10 MB) |
| Fotos | até 20, até 10 MB cada (a captação aceita 15 MB e 60 itens) | `reservar`, balde, `conferir` |
| Reservas por pedido | até 30, contando recusadas e removidas | `reservar` |
| Total por pedido | até 150 MB | `reservar` |
| Total no balde | teto de 800 MB pelo tamanho real dos objetos; acima, "Recebemos muitos arquivos agora. Tente de novo amanhã." e alarme no painel em 70% | `reservar` e rotina |

Com 1 logo e 20 fotos, o pacote tem no máximo 21 arquivos + 12 campos (os 13 de `CAMPOS_DADOS` menos `como_funciona`)
= 33 itens (a captação conta 1 item por campo e aceita até 60).

## 8. Segurança

**Quem pode o quê.**
- Toda ação do cliente exige o token do visitante (o mesmo de hoje) e passa por `privado.conversa_do(conversa,
  visitante)` e pela entrega dessa conversa, com o passo exigido explícito (`material` para salvar, reservar,
  conferir, remover e enviar; `previa` para aprovar e mandar ajustes; `no_ar`/`suspensa` para o saldo). Teste de cada
  passo recusado, um a um.
- O cliente **nunca lê arquivo de volta**: não existe rota que devolva bytes ou link de leitura ao navegador. Só o
  painel (com `PAINEL_CHAVE`) recebe links de leitura de 60 s, um por arquivo, para o `baixar`.
- O balde é privado, sem endereço público e com `upsert` desligado; o caminho é sorteado pelo servidor; o link de
  envio vale 2 h e pode ser reusado, e por isso a conferência, o teto e a reconciliação da §7 não confiam nele.
- O painel (`previa`, `no_ar`, `suspender`, `encerrar`, `material_dispensar`, `importado`) usa a chave e o freio de
  tentativas que já existem; `no_ar` pede o código sorteado no terminal (abre cobrança).

**Validação do envio, em camadas** (a de baixo não confia na de cima):

| Camada | Confere |
|---|---|
| Tela | `accept`, tamanho, quantidade (só para avisar antes) |
| `material-reservar` | tipo declarado na lista, tamanho declarado no limite do papel (5 MB a logo, 10 MB a foto), cotas do pedido e do balde, passo `material` |
| Balde | **tipo declarado** no envio (não o conteúdo) e tamanho até 10 MB (um limite só para os dois papéis), privado, sem sobrescrever |
| `material-conferir` | só linha em `reservado`; **tamanho real = declarado** (menor também é recusado: não se segura cota reservando 10 MB e mandando 1 KB); os primeiros bytes são PNG, JPEG ou WebP (`tipoPorBytes`, cópia da captação com teste de igualdade, sem SVG); se não, apaga e marca `recusado` |
| `baixar` (PC do dono) | bytes, tamanho e **estrutura inteira** da imagem (arquivo cortado no meio é pego aqui, não no Worker, que só lê 16 bytes) e o pacote inteiro pelas funções da captação |
| Produção (captação) | regrava toda imagem como WebP, sem metadados (some o GPS e qualquer carga escondida) |

**Texto.** Esquema fechado por campo (os limites de `CAMPOS_DADOS`), `limparMensagem` + `redigir` nos textos livres
(provas, depoimentos, lista de ajustes), CPF/CNPJ recusado, redes só com as regras de `problemaDoLink` (o servidor
nunca abre esses endereços). Corpo das ações limitado a 16 KB (o arquivo nunca vem no corpo).

**Endereços que o painel grava.** Só `https`, sem usuário, porta, caminho ou `?`. **(R2)** A prévia passa pela
`URL_PREVIA` da captação (`clientes/esquema.mjs`: `^https://v\d{1,2}\.bz-c-<6 do alfabeto de ID_CLIENTE>\.pages\.dev/?$`,
cópia com teste de igualdade) **e** precisa ser do projeto daquela entrega (`bz-<id do cliente na captação>`, como a
captação já confere), porque qualquer pessoa pode criar um `*.pages.dev`. O id do cliente da captação chega ao site no
`importado`. O endereço do site no ar segue as regras de `problemaDoLink` (domínio público).

**Nada de dado pessoal em URL.** Toda ação é POST com o corpo em JSON (inclusive `conversa_id`); os links do pedido e
de retomada levam o código no `#` (não vai ao servidor nem ao log); o caminho no balde é `<uuid>/<uuid>`; o link de
envio leva só o caminho sorteado e o token; `?material=<BZ-código>` do painel não é dado pessoal. O log nunca grava
link de envio nem de leitura (só `arquivo_id`), nem nome de arquivo do aparelho.

**Freios.** No banco, que vale entre instâncias do Worker (a memória de um Worker não dura nem é única):
- por sessão: salvar até 120 por hora; reservar até 40 por hora; conferir até 60 por hora; links do pedido e de
  outro aparelho até 3 por dia; ajustes e aprovar, 1 por passo;
- por IP (`privado.contar_ip`, /64 no IPv6): reservar até 60 por hora, somando todas as sessões;
- por pedido: as cotas da §7; no balde: o teto de 800 MB.
O freio na borda da Cloudflare (regra de limite por IP em `/api/*`) é do plano da Cloudflare e soma a estes.

**CSP.** Muda **só a CSP de `/orcamento`** (hoje o bloco de `/orcamento` no `vercel.json`; no plano da Cloudflare, o
bloco próprio dessa página no `_headers`), não a geral: `connect-src` ganha só o caminho de envio do Supabase
(`https://<projeto>.supabase.co/storage/v1/object/upload/sign/`), e `img-src` ganha `blob:` para as miniaturas feitas
no aparelho. Nada de `style=""`.

**Link do pedido (§1).** Revisão de segurança própria no 3b-2. Validade longa e fixo durante o pedido (rodada 2):
por isso 192 bits sorteados como a retomada, só o hash no banco, freio de tentativas como a retomada, um vivo por
conversa, troca só a pedido ("Gerar um link novo") ou em "Sair deste aparelho" (que invalida o link e a sessão), fim
automático 30 dias depois do pedido, e nenhum `href` da página com o código (teste).

**Injeção no Claude.** Material e ajustes são texto de cliente: vão para a produção dentro da moldura de DADO, nunca
como instrução; o selo de `pareceInjecao` aparece no `listar`; a saída passa pela `varredura` (PR 2 e 3a).

## 9. Leve para o Worker grátis (10 ms de CPU)

Nenhuma rota nova no Worker: as ações do cliente entram em `/api/vendas` (a tabela `ACOES`) e as do dono em
`/api/painel`, que já estão na tabela de rotas do plano da Cloudflare. Limites oficiais conferidos pela revisão:
10 ms de CPU por pedido e por cron, 50 subpedidos por execução, 5 crons por conta, corpo até 100 MB.

| Ação | O que o Worker faz | CPU esperada |
|---|---|---|
| `material-salvar` | valida até 16 KB de JSON contra o esquema; 1 chamada ao banco | baixa |
| `material-reservar` | 1 chamada ao banco + 1 pedido ao Storage (link) | baixa (espera de rede não conta) |
| `material-conferir` | 1 pedido de 16 bytes + 1 de dados do objeto + 1 chamada ao banco | baixa |
| `material-enviar` | monta e valida o pacote (até ~20 KB); 1 chamada ao banco | baixa |
| `previa-*`, `pagar` (saldo), links do pedido | como as ações de hoje | como hoje |
| painel `material` | 1 chamada ao banco + 1 pedido de links em lote (o Storage assina vários de uma vez) | baixa |
| rotina diária (limpeza + reconciliação) | 1 chamada ao banco + 1 listagem + 1 remoção em lote no Storage | baixa; contar os subpedidos |

- Nunca no Worker: ler o arquivo inteiro, reduzir ou converter imagem, montar ZIP, repassar o arquivo.
- A rotina diária ganha limpeza e reconciliação além do que já faz: os subpedidos dela entram na bancada de CPU do
  plano (`docs/cpu-rotas.mjs`, M1), com remoção sempre em lote (1 pedido para vários caminhos).
- `tipoPorBytes` usa `Buffer`; o plano liga `nodejs_compat`, então funciona, e a cópia tem teste de igualdade.
- "Baixa" é estimativa: a medida de verdade entra no ensaio de CPU por rota do plano (§13); a meta é ficar abaixo de
  metade do limite.

## 10. Quanto tempo cada coisa fica (para a página de privacidade)

Os prazos de 24 h, 7 dias e 30 dias desta tabela são proposta do agente; valem quando o dono aprovar o texto da
privacidade.

| O quê | Onde | Até quando |
|---|---|---|
| Fotos e logo | balde `material` (Supabase) | apagados 7 dias depois de **importados** pela produção (a importação da captação passou); se nunca importados, 30 dias depois do fim do pedido; desistência: na rotina do dia seguinte |
| Reserva de envio não conferida; objeto sem linha, recusado ou removido | balde e banco | 24 h / na reconciliação diária (reserva com menos de 24 h é poupada) |
| Campos do material | banco (`app.materiais`) | os mesmos 7 dias depois da importação (sobra só "enviado em", sem conteúdo); se nunca importados, 30 dias depois do fim |
| Prova da autorização (texto exato, versão, data e o que ela cobre: "logo", "fotos", "contatos"…), endereços da prévia e do site, datas dos passos | banco | com os registros do pedido e dos pagamentos: 5 anos depois do último pagamento ou devolução (a regra da captação, `para-o-site.md` §2) |
| Lista de ajustes da prévia | banco | 30 dias depois da última atividade (como o texto de conversa na captação) |
| Link do pedido (só o hash) | banco | até o fim do pedido + 30 dias |
| A cópia na produção (PC do dono) | pasta do cliente na captação | regra da captação: enquanto o site estiver com a Beyon Zero; apagada 30 dias depois da saída |

A limpeza e a reconciliação rodam na rotina diária que já existe (`41 6 * * *`, `api/rotinas.mjs`): sem cron novo (o
plano grátis da Cloudflare dá 5 por conta). Cada remoção vira evento `material_limpo`, sem conteúdo.

**Texto proposto para `/privacidade`** (acrescentar ao parágrafo do orçamento; **o dono aprova**, item do resumo):

> Se você contratar pelo orçamento, o material do seu site (logo, fotos, contatos e os textos dos campos) é enviado
> nesta página e fica guardado no Supabase, num espaço fechado: ninguém o vê pela internet, nem você depois de
> enviar. Ele é usado só para fazer o seu site, com a sua autorização marcada na tela (guardamos o texto exato dela e
> a data), e é lido pela ferramenta de inteligência artificial da Anthropic (nos Estados Unidos) que monta o site.
> As fotos perdem os dados de localização antes de ir para o site. O material sai do Supabase 7 dias depois de ir para
> a produção (ou 30 dias depois do fim do pedido, se não chegar a ir); a cópia usada para fazer e manter o site segue a
> regra da seção "Se você contratou um site".

**(R2) O "90 dias" de hoje.** A privacidade diz "Os demais dados de um projeto contratado ficam durante o projeto e
por mais 90 dias", e a seção da captação diz 5 anos para os registros do pedido e dos pagamentos. Proposta, para não
haver duas regras para o mesmo dado: "Os registros do pedido e dos pagamentos (valores, datas, a autorização do
material e os endereços do site) ficam 5 anos depois do último pagamento ou devolução; depois disso, sobram só os
números, sem nome. Os demais dados de um projeto contratado ficam durante o projeto e por mais 90 dias."

Na lista de terceiros: "Supabase (banco de dados das métricas e do orçamento, **e os arquivos do material enviado por
quem contrata**)" e, na Anthropic, "o material do site de quem contrata, que o agente que monta o site lê". A seção
"Se você contratou um site" é a da captação (`para-o-site.md` §2), publicada junto.

## 11. Decisões do dono (respondidas em 21/10)

As seis foram respondidas pelo dono em 21/10 (`Decisões.md`, linhas "3b D1" a "3b D6"; as perguntas e as opções
originais estão no resumo `.superpowers/sdd/pr3b-resumo-dono.md`). Abaixo, a resposta e o que ela muda no desenho.

- **D6. Preço e vagas (I2 da captação).** **Resposta: o orçamento segue a TABELA NORMAL e não conta as 10 vagas do
  lançamento** (como `/condicoes` já diz); a captação passa a aceitar os valores da proposta para cliente vindo do
  site. Muda: mudança de código na captação (pedido separado, §13). O 3b não vai ao ar para cliente real antes de ela
  aceitar (o risco é cobrar e a produção recusar depois).
- **D4. Regras do lançamento no orçamento (A1).** **Resposta: valem as mesmas, e aparecem na tela.** São: prazo contado
  da entrada paga e do envio do material, parado enquanto se espera a lista de ajustes; 30 dias sem material, o site
  sai com as imagens do modelo; 10 dias sem o restante, o site sai do ar; se a Beyon atrasar, devolve a entrada
  inteira. Muda: as frases entram na tela (as de prazo e devolução já no 3b-1; as de material e restante com o 3b-2 e
  o 3b-3); a data vira compromisso ("pronto até", §2.1); `material_dispensar`, `suspender` e a devolução no atraso são
  ações do painel (§2); a frase de prazo do contrato (`escopo.mjs:77`) e a do consultor (`consultor.mjs:92,96`)
  FICAM. ("Depois dos 7 dias, a entrada fica" não é D4: é a decisão de 11/10, Decisões.md :112.)
- **D1. Quem avisa o cliente.** **Resposta: a tela mostra sempre o andamento, e o dono avisa nos 2 momentos (prévia
  pronta e site no ar)**, com a mensagem pronta do painel e o link de uso único (§1, item 3; o painel abre a conversa
  só com o número, sem o texto na URL; o dono cola e envia). É a exceção pequena à regra de 20/10 (estimativa: uns 3
  toques por cliente). A tela traz a data prevista com "Pôr na minha agenda" (arquivo de calendário feito no aparelho)
  e o link do pedido guardado pelo cliente (§1). Lembretes ficam só na tela; e-mail automático fica fora.
- **D5. Prévia sem resposta (C3).** **Resposta: nunca é aprovada sozinha; o projeto PARA até o cliente responder.**
  Muda: não existe transição automática de `previa` (§2), nem prazo de aprovação automática, nem a frase "conta como
  aprovada" (§3). Lembrete automático ao cliente não foi decidido. Consequência (apontada pelo agente): um
  pedido com a entrada paga pode ficar parado na prévia sem limite de tempo e o restante não é cobrado. (Proposta do
  agente, sem decisão do dono: o painel mostrar ao dono, só em lista, os pedidos parados na prévia, sem mensagem ao
  cliente.)
- **D2. Ajustes na prévia (A2).** **Resposta: 2 listas de ajuste; o que passar disso é orçado à parte.** Revê a
  decisão de 11/10 ("sem limite") para o orçamento. Muda: `rodadas_max` = 2, o mesmo número da captação
  (`max_rodadas`); a captação não precisa aceitar rodadas sem limite; a pergunta "Quantos ajustes?" responde 2 listas.
- **D3. O botão fixo de WhatsApp.** **Resposta: não; WhatsApp só em "Outra dúvida?", em "Para desistir" e em "Problema
  com o pagamento".** Muda: nada de botão fixo nas etapas (3b-1).

**Tarefas que só o dono faz:**
1. Aprovar o texto da privacidade (§10), inclusive os prazos de guarda e a troca do "90 dias".
2. Aplicar a tabela ativa com `sinal_percentual: 40` (`npm run validar:regras` e o caminho de sempre).
3. Criar o espaço dos arquivos no Supabase de produção (rodar `supabase/storage/material.sql`; o agente deixa pronto).
4. Pôr a `PAINEL_CHAVE` no PC para a rotina da captação (no Infisical, com o sim dele), quando ela existir.

Escolha técnica do agente, que o dono pode mudar: **Supabase Storage** para os arquivos (§7).

Dados que continuam faltando (texto fica `[…]`, como na spec de 11/10 §10): hospedagem por mês por formato, nota
fiscal no orçamento, os dados do vendedor no rodapé.

## 12. Por dentro (arquivos) e testes

**Arquivos novos** (nenhum passa de 800 linhas; `js/orcamento.js`, com 739, só ganha a chamada aos módulos):
- `supabase/migrations/<data>_pr3b_entrega.sql`: tabelas e transições da §2, funções `app.vendas_material_*`,
  `app.vendas_previa_*`, o link do pedido, o saldo em `pagamentos_iniciar`/`pagamentos_aplicar`, a falha fechada no
  lugar do 50, o `vendas_estado` com `entrega`, `etapa_retomavel` com `em_producao`, funções do painel, eventos,
  limpeza e reconciliação.
- `supabase/storage/material.sql`: o balde (privado, tipos, 10 MB), aplicado só no Supabase real pelo dono (o PGlite
  dos testes não tem o esquema `storage`).
- `api/_material/esquema.mjs` (a lista fechada, `CPF_CNPJ`, `URL_PREVIA`, `tipoPorBytes`, todos com teste de
  igualdade com a captação), `api/_material/pacote.mjs` (`pedido.json` e `formulario.json` v1),
  `api/_material/prazo.mjs` (a regra da §2.1, com os casos de teste da captação), `api/_material/armazem.mjs`
  (Supabase; local: um armazém de mentira em memória, `globalThis.__BZ_LOCAL.armazem`, como o simulador do Mercado
  Pago), `api/_vendas/fluxo-entrega.mjs`.
- `js/orcamento-entrega.js` (acompanhamento, links do pedido, prévia, no ar, agenda), `js/orcamento-material.js`
  (os 6 blocos), `js/orcamento-envio.js` (reduzir, reservar, enviar, conferir; lógica pura testável sem DOM).
- `scripts/entregas.mjs` (o lado do dono, §6).

**Testes** (`node:test`, PGlite com as migrations reais, como o resto):
- banco: cada transição permitida e cada uma recusada; passo exigido em cada função; **`previa` nunca sai por rotina
  nem por passar o tempo (D5)**: só por ação do cliente ou pelo `encerrar` do painel; cotas (21ª foto, 31ª reserva,
  151 MB, teto do balde pelo tamanho real); `conferir` fora de `reservado` recusado; corrida (`passo_base`,
  `rodada_base`); `rodadas_max` = 2 (a 3ª lista é recusada, D2); saldo só em
  `no_ar`/`suspensa` e com o valor exato `total − sinal`; proposta sem percentual não cobra; saldo pago conclui e
  encerra; limpeza nos prazos da §10 e só depois de `importado`; ordem de travas; link do pedido continua valendo depois de usado e só morre em "Gerar um link novo", "Sair deste
  aparelho" ou no fim; reserva com 1 h sobrevive à reconciliação e com 25 h some; nenhum `href` com o código do link
  (nem `wa.me/?text=`), na página e no painel;
- API: sessão de outro visitante recusada em toda ação; corpo acima de 16 KB recusado; cartão recusado com
  `MP_METODOS` ausente (o teste é o da A7); endereço de prévia fora da `URL_PREVIA` ou de outro projeto recusado;
  nenhum log com link assinado;
- tela: percentuais vindos da proposta (uma a 40 e uma a 50); nenhuma frase de parte que ainda não existe, nem
  "conta como aprovada" (D5), nem "quantos precisar" (D2); as frases da D4 (prazo, 30 dias, 10 dias, devolução) só
  na parte que as cumpre; "esta é a lista 1 de 2";
- material: o pacote passa no `lerFormulario` da captação (cópia fixa de um envio de exemplo); lista vazia nunca sai
  como `[]`; campo fora da lista nunca sai; CPF/CNPJ recusado; depoimentos e `fotos_com_pessoas` só com "sim";
  `pedido.json` com todos os campos que o `novo --origem site` exige; mapa de ramos;
- prazo: os casos de teste da captação (fuso `America/Campo_Grande`, `numero_em`, pausa por rodada);
- conferência de bytes no Worker: PNG, JPEG e WebP aceitos; SVG, HTML com extensão `.jpg` e tamanho diferente do
  declarado recusados (e o objeto apagado); objeto regravado num caminho recusado some na reconciliação e conta no
  teto; **no `baixar`**: arquivo cortado no meio recusado;
- E2E no celular (arquivo próprio, `docs/e2e-entrega.mjs`, porque o `e2e-orcamento.mjs` já passa do limite): entrada
  por Pix simulado → guardar o link → material com 2 fotos e 1 logo → enviar → prévia (painel simulado) → ajustes →
  aprovar → no ar → saldo simulado → concluído; "continuar em outro aparelho"; e **armazenamento apagado depois do
  pagamento → volta pelo link do aviso (ou pelo link guardado) → aprova → paga o restante**;
- acessibilidade (`npm run acessibilidade`), `npm run verificar` e os screenshots `-cel` e `-320` antes do desktop;
- mutação: sabotagens novas no `docs/testes/mutacao.mjs` (pular a conferência de bytes, aceitar saldo fora de
  `no_ar`, esquecer o dono da sessão, marcar `importado` no `baixar`).

## 13. Entrega, dependências e o que fica fora

**Três PRs, nesta ordem** (cada um com revisão técnica e de segurança por agentes diferentes do autor,
`docs/PROCESSO.md`):
1. **PR 3b-1 — Pix e pagar sem medo:** a tela do Pix na ordem nova com o nome do banco, as perguntas antes de pagar
   (só as que já são verdade, §4, inclusive "Quando fica pronto?", "Quantos ajustes?" e a devolução no atraso, D4 e
   D2), os percentuais da proposta e a falha fechada no lugar do 50, o rascunho a 40, D3.
   Usa o `MP_METODOS` da A7 do plano da Cloudflare.
2. **PR 3b-2 — o material:** entrega no banco (passos `material` e `producao`), o acompanhamento, os links do pedido,
   o formulário, o envio de arquivos, limpeza e reconciliação, `scripts/entregas.mjs listar|baixar|importado`, os
   passos antes de pagar, a privacidade.
3. **PR 3b-3 — prévia, no ar e o restante:** passos `previa` a `concluida`, o saldo, os comandos que faltam, os
   avisos da D1, as regras da D4 (prazo parado, 10 dias sem o restante), a prévia que para sem resposta (D5), o E2E
   inteiro. **Antes de ir ao ar (revisão do 3b-1, MÉDIO-3):** o escopo confirmado (`api/_vendas/escopo.mjs:77`, o texto que a
   pessoa marca em "Li e confirmo") precisa trazer as quatro regras da D4 (30 dias sem material, prazo parado nos
   ajustes, 10 dias sem o restante, devolução no atraso). Hoje só o prazo "do sinal pago e do material recebido" está nele;
   o resto está só na pergunta "Quando fica pronto?" da tela. Estender o teste de coerência
   (`docs/testes/pagar-sem-medo.test.mjs`) para conferir as quatro regras nos quatro lugares (contrato, consultor,
   `/condicoes`, tela). Sem isso, a Beyon aplicaria uma regra que o cliente não confirmou.

**(R2) Mesclar não é ir ao ar.** Cada PR pode ser mesclado na `main` sozinho (o só Pix, pré-requisito do grátis da
Cloudflare, vem da A7 do PR A). Ir ao ar **para cliente real** só com 3b-1 + 3b-2 + 3b-3 juntos, já na Cloudflare (a Vercel Hobby não
permite uso comercial, Decisões.md :19), com a captação já aceitando os valores da tabela normal (D6, respondida em
21/10) e o caminho do material até a produção funcionando (a rotina da captação, ou o passo manual aceito pelo dono).
A D4 está respondida e as regras dela estão na tela. O 3b-2 no ar sem o 3b-3 deixaria o cliente sem como aprovar e
pagar o restante.

**O que depende do plano da Cloudflare** (`docs/superpowers/plans/2026-10-21-migracao-cloudflare.md`, em reescrita
por outra sessão; este desenho não o altera):
- a tarefa A7 (`MP_METODOS`, só Pix), que é a chave única do "só Pix" (§4);
- a medida de CPU das ações novas e dos subpedidos da rotina no ensaio por rota (`docs/cpu-rotas.mjs`, §9);
- a CSP nova de `/orcamento` (§8) no bloco dessa página no `_headers`;
- a limpeza e a reconciliação na rotina diária levada para os Cron Triggers (sem cron novo);
- o freio por IP na borda (regra de limite em `/api/*`);
- os endereços dos links do pedido, de retomada e do aviso de pagamento em `beyonzero.com.br`;
- os testes reais do Storage (`Range`, `apikey`) que ficaram `[conferir no plano]` (§7).

**O que depende da captação** (pedido separado, aceito por ela na revisão, §5 dela): `importar-site`, a rotina
agendada, aceitar valores da proposta sem contar as 10 vagas (D6, 21/10); com a D2 em 2 listas, ela não precisa
aceitar rodadas sem limite; e, no futuro, uma versão 2 do formato com o campo `sobre`.

**Fora deste PR:**
- e-mail automático (a D1 de 21/10 não o escolheu; o domínio segue sem e-mail, Decisões.md de 21/10);
- cartão, parcelamento no cartão e nota fiscal;
- uma tela de entregas no painel (neste PR o dono usa o comando, como no 3a); só os avisos da D1 (os 2 momentos) entram na tela,
  na lista de lembretes que o painel já tem;
- produção de loja e sob medida (sem esteira na captação: "produção manual");
- a revisão de linguagem de todo o site (PR 4).

## 14. Riscos

- **Cobrar e a produção recusar depois** (D6, saúde, formato sem esteira): o 3b não vai ao ar para cliente real
  antes de a captação aceitar os valores da tabela normal (D6); saúde e formatos sem esteira geram alerta no painel e
  passam a produção manual.
- **Cliente perde o pedido no iPhone:** três caminhos de volta (§1) e o E2E de armazenamento apagado.
- **Pedido parado na prévia sem limite de tempo** (D5: nada é aprovado sozinho; o restante só é cobrado depois da
  aprovação): consequência da D5, apontada pelo agente; os ajustes têm teto de 2 listas (D2).
- **Cota grátis do Supabase:** teto pelo tamanho real, alarme em 70%, saída da nuvem 7 dias depois da importação.
- **Passo manual até a rotina da captação:** o dono roda alguns comandos por pedido (o `listar` mostra o próximo).
- **Duas contas de prazo:** uma regra só, casos de teste em comum (§2.1).

## 15. Achados das revisões e onde foram tratados (R2)

| Achado | Origem | Onde foi tratado |
|---|---|---|
| A1 regras do lançamento tratadas como "em vigor" | site | D4 respondida em 21/10: valem e aparecem (§11, §2, §3, §4) |
| A2 D2 enviesada | site | decisão 8 da tabela inicial; `rodadas_max` nulo (§2); D2 reescrita com o que vale hoje (§11) |
| A3 D1 (a) é contato do dono | site | D1 diz "exceção pequena"; nova (d) só a tela; e-mail exige pedir de novo (§11) |
| A4 sessão apagada no iPhone | site | três caminhos de volta (§1); `app.links_pedido` (§2); E2E (§12); (c) retirada (§11) |
| A5 3b-1 no ar antes da Cloudflare | site | "Mesclar não é ir ao ar" (§13); frases só quando verdade (§4) |
| A6 D3 coerente | site | mantida; nota "era recomendação da análise" (§11) |
| A7 toques do dono que continuam | site | decisão 1 da tabela inicial; §1 |
| A8 automação prometida | site | rotina da captação como dependência e passo manual (§6, §13, §14); resumo |
| S1 link de envio reusável por 2 h | site | §7 (só `reservado`, teto pelo tamanho real, reconciliação); §8; teste (§12) |
| S2 tamanho igual, truncado, logo, tipo declarado | site | tabela de camadas (§8); limites (§7); testes (§12) |
| S3 privacidade sem Anthropic; 90 dias × 5 anos | site | §10 (texto, troca do "90 dias", lista de terceiros); tarefa do dono (§11) |
| S4 `apikey`, prévia do projeto certo, CSP só de `/orcamento` | site | §7 `[conferir no plano]`; §8 |
| Viabilidade: subpedidos da rotina, `Buffer` | site | §9 |
| `[conferir]` Supabase 1 GB / 50 MB | site | confirmados (§7) |
| `[conferir]` R2 "forma de pagamento" | site | "assinatura do R2 pelo checkout" (§7) |
| `[conferir]` `Range` e validade do link | site | `Range` com teste real no plano; link 2 h sem uso único (§7) |
| C1 40% escrito à mão e 50 de reserva | site | §3 e §4 (percentuais da proposta, falha fechada, rascunho a 40); testes (§12) |
| C2 duas chaves para "só Pix" | site | `MP_METODOS` da A7 (§4, §13) |
| C3 prévia sem resposta | site | D5 respondida em 21/10: o projeto para, sem transição automática (§11, §2, §3) |
| C4 prazo vencido sem alerta | site | `prazo_vencido` (§2, §2.1) |
| C5 o que vai ao ar junto | site | §13 |
| Dados: limites são escolha do agente; "3 toques" | site | parágrafo "Números deste desenho…" (início); "estimativa" na D1 |
| Lista vazia: omitir o campo | captação | §3 e §6; teste (§12) |
| Prévia: `URL_PREVIA` | captação | §8; teste de igualdade (§12) |
| I1 `pedido.json` | captação | §6 |
| I2 duas fontes de preço e vagas | captação | §6; D6 (§11); §13, §14 |
| I3 JSON fora de `material/` | captação | pasta `pedido-site/` (§6) |
| "baixado" só depois da importação | captação | estado `importado` e comando `importado` (§2, §6, §10) |
| Prazo com duas contas | captação | §2.1 |
| `max_rodadas` | captação | `rodadas_max` = o mesmo número (§2); D2 (§11) |
| `textos.json`/`sobre` | captação | tirado do v1; versão 2 futura (§2, §13) |
| Desistência em dois lugares | captação | §5 |
| `material_dispensar` | captação | mantido; D4 respondida em 21/10, vale (§2) |
| R2-1 link do pedido trocava a cada uso | site, rodada 2 | link fixo durante o pedido; troca só em "Gerar um link novo" ou "Sair deste aparelho" (§1, §2 `app.links_pedido`, §8); teste (§12) |
| R2-2 reconciliação apagava envio em andamento | site, rodada 2 | poupa `reservado` com menos de 24 h; lista pelo banco (§7, §10); teste 1 h × 25 h (§12) |
| R2-3 pausa do prazo e "entrada fica" | site, rodada 2 | pausa do prazo vale pela D4 de 21/10 (§2.1, §3); "depois dos 7 dias, a entrada fica" saiu da D4 e vai no 3b-1 (§4, decisão de 11/10) |
| R2-4 código do link em `wa.me/?text=`; qual link no aviso | site, rodada 2 | "Mandar para mim" por `navigator.share` ou "Copiar" (§1, §3); aviso da D1 (a) com retomada de uso único e 7 dias, colado pelo dono, sem `?text=` (§1, D1); teste (§12) |
| R2-5 resumo esconde a produção manual por formato | site, rodada 2 | linha no resumo (loja, sob medida e saúde = produção manual); §6, §14 já diziam |
