/* ==========================================================================
   O COMANDO DA FILA MANUAL (decisão do dono, 2026-10-08). Procedimento:
   .claude/skills/produzir-direcoes/SKILL.md.

   Os comandos abaixo aparecem como "node scripts/direcoes.mjs" só para encurtar: o DONO sempre roda com o caminho ABSOLUTO
   do script (o "pedido" imprime a linha pronta do entregar-pedido), e NUNCA "node scripts/..." relativo de dentro da pasta
   de um pedido, onde o arquivo seria o que a sessão deixou lá (revisão de segurança do PR 43).

   Com a chave do painel (o DONO roda, no terminal dele — a sessão do Claude
   Code que lê o briefing nunca tem a chave; revisão de segurança):
     node scripts/direcoes.mjs fila
     node scripts/direcoes.mjs pedido <8+ caracteres do pedido>
     node scripts/direcoes.mjs entregar-pedido <8+ caracteres do pedido>
     node scripts/direcoes.mjs ajustes
     node scripts/direcoes.mjs ajuste-feito <id do ajuste> "<pasta do ajuste>/versao.json"
     node scripts/direcoes.mjs ajuste-recusado <id do ajuste>
     node scripts/direcoes.mjs limpar [dias, padrão 3]
   Sem chave (também do dono: a sessão do Claude Code NÃO tem terminal, não roda comando nenhum; o conferir é uma comodidade
   para olhar um arquivo antes de entregar, e o entregar-pedido confere tudo de qualquer jeito):
     node scripts/direcoes.mjs conferir <arquivo.json> <conversao|autoridade|experiencia>

   Ambiente do dono: BZ_BASE (o site, https) e PAINEL_CHAVE (nunca em arquivo).
   PRIVACIDADE: o pedido gravado para o modelo leva o briefing (com nome,
   telefone e e-mail do cliente apagados, mesmo escritos dentro dele), o
   escopo e as estratégias — nunca o contato (privacidade.html, orçamento).
   A pasta fica FORA do repositório (~/BeyonZero-direcoes) e é apagada depois
   da entrega.
   ========================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { higienizar, ESTRATEGIAS, ESQUEMA_DIRECAO } from '../api/_vendas/direcao.mjs';
import { SISTEMA_GERACAO, REGRA_BRIEFING, briefingDelimitado } from '../api/_vendas/gerador.mjs';
import { redigir } from '../api/_vendas/seguranca.mjs';
import { configSessao, comandoSessao, instrucoesSessao, linhaDoDono } from './sessao-isolada.mjs';
import { FORMATOS } from '../api/_vendas/precos.mjs';
import { varrer, textosDe } from './varredura.mjs';

export const PASTA = path.join(os.homedir(), 'BeyonZero-direcoes');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* para onde a chave do painel pode ir: o site (e as prévias da Vercel) por https; o servidor local por http */
/* AO TROCAR DE DOMÍNIO (o .com.br próprio): acrescentar o host aqui e no teste de validarBase */
const HOSTS = [/^beyon0-site\.vercel\.app$/, /^beyon0-site-[a-z0-9-]+-beyond0\.vercel\.app$/];
/* partes do nome que não identificam ninguém (ficam no briefing: "Moda dos anos 80") */
const NAO_E_NOME = new Set(['dos', 'das', 'del', 'van', 'von']);
const LOCAIS = ['127.0.0.1', 'localhost'];
const TEMPO_MS = 20000;

export const idCurto = id => String(id).slice(0, 8);

const ARQUIVOS_DE_DIRECAO = ['conversao.json', 'autoridade.json', 'experiencia.json'];
const ARQUIVOS_DO_PEDIDO = ['pedido.json', '.sessao.json', '.instrucoes.md', ...ARQUIVOS_DE_DIRECAO];
const ARQUIVOS_DO_AJUSTE = ['ajuste.json', 'versao.json', '.sessao.json', '.instrucoes.md'];
/* O arquivo REAL de uma direção dentro da pasta (já real) de um pedido, ou null. Cada checagem pega uma coisa:
   - realpath (feito por quem chama) pega link simbólico ou junção no caminho OU no próprio arquivo: o caminho real é
     o do destino, e se ele não fica direto dentro da pasta do pedido, recusa;
   - o nome real tem de ser um dos três arquivos de direção (um link para outro arquivo da MESMA pasta mostra o nome do alvo);
   - lstat: tem de ser arquivo comum (não pasta nem dispositivo) com nlink 1. O hard link não aparece no realpath (é outro
     nome do mesmo conteúdo): só o nlink acima de 1 o denuncia, e ele deixaria o conferir e a entrega lerem (e mandarem ao
     painel) um arquivo de fora da pasta
   (o ajuste usa a mesma conferência para o versao.json) */
function direcaoReal(real, pastaReal, nomes = ARQUIVOS_DE_DIRECAO) {
  if (path.relative(pastaReal, path.dirname(real)) !== '' || !nomes.includes(path.basename(real))) return null;
  const st = fs.lstatSync(real);
  return st.isFile() && st.nlink === 1 ? real : null;
}

/* o conferir (comando do dono) só pode abrir o arquivo de direção de um pedido,
   isto é, <raiz>/<8 hex>/<estrategia>.json, comparando caminhos já resolvidos (sem ".." sobrando) */
