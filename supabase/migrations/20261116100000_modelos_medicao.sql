-- ==========================================================================
-- A MEDIÇÃO DOS TRÊS MODELOS (decisão do dono, 15/11, 21h40): o funil registra se o modelo escolhido era o que o Zero
-- recomendou, e se o pedido de ajuste escrito traz algo de outro modelo (a "mistura", que conta como um pedido).
-- Só uma marca booleana a mais nos eventos que já existem (direcao_escolhida e pedido_livre); nenhum dado pessoal, nenhum
-- texto da pessoa. Quem calcula a recomendação é a API (api/_vendas/recomendacao.mjs, a mesma regra da tela); aqui só entra
-- a marca, e sem ela (ou antes desta migration) o evento é o de antes.
-- Troca (create or replace) duas funções, com o corpo de 20261017120000_pr3a_ajustes.sql e UMA linha diferente cada (o evento).
-- Só service_role, como antes (create or replace mantém os grants).
-- ==========================================================================

create or replace function app.vendas_escolher(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; d app.direcoes;
begin
  perform privado.travar_direcoes((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  -- trocar de direção só ANTES do 1º ajuste: os ajustes são sobre a direção escolhida (senão o escopo descreve outra)
  perform privado.exigir_etapa(c, array['direcoes', 'escolhida']);
  select * into d from app.direcoes
  where id = (p ->> 'direcao_id')::uuid and conversa_id = c.id and status = 'pronta'
    and geracao = (select max(x.geracao) from app.direcoes x where x.conversa_id = c.id);
  if not found then raise exception 'direção não encontrada' using errcode = 'P0002'; end if;
  insert into app.escolhas (org_id, conversa_id, direcao_id, visitante_id, lead_id, geracao)
  values (c.org_id, c.id, d.id, c.visitante_id, c.lead_id, d.geracao);
  update app.conversas set etapa = 'escolhida', ultima_atividade = now() where id = c.id;
  -- (medição dos modelos) + se era o recomendado, quando a API manda a marca
  perform privado.evento(c.org_id, c.id, 'direcao_escolhida', jsonb_build_object('numero', d.numero, 'estrategia', d.estrategia, 'geracao', d.geracao)
    || case when jsonb_typeof(p -> 'recomendada') = 'boolean' then jsonb_build_object('recomendada', (p ->> 'recomendada')::boolean) else '{}'::jsonb end);
  return jsonb_build_object('direcao_id', d.id);
end $$;

create or replace function app.vendas_pedido_livre(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_escolhida uuid; v_id uuid; v_texto text := p ->> 'texto'; v_feitos integer;
begin
  -- (texto que é só espaço ou traz caractere de controle também não entra: a API já manda numa linha só)
  if v_texto is null or char_length(v_texto) not between 1 and 300 or btrim(v_texto) = '' or v_texto ~ '[[:cntrl:]]' then
    raise exception 'pedido livre: de 1 a 300 caracteres' using errcode = '22023';
  end if;
  perform privado.travar_direcoes((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes']);
  -- só pedido confirmado: a fila do dono só lista confirmados, e o pedido arquivado ficaria "aguardando" para sempre
  if not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    raise exception 'pedido livre: pedido não confirmado' using errcode = '55000';
  end if;
  select count(*) into v_feitos from app.alteracoes a where a.conversa_id = c.id and a.origem = 'livre';
  if v_feitos >= 3 then raise exception 'limite de pedidos livres desta conversa' using errcode = '23514'; end if;
  select direcao_id into v_escolhida from app.escolhas where conversa_id = c.id order by created_at desc limit 1;
  insert into app.alteracoes (org_id, conversa_id, direcao_id, pedido, mudancas, status, origem)
  values (c.org_id, c.id, v_escolhida, v_texto, '[]', 'na_fila', 'livre')
  returning id into v_id;
  -- o pedido livre também é ajuste do modelo escolhido: a troca de modelo trava, como na opção pronta
  update app.conversas set etapa = 'alteracoes', ultima_atividade = now() where id = c.id;
  -- (sem o texto: o funil não guarda o que a pessoa escreveu) (medição dos modelos) + a marca de "traz algo de outro modelo"
  perform privado.evento(c.org_id, c.id, 'pedido_livre', case when (p -> 'mistura') = 'true'::jsonb then jsonb_build_object('mistura', true) else '{}'::jsonb end);
  return jsonb_build_object('alteracao_id', v_id, 'restantes', 3 - v_feitos - 1);
end $$;
