-- ============================================================================
-- Migración — Los pasos de la receta dejan de ser un párrafo
-- ============================================================================
-- `instructions` era un `text` suelto que la app pintaba en un Textarea: para
-- LEERLO mientras cocinas no sirve (no hay paso 1, ni sitio donde marcar por
-- dónde ibas) y para que lo ESCRIBA la IA tampoco (un blob no se puede revisar
-- paso a paso ni volver a numerar si quitas uno). `steps` es el mismo contenido
-- con la estructura que ya tenía en la cabeza de quien lo escribió.
--
-- `text[]` y no `jsonb` ni una tabla `recipe_steps`:
--   · El orden es el del array, gratis y sin columna `position` que mantener.
--   · Es la misma forma que `meal_types` y `seasons`, en esta misma tabla.
--   · Una tabla aparte solo se pagaría si cada paso llevara FKs (ingredientes
--     por paso, temporizadores). Hoy no los lleva, y `types.ts` se mantiene A
--     MANO en este repo: una tabla nueva son tres bloques de tipos escritos a
--     dedo para nada.
--
-- NO se añade una columna que marque «esto lo escribió la IA», y es a propósito:
-- la generación devuelve un BORRADOR al formulario y el hogar lo guarda con el
-- botón de siempre, así que en cuanto está en la base ya lo ha revisado una
-- persona. El único caso donde la distinción importa —el plato que la IA inventó
-- al generar el menú y que nadie ha adoptado— ya lo dice `recipes.source = 'ai'`.
-- ============================================================================

alter table public.recipes
  add column steps text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Conversión del histórico: cada línea no vacía de `instructions` es un paso.
-- Partir por saltos de línea es exactamente lo que ya hacía el ojo al leer el
-- Textarea, así que no se pierde ni se inventa nada.
--
-- `with ordinality` es lo que conserva el ORDEN (sin él, `array_agg` no tiene
-- por qué respetar el del texto original), y el `cross join` deja fuera solas
-- las recetas sin instrucciones: `string_to_array(null, …)` no produce filas.
-- El `btrim` se come también el `\r` de los textos escritos en Windows, que si
-- no viajaría pegado al final de cada paso.
-- ---------------------------------------------------------------------------
update public.recipes r
set steps = sub.pasos
from (
  select r2.id,
         array_agg(btrim(u.linea, E' \t\r\n') order by u.orden) as pasos
  from public.recipes r2
  cross join unnest(string_to_array(r2.instructions, E'\n'))
    with ordinality as u (linea, orden)
  where btrim(u.linea, E' \t\r\n') <> ''
  group by r2.id
) sub
where r.id = sub.id;

-- ---------------------------------------------------------------------------
-- `instructions` se queda en la tabla, sin que la app la lea ni la escriba ya.
-- Es la copia de seguridad de la conversión de arriba: si algún recetario sale
-- mal partido, el original sigue ahí. Se puede borrar en una migración
-- posterior, cuando se haya visto que los pasos están bien.
-- ---------------------------------------------------------------------------
comment on column public.recipes.instructions is
  'Legacy (pre-steps). La app ya no lee ni escribe esta columna: los pasos viven en `steps`. Se conserva como respaldo de la conversión de 20260805120000 y se puede borrar más adelante.';

comment on column public.recipes.steps is
  'Pasos de preparación en orden. Las cantidades que citen son para `servings` raciones.';

-- ---------------------------------------------------------------------------
-- Dos topes de seguridad por debajo de zod (`recipes/schemas.ts`), que es quien
-- valida de verdad. Los dos los cumple por construcción lo ya convertido: la
-- conversión descarta las líneas vacías, y el tope de tamaño va muy por encima
-- de los 4000 caracteres que zod dejaba escribir en `instructions`.
--
-- El número de pasos NO se limita aquí a propósito: un tope de filas podía
-- hacer FALLAR el update de arriba con un histórico de muchas líneas cortas, y
-- una migración que no se aplica al mergear a `main` es un despliegue roto.
-- Contar pasos es trabajo de zod, que puede negarse sin tumbar nada.
-- ---------------------------------------------------------------------------
alter table public.recipes
  add constraint recipes_steps_sin_vacios
    check (not ('' = any (steps))),
  add constraint recipes_steps_tope_tamano
    check (length(array_to_string(steps, '')) <= 20000);
