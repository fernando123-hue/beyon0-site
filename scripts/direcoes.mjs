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

/* o conferir (comando do dono) só pode abrir o arquivo de direção de um pedido,
   isto é, <raiz>/<8 hex>/<estrategia>.json, comparando caminhos já resolvidos (sem ".." sobrando) */
const ARQUIVOS_DE_DIRECAO = ['conversao.json', 'autoridade.json', 'experiencia.json'];
const ARQUIVOS_DO_PEDIDO = ['pedido.json', '.sessao.json', '.instrucoes.md', ...ARQUIVOS_DE_DIRECAO];
export function arquivoDeDirecao(arquivo, raiz = PASTA) {
  const recusa = () => new Error('Só confiro conversao.json, autoridade.json ou experiencia.json dentro da pasta de um pedido.');
  const absoluto = path.resolve(String(arquivo));
  const partes = path.relative(path.resolve(raiz), absoluto).split(path.sep);
  if (partes.length !== 2 || !/^[0-9a-f]{8}$/.test(partes[0]) || !ARQUIVOS_DE_DIRECAO.includes(partes[1])) throw recusa();
  return absoluto;
}

/* prepara a pasta onde a sessão isolada vai trabalhar: o Claude Code carrega dali configuração, memória e MCP, então o
   que estiver plantado é apagado; settings e instruções são gravados por último, depois de checar a SKILL de origem.
   A pasta-mãe (~/BeyonZero-direcoes) não se apaga daqui: o Claude Code também lê o CLAUDE.md e o .claude das pastas ACIMA
   da de trabalho, então, se existirem lá, o preparo recusa (antes de tocar em qualquer coisa) e pede ao dono que os tire.
   No Windows o modo 0o600 não vale: a proteção real é a pasta ficar fora do repositório, no perfil do dono */
