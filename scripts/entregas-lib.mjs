/* ==========================================================================
   O LADO DO DONO da entrega (PR 3b-2; spec §6). Funções que o comando scripts/entregas.mjs chama, com fetch e disco
   injetáveis (testáveis sem rede). Regras:
   • a chave do painel (PAINEL_CHAVE) só vai para BZ_BASE (validarBase: o site ou o servidor local), nunca para o armazém;
   • os arquivos só são baixados de https://*.supabase.co (ou do servidor local, em teste): endereço de outro lugar é recusado;
   • baixar CONFERE de novo (tipo pelos bytes, tamanho, estrutura inteira da imagem) e grava as duas pastas; NÃO marca nada;
   • "importado" é outro comando, depois de a importação da captação passar (revisão da captação: "baixado" só depois);
   • (PR 3b-3) a prévia, o "no ar", o restante, os encerramentos e os avisos também são daqui; a chave continua indo só para BZ_BASE, e a frase de recusa do painel
     (409) chega ao terminal sem a chave e sem sequência de controle.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { tipoPorBytes } from '../api/_material/bytes.mjs';
import { estruturaCompleta } from './imagem-estrutura.mjs';
import { validarBase, pedirConfirmacao, codigoAleatorio, paraTerminal } from './direcoes.mjs';
import { diaNoFuso, prazoVencido } from '../api/_material/prazo.mjs';
import { briefingDelimitado, REGRA_BRIEFING } from '../api/_vendas/gerador.mjs';
import { pareceInjecao } from '../api/_vendas/seguranca.mjs';
import ESQ from '../js/orcamento-material-esquema.js';   /* a mesma regra do telefone e do e-mail do site (M3) */

const CODIGO = /^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/;
const CLIENTE = /^c-[abcdefghjkmnpqrstuvwxyz23456789]{6}$/;
const NOME = /^(?:logo|foto-\d{2})\.(?:png|jpg|webp)$/;
const EXT = { png: 'png', jpg: 'jpg', webp: 'webp' };
const TEMPO_MS = 30000;