export function arquivoDeDirecao(arquivo, raiz = PASTA) {
  const recusa = () => new Error('Só confiro conversao.json, autoridade.json ou experiencia.json dentro da pasta de um pedido.');
  let real, raizReal;
  try { real = fs.realpathSync(path.resolve(String(arquivo))); raizReal = fs.realpathSync(path.resolve(raiz)); } catch { throw recusa(); }
  const partes = path.relative(raizReal, real).split(path.sep);
  if (partes.length !== 2 || !/^[0-9a-f]{8}$/.test(partes[0])) throw recusa();
  const achado = direcaoReal(real, path.join(raizReal, partes[0]));
  if (!achado) throw recusa();
  return achado;
}

/* o mesmo para a entrega: o arquivo de direção que a pasta (já aberta pelo comando) diz ter, ou null */
function arquivoDaPasta(arquivo, pasta) {
  try { return direcaoReal(fs.realpathSync(arquivo), fs.realpathSync(pasta)); } catch { return null; }
}

/* a pasta de trabalho de um pedido tem de ser uma pasta de verdade: se for um link ou uma junção, o que o preparo grava
   e APAGA (a .claude, o CLAUDE.md) cairia no destino, que pode ser a casa do usuário. Devolve o caminho real */
export function pastaReal(dir) {
  const pedida = path.resolve(String(dir));
  let real;
  try { real = fs.realpathSync(pedida); } catch { throw new Error('A pasta ' + pedida + ' não existe.'); }
  /* no Windows maiúsculas e minúsculas são o mesmo caminho */
  const igual = process.platform === 'win32' ? real.toLowerCase() === pedida.toLowerCase() : real === pedida;
  if (fs.lstatSync(pedida).isSymbolicLink() || !igual) throw new Error('A pasta ' + pedida + ' é um link ou junção para outro lugar: nada foi gravado nem apagado. Apague o link e rode de novo.');
  return real;
}

/* grava um arquivo NOVO: apaga antes (um link plantado no lugar sairia daqui sem tocar o alvo; escrever "através" dele
   mudaria o arquivo de fora, e um hard link some do diretório ao ser apagado) e grava com wx, que não abre nada existente */
function gravarNovo(arquivo, texto) {
  fs.rmSync(arquivo, { recursive: true, force: true });
  fs.writeFileSync(arquivo, texto, { mode: 0o600, flag: 'wx' });
  return arquivo;
}

/* cria a pasta (e as de cima) com erro em português: uma junção quebrada ou em laço, ou um arquivo no lugar da pasta, saía como
   ENOENT, ELOOP ou EEXIST em inglês, sem dizer o que fazer */
function criarPasta(dir) {
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch {
    throw new Error('Não deu para criar a pasta ' + dir + ' (é um link ou junção quebrada, ou já existe um arquivo com esse nome?): nada foi gravado. Apague o que está lá e rode de novo.');
  }
}

/* o comando "pedido": cria a pasta do pedido (e a raiz) e grava o pedido.json; devolve o caminho dele. A raiz e a pasta
   não podem ser link nem junção (cai tudo no destino) */
export function gravarPedido(dir, texto) {
  criarPasta(path.dirname(dir));
  pastaReal(path.dirname(dir));
  criarPasta(dir);
  pastaReal(dir);
  return gravarNovo(path.join(dir, 'pedido.json'), texto);
}

/* o comando "ajustes": a pasta de um pedido livre (o id curto do AJUSTE, que o "limpar" também apaga) com o ajuste.json
   (o que a sessão lê) e o versao.json (a versão atual, que a sessão reescreve). Raiz e pasta não podem ser link nem junção */
export function gravarAjuste(dir, ajusteTexto, versaoTexto) {
  criarPasta(path.dirname(dir));
  pastaReal(path.dirname(dir));
  criarPasta(dir);
  pastaReal(dir);
  gravarNovo(path.join(dir, 'ajuste.json'), ajusteTexto);
  return gravarNovo(path.join(dir, 'versao.json'), versaoTexto);
}

/* o Claude Code lê o CLAUDE.md (e o CLAUDE.local.md) de TODAS as pastas acima da de trabalho, até a raiz do disco; a
   .claude acima conta também, menos a da casa do usuário (ali é a configuração dele) */
export function configsAcima(dir, casa = os.homedir()) {
  const achados = [];
  for (let p = path.dirname(path.resolve(dir)); ; p = path.dirname(p)) {
    for (const n of ['CLAUDE.md', 'CLAUDE.local.md']) if (fs.existsSync(path.join(p, n))) achados.push(path.join(p, n));
    if (path.resolve(p) !== path.resolve(casa) && fs.existsSync(path.join(p, '.claude'))) achados.push(path.join(p, '.claude'));
    if (path.dirname(p) === p) return achados;
  }
}
/* prepara a pasta onde a sessão isolada vai trabalhar: o Claude Code carrega dali configuração, memória e MCP, então o
   que estiver plantado é apagado; settings e instruções são gravados por último, depois de checar a SKILL de origem.
   As pastas ACIMA até a raiz do disco não se apagam daqui: o Claude Code também lê o CLAUDE.md e o .claude de todas elas,
   então, se existirem lá, o preparo recusa (antes de tocar em qualquer coisa) e pede ao dono que os tire.
   No Windows o modo 0o600 não vale: a proteção real é a pasta ficar fora do repositório, no perfil do dono */
