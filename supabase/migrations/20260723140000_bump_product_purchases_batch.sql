-- ============================================================================
-- Migración — Contador de habitualidad por LOTE (rendimiento de tickets, f1)
-- ============================================================================
-- Versión por lote de bump_product_purchase (singular): una única llamada por
-- ticket en vez de una por línea. La confirmación de un ticket de N líneas ya no
-- hace N RPCs secuenciales de contador, sino una sola con el array completo.
--
-- Contrato: ACEPTA DUPLICADOS y suma una unidad por aparición, exactamente igual
-- que hoy hace una llamada por línea (un producto comprado en 2 líneas → +2).
--
-- security invoker (por defecto): la RLS de products aplica con el contexto de
-- quien llama, que debe ser miembro del hogar dueño del producto.
-- NO sustituye a bump_product_purchase (singular): esa la usan otros flujos.
-- ============================================================================

create or replace function public.bump_product_purchases(pids uuid[])
returns void
language sql
as $$
  update public.products p
  set purchase_count = p.purchase_count + c.cnt,
      last_purchased_at = now()
  from (
    -- agregamos duplicados: un producto comprado en 2 líneas suma +2
    select id, count(*) as cnt
    from unnest(pids) as id
    group by id
  ) c
  where p.id = c.id;
$$;

grant execute on function public.bump_product_purchases(uuid[]) to authenticated;
