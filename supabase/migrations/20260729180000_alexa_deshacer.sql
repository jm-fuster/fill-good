-- Deshacer la última orden dictada por voz.
--
-- Se anota en `alexa_requests`, que ya existe y ya tiene exactamente una fila
-- por cada petición que escribe (es el cerrojo de idempotencia frente a los
-- reintentos de Amazon). Guardar ahí QUÉ hizo cada orden es la continuación
-- natural de guardar qué contestó, y hereda gratis su purga diaria: la ventana
-- para deshacer son minutos, así que un día de historia sobra de largo.
--
-- Por qué no se reconstruye desde `inventory_events`, que parecería lo obvio:
-- esos eventos se agrupan (`fold`) dentro de una ventana de 15 minutos, así que
-- dos órdenes seguidas del mismo producto quedan soldadas en una sola fila y
-- «deshaz lo último» desharía las dos. Desactivar el agrupado por voz llenaría
-- el historial de líneas de una unidad, que es justo lo que vino a evitar.

alter table public.alexa_requests
  -- Qué altavoz dictó la orden. Sin esto no se puede preguntar «lo último que
  -- hice YO»: la tabla está indexada por el requestId de Amazon, que es opaco.
  add column link_id uuid references public.alexa_links (id) on delete cascade,
  -- Cómo se deshace: las cantidades que tenía cada lote ANTES de tocarlo y los
  -- eventos de historial que la orden creó. Se guarda el estado previo, no el
  -- movimiento, para que deshacer sea restaurar y no operar al revés (que con
  -- descuentos repartidos entre varios lotes no daría el mismo reparto).
  add column undo jsonb,
  -- Un segundo «deshaz» sobre lo mismo no vuelve a aplicarlo.
  add column undone_at timestamptz;

-- Lo único que se pregunta: la última orden deshacible de un altavoz. Parcial
-- porque las filas sin `undo` (consultas, o la propia orden de deshacer) no se
-- buscan nunca.
create index alexa_requests_undo_idx
  on public.alexa_requests (link_id, created_at desc)
  where undo is not null;

-- Sin políticas nuevas a propósito: la tabla tiene RLS activada y NINGUNA
-- política, así que solo la ve el service-role del webhook. Es lo que ya pasaba
-- con `response`, y estas columnas no son más públicas que aquella.
