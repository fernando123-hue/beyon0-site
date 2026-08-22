Assets — o que o site baixa e o que é arte-mestre
================================================

SERVIDOS AO VISITANTE (o site referencia estes)
-----------------------------------------------
favicon.svg          ícone da aba (<link rel="icon">). 338 B.

og-cover.jpg         imagem de preview em redes sociais (og:image). 88 KB.
                     1200x630. NÃO vem mais de frame de vídeo — a intro em
                     vídeo foi REMOVIDA do site (2026-08-21, não cabia mais na
                     identidade visual nova). A capa atual é renderizada a
                     partir de `docs/og-render.html` (canvas HTML puro, mesma
                     paleta/tipografia do site) via Chrome do sistema em modo
                     headless:
                        chrome.exe --headless=new --window-size=1200,630 \
                          --screenshot=assets/og-cover.jpg \
                          --user-data-dir=<perfil temporário isolado> \
                          docs/og-render.html
                     Editar a composição em docs/og-render.html, não aqui.
                     SEMPRE isolar --user-data-dir (sem isso reaproveita a
                     sessão do Chrome real, se houver uma aberta).
                     RESOLVIDO: o index.html usa URL absoluta
                     (https://beyon0-site.vercel.app/assets/og-cover.jpg).
                     Se o domínio mudar, atualizar og:image, twitter:image
                     e <link rel="canonical"> juntos.

ARTE-MESTRE (nunca baixada pelo visitante — o peso não custa nada a ele)
-----------------------------------------------------------------------
Logo.gif             20 MB, 2304x720, 30fps, 5s, fundo transparente.
                     Arte-mestre do logo animado. O logo em vídeo foi
                     REMOVIDO do site a pedido do dono (a marca é o wordmark
                     em texto), e o derivado Logo-definitiva.mp4 saiu do repo.
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