export function prepararPastaSessao({ dir, repo, casa = os.homedir(), tarefa = 'direcoes' }) {
  const origem = path.join(repo, '.claude', 'skills', 'produzir-direcoes', 'SKILL.md');
  if (!fs.existsSync(origem)) throw new Error('Falta a SKILL ' + origem + ': não dá para montar as instruções da sessão isolada.');
  const real = pastaReal(dir);
  const acima = [...new Set([...configsAcima(dir, casa), ...configsAcima(real, casa)])];
  if (acima.length) throw new Error('A sessão isolada leria estas instruções de pastas acima: ' + acima.join(', ') + '. Apague (ou mova) antes.');
  const skill = fs.readFileSync(origem, 'utf8');
  /* apaga o que o Claude Code carregaria dali (o .sessao.json e o .instrucoes.md são apagados pelo gravarNovo, logo antes de gravar) */
  for (const n of ['.claude', 'CLAUDE.md', 'CLAUDE.local.md', '.mcp.json', '.conferir.mjs']) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  const settings = gravarNovo(path.join(dir, '.sessao.json'), JSON.stringify(configSessao({ repo, tarefa }), null, 2));
  const instrucoes = gravarNovo(path.join(dir, '.instrucoes.md'), instrucoesSessao({ skill, tarefa }));
  return { settings, instrucoes };
}

export function validarBase(valor) {
  let u;
  try { u = new URL(String(valor || '')); } catch { throw new Error('BZ_BASE inválido: use o endereço do site, ex.: https://beyon0-site.vercel.app'); }
  const local = LOCAIS.includes(u.hostname) && u.protocol === 'http:';
  const site = u.protocol === 'https:' && HOSTS.some(h => h.test(u.hostname));
  if (u.username || u.password || !(local || site)) throw new Error('BZ_BASE não é o site da Beyon Zero (https) nem o servidor local: a chave do painel não sai daqui.');
  return u.origin;
}

/* apaga do texto o que identifica o cliente: o filtro de dados pessoais da conversa + o nome, o e-mail e o telefone
   EXATOS do contato (o visitante pode tê-los escrito no meio do briefing) */
function apagador(contato) {
  const c = contato || {};
  const letra = '\\p{L}';
  const partes = String(c.nome || '').split(/\s+/).filter(x => x.length >= 3 && !NAO_E_NOME.has(x.toLowerCase())).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const nome = partes.length ? new RegExp('(?<!' + letra + ')(' + partes.join('|') + ')(?!' + letra + ')', 'giu') : null;
  const email = c.email ? new RegExp(String(c.email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
  const ult = String(c.telefone || '').replace(/\D/g, '').slice(-8);
  const telefone = ult.length === 8 ? new RegExp(ult.split('').join('[\\s.-]?'), 'g') : null;
  return texto => {
    let t = redigir(texto);
    if (email) t = t.replace(email, '[e-mail]');
    if (telefone) t = t.replace(telefone, '[telefone]');
    if (nome) t = t.replace(nome, '[nome]');
    return t;
  };
}
const limparProfundo = (v, apagar) => (typeof v === 'string' ? apagar(v)
  : Array.isArray(v) ? v.map(x => limparProfundo(x, apagar))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limparProfundo(x, apagar)])) : v);

/* o que o modelo pode ver de um pedido */
export function pedidoParaModelo(p) {
  if (!UUID.test(String(p.conversa_id))) throw new Error('Pedido inválido (id fora do formato).');
  return {
    pedido: idCurto(p.conversa_id),
    pedido_em: p.pedido_em,
    /* (o selo de texto suspeito, FORA do briefing: a sessão que produz o vê e trata o briefing com mais cuidado) */
    suspeito: p.suspeito === true,
    /* (revisão de segurança do lote 1, auditoria 2026-10-09) a mesma marca e o mesmo escape do gerador automático: o
       visitante não fecha a marca para escrever fora dela; a regra vem antes do briefing */
    regra: REGRA_BRIEFING,
    briefing: briefingDelimitado(limparProfundo(p.briefing || {}, apagador(p.contato))),
    formato_e_escopo: { formato: p.fatores?.formato || null, paginas: p.fatores?.paginas || null, adicionais: p.fatores?.adicionais || {} },
    direcoes: (p.direcoes || []).map(d => ({ id: d.id, numero: d.numero, estrategia: d.estrategia, status: d.status, instrucao: ESTRATEGIAS[d.estrategia] || null }))
  };
}
/* o arquivo inteiro que o modelo lê: o pedido sem contato + as instruções da geração automática */
export const montarArquivoPedido = p => ({ ...pedidoParaModelo(p), instrucoes: { sistema: SISTEMA_GERACAO, esquema: ESQUEMA_DIRECAO, estrategias: ESTRATEGIAS } });

/* o que a sessão isolada lê de um pedido livre (PR 3a): o texto do cliente na MESMA moldura de dado do briefing (redigido
   de novo, como o briefing; o servidor já redigiu no envio), a estratégia, a base e as instruções da geração. Sem contato */
const COMO_AJUSTAR = 'Grave em versao.json a versão nova do site: parta da versão que já está lá e mude só o que o pedido de ajuste pede e o esquema permite. O que não couber (preço, item da tabela, algo fora do site), não faça: avise o dono.';
export function ajusteParaModelo(a) {
  if (!UUID.test(String(a.alteracao_id)) || !UUID.test(String(a.conversa_id))) throw new Error('Ajuste inválido (id fora do formato).');
  return {
    ajuste: idCurto(a.alteracao_id),
    pedido: idCurto(a.conversa_id),
    pedido_em: a.pedido_em,
    suspeito: a.suspeito === true,
    base_id: UUID.test(String(a.base_id)) ? a.base_id : null,
    regra: REGRA_BRIEFING,
    briefing: briefingDelimitado({ pedido_de_ajuste: redigir(String(a.texto || '')) }),
    estrategia: Object.hasOwn(ESTRATEGIAS, String(a.estrategia)) ? a.estrategia : null,
    instrucoes: { sistema: SISTEMA_GERACAO, esquema: ESQUEMA_DIRECAO, como: COMO_AJUSTAR }
  };
}

