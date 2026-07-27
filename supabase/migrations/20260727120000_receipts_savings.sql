-- ============================================================================
-- Migración — Hucha del hogar: ahorro por ticket materializado (G1, fase 1)
-- ============================================================================
-- La "hucha" del hogar suma DOS conceptos, ambos euros reales:
--   1. receipts.discount_total (ya existía, M1): descuentos impresos en el ticket.
--   2. receipts.savings_amount (esta columna): saldo NETO de comprar por encima o
--      por debajo de tu propio precio reciente para cada producto.
--
-- El saldo es NETO y con signo: positivo = has pagado menos que tu media reciente,
-- negativo = has pagado más. Un número que solo sube no sería creíble, y la
-- credibilidad es el único activo de esta pantalla.
--
-- Por qué "media reciente" y no "media histórica": con inflación, la media
-- histórica siempre queda por debajo del precio actual, así que el saldo tendería
-- a negativo de forma sistemática y la hucha mediría el IPC en vez de las
-- decisiones del hogar. La ventana móvil (ver SAVINGS_WINDOW_DAYS en
-- src/features/prices/savings.ts) es neutral a inflación.
--
-- Se materializa al confirmar el ticket, NUNCA en render: es la misma lección de
-- 20260723150000_product_price_insights.sql (escanear todo el histórico de
-- receipt_items en cada pintado no escala). Con la columna aquí, la hucha del mes
-- es una agregación sobre receipts, que ya se leen en getMonthlySpending.
--
-- Sin cambios de RLS: receipts ya está restringida por hogar.
--
-- SIN BACKFILL a propósito: recalcular el ahorro de tickets ya confirmados
-- exigiría reconstruir la ventana de precios vigente en cada fecha pasada, y el
-- resultado sería una cifra que el usuario no puede contrastar con nada. La hucha
-- empieza a contar desde el primer ticket confirmado tras esta migración; los
-- meses anteriores siguen mostrando sus descuentos reales.
-- ============================================================================

alter table public.receipts
  add column savings_amount numeric(10, 2) not null default 0;

comment on column public.receipts.savings_amount is
  'Saldo NETO de ahorro del ticket en € (G1): suma por línea de (precio medio reciente del producto − precio pagado) × cantidad. Positivo = has comprado más barato de lo habitual; negativo = más caro. Materializado al confirmar. No incluye discount_total (los descuentos del ticket se suman aparte).';
