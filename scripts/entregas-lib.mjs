/* ==========================================================================
   O LADO DO DONO da entrega (PR 3b-2; spec §6). Funções que o comando scripts/entregas.mjs chama, com fetch e disco
   injetáveis (testáveis sem rede). Regras:
   • a chave do painel (PAINEL_CHAVE) só vai para BZ_BASE (validarBase: o site ou o servidor local), nunca para o armazém;
   • os arquivos só são baixados de https://*.supabase.co (ou do servidor local, em teste): endereço de outro lugar é recusado;
   • baixar CONFERE de novo (tipo pelos bytes, tamanho, estrutura inteira da imagem) e grava as duas pastas; NÃO marca nada;
   • "importado" é outro comando, depois de a importação da captação passar (revisão da captação: "baixado" só depois).
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { tipoPorBytes } from '../api/_material/bytes.mjs';
import { estruturaCompleta } from './imagem-estrutura.mjs';
import { validarBase } from './direcoes.mjs';
import { diaNoFuso } from '../api/_material/prazo.mjs';

const CODIGO = /^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/;
const CLIENTE = /^c-[abcdefghjkmnpqrstuvwxyz23456789]{6}$/;
const NOME = /^(?:logo|foto-\d{2})\.(?:png|jpg|webp)$/;
const EXT = { png: 'png', jpg: 'jpg', webp: 'webp' };
const TEMPO_MS = 30000;

function ambiente(base, chave) {
  if (String(chave || '').length < 32) throw new Error('Defina PAINEL_CHAVE (a chave do painel) no ambiente do SEU terminal, não em arquivo.');
  return { origem: validarBase(base), chave };
}
async function painel(buscar, origem, chave, caminho, init = {}) {
  const r = await buscar(origem + caminho, { ...init, headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' }, signal: AbortSignal.timeout(TEMPO_MS) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((corpo && corpo.erro) || 'O painel respondeu ' + r.status + '.');
  return corpo;
}
const doSupabaseOuLocal = (url, origem) => {
  try { const u = new URL(url); return (u.protocol === 'https:' && /\.supabase\.co$/.test(u.hostname)) || u.origin === origem; } catch { return false; }
};

const dias = d => (d == null ? '' : d + ' d');
export function alertasDe(it) {
  const a = [];
  if (it.passo === 'material' && it.dias_desde_entrada >= 30) a.push('30 dias sem o material: decidir com a captação o que fazer (D4)');
  /* M9: o alerta fica DEPOIS do "importado" também (é ali que a produção atrasa); o "hoje" é o dia de Campo Grande, não o UTC */
  if (it.entrega_ate && it.passo === 'producao' && it.entrega_ate < diaNoFuso(new Date())) a.push('prazo vencido (era até ' + it.entrega_ate + '): a regra da D4 devolve a entrada se a Beyon atrasar');
  return a;
}
export function proximoComando(it, raiz) {
  if (it.passo === 'producao' && it.material_status === 'enviado') {
    return `node "${path.join(raiz, 'scripts', 'entregas.mjs')}" baixar ${it.codigo} --destino "<pasta do cliente>/${it.codigo}"`;
  }
  return null;   /* esperando o cliente enviar; ou já importado (a prévia é do 3b-3) */
}

export async function listar({ base, chave, buscar = fetch, raiz = process.cwd() }) {
  const { origem } = ambiente(base, chave);
  const r = await painel(buscar, origem, chave, '/api/painel?fila=entregas');
  const itens = r.entregas || [];
  if (!itens.length) return ['Nenhuma entrega em andamento.'];
  const linhas = [];
  for (const it of itens) {
    linhas.push(`${it.codigo}  ${it.passo.padEnd(9)} material: ${it.material_status}${it.arquivos ? ' (' + it.arquivos + ' arquivos)' : ''}  entrada há ${dias(it.dias_desde_entrada)}${it.entrega_ate ? '  pronto até ' + it.entrega_ate : ''}${it.cliente_captacao ? '  captação ' + it.cliente_captacao : ''}`);
    for (const al of alertasDe(it)) linhas.push('    ALERTA: ' + al);
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
