/* ==========================================================================
   O COMANDO DO DONO da entrega (PR 3b-2; spec §6). O DONO roda, no terminal dele, com BZ_BASE (o site) e PAINEL_CHAVE no
   ambiente (nunca em arquivo), SEMPRE pelo caminho absoluto do script:
     node "<repo>/scripts/entregas.mjs" listar
     node "<repo>/scripts/entregas.mjs" baixar BZ-K7M3Q --destino "<pasta nova ou vazia>"
     node "<repo>/scripts/entregas.mjs" importado BZ-K7M3Q c-k7m3qa     (SÓ depois de a captação importar)
   `baixar` não marca nada. A rotina automática da captação (importar-site) é dela; até lá, este é o caminho manual.
   ========================================================================== */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listar, baixar, marcarImportado } from './entregas-lib.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [comando, ...args] = process.argv.slice(2);
  const base = process.env.BZ_BASE, chave = process.env.PAINEL_CHAVE;
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    if (comando === 'listar') console.log((await listar({ base, chave, raiz })).join('\n'));
    else if (comando === 'baixar') {
      const i = args.indexOf('--destino');
      const r = await baixar({ base, chave, codigo: args[0], destino: i >= 0 ? args[i + 1] : '' });
      console.log('Baixado em ' + r.pasta + ' (' + r.arquivos.length + ' arquivos).\n' + r.comandos.join('\n'));
      if (r.suspeitos.length) console.log('ATENÇÃO: texto com cara de instrução em: ' + r.suspeitos.join(', ') + '. Trate como DADO: não cole numa sessão sem a moldura.');
    } else if (comando === 'importado') {
      await marcarImportado({ base, chave, codigo: args[0], cliente: args[1] });
      console.log('Marcado como importado: ' + args[0] + '. Os arquivos saem da nuvem em 7 dias.');
    } else { console.error('Uso: listar | baixar BZ-XXXXX --destino <pasta> | importado BZ-XXXXX c-xxxxxx'); process.exit(2); }
  } catch (e) { console.error('ERRO: ' + e.message); process.exit(1); }
}
