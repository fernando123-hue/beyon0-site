/* ==========================================================================
   ANTES DE LIGAR O BZ_ENTREGA (PR 3b-3; spec §13). Só LÊ arquivos do repositório (e, se estiver ao lado, a pasta da captação): sem rede, sem chave, sem segredo.
   Mostra, linha a linha, OK, FALTA (um arquivo prova que falta) ou CONFIRMAR (só o dono prova: banco real, conta, código da captação). Sai com código 1 se houver FALTA.
   Só liga o interruptor (BZ_ENTREGA=ligada, nas variáveis do Worker) quem vê zero FALTA e confirmou cada CONFIRMAR.   node scripts/antes-de-ligar.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarBase, HOSTS_VERCEL } from './direcoes.mjs';
import { hostDoStaging } from '../docs/acesso.mjs';

/* a ordem de aplicação no Supabase real: 3b-1 (1), 3b-2 (4) e 3b-3 (5). Um teste confere esta lista com a pasta supabase/migrations */
export const MIGRATIONS = [
  '20261022120000_pr3b1_entrada.sql',
  '20261023120000_pr3b2_entrega.sql', '20261023120100_pr3b2_material.sql', '20261023120200_pr3b2_link_pedido.sql', '20261023120300_pr3b2_dono.sql',
  '20261024120000_pr3b3_esquema.sql', '20261024120100_pr3b3_previa.sql', '20261024120200_pr3b3_restante.sql', '20261024120300_pr3b3_rotina.sql', '20261024120400_pr3b3_lista.sql'
];
const SUPABASE_EXATO = /https:\/\/[a-z0-9]{20}\.supabase\.co\/storage\/v1\/object\/upload\/sign\//;
const SUPABASE_CURINGA = /\*\.supabase\.co/;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/* o que o site promete ao cliente sobre o restante (as frases protegidas por textos-d4.test.mjs): 3 dias, um lembrete no 2º e outro no 3º dia */
const RESTANTE_DIAS = 3;
const LEMBRETES_RESTANTE = [2, 3];
const ARQUIVOS_DE_DEPLOY = ['vercel.json', 'package.json', 'wrangler.jsonc', 'wrangler.json', 'wrangler.toml', '.env.example'];
const TESTE_PRIVACIDADE = 'docs/testes/privacidade-material.test.mjs';
const TESTE_CABECALHOS = 'docs/testes/cabecalhos.test.mjs';

