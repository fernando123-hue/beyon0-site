# Métricas próprias (2026-10-06)

Pedido do dono: "uma forma mais específica de conseguirmos nossas próprias métricas, para resultados ainda mais precisos".

## O que é, em uma frase

O site mede a si mesmo, sem Google e sem cookies, e liga **cada conversa no WhatsApp à visita que a gerou**. Assim dá para saber quanto custou cada **cliente real** em cada origem, campanha e termo de busca, e não só o clique.

## Por que é mais preciso que o Google Analytics

| | Google Analytics / Ads | Métricas próprias |
|---|---|---|
| Quem conta | só quem aceita cookies | toda visita (sem cookie, sem IP) |
| Bloqueador de anúncio | bloqueia | não bloqueia (o envio vai para o próprio site) |
| O que conta como sucesso | clique no botão | conversa real e cliente fechado, com o valor |
| De onde veio o cliente | estimado | exato, pelo código na mensagem |
| Onde as pessoas desistem | genérico | seções vistas, rolagem, campo do formulário onde pararam |

## Como funciona

1. **Na visita** (`js/metricas.js`): cada aba ganha um código curto, por exemplo `K7Q4M`. O código some quando a aba fecha. O script anota a origem (anúncio, busca orgânica, rede social, WhatsApp, outro site, direto), a campanha e o termo do anúncio, o aparelho, as seções vistas, até onde rolou, o tempo com a aba à mostra, o botão clicado, o formulário e se o Ouro aconteceu. Tudo vai por `sendBeacon` para `/api/evento`.
2. **Na mensagem**: o texto pronto do WhatsApp passa a dizer "Oi! Vim pelo site da Beyon Zero (código K7Q4M) e…". Para tirar, use `codigoNaMensagem: false` em `js/metricas.js`. Sem o código, perde-se a ligação entre a conversa e a origem.
3. **No painel** (`/painel`, protegido por chave): quando a mensagem chega, procure o código e marque **Conversa**. Se fechar, marque **Cliente** e o valor. Se a pessoa pedir para apagar os dados, use **Excluir**. O painel mostra o funil inteiro (visitas, cliques, conversas, clientes), por origem, campanha, página de entrada, aparelho, botão e dia.
4. **De volta ao Google Ads**: o botão "Baixar o arquivo" gera o CSV de "importar conversões off-line" com os clientes que vieram de clique em anúncio, com o valor. O Google passa a otimizar para **cliente**, não para clique. O identificador do clique (gclid) só é guardado se a pessoa aceitou os cookies.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `js/metricas.js` | a coleta no navegador; `ativo: false` até o banco existir |
| `api/evento.mjs` | recebe os retratos de página; só do próprio site, só campos da lista fechada |
| `api/painel.mjs` | o resumo, a marcação de conversa/cliente e o CSV; exige a chave |
| `api/_valida.mjs` | a lista fechada de campos, tipos e tamanhos |
| `api/_resumo.mjs` | as contas do painel (função pura, testada) |
| `api/_banco.mjs` | Supabase por fetch, sem biblioteca; em memória no servidor local |
| `painel.html`, `painel.css`, `js/painel.js` | o painel, celular primeiro |
| `docs/metricas/esquema.sql` | as duas tabelas |
| `docs/testes/metricas.test.mjs` | `npm run testar` |

## Para ligar (uns 20 minutos)

Antes: os bloqueios de `docs/google-ads/README.md` seção 0 valem aqui também. O plano grátis da Vercel não permite uso comercial.

