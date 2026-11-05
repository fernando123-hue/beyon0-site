# Planta viva do produto do cliente (fatia 2 do painel da conversa): especificação

> Data: 2026-11-05. Autor: agente (sessão do site, enquanto o dono dorme). Ramo `planta-spec` (de `origin/main` = `a337d82`).
> Só documentação: nenhum código de produção foi escrito. O plano de execução está em `docs/superpowers/plans/2026-11-05-planta-viva.md`.
> Marcas usadas abaixo: **[D]** = decisão do dono (registrada em `01 Empresa/Decisões.md`, cofre, não neste repositório); **[A]** = decisão do agente, o dono pode mudar.

## 0. O que já está decidido e o que esta especificação decide

| Tema | Quem | O quê |
|---|---|---|
| Existe uma planta animada, única por cliente e nicho, na linguagem do site (escuro, ciano, traço de 1 px, "a luz passa e imprime") | [D] 04/11 | Não copiar o vídeo de referência; mostrar o MECANISMO (como o site trabalha sozinho), nunca promessa, número, preço ou prazo |
| O protótipo (`planta-lab`, commit `148deab`: 3 nichos, 3 topologias, ouro só no LED final, texto em HTML, sem blur) vale como está | [D] 05/11 | "ficou muito bom, gostei muito de tudo", inclusive o ponto dourado no final |
| Também um gráfico de leitura (radar "como lemos o seu caso") como o da parte final da conversa | [D] 05/11 (o agente entende assim; se for outro, o dono corrige) | Cada cliente com o seu, gerado do que ele escreveu, nunca copiado |
| O modelo devolve SÓ um plano em JSON validado por esquema; o código desenha tudo | [D] 04/11 (conduzido pelo agente com o dono) | Contrato da seção 2 |
| Todo o resto (momento, lugar, números, catálogo, eixos, medidas) | [A] | Esta especificação |

Regras permanentes que valem aqui (do `CLAUDE.md` e das memórias do dono): sem blur nem brilho difuso nem "tubo" de linhas empilhadas (uma linha só, com luz circulando); celular primeiro (390 e 320 px); nada de "tela de carregamento" (a própria página se move); não reinterpretar o que ele aprovou; voz humana em todo texto de cliente; ES5 no JS do site; CSP sem inline (`style-src 'self'`: nada de `style=""` nem `setAttribute('style')`; `el.style.x` por JS pode); zero invenção de dado.

## 1. O que o visitante vê

### 1.1 Em que momento da conversa

A planta nasce **depois que o Zero já entendeu o caso e antes de falar de valor**: negócio e objetivo conhecidos, formato escolhido (ou recomendado) e a pergunta da dor respondida (`situacao_atual` no briefing). Em código, é a condição de `prontoParaEstimar(briefing) && briefing.situacao_atual`, mais a etapa com preço aberto (`descoberta`, `estimativa` ou `contato`, pedido ainda não confirmado). Na prática: do 3º ao 5º turno.

- O Zero chama a ferramenta `desenhar_planta` uma vez e escreve **uma frase** no chat ("Desenhei como o seu site pode trabalhar, está logo abaixo."). Ele não descreve as etapas no texto: a planta é o conteúdo.
- Redesenho só quando a pessoa pede um ajuste ("quero cobrar um sinal") ou o caso muda de verdade. Teto: 4 versões por conversa [A].
- Depois que o pedido é confirmado (escopo e pagamento: "só dúvidas"), a planta fica como está, sem botões ativos (o briefing já fica congelado nessas etapas, e a ferramenta nem é oferecida).
- O radar (seção 3) aparece antes e muda a cada resposta; a planta só quando há matéria para 8 ou 9 etapas.

### 1.2 Onde fica

- **Faixa de largura total logo abaixo da mesa** (`.orc-mesa`: conversa + painel), antes dos blocos de ajustes e direções [A]. Motivo: a posição paisagem precisa de 760 px ou mais, e a coluna do painel tem 300 a 400 px.
- A coluna do painel (fatia 1) continua com "O que já anotamos", a ficha e, novo, o radar.
- No celular, a faixa vem depois do cartão de investimento. Para a pessoa não perder a planta: quando o plano chega, aparece **dentro da lista de mensagens**, abaixo da fala do Zero, um botão "Ver a planta do seu site" que leva até a faixa por rolagem suave (a página se move; não há cortina nem rótulo) [A].
- Sem JS a faixa não existe (a página inteira de orçamento depende de JS para conversar). Em `prefers-reduced-motion` ou com o interruptor "menos movimento" do site (`html.menos-movimento`): um quadro final, completo, sem movimento.

### 1.3 Como é e como se move (herdado do protótipo, sem reinterpretar)

