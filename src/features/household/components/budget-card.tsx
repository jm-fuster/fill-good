"use client";

import { useActionState } from "react";
import { Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { updateMonthlyBudgetAction, type BudgetState } from "../actions";

const initialState: BudgetState = {};

export function BudgetCard({ budget }: { budget: number | null }) {
  const [state, formAction, pending] = useActionState(
    updateMonthlyBudgetAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-4" aria-hidden />
          Objetivo de gasto mensual
        </CardTitle>
        <CardDescription>
          Opcional. Si lo defines, el panel de precios muestra tu progreso del
          mes. Déjalo vacío para quitarlo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget">Importe mensual (€)</Label>
            <Input
              id="budget"
              name="budget"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={budget ?? ""}
              autoComplete="off"
              placeholder="p. ej. 400"
              className="max-w-40"
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar objetivo"}
            </Button>
            {state.ok && !pending ? (
              <span role="status" className="text-sm text-success">
                Guardado
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