export function acharPedido(fila, prefixo) {
  const p = String(prefixo || '').trim().toLowerCase();
  if (p.length < 8) throw new Error('Informe pelo menos os 8 primeiros caracteres do pedido.');
  const achados = fila.filter(x => String(x.conversa_id).toLowerCase().startsWith(p));
  if (!achados.length) throw new Error('Pedido ' + p + ' não está na fila.');
  if (achados.length > 1) throw new Error('Mais de um pedido começa com ' + p + ': use mais caracteres.');
  return achados[0];
}

/* TUDO o que o conferir e o entregar-pedido imprimem e que veio de arquivo da pasta (escrita pela sessão do desconhecido)
   passa por aqui: controles (ESC e as sequências de cor/cursor), marcas e controles de direção, invisíveis e uso privado
   viram "?" (a nova linha fica) e o corte é em 300. Sem isso o texto do modelo mexeria no terminal do dono ou o faria ler
   uma coisa diferente do que está escrito. */
export function paraTerminal(s, max = 300) {
  return Array.from(String(s ?? '').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Default_Ignorable_Code_Point}]/gu, c => (c === '\n' ? c : '?'))).slice(0, max).join('');
}

/* o que o dono lê antes de digitar o código: cada texto da direção com o seu caminho e a paleta INTEIRA numa linha só
   (as cores também são conteúdo que sai). Cada linha começa com "| " para não se confundir com instrução. O teto é 1000,
   não 300: o maior texto de uma direção tem 700 e o dono não pode aprovar o que não viu inteiro */
const LEITURA_DO_DONO = 1000;
export function linhasDaDirecao(direcao) {
  const paleta = Object.entries(direcao?.identidade?.paleta || {}).map(([nome, cor]) => paraTerminal(nome, 40) + ' ' + paraTerminal(cor, 40)).join(', ');
  const linhas = paleta ? ['| paleta: ' + paleta] : [];
  for (const t of textosDe(direcao)) {
    if (t.texto && !t.caminho.startsWith('identidade.paleta.')) linhas.push('| ' + paraTerminal(t.caminho, 120) + ': ' + paraTerminal(t.texto, LEITURA_DO_DONO));
  }
  return linhas;
}

/* JSON de arquivo da pasta (escrita pela sessão): o erro do JSON.parse cita pedaços do texto, então a mensagem é fixa */
function lerJson(arquivo, nome) {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { throw new Error(nome + ' não é um JSON válido.'); }
}

/* o mesmo filtro do servidor, antes de entregar */
export function conferir(conteudo, estrategia) {
  /* mensagem FIXA: o argumento vem da sessão do desconhecido e não pode voltar na saída (revisão de segurança do PR 43) */
  if (!Object.hasOwn(ESTRATEGIAS, estrategia)) return { erro: 'estratégia desconhecida (use conversao, autoridade ou experiencia)' };
  return higienizar(conteudo, estrategia);
}

/* a entrega do pedido inteiro: cada direção na fila pelo SEU arquivo (<estrategia>.json), conferido; o id vem do
   pedido.json, nunca digitado (revisão técnica: arquivo errado no id errado era irreversível). Falta ou recusa = nada sai.
   servidor = { todos, naFila }: os ids do pedido NA FILA DO SERVIDOR (o pedido.json fica numa pasta onde o modelo
   escreve; revisões de segurança e técnica) — id de fora do pedido recusa tudo; o que já foi entregue não sai de novo
   (retoma depois de uma queda no meio) */
export function planejarEntrega(pasta, servidor) {
  /* a própria pasta não pode ser link nem junção: os arquivos abaixo são comparados com ela, então leriam de fora */
  pastaReal(pasta);
  /* a pasta é onde a sessão escreve: qualquer coisa fora desta lista (um scripts/ plantado, por exemplo) e nada sai */
  const estranhos = fs.readdirSync(pasta).filter(n => !ARQUIVOS_DO_PEDIDO.includes(n)).sort();
  if (estranhos.length) throw new Error('A pasta do pedido tem arquivos que não deviam estar lá (' + estranhos.join(', ') + '): nada sai. Apague a pasta e rode "pedido" de novo.');
  const pedido = lerJson(path.join(pasta, 'pedido.json'), 'pedido.json');
  if (servidor && pedido.direcoes.some(d => !servidor.todos.has(d.id))) throw new Error('Os ids do pedido.json não batem com a fila do servidor: rode "pedido" de novo.');
  const aEntregar = pedido.direcoes.filter(d => (servidor ? servidor.naFila.has(d.id) : d.status === 'gerando'));
  return aEntregar.map(d => {
    const candidato = path.join(pasta, d.estrategia + '.json');
    if (!fs.existsSync(candidato)) throw new Error('Falta ' + d.estrategia + '.json na pasta do pedido.');
    /* é o caminho que ENVIA ao painel: só o arquivo comum desta pasta, nunca link, junção nem hard link para fora */
    const arquivo = arquivoDaPasta(candidato, pasta);
    if (!arquivo || path.basename(arquivo) !== d.estrategia + '.json') throw new Error(paraTerminal(d.estrategia) + '.json não é um arquivo comum desta pasta (link, junção ou cópia de outro lugar): nada sai.');
    const conteudo = lerJson(arquivo, d.estrategia + '.json');
    const h = conferir(conteudo, d.estrategia);
    if (h.erro) throw new Error(d.estrategia + '.json recusado pelo filtro: ' + h.erro);
    const achados = varrer(h.direcao);
    if (achados.length) throw new Error(d.estrategia + '.json recusado pela varredura: ' + achados.map(a => a.tipo + ' em ' + a.caminho).join('; '));
    if (conteudo.estrategia && conteudo.estrategia !== d.estrategia) throw new Error(d.estrategia + '.json diz ser de outra estratégia.');
    return { id: d.id, estrategia: d.estrategia, arquivo, conteudo, direcao: h.direcao };
  });
}

