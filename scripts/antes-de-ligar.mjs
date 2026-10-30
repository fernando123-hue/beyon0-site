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

/* a ordem de aplicação no Supabase real: 3b-1 (1), 3b-2 (4), 3b-3 (5), a correção do aviso "no ar" (1, de 28/10), os recados (1, de 29/10) e a confirmação automática (1, de 30/10). Um teste confere esta lista com a pasta supabase/migrations */
export const MIGRATIONS = [
  '20261022120000_pr3b1_entrada.sql',
  '20261023120000_pr3b2_entrega.sql', '20261023120100_pr3b2_material.sql', '20261023120200_pr3b2_link_pedido.sql', '20261023120300_pr3b2_dono.sql',
  '20261024120000_pr3b3_esquema.sql', '20261024120100_pr3b3_previa.sql', '20261024120200_pr3b3_restante.sql', '20261024120300_pr3b3_rotina.sql', '20261024120400_pr3b3_lista.sql',
  '20261028120000_aviso_no_ar_so_no_ar.sql', '20261029120000_recados.sql', '20261030120000_confirmacao_automatica.sql'
];
/* o endereço do envio assinado, token inteiro; o grupo 1 é o projeto */
const SUPABASE_EXATO = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/storage\/v1\/object\/upload\/sign\/$/;
/* o connect-src de /orcamento é lista do que é PERMITIDO (B2): qualquer outra fonte é FALTA. As fontes são as de verdade (vercel.json, _headers e a <meta>): o próprio site, o Mercado Pago e o Supabase exato */
const CONNECT_PERMITIDAS = ["'self'", 'https://api.mercadopago.com', 'https://secure-fields.mercadopago.com'];
/* nas diretivas de código e de estilo não passa script ou estilo de qualquer lugar: curinga, esquema solto (https:, data:, blob:...), unsafe-inline e unsafe-eval */
const DIRETIVAS_DE_CODIGO = ['default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr'];
const FONTE_ABERTA = /^(\*|[a-z][a-z0-9+.-]*:|'unsafe-(inline|eval|hashes)')$|\*/i;
/* o script-src também é lista do que é PERMITIDO: o próprio site, o Turnstile da Cloudflare e o SDK do Mercado Pago (as fontes reais de /orcamento) */
const SCRIPT_PERMITIDAS = ["'self'", "'none'", 'https://challenges.cloudflare.com', 'https://sdk.mercadopago.com'];
const DIRETIVAS_POR_LISTA = ['script-src', 'script-src-elem'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/* o que o site promete ao cliente sobre o restante (as frases protegidas por textos-d4.test.mjs): 3 dias, um lembrete no 2º e outro no 3º dia */
const RESTANTE_DIAS = 3;
const LEMBRETES_RESTANTE = [2, 3];
const ARQUIVOS_DE_DEPLOY = ['vercel.json', 'package.json', 'wrangler.jsonc', 'wrangler.json', 'wrangler.toml', '.env.example'];
/* o que também faz deploy ou liga o Worker (B3): nenhum desses arquivos tem motivo para mexer no BZ_ENTREGA; qualquer menção fora de comentário é FALTA */
const PASTAS_DE_DEPLOY = [['.github/workflows', /\.ya?ml$/i], ['cloudflare', /\.(mjs|js|json|jsonc|toml|ya?ml)$/i]];
const TESTE_PRIVACIDADE = 'docs/testes/privacidade-material.test.mjs';
const TESTE_CABECALHOS = 'docs/testes/cabecalhos.test.mjs';

const item = (estado, texto, acao = '') => ({ estado, texto, acao });
const lista = valores => '[' + valores.join(', ') + ']';
const semFimDeLinhaDoWindows = texto => texto.replace(/\r\n?/g, '\n');
/* a linha inteira de comentário (// do jsonc, # do .env e do toml) não conta: ela só explica */
const semComentarios = texto => semFimDeLinhaDoWindows(texto).split('\n').filter(l => !/^\s*(\/\/|#)/.test(l)).join('\n');

function itensMigrations({ existe }) {
  const faltam = MIGRATIONS.filter(m => !existe('supabase/migrations/' + m));
  if (faltam.length) return [item('FALTA', 'migrations do 3b fora desta base: ' + faltam.join(', '), 'mescle o 3b-1, o 3b-2 e o 3b-3 antes')];
  return [item('OK', 'as ' + MIGRATIONS.length + ' migrations do 3b estão no repositório')];
}

const vazioViraNulo = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

function cspDoVercel(ler) {
  try {
    const h = (JSON.parse(ler('vercel.json')).headers || []).find(x => x.source === '/orcamento');
    const v = h && h.headers.find(k => String(k.key).toLowerCase() === 'content-security-policy');
    return vazioViraNulo(v && v.value);
  } catch { return null; }
}

/* a <meta> de CSP em qualquer ordem dos atributos (http-equiv antes ou depois de content) */
function cspDaMeta(ler) {
  try {
    const tag = (ler('orcamento.html').match(/<meta\b[^>]*>/gi) || []).find(t => /http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(t));
    const m = tag && /\bcontent\s*=\s*"([^"]*)"/i.exec(tag);
    return vazioViraNulo(m && m[1]);
  } catch { return null; }
}

/* o _headers: a rota /orcamento (com ou sem barra final) e o nome do cabeçalho em qualquer caixa, como o HTTP */
function cspDoHeaders(ler) {
  try {
    const bloco = /^\/orcamento\/?[ \t]*\n((?:[ \t]+.*\n?)*)/m.exec(semFimDeLinhaDoWindows(ler('_headers')));
    const linha = bloco && /^[ \t]+content-security-policy:(.*)$/im.exec(bloco[1]);
    return vazioViraNulo(linha && linha[1]);
  } catch { return null; }
}

const FONTES_DA_CSP = [
  ['vercel.json', 'vercel.json', cspDoVercel],
  ['orcamento.html', 'orcamento.html (meta)', cspDaMeta],
  ['_headers', '_headers (Cloudflare)', cspDoHeaders]
];

/* as CSPs de /orcamento: [onde, texto]. Fonte que não existe fica de fora (o vercel.json some no PR que o apaga);
   fonte que EXISTE e não se deixa ler vem com texto null, e isso é FALTA (nunca ignorada em silêncio) */
export function cspsDoOrcamento({ ler, existe }) {
  return FONTES_DA_CSP.filter(([arquivo]) => existe(arquivo)).map(([, onde, lerCsp]) => [onde, lerCsp(ler)]);
}

/* as fontes de uma diretiva (null se a CSP não tem a diretiva) */
function diretiva(csp, nome) {
  const d = csp.split(';').map(x => x.trim()).find(x => x.toLowerCase().split(/\s+/)[0] === nome);
  return d ? d.split(/\s+/).slice(1) : null;
}

/* o connect-src de /orcamento tem de ter SÓ as fontes permitidas e o endereço exato do Supabase: nada de curinga, de * solto, de esquema solto (https:, wss:, data:...) nem de outro site */
function problemasDoConnect(connect) {
  const problemas = [];
  const exatos = connect.filter(t => SUPABASE_EXATO.test(t));
  const outras = connect.filter(t => /supabase/i.test(t) && !SUPABASE_EXATO.test(t));
  if (exatos.length > 1) problemas.push('o endereço aparece mais de uma vez');
  if (!exatos.length && !outras.length) problemas.push('o endereço do projeto não está no connect-src');
  if (outras.length) problemas.push('curinga ou endereço que não é o exato: ' + outras.join(' '));
  const fora = connect.filter(t => !SUPABASE_EXATO.test(t) && !/supabase/i.test(t) && !CONNECT_PERMITIDAS.includes(t.toLowerCase()));
  if (fora.length) problemas.push('fonte que não é da lista permitida (' + CONNECT_PERMITIDAS.join(', ') + '): ' + fora.join(' '));
  return problemas;
}

/* script-src (e -elem): só a lista permitida. style-src, default-src e as outras: nada de fonte aberta. Cada problema sai como "script-src: 'unsafe-inline'" */
function problemasDasDiretivasDeCodigo(csp) {
  const proibida = (nome, t) => (DIRETIVAS_POR_LISTA.includes(nome) ? !SCRIPT_PERMITIDAS.includes(t.toLowerCase()) : FONTE_ABERTA.test(t));
  return DIRETIVAS_DE_CODIGO.flatMap(nome => (diretiva(csp, nome) || []).filter(t => proibida(nome, t)).map(t => nome + ': ' + t));
}

const projetoDoConnect = connect => { const t = connect.find(x => SUPABASE_EXATO.test(x)); return t ? SUPABASE_EXATO.exec(t)[1] : null; };

function conferirCsp(onde, csp) {
  if (csp === null) return { itens: [item('FALTA', 'CSP de /orcamento não encontrada em ' + onde + ' (o arquivo existe, mas o formato não bate com o que o verificador lê)', 'confira se a CSP de /orcamento está nesse arquivo, no formato de sempre')], projeto: null };
  const itens = [];
  const connect = diretiva(csp, 'connect-src') || [];
  const problemas = problemasDoConnect(connect);
  if (problemas.length) itens.push(item('FALTA', 'CSP de /orcamento em ' + onde + ': o connect-src precisa do endereço EXATO do Supabase e de mais nada dele (' + problemas.join('; ') + ')', 'diga o endereço do projeto (https://<projeto>.supabase.co), troque o curinga nos três lugares e tire a fonte solta'));
  else itens.push(item('OK', 'CSP de /orcamento em ' + onde + ' com o endereço exato do Supabase'));
  const abertas = problemasDasDiretivasDeCodigo(csp);
  if (abertas.length) itens.push(item('FALTA', 'CSP de /orcamento em ' + onde + ' tem fonte que não pode estar em script ou estilo (' + abertas.join('; ') + ')', 'tire a fonte: só o próprio site e as origens que a página usa de verdade (Turnstile e SDK do Mercado Pago no script)'));
  if (!(diretiva(csp, 'img-src') || []).includes('blob:')) itens.push(item('FALTA', 'CSP de /orcamento em ' + onde + ' sem blob: no img-src (as miniaturas das fotos)', 'acrescente blob: ao img-src'));
  return { itens, projeto: problemas.length ? null : projetoDoConnect(connect) };
}

/* os lugares da CSP têm de apontar para o MESMO projeto: três projetos diferentes é um site que manda o material para o balde errado */
function itemDoMesmoProjeto(porLugar) {
  const projetos = [...new Set(porLugar.map(([, p]) => p))];
  if (projetos.length > 1) return item('FALTA', 'a CSP de /orcamento aponta para projetos diferentes do Supabase: ' + porLugar.map(([onde, p]) => onde + ' = ' + p).join(', '), 'os três lugares precisam ter o mesmo endereço');
  if (porLugar.length > 1) return item('OK', 'os ' + porLugar.length + ' lugares da CSP de /orcamento apontam para o mesmo projeto do Supabase');
  return null;
}

function itensCsp({ ler, existe, rodar }) {
  const itens = [];
  const porLugar = [];
  for (const [onde, csp] of cspsDoOrcamento({ ler, existe })) {
    const r = conferirCsp(onde, csp);
    itens.push(...r.itens);
    if (r.projeto) porLugar.push([onde, r.projeto]);
  }
  const mesmo = itemDoMesmoProjeto(porLugar);
  if (mesmo) itens.push(mesmo);
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

/* tira os comentários de um .js/.mjs sem se enganar com texto: percorre o código sabendo o que é string ('...', "...", crase), regex literal e comentário.
   Barra-asterisco dentro de texto não abre comentário. Na dúvida, o trecho FICA (errar para o lado de achar o BZ_ENTREGA, nunca de escondê-lo) */
const ANTES_DE_REGEX = /[(,=:[!&|?{};+\-*%<>~^]$|(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw|yield|await)\s*$/;
function pularTexto(t, i, aspa) {   /* devolve a posição logo depois do texto que começa em t[i] (a aspa); aspa simples ou dupla não atravessa linha */
  let k = i + 1;
  while (k < t.length && t[k] !== aspa) { if (t[k] === '\\') k++; else if (t[k] === '\n' && aspa !== '`') return k; k++; }
  return k + 1;
}
function pularRegex(t, i) {   /* devolve a posição logo depois da regex que começa em t[i] ("/"), ou i + 1 se não parecer uma regex (fica como estava) */
  let k = i + 1, classe = false;
  while (k < t.length && t[k] !== '\n') {
    if (t[k] === '\\') k++;
    else if (t[k] === '[') classe = true;
    else if (t[k] === ']') classe = false;
    else if (t[k] === '/' && !classe) return k + 1;
    k++;
  }
  return i + 1;
}
function semComentariosDeJs(texto) {
  let saida = '', i = 0;
  while (i < texto.length) {
    const c = texto[i], d = texto[i + 1];
    let fim = i + 1;
    if (c === '/' && d === '/') { while (fim < texto.length && texto[fim] !== '\n') fim++; i = fim; continue; }
    if (c === '/' && d === '*') { const f = texto.indexOf('*/', i + 2); i = f < 0 ? texto.length : f + 2; saida += ' '; continue; }
    if (c === "'" || c === '"' || c === '`') fim = pularTexto(texto, i, c);
    else if (c === '/' && (saida.trimEnd() === '' || ANTES_DE_REGEX.test(saida.trimEnd()))) fim = pularRegex(texto, i);
    saida += texto.slice(i, fim); i = fim;
  }
  return saida;
}
const semHashDeLinha = texto => semFimDeLinhaDoWindows(texto).split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
/* cada tipo de arquivo tem o seu jeito de comentar: .js/.mjs com o percurso acima; YAML só com # de linha inteira (um glob "a/*" não abre comentário); os demais, linha inteira de // ou # */
function semComentariosDoArquivo(nome, texto) {
  if (/\.m?js$/i.test(nome)) return semComentariosDeJs(texto);
  if (/\.ya?ml$/i.test(nome)) return semHashDeLinha(texto);
  return semComentarios(texto);
}
/* os arquivos das pastas de deploy (workflows e Worker) que mencionam o BZ_ENTREGA fora de comentário */
function mencionamOInterruptor({ ler, listar }) {
  return PASTAS_DE_DEPLOY.flatMap(([pasta, tipo]) => listar(pasta).filter(n => tipo.test(n)).map(n => pasta + '/' + n)
    .filter(f => /BZ_ENTREGA/.test(semComentariosDoArquivo(f, ler(f)))));
}

function itensDeploy(mundo) {
  const { ler, existe } = mundo;
  const ligados = ARQUIVOS_DE_DEPLOY.filter(f => existe(f) && /BZ_ENTREGA["']?\s*[=:]\s*["']?\s*ligada(?![\w-])/.test(semComentarios(ler(f))));
  const mexem = mencionamOInterruptor(mundo);
  if (!ligados.length && !mexem.length) return [item('OK', 'nenhum arquivo de deploy liga o BZ_ENTREGA (' + ARQUIVOS_DE_DEPLOY.filter(existe).join(', ') + '; e nenhum workflow de .github/workflows nem arquivo de cloudflare/ o menciona)')];
  return [
    ...ligados.map(f => item('FALTA', 'BZ_ENTREGA ligada em ' + f, 'o interruptor só liga nas variáveis do Worker, por quem decidiu ligar, nunca em arquivo do repositório')),
    ...mexem.map(f => item('FALTA', 'BZ_ENTREGA mencionada em ' + f + ': workflow e Worker não mexem no interruptor (pode ligar a entrega sem o dono)', 'tire a menção; o interruptor só liga nas variáveis do Worker, por quem decidiu ligar'))
  ];
}

/* a BZ_BASE pode trazer usuário:senha ou parâmetro; ao mostrar, só a origem (esquema + host), ou que nem é um endereço */
function origemParaMostrar(base) {
  try { const u = new URL(String(base)); return u.origin === 'null' ? u.protocol : u.origin; }
  catch { return 'um texto que não é um endereço'; }
}

function itensHosts({ base, existe }) {
  const itens = [];
  try { itens.push(item('OK', 'a BZ_BASE do dono (' + validarBase(base) + ') é aceita por scripts/direcoes.mjs')); }
  catch { itens.push(item('FALTA', 'a BZ_BASE do dono (' + origemParaMostrar(base) + ') é recusada por scripts/direcoes.mjs (lista de hosts)', 'use o endereço do site (https://beyonzero.com.br) ou o servidor local')); }
  const staging = hostDoStaging();
  itens.push(item('CONFIRMAR', staging
    ? 'o ensaio rodou no staging ' + staging + ', que scripts/direcoes.mjs aceita como BZ_BASE'
    : 'o staging está fechado para a chave do painel (SUB_CONTA em docs/acesso.mjs ainda é null): diga o subdomínio workers.dev da sua conta para o ensaio usar o staging com BZ_BASE', ''));
  if (HOSTS_VERCEL.length && !existe('vercel.json')) itens.push(item('FALTA', 'o vercel.json saiu e a lista HOSTS_VERCEL de scripts/direcoes.mjs ainda aceita ' + HOSTS_VERCEL.join(', '), 'tire esses hosts da lista: um nome *.vercel.app liberado pode ser registrado por outra pessoa e receberia a PAINEL_CHAVE'));
  else if (HOSTS_VERCEL.length) itens.push(item('CONFIRMAR', 'quando o projeto da Vercel for apagado, ' + HOSTS_VERCEL.join(', ') + ' sai de HOSTS_VERCEL em scripts/direcoes.mjs (o teste fica vermelho no PR que apaga o vercel.json)', ''));
  return itens;
}

/* conclusão do agente que o dono confirma: as linhas do grupo saem sob UM cabeçalho (ver formatar) */
const conclusao = (texto, acao = '') => ({ ...item('CONFIRMAR', texto, acao), grupo: 'conclusoes' });
const CABECALHO_DO_GRUPO = { conclusoes: 'O agente concluiu sozinho no 3b-3b; confirme cada um:' };

/* o que nenhum arquivo prova: banco real, conta, código da captação, ensaio */
const DO_DONO = [
  item('CONFIRMAR', 'as ' + MIGRATIONS.length + ' migrations estão aplicadas no Supabase REAL, na ordem acima', "antes da 4ª do 3b-2, confira: select count(*) from app.conversas c where c.etapa = 'em_producao' and not exists (select 1 from app.entregas e where e.conversa_id = c.id);"),
  item('CONFIRMAR', 'o balde "material" existe (supabase/storage/material.sql) e scripts/conferir-armazem.mjs deu OK em todas as linhas, inclusive o logout global', ''),
  item('CONFIRMAR', 'a tabela ativa tem sinal_percentual 40 (npm run validar:regras) e a migration do 3b-1 foi aplicada', ''),
  item('CONFIRMAR', 'a captação aceita os valores da tabela normal e a venda do site (importar-site, ou o passo manual que você aceitou)', ''),
  item('CONFIRMAR', 'a captação conta só feriados nacionais (mais a Sexta-feira Santa) e aceita o prazo da proposta de 1 a 60 dias úteis (sem trava de prazo desde 28/10)', 'em 28/10 a captação ainda recusava fora de 5 a 10 (clientes/fechamento.mjs, PRAZO_SITE): proposta acima de 10 dias não entra na esteira até ela mudar'),
  item('CONFIRMAR', 'o código da captação cumpre o que você decidiu em 22/10: material parado sem publicar e sem encerrar o pedido (nada de sem_material), e o site sai do ar à 00:00 depois dos 3 dias, com os 2 lembretes registrados', 'sem isso o contrato promete o que a captação ainda não faz'),
  item('CONFIRMAR', 'o ensaio completo rodou com Mercado Pago e Supabase de TESTE, sem FALHA, e os PNG a 390 e 320 px foram vistos', ''),
  item('CONFIRMAR', 'o seu PC tem PAINEL_CHAVE e BZ_BASE na janela do terminal (nunca em arquivo)', ''),
  conclusao('entrada estornada ou contestada não abre o restante (o site recusa e manda o cliente falar com você)'),
  conclusao('"parado" recomeça a contar se o cliente mexer no material'),
  conclusao('você avisa o cliente 30 dias antes de apagar o material parado há 6 meses; sem o seu aviso, nada é apagado'),
  conclusao('quem deu a autorização completa (número, caixa e estado) nunca tem o material apagado nem avisado; a /privacidade precisa dizer isso'),
  conclusao('a prova da autorização do contato do site (WhatsApp ou e-mail, data e versão do aceite) fica guardada à parte e sobrevive à lista de ajustes', 'é dado pessoal: decida por quanto tempo essa prova fica guardada')
];

export function verificar(mundo) {
  return [
    ...itensMigrations(mundo), DO_DONO[0], DO_DONO[1],
    ...itensCsp(mundo), ...itensPrivacidade(mundo), ...itensCaptacao(mundo), ...itensDeploy(mundo), ...itensHosts(mundo),
    ...DO_DONO.slice(2)
  ];
}
export const temFalta = itens => itens.some(i => i.estado === 'FALTA');

/* as linhas que o terminal mostra */
const linhaDoItem = i => i.estado.padEnd(9) + ' ' + i.texto + (i.acao ? '\n          → ' + i.acao : '');
export const formatar = itens => itens.flatMap((i, k) => (i.grupo && i.grupo !== (itens[k - 1] || {}).grupo ? ['\n' + CABECALHO_DO_GRUPO[i.grupo], linhaDoItem(i)] : [linhaDoItem(i)]));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pastaCaptacao = process.env.BZ_CAPTACAO || path.resolve(raiz, '../captacao');
  const lerEm = pasta => f => fs.readFileSync(path.join(pasta, f), 'utf8');
  const itens = verificar({
    ler: lerEm(raiz), existe: f => fs.existsSync(path.join(raiz, f)),
    listar: pasta => {   /* todos os arquivos da pasta, subpastas incluídas, como "sub/a.mjs" */
      const base = path.join(raiz, pasta);
      try { return fs.readdirSync(base, { recursive: true, withFileTypes: true }).filter(d => d.isFile()).map(d => path.relative(base, path.join(d.parentPath, d.name)).split(path.sep).join('/')); } catch { return []; }
    },
    rodar: f => spawnSync(process.execPath, ['--test', path.join(raiz, f)], { cwd: raiz, stdio: 'ignore', windowsHide: true }).status,
    captacao: fs.existsSync(path.join(pastaCaptacao, 'config', 'entrega.json')) ? lerEm(pastaCaptacao) : null,
    base: process.env.BZ_BASE || 'https://beyonzero.com.br'
  });
  for (const linha of formatar(itens)) console.log(linha);
  console.log(temFalta(itens) ? '\nNÃO LIGUE: há FALTA acima.' : '\nNenhum FALTA. Ligue só depois de confirmar cada CONFIRMAR: BZ_ENTREGA=ligada nas variáveis do Worker.');
  process.exit(temFalta(itens) ? 1 : 0);
}
