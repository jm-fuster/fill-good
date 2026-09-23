# Plan — Higiene de datos en Supabase (free tier)

> **⚠️ EJECUTADO Y CERRADO — no vuelvas a aplicarlo.** Todo este plan está en `main` desde
> el 2026-07-23 (`ddbbedc`, PR #6), con la migración `20260723160000_data_retention.sql`
> aplicada en remoto. Queda aquí como registro del diagnóstico y de las retenciones
> acordadas, NO como trabajo por hacer.
>
> Ojo: `cleanup_retention` se ha **recreado** después (`20260728130000_ai_rate_limit.sql`
> añadió la purga de `ai_usage`), así que el cuerpo de la función que se lee aquí ya no es el
> que está en la base. La versión vigente es la de la migración más reciente que la toque.

> **Objetivo:** que la base de datos no acumule datos que ya no aportan nada, con
> retenciones claras y automáticas. Supabase free tier = 500 MB de Postgres; el
> proyecto NO usa Storage (los tickets se envían a la IA sin guardarse), así que
> todo el foco es la base de datos.
>
> **Para el agente implementador — restricciones del repo (ver AGENTS.md y memoria):**
> - `src/lib/supabase/types.ts` se mantiene **a mano**; NO regenerar con la CLI.
> - Migraciones en `supabase/migrations/` vía `npx supabase db push` — **pide
>   autorización al usuario antes de ejecutar el push**.
> - Verificación: `npx tsc --noEmit` + `npm run lint` (jsx-a11y strict, 0 warnings).
>   No hay verificación por navegador (dev server/Clerk bloqueados); lo visual lo
>   valida el usuario.
> - `receipt_items` tiene 2 FKs a `products`: en embeds de PostgREST nombrar
>   siempre `products!receipt_items_product_id_fkey` (si aplica).

---

## Diagnóstico — dónde se acumulan datos hoy

| Tabla / dato | Crecimiento | ¿Se lee después? | Veredicto |
|---|---|---|---|
| `inventory_events` | Cada reposición/consumo/tirada (con folding de 15 min en el stepper) | Historial: solo últimos **30 días** (`HISTORY_WINDOW_DAYS`, `src/features/inventory/queries.ts:257`). Desperdicio (`discarded`): panel de gasto **por mes navegable** (`src/features/prices/spending.ts:103`) | **Purgar por edad, por tipo** (el usuario ya lo pidió) |
| `receipts.raw_extraction` | JSON completo de la IA por ticket (~5–15 KB/fila, lo más pesado por fila de toda la BD) | Solo en `confirmReceiptAction` para sumar descuentos (`src/features/receipts/actions.ts:251`). Tras confirmar, **nunca más** | **Vaciar al confirmar + backfill** |
| `receipts` en `needs_review` abandonados | Escaneos que el usuario nunca confirma quedan para siempre (con sus `receipt_items` y el `raw_extraction`) | No. Sus `receipt_items` tienen `purchased_at`/`store_chain` NULL → ya están excluidos de TODAS las consultas de precios | **Purgar a los 30 días** (el FK cascade borra sus items) |
| `push_subscriptions` muertas | `sendPush` devuelve los endpoints 404/410 en `gone` "para que el llamante los borre" (`src/lib/push/send.ts:57`), pero `notifyPriceRises` **ignora ese valor** (`src/features/push/notify.ts:44`) | Cada envío reintenta contra endpoints muertos | **Borrar los `gone` tras cada envío** |
| `weekly_menus` + `menu_entries` | 1 menú/semana + hasta 21 entradas | Solo la semana visible y la anterior (copiar). Nadie lee semanas viejas | **Purgar > 26 semanas** (cascade borra entries) |
| `receipts.image_path` | Columna muerta: no hay ninguna subida a Storage en el código; siempre NULL | No | **Opcional: drop de la columna** |
| `receipt_items` de tickets confirmados | ~40 filas/ticket; SON el historial de precios | Gráficas, cadena inferida, savings tips, coste de recetas, panel de gasto — **sin ventana temporal** (`src/features/prices/queries.ts`) | **NO purgar a corto plazo** (ver "Qué no tocar"); retención opcional a 24 meses documentada abajo |

**Cosas que ya se limpian solas (no tocar):** `shopping_list_items` marcados se
borran en el checkout (`src/features/shopping-list/actions.ts:579`); las recetas
efímeras de IA tienen `cleanupOrphanEphemeralRecipes` (`src/features/menus/actions.ts:128`);
todos los FKs cuelgan de `households` con `on delete cascade`, así que borrar un
hogar no deja huérfanos.

**Orden de magnitud (hogar activo):** ~30 eventos/día ≈ 11 k filas/año ≈ 2–3 MB/año;
~300 tickets/año con `raw_extraction` ≈ 1,5–4,5 MB/año. Nada de esto revienta los
500 MB a corto plazo — el plan es higiene y de paso mantiene rápidas las consultas
sin ventana temporal (precios) y el prompt-catalog. Las retenciones pueden ser
generosas: **el valor del dato manda sobre el espacio**.

---

## Bloque A — Arreglos en origen (código, sin cron)

### A1. Vaciar `raw_extraction` al confirmar el ticket

En `confirmReceiptAction` (`src/features/receipts/actions.ts`), paso 2.7 (cierre
del ticket, línea ~659): añadir `raw_extraction: null` al `update`. En ese punto
los descuentos ya están materializados en `receipts.discount_total`, y ningún otro
código vuelve a leer el JSON (verificado por grep: solo se usa en el insert del
escaneo y en esta confirmación).

- El reintento idempotente no se rompe: si la confirmación falla a medias, el
  ticket sigue `needs_review` con su `raw_extraction` intacto (el cierre es el
  último paso).
- **Backfill** en la migración del Bloque B:
  `update public.receipts set raw_extraction = null where status = 'confirmed';`

### A2. Borrar suscripciones push muertas tras cada envío

En `notifyPriceRises` (`src/features/push/notify.ts`): recoger el retorno de
`sendPush` y borrar los endpoints `gone`:

```ts
const { gone } = await sendPush(targets, { ... });
if (gone.length) {
  await supabase.from("push_subscriptions").delete().in("endpoint", gone);
}
```

Ojo con RLS: `notifyPriceRises` corre con el cliente del usuario que confirma el
ticket, y la política de DELETE de `push_subscriptions` es "solo las propias"
(`push_delete_own`). Dos opciones; elegir la primera salvo que el usuario prefiera
lo contrario:

1. **Ampliar la política de DELETE a miembros del hogar** en la migración del
   Bloque B (los miembros ya pueden LEER las suscripciones del hogar; poder borrar
   una suscripción demostradamente muerta —el push service devolvió 404/410— es
   coherente con ese diseño). Sustituir `push_delete_own` por una política que
   permita `user_id = clerk_user_id() OR is_household_member(household_id)`.
2. Dejar la política como está y aceptar que solo se autolimpian las del propio
   usuario (menos efectivo: el que confirma casi nunca es el del endpoint muerto).

Este patrón debe repetirse en cualquier llamador futuro de `sendPush` (hoy solo
hay uno); vale la pena dejarlo comentado en `send.ts`.

### A3 (opcional, gratis). Drop de `receipts.image_path`

Columna siempre NULL (no existe ninguna subida a Storage). En la migración:
`alter table public.receipts drop column image_path;` y quitar las 3 referencias
de `src/lib/supabase/types.ts` (a mano, líneas ~468/484/500). Si se prefiere
conservarla "por si acaso" para una futura fase de guardado de imágenes, saltarse
este punto y decirlo en el resumen final.

---

## Bloque B — Retención automática con `pg_cron` (una migración)

`pg_cron` está disponible en el free tier de Supabase y corre DENTRO de Postgres:
cero infraestructura externa, no depende de que nadie visite la app, y no consume
las 2 cron jobs de Vercel Hobby. (Nota: si el proyecto free se pausa por
inactividad el cron no corre, pero tampoco entran datos nuevos — se pone al día al
reanudar.)

Una sola migración `supabase/migrations/<ts>_data_retention.sql` con:

### B1. Extensión + función de limpieza

```sql
create extension if not exists pg_cron with schema pg_catalog;

-- Retenciones (justificación en PLAN-LIMPIEZA-DATOS.md):
--  · inventory_events consumed/restocked: la UI solo muestra 30 días → 90 días de margen.
--  · inventory_events discarded: valoran el desperdicio del panel de gasto,
--    navegable por meses → 24 meses.
--  · receipts needs_review: escaneos abandonados; sus items no puntúan en precios → 30 días.
--  · weekly_menus: solo se lee la semana visible y la anterior → 26 semanas.
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

  -- El FK de receipt_items → receipts es on delete cascade: borra las líneas.
  delete from public.receipts
  where status in ('needs_review', 'processing', 'failed')
    and created_at < now() - interval '30 days';

  -- El FK de menu_entries → weekly_menus es on delete cascade.
  delete from public.weekly_menus
  where week_start < (current_date - interval '26 weeks');
$$;
```

- `security definer` + owner postgres → ignora RLS (es mantenimiento global).
- NO conceder `execute` a `authenticated` (solo la ejecuta el cron).
- Los índices existentes ya cubren los deletes (`inventory_events (household_id,
  created_at)` no es ideal para un delete global por `created_at`; con los
  volúmenes actuales da igual, no añadir índices nuevos por esto).

### B2. Programación

```sql
select cron.schedule(
  'fill-good-retention',
  '30 4 * * *',            -- diario, 04:30 UTC
  $$select public.cleanup_retention()$$
);
```

Idempotencia de la migración: `cron.schedule` con el mismo nombre actualiza el job
si ya existe (no duplica).

### B3. Backfill y política push (van en la misma migración)

- `update public.receipts set raw_extraction = null where status = 'confirmed';`
- Nueva política de DELETE de `push_subscriptions` (opción 1 de A2).
- (Si se hace A3) `alter table public.receipts drop column image_path;`

---

## Qué NO limpiar (y por qué)

- **`receipt_items` de tickets confirmados** — son la fuente de: gráficas de
  precios, mediana para avisos de subida, cadena inferida, savings tips, coste por
  receta y desglose del panel de gasto. Ninguna de esas consultas tiene ventana
  temporal, y el volumen es pequeño (~10 k filas/año ≈ 2–5 MB). Borrarlos amputa
  el producto para ahorrar céntimos de espacio. **Si algún día hiciera falta**, la
  vía correcta es: retención a 24 meses + tabla-resumen mensual
  (`price_history_monthly`) rellenada antes del delete — NO implementarlo ahora.
- **`product_aliases`** — acotados por `unique (household_id, alias_normalized)`;
  son la memoria de matching (2ª compra matchea sola). Su valor crece con la edad.
- **`push_subscriptions` por antigüedad** — `updated_at` solo se toca al guardar
  preferencias, NO en cada visita: purgar por fecha borraría dispositivos sanos.
  La limpieza correcta es la de endpoints muertos (A2).
- **`products`** — catálogo vivo del hogar (habitualidad, señales materializadas).

---

## Orden de trabajo y verificación

1. Bloque A (código): A1, A2 (+ A3 si procede). `npx tsc --noEmit` + `npm run lint`.
2. Bloque B (migración única con B1+B2+B3). Revisarla y **pedir autorización al
   usuario para `npx supabase db push`**.
3. Si se tocó `push_subscriptions` (política) o se dropeó `image_path`: actualizar
   `src/lib/supabase/types.ts` **a mano**.
4. Comprobación post-push (SQL editor o `npx supabase db ...`):
   - `select * from cron.job;` → aparece `fill-good-retention`.
   - `select public.cleanup_retention();` corre sin error (en frío no debería
     borrar casi nada).
   - Confirmar un ticket de prueba → `raw_extraction` queda NULL.
5. Commit separado por bloque (`fix(push)`, `perf(db)`/`chore(db)`), en español,
   como el histórico del repo.
