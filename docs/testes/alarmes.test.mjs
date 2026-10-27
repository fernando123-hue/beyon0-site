/* OS ALARMES DE PRAZO (PR 3b-3; spec §5 e §2.1; D4): só CONTAGEM, sem dado pessoal. 30 dias sem material e sem o aviso de material parado (depois do aviso o projeto só ESPERA o cliente: sem alarme diário, sem encerrar, sem publicar; 22/10), prazo vencido (em produção, ajustes e APROVADA, porque o prazo corre até PUBLICAR, como na captação; nunca
   com a pausa aberta, e nunca em "material": o prazo só começa com o material), restante vencido (mais de 3 dias desde o REGISTRO do aviso "no ar", 22/10). Uma prévia parada há um ano NÃO gera alarme nem muda nada (D5).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITES, contarAlarmes } from '../../api/_entrega/alarmes.mjs';
import { abrirPausa } from '../../api/_material/prazo.mjs';

const AGORA = new Date('2026-10-22T10:00:00-04:00');
const prazo = (conta_desde, pausas = []) => ({ conta_desde, pausas });

test('os limites: 30 dias sem material e 2 listas (os da captação); 3 dias do restante com lembretes no 2º e no 3º dia (decisão do dono de 22/10)', () => {
  assert.deepEqual(LIMITES, { material_dias: 30, restante_dias: 3, lembretes_restante: [2, 3], max_rodadas: 2 });
});

test('conta cada alarme uma vez; a prévia parada (D5), a pausa aberta, o material parado com aviso, a contagem do restante que não começou e os passos sem prazo não contam', () => {
  const itens = [
    { passo: 'material', entrada_em: '2026-09-20T12:00:00-04:00' },                                                             // 32 dias sem material e sem o aviso de material parado: conta
    { passo: 'material', entrada_em: '2026-09-20T12:00:00-04:00', aviso_material_em: '2026-10-01T12:00:00-04:00' },            // 22/10: o aviso já foi; o projeto só ESPERA (sem alarme diário, sem encerrar, sem publicar)
    { passo: 'material', entrada_em: '2025-01-01T12:00:00-04:00', aviso_material_em: '2025-02-01T12:00:00-04:00', prazo_dias: 5, prazo: prazo('2025-01-01T12:00:00-04:00') },   // parado há quase 2 anos: nem material_30 nem prazo vencido (o prazo só corre com o material)
    { passo: 'material', entrada_em: '2026-10-10T12:00:00-04:00' },                                                             // 12 dias: ainda cedo
    { passo: 'producao', prazo_dias: 5, prazo: prazo('2026-10-01T12:00:00-04:00') },                                            // venceu em 08/10
    { passo: 'ajustes', prazo_dias: 5, prazo: prazo('2026-10-01T12:00:00-04:00') },                                             // idem, em ajuste
    { passo: 'producao', prazo_dias: 5, prazo: abrirPausa(prazo('2026-10-01T12:00:00-04:00'), '2026-10-05T12:00:00-04:00') },   // pausa aberta: não vence
    { passo: 'producao', prazo_dias: 10, prazo: prazo('2026-10-21T12:00:00-04:00') },                                           // no prazo
    { passo: 'previa', prazo_dias: 5, prazo: prazo('2025-01-01T12:00:00-04:00'), previa_em: '2025-01-02T12:00:00-04:00' },      // parada há um ano: sem alarme (D5)
    { passo: 'aprovada', prazo_dias: 5, prazo: prazo('2026-10-01T12:00:00-04:00', [{ desde: '2026-10-02T12:00:00-04:00', ate: '2026-10-03T12:00:00-04:00' }]) },   // M1: aprovada com o prazo vencido (a pausa fechou quando o cliente aprovou): conta
    { passo: 'aprovada', prazo_dias: 10, prazo: prazo('2026-10-21T12:00:00-04:00') },                                          // aprovada dentro do prazo
    { passo: 'no_ar', no_ar_em: '2026-10-10T15:00:00-04:00', aviso_no_ar_feito_em: '2026-10-17T15:00:00-04:00' },              // 5 dias desde o aviso "no ar": passou da 00:00 depois do 3º dia: conta
    { passo: 'no_ar', no_ar_em: '2026-10-10T15:00:00-04:00', aviso_no_ar_feito_em: '2026-10-19T15:00:00-04:00' },              // 3 dias: ainda é o 3º dia (o site sai à 00:00 do dia seguinte): não conta
    { passo: 'no_ar', no_ar_em: '2026-09-01T15:00:00-04:00' }                                                                   // no ar há 50 dias, mas o aviso "no ar" não foi registrado: a contagem não começou (o listar cobra o aviso)
  ];
  assert.deepEqual(contarAlarmes(itens, AGORA), { prazo_vencido: 3, material_30: 1, restante_vencido: 1 });
  assert.deepEqual(contarAlarmes([], AGORA), { prazo_vencido: 0, material_30: 0, restante_vencido: 0 });
});

test('sem prazo_dias (inteiro) o prazo não vence: item com o prazo preenchido e os dias ausentes, nulos ou em texto não conta como vencido', () => {
  const velho = prazo('2025-01-01T12:00:00-04:00');
  for (const dias of [undefined, null, '5', 5.5, NaN]) {
    assert.equal(contarAlarmes([{ passo: 'producao', prazo: velho, prazo_dias: dias }], AGORA).prazo_vencido, 0, 'prazo_dias = ' + String(dias));
  }
  assert.equal(contarAlarmes([{ passo: 'producao', prazo: velho, prazo_dias: 5 }], AGORA).prazo_vencido, 1, 'com os dias, o mesmo item vence');
});
