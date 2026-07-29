-- ============================================================================
-- Vinculación con Alexa: skill doméstica «mi despensa» (restar stock por voz)
-- ============================================================================
-- Con un Echo en la cocina se puede ajustar el inventario con las manos
-- ocupadas: «Alexa, dile a mi despensa que reste dos yogures». La skill vive en
-- modo desarrollo (uso doméstico, sin certificación ni publicación), así que el
-- webhook /api/alexa recibe peticiones de Amazon SIN sesión de Clerk: se
-- autentica con la firma de Amazon y opera con la service-role key, que salta
-- la RLS por completo. De ahí el diseño de estas tablas.
--
-- Por qué código de 6 dígitos y no OAuth account linking:
--   El account linking de Alexa exige un servidor OAuth2 completo (authorize +
--   token + refresh) y una pantalla de consentimiento; para una skill privada de
--   un hogar es desproporcionado. Un código efímero que el usuario genera en
--   /perfil y dicta al Echo («vincula con código 428391») consigue lo mismo:
--   demuestra que quien habla al altavoz tiene sesión en la app.
--
-- Por qué el código NO puede empezar por cero:
--   El slot AMAZON.NUMBER devuelve el número parseado, así que «cero cuatro dos
--   uno tres siete» llegaría como 42137 (5 dígitos) y nunca casaría. El rango
--   [100000, 999999] elimina la ambigüedad de raíz; el CHECK lo garantiza
--   también a nivel de BBDD.
--
-- Anti fuerza bruta: un millón de códigos con ventana de 10 minutos es
-- suficiente por sí solo, pero como el canje corre con service-role (sin
-- clerk_user_id() ni RLS que lo acote) se añade un contador de intentos por
-- amazon_user_id, mismo patrón nativo que join_attempts (20260724140000) y
-- ai_usage (20260728130000): máx. 5 canjes fallidos cada 10 minutos.
--
-- Reparto de escrituras (importante para entender las políticas):
--   · /perfil (cliente con JWT de Clerk) → crea y borra SUS códigos; ve y
--     revoca los vínculos de su hogar.
--   · /api/alexa (service-role) → canjea el código, crea el vínculo y actualiza
--     last_used_at. No necesita políticas: la RLS no le aplica.
-- ============================================================================

-- ── 1. Códigos de vinculación efímeros ──────────────────────────────────────
create table public.alexa_link_codes (
  -- El código ES la clave: un solo uso, y así el canje es una búsqueda directa.
  code text primary key check (code ~ '^[1-9][0-9]{5}$'),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Id de Clerk de quien genera el código: será el autor de los movimientos que
  -- dicte ese Echo (el inventario firma quién consume).
  user_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create index alexa_link_codes_user_idx on public.alexa_link_codes (user_id);

alter table public.alexa_link_codes enable row level security;

-- Genera códigos solo para hogares de los que eres miembro, y siempre a tu
-- nombre: sin la segunda condición podrías atribuir a otro los consumos.
create policy "alexa_link_codes_insert_own" on public.alexa_link_codes
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and user_id = public.clerk_user_id()
  );

-- Un código es un secreto personal y efímero: solo lo ve y lo borra quien lo
-- generó (para poder regenerarlo). El canje lo hace el webhook, no el cliente,
-- así que no hay política de UPDATE.
create policy "alexa_link_codes_select_own" on public.alexa_link_codes
  for select to authenticated using (user_id = public.clerk_user_id());

create policy "alexa_link_codes_delete_own" on public.alexa_link_codes
  for delete to authenticated using (user_id = public.clerk_user_id());

grant select, insert, delete on public.alexa_link_codes to authenticated;

-- ── 2. Vínculos activos ─────────────────────────────────────────────────────
create table public.alexa_links (
  id uuid primary key default gen_random_uuid(),
  -- Id opaco que Amazon asigna al usuario de la skill (amzn1.ask.account.…).
  -- UNIQUE: un Echo apunta a un único hogar, así que re-vincular es un upsert.
  amazon_user_id text not null unique,
  household_id uuid not null references public.households (id) on delete cascade,
  -- Autor de los movimientos dictados por voz (heredado del código canjeado).
  user_id text not null,
  created_at timestamptz not null default now(),
  -- Lo refresca el webhook (best-effort): en /perfil delata un vínculo muerto.
  last_used_at timestamptz
);
create index alexa_links_household_idx on public.alexa_links (household_id);

alter table public.alexa_links enable row level security;

