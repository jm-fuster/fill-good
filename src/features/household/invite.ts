import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { isoDateInSpain, shiftDays, todayLocalISO } from "@/lib/dates";

export type InviteCodeStatus = {
  expired: boolean;
  /** «hoy», «mañana» o «el 30 de septiembre», para «Caduca …» / «caducó …». */
  when: string;
};

/**
 * Si el código de invitación sigue valiendo y cómo decir hasta cuándo.
 *
 * Se calcula en el SERVIDOR (la página lo pasa ya resuelto) porque depende del
 * reloj: hecho en el cliente, el primer render de hidratación podría no
 * coincidir con el del servidor en el minuto exacto en que caduca.
 *
 * El día se dice con el calendario español (`isoDateInSpain`): la caducidad es
 * un instante, y recortarlo en UTC diría «mañana» a quien lo mira a la 01:00 de
 * ese mismo día.
 */
export function inviteCodeStatus(
  expiresAt: string,
  nowMs: number,
): InviteCodeStatus {
  const instant = Date.parse(expiresAt);
  // Una fecha ilegible cuenta como caducada: ofrecer regenerar cuesta un toque,
  // repartir un enlace muerto cuesta la invitación.
  if (Number.isNaN(instant)) return { expired: true, when: "" };

  const day = isoDateInSpain(expiresAt);
  const today = todayLocalISO();
  const when =
    day === today
      ? "hoy"
      : day === shiftDays(today, 1)
        ? "mañana"
        : `el ${format(parseISO(day), "d 'de' MMMM", { locale: es })}`;
  return { expired: instant <= nowMs, when };
}