Elementos: núcleo (Zero) à esquerda ou no topo; a chegada ("de onde a pessoa vem"); 8 a 9 caixas de estação com ícone em traço, número, verbo e título; rotas de 1 px com setas; LED final ("Objetivo"); legenda de leitura com a frase da estação acesa; botões "Está certo", "Quero ajustar algo" e "Rever a montagem".

Sequência (cerca de 7,6 s, a mesma do protótipo):

1. **Emaranhado** (0 a 1,6 s): um rabisco único do núcleo ao LED, para dizer "sem estrutura, o caminho de quem chega é um emaranhado". Semente do rabisco = hash dos ids do plano (cada cliente tem o seu rabisco).
2. **Esboço** (0,35 s em diante): as caixas surgem a 34% de opacidade e as rotas fantasma aparecem.
3. **A luz imprime**: uma cabeça de 16 px percorre cada rota na ordem do plano; ao chegar, a estação acende (opacidade, traço do ícone se desenha) e a legenda mostra "03 · Agenda" e a frase dela.
4. **Ouro só no LED**: ao chegar, o LED fica dourado (`--ouro-rgb`, já existente) com duas ondas de traço (anéis que crescem e somem: traço, não brilho). É o único ponto fora da paleta ciano [D].
5. **Vida**: depois de pronta, um pulso de luz percorre a rota a cada 6 s, só enquanto a faixa está na tela e a aba visível, por no máximo 60 s; volta com toque ou foco [A] (economia de bateria).
6. **Ajuste**: a pessoa escreve o que quer mudar; o Zero devolve um plano novo; a tela compara por `id` e anima só a diferença: estações movem de lugar (transform), a nova entra com a etiqueta "Ajustado" e cantos marcados, a luz percorre as rotas que a tocam. Plano sem ids em comum com o anterior: refaz a montagem inteira.

A animação começa quando 35% da faixa entra na tela (IntersectionObserver); se o plano chegou com a faixa fora da tela, espera. **Sem rolagem automática** [A]: o protótipo seguia a luz rolando a página no celular; isso briga com o dedo da pessoa e foi cortado. No lugar, a legenda de leitura fica **fixa na base da tela no celular** enquanto a planta está em vista (opaca, sem vidro fosco).

"Está certo" envia a mensagem "A planta está certa." pelo formulário normal da conversa (passa por todas as travas e segue o funil). "Quero ajustar algo" foca o campo de texto com a dica "Diga o que mudar na planta." [A]. Ambos desligados quando a conversa só aceita dúvidas.

### 1.4 Celular primeiro: a proposta concreta para a pendência "vertical e comprida"

O protótipo no celular tinha caixas de 80 a 98 px e vão de 30 px, o que dá cerca de 1.250 px para 9 etapas. Proposta, medida no PR 2b:

- Caixa de lado (ícone à esquerda, texto à direita) com **68 px** de altura, vão de **18 px** (passo de 86 px). Cabe porque o título tem no máximo 40 caracteres: 2 linhas a 13 px mesmo em 320 px (largura útil da caixa 180 px; 40 caracteres ≈ 264 px). A frase longa não fica na caixa: ela vai para a legenda.
- Altura total da planta com 9 etapas: **≤ 940 px em 390 px e ≤ 1.020 px em 320 px** (cerca de 1,4 tela). Hoje ≈ 1.250. Meta verificada por teste de geometria e por medição no navegador.
- Legenda de leitura fixa na base (acima).
- Sem rolagem automática; botão "Ver a planta do seu site" no chat.
- Alternativa descartada por enquanto: planta em folha de tela cheia ("bottom sheet") no celular. Zeraria o CLS e resolveria o comprimento, mas é uma camada que cobre a tela, parecida demais com o que o dono rejeitou como tela de carregamento. Fica anotada para o caso de a medição reprovar a proposta acima.

Paisagem (largura da faixa ≥ 760 px): altura **fixa de 456 px** para as três topologias; as folgas verticais são elásticas (laço natural ≈ 388, bifurca ≈ 420, espinha com satélites ≈ 504 no protótipo; o desenho se acomoda à altura reservada, nunca o contrário). **Achado:** o layout paisagem do protótipo foi calculado para 5 a 7 colunas e exige coluna ≥ 112 a 130 px; com 8 a 9 estações em linha, laço e espinha deixam de caber até em 1.280 px (cálculo: coluna ≈ 105 px em 1.280 px com 8 caixas, e o protótipo devolve `null`, caindo no retrato). Por isso o PR 2b leva uma nova disposição: **laço e espinha em duas fileiras** (laço como pista: ida em cima, volta embaixo, o anel fecha no núcleo; espinha com o tronco em duas fileiras e os satélites só nas pontas das fileiras). Bifurca cabe em linha (7 colunas). Isso é trabalho de desenho a aprovar nas capturas, não suposição.

