-- ─── Portal de parceiros (parceiros.confinamais.com) ─────────────────────────
-- Fornecedores de ração (cooperativas), gestores e vendedores, clientes
-- vinculados (contas do Confina+ ou contas só de estoque), catálogo de
-- produtos, dietas do fornecedor (rascunho e publicação), estoque dos
-- clientes (resumo para o vendedor), movimentos das contas só de estoque,
-- pedidos de cotação e alertas, e convites por e-mail.
-- Aplicada pelo conector do Supabase em 2026-11-16.

-- ─── Tabelas ──────────────────────────────────────────────────────────────────

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  opcao_integrada boolean not null default true,
  opcao_plataforma boolean not null default false,
  ativo boolean not null default true,
  email_contato text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_item_clientes_id text,
  cobranca_status text,
  clientes_cobrados integer,
  cobranca_sincronizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fornecedor_membros (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('gestor', 'vendedor')),
  nome text,
  email text,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (fornecedor_id, user_id)
);

create table public.fornecedor_clientes (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  vendedor_id uuid references public.fornecedor_membros(id) on delete set null,
  modo text not null check (modo in ('confina', 'estoque')),
  nome_fazenda text,
  responsavel text,
  email text,
  telefone text,
  municipio text,
  uf text,
  janela_consumo_dias integer not null default 7 check (janela_consumo_dias between 1 and 90),
  cabecas integer,
  dietas_em_uso text[],
  resumo_atualizado_em timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.fornecedor_convites (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  email text not null,
  nome text,
  papel text not null check (papel in ('gestor', 'vendedor', 'cliente')),
  modo text check (modo in ('confina', 'estoque')),
  vendedor_id uuid references public.fornecedor_membros(id) on delete set null,
  token uuid not null unique default gen_random_uuid(),
  criado_por uuid references auth.users(id) on delete set null,
  enviado_em timestamptz,
  aceito_em timestamptz,
  expira_em timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  check (papel <> 'cliente' or modo is not null)
);

create table public.fornecedor_produtos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  nome text not null,
  categoria text not null check (categoria in ('racao', 'nucleo', 'mineral', 'grao', 'farelo', 'volumoso', 'outro')),
  tipo_dieta text not null default 'concentrado' check (tipo_dieta in ('concentrado', 'volumoso')),
  embalagem text,
  peso_embalagem_kg numeric check (peso_embalagem_kg is null or peso_embalagem_kg > 0),
  pedido_minimo_kg numeric check (pedido_minimo_kg is null or pedido_minimo_kg >= 0),
  prazo_entrega_dias integer check (prazo_entrega_dias is null or prazo_entrega_dias >= 0),
  regiao text,
  pct_ms numeric check (pct_ms is null or (pct_ms > 0 and pct_ms <= 100)),
  visivel boolean not null default true,
  dias_alerta integer not null default 7 check (dias_alerta >= 0),
  kg_minimo_alerta numeric check (kg_minimo_alerta is null or kg_minimo_alerta >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rascunho nas colunas e itens; o que os clientes veem é o "publicado"
-- (cópia gravada ao publicar).
create table public.fornecedor_dietas (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  nome text not null,
  descricao text,
  ciclo_recomendado integer,
  gmd_esperado numeric,
  gmd_esperado_concentrado numeric,
  pct_consumo_pv_ms numeric not null default 2.2,
  pct_concentrado numeric not null default 100,
  pct_volumoso numeric not null default 0,
  publicado jsonb,
  publicada_em timestamptz,
  alterada_apos_publicar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fornecedor_dieta_itens (
  id uuid primary key default gen_random_uuid(),
  dieta_id uuid not null references public.fornecedor_dietas(id) on delete cascade,
  produto_id uuid not null references public.fornecedor_produtos(id) on delete restrict,
  tipo text not null check (tipo in ('concentrado', 'volumoso')),
  pct_participacao numeric not null check (pct_participacao >= 0 and pct_participacao <= 100)
);

-- Resumo do estoque de cada produto no cliente (kg de matéria natural),
-- gravado pelo app do cliente e pela rotina diária.
create table public.fornecedor_estoque (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.fornecedor_clientes(id) on delete cascade,
  produto_id uuid not null references public.fornecedor_produtos(id) on delete cascade,
  saldo_kg numeric,
  consumo_dia_kg numeric,
  consumo_previsto_dia_kg numeric,
  consumo_real_dia_kg numeric,
  dias_cobertura numeric,
  data_fim date,
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, produto_id)
);

-- Entradas, baixas e ajustes das contas só de estoque (kg de matéria natural).
create table public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  produto_id uuid not null references public.fornecedor_produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'baixa', 'ajuste')),
  data date not null,
  quantidade_kg numeric not null check (quantidade_kg >= 0),
  observacoes text,
  created_at timestamptz not null default now()
);

