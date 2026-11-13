"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { idleClinicAction } from "@/modules/clinic/form-state";
import {
  closePackageAction,
  createPackageAction,
} from "@/modules/clinic/server/agenda-actions";

import { Field, controlClass } from "./fields";

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return (
    <p
      role={ok ? "status" : "alert"}
      className={ok ? "text-sm text-support" : "text-sm text-danger"}
    >
      {message}
    </p>
  );
}

export function CreatePackageForm({
  patientId,
  today,
}: {
  patientId: string;
  today: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createPackageAction, idleClinicAction);
  const [startsOn, setStartsOn] = useState(today);
  const [expiresOn, setExpiresOn] = useState("");
  const [totalSessions, setTotalSessions] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <h4 className="font-medium">Novo pacote</h4>
      <Field label="Número de sessões">
        <Input
          name="totalSessions"
          value={totalSessions}
          inputMode="numeric"
          required
          className={controlClass}
          onChange={(event) => setTotalSessions(event.target.value)}
        />
      </Field>
      <Field label="Início">
        <Input
          type="date"
          name="startsOn"
          value={startsOn}
          required
          className={controlClass}
          onChange={(event) => setStartsOn(event.target.value)}
        />
      </Field>
      <Field label="Vencimento (opcional)">
        <Input
          type="date"
          name="expiresOn"
          value={expiresOn}
          className={controlClass}
          onChange={(event) => setExpiresOn(event.target.value)}
        />
      </Field>
      <Field label="Preço (opcional)">
        <Input
          name="price"
          value={price}
          inputMode="decimal"
          placeholder="0,00"
          className={controlClass}
          onChange={(event) => setPrice(event.target.value)}
        />
      </Field>
      <Field label="Observações">
        <Textarea
          name="notes"
          value={notes}
          maxLength={2000}
          className="min-h-24 text-base"
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Notice ok={state.ok} message={state.message} />
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        Criar pacote
      </Button>
    </form>
  );
}

export function ClosePackageButton({
  packageId,
  patientId,
}: {
  packageId: string;
  patientId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(closePackageAction, idleClinicAction);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <Notice ok={state.ok} message={state.message} />
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          onClick={() => setConfirming(true)}
        >
          Encerrar pacote
        </Button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <input type="hidden" name="packageId" value={packageId} />
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="confirm" value="sim" />
      <p className="text-sm">
        Encerrar este pacote? Não dá para ligar sessões novas a ele.
      </p>
      <Notice ok={state.ok} message={state.message} />
      <Button
        type="submit"
        variant="destructive"
        className="h-11 w-full"
        disabled={pending}
      >
        Confirmar encerramento
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        onClick={() => setConfirming(false)}
      >
        Voltar
      </Button>
    </form>
  );
}