/* o comando "conferir" inteiro, sem imprimir nem mexer no código de saída, para o comando do dono e os testes usarem a mesma
   lógica: { ok, linha }. Nada do que veio de argumento ou de arquivo é repetido (mensagens fixas) e a linha passa por paraTerminal */
export function executarConferir(arquivo, estrategia, raiz = PASTA) {
  let caminho;
  try { caminho = arquivoDeDirecao(arquivo, raiz); } catch (e) { return { ok: false, linha: 'RECUSADA: ' + paraTerminal(e.message) }; }
  let direcao;
  try { direcao = JSON.parse(fs.readFileSync(caminho, 'utf8')); } catch { return { ok: false, linha: 'RECUSADA: o arquivo não é um JSON de direção válido.' }; }
  const r = avaliarArquivo(direcao, estrategia);
  return { ok: r.ok, linha: paraTerminal(r.mensagem, 600) };
}

/* a decisão do comando "conferir", separada para poder ser provada: { ok, mensagem } */
export function avaliarArquivo(conteudo, estrategia) {
  const h = conferir(conteudo, estrategia);
  if (h.erro) return { ok: false, mensagem: 'RECUSADA: ' + h.erro };
  /* o resto da saída leva texto do arquivo (nome do conceito, caminho, trecho): passa por paraTerminal */
  const achados = varrer(h.direcao);
  if (achados.length) return { ok: false, mensagem: 'RECUSADA pela varredura: ' + achados.map(a => a.tipo + ' em ' + paraTerminal(a.caminho) + ' ("' + paraTerminal(a.trecho) + '")').join('; ') };
  return { ok: true, mensagem: 'OK' + (h.ajustes.length ? ' (o filtro corrigiu: ' + h.ajustes.join(', ') + ')' : '') + ' · ' + h.direcao.secoes.length + ' seções · "' + paraTerminal(h.direcao.nome_conceito) + '"' };
}

/* A CONFIRMAÇÃO DO DONO: o código muda a cada pergunta, então "echo ENTREGAR | ..." não entrega nada; só vale a resposta
   exata ao código de agora. Resposta vazia ou terminal fechado = não entrega. O código sorteado é um freio contra
   confirmação automática por pipe ou eco, não contra um programa que lê a tela; a defesa real é que a sessão que lê o
   briefing não tem a chave do painel nem o comando. */
const ALFABETO_CODIGO = 'ACDEFGHJKMNPQRTUVWXY34679';
export function codigoAleatorio() {
  let codigo = 'ENTREGAR-';
  for (let i = 0; i < 4; i++) codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return codigo;
}

export async function pedirConfirmacao(perguntar, gerar = codigoAleatorio, acao = 'entregar') {
  const codigo = gerar();
  try {
    const resposta = await perguntar('\nLeia o texto acima. Para ' + acao + ', digite ' + codigo + ': ');
    return typeof resposta === 'string' && resposta.trim() === codigo;
  } catch {
    return false;
  }
}

/* o terminal do dono: a pergunta resolve vazia se o stdin fechar (sem isso o await ficaria pendurado) */
export function criarPerguntador(entrada = process.stdin, saida = process.stdout) {
  const rl = createInterface({ input: entrada, output: saida });
  const fechou = new Promise(resolver => rl.once('close', () => resolver('')));
  return { perguntar: texto => Promise.race([rl.question(texto), fechou]), fechar: () => rl.close() };
}

/* apaga as pastas de pedido mais velhas que N dias (a retenção do site é de 2 meses; aqui, dias) */
export function limparPastas(raiz, dias) {
  if (!fs.existsSync(raiz)) return [];
  const limite = Date.now() - dias * 864e5;
  return fs.readdirSync(raiz, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^[0-9a-f]{8}$/i.test(e.name) && fs.statSync(path.join(raiz, e.name)).mtimeMs < limite)
    .map(e => { fs.rmSync(path.join(raiz, e.name), { recursive: true, force: true }); return e.name; });
}