create table public.fornecedor_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  cliente_id uuid not null references public.fornecedor_clientes(id) on delete cascade,
  vendedor_id uuid references public.fornecedor_membros(id) on delete set null,
  produto_id uuid references public.fornecedor_produtos(id) on delete set null,
  produto_nome text,
  origem text not null check (origem in ('cliente', 'alerta', 'vendedor')),
  status text not null default 'novo' check (status in ('novo', 'em_cotacao', 'cotado', 'aprovado', 'entregue', 'cancelado')),
  quantidade_kg numeric,
  data_entrega date,
  observacoes text,
  estoque_info jsonb,
  preco_kg numeric,
  valor_total numeric,
  resposta text,
  notificado_em timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dietas add column fornecedor_dieta_id uuid references public.fornecedor_dietas(id) on delete set null;
alter table public.ingredientes_produtor add column fornecedor_produto_id uuid references public.fornecedor_produtos(id) on delete set null;
create unique index ingredientes_produtor_fornecedor_produto_uniq on public.ingredientes_produtor (user_id, fornecedor_produto_id) where fornecedor_produto_id is not null;

create index on public.fornecedor_membros (user_id);
create index on public.fornecedor_clientes (fornecedor_id);
create index on public.fornecedor_clientes (vendedor_id);
create index on public.fornecedor_produtos (fornecedor_id);
create index on public.fornecedor_dietas (fornecedor_id);
create index on public.fornecedor_dieta_itens (dieta_id);
create index on public.fornecedor_estoque (cliente_id);
create index on public.estoque_movimentos (user_id, produto_id, data);
create index on public.fornecedor_pedidos (fornecedor_id, status);
create index on public.fornecedor_pedidos (cliente_id);
create index on public.fornecedor_convites (fornecedor_id);

-- ─── Funções de apoio às políticas (security definer, sem recursão no RLS) ────

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.fornec_papel(fid uuid) returns text
language sql stable security definer set search_path = public as $$
  select papel from fornecedor_membros where fornecedor_id = fid and user_id = auth.uid() and ativo limit 1
$$;

create or replace function public.fornec_membro_id(fid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from fornecedor_membros where fornecedor_id = fid and user_id = auth.uid() and ativo limit 1
$$;

create or replace function public.meu_fornecedor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select fornecedor_id from fornecedor_clientes where user_id = auth.uid() and ativo limit 1
$$;

create or replace function public.fornec_cliente_visivel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from fornecedor_clientes c
    where c.id = cid and (
      c.user_id = auth.uid()
      or eh_admin()
      or fornec_papel(c.fornecedor_id) = 'gestor'
      or (c.vendedor_id is not null and c.vendedor_id = fornec_membro_id(c.fornecedor_id))
    )
  )
$$;

create or replace function public.fornec_cliente_proprio(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fornecedor_clientes where id = cid and user_id = auth.uid() and ativo)
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.fornecedores enable row level security;
alter table public.fornecedor_membros enable row level security;
alter table public.fornecedor_clientes enable row level security;
alter table public.fornecedor_convites enable row level security;
alter table public.fornecedor_produtos enable row level security;
alter table public.fornecedor_dietas enable row level security;
alter table public.fornecedor_dieta_itens enable row level security;
alter table public.fornecedor_estoque enable row level security;
alter table public.estoque_movimentos enable row level security;
alter table public.fornecedor_pedidos enable row level security;

create policy fornecedores_select on public.fornecedores for select
  using (eh_admin() or fornec_papel(id) is not null or id = meu_fornecedor_id());
create policy fornecedores_admin on public.fornecedores for all
  using (eh_admin()) with check (eh_admin());

create policy membros_select on public.fornecedor_membros for select
  using (eh_admin() or fornec_papel(fornecedor_id) is not null or fornecedor_id = meu_fornecedor_id());
