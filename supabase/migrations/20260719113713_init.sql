-- ============================================================================
-- Migración 0001 — Núcleo: hogares, miembros, seguridad RLS y RPCs de alta
-- ============================================================================
-- Modelo de seguridad de toda la app: cada fila de datos lleva household_id y
-- el acceso se controla con RLS basada en el claim `sub` del JWT de Clerk
-- (integración nativa Clerk ↔ Supabase third-party auth).
-- ============================================================================

-- Extensiones (búsqueda difusa y normalización de acentos para el catálogo/tickets)
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------------------
-- Enums compartidos (se usarán también en fases posteriores)
-- ---------------------------------------------------------------------------
create type public.unit_type as enum ('ud', 'g', 'kg', 'ml', 'l');
create type public.location_type as enum ('pantry', 'fridge', 'freezer', 'other');
create type public.member_role as enum ('owner', 'member');

-- ---------------------------------------------------------------------------
-- Helper: id del usuario actual de Clerk (claim `sub` del JWT)
-- ---------------------------------------------------------------------------
create or replace function public.clerk_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id text not null,
  role public.member_role not null default 'member',
  display_name text,
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- Lookup crítico para RLS: "¿de qué hogares es miembro este usuario?"
create index household_members_user_idx on public.household_members (user_id);

-- ---------------------------------------------------------------------------
-- Helper: ¿es el usuario actual miembro del hogar `hid`?
-- security definer para saltarse RLS sobre household_members y evitar recursión
-- de políticas.
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid
      and user_id = public.clerk_user_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- households: los miembros pueden ver y renombrar su hogar.
-- No hay política de INSERT/DELETE directo: el alta se hace vía RPC (definer).
create policy "households_select_member" on public.households
  for select to authenticated
  using (public.is_household_member(id));

create policy "households_update_member" on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- household_members: cada usuario ve los miembros de sus hogares y puede
-- borrar su propia membresía (abandonar el hogar). El alta se hace vía RPC.
create policy "members_select_same_household" on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

create policy "members_delete_self" on public.household_members
  for delete to authenticated
  using (user_id = public.clerk_user_id());

-- ---------------------------------------------------------------------------
-- Grants: el rol `authenticated` (JWT de Clerk con claim role) opera sobre las
-- tablas; RLS filtra las filas. `anon` no tiene políticas → acceso denegado.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.households to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de alta de hogar (security definer: se saltan RLS de forma controlada)
-- ---------------------------------------------------------------------------

-- Código de invitación de 8 caracteres hexadecimales en mayúscula (sin
-- ambigüedad de letras: solo 0-9 y A-F).
create or replace function public.generate_invite_code()
returns text
language sql
volatile
as $$
  select upper(substr(md5(gen_random_uuid()::text), 1, 8))
$$;

-- Crear un hogar nuevo y añadir al creador como owner. Devuelve el id del hogar.
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

  -- Código único
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

  return v_household_id;
end;
$$;

-- Unirse a un hogar existente mediante código de invitación. Devuelve el id.
create or replace function public.join_household_by_code(
  p_code text,
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
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_household_id
  from public.households
  where invite_code = upper(trim(p_code));

  if v_household_id is null then
    raise exception 'invalid_code';
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, v_uid, 'member', nullif(trim(p_display_name), ''))
  on conflict (household_id, user_id) do nothing;

  return v_household_id;
end;
$$;

-- Regenerar el código de invitación de un hogar (cualquier miembro). Devuelve
-- el nuevo código.
create or replace function public.regenerate_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'not_a_member';
  end if;

  loop
    v_code := public.generate_invite_code();
    exit when not exists (
      select 1 from public.households where invite_code = v_code
    );
  end loop;

  update public.households
  set invite_code = v_code
  where id = p_household_id;

  return v_code;
end;
$$;

-- Solo usuarios autenticados pueden ejecutar los RPCs.
revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household_by_code(text, text) from public, anon;
revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household_by_code(text, text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
