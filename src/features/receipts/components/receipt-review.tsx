"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Link2, PackageCheck, ScanLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { DeleteReceiptButton } from "./delete-receipt-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { chainOptions } from "@/features/prices/chains";
import {
  ProductCombobox,
  type ComboboxProduct,
} from "@/components/product-combobox";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/lib/units";
import { normalizeName } from "@/lib/normalize";
import {
  MIN_FUZZY_LENGTH,
  trigramSimilarity,
} from "@/lib/similarity";
import type { UnitType } from "@/lib/supabase/types";
import type { ReceiptSavingsSummary } from "@/features/prices/savings";
import type { TripComparison } from "@/features/shopping-list/trip-comparison";
import type {
  ReceiptHeader,
  ReceiptItem,
  ReceiptSuggestion,
} from "../queries";
import { confirmReceiptAction, type ConfirmItemDecision } from "../actions";
import { SavingsCelebration } from "./savings-celebration";

/**
 * Umbral de trigramas para el AVISO antiduplicados (E2). Más alto que el fuzzy
 * de faltantes (D3, 0,4): aquí preferimos NO avisar a avisar mal (el aviso
 * ofrece asociar con un toque, pero un falso positivo molesta).
 */
const WARN_TRIGRAM_THRESHOLD = 0.5;

function tokenize(norm: string): string[] {
  return norm.split(" ").filter(Boolean);
}

/**
 * Busca un producto del catálogo que probablemente sea el MISMO que el nombre
 * propuesto para una línea "nueva", para prevenir duplicados que fragmentan el
 * historial de precios ("Leche" vs "Leche Entera Hacendado"). Señales (sin IA):
 *  - contención de tokens en cualquier dirección (uno es subconjunto del otro):
 *    "leche" ⊆ "leche entera hacendado" ✓, "leche" vs "lechuga" ✗ (tokens ≠).
 *  - o similitud de trigramas ≥ {@link WARN_TRIGRAM_THRESHOLD} (variantes/erratas).
 * Devuelve el mejor candidato o null. Conservador: "Leche" vs "Lechuga" no casa.
 */
function findDuplicateCandidate(
  description: string,
  products: ComboboxProduct[],
): ComboboxProduct | null {
  const norm = normalizeName(description);
  if (norm.length < MIN_FUZZY_LENGTH) return null;
  const lineTokens = tokenize(norm);
  const lineSet = new Set(lineTokens);

  let best: { product: ComboboxProduct; score: number } | null = null;
  for (const p of products) {
    const pnorm = p.normalizedName;
    if (!pnorm || pnorm === norm || pnorm.length < MIN_FUZZY_LENGTH) continue;
    const pTokens = tokenize(pnorm);
    const pSet = new Set(pTokens);
    const containment =
      (pTokens.length > 0 && pTokens.every((t) => lineSet.has(t))) ||
      (lineTokens.length > 0 && lineTokens.every((t) => pSet.has(t)));
    const sim = trigramSimilarity(norm, pnorm);
    if (!containment && sim < WARN_TRIGRAM_THRESHOLD) continue;
    const score = (containment ? 100 : 0) + pTokens.length + sim;
    if (!best || score > best.score) best = { product: p, score };
  }
  return best?.product ?? null;
}

type Row = {
  itemId: string;
  description: string;
  quantity: string;
  unit: UnitType;
  productId: string | null;
  include: boolean;
  totalPrice: number | null;
  rawText: string | null;
  /** Estado del match al escanear: fija el orden/agrupación (no cambia en vivo). */
  initialStatus: string;
  /**
   * Unidad EXPLÍCITA con la que el usuario quiere que la línea entre al
   * inventario. `null` = automática (ver `stockUnitOf`).
   */
  stockUnitOverride: UnitType | null;
  /**
   * Decisión EXPLÍCITA del usuario sobre si la línea suma existencias. `null` =
   * automático: se deduce del producto asociado (ver `isPriceOnly`), para que
   * cambiar de producto en el combobox recalcule el aviso solo.
   */
  priceOnlyOverride: boolean | null;
};

/**
 * Chip de dos estados para elegir cómo entra una línea al inventario (kg o ud).
 * `aria-pressed` en vez de radiogroup: son dos alternativas sin etiqueta de
 * grupo visible, y el patrón de botón conmutado ya se usa en el filtro de
 * tiendas del modo compra.
 */
function StockUnitChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

/** Una línea "necesita decisión" si la IA no la asoció a un producto existente. */
function needsDecision(status: string): boolean {
  return status !== "auto" && status !== "manual";
}