create policy membros_update on public.fornecedor_membros for update
  using (eh_admin() or fornec_papel(fornecedor_id) = 'gestor')
  with check (eh_admin() or fornec_papel(fornecedor_id) = 'gestor');
create policy membros_delete on public.fornecedor_membros for delete
  using (eh_admin() or fornec_papel(fornecedor_id) = 'gestor');
create policy membros_insert on public.fornecedor_membros for insert
  with check (eh_admin());

create policy clientes_select on public.fornecedor_clientes for select
  using (user_id = auth.uid() or eh_admin() or fornec_papel(fornecedor_id) = 'gestor'
    or (vendedor_id is not null and vendedor_id = fornec_membro_id(fornecedor_id)));
create policy clientes_update on public.fornecedor_clientes for update
  using (user_id = auth.uid() or eh_admin() or fornec_papel(fornecedor_id) = 'gestor')
  with check (user_id = auth.uid() or eh_admin() or fornec_papel(fornecedor_id) = 'gestor');
create policy clientes_delete on public.fornecedor_clientes for delete
  using (eh_admin() or fornec_papel(fornecedor_id) = 'gestor');
create policy clientes_insert on public.fornecedor_clientes for insert
  with check (eh_admin());

create policy convites_select on public.fornecedor_convites for select
  using (eh_admin() or fornec_papel(fornecedor_id) = 'gestor');
create policy convites_insert on public.fornecedor_convites for insert
  with check (eh_admin() or (fornec_papel(fornecedor_id) = 'gestor' and papel <> 'gestor'));
create policy convites_update on public.fornecedor_convites for update
  using (eh_admin() or fornec_papel(fornecedor_id) = 'gestor')
  with check (eh_admin() or (fornec_papel(fornecedor_id) = 'gestor' and papel <> 'gestor'));
create policy convites_delete on public.fornecedor_convites for delete
  using (eh_admin() or fornec_papel(fornecedor_id) = 'gestor');

create policy produtos_select on public.fornecedor_produtos for select
  using (eh_admin() or fornec_papel(fornecedor_id) is not null or fornecedor_id = meu_fornecedor_id());
create policy produtos_write on public.fornecedor_produtos for all
  using (eh_admin() or fornec_papel(fornecedor_id) is not null)
  with check (eh_admin() or fornec_papel(fornecedor_id) is not null);

create policy fdietas_all on public.fornecedor_dietas for all
  using (eh_admin() or fornec_papel(fornecedor_id) is not null)
  with check (eh_admin() or fornec_papel(fornecedor_id) is not null);

create policy fdieta_itens_all on public.fornecedor_dieta_itens for all
  using (exists (select 1 from fornecedor_dietas d where d.id = dieta_id and (eh_admin() or fornec_papel(d.fornecedor_id) is not null)))
  with check (exists (select 1 from fornecedor_dietas d where d.id = dieta_id and (eh_admin() or fornec_papel(d.fornecedor_id) is not null)));

create policy festoque_select on public.fornecedor_estoque for select
  using (fornec_cliente_visivel(cliente_id));
create policy festoque_insert on public.fornecedor_estoque for insert
  with check (fornec_cliente_proprio(cliente_id));
create policy festoque_update on public.fornecedor_estoque for update
  using (fornec_cliente_proprio(cliente_id)) with check (fornec_cliente_proprio(cliente_id));
create policy festoque_delete on public.fornecedor_estoque for delete
  using (fornec_cliente_proprio(cliente_id));

create policy emov_all on public.estoque_movimentos for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from fornecedor_produtos p where p.id = produto_id and p.fornecedor_id = meu_fornecedor_id()));

create policy pedidos_select on public.fornecedor_pedidos for select
  using (fornec_cliente_visivel(cliente_id));
create policy pedidos_insert on public.fornecedor_pedidos for insert
  with check (
    (fornec_cliente_proprio(cliente_id) and origem = 'cliente' and status = 'novo')
    or (fornec_cliente_visivel(cliente_id) and (eh_admin() or fornec_papel(fornecedor_id) is not null) and origem = 'vendedor')
  );
create policy pedidos_update on public.fornecedor_pedidos for update
  using (fornec_cliente_visivel(cliente_id)) with check (fornec_cliente_visivel(cliente_id));
