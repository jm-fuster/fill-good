-- ============================================================================
-- Funciones internas: cerradas de verdad para anon y authenticated
-- ============================================================================
-- La convención del repo era «toda función SECURITY DEFINER lleva
-- `revoke execute … from public, anon`», y en Supabase eso NO basta. El
-- proyecto trae, para el rol que aplica las migraciones:
--
--   alter default privileges for role postgres in schema public
--     grant all on functions to anon, authenticated, service_role;
--
-- (texto literal del binario de la CLI de Supabase). O sea que cada función
-- nueva de `public` nace con un EXECUTE EXPLÍCITO para `authenticated` —no
-- heredado de PUBLIC—, y revocar de `public, anon` lo deja intacto.
--
-- La consecuencia que importa: `20260724130000_security_hardening.sql` creyó
-- cerrar la escritura cross-tenant de las siembras revocándolas de
-- `public, anon` («no se conceden a authenticated»), y siguieron abiertas.
-- `seed_default_products(hid)` y `seed_default_categories(hid)` son definer y
-- NO comprueban pertenencia: cualquier usuario con sesión que conozca el UUID
-- de un hogar (un ex-miembro lo tiene en su cookie `active_household`) podía
-- volver a sembrarle por PostgREST las categorías y los 75 productos por
-- defecto, incluidos los que ese hogar había borrado o fusionado. Comprobado en
-- Postgres 17 (PGlite) con las 65 migraciones y los privilegios de Supabase.
--
-- Ninguna de estas la llama la app (auditado con un barrido de `rpc(` en src/
-- y scripts/):
--   · seed_default_*     → solo desde create_household (definer: corre como
--                          propietario) y desde backfills de migración.
--   · cleanup_retention  → solo desde pg_cron, que corre como postgres. Hasta
--                          hoy la podía lanzar cualquiera con la clave pública.
--   · delete_account     → la llama `authenticated` (se queda); anon no pinta
--                          nada ahí (la función ya lanza not_authenticated).
--
-- `is_household_member`/`is_household_owner` se quedan como están A PROPÓSITO:
-- se evalúan dentro de las políticas RLS con el rol del usuario, y quitarles el
-- EXECUTE rompería todas las lecturas.
revoke execute on function public.seed_default_products(uuid) from authenticated;
revoke execute on function public.seed_default_categories(uuid) from authenticated;
revoke execute on function public.cleanup_retention() from anon, authenticated;
revoke execute on function public.delete_account() from anon;

-- Y para que no vuelva a pasar: se retira el EXECUTE explícito que Supabase
-- concede por defecto a anon y authenticated en las funciones NUEVAS de
-- `public`. Lo que queda es el EXECUTE a PUBLIC que Postgres da a toda función,
-- y ese sí lo cierra la convención de siempre (`revoke … from public, anon`),
-- así que a partir de aquí la convención hace lo que dice: una función interna
-- queda cerrada para todos, y una para el cliente lleva su `grant execute … to
-- authenticated` explícito. No toca las funciones que ya existen.
--
-- No se revoca el de PUBLIC aquí: por esquema no se puede (un REVOKE por
-- esquema solo deshace un GRANT por esquema), y hacerlo global alcanzaría
-- también a las funciones de cualquier extensión que se instale después
-- (`similarity()` de pg_trgm, por ejemplo, que se llama con el rol del
-- usuario). Comprobado en PGlite: con esto, una función nueva con
-- `revoke … from public, anon` queda negada para authenticated; antes, no.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
