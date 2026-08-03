-- ============================================================================
-- Migración — Huecos que el hogar NO quiere que se planifiquen
-- ============================================================================
-- «Los miércoles no planifiques cena» (comemos fuera, cenamos en casa de mis
-- padres, ese día pedimos pizza…). Es una regla RECURRENTE por día de la semana
-- y hueco, y por eso vive en `menu_rules` y no en una tabla nueva: es
-- literalmente una regla del menú, y así hereda de las que ya había el listado,
-- el activar/desactivar sin borrar y el borrado.
--
-- A mano ya se podía —escribir «Cenamos fuera» en el hueco lo protege de la
-- regeneración por ser `manual`—, pero había que repetirlo cada semana.
--
-- La regla solo dice «no me lo planifiques»: no borra lo que ya hubiera en ese
-- hueco ni impide añadir algo a mano. Es una preferencia, no una prohibición.
-- ============================================================================

alter table public.menu_rules
  -- 0 = lunes … 6 = domingo, el mismo orden que `getWeekDays` en la app.
  add column weekday smallint check (weekday between 0 and 6),
  add column meal_slot text check (meal_slot in ('breakfast', 'lunch', 'dinner'));

-- El check de `kind` es el inline de la columna, con nombre puesto por Postgres.
-- Se busca por su definición en vez de darlo por hecho: si el nombre no fuese el
-- esperado, un `drop ... if exists` no borraría nada y los INSERT del tipo nuevo
-- fallarían contra el check viejo, que es un fallo que solo se ve en producción.
do $$
declare
  nombre text;
begin
  select conname into nombre
  from pg_constraint
  where conrelid = 'public.menu_rules'::regclass
    and contype = 'c'
    and conname <> 'menu_rules_shape'
    and pg_get_constraintdef(oid) like '%kind%';

  if nombre is not null then
    execute format('alter table public.menu_rules drop constraint %I', nombre);
  end if;
end $$;

alter table public.menu_rules
  add constraint menu_rules_kind_valido check (
    kind in ('recipe_min_week', 'recipe_max_week', 'free_text', 'skip_slot')
  );

-- Coherencia entre kind y sus campos, ampliada con la forma del tipo nuevo:
-- `skip_slot` necesita día y hueco, y no lleva receta, valor ni texto.
alter table public.menu_rules drop constraint menu_rules_shape;

alter table public.menu_rules
  add constraint menu_rules_shape check (
    (
      kind in ('recipe_min_week', 'recipe_max_week')
      and recipe_id is not null
      and value is not null
      and text_rule is null
      and weekday is null
      and meal_slot is null
    )
    or (
      kind = 'free_text'
      and text_rule is not null
      and recipe_id is null
      and value is null
      and weekday is null
      and meal_slot is null
    )
    or (
      kind = 'skip_slot'
      and weekday is not null
      and meal_slot is not null
      and recipe_id is null
      and value is null
      and text_rule is null
    )
  );

-- Un hogar no puede decir dos veces lo mismo del mismo hueco: el alta se
-- convierte en idempotente y la lista no se llena de duplicados.
create unique index menu_rules_skip_slot_unico
  on public.menu_rules (household_id, weekday, meal_slot)
  where kind = 'skip_slot';