create policy pedidos_delete on public.fornecedor_pedidos for delete
  using (eh_admin());

-- ─── Gatilhos de proteção ─────────────────────────────────────────────────────

create or replace function public.set_updated_at_generico() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger trg_fornecedores_upd before update on public.fornecedores for each row execute function public.set_updated_at_generico();
create trigger trg_fprodutos_upd before update on public.fornecedor_produtos for each row execute function public.set_updated_at_generico();
create trigger trg_fdietas_upd before update on public.fornecedor_dietas for each row execute function public.set_updated_at_generico();

-- Cliente só altera os próprios dados de contato e a janela de consumo; o
-- vínculo (fornecedor, vendedor, modo, ativo) é do gestor ou do admin.
create or replace function public.proteger_fornecedor_clientes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or eh_admin() or fornec_papel(old.fornecedor_id) = 'gestor'
     or current_setting('app.aceite_convite', true) = '1' then
    if new.fornecedor_id <> old.fornecedor_id or new.user_id <> old.user_id then
      raise exception 'O vínculo do cliente não pode mudar de fornecedor';
    end if;
    return new;
  end if;
  if new.fornecedor_id <> old.fornecedor_id or new.user_id <> old.user_id
     or new.vendedor_id is distinct from old.vendedor_id or new.modo <> old.modo or new.ativo <> old.ativo then
    raise exception 'Somente o gestor do fornecedor altera o vínculo do cliente';
  end if;
  return new;
end $$;
create trigger trg_proteger_fornecedor_clientes before update on public.fornecedor_clientes
  for each row execute function public.proteger_fornecedor_clientes();

-- Pedido: fornecedor e vendedor vêm sempre do vínculo do cliente.
create or replace function public.preparar_fornecedor_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select fornecedor_id, vendedor_id into c from fornecedor_clientes where id = new.cliente_id;
  if not found then raise exception 'Cliente não encontrado'; end if;
  new.fornecedor_id := c.fornecedor_id;
  new.vendedor_id := c.vendedor_id;
  if new.produto_id is not null and new.produto_nome is null then
    select nome into new.produto_nome from fornecedor_produtos where id = new.produto_id;
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
create trigger trg_preparar_fornecedor_pedido before insert on public.fornecedor_pedidos
  for each row execute function public.preparar_fornecedor_pedido();

-- Cliente só aprova uma cotação respondida ou cancela um pedido em aberto;
-- o resto do atendimento é do fornecedor.
create or replace function public.proteger_fornecedor_pedidos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.fornecedor_id <> old.fornecedor_id or new.cliente_id <> old.cliente_id or new.origem <> old.origem then
    raise exception 'Fornecedor, cliente e origem do pedido não mudam';
  end if;
  if auth.role() = 'service_role' or eh_admin() or fornec_papel(old.fornecedor_id) is not null then
    return new;
  end if;
  if (new.quantidade_kg is distinct from old.quantidade_kg) or (new.data_entrega is distinct from old.data_entrega)
     or (new.preco_kg is distinct from old.preco_kg) or (new.valor_total is distinct from old.valor_total)
     or (new.resposta is distinct from old.resposta) or (new.produto_id is distinct from old.produto_id)
     or (new.observacoes is distinct from old.observacoes) or (new.vendedor_id is distinct from old.vendedor_id)
     or (new.estoque_info is distinct from old.estoque_info) or (new.notificado_em is distinct from old.notificado_em) then
    raise exception 'O cliente só pode aprovar ou cancelar o pedido';
  end if;
  if new.status = old.status then return new; end if;
  if (old.status = 'cotado' and new.status = 'aprovado')
     or (old.status in ('novo', 'em_cotacao', 'cotado') and new.status = 'cancelado') then
    return new;
  end if;
  raise exception 'Mudança de status não permitida';
end $$;
create trigger trg_proteger_fornecedor_pedidos before update on public.fornecedor_pedidos
  for each row execute function public.proteger_fornecedor_pedidos();

-- ─── Convites ─────────────────────────────────────────────────────────────────

-- Dados do convite para a página de aceite (sem login).
create or replace function public.ver_convite(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', c.email, 'nome', c.nome, 'papel', c.papel, 'modo', c.modo,
    'fornecedor', f.nome, 'aceito', c.aceito_em is not null, 'expirado', c.expira_em < now())
  from fornecedor_convites c join fornecedores f on f.id = c.fornecedor_id
  where c.token = p_token
