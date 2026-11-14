/* O pedido dentro da conversa (js/orcamento-pedido.js; spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §5, PR 3), para os E2E:
   os passos abrem dentro de #o-log, e a pessoa responde pelo que vê (a caixa do passo, "Seguir", os toques). Usado por docs/e2e-orcamento.mjs,
   docs/e2e-planta.mjs e docs/e2e-escopo.mjs. */
export const PASSO = '#o-log .orc-toque--campo:not([data-feito])';
export const REDES = '#o-log .orc-toque--redes:not([data-feito])';
export const CARTAO = '#o-log .orc-toque--aceite:not([data-feito])';
export const ABERTO = PASSO + ', ' + REDES;
const ORDEM_REDES = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'];
const TOQUE = { nome: 'Como quer ser chamado', admira: 'Um site que eu admiro', publico: 'Para quem eu vendo', diferencial: 'O que me diferencia' };

/* um botão de um passo aberto, pelo nome que a pessoa lê */
export async function tocarNoPedido(page, nome) {
  const b = page.locator('#o-log .orc-toque:not([data-feito])').getByRole('button', { name: nome, exact: true }).first();
  await b.scrollIntoViewIfNeeded();
  await b.click();
}
export const seguir = (page, onde = ABERTO) => page.locator(onde).getByRole('button', { name: 'Seguir', exact: true }).click();
/* responde o passo aberto (escreve e "Seguir") */
export async function responder(page, valor) {
  await page.waitForSelector(PASSO, { timeout: 15000 });
  await page.fill(PASSO + ' input', valor);
  await seguir(page, PASSO);
}
/* as redes: os endereços e, se pedido, o toque da autorização; depois "Seguir" */
export async function preencherRedes(page, redes, autorizar) {
  await page.waitForSelector(REDES, { timeout: 15000 });
  const caixas = page.locator(REDES + ' input');
  for (const [rede, valor] of Object.entries(redes)) await caixas.nth(ORDEM_REDES.indexOf(rede)).fill(valor);
  if (autorizar) await autorizacao(page).click();
  await seguir(page, REDES);
}
export const autorizacao = page => page.locator(REDES).getByRole('button', { name: /^Autorizo/ });
export const concordar = page => page.locator(CARTAO).getByRole('button', { name: 'Concordo e quero os modelos' }).click();

/* do 1º passo ao cartão do aceite (sem concordar): o que vende pela sugestão (se houver) ou escrito; os opcionais pelo nome do campo */
export async function ateOCartao(page, { negocio, vende, sugestao, telefone, opcionais = {}, redes = null }) {
  await responder(page, negocio);
  await page.waitForSelector(PASSO);
  if (sugestao) await tocarNoPedido(page, sugestao); else await page.fill(PASSO + ' input', vende);
  await seguir(page, PASSO);
  await responder(page, telefone);
  for (const [campo, valor] of Object.entries(opcionais)) { await tocarNoPedido(page, TOQUE[campo]); await responder(page, valor); }
  if (redes) { await tocarNoPedido(page, 'As redes do negócio'); await preencherRedes(page, redes, true); }
  await tocarNoPedido(page, 'Não, pode seguir');
  await page.waitForSelector(CARTAO, { timeout: 15000 });
}
/* o pedido inteiro: até o cartão e "Concordo" */
export async function fazerPedido(page, dados) {
  await ateOCartao(page, dados);
  await concordar(page);
}
/* um WhatsApp novo a cada chamada: o freio por telefone (1 pedido aberto, 2 por dia) vale também no servidor local */
export const telefoneNovo = () => '(21) 9' + String(1000 + Math.floor(Math.random() * 9000)) + '-' + String(1000 + Math.floor(Math.random() * 9000));
