/* ==========================================================================
   AS REGRAS DOS CONSELHOS E DA OAB, em dados (spec docs/superpowers/specs/2026-11-15-nicho-regulado-design.md §3; normas lidas em fonte
   oficial em 15/11/2026, com os links na spec). Um lugar só para o que o Zero ouve (api/_vendas/zero.mjs, avisoRegulado), o que a
   geração recebe (api/_vendas/gerador.mjs) e o que a conferência confere (api/_vendas/conferencia-regulada.mjs). Sem import: dados puros.
   ========================================================================== */
const SAUDE_COMUM = 'sem promessa ou garantia de resultado, sem superlativo nem comparação ("o melhor", "o único", "referência"), sem gratuidade, sorteio, brinde ou cupom, sem urgência ou medo, sem antes e depois e sem depoimento de paciente';
/* chave (a do detector de api/_vendas/zero.mjs, mais 'saude_generica' para o ramo "Saúde" tocado) -> conselho, sigla do registro e o resumo */
export const CONSELHOS = Object.freeze({
  odontologia: { conselho: 'CFO', registro: 'CRO', tipo: 'saude', profissao: 'cirurgião-dentista',
    resumo: SAUDE_COMUM + '; sem preço nem forma de pagamento; sem a palavra "popular"; especialidade só se registrada; nome, "cirurgião-dentista" e CRO; em clínica, o responsável técnico' },
  medicina: { conselho: 'CFM', registro: 'CRM', tipo: 'saude', profissao: 'médico',
    resumo: SAUDE_COMUM + '; o valor da consulta e as formas de pagamento PODEM aparecer (Res. CFM 2.336/2023); especialidade só com RQE; nome, CRM e a palavra médico na página principal' },
  fisioterapia: { conselho: 'COFFITO', registro: 'CREFITO', tipo: 'saude', profissao: 'fisioterapeuta',
    resumo: SAUDE_COMUM + '; sem preço; sem "resultado infalível"; nome, profissão e CREFITO' },
  psicologia: { conselho: 'CFP', registro: 'CRP', tipo: 'saude', profissao: 'psicóloga ou psicólogo',
    resumo: SAUDE_COMUM + '; sem preço, desconto, "preço social", "valor acessível" ou pacote; sem previsão de resultado; nome, "psicóloga" ou "psicólogo" e CRP' },
  nutricao: { conselho: 'CFN', registro: 'CRN', tipo: 'saude', profissao: 'nutricionista',
    resumo: SAUDE_COMUM + '; sem preço até 22/01/2027; sem imagem de corpo nem resultado; nome, profissão e CRN; ao orientar, "os resultados podem não ocorrer da mesma forma para todos"' },
  biomedicina: { conselho: 'CFBM', registro: 'CRBM', tipo: 'saude', profissao: 'biomédico',
    resumo: SAUDE_COMUM + '; sem preço; nome, especialidade registrada e CRBM' },
  estetica: { conselho: 'conselho', registro: 'registro', tipo: 'saude', profissao: 'a profissão registrada',
    resumo: SAUDE_COMUM + '; sem preço; nome, profissão e o registro no conselho da profissão' },
  fonoaudiologia: { conselho: 'CFFa', registro: 'CRFa', tipo: 'saude', profissao: 'fonoaudiólogo',
    resumo: SAUDE_COMUM + '; sem preço; nome, profissão e CRFa' },
  enfermagem: { conselho: 'COFEN', registro: 'COREN', tipo: 'saude', profissao: 'enfermeiro',
    resumo: SAUDE_COMUM + '; sem preço; nome, profissão e COREN' },
  saude_generica: { conselho: 'conselho', registro: 'registro', tipo: 'saude', profissao: 'a profissão registrada',
    resumo: SAUDE_COMUM + '; sem preço; nome, profissão e o registro no conselho da profissão' },
  advocacia: { conselho: 'OAB', registro: 'OAB', tipo: 'advocacia', profissao: 'advogado',
    resumo: 'sem honorários, valores, forma de pagamento, gratuidade ou desconto; sem resultado, vitória, decisão ou promessa; sem citar clientes, casos ou depoimentos; sem autoengrandecimento nem comparação; sem incentivar a entrar com ação nem urgência; sem o símbolo da OAB; nome e "OAB/UF nº" (Provimento 205/2021)' }
});
/* o marcador que a geração escreve quando a pessoa não deu o número (o dono completa antes de publicar; spec §5 e §8) */
export const MARCADOR_REGISTRO = '[número do registro]';
/* o registro que a pessoa deu: a sigla da lista, a região (UF ou número do CREFITO/CRP/CRN) e o número. Normalizado; fora do formato, null */
const SIGLAS = ['CREFITO', 'CRBM', 'COREN', 'CRFA', 'CRO', 'CRM', 'CRP', 'CRN', 'OAB'];
/* (revisão) o sufixo de até 3 letras (COREN-SP 123456-ENF) e a UF depois do número ("CRM 12345 RJ") */
const FORMATO_REGISTRO = new RegExp('^(' + SIGLAS.join('|') + ')[\\s\\-/]*(?:([A-Z]{2}|\\d{1,2})[\\s\\-/]+)?(?:N[º°O]?\\.?\\s*)?([\\d][\\d.\\-/]{0,12}[A-Z]{0,3})$');
const FORMATO_UF_NO_FIM = new RegExp('^(' + SIGLAS.join('|') + ')[\\s\\-/]*(?:N[º°O]?\\.?\\s*)?([\\d][\\d.\\-/]{0,12})[\\s\\-/]+([A-Z]{2})$');
/* o registro serve a este nicho? (a sigla do conselho dele; saúde genérica e estética aceitam qualquer sigla de saúde, nunca a OAB) */
export function registroDoNicho(registro, chave) {
  const r = registroValido(registro), c = Object.hasOwn(CONSELHOS, String(chave)) ? CONSELHOS[chave] : null;
  if (!r || !c) return null;
  const sigla = r.split(/[-\s]/)[0].toUpperCase();
  if (c.registro === 'registro') return sigla === 'OAB' ? null : r;
  return sigla === c.registro.toUpperCase() ? r : null;
}
export function registroValido(bruto) {
  if (typeof bruto !== 'string') return null;
  const s = bruto.normalize('NFKC').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!s || s.length > 30) return null;
  const fim = s.match(FORMATO_UF_NO_FIM);
  const m = fim ? [fim[0], fim[1], fim[3], fim[2]] : s.match(FORMATO_REGISTRO);
  if (!m) return null;
  const sigla = m[1] === 'CRFA' ? 'CRFa' : m[1];
  return sigla + (m[2] ? '-' + m[2] : '') + ' ' + m[3];
}