$$;
grant execute on function public.ver_convite(uuid) to anon, authenticated;

-- Aceite: o e-mail da conta logada precisa ser o do convite.
create or replace function public.aceitar_convite(
  p_token uuid, p_nome text default null, p_telefone text default null, p_nome_fazenda text default null,
  p_municipio text default null, p_uf text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_uid uuid := auth.uid();
  v_existente record;
begin
  if v_uid is null then raise exception 'Faça login para aceitar o convite'; end if;
  select * into c from fornecedor_convites where token = p_token for update;
  if not found then raise exception 'Convite não encontrado'; end if;
  if c.aceito_em is not null then raise exception 'Este convite já foi aceito'; end if;
  if c.expira_em < now() then raise exception 'Este convite expirou. Peça um novo ao fornecedor'; end if;
  if lower(c.email) <> v_email then
    raise exception 'Este convite foi enviado para %. Entre com essa conta para aceitar', c.email;
  end if;

  if c.papel in ('gestor', 'vendedor') then
    insert into fornecedor_membros (fornecedor_id, user_id, papel, nome, email, telefone)
    values (c.fornecedor_id, v_uid, c.papel, coalesce(p_nome, c.nome), v_email, p_telefone)
    on conflict (fornecedor_id, user_id) do update
      set papel = excluded.papel, ativo = true,
          nome = coalesce(excluded.nome, fornecedor_membros.nome),
          telefone = coalesce(excluded.telefone, fornecedor_membros.telefone);
  else
    select * into v_existente from fornecedor_clientes where user_id = v_uid;
    if found and v_existente.fornecedor_id <> c.fornecedor_id then
      raise exception 'Esta conta já está vinculada a outro fornecedor';
    end if;
    if found then
      perform set_config('app.aceite_convite', '1', true);
      update fornecedor_clientes set ativo = true, modo = c.modo, vendedor_id = coalesce(c.vendedor_id, vendedor_id)
      where id = v_existente.id;
    else
      insert into fornecedor_clientes (fornecedor_id, user_id, vendedor_id, modo, nome_fazenda, responsavel, email, telefone, municipio, uf)
      values (c.fornecedor_id, v_uid, c.vendedor_id, c.modo, p_nome_fazenda, coalesce(p_nome, c.nome), v_email, p_telefone, p_municipio, p_uf);
    end if;
  end if;

  update fornecedor_convites set aceito_em = now() where id = c.id;
  return jsonb_build_object('papel', c.papel, 'modo', c.modo, 'fornecedor_id', c.fornecedor_id);
end $$;
grant execute on function public.aceitar_convite(uuid, text, text, text, text, text) to authenticated;

-- ─── Leituras para clientes e vendedores ─────────────────────────────────────

-- Dietas publicadas do fornecedor do cliente (só a versão publicada).
create or replace function public.dietas_fornecedor_publicadas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(d.publicado || jsonb_build_object('id', d.id, 'publicada_em', d.publicada_em) order by d.publicado ->> 'nome'), '[]'::jsonb)
  from fornecedor_dietas d
  where d.fornecedor_id = meu_fornecedor_id() and d.publicado is not null
$$;
grant execute on function public.dietas_fornecedor_publicadas() to authenticated;

-- Quantos clientes usam cada dieta do fornecedor (dietas criadas a partir dela).
create or replace function public.uso_dietas_fornecedor(fid uuid) returns table (fornecedor_dieta_id uuid, clientes bigint)
language sql stable security definer set search_path = public as $$
  select d.fornecedor_dieta_id, count(distinct d.user_id)
  from dietas d
  join fornecedor_dietas fd on fd.id = d.fornecedor_dieta_id
  join fornecedor_clientes c on c.user_id = d.user_id and c.fornecedor_id = fd.fornecedor_id
  where fd.fornecedor_id = fid and (eh_admin() or fornec_papel(fid) is not null)
  group by d.fornecedor_dieta_id
$$;
grant execute on function public.uso_dietas_fornecedor(uuid) to authenticated;

-- Fornecedor de demonstração (2026-11-16): a rotina diária ignora.
alter table public.fornecedores add column demo boolean not null default false;