### 1.5 Textos fixos da interface (escritos pelo código, não pelo modelo)

Título da faixa "A planta do seu site"; legendas "Chega", "Objetivo", "Ajustado"; botões; mensagem de status para leitor de tela ("Planta pronta, com 9 etapas."); e **duas notas de honestidade** [A]:

- Plano do modelo: "É o desenho do que o seu site pode fazer, a partir do que você contou. O que entra de fato é combinado no orçamento."
- Plano padrão: "Um desenho de exemplo para o seu tipo de negócio. Conforme você contar mais, o Zero refaz."

## 2. Contrato com o modelo

### 2.1 A ferramenta

`desenhar_planta` (nova, em `api/_vendas/consultor.mjs`, na lista de `todasAsFerramentas`). Oferecida só quando `precoAberto(etapa, pedidoStatus)` e a flag `BZ_PLANTA=ligada` está ligada [A] (mesmo padrão de `entregaLigada(env)`, `BZ_ENTREGA` em `api/_material/interruptor.mjs`: a `main` só vai para o staging; a produção é do dono). **Não mexe no prompt de sistema**: ele está em 26.985 de 27.000 caracteres (limite testado em `consultor.test.mjs` e `zero.test.mjs`). O "quando" vai no `proximoPasso` (texto dinâmico do turno, fora do limite) e o "como" na descrição e no esquema da ferramenta.

O resultado da chamada, devolvido ao modelo: `{ ok: true, na_tela: true, etapas: N }` ou `{ ok: false, erros: ["etapa 3: título com 47 caracteres (máx 40)", ...] }` para ele corrigir **uma vez** no mesmo turno (cada tentativa consome uma volta de `MAX_ITERACOES`, que sobe de 4 para 5). Segunda falha: o servidor grava o **plano padrão do nicho** e devolve `ok: true` ao modelo, sem erro para o visitante.

### 2.2 O plano (JSON, esquema fechado, sem campo extra)

```
plano = {
  topologia: "laco" | "bifurca" | "espinha",
  chegada:   { origens: [origem x 1..4, sem repetir], titulo, frase },
  etapas:    [ etapa x 7..8 ],            // 1 chegada + 7 ou 8 = 8 ou 9 caixas
  fim:       { titulo, frase },           // o LED: o "Objetivo"
  fecho:     frase,                       // aparece quando a luz termina
  rotulo_retorno: texto <= 28             // só no laço
  rotulos_ramos:  [texto <= 28, texto <= 28]   // só na bifurca
}
etapa = { id, tipo, verbo, titulo, frase,
          decisao?: bool,                 // no máximo uma (a conversa que decide o caminho)
          ramo?: 0 | 1,                   // só na bifurca
          satelite_de?: id, lado?: "cima" | "baixo", laco?: bool,   // só na espinha
          retorno?: bool }                // só no laço, na última etapa
```

- **`topologia`**, lista fechada, as três do protótipo: `laco` (o fim volta ao começo: a clínica), `bifurca` (a conversa decide e a rota se divide e se junta: a fábrica), `espinha` (um tronco com satélites e, no máximo, um laço curto: a loja). Quem acrescentar topologia nova acrescenta layout, teste de geometria e entrada nesta lista; o modelo nunca inventa uma.
- **Regras por topologia** (validadas no servidor e de novo na tela): laço = todas em sequência, a última com `retorno: true`; bifurca = etapas de entrada (sem `ramo`; a última com `decisao: true`), 1 a 2 etapas no `ramo` 0, 1 a 2 no `ramo` 1, 1 a 2 de saída (sem `ramo`); espinha = 4 a 5 etapas de tronco e 2 a 4 satélites, cada `satelite_de` apontando para uma etapa de tronco, no máximo um satélite por etapa, no máximo um `laco: true`.
- **`tipo`**: catálogo fechado de ícones (anexo A). O modelo escolhe pelo significado; o código desenha. Tipo fora da lista invalida o plano.
- **`verbo`**: lista fechada de uns 30 verbos de uma palavra (Recebe, Mostra, Conduz, Decide, Agenda, Lembra, Cobra, Calcula, Levanta, Combina, Propõe, Retoma, Reativa, Mede, Convence, Reúne, Avisa, Escolhe, Confirma, Responde, Registra, Organiza...). Fecha mais um canal de texto livre.
- **`origens`**: lista fechada (`busca`, `mapa`, `indicacao`, `rede`, `anuncio`, `direto`, `email`); só o número delas desenha o ícone de chegada.
- **`id`**: `^[a-z0-9-]{2,24}$`, único. O modelo é instruído a **manter os ids** das etapas que não mudam ao redesenhar (é o que permite animar só a diferença).
- **Tamanhos** [D no que o dono pediu; A nos demais]: título 3 a 40 caracteres, frase 20 a 110, rótulos até 28. 8 ou 9 caixas no total. O plano inteiro serializado ≤ 8 KB. O validador **rejeita** o que passa do limite (cortar no meio da frase faria uma frase torta) e o erro volta ao modelo para ele refazer.

