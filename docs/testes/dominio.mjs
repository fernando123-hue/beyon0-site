/* O ENDEREÇO DO SITE, num lugar só (plano da migração para a Cloudflare, PR C, tarefa C1). Os testes que conferem
   canonical, og:url, og:image, dados estruturados, sitemap e robots importam esta constante: trocar de endereço de novo
   é mudar uma linha aqui e os arquivos que o teste apontar (páginas, sitemap, robots, `wrangler.jsonc`, `HOST_SITE` em
   scripts/direcoes.mjs e a cópia autônoma em scripts/processo/anti-publicacao.mjs: os testes acusam quem ficar para trás). Sem barra no fim. */
export const DOMINIO = 'https://beyonzero.com.br';
export const HOST_DO_DOMINIO = new URL(DOMINIO).host;