/* a entrega inteira, sem terminal nem rede próprios (os testes provam: recusa = nenhum POST). Devolve o que saiu */
export async function entregarPedido({ prefixo, raiz = PASTA, painel, perguntar, log = console.log }) {
  const p = String(prefixo || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}/.test(p)) throw new Error('Informe os 8 primeiros caracteres do pedido.');
  const pasta = path.join(raiz, p.slice(0, 8));
  const doServidor = acharPedido((await painel('GET', '?fila=direcoes')).fila, p);
  const plano = planejarEntrega(pasta, { todos: new Set(doServidor.direcoes.map(d => d.id)), naFila: new Set(doServidor.direcoes.filter(d => d.status === 'gerando').map(d => d.id)) });
  if (!plano.length) { fs.rmSync(pasta, { recursive: true, force: true }); log('Nada a entregar: as direções deste pedido já estão prontas. Pasta apagada; avise o cliente pelo painel.'); return { entregues: [], pendentes: 0 }; }
  /* o terminal é do DONO: ele lê o texto que vai sair e digita a palavra; cada linha começa com "| " para não se confundir com instrução */
  for (const e of plano) {
    log('\n=== ' + e.estrategia + ': "' + paraTerminal(e.direcao.nome_conceito) + '" ===');
    for (const linha of linhasDaDirecao(e.direcao)) log(linha);
  }
  if (!(await pedirConfirmacao(perguntar))) { log('Nada foi entregue.'); return { entregues: [], pendentes: null }; }
  let pendentes = null;
  const entregues = [];
  for (const e of plano) {
    const r = await painel('POST', '', { entregar_direcao: e.id, conteudo: e.conteudo });
    pendentes = r.pendentes;
    entregues.push(e.estrategia);
    log('Entregue: ' + e.estrategia + (r.ajustes.length ? ' (o filtro corrigiu: ' + r.ajustes.join(', ') + ')' : ''));
  }
  if (pendentes === 0) { fs.rmSync(pasta, { recursive: true, force: true }); log('As 3 prontas. Pasta do pedido apagada. Avise o cliente pelo painel ("Preparar aviso").'); }
  else log('Ainda há direção na fila deste pedido.');
  return { entregues, pendentes };
}

/* a entrega de um pedido livre feito (PR 3a), sem terminal nem rede próprios: recusa = nenhum POST. A pasta é a do id
   curto do ajuste; o arquivo tem de ser o versao.json REAL dela; a base anotada no ajuste.json tem de ser a de agora no
   servidor (o cliente pode ter ajustado depois); o texto passa pelo filtro e pela varredura e o dono lê tudo antes. O texto
   do CLIENTE não vai para o terminal (só campos de lista fechada nele, como na linhaDaFila): o dono o lê no ajuste.json */
export async function entregarAjuste({ id, arquivo, raiz = PASTA, painel, perguntar, log = console.log }) {
  if (!UUID.test(String(id))) throw new Error('Informe o id inteiro do ajuste (a linha que o "ajustes" imprimiu).');
  const pasta = path.join(raiz, idCurto(id));
  pastaReal(pasta);
  const estranhos = fs.readdirSync(pasta).filter(n => !ARQUIVOS_DO_AJUSTE.includes(n)).sort();
  if (estranhos.length) throw new Error('A pasta do ajuste tem arquivos que não deviam estar lá (' + estranhos.map(n => paraTerminal(n, 60)).join(', ') + '): nada sai. Apague a pasta e rode "ajustes" de novo.');
  let real = null;
  try { real = direcaoReal(fs.realpathSync(path.resolve(String(arquivo))), fs.realpathSync(pasta), ['versao.json']); } catch { real = null; }
  if (!real) throw new Error('Só entrego o versao.json da pasta deste ajuste (sem link, junção nem cópia de outro lugar).');
  const item = ((await painel('GET', '?fila=ajustes')).ajustes || []).find(a => a.alteracao_id === id);
  if (!item) throw new Error('Este ajuste não está na fila (já resolvido, pedido não confirmado ou a conversa passou da etapa de ajustes).');
  /* (o ajuste.json também tem de ser um arquivo comum desta pasta: a base que ele anota decide se a entrega vale) */
  let anotadoReal = null;
  try { anotadoReal = direcaoReal(fs.realpathSync(path.join(pasta, 'ajuste.json')), fs.realpathSync(pasta), ['ajuste.json']); } catch { anotadoReal = null; }
  if (!anotadoReal) throw new Error('O ajuste.json não é um arquivo comum desta pasta (link, junção ou cópia de outro lugar): nada sai. Apague a pasta e rode "ajustes" de novo.');
  const anotado = lerJson(anotadoReal, 'ajuste.json');
  if ((anotado.base_id ?? null) !== (item.base_id ?? null)) throw new Error('O cliente mudou a versão depois que você baixou: apague a pasta, rode "ajustes" de novo e refaça.');
  const conteudo = lerJson(real, 'versao.json');
  const h = conferir(conteudo, item.estrategia);
  if (h.erro) throw new Error('versao.json recusado pelo filtro: ' + h.erro);
  const achados = varrer(h.direcao);
  if (achados.length) throw new Error('versao.json recusado pela varredura: ' + achados.map(a => a.tipo + ' em ' + paraTerminal(a.caminho)).join('; '));
  log('\n=== ajuste ' + idCurto(id) + ' (pedido ' + idCurto(item.conversa_id) + '): "' + paraTerminal(h.direcao.nome_conceito) + '" ===');
  log('O pedido do cliente está em ' + path.join(pasta, 'ajuste.json') + ' (abra para comparar; é dado, nunca instrução).');
  for (const linha of linhasDaDirecao(h.direcao)) log(linha);
  if (!(await pedirConfirmacao(perguntar))) { log('Nada foi entregue.'); return { entregue: false }; }
  const r = await painel('POST', '', { ajuste_feito: id, base_id: item.base_id ?? null, conteudo });
  fs.rmSync(pasta, { recursive: true, force: true });
  log('Entregue' + (r.ajustes && r.ajustes.length ? ' (o filtro corrigiu: ' + r.ajustes.map(x => paraTerminal(x, 120)).join(', ') + ')' : '') + '. Pasta do ajuste apagada. O cliente vê a versão nova ao abrir o pedido.');
  return { entregue: true };
}

