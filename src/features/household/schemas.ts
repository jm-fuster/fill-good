import { z } from "zod";

import { CHAIN_OPTIONS, orderChains } from "@/features/prices/chains";

const householdName = z
  .string()
  .trim()
  .min(1, "Ponle un nombre a tu hogar.")
  .max(80, "El nombre es demasiado largo.");

export const createHouseholdSchema = z.object({
  name: householdName,
  displayName: z.string().trim().max(80).optional(),
});

export const renameHouseholdSchema = z.object({ name: householdName });

export const joinHouseholdSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "El código no parece válido.")
    .max(12, "El código no parece válido."),
  displayName: z.string().trim().max(80).optional(),
});

const KNOWN_CHAINS = new Set(CHAIN_OPTIONS.map((c) => c.value));

/**
 * Supermercados habituales del hogar (L15 f4). Solo claves del vocabulario
 * conocido y sin repetidos: el valor viaja al prompt de tickets y a los
 * selectores, así que no admitimos texto libre. Se guarda en el orden canónico
 * de `chains.ts` (no en el de los clics) para no insinuar una prioridad que la
 * app no usa. Lista vacía es válida y significa «vuelve a deducirlas».
 */
export const storeChainsSchema = z.object({
  chains: z
    .array(z.string())
    .max(20, "Demasiadas tiendas.")
    .transform((list) =>
      orderChains([...new Set(list)].filter((c) => KNOWN_CHAINS.has(c))),
    ),
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type JoinHouseholdInput = z.infer<typeof joinHouseholdSchema>;
