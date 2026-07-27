-- Silenciar las sugerencias de un producto en la lista de la compra.
--
-- Las sugerencias pasan a incluir lo caducado y lo agotado además de lo que está
-- bajo mínimo, así que hace falta poder decir "esto no lo repongo". Sin ese
-- descarte, un bote caducado que no piensas volver a comprar te lo recuerda la
-- app cada vez que abres la lista, y las sugerencias dejan de leerse.
--
-- Se guarda en el producto y no en una tabla aparte porque la unidad de silencio
-- es el producto entero: da igual si hoy aparece por caducado y mañana por
-- agotado, el usuario ya dijo que no. Y va por HOGAR (products ya lo es), no por
-- usuario: la lista es compartida, y lo que uno descarta no debe reaparecerle al
-- otro como si nadie hubiera decidido nada.
--
-- Es un silencio temporal, no permanente: pasada la fecha vuelve a sugerirse, que
-- es lo correcto para un consumible que quizá dentro de un mes sí quieras.
alter table public.products
  add column if not exists suggestions_snoozed_until timestamptz;

comment on column public.products.suggestions_snoozed_until is
  'Hasta cuándo no sugerir este producto en /lista (null = no silenciado).';
