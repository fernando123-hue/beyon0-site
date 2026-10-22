/* ==========================================================================
   CONFERIR O ARMAZÉM REAL (PR 3b-2; spec §7 "[conferir no plano], com teste real"). Quem roda é o DONO, no terminal dele,
   com SUPABASE_URL e SUPABASE_CHAVE_SECRETA definidas SÓ naquela janela (nunca em arquivo, nunca no chat). Cria objetos de
   teste no balde `material`, confere, e apaga. Imprime OK / FALHA / INFO por linha, SEM nenhum segredo, link ou token.
     node scripts/conferir-armazem.mjs
   Não confere: CORS do navegador (confira no E2E, a página real envia de outra origem) e o HEIC do iPhone (aparelho real).
   ========================================================================== */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { criarArmazem } from '../api/_material/armazem.mjs';
import { tipoPorBytes } from '../api/_material/bytes.mjs';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(200, 0)]);

export async function rodarConferencias({ armazem, buscar = fetch, publica = '', urlBase = '' }) {
  const linhas = [];
  const ok = (nome, cond, detalhe) => linhas.push((cond ? 'OK     ' : 'FALHA  ') + nome + (detalhe ? ' (' + detalhe + ')' : ''));
  const info = (nome, detalhe) => linhas.push('INFO   ' + nome + ': ' + detalhe);
  const caminho = () => randomUUID() + '/' + randomUUID();
  const subir = async (link, corpo, tipo, cab = {}) => (await buscar(link, { method: 'PUT', headers: { 'content-type': tipo, 'x-upsert': 'false', ...cab }, body: corpo })).status;
  const criados = [];
  try {
    const c1 = caminho(); criados.push(c1);
    const l1 = await armazem.linkDeEnvio(c1);
    let s = await subir(l1.url, PNG, 'image/png');
    let precisouDaChave = false;
    if ((s === 401 || s === 403) && publica) { precisouDaChave = true; s = await subir(l1.url, PNG, 'image/png', { apikey: publica }); }
    ok('1. envio direto do navegador pelo link assinado', s >= 200 && s < 300, 'status ' + s);
    info('1b. o envio pede a chave pública (apikey)?', precisouDaChave ? 'SIM: a chave pública tem de ir para o navegador (muda a CSP e a lista de conferência)' : s === 401 || s === 403 ? 'parece que sim, mas SUPABASE_CHAVE_PUBLICA não foi definida para testar' : 'não');
    const ini = await armazem.inicioDoArquivo(c1);
    ok('2. os 16 primeiros bytes (Range) e o tipo pelos bytes', !!ini && ini.bytes.length === 16 && tipoPorBytes(ini.bytes) === 'png', ini ? 'bytes ' + ini.bytes.length + ', tamanho total ' + ini.total : 'sem objeto');
    info('2b. o tamanho total vem do Range?', ini && ini.total != null ? 'sim (' + ini.total + ')' : 'não; o código usa tamanhoDoObjeto: ' + (await armazem.tamanhoDoObjeto(c1)));
    const c2 = caminho(); criados.push(c2);
    const sSvg = await subir((await armazem.linkDeEnvio(c2)).url, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml');
    ok('3. o balde recusa o tipo declarado fora da lista (SVG)', sSvg >= 400, 'status ' + sSvg);
    const c3 = caminho(); criados.push(c3);
    const sGrande = await subir((await armazem.linkDeEnvio(c3)).url, Buffer.alloc(11 * 1024 * 1024, 1), 'image/png');
    ok('4. o balde recusa arquivo acima de 10 MB', sGrande >= 400, 'status ' + sGrande);
    const sRepete = await subir((await armazem.linkDeEnvio(c1)).url, PNG, 'image/png');
    ok('5. sem sobrescrever (upsert desligado)', sRepete >= 400, 'status ' + sRepete);
    /* 5b (M7 da revisão do plano): o MESMO link, com `x-upsert: true` mandado pelo cliente, também não pode sobrescrever. Toda a defesa
       contra trocar o arquivo DEPOIS do `conferir` depende de o Storage usar o upsert gravado no token, e não o cabeçalho do navegador */
    const sTroca = await subir(l1.url, Buffer.concat([PNG, Buffer.alloc(50, 9)]), 'image/png', { 'x-upsert': 'true' });
    ok('5b. o mesmo link com x-upsert: true no envio não sobrescreve o objeto', sTroca >= 400, 'status ' + sTroca);
    const depoisDaTroca = await armazem.inicioDoArquivo(c1);
    ok('5c. o objeto continua com o tamanho de antes', !!depoisDaTroca && depoisDaTroca.total === PNG.length, depoisDaTroca ? 'tamanho ' + depoisDaTroca.total : 'sem objeto');
    await armazem.remover([c1]);
    ok('6a. remover em lote', (await armazem.inicioDoArquivo(c1)) === null);
    const sReuso = await subir(l1.url, PNG, 'image/png');
    info('6b. o MESMO link grava de novo depois de removido?', sReuso >= 200 && sReuso < 300 ? 'SIM (esperado: o link vale 2 h e não é de uso único; a conferência, o teto e a reconciliação cobrem)' : 'não (melhor que o esperado), status ' + sReuso);
    if (urlBase) {
      const r = await buscar(urlBase.replace(/\/+$/, '') + '/storage/v1/object/public/material/' + c1);
      ok('7. o balde é privado (o endereço público não entrega o arquivo)', r.status !== 200, 'status ' + r.status);
    } else info('7. balde privado', 'SUPABASE_URL não passada ao script; confira no painel (Storage › material › Private)');
    /* 8 (M1 da revisão do plano): "Sair deste aparelho" = POST /auth/v1/logout?scope=global com o token do PRÓPRIO visitante; depois
       disso o /auth/v1/user com o mesmo token tem de dar 401/403 (é o que faz o servidor recusar a sessão na hora) */
    if (urlBase && publica) {
      const auth = urlBase.replace(/\/+$/, '') + '/auth/v1', cab = { apikey: publica, 'content-type': 'application/json' };
      const s = await (await buscar(auth + '/signup', { method: 'POST', headers: cab, body: JSON.stringify({ data: {} }) })).json().catch(() => null);
      if (s && s.access_token) {
        const com = { ...cab, authorization: 'Bearer ' + s.access_token };
        const antes = (await buscar(auth + '/user', { headers: com })).status;
        const saiu = (await buscar(auth + '/logout?scope=global', { method: 'POST', headers: com })).status;
        const depois = (await buscar(auth + '/user', { headers: com })).status;
        ok('8. o logout global derruba a sessão na hora (/auth/v1/user: ' + antes + ' → ' + depois + ')', antes === 200 && saiu < 300 && (depois === 401 || depois === 403), 'logout ' + saiu);
      } else info('8. logout global', 'não consegui criar o visitante anônimo de teste (login anônimo desligado?)');
    } else info('8. logout global', 'defina SUPABASE_CHAVE_PUBLICA nesta janela para conferir');
  } finally {
    await armazem.remover(criados).catch(() => linhas.push('FALHA  limpeza: apague os objetos de teste à mão'));
  }
  return linhas;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const armazem = criarArmazem(process.env);
  if (!armazem || !process.env.SUPABASE_URL) { console.error('Defina SUPABASE_URL e SUPABASE_CHAVE_SECRETA nesta janela (e, se quiser testar o apikey, SUPABASE_CHAVE_PUBLICA).'); process.exit(2); }
  const linhas = await rodarConferencias({ armazem, publica: process.env.SUPABASE_CHAVE_PUBLICA || '', urlBase: process.env.SUPABASE_URL });
  console.log(linhas.join('\n'));
  process.exit(linhas.some(l => l.startsWith('FALHA')) ? 1 : 0);
}