-- Estoque gerenciado e logística (2026-11-16): ver migração portal_parceiros_estoque_gerenciado_logistica
-- (estoque_movimentos.automatico/criado_por/pedido_id e RLS da equipe, fornecedor_consumo_informado,
--  fornecedor_rotas, fornecedor_config, fornecedor_clientes.rota_id, fornecedor_pedidos.estoque_lancado_em).

-- ═══ Migração portal_parceiros_dietas_como_produto ═══
-- Dietas viram produtos (categoria 'dieta'): ração pronta (vendida como produto) ou receita
alter table public.fornecedor_produtos drop constraint fornecedor_produtos_categoria_check;
alter table public.fornecedor_produtos add constraint fornecedor_produtos_categoria_check
  check (categoria in ('racao', 'nucleo', 'mineral', 'grao', 'farelo', 'volumoso', 'outro', 'dieta'));
alter table public.fornecedor_produtos
  add column modo_dieta text check (modo_dieta in ('pronta', 'receita')),
  add column descricao text,
  add column ciclo_recomendado integer,
  add column gmd_esperado numeric,
  add column gmd_esperado_concentrado numeric,
  add column pct_consumo_pv_ms numeric,
  add column pct_concentrado numeric,
  add column pct_volumoso numeric,
  add column nutricional jsonb;
alter table public.fornecedor_produtos add constraint fornecedor_produtos_dieta_check
  check (categoria <> 'dieta' or modo_dieta is not null);

-- Composição da dieta. Preço só para a equipe do fornecedor (sem leitura para clientes).
create table public.fornecedor_produto_itens (
  id uuid primary key default gen_random_uuid(),
  dieta_id uuid not null references public.fornecedor_produtos(id) on delete cascade,
  origem text not null check (origem in ('produto', 'insumo_padrao', 'livre')),
  produto_id uuid references public.fornecedor_produtos(id) on delete restrict,
  insumo_id uuid references public.insumos_padrao(id) on delete restrict,
  nome text,
  tipo text not null check (tipo in ('concentrado', 'volumoso')),
  pct_participacao numeric not null check (pct_participacao >= 0 and pct_participacao <= 100),
  pct_ms numeric check (pct_ms is null or (pct_ms > 0 and pct_ms <= 100)),
  preco_kg numeric check (preco_kg is null or preco_kg >= 0),
  ordem integer not null default 0,
  check ((origem = 'produto' and produto_id is not null) or (origem = 'insumo_padrao' and insumo_id is not null) or (origem = 'livre' and nome is not null))
);
create index on public.fornecedor_produto_itens (dieta_id);
alter table public.fornecedor_produto_itens enable row level security;
create policy fpitens_all on public.fornecedor_produto_itens for all
  using (exists (select 1 from fornecedor_produtos d where d.id = dieta_id and (eh_admin() or fornec_papel(d.fornecedor_id) is not null)))
  with check (exists (select 1 from fornecedor_produtos d where d.id = dieta_id and (eh_admin() or fornec_papel(d.fornecedor_id) is not null)));

-- Migração das dietas existentes (fornecedor_dietas) para produtos receita,
-- remapeamento de dietas.fornecedor_dieta_id e fornecedor_clientes.dietas_em_uso,
-- e remoção de fornecedor_dietas / fornecedor_dieta_itens (aplicado uma vez).

create or replace function public.dietas_fornecedor_publicadas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'nome', d.nome, 'descricao', d.descricao, 'modo_dieta', d.modo_dieta,
    'ciclo_recomendado', d.ciclo_recomendado, 'gmd_esperado', d.gmd_esperado, 'gmd_esperado_concentrado', d.gmd_esperado_concentrado,
    'pct_consumo_pv_ms', d.pct_consumo_pv_ms, 'pct_concentrado', d.pct_concentrado, 'pct_volumoso', d.pct_volumoso,
    'pct_ms', d.pct_ms, 'nutricional', d.nutricional, 'embalagem', d.embalagem,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
        'origem', i.origem, 'produto_id', i.produto_id, 'insumo_id', i.insumo_id, 'tipo', i.tipo,
        'pct_participacao', i.pct_participacao, 'pct_ms', coalesce(i.pct_ms, p.pct_ms, ip.pct_ms),
        'nome', coalesce(p.nome, ip.nome, i.nome), 'categoria', coalesce(p.categoria, ip.categoria))
        order by i.tipo, i.ordem), '[]'::jsonb)
      from fornecedor_produto_itens i
      left join fornecedor_produtos p on p.id = i.produto_id
      left join insumos_padrao ip on ip.id = i.insumo_id
      where i.dieta_id = d.id)
  ) order by d.nome), '[]'::jsonb)
  from fornecedor_produtos d
  where d.fornecedor_id = meu_fornecedor_id() and d.categoria = 'dieta' and d.visivel
