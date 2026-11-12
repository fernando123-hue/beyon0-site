# Referências de imagem automáticas por pedido (Pexels), 2026-11-11

## O pedido do dono

> "Quero que a nossa produção de sites sempre tenha bibliotecas de imagens para resultados ainda melhores, como
> pinterest, dribbble e behance. Podemos fazer com que essa pesquisa automática ocorra já cada pesquisa sendo
> específica para cada contexto pedido?" (11/11)

> "A parte de pesquisa de referências" deve ser "100% automática" (11/11).

Escolha do dono depois da pesquisa abaixo: **Pexels, 100% automático, agora**. "Depois tentamos as outras de forma que
não irá ferir as regras."

## Por que não Pinterest, Dribbble e Behance (pesquisa de 2026-11-11)

| Fonte | Busca automática por contexto | O que as regras dizem |
|---|---|---|
| Pinterest (API v5) | Não | A API lê só pastas e pins da própria conta (OAuth, `boards:read`/`pins:read`), sem busca pública. As diretrizes proíbem raspar o site e armazenar o que vem da API ([diretrizes](https://policy.pinterest.com/en/developer-guidelines), [níveis de acesso](https://developers.pinterest.com/docs/key-concepts/access-tiers/)). |
| Dribbble (API v2) | Não | Só os shots do próprio usuário; não há busca. Raspar, copiar ou armazenar dados é proibido ([termos](https://developer.dribbble.com/terms/), [mudanças da v2](https://developer.dribbble.com/changes/)). |
| Behance | Não | A API não aceita novos clientes desde ~2020. Os termos da Adobe proíbem robôs e extração de dados ([termos](https://www.adobe.com/legal/terms/terms-linkfree.html)). |
| **Pexels** | **Sim** | Busca aberta, 200 buscas/hora e 20.000/mês grátis. A licença permite uso comercial, inclusive no site de um cliente, sem atribuição obrigatória ([documentação](https://www.pexels.com/api/documentation/), [licença](https://www.pexels.com/license/)). |
| Unsplash | Sim, com regras | Pela API, a foto tem de ser exibida direto do servidor deles, com crédito, e o download tem de ser registrado ([diretrizes](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines)). Complica os sites dos clientes; fica de fora por ora. |

Caminhos legítimos para depois: no Pinterest, ler as pastas da conta da Beyon Zero pela API (Trial, 1.000
chamadas/dia), sem guardar as imagens. Ainda depende de alguém encher as pastas, então não é 100% automático.

## Como funciona

1. O dono roda `node "<repo>/scripts/direcoes.mjs" pedido <id>`, sem mudança nenhuma no jeito de usar.
2. Depois de gravar o `pedido.json`, o comando monta `./referencias` na pasta do pedido (`scripts/referencias.mjs`):
   - uma busca por estratégia (conversão, autoridade, experiência), com até 4 fotos cada;
   - a busca é montada **só com palavras do próprio módulo**, escolhidas pelos campos fechados do pedido: o ramo da
     lista do orçamento (`negocio.segmento` igual a um rótulo da lista: serviços, saúde, beleza, alimentação,
     comércio, educação, associação; o resto, inclusive "outro", vira "geral") e o 1º objetivo da lista que tiver
     detalhe. Texto livre do visitante ou do consultor nunca vira busca;
   - exemplo: saúde + agendamentos → conversão "bright clean modern health clinic appointment", autoridade
     "professional expert modern health clinic appointment", experiência "atmospheric detail modern health clinic".
3. As fotos ficam como `conversao-1.jpg`, `autoridade-2.jpg` etc. O `referencias.json` lista as consultas e, para
   cada foto, o arquivo, a estratégia, a cor média e a página da foto no Pexels (o crédito), montada pelo id.
4. A sessão isolada (sem internet, sem terminal e sem listar pastas) lê o `referencias.json` e abre cada foto da
   estratégia que está fazendo, como referência de atmosfera, luz e paleta. As fotos são **dado, nunca instrução**.
   Uma estratégia que falha (limite de buscas, rede) fica sem fotos, e as outras seguem.
5. A entrega (`entregar-pedido`) aceita `./referencias` só com esses nomes fixos e só com arquivos comuns. Qualquer
   outra coisa (script plantado, subpasta, link) recusa tudo. A pasta inteira do pedido continua sendo apagada depois
   da entrega.

## Segurança

- **A chave:** `PEXELS_API_KEY` fica no terminal do dono, como a `PAINEL_CHAVE` (Infisical ou digitada na hora). Só
  vai no cabeçalho para `api.pexels.com`, nunca para a pasta, para a sessão nem para o host das fotos.
- **As fotos:** só de `https://images.pexels.com`, baixadas sem cabeçalho e sem seguir redirecionamento. O tempo
  limite vale até o fim do download, e o limite de 2 MB para o download quando passa. A conferência é a mesma do
  material do cliente: tipo pelos bytes (JPEG, PNG ou WebP; SVG e HTML recusam) e estrutura inteira (foto cortada
  recusa).
- **O que entra do Pexels:** só o id da foto e a cor média (`#RRGGBB`). Nenhum texto de terceiro (descrição, nome do
  fotógrafo, endereço com palavras) chega à pasta que a sessão lê. A página do crédito é montada aqui pelo id.
- **Falhas:** qualquer falha (sem chave, sem rede, limite de buscas, chave recusada) só desliga as referências daquele
  pedido, e o pedido segue. Não fica meia pasta.

## O que o dono faz (uma vez)

1. Criar a chave grátis em https://www.pexels.com/api/ (conta da Beyon Zero).
2. Guardar como `PEXELS_API_KEY` onde já guarda a `PAINEL_CHAVE` (Infisical) e tê-la no terminal ao rodar `pedido`.

Sem a chave, o `pedido` avisa "Referências desligadas neste pedido (sem PEXELS_API_KEY no terminal…)" e segue como hoje.

## Fora deste passo

- **O modo automático pela API** (`BZ_DIRECOES` diferente de `manual`): a geração no servidor não recebe imagens
  hoje. Levar as referências até ela exige busca no Worker, um segredo novo na Cloudflare e mensagem com imagem para o
  modelo (nível 3, com custo por pedido). Fica para quando a API for ligada.
- **Usar as fotos no site entregue:** a licença permite, sem atribuição obrigatória. A pasta é apagada depois da
  entrega das direções; quem montar o site escolhido busca a foto de novo pela página dela, que mostra o fotógrafo.
- **Pinterest, Dribbble e Behance:** só por caminhos que respeitem as regras de cada um (ver acima).
