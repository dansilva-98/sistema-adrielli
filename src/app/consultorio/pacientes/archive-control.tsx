"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { idleClinicAction } from "@/modules/clinic/form-state";
import {
  archivePatientAction,
  restorePatientAction,
} from "@/modules/clinic/server/actions";

export function ArchiveControl({
  patientId,
  archived,
}: {
  patientId: string;
  archived: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(
    archived ? restorePatientAction : archivePatientAction,
    idleClinicAction,
  );

  if (!archived && !confirming) {
    return (
      <div className="flex flex-col gap-3">
        {state.message ? (
          <p className="text-sm text-support" role="status">
            {state.message}
          </p>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          className="h-11 w-full"
          onClick={() => setConfirming(true)}
        >
          Arquivar
        </Button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <input type="hidden" name="patientId" value={patientId} />
      {archived ? null : <input type="hidden" name="confirm" value="sim" />}
      <p className="text-sm">
        {archived
          ? "Restaurar este paciente para a lista de ativos?"
          : "Arquivar tira o paciente da lista de ativos. O cadastro continua guardado."}
      </p>
      {state.message ? (
        <p
          className={state.ok ? "text-sm text-support" : "text-sm text-danger"}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        variant={archived ? "default" : "destructive"}
        className="h-11 w-full"
        disabled={pending}
      >
        {archived ? "Restaurar" : "Confirmar arquivamento"}
      </Button>
      {archived ? null : (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </Button>
      )}
    </form>
  );
}
