-- ============================================================================
-- «Finalizar compra» reclama lo marcado SIN desmarcarlo
-- ============================================================================
-- El checkout necesita reclamar las líneas marcadas antes de pasarlas al
-- inventario: sin reclamo, dos móviles que pulsan «Finalizar» a la vez leían
-- las mismas líneas y el stock entraba dos veces. El reclamo era desmarcarlas
-- (`update is_checked = false … returning`), el más barato sin tocar el
-- esquema, y tenía dos caras malas porque desmarcar es justo lo que se VE:
--
--   · Durante los segundos que dura el checkout (unas cinco consultas por
--     artículo), el carro volvía a «pendiente» en los DOS móviles: salía
--     «Quedan N por coger» y la barra de Finalizar desaparecía.
--   · Y era una invitación: si la otra persona, viendo su carro desmarcado,
--     volvía a marcar «Leche» y finalizaba antes del borrado final, su reclamo
--     la encontraba marcada y la procesaba otra vez — stock doble, dos
--     «repuesto» y un segundo `shopping_trips`, lo que el reclamo quería evitar.
--
-- Ahora el reclamo es una marca que la interfaz no pinta: `checkout_claimed_at`.
-- Lo marcado sigue marcado en las dos pantallas mientras se pasa al inventario,
-- y un segundo «Finalizar» no puede llevárselo. Si la función se cortara a mitad
-- (un timeout), el reclamo caduca a los 5 minutos y lo que quedó se puede volver
-- a finalizar; con desmarcar, en cambio, lo no procesado quedaba a la vista pero
-- sin marcar, o sea perdido para la compra.
alter table public.shopping_list_items
  add column if not exists checkout_claimed_at timestamptz;

comment on column public.shopping_list_items.checkout_claimed_at is
  'Cuándo lo reclamó un «Finalizar compra» en curso (null = libre). Caduca a los 5 minutos: ver claim_checked_items.';

-- El reclamo va en SQL para que lo decida el reloj de la BASE (dos servidores
-- con relojes distintos no pueden discrepar sobre si un reclamo caducó) y para
-- que sea una sola sentencia: de dos ejecuciones a la vez, Postgres bloquea las
-- filas y solo una las ve libres. Es INVOKER: corre con el JWT del usuario, así
-- que la RLS de la tabla (miembro del hogar) sigue aplicando, y además se acota
-- al hogar y a la lista que manda la acción.
create or replace function public.claim_checked_items(
  p_household_id uuid,
  p_list_id uuid
)
returns setof public.shopping_list_items
language sql
set search_path = public
as $$
  update public.shopping_list_items
     set checkout_claimed_at = now()
   where household_id = p_household_id
     and list_id = p_list_id
     and is_checked
     and (
       checkout_claimed_at is null
       or checkout_claimed_at < now() - interval '5 minutes'
     )
  returning *;
$$;

revoke execute on function public.claim_checked_items(uuid, uuid) from public, anon;
grant execute on function public.claim_checked_items(uuid, uuid) to authenticated;
