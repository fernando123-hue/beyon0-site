Assets — o que o site baixa e o que é arte-mestre
================================================

SERVIDOS AO VISITANTE (o site referencia estes)
-----------------------------------------------
favicon.svg          ícone da aba (<link rel="icon">). 338 B.

Logo-definitiva.mp4  logo animado da nav e do rodapé. 172 KB.
                     H.264 yuv420p, 640x200 (aspecto nativo 3.2), 30fps, 5.03s,
                     faststart, sem áudio, CRF 21.
                     Gerado a partir de Logo.gif: o alpha foi achatado sobre
                     PRETO de propósito, porque o CSS usa mix-blend-mode: screen
                     — preto vira invisível sobre o fundo do site.
                     >> Reexportar depois de mudar a arte:
                        ffmpeg -i Logo.gif \
                          -filter_complex "color=c=black:s=2304x720:r=30[bg];\
                            [bg][0:v]overlay=shortest=1,\
                            scale=640:200:flags=lanczos,format=yuv420p" \
                          -c:v libx264 -preset veryslow -crf 21 -profile:v main \
                          -level 4.0 -g 30 -an -movflags +faststart \
                          Logo-definitiva.mp4
                        Mantendo o aspecto 3.2. Se mudar a resolução, atualize
                        width/height nos dois <video> do index.html.

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
                     >> PENDENTE: quando houver domínio, trocar por URL absoluta
                        no index.html — crawlers não resolvem caminho relativo.

ARTE-MESTRE (nunca baixada pelo visitante — o peso não custa nada a ele)
-----------------------------------------------------------------------
Logo.gif             20 MB, 2304x720, 30fps, 5s, fundo transparente.
                     Fonte do Logo-definitiva.mp4. NÃO APAGAR.
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