Os textos são em português do Brasil, na voz da Beyon ("a gente"), terceira pessoa para a pessoa que chega ("A pessoa escolhe o horário"), presente do indicativo, sem jargão, sem lista de recurso. A descrição da ferramenta leva três exemplos completos (os três nichos do protótipo, já reescritos nas regras desta seção).

### 2.3 O que é PROIBIDO em qualquer texto do plano

Número (qualquer dígito, `%`, `R$`), preço e custo (preço, valor, custo, barato, grátis, desconto, taxa), prazo (prazo, imediat-, instantâne-, "em minutos/segundos/horas", "mesmo dia", dias, semanas, meses), numerais por extenso de dois em diante (um e uma passam: "em um toque"), marca e nome de terceiro (heurística: palavra com inicial maiúscula no meio da frase, fora o nome do negócio que a própria pessoa deu e a lista curta permitida `Pix`; mais lista de plataformas conhecidas, também em minúsculas), promessa de resultado ou garantia (enche, lota, dobra, aumenta, mais clientes/vendas/pedidos/agendamentos, vende sozinho, sem esforço, garant-, certeza, resultado, lucro, faturamento), URL, e-mail, telefone, markdown, emoji, ordem ao sistema (ignore, desconsidere, instrução, prompt, regras), negar ser IA, e, em nicho regulado, depoimento e "antes e depois".

**Medido hoje (esta sessão, rodando os 53 textos do protótipo e frases ruins pelas travas existentes):** as travas atuais pegam resultado óbvio ("Dobra as vendas", "Aparece em primeiro no Google"), garantia, suporte contínuo e preço com número, e **deixam passar** "Enche a agenda da clínica toda semana", "Entrega em dois dias úteis", "Vende sozinho e sem esforço", "Mais clientes todo mês", "sem taxa" e "Faixa de preço pela tabela" (sem número). Nos textos limpos do protótipo, as travas de resultado, garantia, suporte, mensalidade, desconto, recado e identidade tiveram **0 falso positivo em 53**; o detector de injeção (`pareceInjecao`, feito para texto do visitante) deu 1 em 53 ("...procurando um tipo de embalagem ou por indicação...") e por isso **não é usado** no plano. Conclusão: as travas existentes são a primeira camada; o plano tem uma **lista própria, mais dura** (acima), porque aqui o custo de um falso positivo é só cair no plano padrão. O título do protótipo "Faixa de preço pela tabela" é reescrito nos dados de teste (por exemplo "Medida de catálogo, com a tabela da fábrica", sem a palavra preço) e todos os dados de teste têm de passar no validador (teste do PR 2a).

### 2.4 O que o servidor faz com o plano (nunca lança, nunca devolve erro ao visitante)

`validarPlano(bruto, { nomeDoNegocio, regulado }) -> { ok: true, plano } | { ok: false, motivos: [código, ...] }`, em `api/_vendas/planta-esquema.mjs`, nesta ordem:

1. É objeto simples, ≤ 8 KB, sem chave de protótipo (`__proto__`, `constructor`, `prototype`), sem chave fora do esquema (por consulta a chave PRÓPRIA, como o painel da fatia 1).
2. Tipos, listas fechadas (`topologia`, `tipo`, `verbo`, `origem`), contagens por topologia e total de 8 ou 9.
3. Limpeza do texto (controles, `<` `>`, invisíveis, normalização, espaço simples) e comprimentos.
4. `id` com a forma certa, único; títulos distintos entre si.
5. Cada texto: lista própria da seção 2.3 + as travas existentes (`semPromessaDeResultado`, `semGarantia`, `semPromessaDeSuporte`, `semMensalidadeDoAtendente`, `semPromessaDeDesconto`, `semNegarSerIA`, `semPromessaDeRecado`, `semPrecoNoTexto`, `semPromessaDePagamento`, `textoProibido` em nicho regulado): se qualquer uma **muda** o texto, o plano é rejeitado inteiro (não adianta trocar uma etapa pela frase fixa da trava: ela é longa e quebra o desenho).

Falhou: o código tenta devolver os erros ao modelo uma vez; falhou de novo ou o modelo nunca chamou depois de ser mandado: **plano padrão do nicho** (seção 2.5), gravado com `origem: "padrao"`. Plano válido: gravado com `origem: "modelo"`.

### 2.5 Plano padrão por nicho

Dados fixos em `api/_vendas/planta-padrao.mjs`, escritos à mão (com a skill `voz-humana`) e passando pelo mesmo validador. Chave pelo texto de `negocio.segmento` e `negocio.descricao` normalizado (`paraBusca`), por palavras fechadas; ambíguo ou desconhecido cai em `generico` (precisão antes de alcance). Oito planos [A]:

