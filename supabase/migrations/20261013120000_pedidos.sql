-- ==========================================================================
-- ORÇAMENTO SEM IA, PR 2a (spec docs/specs/2026-10-11-orcamento-sem-ia.md §0, §3 e §7): o PEDIDO DE MODELOS.
-- Os detalhes do negócio viram um pedido com código (BZ-K7M3Q). A pessoa confirma escrevendo para o WhatsApp
-- da Beyon Zero; o dono marca "confirmado" no painel (20261013120100_pedidos_dono.sql). Sem IA, o recurso
-- escasso é o tempo do dono, e os freios ficam AQUI (valem entre instâncias da função):
--   • uma vez por conversa, só antes do contato e só com o pacote gravado; no máximo 3 TENTATIVAS por conversa;
--   • por IP: 3 tentativas por dia (privado.contar_ip; a chave é um HMAC feito no servidor, com uso próprio), e o IPv6
--     também por /48 (10 por dia, outra chave). Contado ANTES do telefone: quem sonda se um número já pediu gasta a cota;
--   • por telefone (HMAC do número normalizado, feito no servidor): 1 pedido aberto e 2 por dia;
--   • fila global: com o teto de pedidos NA FILA atingido, a tela oferece o WhatsApp.
-- UMA regra decide o que ocupa o dono (privado.pedido_na_fila): a fila, o teto, o estado e o freio por telefone
-- usam a mesma, para nenhum pedido ocupar o teto sem aparecer na fila.
-- E os achados do PR 37: a consulta LEVE "a conversa é deste visitante" (PR37-T4/S2) e o
-- vendas_registrar_respostas com mescla profunda, confiança que só sobe, teto de tamanho (PR37-S6) e teto de
-- pacotes gravados por conversa (PR37-S3).
-- Compatível com o código da promoção anterior (docs/revisoes/pr1-pendencias.md, item 6): tabela e funções
-- novas, CHECK com MAIS tipos, vendas_registrar_respostas com a mesma assinatura e vendas_estado que só
-- ACRESCENTA chaves ao que devolvia.
-- ==========================================================================

-- os eventos novos do funil (a lista é a de 20261012120000_respostas_formulario.sql mais três)
alter table app.eventos_funil drop constraint eventos_funil_tipo_check;
alter table app.eventos_funil add constraint eventos_funil_tipo_check check (tipo in (
  'conversa_iniciada', 'briefing_completo', 'estimativa_mostrada', 'contato_informado',
  'direcoes_solicitadas', 'direcoes_prontas', 'direcoes_falharam', 'direcao_escolhida',
  'alteracao_pedida', 'escopo_apresentado', 'escopo_confirmado', 'pagamento_iniciado',
  'pagamento_confirmado', 'ia_falhou', 'tentativa_bloqueada', 'freio_ip',
  'respostas_formulario', 'confirmacao_whatsapp', 'pedido_expirado', 'pedido_descartado'));

-- as tentativas de enviar os detalhes, por conversa (revisão final do PR 2a, M2): a mesma conversa não reenvia à vontade
-- trocando o telefone para descobrir se um número já pediu
alter table app.conversas add column tentativas_detalhes smallint not null default 0 check (tentativas_detalhes >= 0);

-- ---------- o pedido ----------
create table app.pedidos (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id           uuid not null,
  codigo                text not null check (codigo ~ '^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$'),
  status                text not null default 'aguardando' check (status in ('aguardando', 'confirmado', 'expirado', 'descartado', 'arquivado')),
  -- HMAC do número (servidor): o freio não guarda o número. Apagado pela rotina dias depois do encerramento
  telefone_hash         text check (telefone_hash is null or telefone_hash ~ '^[0-9a-f]{64}$'),
  suspeito              boolean not null default false,                            -- triagem do classificador: selo no painel
  redes                 jsonb not null default '{}' check (jsonb_typeof(redes) = 'object' and pg_column_size(redes) <= 1024),
  redes_autorizadas_em  timestamptz,
  expira_em             timestamptz not null,
  confirmado_em         timestamptz,
  concluido_em          timestamptz,   -- saiu do trabalho do dono: avisado, cliente avançou ou a geração acabou sem pendência
  encerrado_em          timestamptz,   -- expirado, descartado ou arquivado
  created_at            timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, codigo),
  unique (conversa_id),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade,
  check (status <> 'confirmado' or confirmado_em is not null),
  check (redes = '{}' or redes_autorizadas_em is not null)
);
create index pedidos_telefone on app.pedidos (org_id, telefone_hash, created_at desc) where telefone_hash is not null;
create index pedidos_org_status on app.pedidos (org_id, status, created_at desc);
alter table app.pedidos enable row level security;   -- (sem política: só as funções do backend leem e escrevem)
revoke all on app.pedidos from public, anon, authenticated;

