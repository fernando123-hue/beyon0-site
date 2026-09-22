# Beyon Zero — instruções para o agente

## Revisar é parte de terminar, não um extra

**Rode o revisor de código antes de considerar qualquer trabalho pronto** — de
forma casual e frequente, não só em entrega grande. O que ele deve olhar:
estrutura, organização, otimização e se o código faz sentido.

```
/code-review
```

Vale para: código novo, refatoração, e qualquer lote que tenha crescido durante
a conversa. Se a revisão apontar algo, corrija antes de dizer que acabou.

## Ver o site rodando antes de dizer que está pronto

```bash
npx --yes http-server -p 8080 -c-1 -a 127.0.0.1 &
npm install
CHROMIUM=/opt/pw-browsers/chromium npm run verificar
```

`docs/verificar.mjs` abre as páginas num navegador de verdade e reporta fps,
rolagem lateral, links de WhatsApp montados e erros de console. Nove bugs de
render saíram dele — nenhum visível na leitura do código.

## Onde está o contexto

| Arquivo | O que é |
|---|---|
| `docs/restructure/PLANO-REESTRUTURACAO.md` | **Comece pela seção 11.** Estado atual, mapa de arquivos, o que está aberto. |
| `docs/HANDOFF.md` | História longa do projeto e as leis de performance (seções 3 e 4). |
| `docs/auditoria-performance.md` | As medições que justificam a arquitetura. |
| `docs/restructure/PROMPTS-IMAGENS.md` | Prompts para gerar as imagens que faltam. |

## Regras que não se negociam

1. **Nenhuma variável de CSS muda por frame.** Movimento contínuo vive em
   canvas. Um rAF só, via `B.add`. Violar isso traz de volta os 76ms de
   recálculo de estilo que custaram três sessões.
2. **Zero invenção de dado.** Nada de "+300 projetos" ou "98% de satisfação".
   Se o número não foi medido ou confirmado pelo dono, ele não existe.
3. **A marca é Beyon Zero.** Não `beyon.0`, não `Beyond`, não `MYKER`.
4. **O 3D é acréscimo, nunca substituição.** Tudo que ele enfeita existe em CSS
   por baixo. Fora do toque, fora de `prefers-reduced-motion`, e desliga sozinho
   se o fps não sustentar.
5. **Medir, não deduzir.** A/B na mesma sessão. O projeto já piorou o site três
   vezes otimizando por palpite.
6. **Não publicar sem o dono pedir.** Push na `main` é deploy.

## Como o dono trabalha

Português, direto. Valoriza bug apontado sem ser perguntado e decisão de
não-fazer justificada. Commits em português, explicando o PORQUÊ.