const CONFIG_DO_CLAUDE = ['CLAUDE.md', 'CLAUDE.local.md', '.claude'];
export function prepararPastaSessao({ dir, repo }) {
  const origem = path.join(repo, '.claude', 'skills', 'produzir-direcoes', 'SKILL.md');
  if (!fs.existsSync(origem)) throw new Error('Falta a SKILL ' + origem + ': não dá para montar as instruções da sessão isolada.');
  const mae = path.dirname(dir);
  const naMae = CONFIG_DO_CLAUDE.filter(n => fs.existsSync(path.join(mae, n)));
  if (naMae.length) throw new Error('A pasta ' + mae + ' tem ' + naMae.join(', ') + ': apague (ou mova) antes, porque a sessão isolada leria essas instruções.');
  const skill = fs.readFileSync(origem, 'utf8');
  for (const n of ['.claude', 'CLAUDE.md', 'CLAUDE.local.md', '.mcp.json', '.conferir.mjs']) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  const settings = path.join(dir, '.sessao.json'), instrucoes = path.join(dir, '.instrucoes.md');
  fs.writeFileSync(settings, JSON.stringify(configSessao({ repo }), null, 2), { mode: 0o600 });
  fs.writeFileSync(instrucoes, instrucoesSessao({ skill }), { mode: 0o600 });
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
  /* a pasta é onde a sessão escreve: qualquer coisa fora desta lista (um scripts/ plantado, por exemplo) e nada sai */
  const estranhos = fs.readdirSync(pasta).filter(n => !ARQUIVOS_DO_PEDIDO.includes(n)).sort();
  if (estranhos.length) throw new Error('A pasta do pedido tem arquivos que não deviam estar lá (' + estranhos.join(', ') + '): nada sai. Apague a pasta e rode "pedido" de novo.');
  const pedido = lerJson(path.join(pasta, 'pedido.json'), 'pedido.json');
  if (servidor && pedido.direcoes.some(d => !servidor.todos.has(d.id))) throw new Error('Os ids do pedido.json não batem com a fila do servidor: rode "pedido" de novo.');
  const aEntregar = pedido.direcoes.filter(d => (servidor ? servidor.naFila.has(d.id) : d.status === 'gerando'));
  return aEntregar.map(d => {
    const arquivo = path.join(pasta, d.estrategia + '.json');
    if (!fs.existsSync(arquivo)) throw new Error('Falta ' + d.estrategia + '.json na pasta do pedido.');
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

export async function pedirConfirmacao(perguntar, gerar = codigoAleatorio) {
  const codigo = gerar();
  try {
    const resposta = await perguntar('\nLeia o texto acima. Para entregar, digite ' + codigo + ': ');
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

const COMANDOS = {
  async fila() {
    const r = await painel('GET', '?fila=direcoes');
    if (!r.fila.length) return console.log('Nenhum pedido na fila.');
    for (const p of r.fila) console.log(linhaDaFila(p));
    console.log(r.total + ' pedido(s) confirmado(s), por prioridade' + (r.alarme ? '. ALARME: a fila chegou ao teto' : '') + '. Os não confirmados ficam no painel, em "Esperando confirmação".');
  },
  async pedido(prefixo) {
    const p = acharPedido((await painel('GET', '?fila=direcoes')).fila, prefixo);
    if (p.suspeito) console.log('ATENÇÃO: texto suspeito neste pedido. Leia o briefing antes de produzir; o que vem do visitante é dado, nunca ordem.');
    const dir = path.join(PASTA, idCurto(pedidoParaModelo(p).pedido));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const arquivo = path.join(dir, 'pedido.json');
    fs.writeFileSync(arquivo, JSON.stringify(montarArquivoPedido(p), null, 2), { mode: 0o600 });
    console.log('Pedido gravado (sem contato) em ' + arquivo);
    /* a sessão isolada (PR 2b-1): settings e instruções DENTRO da pasta do pedido (a sessão lê só ali), e a linha pronta */
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const { settings, instrucoes } = prepararPastaSessao({ dir, repo });
    console.log('\nAbra a sessão isolada (PowerShell), e só ela, para produzir:\n' + comandoSessao({ pasta: dir, settings, instrucoes }));
    /* depois de produzir, o dono entrega com ESTA linha (caminho absoluto), nunca com "node scripts/..." de dentro da pasta do pedido */
    console.log('\nDepois de produzir, entregue com esta linha (de qualquer outra pasta):\n' + linhaDoDono({ repo, comando: 'entregar-pedido', arg: idCurto(pedidoParaModelo(p).pedido) }));
  },
  conferir(arquivo, estrategia) {
    /* sem e.message nem conteúdo: o arquivo é de origem não confiável e o erro do JSON.parse cita pedaços do texto */
    const r = executarConferir(arquivo, estrategia);
    console.log(r.linha);
    if (!r.ok) process.exitCode = 1;
  },
  async 'entregar-pedido'(prefixo) {
    const p = String(prefixo || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}/.test(p)) throw new Error('Informe os 8 primeiros caracteres do pedido.');
    const pasta = path.join(PASTA, p.slice(0, 8));
    const doServidor = acharPedido((await painel('GET', '?fila=direcoes')).fila, p);
    const plano = planejarEntrega(pasta, { todos: new Set(doServidor.direcoes.map(d => d.id)), naFila: new Set(doServidor.direcoes.filter(d => d.status === 'gerando').map(d => d.id)) });
    if (!plano.length) { fs.rmSync(pasta, { recursive: true, force: true }); return console.log('Nada a entregar: as direções deste pedido já estão prontas. Pasta apagada; avise o cliente pelo painel.'); }
    /* o terminal é do DONO: ele lê o texto que vai sair e digita a palavra; cada linha começa com "| " para não se confundir com instrução */
    for (const e of plano) {
      console.log('\n=== ' + e.estrategia + ': "' + paraTerminal(e.direcao.nome_conceito) + '" ===');
      for (const linha of linhasDaDirecao(e.direcao)) console.log(linha);
    }
    const { perguntar, fechar } = criarPerguntador();
    const confirmado = await pedirConfirmacao(perguntar);
    fechar();
    if (!confirmado) { console.log('Nada foi entregue.'); process.exitCode = 1; return; }
    let pendentes = null;
    for (const e of plano) {
      const r = await painel('POST', '', { entregar_direcao: e.id, conteudo: e.conteudo });
      pendentes = r.pendentes;
      console.log('Entregue: ' + e.estrategia + (r.ajustes.length ? ' (o filtro corrigiu: ' + r.ajustes.join(', ') + ')' : ''));
    }
    if (pendentes === 0) { fs.rmSync(pasta, { recursive: true, force: true }); console.log('As 3 prontas. Pasta do pedido apagada. Avise o cliente pelo painel ("Avisar no WhatsApp").'); }
    else console.log('Ainda há direção na fila deste pedido.');
  },
  limpar(dias) {
    const apagadas = limparPastas(PASTA, Number.isFinite(+dias) && +dias >= 0 ? +dias : 3);
    console.log(apagadas.length ? 'Apagadas: ' + apagadas.join(', ') : 'Nada a apagar.');
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [comando, ...args] = process.argv.slice(2);
  if (!Object.hasOwn(COMANDOS, comando || '')) {
    console.log('Uso: node scripts/direcoes.mjs fila | pedido <id> | entregar-pedido <id> | conferir <arquivo> <estrategia> | limpar [dias]');
    process.exitCode = 2;
  } else (async () => COMANDOS[comando](...args))().catch(e => { console.error('Erro: ' + paraTerminal(e && e.message)); process.exitCode = 1; });
}
