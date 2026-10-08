-- ─── Simulador de caminhos ─────────────────────────────────────────────────
-- Rodar no SQL Editor do Supabase antes de usar a página Simulador.
-- Cada simulação guarda o ponto de partida, os caminhos, os ciclos e as
-- dietas em `dados` (jsonb) — é uma cópia independente: alterar dietas ou
-- lotes depois não muda simulações salvas.

create table if not exists public.simulacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dados jsonb not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulacoes_user_idx on public.simulacoes(user_id);

alter table public.simulacoes enable row level security;

create policy simulacoes_select on public.simulacoes for select using (auth.uid() = user_id);
create policy simulacoes_insert on public.simulacoes for insert with check (auth.uid() = user_id);
create policy simulacoes_update on public.simulacoes for update using (auth.uid() = user_id);
create policy simulacoes_delete on public.simulacoes for delete using (auth.uid() = user_id);
