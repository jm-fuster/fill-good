-- ============================================================================
-- Los ingredientes de una receta guardan su orden
-- ============================================================================
-- `recipe_ingredients` no tenía columna de orden y las lecturas ordenaban por
-- `id`, que es un uuid v4 aleatorio: la lista salía barajada, y como guardar
-- una receta reinserta todas sus filas, cada guardado la barajaba otra vez. Se
-- veía en la ficha, en «Antes de empezar» del modo cocinado y en el panel del
-- menú: escribías «Arroz, Pollo, Sal» y reabrías «Sal, Arroz, Pollo».
alter table public.recipe_ingredients
  add column if not exists position integer not null default 0;

-- Las filas que ya existen conservan el orden en que se ven HOY (por `id`): no
-- hay forma de recuperar el que se escribió, pero a partir de aquí deja de
-- cambiar en cada guardado.
update public.recipe_ingredients ri
   set position = numbered.n
  from (
    select id, row_number() over (partition by recipe_id order by id) - 1 as n
      from public.recipe_ingredients
  ) numbered
 where numbered.id = ri.id;

create index if not exists recipe_ingredients_order_idx
  on public.recipe_ingredients (recipe_id, position);