export function ReceiptReview({
  receipt,
  items,
  products,
  packByProduct = {},
  suggestions = [],
  alreadyStockedProductIds = [],
  unitByProduct = {},
  householdChains = [],
}: {
  receipt: ReceiptHeader;
  items: ReceiptItem[];
  products: ComboboxProduct[];
  /** Unidades por pack por producto (F4); solo los que tienen pack. */
  packByProduct?: Record<string, number>;
  /** Candidatos fuzzy del servidor por línea (E6): catálogo + aliases. */
  suggestions?: ReceiptSuggestion[];
  /**
   * Productos que ya entraron al inventario al «Finalizar compra» en la lista.
   * Sus líneas se revisan igual, pero por defecto no vuelven a sumar stock.
   */
  alreadyStockedProductIds?: string[];
  /** Unidad por defecto de cada producto del catálogo, para el stock al peso. */
  unitByProduct?: Record<string, UnitType>;
  /** Tiendas del hogar (L15): opciones para corregir la cadena del ticket. */
  householdChains?: string[];
}) {
  const router = useRouter();
  const [storeName, setStoreName] = useState(receipt.storeName ?? "");
  // Cadena del ticket (L15 f5). Es corregible porque de ella dependen el
  // historial de precios por tienda y los avisos de ahorro: un ticket de Gadis
  // archivado como "otro" no cuenta para nada.
  const [storeChain, setStoreChain] = useState(receipt.storeChain ?? "");
  const [purchaseDate, setPurchaseDate] = useState(receipt.purchasedAt ?? "");
  const [total, setTotal] = useState(
    receipt.total === null ? "" : String(receipt.total),
  );
  const [pending, setPending] = useState(false);
  // Celebración de la hucha (G1): retiene la navegación al destino hasta que el
  // usuario cierra el modal. El ticket ya está confirmado en cuanto se abre, así
  // que ninguna vía de cierre puede perder trabajo.
  const [celebration, setCelebration] = useState<{
    summary: ReceiptSavingsSummary;
    trip?: TripComparison;
    href: string;
  } | null>(null);
  const [rows, setRows] = useState<Row[]>(() =>
    // Las líneas que necesitan decisión (new_product / sin match) van primero,
    // para que no queden enterradas; dentro de cada grupo se respeta el orden
    // del ticket (sort estable).
    items
      .map<Row>((i) => ({
        itemId: i.id,
        description: i.description,
        quantity: String(i.quantity),
        unit: i.unit,
        productId: i.productId,
        include: true,
        totalPrice: i.totalPrice,
        rawText: i.rawText,
        initialStatus: i.matchStatus,
        priceOnlyOverride: null,
        stockUnitOverride: null,
      }))
      .sort(
        (a, b) =>
          Number(needsDecision(b.initialStatus)) -
          Number(needsDecision(a.initialStatus)),
      ),
  );

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.itemId === id ? { ...r, ...patch } : r)),
    );
  }

  const alreadyStocked = useMemo(
    () => new Set(alreadyStockedProductIds),
    [alreadyStockedProductIds],
  );

  /**
   * ¿Esta línea debe guardar solo el precio, sin sumar existencias? Por defecto
   * sí cuando su producto ya entró al inventario al finalizar la compra desde la
   * lista: `checkoutAction` y `confirmReceiptAction` son dos vías independientes
   * de entrada al stock y encadenarlas lo metería dos veces. La decisión manual
   * del usuario siempre gana.
   */
  function isPriceOnly(row: Row): boolean {
    return (
      row.priceOnlyOverride ??
      (row.productId !== null && alreadyStocked.has(row.productId))
    );
  }

  /**
   * Unidad con la que la línea entra al INVENTARIO, que no siempre es la del
   * ticket: una calabaza se vende a 0,72 kg pero en casa es «1 calabaza», y el
   * stepper de ±1 solo existe para lo contable. El precio se sigue guardando en
   * €/kg pase lo que pase (ver `stockUnit` en receipts/schemas.ts).
   *
   * Por defecto se respeta el ticket, salvo que el producto asociado ya se lleve
   * por unidades: ahí seguir en kg solo produciría el aviso de «compraste kg
   * pero tu inventario está en ud» y una corrección a mano.
   */
  function stockUnitOf(row: Row): UnitType {
    if (row.stockUnitOverride) return row.stockUnitOverride;
    if (row.unit === "ud") return "ud";
    const productUnit = row.productId ? unitByProduct[row.productId] : undefined;
    return productUnit === "ud" ? "ud" : row.unit;
  }

  async function confirm() {
    setPending(true);
    const decisions: ConfirmItemDecision[] = rows.map((r) => {
      // Solo se manda el destino del stock cuando difiere del ticket; una pieza
      // suelta entra como 1 y, si son varias, se ajusta luego con el stepper del
      // inventario (que es justo lo que pasar a unidades desbloquea).
      const stockUnit = stockUnitOf(r);
      const redirected = stockUnit !== r.unit;
      return {
        itemId: r.itemId,
        description: r.description.trim() || "Producto",
        quantity: Number(r.quantity.replace(",", ".")) || 1,
        unit: r.unit,
        productId: r.productId,
        skip: !r.include,
        priceOnly: isPriceOnly(r),
        stockQuantity: redirected ? 1 : null,
        stockUnit: redirected ? stockUnit : null,
      };
    });
    try {
      const result = await confirmReceiptAction({
        receiptId: receipt.id,
        storeName: storeName.trim() || null,
        storeChain: storeChain || null,
        purchaseDate: purchaseDate || null,
        total: total ? Number(total.replace(",", ".")) : null,
        items: decisions,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const stocked = result.added ?? 0;
      const reused = result.alreadyStocked ?? 0;
      if (stocked > 0) {
        toast.success(
          `${stocked} producto${stocked === 1 ? "" : "s"} añadido${
            stocked === 1 ? "" : "s"
          } al inventario`,
        );
      }
      if (reused > 0) {
        toast(
          reused === 1
            ? "1 producto ya estaba en tu inventario desde la lista: solo hemos guardado su precio."
            : `${reused} productos ya estaban en tu inventario desde la lista: solo hemos guardado sus precios.`,
          { duration: 6000 },
        );
      }
      if (stocked === 0 && reused === 0) {
        toast.success("Ticket confirmado");
      }
      // Conflictos de unidad (E3): nunca en silencio. El Toaster es global y
      // sobrevive a la navegación, así que se ven en la página de destino.
      for (const w of result.warnings ?? []) {
        toast.warning(w, { duration: 8000 });
      }
      // Revisión opcional de caducidades de lo recién añadido.
      const ids = result.inventoryItemIds ?? [];
      const href =
        ids.length > 0
          ? `/inventario/revision?items=${ids.join(",")}`
          : "/inventario";

      // Celebración (G1 + G2): solo se interrumpe el flujo cuando hay una buena
      // noticia real que contar, sea dinero ahorrado o una compra ceñida a la
      // lista. Sin ninguna de las dos se navega igual que siempre: el saldo neto
      // vive en /precios y aquí no se regaña a nadie. En particular, tener
      // extras NO abre el modal por sí solo.
      const summary = result.savings;
      const trip = result.trip;
      const worthCelebrating =
        (summary?.total ?? 0) > 0 || (trip?.perfect ?? false);
      if (summary && worthCelebrating) {
        setCelebration({ summary, trip, href });
        return;
      }
      router.push(href);
    } catch {
      // Si la Server Action lanza (red caída), el botón debe recuperarse en vez
      // de quedarse en «Guardando…» para siempre.
      toast.error(
        "No se pudo confirmar el ticket. Comprueba tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setPending(false);
    }
  }

  const includedCount = rows.filter((r) => r.include).length;
  const priceOnlyCount = rows.filter((r) => r.include && isPriceOnly(r)).length;
  const stockingCount = includedCount - priceOnlyCount;
  const pendingRows = rows.filter((r) => needsDecision(r.initialStatus));
  const matchedRows = rows.filter((r) => !needsDecision(r.initialStatus));

  const suggestionByItem = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suggestions) m.set(s.itemId, s.productId);
    return m;
  }, [suggestions]);

  // Candidato a asociar para las líneas que quedarían como producto nuevo, con
  // precedencia: (E6) sugerencia del servidor por trigramas sobre catálogo +
  // aliases → (E2) guardarraíl cliente por contención de tokens. Nunca
  // auto-asocia: se ofrece con un toque para no fragmentar el historial de precios.
  const duplicateCandidates = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const map = new Map<string, ComboboxProduct>();
    for (const r of rows) {
      if (r.include && r.productId === null) {
        const suggestedId = suggestionByItem.get(r.itemId);
        const candidate =
          (suggestedId ? byId.get(suggestedId) : undefined) ??
          findDuplicateCandidate(r.description, products);
        if (candidate) map.set(r.itemId, candidate);
      }
    }
    return map;
  }, [rows, products, suggestionByItem]);

  function renderRow(row: Row) {
    const linked = row.productId !== null;
    const duplicate = duplicateCandidates.get(row.itemId) ?? null;
    // Solo se ofrece la decisión "sumar o no" en las líneas donde hay algo que
    // decidir: las de un producto que ya entró al inventario desde la lista.
    const fromTrip = row.productId !== null && alreadyStocked.has(row.productId);
    const priceOnly = isPriceOnly(row);
    const stockUnit = stockUnitOf(row);
    // Pack (F4): si la línea está en ud y su producto tiene pack, avisamos de la
    // conversión que se aplicará al inventario (el precio no se toca).
    const pack =
      row.unit === "ud" && row.productId
        ? packByProduct[row.productId]
        : undefined;
    const qtyValue = Number(row.quantity.replace(",", "."));
    const packTotal =
      pack && Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue * pack : null;
    return (
      <div
        key={row.itemId}
        className="flex flex-col gap-2 rounded-xl border p-3"
      >
        <div className="flex items-start gap-2">
          <Checkbox
            checked={row.include}
            onCheckedChange={(v) => update(row.itemId, { include: v === true })}
            aria-label="Incluir este producto"
            className="mt-1 size-5"
          />
          <div className="min-w-0 flex-1">
            <Input
              value={row.description}
              onChange={(e) =>
                update(row.itemId, { description: e.target.value })
              }
              aria-label="Nombre del producto"
              disabled={!row.include}
            />
            {row.rawText ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {row.rawText}
                {row.totalPrice !== null
                  ? ` · ${row.totalPrice.toFixed(2)} €`
                  : ""}
              </p>
            ) : null}
          </div>
          <Input
            value={row.quantity}
            onChange={(e) => update(row.itemId, { quantity: e.target.value })}
            type="number"
            inputMode="decimal"
            step="any"
            className="w-16"
            aria-label="Cantidad"
            disabled={!row.include}
          />
        </div>
        {row.include ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Producto del catálogo
              </span>
              {linked ? (
                <Badge
                  className={cn(
                    "border-transparent bg-success/15 text-success",
                  )}
                >
                  <Check aria-hidden className="size-3" />
                  {row.initialStatus === "auto"
                    ? "Asociado automáticamente"
                    : "Asociado"}
                </Badge>
              ) : (
                <Badge className="border-transparent bg-warning/15 text-warning">
                  Elegir producto
                </Badge>
              )}
            </div>
            <ProductCombobox
              products={products}
              value={row.productId}
              onChange={(id) => update(row.itemId, { productId: id })}
              allowCreateNew
              createNewLabel="Producto nuevo"
              ariaLabel="Producto asociado"
            />
            {duplicate ? (
              <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-2">
                <p className="flex-1 text-xs text-warning">
                  Ya tienes «{duplicate.name}», ¿es el mismo producto?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update(row.itemId, { productId: duplicate.id })
                  }
                >
                  <Link2 aria-hidden />
                  Asociar
                </Button>
              </div>
            ) : null}
            {/* Sin sentido cuando la línea no va a sumar existencias. */}
            {packTotal !== null && !priceOnly ? (
              <p className="text-xs text-muted-foreground">
                {formatQuantity(qtyValue, "ud")} × pack de {pack} → entran{" "}
                <span className="font-medium text-foreground">
                  {formatQuantity(packTotal, "ud")}
                </span>{" "}
                al inventario
              </p>
            ) : null}
            {/* Peso → piezas. Solo tiene sentido en líneas al peso o volumen que
                sí van a sumar stock: lo contable ya se cuenta de una en una. */}
            {!priceOnly && row.unit !== "ud" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  Al inventario:
                </span>
                <StockUnitChip
                  label={formatQuantity(qtyValue || 1, row.unit)}
                  active={stockUnit === row.unit}
                  onClick={() =>
                    update(row.itemId, { stockUnitOverride: row.unit })
                  }
                />
                <StockUnitChip
                  label="1 ud"
                  active={stockUnit === "ud"}
                  onClick={() =>
                    update(row.itemId, { stockUnitOverride: "ud" })
                  }
                />
              </div>
            ) : null}
            {fromTrip ? (
              priceOnly ? (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
                  <p className="flex-1 text-xs text-muted-foreground">
                    Ya entró al inventario al finalizar la compra. Solo
                    guardamos su precio.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update(row.itemId, { priceOnlyOverride: false })
                    }
                  >
                    Sumar igual
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-2">
                  <p className="flex-1 text-xs text-warning">
                    Se sumará al stock que ya entró al finalizar la compra.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update(row.itemId, { priceOnlyOverride: true })
                    }
                  >
                    No sumar
                  </Button>
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // La IA no detectó ninguna línea de producto: sin filas que revisar, mostramos
  // un empty state con salida clara en vez de un formulario vacío. El botón de
  // descartar el ticket llega en la Fase 2; aquí basta con volver a escanear.
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ScanLine}
        title="No se detectaron productos en el ticket"
        description="Prueba con una foto más nítida y mejor iluminada."
        action={
          <div className="flex flex-col items-center gap-2">
            <Button asChild>
              <Link href="/escanear">Volver a escanear</Link>
            </Button>
            <DeleteReceiptButton receiptId={receipt.id} redirectTo="/escanear" />
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del ticket</CardTitle>
        </CardHeader>
        {/* En escritorio los tres campos caben en una fila; en móvil se apilan. */}
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="rv-store">Tienda</Label>
            <Input
              id="rv-store"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="rv-chain">Cadena</Label>
            <Select value={storeChain} onValueChange={setStoreChain}>
              <SelectTrigger id="rv-chain" className="w-full">
                <SelectValue placeholder="Sin identificar" />
              </SelectTrigger>
              <SelectContent>
                {chainOptions(householdChains).map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
                <SelectItem value="otro">Otra tienda</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rv-date">Fecha</Label>
            <Input
              id="rv-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rv-total">Total (€)</Label>
            <Input
              id="rv-total"
              type="number"
              inputMode="decimal"
              step="any"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-medium">
          Productos ({includedCount} de {rows.length})
        </h2>

        {/* Por qué parte del ticket no suma stock: se explica una vez arriba y
            se recuerda en cada línea, porque es un comportamiento que sorprende
            si no se cuenta (el ticket «no hace nada» con esos productos). */}
        {priceOnlyCount > 0 ? (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
            <PackageCheck className="mt-px size-4 shrink-0" aria-hidden />
            <span>
              {priceOnlyCount === 1
                ? "1 producto ya entró"
                : `${priceOnlyCount} productos ya entraron`}{" "}
              en tu inventario al finalizar esta compra desde la lista. De{" "}
              {priceOnlyCount === 1 ? "ese" : "esos"} solo guardamos el precio,
              para no duplicar el stock.
            </span>
          </p>
        ) : null}

        {pendingRows.length > 0 ? (
          <div className="mb-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-warning">
              Necesitan decisión ({pendingRows.length})
            </p>
            {/* 2 columnas en escritorio; items-start evita estirar la tarjeta
                corta a la altura de la alta (las filas varían mucho). */}
            <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:items-start md:gap-3">
              {pendingRows.map(renderRow)}
            </div>
          </div>
        ) : null}

        {matchedRows.length > 0 ? (
          <div className="flex flex-col gap-2">
            {pendingRows.length > 0 ? (
              <p className="text-xs font-medium text-muted-foreground">
                Asociados ({matchedRows.length})
              </p>
            ) : null}
            <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:items-start md:gap-3">
              {matchedRows.map(renderRow)}
            </div>
          </div>
        ) : null}
      </div>

      {/* Salida clara: descartar el ticket sin confirmarlo (con confirmación en
          ResponsiveModal). Va en el flujo, no en la barra fija, para no competir
          con la acción primaria. */}
      <div className="flex justify-center">
        <DeleteReceiptButton
          receiptId={receipt.id}
          variant="ghost"
          redirectTo="/escanear"
          className="text-muted-foreground"
        />
      </div>

      <div className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-lg px-4 pb-safe md:sticky md:inset-x-auto md:bottom-0 md:mx-0 md:max-w-none md:border-t md:bg-background/95 md:px-0 md:pt-3 md:pb-3 md:backdrop-blur-sm">
        <Button
          size="lg"
          className="w-full shadow-lg"
          disabled={includedCount === 0}
          loading={pending}
          onClick={confirm}
        >
          <Check aria-hidden />
          {pending
            ? "Guardando…"
            : stockingCount > 0
              ? "Confirmar y añadir al inventario"
              : "Confirmar y guardar precios"}
        </Button>
      </div>

      {celebration ? (
        <SavingsCelebration
          summary={celebration.summary}
          trip={celebration.trip}
          open
          onContinue={() => {
            const { href } = celebration;
            setCelebration(null);
            router.push(href);
          }}
        />
      ) : null}
    </div>
  );
}
