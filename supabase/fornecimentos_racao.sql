-- ─── Fornecimento de ração (parte 2) ────────────────────────────────────────
-- Rodar no SQL Editor do Supabase antes do deploy do front. O SQL da parte 1
-- (compras_ingrediente.sql) já foi aplicado.
--
-- Um fornecimento é a ração efetivamente dada a um ou mais lotes numa data.
-- Vale para cada lote do dia do fornecimento até o próximo fornecimento que
-- incluir o lote (o último vale até hoje). Nesses dias o custo, o consumo em
-- MS e a relação concentrado:volumoso do lote passam a ser os realizados.
--   modo 'mistura_pronta': ração comprada pronta, baixa do estoque do grupo
--     de consumo (grupo_id); kg_total em matéria natural, pct_ms da mistura.
--   modo 'feita_na_fazenda': itens por ingrediente (fornecimentos_racao_itens),
--     cada um baixa do estoque do ingrediente.

create table if not exists public.fornecimentos_racao (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  dieta_id uuid not null references public.dietas(id) on delete restrict,
  modo text not null check (modo in ('mistura_pronta', 'feita_na_fazenda')),
  grupo_id uuid references public.grupos_consumo_racao(id) on delete restrict,
  kg_total numeric not null check (kg_total > 0),
  pct_ms numeric check (pct_ms is null or (pct_ms > 0 and pct_ms <= 100)),
  observacoes text,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Nome diferente do check automático da coluna modo (fornecimentos_racao_modo_check).
  constraint fornecimentos_racao_origem_check check (
    (modo = 'mistura_pronta' and grupo_id is not null and pct_ms is not null)
    or (modo = 'feita_na_fazenda' and grupo_id is null)
  )
);

create index if not exists fornecimentos_racao_user_idx on public.fornecimentos_racao(user_id);

create table if not exists public.fornecimentos_racao_itens (
  id uuid primary key default gen_random_uuid(),
  fornecimento_id uuid not null references public.fornecimentos_racao(id) on delete cascade,
  origem_ingrediente text not null check (origem_ingrediente in ('insumo_padrao', 'ingrediente_produtor')),
  insumo_id uuid references public.insumos_padrao(id) on delete restrict,
  ingrediente_produtor_id uuid references public.ingredientes_produtor(id) on delete restrict,
  tipo text not null check (tipo in ('concentrado', 'volumoso')),
  kg numeric not null check (kg >= 0),
  pct_ms numeric not null check (pct_ms > 0 and pct_ms <= 100),
  -- Preço por kg (matéria natural) usado quando o ingrediente não tem estoque
  -- registrado na data: o do componente da dieta, senão o do cadastro.
  preco_kg_referencia numeric not null default 0 check (preco_kg_referencia >= 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint fornecimentos_racao_itens_ref_check check (
    (origem_ingrediente = 'insumo_padrao' and insumo_id is not null and ingrediente_produtor_id is null)
    or (origem_ingrediente = 'ingrediente_produtor' and ingrediente_produtor_id is not null and insumo_id is null)
  )
);

create index if not exists fornecimentos_racao_itens_fornecimento_idx on public.fornecimentos_racao_itens(fornecimento_id);

-- Divisão automática entre os lotes, proporcional ao consumo previsto de cada
-- lote na data (calculada e gravada no registro).
create table if not exists public.fornecimentos_racao_lotes (
  id uuid primary key default gen_random_uuid(),
  fornecimento_id uuid not null references public.fornecimentos_racao(id) on delete cascade,
  lote_id uuid not null references public.lotes(id) on delete cascade,
  fracao numeric not null check (fracao >= 0 and fracao <= 1),
  consumo_previsto_ms_kg numeric not null default 0,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (fornecimento_id, lote_id)
);

create index if not exists fornecimentos_racao_lotes_lote_idx on public.fornecimentos_racao_lotes(lote_id);
create index if not exists fornecimentos_racao_lotes_fornecimento_idx on public.fornecimentos_racao_lotes(fornecimento_id);

alter table public.fornecimentos_racao enable row level security;
alter table public.fornecimentos_racao_itens enable row level security;
alter table public.fornecimentos_racao_lotes enable row level security;

create policy fornecimentos_racao_select on public.fornecimentos_racao for select using (auth.uid() = user_id);
create policy fornecimentos_racao_insert on public.fornecimentos_racao for insert with check (auth.uid() = user_id);
create policy fornecimentos_racao_update on public.fornecimentos_racao for update using (auth.uid() = user_id);
create policy fornecimentos_racao_delete on public.fornecimentos_racao for delete using (auth.uid() = user_id);

create policy fornecimentos_racao_itens_select on public.fornecimentos_racao_itens for select using (auth.uid() = user_id);
create policy fornecimentos_racao_itens_insert on public.fornecimentos_racao_itens for insert with check (auth.uid() = user_id);
create policy fornecimentos_racao_itens_update on public.fornecimentos_racao_itens for update using (auth.uid() = user_id);
create policy fornecimentos_racao_itens_delete on public.fornecimentos_racao_itens for delete using (auth.uid() = user_id);

create policy fornecimentos_racao_lotes_select on public.fornecimentos_racao_lotes for select using (auth.uid() = user_id);
create policy fornecimentos_racao_lotes_insert on public.fornecimentos_racao_lotes for insert with check (auth.uid() = user_id);
create policy fornecimentos_racao_lotes_update on public.fornecimentos_racao_lotes for update using (auth.uid() = user_id);
create policy fornecimentos_racao_lotes_delete on public.fornecimentos_racao_lotes for delete using (auth.uid() = user_id);

-- O custo real de ração lançado manualmente por lote deixa de existir (o
-- fornecimento substitui). A tabela custos_racao_real_lote está vazia em
-- todas as contas e não é mais lida pelo app; fica no banco, sem uso.
