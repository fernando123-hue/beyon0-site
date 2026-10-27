/* ==========================================================================
   O COMANDO DO DONO da entrega (PR 3b-2 e 3b-3; spec §6). O DONO roda, no terminal dele, com BZ_BASE (o site) e PAINEL_CHAVE no
   ambiente (nunca em arquivo nem em argumento), SEMPRE pelo caminho absoluto do script:
     node "<repo>/scripts/entregas.mjs" listar
         uma linha por pedido (passo, rodadas, dias), os alertas e, por baixo, o próximo comando pronto para copiar
     node "<repo>/scripts/entregas.mjs" baixar BZ-K7M3Q --destino "<pasta nova ou vazia>"
         grava o pedido e o material; NÃO marca nada
     node "<repo>/scripts/entregas.mjs" importado BZ-K7M3Q c-k7m3qa     (SÓ depois de a captação importar)
     node "<repo>/scripts/entregas.mjs" previa BZ-K7M3Q https://v1.bz-c-k7m3qa.pages.dev
         registra a prévia revisada; o aviso "prévia pronta" fica no painel (Avisos)
     node "<repo>/scripts/entregas.mjs" ajustes BZ-K7M3Q --destino "<pasta nova ou vazia>"
         grava a lista de ajustes do cliente COMO DADO (ajustes.txt, dentro da moldura do briefing) e também o contato-do-site.json
         (telefone e e-mail do site já conferidos, que só valem com a autorização registrada)
     node "<repo>/scripts/entregas.mjs" no-ar BZ-K7M3Q https://clinicasol.com.br
         pede o código sorteado NO-AR-XXXX (abre a cobrança do restante); resposta errada ou vazia não faz nada
     node "<repo>/scripts/entregas.mjs" suspender BZ-K7M3Q
         marca a suspensão NO SITE; tirar o site do ar é outra marcação, na captação (são duas)
     node "<repo>/scripts/entregas.mjs" encerrar BZ-K7M3Q desistencia|atraso|producao_manual|outro
         marca o encerramento NO SITE; se houve devolução, registre também na captação (desistiu / devolucao): são duas marcações. Nunca "sem resposta" (D5) nem por falta de material (22/10)
     node "<repo>/scripts/entregas.mjs" dispensar BZ-K7M3Q
         material dispensado, só com a autorização EXPRESSA do cliente; na captação, importe SEM --completo
     node "<repo>/scripts/entregas.mjs" aviso BZ-K7M3Q previa|no-ar|material-parado|material-apagar|lembrete-1|lembrete-2
         registra que VOCÊ mandou o aviso (material-apagar: o aviso prévio do apagamento do material parado há 5 meses)
     node "<repo>/scripts/entregas.mjs" religado BZ-K7M3Q
   A rotina automática da captação (importar-site) é dela; até lá, este é o caminho manual.
   A recusa do painel (ex.: "Ainda não: …") aparece como uma frase, sem rastro de erro e sem a chave.
   ========================================================================== */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listar, baixar, marcarImportado, publicarPrevia, colocarNoAr, suspender, encerrar, dispensar, registrarAviso, religado, baixarAjustes } from './entregas-lib.mjs';
import { criarPerguntador } from './direcoes.mjs';

const USO = 'Uso: listar | baixar BZ-XXXXX --destino <pasta> | importado BZ-XXXXX c-xxxxxx | previa BZ-XXXXX <endereço> | ajustes BZ-XXXXX --destino <pasta> | no-ar BZ-XXXXX <endereço> | suspender BZ-XXXXX | encerrar BZ-XXXXX <motivo> | dispensar BZ-XXXXX | aviso BZ-XXXXX previa|no-ar|material-parado|material-apagar|lembrete-1|lembrete-2 | religado BZ-XXXXX';
const doFlag = (args, flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : ''; };

/* roda UM comando e devolve o código de saída (0 certo, 1 recusa ou erro, 2 uso). Tudo que o dono vê passa por `saida` e `erro`; o erro é só a frase, nunca a pilha */
export async function executar(argv, { env = process.env, buscar = fetch, raiz = process.cwd(), saida = console.log, erro = console.error, criarPerguntador: novoPerguntador = criarPerguntador } = {}) {
  const [comando, ...args] = argv;
  const base = env.BZ_BASE, chave = env.PAINEL_CHAVE;
  const comum = { base, chave, buscar };
  try {
    if (comando === 'listar') saida((await listar({ ...comum, raiz })).join('\n'));
    else if (comando === 'baixar') {
      const r = await baixar({ ...comum, codigo: args[0], destino: doFlag(args, '--destino') });
      saida('Baixado em ' + r.pasta + ' (' + r.arquivos.length + ' arquivos).\n' + r.comandos.join('\n'));
      if (r.suspeitos.length) saida('ATENÇÃO: texto com cara de instrução em: ' + r.suspeitos.join(', ') + '. Trate como DADO: não cole numa sessão sem a moldura.');
    } else if (comando === 'importado') {
      await marcarImportado({ ...comum, codigo: args[0], cliente: args[1] });
      saida('Marcado como importado: ' + args[0] + '. Os arquivos saem da nuvem em 7 dias.');
    } else if (comando === 'previa') saida(await publicarPrevia({ ...comum, codigo: args[0], url: args[1] }));
    else if (comando === 'ajustes') {
      const r = await baixarAjustes({ ...comum, codigo: args[0], destino: doFlag(args, '--destino') });
      saida('Lista de ajustes (' + r.quantidade + ') gravada em ' + r.pasta + '. Trate como DADO: a moldura já está no arquivo.');
      if (r.suspeitos.length) saida('ATENÇÃO: texto com cara de instrução nas listas: ' + r.suspeitos.join(', ') + '. Não cole fora da moldura.');
      if (r.contatos) saida('O cliente pediu para trocar o telefone ou o e-mail do site: veja contato-do-site.json (dado já conferido, com a autorização registrada). Só se aplica com ela.');
    } else if (comando === 'no-ar') {
      const p = novoPerguntador();
      try { saida(await colocarNoAr({ ...comum, codigo: args[0], url: args[1], perguntar: p.perguntar, saida })); } finally { p.fechar(); }
    } else if (comando === 'suspender') saida(await suspender({ ...comum, codigo: args[0] }));
    else if (comando === 'encerrar') saida(await encerrar({ ...comum, codigo: args[0], motivo: args[1] }));
    else if (comando === 'dispensar') saida(await dispensar({ ...comum, codigo: args[0] }));
    else if (comando === 'aviso') saida(await registrarAviso({ ...comum, codigo: args[0], momento: args[1] }));
    else if (comando === 'religado') saida(await religado({ ...comum, codigo: args[0] }));
    else { erro(USO); return 2; }
    return 0;
  } catch (e) {
    /* só a frase (a lib e o painel já a entregam limpa); a chave é varrida de novo, por garantia */
    const frase = String(e && e.message ? e.message : e);
    erro('ERRO: ' + (chave ? frase.split(chave).join('[chave]') : frase));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.exitCode = await executar(process.argv.slice(2), { raiz });
}