$$;
grant execute on function public.dietas_fornecedor_publicadas() to authenticated;

create or replace function public.uso_dietas_fornecedor(fid uuid) returns table (fornecedor_dieta_id uuid, clientes bigint)
language sql stable security definer set search_path = public as $$
  select d.fornecedor_dieta_id, count(distinct d.user_id)
  from dietas d
  join fornecedor_produtos fp on fp.id = d.fornecedor_dieta_id
  join fornecedor_clientes c on c.user_id = d.user_id and c.fornecedor_id = fp.fornecedor_id
  where fp.fornecedor_id = fid and (eh_admin() or fornec_papel(fid) is not null)
  group by d.fornecedor_dieta_id
$$;
grant execute on function public.uso_dietas_fornecedor(uuid) to authenticated;

-- ═══ Migração portal_parceiros_simulador_endereco ═══
-- Preço de referência dos produtos (R$/kg MN), só para a equipe do fornecedor.
create table public.fornecedor_produto_precos (
  produto_id uuid primary key references public.fornecedor_produtos(id) on delete cascade,
  preco_kg numeric not null check (preco_kg >= 0),
  atualizado_em timestamptz not null default now()
);
alter table public.fornecedor_produto_precos enable row level security;
create policy fprecos_all on public.fornecedor_produto_precos for all
  using (exists (select 1 from fornecedor_produtos p where p.id = produto_id and (eh_admin() or fornec_papel(p.fornecedor_id) is not null)))
  with check (exists (select 1 from fornecedor_produtos p where p.id = produto_id and (eh_admin() or fornec_papel(p.fornecedor_id) is not null)));

-- Endereço de entrega do produtor
alter table public.fornecedor_clientes add column endereco_entrega text, add column link_maps text;

create or replace function public.definir_endereco_cliente(cid uuid, endereco text, link text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from fornecedor_clientes where id = cid;
  if not found then raise exception 'Cliente não encontrado'; end if;
  if not (c.user_id = auth.uid() or eh_admin() or fornec_papel(c.fornecedor_id) = 'gestor'
          or (c.vendedor_id is not null and c.vendedor_id = fornec_membro_id(c.fornecedor_id))) then
    raise exception 'Sem permissão para alterar o endereço deste cliente';
  end if;
  if link is not null and btrim(link) <> '' and btrim(link) !~* '^https://' then
    raise exception 'O link do Google Maps deve começar com https://';
  end if;
  update fornecedor_clientes set endereco_entrega = nullif(btrim(endereco), ''), link_maps = nullif(btrim(link), '') where id = cid;
end $$;
grant execute on function public.definir_endereco_cliente(uuid, text, text) to authenticated;

-- Simulações do portal: de cada vendedor; o gestor vê as da equipe.
create table public.fornecedor_simulacoes (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  membro_id uuid not null references public.fornecedor_membros(id) on delete cascade,
  nome text not null,
  dados jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.fornecedor_simulacoes (fornecedor_id, membro_id);
alter table public.fornecedor_simulacoes enable row level security;
create policy fsim_select on public.fornecedor_simulacoes for select
  using (eh_admin() or fornec_papel(fornecedor_id) = 'gestor' or membro_id = fornec_membro_id(fornecedor_id));
create policy fsim_insert on public.fornecedor_simulacoes for insert
  with check (membro_id = fornec_membro_id(fornecedor_id));
create policy fsim_update on public.fornecedor_simulacoes for update
  using (eh_admin() or membro_id = fornec_membro_id(fornecedor_id))
  with check (eh_admin() or membro_id = fornec_membro_id(fornecedor_id));
create policy fsim_delete on public.fornecedor_simulacoes for delete
  using (eh_admin() or fornec_papel(fornecedor_id) = 'gestor' or membro_id = fornec_membro_id(fornecedor_id));
