-- Repaso semanal de despensa.
--
-- El problema que resuelve: fuera del descuento al cocinar y del stepper, nada
-- registra el consumo del día a día (el yogur del desayuno no lo apunta nadie),
-- así que a las dos o tres semanas el inventario deja de parecerse a la casa. Y
-- un inventario que miente no es solo una pantalla equivocada: el push de
-- caducidades avisa de lo que ya no está, el menú cree que tienes lo que no
-- tienes y las sugerencias de la lista se callan lo que hace falta. La app pide
-- entonces confianza sobre datos que ella misma sabe viejos.
--
-- La respuesta es un ritual corto y recurrente en vez de exigir que la gente
-- apunte cada movimiento: una vez por semana se pregunta por un puñado de
-- productos —los que llevan más tiempo sin que nadie confirme su número— y se
-- contesta de un toque.

-- Cuándo contestó alguien por última vez por esta fila.
--
-- Ojo con la duplicidad aparente respecto a `updated_at`: el trigger
-- `inventory_touch_updated_at` refresca `updated_at` en CUALQUIER update, así que
-- escribir aquí también lo mueve y podría parecer que basta con esa columna. No
-- basta, por dos razones. La primera es que hacen falta las dos para saber la
-- frescura de un número (la más reciente de ambas), y son cosas distintas:
-- `updated_at` dice «la fila cambió» —también cuando la cambió un ticket o el
-- descuento al cocinar—, y esto dice «una persona miró la despensa y lo
-- confirmó». La segunda es más práctica: la respuesta «queda» no cambia ningún
-- valor de la fila, así que sin una columna propia no tendría nada que escribir y
-- su único efecto —no volver a preguntar— dependería de un trigger de Postgres.
alter table public.inventory_items
  add column if not exists reviewed_at timestamptz;

-- Índice para buscar candidatos: solo lo que tiene existencias, que es lo único
-- por lo que se pregunta (de lo que está a cero la app ya sabe la respuesta).
create index if not exists inventory_review_idx
  on public.inventory_items (household_id, reviewed_at)
  where quantity > 0;

-- Preferencias del repaso, en `households` (donde ya vive `monthly_budget`) y no
-- en una tabla nueva: son dos columnas de un ajuste del hogar, no un dominio.
--
-- `pantry_review_enabled` es el interruptor de «no volver a preguntar», y va por
-- HOGAR igual que el del repaso de platos: la despensa es de la casa, y si uno
-- apaga la pregunta el otro tampoco tiene que contestarla.
alter table public.households
  add column if not exists pantry_review_enabled boolean not null default true;

-- Cuándo se hizo el último repaso en esta casa. Es lo que convierte esto en
-- semanal, y por eso va en la base y no en una cookie: la cadencia es del hogar,
-- no del dispositivo. Sin esta columna un hogar con la despensa llena volvería a
-- ver la tarjeta el mismo día —contestar por ocho productos deja otros noventa
-- «sin repasar»—, que es exactamente cómo un recordatorio útil se convierte en
-- una molestia que se apaga.
alter table public.households
  add column if not exists pantry_reviewed_at timestamptz;