1. Crie uma conta no **Supabase** (plano grátis) e um projeto na região **São Paulo**.
2. No projeto, abra **SQL Editor**, cole `docs/metricas/esquema.sql` inteiro e rode.
3. Em **Project Settings › API Keys**, copie a **Project URL** e a chave **secret** (nunca a publishable/anon).
4. Gere a chave do painel. Ela precisa de pelo menos 32 caracteres aleatórios:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```

5. Na **Vercel › projeto › Settings › Environment Variables**, crie as três variáveis **só no ambiente Production**. Assim as prévias não sujam os números.
   - `SUPABASE_URL`: a Project URL.
   - `SUPABASE_CHAVE`: a chave secret.
   - `PAINEL_CHAVE`: a chave gerada no passo 4. Guarde num gerenciador de senhas.
6. Em `js/metricas.js`, troque `ativo: false` por `ativo: true`. Publique.
7. Abra `/painel` no seu celular e no seu computador e entre com a chave. Deixe marcado "Não contar as minhas visitas neste aparelho".

Nenhuma chave entra no código: as três ficam só nas variáveis da Vercel.

## A rotina (5 minutos por semana)

- Mensagem nova com código: marcar **Conversa**. Fechou: **Cliente** e o valor.
- Uma vez por semana, se houver anúncio rodando: baixar o CSV e importar no Google Ads. O caminho é **Metas › Conversões › Nova ação de conversão › Importar › CRMs, arquivos ou outras fontes › Acompanhar conversões de cliques**. Crie a ação "Cliente fechado" uma vez e depois só envie o arquivo. O Google aceita até 90 dias depois do clique.

## O que ler no painel

- **Taxa por origem**: quantas visitas de cada origem clicam para conversar. Anúncio com taxa muito abaixo da busca orgânica indica que o termo ou o anúncio atraem a pessoa errada.
- **Campanha · termo**: qual busca traz cliente. Termo com visitas e zero conversa vira palavra negativa no Ads.
- **Seções vistas**: a seção onde a porcentagem despenca é onde as pessoas desistem.
- **Formulário**: o campo onde quem desiste parou.
- **O Ouro**: a taxa de contato de quem viu o Ouro contra quem não viu. É a resposta medida para a dúvida dos 30 ou 42 segundos.
- **Pouco volume engana**: com menos de umas 100 visitas por origem, a diferença entre taxas ainda é ruído.

## Limites conhecidos

- **Visita é uma aba.** Quem volta outro dia conta como visita nova, porque não há cookie nem identificador permanente, de propósito.
- **O código pode ser apagado** pela pessoa antes de enviar. Nesse caso a conversa não se liga à origem.
- **Navegador sem `sendBeacon`** ou com o JavaScript desligado não é medido.
- **Robôs que se declaram** são descartados pelo navegador informado. Robô disfarçado pode entrar; tráfego estranho aparece como pico no "Por dia".
- **Endpoint público**: qualquer um pode mandar retratos falsos com um programa. Há três freios. Só passam campos da lista fechada; UTM com e-mail ou telefone é descartado. Cada IP pode mandar até 60 por minuto, por instância da função. O painel lê do mais novo para o mais velho, então lixo antigo não esconde dado novo. Para uma muralha de verdade, crie no **Firewall da Vercel** uma regra de limite para POST /api/evento, por exemplo 30 por minuto por IP.
- **Código ocupado**: um atacante que inventasse milhões de códigos poderia tomar o de uma visita real, e o contato dela se perderia. Com o freio por IP isso é impraticável; o risco foi aceito e fica registrado aqui.
- **Retenção**: páginas vistas e contatos que não viraram cliente, com mais de 400 dias, uns 13 meses, são apagados. A limpeza roda quando o painel abre e em 1 de cada 100 visitas, então acontece mesmo sem o dono abrir o painel. Quem virou cliente fica. O botão Excluir de cada contato apaga o registro a pedido da pessoa, como manda a LGPD.
- **Supabase grátis** pausa o projeto depois de 7 dias sem uso. Com visitas chegando, ele não para.

## Testar sem conta nenhuma

O servidor local responde `/api/*` com um banco em memória:

```bash
PAINEL_CHAVE=uma-chave-local-de-teste-com-24+ node docs/servidor.mjs . 8899
```

Troque `ativo` para `true` só na sua cópia local, navegue pelo site e abra `http://127.0.0.1:8899/painel.html`. Os testes ficam em `npm run testar`.
