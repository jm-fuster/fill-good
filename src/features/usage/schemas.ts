import { z } from "zod";

const count = z.number().int().min(0).max(100);

/*
  Lo que puede mandar el navegador a `/api/usage`. Se valida aunque el tipo ya
  lo diga: es un endpoint, y lo que llegue por él no lo ha escrito
  necesariamente la app. La lista coincide a propósito con `ClientUsageEvent`;
  los eventos que ocurren en el servidor (responder al repaso, activarlo o
  desactivarlo, las salidas de /bienvenida) se anotan desde su propia acción y
  no pasan por aquí.
*/
const clientEvent = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("pantry_review_opened"),
    props: z.object({ offered: count }),
  }),
  z.object({
    name: z.literal("pantry_review_to_list"),
    props: z.object({ count }),
  }),
  z.object({
    name: z.literal("pantry_review_postponed"),
    props: z.object({ until: z.enum(["tomorrow", "week"]) }),
  }),
  z.object({
    name: z.literal("invite_shared"),
    props: z.object({ via: z.enum(["share", "copy"]) }),
  }),
  // Solo el «sí» llega por aquí: los otros dos navegan, y los anota
  // `finishWelcomeAction` en la misma petición que redirige.
  z.object({
    name: z.literal("onboarding_shares"),
    props: z.object({ answer: z.literal("yes") }),
  }),
]);

/** Un aviso: la visita del día o un paso que solo ve el navegador. */
export const usageBeaconSchema = z.union([
  z.object({ visit: z.literal(true) }).strict(),
  z.object({ event: clientEvent }).strict(),
]);