| Chave | Exemplos de negócio | Topologia |
|---|---|---|
| `saude_agenda` | clínica, consultório, estética, psicologia (nichos de `nichoRegulado`) | laço |
| `servico_agenda` | salão, barbearia, estúdio, personal, pet | laço |
| `servico_orcamento` | reforma, marcenaria, serralheria, instalação, limpeza | bifurca |
| `industria_b2b` | indústria, atacado, distribuidora, embalagens | bifurca |
| `loja_online` | moda, varejo, produtos, e-commerce | espinha |
| `alimentacao` | restaurante, confeitaria, delivery | espinha |
| `educacao` | cursos, escola, aulas | laço |
| `generico` | qualquer outro, ou ambíguo (advocacia é regulada: entra por `nichoRegulado` e usa um plano sem promessa, o `generico` escrito dentro das regras de regulado) | laço |

### 2.6 Onde o plano mora

No `briefing` (jsonb, limite do banco de 64 KB), sob a chave `planta` (`{ v: 1, versao, origem, plano }`), **sem migration**. Só a ferramenta, depois do validador, escreve nessa chave: a ferramenta `atualizar_briefing` descarta chave desconhecida (`limparAtualizacao`) e `mesclar` não é usada para ela. Consequências tratadas no PR 2a: (a) `briefingDelimitado` do gerador das três direções passa a tirar `planta` e `leitura` (senão iriam no prompt do gerador); (b) `estadoParaModelo` mostra ao modelo uma versão compacta (ids, tipo e título, uns 400 caracteres) para ele poder ajustar sem reescrever tudo; (c) `briefingSemProibidos` continua valendo; (d) nas etapas "só dúvidas" o briefing não muda (já é assim no banco). A leitura (`GET estado`) devolve `planta` **revalidada** a cada resposta, como o painel da fatia 1: se o validador ficar mais rígido amanhã, um plano antigo guardado vira plano padrão em vez de aparecer.

## 3. O gráfico de leitura: radar "Como lemos o seu caso"

### 3.1 O que ele é (e o que não é)

O radar mostra **o que a pessoa disse** sobre cinco assuntos, não uma nota do negócio dela. Um eixo baixo quer dizer "ela ainda não falou disso", nunca "isso é pouco no negócio dela". É a leitura do Zero, e muda a cada resposta, como na referência do dono. Sem número, sem porcentagem, sem comparação com outros negócios, sem promessa.

### 3.2 Eixos

Os da foto de referência, que o dono já tinha fixado em 04/11 [D], relidos como leitura (rótulos fixos, escritos pelo código):

| Eixo | O que o Zero procura no que a pessoa disse |
|---|---|
| Volume | quanta procura ou movimento ela disse ter |
| Repetição | tarefas e perguntas que se repetem |
| Urgência | pressa que ela mostrou |
| Depende de pessoas | quanto do atendimento hoje depende de alguém estar ali |
| Informação espalhada | onde estão os dados dela (caderno, mensagens, planilhas, cabeça) |

Cada eixo tem três níveis, em palavras: **"não falou"**, **"comentou"**, **"deixou claro"**. No desenho: raio 0,15 / 0,5 / 0,85 do raio externo (o mínimo não é zero, para o polígono nunca sumir). Acessível: uma lista `<dl>` com o eixo, o nível por extenso e a evidência.

Alternativa registrada e não escolhida [A]: eixos de "cobertura" (de onde vêm, o que quer, o que se perde, o que vende, como fecha, prazo), calculados só do briefing. Mais fácil de validar, mas o dono já fixou os eixos da foto; fica como plano B se a rodada real mostrar o modelo inflando os níveis.

### 3.3 Como o modelo preenche

Ferramenta `ler_caso` (nova, pequena, chamável a cada turno que trouxe informação nova):

```
leitura = { eixos: [ { eixo: "volume"|"repeticao"|"urgencia"|"pessoas"|"informacao",
                        nivel: "nao_falou"|"comentou"|"deixou_claro",
                        evidencia?: texto <= 60 } x 5 ] }
```

A descrição da ferramenta manda: nível só pelo que a PESSOA escreveu; "deixou claro" só quando ela disse com as palavras dela; evidência é um trecho curto, em palavras da própria pessoa; sem número; na dúvida, "comentou"; sem nada, "nao_falou" e sem evidência.

### 3.4 Como o código valida (o código só rebaixa, nunca eleva)

