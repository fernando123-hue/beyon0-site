Assets — o que o site baixa e o que é arte-mestre
================================================

SERVIDOS AO VISITANTE (o site referencia estes)
-----------------------------------------------
favicon.svg          ícone da aba (<link rel="icon" type="image/svg+xml">): o símbolo
                     pequeno da logo num quadrado preto, desenhado na grade de 16 px.

favicon.ico          (na RAIZ do site) 16, 32 e 48 px, PNG dentro de um ICO: navegadores
                     e robôs pedem /favicon.ico por padrão.

apple-touch-icon.png 180x180, ícone da tela inicial do iPhone (o símbolo médio, sem cantos).

og-cover.jpg         imagem de preview em redes sociais (og:image), 1200x630: a logo
                     empilhada no centro (a prévia compacta do WhatsApp corta um quadrado
                     do centro e ela cabe inteira). URL absoluta nas páginas
                     (https://beyon0-site.vercel.app/assets/og-cover.jpg): se o domínio
                     mudar, atualizar og:image, twitter:image e <link rel="canonical"> juntos.

A LOGO (2026-10-12, aprovada pelo dono) vem de 03 Projetos/marca/logo/ (o vault, fora do
repositório): o desenho é código (estudos/sistema.mjs, nome2.mjs) e `node site.mjs <pasta do
site>` regera a logo do topo, do rodapé e do resumo (SVG no HTML, cores por classe em
css/tokens.css) e estes quatro arquivos. Não editar o SVG à mão: mudar lá e rodar de novo.

ARTE-MESTRE (nunca baixada pelo visitante — o peso não custa nada a ele)
-----------------------------------------------------------------------
Logo.gif             20 MB, 2304x720, 30fps, 5s, fundo transparente.
                     Arte-mestre do logo animado. O logo em vídeo foi
                     REMOVIDO do site a pedido do dono (depois a marca foi o
                     wordmark em texto; desde 2026-10-12, a logo nova), e o derivado Logo-definitiva.mp4 saiu do repo.
                     O master fica aqui caso o logo volte. NÃO APAGAR.

REMOVIDOS (2026-08-21c)
-----------------------
intro.mp4 e introdução.mp4 (o master de 30 MB de onde intro.mp4 e a antiga
og-cover.jpg vinham) saíram junto com a intro em vídeo inteira — pedido do
dono ("não se enquadra mais para nossa identidade visual"). O master local
`introdução.mp4` era ignorado pelo git (.gitignore) e nunca serviu ao
visitante; ficou fora deste README porque perdeu todo downstream (nenhum
arquivo servido depende mais dele). Não foi apagado do disco por este commit
— era arquivo local, fora do repositório, e apagar mais do que o pedido
não é decisão do agente. Se não houver mais uso planejado para ele, é
seguro apagar manualmente.

CONVENÇÃO
---------
Nome de arquivo servido: só ASCII, minúsculas, sem espaço nem acento.
Imagem nova: JPG ou WEBP, ~1600px de largura, otimizada (< 400 KB).
Vídeo novo:  MP4 (H.264, yuv420p, faststart), sem áudio, o mais leve possível.
Sempre guarde a arte-mestre aqui e sirva uma versão derivada e leve.