-- a situação só anda para a frente: aguardando → confirmado | expirado | descartado; confirmado → arquivado | descartado.
-- Conversa e código não mudam; o hash do telefone só pode ser APAGADO (a rotina), nunca trocado
create function privado.pedido_transicao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'aguardando' and new.status in ('confirmado', 'expirado', 'descartado')) or
       (old.status = 'confirmado' and new.status in ('arquivado', 'descartado'))) then
    raise exception 'pedido: % para % não é permitido', old.status, new.status using errcode = '23514';
  end if;
  if (new.org_id, new.conversa_id, new.codigo) is distinct from (old.org_id, old.conversa_id, old.codigo)
     or (new.telefone_hash is distinct from old.telefone_hash and new.telefone_hash is not null) then
    raise exception 'pedido: conversa e código não mudam; o telefone só pode ser apagado' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger pedido_transicao before update on app.pedidos for each row execute function privado.pedido_transicao();
-- auditoria: a situação e as datas (nunca o hash nem as redes: só o nome do campo que mudou)
create trigger auditar after insert or update or delete on app.pedidos
  for each row execute function privado.auditar('status', 'suspeito', 'expira_em', 'confirmado_em', 'concluido_em', 'encerrado_em');

-- ---------- a regra do que ocupa o dono (UMA, para fila, teto, estado e telefone) ----------
create function privado.pedido_na_fila(pd app.pedidos) returns boolean
language sql stable set search_path = '' as $$
  select pd.status = 'confirmado' and pd.concluido_em is null
$$;
-- aberto para o freio por telefone: esperando a confirmação (dentro do prazo) ou na fila
create function privado.pedido_aberto(pd app.pedidos) returns boolean
language sql stable set search_path = '' as $$
  select (pd.status = 'aguardando' and pd.expira_em > now()) or privado.pedido_na_fila(pd)
$$;