1. Esquema fechado: exatamente os 5 eixos, sem repetir, `nivel` na lista, `evidencia` ≤ 60.
2. **Evidência ancorada:** ao menos metade das palavras de conteúdo (4 letras ou mais, normalizadas) da evidência tem de aparecer nas mensagens do VISITANTE da conversa. Senão a evidência é descartada e o nível cai para no máximo "comentou".
3. Mesma lista de proibições da seção 2.3 e as mesmas travas. Número na evidência: descartado (mesmo que a pessoa o tenha dito: o radar não repete número, para não virar prova de desempenho).
4. `deixou_claro` sem evidência válida cai para `comentou`. `comentou` sem nenhuma palavra da pessoa que sustente o eixo cai para `nao_falou`.
5. Em nicho regulado, a evidência com depoimento ou "antes e depois" é descartada.

Guardado em `briefing.leitura` (`{ v: 1, eixos }`), revalidado na leitura do estado. A tela valida de novo o formato e desenha tudo por `textContent`.

### 3.5 Desenho

SVG de pentágono com 3 anéis (raios dos níveis), 5 raios, polígono de 1,5 px em ciano com preenchimento chapado de 10% de opacidade (cor lisa, sem gradiente nem desfoque; a validar nas capturas; se o dono achar "mole", fica só o contorno). Rótulos dos eixos em HTML ao redor, dois linhas no máximo, mínimo de 11 px. Ao mudar, os vértices se movem em 450 ms (interpolação dos 5 pontos por `requestAnimationFrame`, custo desprezível; em movimento reduzido, salta). Altura fixa de 300 px em 390 px (reservada pela mesma função de altura da planta). Fica na coluna do painel, abaixo de "O que já anotamos".

## 4. Honestidade, segurança, acessibilidade, desempenho

### 4.1 Honestidade

- A planta descreve o que "um site bem estruturado pode fazer", não o que está no pacote contratado: por isso as duas notas fixas da seção 1.5, a proibição de número/preço/prazo/resultado e a regra de que o escopo e o valor continuam vindo só do motor de preço e da tela de escopo.
- Etapas como lembrete automático, cobrança de sinal ou carrinho podem estar fora do que a tabela entrega hoje. Na primeira versão a salvaguarda é a nota; uma etiqueta "combinar no orçamento" por tipo (usando `fora_do_automatico` da tabela ativa) fica como melhoria de uma 2ª rodada [A].
- O Zero continua sendo uma IA que não nega ser IA (`travas-identidade.mjs` roda nos textos da planta).
- Nicho regulado: sem depoimento nem "antes e depois", sem promessa de resultado de tratamento; o plano padrão `saude_agenda` é escrito dentro disso.

### 4.2 Segurança

- **XSS:** todo texto do modelo entra por `textContent`; `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` e `new Function` ficam proibidos nos módulos da planta, **com teste que lê o código e falha** se aparecerem. O SVG é criado por `createElementNS` com atributos que só recebem números finitos, constantes do código e `d` gerado pelo código; o `id` da estação só vai para `data-id` depois do formato `^[a-z0-9-]{2,24}$` e nunca para seletor sem `CSS.escape`.
- A tela valida o formato de novo (não confia no servidor), como `js/orcamento-painel.js`. O validador da tela é a versão leve (forma, listas fechadas, limites, limpeza); as travas de texto são só do servidor. Um teste de paridade confere que os dois aceitam e rejeitam os mesmos casos de forma.
- CSP: nada de `style=""` nem `setAttribute('style')`; posição por `el.style.left/top` e atributos SVG.
- O plano passa por `redigir` indiretamente (o que o modelo lê já vem sem telefone, e-mail ou documento) e o validador rejeita telefone, e-mail e URL na saída.
- Orçamento de custo: uma chamada de plano tem uns 600 tokens de saída; teto de 4 versões por conversa e as travas de custo existentes (`TETOS.conversa_usd`, `TETOS.dia_usd`) continuam valendo. Sem endpoint novo: a planta viaja no `estado`.
- Métrica sem texto do visitante: uma linha de log JSON (`origem`, `versao`, códigos de motivo, como o log de `api/vendas.mjs`). **Não** há evento novo no banco: `app.vendas_registrar_evento` só aceita `ia_falhou` e `tentativa_bloqueada` (conferido em `supabase/migrations/20261007120100_vendas_funcoes.sql`), e abrir um tipo novo pede migration; fica para depois, se a rodada real mostrar que o log não basta.

### 4.3 Acessibilidade

- O texto é HTML: a lista `<ol>` ordenada pela ordem da luz (`ord`) é o conteúdo; o SVG é `aria-hidden`; ícones e rotas são decorativos (a informação está no texto, então o contraste de 3:1 dos gráficos não é exigido, mas o traço aceso mantém ≥ 3:1 mesmo assim).
- Uma região `role="status"` anuncia só no fim: "Planta pronta, com 9 etapas." A legenda animada é `aria-hidden` (se anunciasse cada frase, o leitor de tela falaria por cima dele mesmo).
- `prefers-reduced-motion: reduce` e `html.menos-movimento`: quadro final imediato, sem ondas, sem pulso, sem emaranhado; o ouro fica estático.
- Botões ≥ 44 px de alvo, foco visível, ordem de tabulação: botões depois da lista; tudo por teclado.
- Texto: contraste pelos tokens do site (`--t1`, `--t2`); ouro no preto 12,7:1.

