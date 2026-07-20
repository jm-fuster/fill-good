-- ============================================================================
-- Migración 0009 — C1: varios platos por comida/cena
-- ============================================================================
-- Hasta ahora `menu_entries` tenía un único (menu_id, date, meal_slot): una sola
-- fila por hueco. Para permitir 1..n platos por comida/cena quitamos ese único,
-- añadimos `position` (0..n dentro del hueco) y un nuevo único que la incluye.

-- 1) Quitar el único de "un plato por hueco".
--    El nombre lo autogeneró Postgres al declararlo inline como
--    `unique (menu_id, date, meal_slot)`. En lugar de fiarnos del nombre exacto,
--    localizamos el constraint por su conjunto de columnas y lo borramos.
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  where con.conrelid = 'public.menu_entries'::regclass
    and con.contype = 'u'
    and (
      select array_agg(att.attname::text order by att.attname::text)
      from unnest(con.conkey) as cols(attnum)
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = cols.attnum
    ) = array['date', 'meal_slot', 'menu_id']
  limit 1;

  if cname is not null then
    execute format('alter table public.menu_entries drop constraint %I', cname);
  end if;
end $$;

-- 2) Posición del plato dentro del hueco (la app gestiona 0..n).
alter table public.menu_entries
  add column if not exists position int not null default 0;

-- 3) Nuevo único que admite varios platos por hueco.
alter table public.menu_entries
  drop constraint if exists menu_entries_menu_id_date_meal_slot_position_key;
alter table public.menu_entries
  add constraint menu_entries_menu_id_date_meal_slot_position_key
  unique (menu_id, date, meal_slot, position);
