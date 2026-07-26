import { z } from "zod";

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

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type JoinHouseholdInput = z.infer<typeof joinHouseholdSchema>;