### 4.4 Desempenho

- **CLS** (pendência nº 1: o protótipo media 0,17 a 0,36). Causas prováveis a CONFIRMAR no 1º passo do PR 2b com `layout-shift` e as fontes dos deslocamentos (hipóteses, não fato): altura da área definida por JS depois de medir a largura; bloco que sai de `hidden` empurrando o resto; legenda de leitura com altura variável. **Meta: delta de CLS (com planta menos sem planta) ≤ 0,01 nos 3 nichos, em 390, 320 e 1.280 px, e deslocamento 0 px do elemento seguinte quando o plano chega.** Como: (1) altura da área vem de uma função pura `alturaReservada(largura)` (paisagem fixa em 456 px; retrato por largura, com 9 etapas), e o desenho se acomoda a ela; (2) caixas e rótulos com posição absoluta dentro de área de tamanho fixo, então o texto trocando de fonte não muda o layout; (3) legenda com `min-height` de 4 linhas (a frase tem no máximo 110 caracteres); (4) inserção por regra: o degrau A é inserir a faixa quando o plano chega (nada de altura animada); se a medição passar de 0,02, o degrau B abre a área já reservada no instante em que a pessoa envia a primeira mensagem (o deslocamento fica dentro de 500 ms de uma ação dela, que o navegador não conta) e a preenche quando o plano chega. O PR 2c decide A ou B pelo número medido.
- **CPU no celular:** sem GSAP nesta página (a página de orçamento não o carrega; +70 KB e custo à toa). Animação por Web Animations API (`Element.animate` em `stroke-dashoffset`, opacidade e transform) com uma linha do tempo própria e curta; sem a API, quadro final. No máximo 2 rotas animadas ao mesmo tempo; nada de `getPointAtLength` em laço (o `CLAUDE.md` já aponta tarefa longa de 400 ms); `getTotalLength` uma vez por rota na montagem. Metas, no estrangulamento de CPU de 4x do Chrome: montagem (DOM + layout + SVG) ≤ 120 ms e nenhuma tarefa longa (> 50 ms) durante a entrada; DOM do quadro ≤ 450 nós; TBT da página com a planta no máximo +50 ms sobre a página sem ela. O headless desenha por software: serve para comparar, não para fps de aparelho.
- **Bytes:** JS da planta ≤ 20 KB comprimido, **carregado sob demanda** (um carregador de menos de 1 KB injeta `js/planta-*.js` quando o 1º plano chega), então a página de orçamento não paga nada antes disso.
- **ES5:** `var`, `function`, nada de `=>`, `const`, `let`, template string, classe, desestruturação, `Object.values`, `padStart`. O protótipo está em ES6 e é portado; um teste lê os arquivos e recusa a sintaxe nova.

## 5. NÃO-objetivos

- Não é cenário ilustrado do cliente (fábrica, engrenagens, pilha de documentos): a spec de 04/11 desse "cenário em 3 zonas" foi superada pelo dono; os quadros "O cenário / O que trava / Onde quer chegar" **não** entram agora.
- Não promete resultado, não mostra número, preço, prazo, nome de terceiro; não substitui o escopo nem o preço do motor.
- Não é editor: a pessoa não arrasta caixas; ajusta pela conversa.
- Sem WebGL, sem canvas, sem GSAP nesta página, sem som novo, sem biblioteca nova, sem endpoint novo, sem tabela nova.
- Sem planta para quem já confirmou o pedido (briefing congelado).
- Não gera ícone por IA nem aceita SVG do modelo.
- Não é página pública de venda (a vitrine de Sites/Início usa as próprias peças); isto é só a conversa de orçamento.

## 6. Riscos e perguntas

