type InventoryLine = {
  name: string;
  quantity: number;
  unit: string;
  expiresInDays: number | null;
  useSoon: boolean;
};

export function buildMenuPrompt(inventory: InventoryLine[]): string {
  const inventoryText =
    inventory.length > 0
      ? inventory
          .map((i) => {
            const flags: string[] = [];
            if (i.expiresInDays !== null) {
              flags.push(`caduca en ${i.expiresInDays} días`);
            }
            // "Consumir pronto" tiene la misma prioridad que una caducidad
            // inminente aunque no haya fecha.
            if (i.useSoon) flags.push("consumir pronto");
            const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
            return `- ${i.name}: ${i.quantity} ${i.unit}${suffix}`;
          })
          .join("\n")
      : "(el inventario está vacío)";

  return `Eres un cocinero que planifica un menú semanal saludable y equilibrado para un hogar en España.

Genera un menú para 7 días (de lunes a domingo), con COMIDA y CENA cada día.

Objetivos, por orden de prioridad:
1. Aprovechar lo que ya hay en el inventario, especialmente lo que caduca pronto o está marcado como "consumir pronto".
2. Dieta equilibrada y variada a lo largo de la semana (verduras, legumbres, pescado, carne, hidratos), sin repetir el mismo plato.
3. Cocina española sencilla y realista para el día a día. Cenas más ligeras que las comidas.

Inventario actual del hogar:
${inventoryText}

Cada comida y cena es una lista de platos. La comida (lunch) puede llevar 1 o 2 platos (por ejemplo un primero ligero y un segundo) cuando tenga sentido; la cena (dinner) normalmente 1 plato. Nunca más de 2 platos por hueco.

Para cada plato indica un nombre claro en español, una descripción breve y la lista de ingredientes con cantidad y unidad aproximadas (para 2 raciones). Usa ingredientes comunes; puedes proponer ingredientes que no estén en el inventario (se añadirán a la lista de la compra).

Devuelve exactamente 7 días (day_index 0 a 6) y en cada día las dos comidas (slot "lunch" y "dinner"), cada una con su lista de platos.`;
}
