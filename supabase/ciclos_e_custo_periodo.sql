-- ═══════════════════════════════════════════════════════════════════════════
-- Ciclo dos animais, edição do ciclo do lote e custo operacional por período
-- Rodar no Supabase SQL Editor, na ordem. Cada bloco é independente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Custo operacional com período (mão de obra / maquinário) ───────────
-- periodo_dias nulo = comportamento antigo (rateio pelos dias do animal no lote).
-- Preenchido = valor por animal / periodo_dias somado a cada dia a partir da
-- data do lançamento, sem parar ao fim do período.
alter table public.custos_operacionais_lote
  add column if not exists periodo_dias integer null
  check (periodo_dias is null or periodo_dias > 0);


-- ─── 2. Renumerar o ciclo atual de um lote ─────────────────────────────────
-- Só muda a identificação: o número do ciclo vigente do lote passa de X para
-- Y em todas as tabelas que guardam esse número para o lote. Datas, dieta e
-- custos não mudam. Roda como o usuário logado (RLS vale normalmente).
create or replace function public.renumerar_ciclo_lote(p_lote_id uuid, p_numero_novo integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_antigo integer;
  v_anterior integer;
  v_proximo integer;
begin
  select ciclo_atual into v_antigo
  from lotes where id = p_lote_id and user_id = auth.uid();
  if v_antigo is null then
    raise exception 'Lote não encontrado';
  end if;

  if p_numero_novo is null or p_numero_novo < 1 or p_numero_novo > 8 then
    raise exception 'O número do ciclo deve ficar entre 1 e 8';
  end if;
  if p_numero_novo = v_antigo then
    return;
  end if;
  if not exists (select 1 from ciclos_lote where lote_id = p_lote_id and numero = v_antigo) then
    raise exception 'O ciclo atual (%) não está configurado neste lote', v_antigo;
  end if;
  if exists (select 1 from ciclos_lote where lote_id = p_lote_id and numero = p_numero_novo) then
    raise exception 'Já existe um ciclo % neste lote', p_numero_novo;
  end if;

  -- A ordem dos ciclos precisa ser mantida (avançar ciclo usa número + 1).
  select max(numero) into v_anterior from ciclos_lote where lote_id = p_lote_id and numero < v_antigo;
  select min(numero) into v_proximo from ciclos_lote where lote_id = p_lote_id and numero > v_antigo;
  if v_anterior is not null and p_numero_novo <= v_anterior then
    raise exception 'O novo número precisa ser maior que o do ciclo anterior (%)', v_anterior;
  end if;
  if v_proximo is not null and p_numero_novo >= v_proximo then
    raise exception 'O novo número precisa ser menor que o do ciclo seguinte (%)', v_proximo;
  end if;

  update ciclos_lote set numero = p_numero_novo where lote_id = p_lote_id and numero = v_antigo;
  update animais_ciclo_eventos set ciclo_numero = p_numero_novo where lote_id = p_lote_id and ciclo_numero = v_antigo;
  update animais_ciclo_eventos set ciclo_numero_anterior = p_numero_novo where lote_id = p_lote_id and ciclo_numero_anterior = v_antigo;
  update trocas_dieta_lote set ciclo_numero = p_numero_novo where lote_id = p_lote_id and ciclo_numero = v_antigo;
  update custos_racao_real_lote set ciclo_numero = p_numero_novo where lote_id = p_lote_id and ciclo_numero = v_antigo;
  update animais set ciclo_atual = p_numero_novo where lote_atual_id = p_lote_id and ciclo_atual = v_antigo;
  update lotes set ciclo_atual = p_numero_novo where id = p_lote_id;
end;
$$;

grant execute on function public.renumerar_ciclo_lote(uuid, integer) to authenticated;


-- ─── 3. Apontar o lote para outro ciclo já configurado ─────────────────────
-- Só muda a identificação: lote e todos os animais ativos dele passam a
-- indicar o ciclo escolhido. Não cria evento, não mexe em datas nem dieta,
-- então os custos não mudam.
create or replace function public.definir_ciclo_atual_lote(p_lote_id uuid, p_numero integer)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from lotes where id = p_lote_id and user_id = auth.uid()) then
    raise exception 'Lote não encontrado';
  end if;
  if not exists (select 1 from ciclos_lote where lote_id = p_lote_id and numero = p_numero) then
    raise exception 'O ciclo % não está configurado neste lote', p_numero;
  end if;

  update animais set ciclo_atual = p_numero
  where lote_atual_id = p_lote_id and status = 'ativo' and ciclo_atual <> p_numero;
  update lotes set ciclo_atual = p_numero where id = p_lote_id;
end;
$$;

grant execute on function public.definir_ciclo_atual_lote(uuid, integer) to authenticated;


-- ─── 4. Correção dos dados existentes ──────────────────────────────────────
-- Não altera custos: o motor de custo usa datas dos ciclos e eventos, não
-- esses campos.

-- 4a. Ricardo, lotes 01 a 06: todos os animais já estão no ciclo 3 (avanço
--     parcial com histórico); o lote sobe para 3.
update public.lotes set ciclo_atual = 3
where id in (
  '0cdadfd2-c586-40a6-a863-727ac6ca09cf', -- LOTE-2026-01 Inácio
  'd90614a3-8fee-4dab-a173-98b828b3d702', -- LOTE-2026-02 Banguel
  'c37b2cd0-4bf1-4e5f-b5f8-0510c863eccd', -- LOTE-2026-03 José Bragança
  '86a9344c-5cf3-44e9-8992-234d902c767b', -- LOTE-2026-04 João Tondolo
  '856f33a7-7b88-48aa-ba05-feecba686a06', -- LOTE-2026-05 Roberto Mascarenhas
  'd56fa935-b72b-4939-8f50-43b6cfadf66e'  -- LOTE-2026-06 Sérgio Dornelles Leaes
) and ciclo_atual = 2;

-- 4b. Lotes criados já no ciclo 3, com animais gravados no ciclo 1 por falta
--     do ciclo na criação dos animais.
update public.animais set ciclo_atual = 3
where lote_atual_id in (
  'feb47417-4445-4720-b41e-723b043a9588', -- Ricardo LOTE-2026-10 Pedro Nessa
  '5af9b85e-50d0-4a50-b430-69e1f742ef36', -- Ricardo LOTE-2026-12 Moacyr Seering
  '86887d8e-2b72-40e7-9014-d63b7cf80f39'  -- outra conta LOTE-2026-10 Lote G
) and ciclo_atual = 1;


-- ─── 5. Verificação (rodar separado; deve voltar vazio) ────────────────────
select l.codigo_lote, l.ciclo_atual as ciclo_lote, a.ciclo_atual as ciclo_animal, count(*) as qtd
from public.lotes l
join public.animais a on a.lote_atual_id = l.id and a.status = 'ativo'
where l.status = 'ativo' and l.ciclo_atual <> a.ciclo_atual
group by 1, 2, 3
order by 1;