| Risco | Gravidade | Resposta |
|---|---|---|
| A planta insinua função que o pacote não entrega (lembrete, sinal, carrinho) | Média | Nota fixa; proibição de número/preço; etiqueta por tipo numa 2ª rodada. Pergunta ao dono quando ele voltar |
| O modelo erra o formato com frequência e vira quase sempre plano padrão | Média | Esquema na ferramenta, exemplos na descrição, uma volta de correção; medir `origem` nos eventos; se > 30% padrão na rodada real 8, simplificar o esquema |
| Layout paisagem com 8 a 9 estações não cabe | Alta, mas conhecida | Duas fileiras para laço e espinha (seção 1.4), com teste de geometria em 7 larguras |
| CLS volta a passar da meta | Alta, era a pendência nº 1 | Medição antes de desenhar, degrau A/B da seção 4.4, teste automático com limite |
| Falso positivo da lista dura corta planos bons | Baixa | Custo é cair no plano padrão; contar `motivos` nos eventos e afinar |
| Briefing cresce (64 KB) | Baixa | Plano ≤ 8 KB, 1 plano e 1 leitura por conversa |
| Prompt de sistema no limite | Já resolvido | Nada entra nele |
| Ouro fora da paleta | Resolvido pelo dono (05/11) | Fica |
| Radar lido como "nota do negócio" | Média | Rótulos de nível em palavras, título "Como lemos o seu caso", legenda "é o que você contou, não uma nota", eixo baixo = "não falou" |
| Repositório público | Média | Nenhum nome de cliente real, marca de terceiro, segredo ou estratégia em dados de teste (os 3 nichos são genéricos); lista de plataformas bloqueadas usa só nomes que o código já cita |

**Perguntas que de fato bloqueiam o dono: nenhuma.** Decisões para ele revisar quando acordar, todas com padrão já escolhido: (1) a planta fica numa faixa larga abaixo da conversa; (2) no celular, texto de apoio fixo na base e botão "Ver a planta" no chat; (3) as notas de honestidade da seção 1.5; (4) eixos do radar como leitura do que ele disse (e não nota do negócio); (5) laço e espinha em duas fileiras no computador.

## Anexo A. Catálogo de tipos de estação (v1)

Do protótipo (20): `chegada`, `pagina`, `conversa`, `agenda`, `lembrete`, `retoma`, `sinal`, `vitrine`, `cabide`, `produto`, `guia`, `carrinho`, `pagamento`, `caixa`, `tabela`, `briefing`, `amostra`, `proposta`, `acabamento`, `aviso`. (`chegada` só pela chave `chegada`, não como etapa.)

A desenhar no PR 2b (9 novos, para cobrir os oito planos padrão sem forçar ícone errado): `formulario`, `mapa`, `galeria`, `catalogo`, `cardapio`, `aula`, `documento`, `confirmacao`, `mensagem`. Total de 28 tipos de etapa (19 do protótipo + 9). Cada ícone: grade de 40 x 40, só traço, destaque em traço mais claro, sem preenchimento nem desfoque; teste que confere que toda entrada do catálogo tem desenho e que todo desenho está no catálogo.

## Anexo B. Exemplo mínimo de plano válido (laço, clínica, 8 caixas)

```json
{ "topologia": "laco",
  "chegada": { "origens": ["busca","mapa","indicacao"], "titulo": "Busca, mapa e indicação",
               "frase": "A pessoa chega pela busca, pelo mapa ou porque alguém indicou." },
  "etapas": [
    { "id": "pagina", "tipo": "pagina", "verbo": "Recebe", "titulo": "Uma página para cada tratamento", "frase": "Cai na página do tratamento que procurava, com a resposta que quer ler primeiro." },
    { "id": "conversa", "tipo": "conversa", "verbo": "Conduz", "decisao": true, "titulo": "Pergunta o que incomoda e a urgência", "frase": "A conversa entende o que incomoda e quão urgente é, sem formulário." },
    { "id": "horario", "tipo": "agenda", "verbo": "Agenda", "titulo": "Escolhe o horário da avaliação", "frase": "Mostra só os horários livres e a pessoa escolhe um ali mesmo." },
    { "id": "confirma", "tipo": "confirmacao", "verbo": "Confirma", "titulo": "Confirmação na hora da marcação", "frase": "Assim que marca, a pessoa recebe a confirmação com endereço e como chegar." },
    { "id": "vespera", "tipo": "lembrete", "verbo": "Lembra", "titulo": "Lembrete na véspera", "frase": "Na véspera chega o lembrete, para a pessoa não esquecer a hora." },
    { "id": "pos", "tipo": "mensagem", "verbo": "Responde", "titulo": "Dúvidas depois da consulta", "frase": "Quem ficou com dúvida volta à conversa e encontra a resposta." },
    { "id": "revisao", "tipo": "retoma", "verbo": "Reativa", "retorno": true, "titulo": "Volta sozinho na hora da revisão", "frase": "Chegou a época da revisão: o site chama a pessoa de volta." } ],
  "fim": { "titulo": "Avaliação marcada", "frase": "A avaliação entra na agenda da clínica sem ninguém ter atendido." },
  "fecho": "A pessoa chegou, foi entendida, marcou e vai ser lembrada. A clínica entra só no dia.",
  "rotulo_retorno": "o site continua" }
```

(O exemplo usa `confirmacao` e `mensagem`, tipos novos do PR 2b. A frase "sem ninguém ter atendido" é a do protótipo e precisa de olho da voz-humana: afirma automação total, e a nota fixa cobre.)