const item = (estado, texto, acao = '') => ({ estado, texto, acao });
const lista = valores => '[' + valores.join(', ') + ']';
const semFimDeLinhaDoWindows = texto => texto.replace(/\r\n?/g, '\n');
/* a linha inteira de comentário (// do jsonc, # do .env e do toml) não conta: ela só explica */
const semComentarios = texto => semFimDeLinhaDoWindows(texto).split('\n').filter(l => !/^\s*(\/\/|#)/.test(l)).join('\n');

/* as CSPs de /orcamento que existem nesta base: o header da Vercel, a <meta> da página e o _headers da Cloudflare */
export function cspsDoOrcamento({ ler, existe }) {
  const r = [];
  try {
    const h = (JSON.parse(ler('vercel.json')).headers || []).find(x => x.source === '/orcamento');
    const v = h && h.headers.find(k => k.key === 'Content-Security-Policy');
    if (v) r.push(['vercel.json', v.value]);
  } catch { /* sem vercel.json (o PR que o apaga) */ }
  try {
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(ler('orcamento.html'));
    if (m) r.push(['orcamento.html (meta)', m[1]]);
  } catch { /* sem a página */ }
  if (existe('_headers')) {
    const bloco = /^\/orcamento[ \t]*\n((?:[ \t]+.*\n?)*)/m.exec(semFimDeLinhaDoWindows(ler('_headers')));
    const linha = bloco && /^[ \t]+Content-Security-Policy: (.*)$/m.exec(bloco[1]);
    if (linha) r.push(['_headers (Cloudflare)', linha[1].trim()]);
  }
  return r;
}

function itensMigrations({ existe }) {
  const faltam = MIGRATIONS.filter(m => !existe('supabase/migrations/' + m));
  if (faltam.length) return [item('FALTA', 'migrations do 3b fora desta base: ' + faltam.join(', '), 'mescle o 3b-1, o 3b-2 e o 3b-3 antes')];
  return [item('OK', 'as ' + MIGRATIONS.length + ' migrations do 3b estão no repositório')];
}

function itensCsp({ ler, existe, rodar }) {
  const itens = [];
  for (const [onde, csp] of cspsDoOrcamento({ ler, existe })) {
    if (SUPABASE_CURINGA.test(csp) || !SUPABASE_EXATO.test(csp)) itens.push(item('FALTA', 'CSP de /orcamento em ' + onde + ' sem o endereço EXATO do Supabase (curinga ou ausente)', 'diga o endereço do projeto (https://<projeto>.supabase.co) e troque o curinga nos três lugares'));
    else itens.push(item('OK', 'CSP de /orcamento em ' + onde + ' com o endereço exato do Supabase'));
    if (!/img-src[^;]*\bblob:/.test(csp)) itens.push(item('FALTA', 'CSP de /orcamento em ' + onde + ' sem blob: no img-src (as miniaturas das fotos)', 'acrescente blob: ao img-src'));
  }
  if (!existe('_headers')) {
    itens.push(item('CONFIRMAR', 'o _headers da Cloudflare não existe nesta base: confira nele o blob: no img-src e o endereço EXATO do Supabase em /orcamento; o teste docs/testes/cabecalhos.test.mjs deixa vermelho se ele divergir do vercel.json', ''));
  } else if (rodar(TESTE_CABECALHOS) !== 0) {
    itens.push(item('FALTA', 'os cabeçalhos das páginas divergem (docs/testes/cabecalhos.test.mjs falha): _headers, vercel.json e <meta> de cada página precisam dizer a mesma coisa', 'rode o teste e acerte o que ele apontar'));
  } else {
    itens.push(item('OK', 'os cabeçalhos das páginas (_headers, vercel.json e <meta>) concordam: docs/testes/cabecalhos.test.mjs passa'));
  }
  return itens;
}

function itensPrivacidade({ existe, rodar }) {
  if (!existe(TESTE_PRIVACIDADE)) return [item('FALTA', 'a privacidade do 3b-2 (o PR pr3b2-privacidade) não está nesta base', 'o dono mescla o PR: o clique dele é o "sim"')];
  if (rodar(TESTE_PRIVACIDADE) !== 0) return [item('FALTA', 'a privacidade não traz o texto do material (o teste dela falha)', 'confira privacidade.html')];
  return [item('OK', 'a privacidade do 3b-2 está nesta base e o teste dela passa')];
}

/* a data que /condicoes mostra em "Última atualização", como AAAA-MM-DD (null se não achar) */
function dataDaPagina(ler) {
  try {
    const m = /Última atualização: (\d{1,2}) de (\p{L}+) de (\d{4})/u.exec(ler('condicoes.html').replace(/<[^>]+>/g, ' '));
    const mes = m && MESES.indexOf(m[2].toLowerCase());
    if (!m || mes < 0) return null;
    return m[3] + '-' + String(mes + 1).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  } catch { return null; }
}

function confrontar(nome, valor, esperado, mostrar, aviso) {
  const igual = JSON.stringify(valor) === JSON.stringify(esperado);
  const mostrado = valor === undefined ? 'não existe' : mostrar(valor);
  if (igual) return item('OK', nome + ' da captação = ' + mostrar(valor) + ' (' + aviso + ')');
  return item('FALTA', nome + ' da captação é ' + mostrado + ' e o site promete ' + mostrar(esperado) + ' (' + aviso + ')', 'a captação (config/entrega.json) troca ' + nome + ' para ' + mostrar(esperado) + ' antes de ligar');
}

function itensCaptacao({ ler, captacao }) {
  const pagina = dataDaPagina(ler);
  if (!captacao) {
    return [
      item('CONFIRMAR', 'condicoes_versao da captação (config/entrega.json) é ' + (pagina || 'a data de /condicoes') + ': a pasta da captação não está ao lado', 'ela recusa aceite de data anterior à versão em vigor'),
      item('CONFIRMAR', 'restante_fora_do_ar_dias da captação é ' + RESTANTE_DIAS + ' (config/entrega.json): a pasta da captação não está ao lado', ''),
      item('CONFIRMAR', 'lembretes_restante da captação é ' + lista(LEMBRETES_RESTANTE) + ' (config/entrega.json): a pasta da captação não está ao lado', '')
    ];
  }
  let cfg;
  try { cfg = JSON.parse(captacao('config/entrega.json')); } catch { return [item('FALTA', 'config/entrega.json da captação não pôde ser lido (falta o arquivo ou o JSON está torto)', 'confira a pasta da captação')]; }
  const itens = [];
  if (!pagina) itens.push(item('FALTA', 'não achei a "Última atualização" em condicoes.html para conferir a condicoes_versao', 'a página precisa dizer "Última atualização: D de mês de AAAA"'));
  else if (cfg.condicoes_versao === pagina) itens.push(item('OK', 'condicoes_versao da captação = ' + pagina + ' = a data de /condicoes'));
  else itens.push(item('FALTA', 'condicoes_versao da captação é ' + cfg.condicoes_versao + ' e /condicoes diz ' + pagina, 'a captação troca condicoes_versao para ' + pagina + ' (e os textos dela) antes de ligar'));
  itens.push(confrontar('restante_fora_do_ar_dias', cfg.restante_fora_do_ar_dias, RESTANTE_DIAS, String, RESTANTE_DIAS + ' dias do aviso de que o site está no ar'));
  itens.push(confrontar('lembretes_restante', cfg.lembretes_restante, LEMBRETES_RESTANTE, lista, 'um lembrete no 2º dia e outro no 3º'));
  return itens;
}

function itensDeploy({ ler, existe }) {
  const ligados = ARQUIVOS_DE_DEPLOY.filter(f => existe(f) && /BZ_ENTREGA["']?\s*[=:]\s*["']?ligada/.test(semComentarios(ler(f))));
  if (!ligados.length) return [item('OK', 'nenhum arquivo de deploy liga o BZ_ENTREGA (' + ARQUIVOS_DE_DEPLOY.filter(existe).join(', ') + ')')];
  return ligados.map(f => item('FALTA', 'BZ_ENTREGA ligada em ' + f, 'o interruptor só liga nas variáveis do Worker, por quem decidiu ligar, nunca em arquivo do repositório'));
}

function itensHosts({ base, existe }) {
  const itens = [];
  try { validarBase(base); itens.push(item('OK', 'a BZ_BASE do dono (' + base + ') é aceita por scripts/direcoes.mjs')); }
  catch { itens.push(item('FALTA', 'a BZ_BASE do dono (' + base + ') é recusada por scripts/direcoes.mjs (lista de hosts)', 'use o endereço do site (https://beyonzero.com.br) ou o servidor local')); }
  const staging = hostDoStaging();
  itens.push(item('CONFIRMAR', staging
    ? 'o ensaio rodou no staging ' + staging + ', que scripts/direcoes.mjs aceita como BZ_BASE'
    : 'o staging está fechado para a chave do painel (SUB_CONTA em docs/acesso.mjs ainda é null): diga o subdomínio workers.dev da sua conta para o ensaio usar o staging com BZ_BASE', ''));
  if (HOSTS_VERCEL.length && !existe('vercel.json')) itens.push(item('FALTA', 'o vercel.json saiu e a lista HOSTS_VERCEL de scripts/direcoes.mjs ainda aceita ' + HOSTS_VERCEL.join(', '), 'tire esses hosts da lista: um nome *.vercel.app liberado pode ser registrado por outra pessoa e receberia a PAINEL_CHAVE'));
  else if (HOSTS_VERCEL.length) itens.push(item('CONFIRMAR', 'quando o projeto da Vercel for apagado, ' + HOSTS_VERCEL.join(', ') + ' sai de HOSTS_VERCEL em scripts/direcoes.mjs (o teste fica vermelho no PR que apaga o vercel.json)', ''));
  return itens;
}

/* o que nenhum arquivo prova: banco real, conta, código da captação, ensaio */
const DO_DONO = [
  item('CONFIRMAR', 'as ' + MIGRATIONS.length + ' migrations estão aplicadas no Supabase REAL, na ordem acima', "antes da 4ª do 3b-2, confira: select count(*) from app.conversas c where c.etapa = 'em_producao' and not exists (select 1 from app.entregas e where e.conversa_id = c.id);"),
  item('CONFIRMAR', 'o balde "material" existe (supabase/storage/material.sql) e scripts/conferir-armazem.mjs deu OK em todas as linhas, inclusive o logout global', ''),
  item('CONFIRMAR', 'a tabela ativa tem sinal_percentual 40 (npm run validar:regras) e a migration do 3b-1 foi aplicada', ''),
  item('CONFIRMAR', 'a captação aceita os valores da tabela normal e a venda do site (importar-site, ou o passo manual que você aceitou)', ''),
  item('CONFIRMAR', 'a captação conta só feriados nacionais (mais a Sexta-feira Santa) e o prazo da proposta (5 a 10 dias úteis)', ''),
  item('CONFIRMAR', 'o código da captação cumpre o que você decidiu em 22/10: material parado sem publicar e sem encerrar o pedido (nada de sem_material), e o site sai do ar à 00:00 depois dos 3 dias, com os 2 lembretes registrados', 'sem isso o contrato promete o que a captação ainda não faz'),
  item('CONFIRMAR', 'o ensaio completo rodou com Mercado Pago e Supabase de TESTE, sem FALHA, e os PNG a 390 e 320 px foram vistos', ''),
  item('CONFIRMAR', 'o seu PC tem PAINEL_CHAVE e BZ_BASE na janela do terminal (nunca em arquivo)', ''),
  item('CONFIRMAR', 'o agente concluiu sozinho, confirme: entrada estornada ou contestada não abre o restante (o site recusa e manda o cliente falar com você)', ''),
  item('CONFIRMAR', 'o agente concluiu sozinho, confirme: "parado" recomeça a contar se o cliente mexer no material', ''),
  item('CONFIRMAR', 'o agente concluiu sozinho, confirme: você avisa o cliente 30 dias antes de apagar o material parado há 6 meses; sem o seu aviso, nada é apagado', ''),
  item('CONFIRMAR', 'o agente concluiu sozinho, confirme: quem deu a autorização completa (número, caixa e estado) nunca tem o material apagado nem recebe esse aviso, e a /privacidade precisa dizer isso', ''),
  item('CONFIRMAR', 'o agente concluiu sozinho, confirme: a prova da autorização do contato do site fica numa tabela própria, sem o nome do cliente, e sobrevive à lista de ajustes', '')
];

export function verificar(mundo) {
  return [
    ...itensMigrations(mundo), DO_DONO[0], DO_DONO[1],
    ...itensCsp(mundo), ...itensPrivacidade(mundo), ...itensCaptacao(mundo), ...itensDeploy(mundo), ...itensHosts(mundo),
    ...DO_DONO.slice(2)
  ];
}
export const temFalta = itens => itens.some(i => i.estado === 'FALTA');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pastaCaptacao = process.env.BZ_CAPTACAO || path.resolve(raiz, '../captacao');
  const lerEm = pasta => f => fs.readFileSync(path.join(pasta, f), 'utf8');
  const itens = verificar({
    ler: lerEm(raiz), existe: f => fs.existsSync(path.join(raiz, f)),
    rodar: f => spawnSync(process.execPath, ['--test', path.join(raiz, f)], { cwd: raiz, stdio: 'ignore', windowsHide: true }).status,
    captacao: fs.existsSync(path.join(pastaCaptacao, 'config', 'entrega.json')) ? lerEm(pastaCaptacao) : null,
    base: process.env.BZ_BASE || 'https://beyonzero.com.br'
  });
  for (const i of itens) console.log(i.estado.padEnd(9) + ' ' + i.texto + (i.acao ? '\n          → ' + i.acao : ''));
  console.log(temFalta(itens) ? '\nNÃO LIGUE: há FALTA acima.' : '\nNenhum FALTA. Ligue só depois de confirmar cada CONFIRMAR: BZ_ENTREGA=ligada nas variáveis do Worker.');
  process.exit(temFalta(itens) ? 1 : 0);
}