function ambiente(base, chave) {
  if (String(chave || '').length < 32) throw new Error('Defina PAINEL_CHAVE (a chave do painel) no ambiente do SEU terminal, não em arquivo.');
  return { origem: validarBase(base), chave };
}
/* a frase de recusa do painel (409 etc.) vai ao terminal do dono: sem a chave, se o servidor a repetir, e sem sequência de controle */
const fraseDoPainel = (corpo, status, chave) => {
  const frase = corpo && typeof corpo.erro === 'string' ? corpo.erro.split(chave).join('[chave]') : '';
  return frase.trim() ? paraTerminal(frase, 400) : 'O painel respondeu ' + status + '.';
};
async function painel(buscar, origem, chave, caminho, init = {}) {
  const r = await buscar(origem + caminho, { ...init, headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' }, signal: AbortSignal.timeout(TEMPO_MS) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(fraseDoPainel(corpo, r.status, chave));
  return corpo;
}
const doSupabaseOuLocal = (url, origem) => {
  try { const u = new URL(url); return (u.protocol === 'https:' && /\.supabase\.co$/.test(u.hostname)) || u.origin === origem; } catch { return false; }
};

const dias = d => (d == null ? '' : d + ' d');
/* o dia (de Campo Grande) de um instante, para mostrar ao dono; o que não se lê aparece como veio */
const diaDe = v => { try { return diaNoFuso(v); } catch { return String(v); } };
const instanteOk = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const prazoLegivel = p => !!p && typeof p === 'object' && instanteOk(p.conta_desde) && (p.pausas === undefined || (Array.isArray(p.pausas) && p.pausas.every(x => x && instanteOk(x.desde) && (x.ate === null || instanteOk(x.ate)))));
const MOTIVOS = ['desistencia', 'atraso', 'producao_manual', 'outro'];   /* = api/_entrega/painel-entrega.mjs (lista fechada; nunca "sem resposta": D5, e desde 22/10 nunca "sem_material") */
const MOMENTOS = { previa: 'previa', 'no-ar': 'no_ar', 'material-parado': 'material_parado', 'material-apagar': 'material_apagar', 'lembrete-1': 'restante_lembrete_1', 'lembrete-2': 'restante_lembrete_2' };
const EXPLICACAO_DO_AVISO = { 'material-apagar': 'Aviso registrado. O material só é apagado quando o projeto completar 6 meses parado e 30 dias depois deste aviso; se o cliente mexer no material antes, a contagem recomeça e será preciso avisar de novo.' };
const validarCodigo = codigo => { if (!CODIGO.test(String(codigo))) throw new Error('Código inválido: BZ- e mais 5 letras ou números.'); };
const acao = (buscar, origem, chave, corpo) => painel(buscar, origem, chave, '/api/painel', { method: 'POST', body: JSON.stringify(corpo) });

export function alertasDe(it, agora = new Date()) {
  const a = [];
  const dias = it.dias_desde_entrada;
  if (it.passo === 'material' && dias >= 30) {
    const autorizado = it.tem_whatsapp && it.autorizacao_marcada && it.tem_uf;
    if (autorizado) a.push('30 dias sem material, com a autorização EXPRESSA do cliente (caixa marcada, número e UF): pode dispensar (o pedido segue com as imagens do modelo e o site só vai ao ar depois de o cliente aprovar a prévia, D5). Na captação, importe o material dispensado SEM --completo (o dia 30 dela marca "sem_material" sozinho até ela aplicar as regras de 22/10)');
    else if (!it.aviso_material_em) a.push('30 dias sem o material e sem autorização: nada é publicado. Mande o aviso de que você está aguardando o material e de que o projeto fica parado, e registre (aviso ' + it.codigo + ' material-parado)');
    else a.push('aguardando o material desde o aviso: o projeto fica PARADO até o cliente mandar ou autorizar (22/10). Nada a fazer: não se encerra nem se publica por tempo');
  }
  /* (22/10) projeto parado há 6 meses: o aviso prévio do apagamento do material e, depois, o material apagado. O projeto e a vaga continuam do cliente */
  if (it.passo === 'material') {
    if (it.material_apagado_em) a.push('o material do projeto parado foi APAGADO em ' + diaDe(it.material_apagado_em) + ' (6 meses parado, com o aviso prévio). O pedido, a proposta e o pagamento ficam e a vaga continua do cliente; se ele voltar, manda o material de novo');
    else if (it.apagar_material_devido) a.push('avisar o cliente antes de apagar o material: o projeto está parado há 5 meses ou mais. Mande a mensagem (o material só é apagado depois de 6 meses parado e 30 dias depois deste aviso) e registre (aviso ' + it.codigo + ' material-apagar)');
    else if (it.aviso_apagar_material_em) a.push('aviso prévio do apagamento registrado em ' + diaDe(it.aviso_apagar_material_em) + ': o material só é apagado quando o projeto completar 6 meses parado e 30 dias do aviso, e se o cliente não mexer nele (se mexer, a contagem recomeça)');
  }
  /* (M1) o prazo corre até PUBLICAR, como na captação: aprovada também conta. Sem prazo_dias inteiro não se inventa vencimento; data torta vira aviso, não exceção */
  if ((it.passo === 'producao' || it.passo === 'ajustes' || it.passo === 'aprovada') && it.prazo && Number.isInteger(it.prazo_dias)) {
    let vencido = false, legivel = prazoLegivel(it.prazo);
    if (legivel) { try { vencido = prazoVencido(it.prazo, { prazoDias: it.prazo_dias }, agora); } catch (e) { if (!(e instanceof RangeError)) throw e; legivel = false; } }
    if (!legivel) a.push('o prazo desta entrega tem uma data que não dá para ler: confira no banco antes de publicar a prévia ou o site');
    else if (vencido) {
      a.push('prazo vencido (era até ' + it.entrega_ate + '): a regra da D4 devolve a entrada se a Beyon atrasar (estorno no Mercado Pago; depois "encerrar ' + it.codigo + ' atraso" e a devolução na captação)'
        + (it.passo === 'aprovada' ? '. Com o prazo vencido o site NÃO vai ao ar: registre a devolução antes (a captação recusa publicar)' : ''));
    }
  }
  if (it.passo === 'previa') a.push('esperando o cliente há ' + (it.dias_na_previa == null ? '?' : it.dias_na_previa) + ' dia(s): o projeto para até ele responder (D5). Nada a fazer; não aprova nem encerra por silêncio');
  if (it.aviso_previa_pendente) a.push('avisar o cliente: prévia pronta (painel, Avisos, com o link de uso único)');
  if (it.aviso_no_ar_pendente) a.push('avisar o cliente: site no ar (painel, Avisos, com o link de uso único). Os 3 dias do restante só começam a contar quando você registrar este aviso');
  /* (22/10) o restante vale 3 dias do REGISTRO do aviso "no ar" (o dia do aviso é o dia 0): lembretes no 2º e no 3º dia; à 00:00 depois do 3º dia o site sai do ar */
  if (it.passo === 'no_ar' && it.dias_do_aviso != null) {
    const d = it.dias_do_aviso, l1 = !!it.lembrete_restante_1_em, l2 = !!it.lembrete_restante_2_em;
    if (d > 3) {
      a.push('o prazo de 3 dias do restante venceu (passou da 00:00 depois do 3º dia do aviso): suspender (suspender ' + it.codigo + ') e tirar o site do ar pela captação'
        + (l1 && l2 ? '' : '. Faltou registrar ' + (!l1 && !l2 ? 'os 2 lembretes' : !l1 ? 'o lembrete do 2º dia' : 'o último lembrete') + ': a captação só deixa tirar o site do ar com os 2'));
    } else {
      if (d >= 2 && !l1) a.push('mandar o lembrete do restante (2º dia) e registrar (painel, Avisos)');
      if (d >= 3 && !l2) a.push('mandar o último lembrete do restante (3º dia) e registrar (painel, Avisos); depois da 00:00 o site sai do ar');
    }
  }
  if (it.passo === 'suspensa') a.push('site suspenso: quando o restante cair, religar pela captação e marcar (religado ' + it.codigo + ')');
  if (it.passo === 'concluida' && it.religar_pendente) a.push('o restante caiu com o site suspenso: religar o site pela captação e marcar (religado ' + it.codigo + ')');
  return a;
}

export function proximoComando(it, raiz) {
  const sh = c => `node "${path.join(raiz, 'scripts', 'entregas.mjs')}" ${c}`;
  if (it.passo === 'material' && it.apagar_material_devido && !it.material_apagado_em) return sh(`aviso ${it.codigo} material-apagar`);
  if (it.passo === 'producao' && it.material_status === 'enviado') return sh(`baixar ${it.codigo} --destino "<pasta do cliente>/${it.codigo}"`);
  if (it.passo === 'producao' && it.cliente_captacao) return 'na captação: montar, checklist, enviar-versao e a revisão; depois: ' + sh(`previa ${it.codigo} <endereço da prévia>`);
  if (it.passo === 'ajustes') return sh(`ajustes ${it.codigo} --destino "<pasta>/${it.codigo}-ajustes"`) + '; refeita a versão e revisada: ' + sh(`previa ${it.codigo} <endereço da prévia>`);
  if (it.passo === 'aprovada') return sh(`no-ar ${it.codigo} <endereço do site>`);
  if (it.passo === 'no_ar' && it.dias_do_aviso > 3) return sh(`suspender ${it.codigo}`);   /* passou da 00:00 depois do 3º dia do aviso "no ar" */
  if (it.passo === 'concluida' && it.religar_pendente) return sh(`religado ${it.codigo}`);
  return null;   /* esperando o cliente (material, prévia) ou o restante (no ar); ou já importado */
}

export async function listar({ base, chave, buscar = fetch, raiz = process.cwd() }) {
  const { origem } = ambiente(base, chave);
  const r = await painel(buscar, origem, chave, '/api/painel?fila=entregas');
  const itens = r.entregas || [];
  if (!itens.length) return ['Nenhuma entrega em andamento.'];
  const linhas = [];
  for (const it of itens) {
    const lista = it.rodadas && it.passo !== 'material' && it.passo !== 'producao' ? '  listas ' + it.rodadas.usadas + ' de ' + (it.rodadas.max || '∞') : '';
    const apagar = (it.aviso_apagar_material_em ? '  aviso do apagamento em ' + diaDe(it.aviso_apagar_material_em) : '') + (it.material_apagado_em ? '  material APAGADO em ' + diaDe(it.material_apagado_em) : '');
    linhas.push(`${it.codigo}  ${it.passo.padEnd(9)} material: ${it.material_status}${it.arquivos ? ' (' + it.arquivos + ' arquivos)' : ''}  entrada há ${dias(it.dias_desde_entrada)}${it.entrega_ate ? '  previsão ' + it.entrega_ate : ''}${lista}${apagar}${it.cliente_captacao ? '  captação ' + it.cliente_captacao : ''}`);
    for (const al of alertasDe(it, new Date())) linhas.push('    ALERTA: ' + al);
    const cmd = proximoComando(it, raiz);
    if (cmd) linhas.push('    próximo: ' + cmd);
  }
  return linhas;
}

export async function baixar({ base, chave, buscar = fetch, codigo, destino }) {
  const { origem } = ambiente(base, chave);
  if (!CODIGO.test(String(codigo))) throw new Error('Código inválido: BZ- e mais 5 letras ou números.');
  if (!destino) throw new Error('Diga a pasta: --destino "<pasta>" (nova ou vazia).');
  const pasta = path.resolve(destino);
  if (fs.existsSync(pasta) && fs.readdirSync(pasta).length) throw new Error('A pasta de destino precisa estar vazia (ou não existir): ' + pasta);
  const pac = await painel(buscar, origem, chave, '/api/painel?material=' + encodeURIComponent(codigo));
  const lidos = [];
  for (const a of pac.arquivos || []) {
    if (!NOME.test(String(a.nome))) throw new Error('nome de arquivo fora do padrão: ' + String(a.nome).slice(0, 40));
    if (!doSupabaseOuLocal(a.url, origem)) throw new Error('o endereço do arquivo ' + a.nome + ' não é do Supabase: nada foi baixado');
    const r = await buscar(a.url, { signal: AbortSignal.timeout(TEMPO_MS) });   /* SEM a chave do painel */
    if (!r.ok) throw new Error(a.nome + ': o armazém respondeu ' + r.status);
    const bytes = Buffer.from(await r.arrayBuffer());
    const tipo = tipoPorBytes(Uint8Array.from(bytes.subarray(0, 16)));
    if (tipo !== EXT[a.tipo_real] || tipo !== a.nome.split('.').pop()) throw new Error(a.nome + ': o conteúdo não é ' + a.nome.split('.').pop() + ' (' + (tipo || 'desconhecido') + ')');
    if (bytes.length !== a.tamanho) throw new Error(a.nome + ': tamanho ' + bytes.length + ' diferente do conferido (' + a.tamanho + ')');
    if (!estruturaCompleta(bytes)) throw new Error(a.nome + ': a imagem está cortada ou corrompida');
    lidos.push({ nome: a.nome, bytes });
  }
  /* só depois de tudo conferido, grava (nada fica pela metade) */
  fs.mkdirSync(path.join(pasta, 'pedido-site'), { recursive: true });
  fs.mkdirSync(path.join(pasta, 'material'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'pedido-site', 'pedido.json'), JSON.stringify(pac.pedido, null, 2) + '\n');
  fs.writeFileSync(path.join(pasta, 'pedido-site', 'formulario.json'), JSON.stringify(pac.formulario, null, 2) + '\n');
  for (const l of lidos) fs.writeFileSync(path.join(pasta, 'material', l.nome), l.bytes);
  return { pasta, arquivos: lidos.map(l => l.nome), suspeitos: Array.isArray(pac.suspeitos) ? pac.suspeitos : [], comandos: [
    `1. Na captação: importe a pasta ${pasta} (importar-site, ou novo --origem site --pedido ${codigo} e material --formulario).`,
    `2. SÓ depois de a importação passar: node "<repo>/scripts/entregas.mjs" importado ${codigo} <id do cliente na captação, c-xxxxxx>`
  ] };
}

export async function marcarImportado({ base, chave, buscar = fetch, codigo, cliente }) {
  const { origem } = ambiente(base, chave);
  if (!CODIGO.test(String(codigo))) throw new Error('Código inválido: BZ- e mais 5 letras ou números.');
  if (!CLIENTE.test(String(cliente))) throw new Error('O id do cliente na captação tem a forma c-xxxxxx (6 letras ou números, sem i, l, o, 0, 1).');
  return painel(buscar, origem, chave, '/api/painel', { method: 'POST', body: JSON.stringify({ importado: codigo, cliente }) });
}

export async function publicarPrevia({ base, chave, buscar = fetch, codigo, url }) {
  const { origem } = ambiente(base, chave); validarCodigo(codigo);
  if (!/^https:\/\//.test(String(url))) throw new Error('Diga o endereço da prévia (https://vN.bz-c-xxxxxx.pages.dev).');
  await acao(buscar, origem, chave, { previa: codigo, url });
  return 'Prévia registrada. O cliente a vê na página dele; o aviso de "prévia pronta" está no painel (Avisos).';
}
/* pôr o site no ar abre a cobrança do restante: pede o código sorteado (NO-AR-XXXX), como o ENTREGAR-XXXX das direções */
export async function colocarNoAr({ base, chave, buscar = fetch, codigo, url, perguntar, gerar = () => codigoAleatorio('NO-AR-') }) {
  const { origem } = ambiente(base, chave); validarCodigo(codigo);
  if (!/^https:\/\//.test(String(url))) throw new Error('Diga o endereço do site (https://…).');
  if (!(await pedirConfirmacao(perguntar, gerar, 'pôr o site no ar e abrir a cobrança do restante'))) throw new Error('Não confirmado: nada foi feito.');
  await acao(buscar, origem, chave, { no_ar: codigo, url });
  return 'No ar. O aviso de "site no ar" está no painel (Avisos); o cliente já vê o Pix do restante na página dele.';
}
export async function suspender({ base, chave, buscar = fetch, codigo }) { const { origem } = ambiente(base, chave); validarCodigo(codigo); const r = await acao(buscar, origem, chave, { suspender: codigo }); return (r && r.aviso) || 'Suspenso no site. Tire o site do ar pela captação (suspender).'; }
export async function encerrar({ base, chave, buscar = fetch, codigo, motivo }) {
  const { origem } = ambiente(base, chave); validarCodigo(codigo);
  if (!MOTIVOS.includes(motivo)) throw new Error('Motivo fora da lista: ' + MOTIVOS.join(', ') + '. Não existe encerrar por silêncio do cliente (D5).');
  const r = await acao(buscar, origem, chave, { encerrar: codigo, motivo });
  return 'Encerrado. ' + ((r && r.lembrete) || '');
}
export async function dispensar({ base, chave, buscar = fetch, codigo }) {
  const { origem } = ambiente(base, chave); validarCodigo(codigo);
  const r = await acao(buscar, origem, chave, { material_dispensar: codigo });
  /* na captação: SEM --completo (o dia 30 dela marca "sem_material" sozinho); e a data REAL da marcação da caixa vai à vista, porque o `enviado_em` do formulário é o de hoje (B5) */
  return 'Material dispensado (com a autorização expressa do cliente): o pedido segue para a produção com as imagens do modelo, e o site só vai ao ar depois de ele aprovar a prévia. Na captação, importe SEM --completo.'
    + (r && r.marcada_em ? ' A caixa de autorização foi marcada em ' + r.marcada_em + ' (o formulário leva a data de hoje: anote a da marcação ao importar).' : '');
}
export async function registrarAviso({ base, chave, buscar = fetch, codigo, momento }) {
  const { origem } = ambiente(base, chave); validarCodigo(codigo);
  if (!Object.hasOwn(MOMENTOS, momento)) throw new Error('Momento inválido: previa, no-ar, material-parado, material-apagar, lembrete-1 ou lembrete-2.');
  await acao(buscar, origem, chave, { aviso_feito: codigo, momento: MOMENTOS[momento] });
  return EXPLICACAO_DO_AVISO[momento] || 'Aviso registrado.';
}
export async function religado({ base, chave, buscar = fetch, codigo }) { const { origem } = ambiente(base, chave); validarCodigo(codigo); await acao(buscar, origem, chave, { religado: codigo }); return 'Marcado como religado.'; }

/* a lista de ajustes do cliente, como DADO na moldura do briefing (a produção nunca a lê como instrução); a pasta tem de estar vazia.
   O telefone/WhatsApp e o e-mail DO SITE (M3, 22/10) vêm à parte, como dado estruturado, em contato-do-site.json: o formato é conferido DE NOVO aqui (a mesma regra da tela, do servidor e do banco)
   e só vale com a autorização registrada; senão nada é gravado. O selo de texto suspeito (pareceInjecao) também é refeito aqui: o servidor pode não tê-lo trazido. */
export async function baixarAjustes({ base, chave, buscar = fetch, codigo, destino }) {
  const { origem } = ambiente(base, chave); validarCodigo(codigo);
  if (!destino) throw new Error('Diga a pasta: --destino "<pasta>" (nova ou vazia).');
  const pasta = path.resolve(destino);
  if (fs.existsSync(pasta) && fs.readdirSync(pasta).length) throw new Error('A pasta de destino precisa estar vazia (ou não existir): ' + pasta);
  const r = await painel(buscar, origem, chave, '/api/painel?ajustes-previa=' + encodeURIComponent(codigo));
  const lista = Array.isArray(r.ajustes) ? r.ajustes : [];
  const contatos = lista.filter(a => a.contato && (a.contato.whatsapp || a.contato.email)).map(a => {
    const c = ESQ.contatoDoSite(a.contato.whatsapp, a.contato.email);
    if (!c.ok || c.whatsapp !== (a.contato.whatsapp || null) || c.email !== (a.contato.email || null) || !a.contato.autorizado_em || !a.contato.autorizacao_versao) {
      throw new Error('Contato do site inválido ou sem a autorização registrada (lista ' + a.rodada + '): não gravei nada. Confira no banco.');
    }
    return { rodada: a.rodada, whatsapp: c.whatsapp, email: c.email, autorizado_em: a.contato.autorizado_em, autorizacao_versao: a.contato.autorizacao_versao };
  });
  fs.mkdirSync(pasta, { recursive: true });
  const moldura = briefingDelimitado({ lista_de_ajustes_do_cliente: lista.map(a => ({ rodada: a.rodada, texto: String(a.texto || '') })), previa_atual: r.previa_url || null });
  fs.writeFileSync(path.join(pasta, 'ajustes.txt'), REGRA_BRIEFING + '\n\n' + moldura + '\n');
  fs.writeFileSync(path.join(pasta, 'contato-do-site.json'), JSON.stringify({ aviso: 'Dado estruturado, já conferido. O telefone e o e-mail abaixo só se aplicam com a autorização registrada (autorizado_em e autorizacao_versao); nada vai ao ar sem a autorização do cliente.', contatos }, null, 2) + '\n');
  return { pasta, quantidade: lista.length, suspeitos: lista.filter(a => a.suspeito === true || pareceInjecao(String(a.texto || ''))).map(a => a.rodada), contatos: contatos.length };
}
