# three.js para o AI Core

`three-nucleo.min.js` é o three.js **r160** (MIT, ver `LICENSE`) reduzido às
classes que a esfera usa (`entrada.js`). O site não tem build: o arquivo é
gerado uma vez, fora do repositório, e vendorado como o GSAP.

| | comprimido (gzip -9) |
|---|---|
| three.module.min.js inteiro (r160) | 166 KB |
| three-nucleo.min.js (só o que a esfera usa) | 124 KB |

## Como regerar

Numa pasta temporária (não dentro do site):

```bash
npm init -y
npm i three@0.160.0 esbuild@0.24.0
# copie entrada.js para lá
npx esbuild entrada.js --bundle --format=esm --minify --legal-comments=eof --outfile=three-nucleo.min.js
```

Se a esfera passar a usar outra classe do three, acrescente em `entrada.js` e
regere. SHA-256 desta versão:
`c6caca8d285622cdf4470173cb35edbc498eb7313cf0374727bd92bf00c984d9`.
