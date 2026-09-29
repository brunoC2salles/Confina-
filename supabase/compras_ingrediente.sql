-- ─── Compras de ingredientes (ração feita na fazenda) ──────────────────────
-- Rodar no SQL Editor do Supabase antes do deploy do front.

-- 1. Entradas de ingrediente: compra, produção própria ou ajuste de inventário.
--    quantidade_kg é sempre em matéria natural. Em 'ajuste', quantidade_kg é o
--    saldo contado fisicamente na data (não uma diferença) e valor_total = 0.
create table if not exists public.compras_ingrediente (
  id uuid primary key default gen_random_uuid(),
  origem_ingrediente text not null check (origem_ingrediente in ('insumo_padrao', 'ingrediente_produtor')),
  insumo_id uuid references public.insumos_padrao(id) on delete cascade,
  ingrediente_produtor_id uuid references public.ingredientes_produtor(id) on delete cascade,
  tipo text not null check (tipo in ('compra', 'producao_propria', 'ajuste')),
  data date not null,
  quantidade_kg numeric not null check (quantidade_kg >= 0),
  valor_total numeric not null default 0 check (valor_total >= 0),
  parceiro_id uuid references public.parceiros(id) on delete set null,
  observacoes text,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint compras_ingrediente_ref_check check (
    (origem_ingrediente = 'insumo_padrao' and insumo_id is not null and ingrediente_produtor_id is null)
    or (origem_ingrediente = 'ingrediente_produtor' and ingrediente_produtor_id is not null and insumo_id is null)
  )
);

create index if not exists compras_ingrediente_user_idx on public.compras_ingrediente(user_id);

alter table public.compras_ingrediente enable row level security;

create policy compras_ingrediente_select on public.compras_ingrediente for select using (auth.uid() = user_id);
create policy compras_ingrediente_insert on public.compras_ingrediente for insert with check (auth.uid() = user_id);
create policy compras_ingrediente_update on public.compras_ingrediente for update using (auth.uid() = user_id);
create policy compras_ingrediente_delete on public.compras_ingrediente for delete using (auth.uid() = user_id);

-- 2. Períodos de custo médio ponderado por ingrediente (kardex), recalculados
--    pela aplicação a cada entrada nova, excluída ou ajuste. custo_medio_kg é
--    R$ por kg de matéria natural.
create table if not exists public.compras_ingrediente_periodos (
  id uuid primary key default gen_random_uuid(),
  origem_ingrediente text not null check (origem_ingrediente in ('insumo_padrao', 'ingrediente_produtor')),
  insumo_id uuid references public.insumos_padrao(id) on delete cascade,
  ingrediente_produtor_id uuid references public.ingredientes_produtor(id) on delete cascade,
  compra_id uuid references public.compras_ingrediente(id) on delete cascade,
  vigente_desde date not null,
  vigente_ate date,
  saldo_kg_inicio numeric not null,
  custo_medio_kg numeric not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists compras_ingrediente_periodos_user_idx on public.compras_ingrediente_periodos(user_id);

alter table public.compras_ingrediente_periodos enable row level security;

create policy compras_ingrediente_periodos_select on public.compras_ingrediente_periodos for select using (auth.uid() = user_id);
create policy compras_ingrediente_periodos_insert on public.compras_ingrediente_periodos for insert with check (auth.uid() = user_id);
create policy compras_ingrediente_periodos_update on public.compras_ingrediente_periodos for update using (auth.uid() = user_id);
create policy compras_ingrediente_periodos_delete on public.compras_ingrediente_periodos for delete using (auth.uid() = user_id);

-- 3. % de matéria seca da compra de dieta pronta. Null (compras antigas) =
--    usa a % MS calculada pelos componentes da dieta; se a dieta não permitir
--    o cálculo, considera 100% (comportamento anterior).
alter table public.compras_racao_grupo
  add column if not exists pct_ms numeric check (pct_ms is null or (pct_ms > 0 and pct_ms <= 100));