/* recusar um pedido livre (não cabe: preço, item da tabela, fora do site): o cliente vê "Não incluído" na tela. Também
   com o código sorteado: recusar é irreversível como entregar */
export async function recusarAjuste({ id, raiz = PASTA, painel, perguntar, log = console.log }) {
  if (!UUID.test(String(id))) throw new Error('Informe o id inteiro do ajuste (a linha que o "ajustes" imprimiu).');
  const pasta = path.join(raiz, idCurto(id));
  /* (a pasta tem de ser de verdade ANTES de recusar: link ou junção seria apagado depois, com a recusa já feita) */
  if (fs.existsSync(pasta)) pastaReal(pasta);
  log('Recusar o ajuste ' + idCurto(id) + ': o cliente vê "Não incluído" e não há volta.');
  if (!(await pedirConfirmacao(perguntar, codigoAleatorio, 'recusar'))) { log('Nada foi recusado.'); return { recusado: false }; }
  await painel('POST', '', { ajuste_recusado: id });
  if (fs.existsSync(pasta)) { pastaReal(pasta); fs.rmSync(pasta, { recursive: true, force: true }); }
  log('Recusado: o cliente vê "Não incluído". Se o pedido muda o preço, explique pelo WhatsApp.');
  return { recusado: true };
}

