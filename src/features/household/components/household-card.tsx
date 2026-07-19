"use client";

import { useTransition } from "react";
import { Copy, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { CurrentHousehold, HouseholdMember } from "../queries";
import { leaveHouseholdAction, regenerateInviteCodeAction } from "../actions";

export function HouseholdCard({
  household,
  members,
}: {
  household: CurrentHousehold;
  members: HouseholdMember[];
}) {
  const [pending, startTransition] = useTransition();

  function copyCode() {
    navigator.clipboard
      .writeText(household.inviteCode)
      .then(() => toast.success("Código copiado"))
      .catch(() => toast.error("No se pudo copiar"));
  }

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateInviteCodeAction();
      if (result?.error) toast.error(result.error);
      else toast.success("Código regenerado");
    });
  }

  function leave() {
    const ok = window.confirm(
      "¿Seguro que quieres abandonar este hogar? Dejarás de ver su inventario y sus listas.",
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await leaveHouseholdAction();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{household.name}</CardTitle>
        <CardDescription>
          Comparte el código para que otros miembros se unan a tu hogar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-sm font-medium">Código de invitación</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border bg-muted px-3 py-2.5 font-mono text-lg tracking-widest">
              {household.inviteCode}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar código"
              onClick={copyCode}
            >
              <Copy aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Regenerar código"
              onClick={regenerate}
              disabled={pending}
            >
              <RefreshCw aria-hidden />
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-sm font-medium">
            Miembros ({members.length})
          </p>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">
                  {m.displayName ?? "Miembro"}
                  {m.isCurrentUser ? (
                    <span className="text-muted-foreground"> (tú)</span>
                  ) : null}
                </span>
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                  {m.role === "owner" ? "Propietario" : "Miembro"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        <Button
          variant="destructive"
          onClick={leave}
          disabled={pending}
          className="self-start"
        >
          <LogOut aria-hidden />
          Abandonar hogar
        </Button>
      </CardContent>
    </Card>
  );
}
