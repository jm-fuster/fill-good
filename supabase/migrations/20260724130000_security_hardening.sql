-- ============================================================================
-- Blindaje de seguridad — correcciones de la auditoría 2026-07
-- ============================================================================
-- 1. Cierra la escritura CROSS-TENANT vía funciones SECURITY DEFINER internas
--    (seed_default_products / seed_default_categories) que se quedaron con el
--    EXECUTE de PUBLIC por defecto. En Postgres, CREATE FUNCTION concede EXECUTE
--    a PUBLIC y `create or replace` NO resetea grants: quedaban invocables por
--    cualquier `authenticated` vía PostgREST (`POST /rest/v1/rpc/…`) con un
--    household_id ajeno → sembraba productos/categorías en hogares de terceros.
-- 2. ensure_active_list SÍ la invoca el cliente (shopping-list/queries.ts), así
--    que no se puede revocar de authenticated: se le añade un guard
--    is_household_member(hid) para que solo cree listas en el propio hogar.
-- 3. recipe_ratings: la escritura pasa a ser PER-USUARIO (nadie valora, edita ni
--    borra en nombre de otro miembro). La lectura sigue por hogar (la media
--    alimenta el generador de menús). Alinea con user_pinned_products.
-- 4. households: los miembros solo pueden editar `monthly_budget` por PostgREST.
--    `invite_code`/`created_by`/`name` dejan de ser editables directamente (el
--    código solo se rota vía regenerate_invite_code, RPC definer que corre como
--    owner y no le afecta este grant de columna).
-- 5. generate_invite_code: 8 → 12 hex (32 → 48 bits) para dificultar la fuerza
--    bruta de códigos. El schema de join y el input ya aceptaban hasta 12 chars.
--    NOTA: la defensa completa contra fuerza bruta requiere rate-limiting en
--    join_household_by_code (infra: p. ej. Upstash/Vercel KV), fuera de esta
--    migración.
-- ============================================================================

-- ── 1. Funciones seed internas: revocar EXECUTE de PUBLIC/anon ──────────────
-- Solo se invocan desde create_household (llamada anidada, corre como owner) y
-- desde los backfills de migración (corren como owner): revocar de public/anon
-- NO las rompe y cierra el acceso vía PostgREST. No se conceden a authenticated.
revoke execute on function public.seed_default_products(uuid) from public, anon;
revoke execute on function public.seed_default_categories(uuid) from public, anon;

-- ── 2. ensure_active_list: guard de pertenencia ─────────────────────────────
-- La invoca el cliente para crear la lista activa del propio hogar. El guard
-- impide que un authenticated cree listas en hogares ajenos. create_household la
-- llama TRAS insertar la membresía del owner, así que ahí el guard pasa.
create or replace function public.ensure_active_list(hid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(hid) then
    raise exception 'not_a_member';
  end if;

  insert into public.shopping_lists (household_id, name, status)
  select hid, 'Lista de la compra', 'active'
  where not exists (
    select 1 from public.shopping_lists
    where household_id = hid and status = 'active'
  );
end;
$$;

revoke execute on function public.ensure_active_list(uuid) from public, anon;
grant execute on function public.ensure_active_list(uuid) to authenticated;

-- ── 3. recipe_ratings: escritura per-usuario (lectura por hogar) ────────────
drop policy if exists "recipe_ratings_all_member" on public.recipe_ratings;

create policy "recipe_ratings_select_member" on public.recipe_ratings
  for select to authenticated
  using (public.is_household_member(household_id));

create policy "recipe_ratings_insert_own" on public.recipe_ratings
  for insert to authenticated
  with check (
    user_id = public.clerk_user_id()
    and public.is_household_member(household_id)
  );

create policy "recipe_ratings_update_own" on public.recipe_ratings
  for update to authenticated
  using (user_id = public.clerk_user_id())
  with check (
    user_id = public.clerk_user_id()
    and public.is_household_member(household_id)
  );

create policy "recipe_ratings_delete_own" on public.recipe_ratings
  for delete to authenticated
  using (user_id = public.clerk_user_id());

-- ── 4. households: restringir columnas editables por miembros ───────────────
-- La RLS (households_update_member) ya acota la FILA al hogar; esto acota las
-- COLUMNAS. init.sql concedió UPDATE de tabla completa; lo revocamos y damos
-- solo monthly_budget. regenerate_invite_code (definer) sigue rotando el código.
revoke update on public.households from authenticated;
grant update (monthly_budget) on public.households to authenticated;

-- ── 5. Código de invitación: más entropía (8 → 12 hex, 48 bits) ─────────────
create or replace function public.generate_invite_code()
returns text
language sql
volatile
as $$
  select upper(substr(md5(gen_random_uuid()::text), 1, 12))
$$;