-- El altavoz es un dispositivo DEL HOGAR, no de quien lo vinculó: cualquier
-- miembro debe poder ver que existe y revocarlo (p. ej. si alguien se va de
-- casa). Las escrituras son exclusivas del webhook → sin insert/update.
create policy "alexa_links_select_member" on public.alexa_links
  for select to authenticated using (public.is_household_member(household_id));

create policy "alexa_links_delete_member" on public.alexa_links
  for delete to authenticated using (public.is_household_member(household_id));

grant select, delete on public.alexa_links to authenticated;

-- ── 3. Intentos de canje (anti fuerza bruta) ────────────────────────────────
-- Solo la toca el webhook con service-role → RLS activada SIN políticas ni
-- grants, igual que ai_usage. Ningún cliente tiene privilegio sobre ella.
create table public.alexa_link_attempts (
  id bigint generated always as identity primary key,
  amazon_user_id text not null,
  attempted_at timestamptz not null default now()
);
create index alexa_link_attempts_idx
  on public.alexa_link_attempts (amazon_user_id, attempted_at);

alter table public.alexa_link_attempts enable row level security;

-- ── 4. Purga diaria dentro de la retención existente ────────────────────────
-- Se recrea cleanup_retention añadiendo los códigos caducados y los intentos.
-- El resto del cuerpo es idéntico a 20260728130000_ai_rate_limit.
create or replace function public.cleanup_retention()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.inventory_events
  where kind in ('consumed', 'restocked')
    and created_at < now() - interval '90 days';

  delete from public.inventory_events
  where kind = 'discarded'
    and created_at < now() - interval '24 months';

  delete from public.receipts
  where status in ('needs_review', 'processing', 'failed')
    and created_at < now() - interval '30 days';

  delete from public.weekly_menus
  where week_start < (current_date - interval '26 weeks');

  delete from public.join_attempts
  where attempted_at < now() - interval '1 day';

  delete from public.ai_usage
  where created_at < now() - interval '2 days';

  delete from public.alexa_link_codes
  where expires_at < now() - interval '1 day';

  delete from public.alexa_link_attempts
  where attempted_at < now() - interval '1 day';
$$;

-- ── 5. delete_account(): retirar también los vínculos de voz ────────────────
-- Regla de 20260728150000: toda columna nueva con un id de Clerk entra en
-- delete_account() en la MISMA migración que la crea. Aquí no basta con anular
-- la atribución: un vínculo cuyo autor ya no existe dejaría al Echo escribiendo
-- movimientos sin firma, así que se BORRA el vínculo y otro miembro re-vincula.
-- El resto del cuerpo es idéntico a 20260728150000_delete_account_atribucion.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := public.clerk_user_id();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- 1. Propietario de un hogar con más miembros → exige transferir primero.
  if exists (
    select 1
    from public.household_members owner_row
    where owner_row.user_id = v_uid
      and owner_row.role = 'owner'
      and exists (
        select 1
        from public.household_members other
        where other.household_id = owner_row.household_id
          and other.user_id <> v_uid
      )
  ) then
    raise exception 'owner_must_transfer';
  end if;

  -- 2. Hogares donde es propietario y único miembro → borrar (cascade limpia todo).
  delete from public.households h
  where exists (
    select 1 from public.household_members o
    where o.household_id = h.id and o.user_id = v_uid and o.role = 'owner'
  )
  and not exists (
    select 1 from public.household_members m
    where m.household_id = h.id and m.user_id <> v_uid
  );

  -- 3. Anular la atribución personal en el contenido que sobrevive (hogares que
  --    abandona como miembro). Columnas nullable; el contenido es del hogar.
  update public.recipes set created_by = null where created_by = v_uid;
  update public.inventory_events set created_by = null where created_by = v_uid;
  update public.receipts set uploaded_by = null where uploaded_by = v_uid;
  update public.shopping_list_items set added_by = null where added_by = v_uid;
  update public.shopping_list_items set checked_by = null where checked_by = v_uid;
  update public.inventory_items set updated_by = null where updated_by = v_uid;
  update public.shopping_trips set closed_by = null where closed_by = v_uid;
  update public.households set created_by = null where created_by = v_uid;

  -- 4. Abandonar cualquier hogar restante (miembro no propietario).
  delete from public.household_members where user_id = v_uid;

  -- 5. Datos estrictamente personales.
  delete from public.user_pinned_products where user_id = v_uid;
  delete from public.recipe_ratings where user_id = v_uid;
  delete from public.push_subscriptions where user_id = v_uid;
  delete from public.alexa_links where user_id = v_uid;
  delete from public.alexa_link_codes where user_id = v_uid;
end;
$$;

-- create or replace conserva los grants, pero se repiten por si esta migración
-- se aplica sobre una base donde delete_account no existía todavía.
revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