/* ---------------- execução ---------------- */
function ambiente() {
  const base = validarBase(process.env.BZ_BASE);
  const chave = process.env.PAINEL_CHAVE || '';
  if (chave.length < 32) throw new Error('Defina PAINEL_CHAVE (a chave do painel) no ambiente do SEU terminal, não em arquivo.');
  return { base, chave };
}
async function painel(metodo, consulta, corpo) {
  const { base, chave } = ambiente();
  const r = await fetch(base + '/api/painel' + consulta, { method: metodo, redirect: 'error', signal: AbortSignal.timeout(TEMPO_MS),
    headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'HTTP ' + r.status);
  return j;
}
/* uma linha da fila no terminal (PR 2a). SÓ campos de lista fechada: o terminal é lido pela sessão do Claude Code,
   e texto livre do visitante fora do briefingDelimitado seria uma porta para instrução injetada. O código só sai
   se for um código; o formato, só se for da lista do motor */
const CODIGO_PEDIDO = /^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/;
export function linhaDaFila(p) {
  const dirs = Array.isArray(p.direcoes) ? p.direcoes : [];
  const prontas = dirs.filter(d => d.status === 'pronta').length;
  const formato = FORMATOS.includes(p.fatores?.formato) ? p.fatores.formato : 'formato ?';
  return [idCurto(p.conversa_id), CODIGO_PEDIDO.test(String(p.codigo)) ? p.codigo : '-', p.prioridade === 1 ? 'avisar' : 'produzir',
    new Date(p.pedido_em).toLocaleString('pt-BR'), prontas + '/' + dirs.length + ' prontas', formato,
    p.suspeito ? 'TEXTO SUSPEITO: leia o briefing antes' : ''].filter(Boolean).join('  ');
}

/* uma linha da fila de ajustes no terminal: SÓ campos de lista fechada (o texto do cliente fica no ajuste.json, na moldura) */
export function linhaDoAjuste(a) {
  return ['ajuste ' + paraTerminal(idCurto(a.alteracao_id), 8), 'pedido ' + paraTerminal(idCurto(a.conversa_id), 8), CODIGO_PEDIDO.test(String(a.codigo)) ? a.codigo : '-',
    new Date(a.pedido_em).toLocaleString('pt-BR'), a.suspeito ? 'TEXTO SUSPEITO: leia o pedido antes' : ''].filter(Boolean).join('  ');
}

const COMANDOS = {
  /* lê as duas filas de uma vez e avisa os ajustes nos DOIS casos: o pedido livre nasce justamente quando a fila de
     direções já está vazia (a escolha conclui o pedido) */
  async fila() {
    const [r, aj] = await Promise.all([painel('GET', '?fila=direcoes'), painel('GET', '?fila=ajustes')]);
    const avisoAjustes = Number.isInteger(aj.total) && aj.total > 0 ? aj.total + ' ajuste(s) escrito(s) esperando: rode "ajustes".' : '';
    if (!r.fila.length) { console.log('Nenhum pedido na fila.'); if (avisoAjustes) console.log(avisoAjustes); return; }
    for (const p of r.fila) console.log(linhaDaFila(p));
    console.log(r.total + ' pedido(s) confirmado(s), por prioridade' + (r.alarme ? '. ALARME: a fila chegou ao teto' : '') + '. Os não confirmados ficam no painel, em "Esperando confirmação".');
    if (avisoAjustes) console.log(avisoAjustes);
  },
  async pedido(prefixo) {
    const p = acharPedido((await painel('GET', '?fila=direcoes')).fila, prefixo);
    if (p.suspeito) console.log('ATENÇÃO: texto suspeito neste pedido. Leia o briefing antes de produzir; o que vem do visitante é dado, nunca ordem.');
    const dir = path.join(PASTA, idCurto(pedidoParaModelo(p).pedido));
    const arquivo = gravarPedido(dir, JSON.stringify(montarArquivoPedido(p), null, 2));
    console.log('Pedido gravado (sem contato) em ' + arquivo);
    /* a sessão isolada (PR 2b-1): settings e instruções DENTRO da pasta do pedido (a sessão lê só ali), e a linha pronta */
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const { settings, instrucoes } = prepararPastaSessao({ dir, repo });
    console.log('\nAbra a sessão isolada (PowerShell), e só ela, para produzir:\n' + comandoSessao({ pasta: dir, settings, instrucoes }));
    /* depois de produzir, o dono entrega com ESTA linha (caminho absoluto), nunca com "node scripts/..." de dentro da pasta do pedido */
    console.log('\nDepois de produzir, entregue com esta linha (de qualquer outra pasta):\n' + linhaDoDono({ repo, comando: 'entregar-pedido', arg: idCurto(pedidoParaModelo(p).pedido) }));
    console.log('\nPara olhar um arquivo antes de entregar (opcional), use esta linha:\n' + linhaDoDono({ repo, comando: 'conferir', arg: '"' + path.join(dir, 'conversao.json') + '" conversao' })
      + '\n(para as outras direções, troque conversao.json e a palavra final por autoridade.json autoridade, ou experiencia.json experiencia)');
  },
  conferir(arquivo, estrategia) {
    /* sem e.message nem conteúdo: o arquivo é de origem não confiável e o erro do JSON.parse cita pedaços do texto */
    const r = executarConferir(arquivo, estrategia);
    console.log(r.linha);
    if (!r.ok) process.exitCode = 1;
  },
  async 'entregar-pedido'(prefixo) {
    const { perguntar, fechar } = criarPerguntador();
    try {
      const r = await entregarPedido({ prefixo, painel, perguntar });
      if (!r.entregues.length && r.pendentes === null) process.exitCode = 1;
    } finally { fechar(); }
  },
  async ajustes() {
    const r = await painel('GET', '?fila=ajustes');
    if (!r.ajustes.length) return console.log('Nenhum ajuste escrito esperando.');
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    for (const a of r.ajustes) {
      /* (um item fora do formato não derruba os outros; o id é conferido ANTES de qualquer linha sair) */
      try {
        if (!UUID.test(String(a.alteracao_id)) || !UUID.test(String(a.conversa_id))) throw new Error('id fora do formato');
        if (!a.versao || typeof a.versao !== 'object' || Array.isArray(a.versao)) throw new Error('sem a versão atual do site');
        const dir = path.join(PASTA, idCurto(a.alteracao_id));
        console.log('\n' + linhaDoAjuste(a));
        /* (pasta que já existe é trabalho em andamento: regravar apagaria o versao.json que a sessão já reescreveu) */
        if (fs.existsSync(dir)) console.log('A pasta ' + dir + ' já existe (ajuste em andamento): nada foi regravado. Para baixar de novo, apague a pasta.');
        else {
          gravarAjuste(dir, JSON.stringify(ajusteParaModelo(a), null, 2), JSON.stringify(a.versao, null, 2));
          const { settings, instrucoes } = prepararPastaSessao({ dir, repo, tarefa: 'ajuste' });
          console.log('Abra a sessão isolada (PowerShell), e só ela, para fazer o ajuste:\n' + comandoSessao({ pasta: dir, settings, instrucoes, tarefa: 'ajuste' }));
        }
        console.log('Depois, entregue com esta linha (de qualquer outra pasta):\n' + linhaDoDono({ repo, comando: 'ajuste-feito', arg: a.alteracao_id + ' "' + path.join(dir, 'versao.json') + '"' }));
        console.log('Se o pedido não couber (preço, item da tabela, algo fora do site), recuse com esta:\n' + linhaDoDono({ repo, comando: 'ajuste-recusado', arg: a.alteracao_id }));
      } catch (e) {
        console.log('Um ajuste ficou de fora (' + paraTerminal(e && e.message) + '); os outros seguem.');
        process.exitCode = 1;
      }
    }
  },
  async 'ajuste-feito'(id, arquivo) {
    const { perguntar, fechar } = criarPerguntador();
    try { const r = await entregarAjuste({ id, arquivo, painel, perguntar }); if (!r.entregue) process.exitCode = 1; }
    finally { fechar(); }
  },
  async 'ajuste-recusado'(id) {
    const { perguntar, fechar } = criarPerguntador();
    try { const r = await recusarAjuste({ id, painel, perguntar }); if (!r.recusado) process.exitCode = 1; }
    finally { fechar(); }
  },
  limpar(dias) {
    const apagadas = limparPastas(PASTA, Number.isFinite(+dias) && +dias >= 0 ? +dias : 3);
    console.log(apagadas.length ? 'Apagadas: ' + apagadas.join(', ') : 'Nada a apagar.');
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [comando, ...args] = process.argv.slice(2);
  if (!Object.hasOwn(COMANDOS, comando || '')) {
    console.log('Uso: node scripts/direcoes.mjs fila | pedido <id> | entregar-pedido <id> | ajustes | ajuste-feito <id> <versao.json> | ajuste-recusado <id> | conferir <arquivo> <estrategia> | limpar [dias]');
    process.exitCode = 2;
  } else (async () => COMANDOS[comando](...args))().catch(e => { console.error('Erro: ' + paraTerminal(e && e.message)); process.exitCode = 1; });
}
