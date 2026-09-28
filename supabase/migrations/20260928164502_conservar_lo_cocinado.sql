-- ============================================================================
-- Lo cocinado sobrevive a la limpieza de los menús viejos
-- ============================================================================
-- `cleanup_retention` borra los menús de hace más de 26 semanas (lo promete
-- /privacidad §7) y con ellos, en cascada, sus `menu_entries`. Pero
-- `menu_entries.cooked_at` es el ÚNICO sitio donde vive la prueba de qué
-- cocinó el hogar, y de ahí salen `timesCooked`/`lastCookedAt`
-- (`getRecipeSignals`: lo que evita que el generador repita lo de la semana
-- pasada y lo que ordena el recetario) y el «Es la N.ª vez» del modo cocinado
-- (`getRecipeCookedCount`). Sin esto, a partir de enero de 2027 —26 semanas
-- después de los primeros menús de julio— esas cuentas se irían truncando sin
-- ningún error: una receta cocinada veinte veces pasaría a «primera vez».
--
-- Salida elegida: antes de borrar, la limpieza SUMA lo que va a desaparecer en
-- `archived_recipe_counts`, una fila por receta del hogar. Se guarda lo mínimo
-- que usa la app —cuántas veces se planificó, cuántas se cocinó y la última
-- fecha—, no las entradas: el menú viejo se sigue borrando entero, que es lo
-- que dice la política, y la alternativa (conservar las entradas cocinadas)
-- habría dejado semanas antiguas a medias al navegar por el calendario.
--
-- Las cuentas de la app pasan a ser «archivado + lo que queda vivo». No se
-- cuenta dos veces porque la suma y el borrado van en la MISMA función, o sea
-- en la misma transacción: si el borrado falla, la suma se deshace con él.
--
-- Fuera a propósito: los platos escritos a mano (`free_text`), que no tienen
-- receta y no alimentan ninguna señal, y el informe de uso
-- (`scripts/usage-report.mjs`), que cuenta entradas y verá solo las vivas.
-- ============================================================================

create table public.archived_recipe_counts (
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null,
  times_planned int not null default 0,
  times_cooked int not null default 0,
  last_cooked_at date,
  updated_at timestamptz not null default now(),
  primary key (household_id, recipe_id),
  -- Compuesta, como toda referencia entre objetos del hogar (AGENTS.md): el
  -- contador solo puede apuntar a una receta del MISMO hogar. Borrar la receta
  -- borra su historia, igual que ya hacían sus entradas de menú con el
  -- `recipe_id`.
  foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete cascade,
  check (times_cooked >= 0 and times_planned >= times_cooked),
  check ((times_cooked = 0) = (last_cooked_at is null))
);

alter table public.archived_recipe_counts enable row level security;

-- Solo lectura para los miembros. La única que escribe es `cleanup_retention`
-- (security definer, desde el cron): la app no tiene nada que corregir aquí, y
-- sin políticas de escritura un cliente no puede inflar ni borrar la historia.
create policy "archived_recipe_counts_select_member"
  on public.archived_recipe_counts
  for select to authenticated
  using (public.is_household_member(household_id));

-- Hasta el 30-oct-2026 los privilegios por defecto del proyecto dan ALL sobre
-- toda tabla nueva a anon y authenticated. La RLS ya bloquea las escrituras
-- (sin política, un update o un delete no tocan nada), pero en silencio; con
-- el revoke el permiso dice lo mismo que la política: solo lectura, y anon
-- nada. `service_role` no la necesita (ni Alexa, ni los crones, ni los
-- scripts la leen) y se queda con lo que le dé el proyecto.
revoke all on public.archived_recipe_counts from anon, authenticated;
grant select on public.archived_recipe_counts to authenticated;

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

  -- Lo que se va a borrar abajo, sumado a su contador. MISMO filtro que el
  -- delete de weekly_menus: si divergen, se archiva una cosa y se borra otra.
  -- Las mismas cuentas que `getRecipeSignals`: planificada = toda entrada con
  -- receta (también las que no se hicieron), cocinada = con `cooked_at`.
  insert into public.archived_recipe_counts as a
    (household_id, recipe_id, times_planned, times_cooked, last_cooked_at)
  select e.household_id, e.recipe_id, count(*), count(e.cooked_at), max(e.cooked_at)
  from public.menu_entries e
  join public.weekly_menus m on m.household_id = e.household_id and m.id = e.menu_id
  where m.week_start < (current_date - interval '26 weeks')
    and e.recipe_id is not null
  group by e.household_id, e.recipe_id
  on conflict (household_id, recipe_id) do update set
    times_planned = a.times_planned + excluded.times_planned,
    times_cooked = a.times_cooked + excluded.times_cooked,
    -- greatest() ignora los null: una tanda sin nada cocinado no borra la fecha.
    last_cooked_at = greatest(a.last_cooked_at, excluded.last_cooked_at),
    updated_at = now();

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

  delete from public.alexa_requests
  where created_at < now() - interval '1 day';

  delete from public.usage_events
  where created_at < now() - interval '12 months';

  delete from public.usage_days
  where day < (current_date - interval '12 months');
$$;
