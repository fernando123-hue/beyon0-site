Assets — o que o site baixa e o que é arte-mestre
================================================

SERVIDOS AO VISITANTE (o site referencia estes)
-----------------------------------------------
favicon.svg          ícone da aba (<link rel="icon">). 338 B.

intro.mp4            vídeo da intro ("sistema iniciando"). 4,2 MB.
                     H.264 yuv420p, 1732x1152 (resolução nativa preservada),
                     24fps, 5s, faststart, sem áudio, CRF 26.
                     Gerado a partir de "introdução.mp4" (30 MB, 48 Mbps —
                     bitrate muito acima do necessário). Testado: reduzir a
                     resolução para 1280 amassava o detalhe fino do líquido,
                     então só o bitrate caiu. 85% mais leve, sem perda visível.
                     >> Reexportar:
                        ffmpeg -i "introdução.mp4" -c:v libx264 -preset veryslow \
                          -crf 26 -pix_fmt yuv420p -profile:v high -level 4.1 \
                          -an -movflags +faststart intro.mp4

og-cover.jpg         imagem de preview em redes sociais (og:image). 88 KB.
                     1200x630, frame do vórtice da intro (t=2.5s).
                     >> Reexportar:
                        ffmpeg -ss 2.5 -i "introdução.mp4" \
                          -vf "scale=1200:-1:flags=lanczos,crop=1200:630" \
                          -frames:v 1 -q:v 3 og-cover.jpg
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
introdução.mp4       30 MB, 1732x1152, 24fps, 5s.
                     Fonte do intro.mp4 e do og-cover.jpg. NÃO APAGAR.
                     Obs.: o acento no nome é frágil em URL (precisa de
                     percent-encoding e alguns CDNs mangam). Como o arquivo só
                     existe como master local e nada no site aponta pra ele,
                     não há risco hoje — mas evite acento em nomes servidos.

CONVENÇÃO
---------
Nome de arquivo servido: só ASCII, minúsculas, sem espaço nem acento.
Imagem nova: JPG ou WEBP, ~1600px de largura, otimizada (< 400 KB).
Vídeo novo:  MP4 (H.264, yuv420p, faststart), sem áudio, o mais leve possível.
Sempre guarde a arte-mestre aqui e sirva uma versão derivada e leve.
