-- ============================================================================
-- Migración — Por qué no se hizo un plato (`skipped_reason`)
-- ============================================================================
-- `skipped_at` (R2) dice que un plato planificado no se cocinó, pero no dice si
-- falló EL DÍA o falló EL PLATO, y son cosas opuestas para el generador:
--
--   · «comimos fuera» / «pedimos algo» / «faltaban ingredientes» → el plato no
--     tuvo su oportunidad, así que volver a proponerlo no es repetir, es
--     recuperarlo (que es justo lo que la app ya hace con todo descarte).
--   · «no nos apetecía» → el plato SÍ tuvo su oportunidad y el hogar lo rechazó.
--     Recuperarlo la semana siguiente es ofrecer otra vez lo que acaban de
--     rechazar.
--
-- Hasta ahora los cuatro casos eran el mismo dato, y por eso `getMenuContext`
-- tenía que elegir un comportamiento para todos: los descartados se caen de
-- «platos recientes» y el modelo los puede repetir. Con el motivo, la única
-- rama que cambia es la del rechazo (ver `skipRejectedTheDish`); las otras tres
-- se quedan como estaban.
--
-- Se guarda un enum cerrado y NO texto libre: son cuatro chips que se contestan
-- con un toque desde la tira de hoy, el repaso y el panel del plato. Contestar
-- es OPCIONAL —null significa «no lo dijo», y entonces vale el comportamiento
-- de siempre—, porque el gesto que importa es resolver el plato, no justificarlo.
--
-- El motivo NO puede existir sin la marca, y eso lo dice un check en vez de la
-- costumbre: hay cuatro sitios que limpian `skipped_at` (las dos actions del
-- menú, la de cocinado y el «lo cocinamos» de Alexa) y el patrón que más veces
-- ha roto los datos de este repo es precisamente una regla razonada en un sitio
-- y ausente en su hermano. Con el check, olvidarse de limpiar el motivo es un
-- error inmediato y ruidoso; sin él, es un motivo huérfano que sobrevive a un
-- «sí, lo cocinamos» y sigue contando como rechazo en el prompt de la semana
-- siguiente.
-- ============================================================================

alter table public.menu_entries
  add column if not exists skipped_reason text
    check (
      skipped_reason in (
        'ate_out',
        'takeaway',
        'not_appealing',
        'missing_ingredients'
      )
    );

alter table public.menu_entries
  add constraint menu_entries_motivo_exige_descarte check (
    skipped_reason is null or skipped_at is not null
  );
