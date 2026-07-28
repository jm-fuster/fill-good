import { z } from "zod";

import {
  canonicalizeChains,
  CHAIN_NAME_MAX,
  CHAINS_MAX,
  isReservedChainName,
  matchBuiltInChain,
} from "@/features/prices/chains";

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

/**
 * Supermercados habituales del hogar (L15 f4/f5): claves conocidas y nombres de
 * tiendas propias. Se guarda canonizado (`canonicalizeChains`) y no en el orden
 * de los clics, para no insinuar una prioridad que la app no usa. Lista vacía es
 * válida y significa «vuelve a deducirlas de los tickets».
 */
export const storeChainsSchema = z.object({
  chains: z
    .array(
      z
        .string()
        .trim()
        .max(CHAIN_NAME_MAX, `Los nombres no pueden pasar de ${CHAIN_NAME_MAX} caracteres.`),
    )
    .max(CHAINS_MAX, `No puedes tener más de ${CHAINS_MAX} tiendas.`)
    .transform(canonicalizeChains),
});

/**
 * Nombre de una tienda propia recién escrita. Aquí sí se rechaza con mensaje (en
 * vez de canonizar en silencio): lo acaba de teclear alguien y merece saber por
 * qué no se ha guardado.
 */
export const customChainSchema = z
  .string()
  .trim()
  .min(1, "Escribe el nombre de la tienda.")
  .max(CHAIN_NAME_MAX, `Máximo ${CHAIN_NAME_MAX} caracteres.`)
  // Un nombre solo de signos no identifica nada y además rompería la clave.
  .refine((name) => /\p{L}|\p{N}/u.test(name), "Ese nombre no vale.")
  .refine(
    (name) => !isReservedChainName(name),
    "«Otro» es el comodín para las tiendas que no reconocemos; usa el nombre real.",
  )
  .refine(
    (name) => matchBuiltInChain(name) === null,
    "Esa cadena ya está en la lista de arriba: márcala ahí.",
  );

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type JoinHouseholdInput = z.infer<typeof joinHouseholdSchema>;
