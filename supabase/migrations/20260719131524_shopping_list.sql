-- ============================================================================
-- Migración 0003 — Lista de la compra (con Realtime)
-- ============================================================================
-- Esquema multi-lista pero la UI usa una única lista activa por hogar.
-- shopping_list_items entra en la publicación de Realtime para sincronizar el
-- marcado entre miembros del hogar al instante.
-- ============================================================================

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null default 'Lista de la compra',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
-- Como mucho una lista activa por hogar.
create unique index shopping_lists_one_active
  on public.shopping_lists (household_id)
  where status = 'active';

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  quantity numeric(10, 2),
  unit public.unit_type,
  is_checked boolean not null default false,
  checked_by text,
  checked_at timestamptz,
  added_by text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index shopping_list_items_list_idx
  on public.shopping_list_items (list_id, is_checked, position);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

create policy "lists_select_member" on public.shopping_lists
  for select to authenticated using (public.is_household_member(household_id));
create policy "lists_insert_member" on public.shopping_lists
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "lists_update_member" on public.shopping_lists
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "lists_delete_member" on public.shopping_lists
  for delete to authenticated using (public.is_household_member(household_id));

create policy "list_items_select_member" on public.shopping_list_items
  for select to authenticated using (public.is_household_member(household_id));
create policy "list_items_insert_member" on public.shopping_list_items
  for insert to authenticated with check (public.is_household_member(household_id));
create policy "list_items_update_member" on public.shopping_list_items
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "list_items_delete_member" on public.shopping_list_items
  for delete to authenticated using (public.is_household_member(household_id));

grant select, insert, update, delete on public.shopping_lists to authenticated;
grant select, insert, update, delete on public.shopping_list_items to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: sincroniza los items de la lista entre miembros (RLS aplica).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.shopping_list_items;

-- ---------------------------------------------------------------------------
-- Lista activa por hogar: al crear hogar + backfill de los existentes.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_active_list(hid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.shopping_lists (household_id, name, status)
  select hid, 'Lista de la compra', 'active'
  where not exists (
    select 1 from public.shopping_lists
    where household_id = hid and status = 'active'
  );
$$;

do $$
declare
  h record;
begin
  for h in select id from public.households loop
    perform public.ensure_active_list(h.id);
  end loop;
end;
$$;

create or replace function public.create_household(
  p_name text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
  v_household_id uuid;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  loop
    v_code := public.generate_invite_code();
    exit when not exists (
      select 1 from public.households where invite_code = v_code
    );
  end loop;

  insert into public.households (name, invite_code, created_by)
  values (trim(p_name), v_code, v_uid)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, v_uid, 'owner', nullif(trim(p_display_name), ''));

  perform public.seed_default_categories(v_household_id);
  perform public.ensure_active_list(v_household_id);

  return v_household_id;
end;
$$;
