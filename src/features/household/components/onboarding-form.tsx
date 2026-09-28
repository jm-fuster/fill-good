"use client";

import { useActionState } from "react";
import { House, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  createHouseholdAction,
  joinHouseholdAction,
  type ActionState,
} from "../actions";

const initialState: ActionState = {};

export function OnboardingForm({ initialCode }: { initialCode?: string }) {
  const [createState, createFormAction, creating] = useActionState(
    createHouseholdAction,
    initialState,
  );
  const [joinState, joinFormAction, joining] = useActionState(
    joinHouseholdAction,
    initialState,
  );

  return (
    <Tabs defaultValue={initialCode ? "join" : "create"} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="create">Crear hogar</TabsTrigger>
        <TabsTrigger value="join">Unirme</TabsTrigger>
      </TabsList>

      <TabsContent value="create">
        <form action={createFormAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-name">Nombre del hogar</Label>
            <Input
              id="create-name"
              name="name"
              required
              maxLength={80}
              autoComplete="off"
              placeholder="p. ej. Casa de los Molina"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-display">
              Tu nombre{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="create-display"
              name="displayName"
              maxLength={80}
              autoComplete="off"
              placeholder="Cómo te verán los demás"
            />
          </div>
          {createState.error ? (
            <p role="alert" className="text-sm text-destructive">
              {createState.error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={creating}>
            <House aria-hidden />
            {creating ? "Creando…" : "Crear mi hogar"}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="join">
        <form action={joinFormAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-code">Código de invitación</Label>
            <Input
              id="join-code"
              name="code"
              required
              maxLength={12}
              defaultValue={initialCode}
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono tracking-widest uppercase"
              placeholder="Ej. 3F9A2B10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-display">
              Tu nombre{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="join-display"
              name="displayName"
              maxLength={80}
              autoComplete="off"
              placeholder="Cómo te verán los demás"
            />
          </div>
          {joinState.error ? (
            <p role="alert" className="text-sm text-destructive">
              {joinState.error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={joining}>
            <LogIn aria-hidden />
            {joining ? "Uniéndote…" : "Unirme al hogar"}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
