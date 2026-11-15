/* Os toques do começo do /orcamento (orçamento como conversa, spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §1), para os E2E:
   as perguntas fixas são falas do Zero com opções DENTRO da caixa da conversa (js/orcamento-toques.js). */

/* toca a opção visível com esse texto, num grupo que ainda não foi respondido */
export async function tocar(page, texto) {
  const b = page.locator('#o-log .orc-toque:not([data-feito]) button', { hasText: texto }).first();
  await b.scrollIntoViewIfNeeded();
  await b.click();
}

/* espera a conversa abrir com as opções do 1º passo */
export async function esperarToques(page, timeout = 30000) {
  await page.waitForSelector('#o-log .orc-toque button', { timeout });
}

/* o caso de sempre dos E2E (saúde, agendamentos, só o Instagram, tem logo e textos) até a pergunta da dor */
export async function responderAteADor(page) {
  await tocar(page, 'Saúde');
  await tocar(page, 'Agendamentos');
  await tocar(page, 'Pronto');
  await tocar(page, 'Só o Instagram');
  await tocar(page, 'Tenho');
}

/* sem o consultor: a dor por toques e o "Pronto" (o resumo fixo vem, e então o valor) */
export async function responderADorTocando(page, sugestoes = ['Pelo Instagram']) {
  for (const s of sugestoes) await tocar(page, s);
  await tocar(page, 'Pronto');
}