-- ---------- apoio ----------
-- mescla de objetos campo a campo (listas e valores simples: vale o novo). Para o briefing (PR37-S6: o || raso trocava
-- "negocio" inteiro e perdia a cidade das perguntas)
create function privado.jsonb_mesclar(a jsonb, b jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; r jsonb;
begin
  if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(b) is distinct from 'object' then return b; end if;
  r := a;
  for k in select jsonb_object_keys(b) loop
    r := jsonb_set(r, array[k], case when r ? k then privado.jsonb_mesclar(r -> k, b -> k) else b -> k end);
  end loop;
  return r;
end $$;

-- o código do pedido: "BZ-" + 5 letras e números sem os que se confundem (o mesmo alfabeto do código da visita).
-- Não é segredo: confirmar exige o dono ver a mensagem vinda do WhatsApp informado
create function privado.novo_codigo_pedido() returns text
language sql volatile set search_path = '' as $$
  select 'BZ-' || string_agg(substr('ACDEFGHJKMNPQRTUVWXY34679', 1 + floor(random() * 25)::integer, 1), '')
  from generate_series(1, 5)
$$;

-- ---------- as respostas do formulário (troca a de 20261012120000_respostas_formulario.sql) ----------
create or replace function app.vendas_registrar_respostas(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- (FOR UPDATE; de outro visitante: P0002)
  perform privado.exigir_etapa(c, array['descoberta', 'estimativa']);
  if jsonb_typeof(p -> 'briefing') is distinct from 'object' or pg_column_size(p -> 'briefing') > 16384 then
    raise exception 'briefing inválido' using errcode = '22023';
  end if;
  -- (PR37-S3) o "Quero" repetido não enche a tabela: no máximo 30 pacotes gravados por conversa
  if (select count(*) from app.estimativas e where e.conversa_id = c.id) >= 30 then
    raise exception 'limite de pacotes desta conversa' using errcode = '23514';
  end if;
  update app.conversas set
    briefing = privado.jsonb_mesclar(coalesce(briefing, '{}'), p -> 'briefing'),
    confianca = greatest(confianca, least(1, greatest(0, coalesce((p ->> 'confianca')::numeric, 0)))),
    ultima_atividade = now()
  where id = c.id;
  perform privado.evento(c.org_id, c.id, 'respostas_formulario');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- a consulta LEVE (PR37-T4/S2): a conversa é deste visitante e está numa destas etapas ----------
-- no lugar do vendas_estado (que lê mensagens, direções, proposta...) para catálogo, preço e "Quero"
create function app.vendas_conversa_dono(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_etapas text[];
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  select coalesce(array_agg(x), '{}') into v_etapas from jsonb_array_elements_text(coalesce(p -> 'etapas', '[]')) x;
  perform privado.exigir_etapa(c, v_etapas);   -- (lista vazia: nenhuma etapa vale, fecha)
  return jsonb_build_object('etapa', c.etapa,
    'estimativa', (select jsonb_build_object('regras_id', e.regras_id, 'fatores', e.fatores)
                   from app.estimativas e where e.conversa_id = c.id order by e.created_at desc limit 1));
end $$;

-- ---------- os detalhes: viram o pedido, com os freios numa transação ----------
create function app.vendas_registrar_detalhes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.conversas;
  v_tel text := p ->> 'telefone_hash';
  v_chave_ip text := p ->> 'chave_ip';
  v_chave_ip48 text := p ->> 'chave_ip48';   -- (o /48 do IPv6, outro "uso" no servidor; IPv4: null)
  v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_codigo text; v_expira timestamptz; v_tentativa integer; v_tentativas integer;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['descoberta', 'estimativa']);
  if not exists (select 1 from app.estimativas e where e.conversa_id = c.id) then
    raise exception 'o pacote vem antes dos detalhes' using errcode = '55000';
  end if;
  -- os mínimos obrigatórios (nome do negócio, o que vende e WhatsApp), conferidos AQUI, antes de qualquer geração
  if v_tel is null or v_tel !~ '^[0-9a-f]{64}$' or coalesce(p ->> 'telefone', '') !~ '^\+[1-9][0-9]{7,14}$'
     or (v_chave_ip is not null and v_chave_ip !~ '^[0-9a-f]{64}$')   -- (chave de IP mal formada: erro, e não freio desligado em silêncio)
     or (v_chave_ip48 is not null and v_chave_ip48 !~ '^[0-9a-f]{64}$')
     or jsonb_typeof(p -> 'briefing') is distinct from 'object' or pg_column_size(p -> 'briefing') > 8192
     or char_length(coalesce(p #>> '{briefing,negocio,nome}', '')) < 2
     or char_length(coalesce(p #>> '{briefing,negocio,descricao}', '')) < 3 then
    raise exception 'detalhes incompletos' using errcode = '22023';
  end if;
  if exists (select 1 from app.pedidos pd where pd.conversa_id = c.id) then
    return jsonb_build_object('ok', false, 'motivo', 'ja_enviado');
  end if;
  -- um número por vez: dois pedidos simultâneos com o mesmo telefone não passam juntos pelas contas abaixo
  perform pg_advisory_xact_lock(hashtextextended(v_tel, 0));
  if (select count(*) from app.pedidos pd where pd.org_id = c.org_id and privado.pedido_na_fila(pd))
     >= coalesce((p ->> 'teto_fila')::integer, 10) then
    return jsonb_build_object('ok', false, 'motivo', 'fila_cheia');
  end if;
  -- (revisão final, M2) daqui em diante toda tentativa CONTA, e as contas ficam: a função RETORNA em vez de falhar.
  -- Assim "telefone aberto" e "limite do dia" (mesma frase na API) não viram um oráculo de graça: a mesma conversa tenta
  -- no máximo 3 vezes, e cada tentativa gasta a cota do IP antes de qualquer teste de telefone
  update app.conversas set tentativas_detalhes = tentativas_detalhes + 1 where id = c.id
  returning tentativas_detalhes into v_tentativas;
  if v_tentativas > coalesce((p ->> 'max_tentativas')::integer, 3) then
    return jsonb_build_object('ok', false, 'motivo', 'tentativas');
  end if;
  -- por IP. Sem chave (null: servidor local sem segredo), não conta; chave não nula e mal formada já foi recusada lá em
  -- cima (22023). (dois ifs, e não um "and": o Postgres não garante a ordem do "and", e contar_ip com chave nula falha)
  if v_chave_ip is not null then
    if not privado.contar_ip(v_chave_ip, coalesce((p ->> 'max_por_ip')::integer, 3)) then
      perform privado.evento(c.org_id, c.id, 'freio_ip', jsonb_build_object('onde', 'detalhes'));
      return jsonb_build_object('ok', false, 'motivo', 'freio_ip');
    end if;
  end if;
  -- (revisão final, M3c) o IPv6 também pelo /48: a casa ou a empresa troca de /64 à vontade dentro dele
  if v_chave_ip48 is not null then
    if not privado.contar_ip(v_chave_ip48, coalesce((p ->> 'max_por_ip48')::integer, 10)) then
      perform privado.evento(c.org_id, c.id, 'freio_ip', jsonb_build_object('onde', 'detalhes', 'prefixo', 48));
      return jsonb_build_object('ok', false, 'motivo', 'freio_ip');
    end if;
  end if;
  if exists (select 1 from app.pedidos pd where pd.org_id = c.org_id and pd.telefone_hash = v_tel and privado.pedido_aberto(pd)) then
    return jsonb_build_object('ok', false, 'motivo', 'telefone_aberto');
  end if;
  if (select count(*) from app.pedidos pd where pd.org_id = c.org_id and pd.telefone_hash = v_tel and pd.created_at >= v_hoje)
     >= coalesce((p ->> 'max_por_telefone_dia')::integer, 2) then
    return jsonb_build_object('ok', false, 'motivo', 'telefone_dia');
  end if;
  -- o contato vira lead pelo MESMO caminho de sempre: aceite obrigatório e a data do 1º aceite preservada (LGPD)
  perform app.vendas_informar_contato(jsonb_build_object('conversa_id', c.id, 'visitante_id', c.visitante_id,
    'nome', p ->> 'nome', 'telefone', p ->> 'telefone', 'aceite', p -> 'aceite'));
  update app.conversas set briefing = privado.jsonb_mesclar(briefing, p -> 'briefing'), ultima_atividade = now() where id = c.id;
  v_expira := now() + make_interval(hours => least(168, greatest(1, coalesce((p ->> 'horas')::integer, 72))));
  for v_tentativa in 1..5 loop
    begin
      insert into app.pedidos (org_id, conversa_id, codigo, telefone_hash, suspeito, redes, redes_autorizadas_em, expira_em)
      values (c.org_id, c.id, privado.novo_codigo_pedido(), v_tel, coalesce((p ->> 'suspeito')::boolean, false),
              coalesce(p -> 'redes', '{}'), case when coalesce(p -> 'redes', '{}') <> '{}' then now() end, v_expira)
      returning codigo into v_codigo;
      exit;
    exception when unique_violation then
      if v_tentativa = 5 then raise; end if;   -- (o código repetiu: sorteia de novo)
    end;
  end loop;
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'expira_em', v_expira, 'status', 'aguardando');
end $$;

-- ---------- o estado: o mesmo de antes MAIS o pedido e o tamanho da fila (pela mesma regra) ----------
-- (a função antiga continua, com outro nome e sem acesso de fora; a nova só acrescenta chaves)
alter function app.vendas_estado(jsonb) rename to vendas_estado_base;
create function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_conversa uuid;
begin
  r := app.vendas_estado_base(p);   -- (o dono da conversa é conferido lá: de outro visitante, P0002)
  v_conversa := (r #>> '{conversa,id}')::uuid;
  return r || jsonb_build_object(
    'pedido', (select jsonb_build_object('codigo', pd.codigo, 'expira_em', pd.expira_em,
                 'status', case when pd.status = 'aguardando' and pd.expira_em <= now() then 'expirado' else pd.status end)
               from app.pedidos pd where pd.conversa_id = v_conversa),
    'fila_confirmados', (select count(*)::integer from app.pedidos pd
                         where pd.org_id = (select c.org_id from app.conversas c where c.id = v_conversa)
                           and privado.pedido_na_fila(pd)));
end $$;

-- ---------- quem chama ----------
do $$
declare f text;
begin
  foreach f in array array['vendas_registrar_detalhes', 'vendas_conversa_dono', 'vendas_estado', 'vendas_registrar_respostas'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
revoke all on function app.vendas_estado_base(jsonb) from public, anon, authenticated, service_role;
revoke all on function privado.jsonb_mesclar(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function privado.novo_codigo_pedido() from public, anon, authenticated, service_role;
revoke all on function privado.pedido_na_fila(app.pedidos) from public, anon, authenticated, service_role;
revoke all on function privado.pedido_aberto(app.pedidos) from public, anon, authenticated, service_role;
revoke all on function privado.pedido_transicao() from public, anon, authenticated, service_role;
