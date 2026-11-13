"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleAgendaAction, type AgendaActionState } from "@/modules/clinic/form-state";
import {
  cancelAppointmentAction,
  changeAppointmentStatusAction,
  undoAppointmentAction,
} from "@/modules/clinic/server/agenda-actions";

import { AgendaNotice } from "../agenda-notice";
import { Field, controlClass } from "../../pacientes/fields";

function StatusForm({
  appointmentId,
  patientId,
  status,
  label,
}: {
  appointmentId: string;
  patientId: string;
  status: string;
  label: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    changeAppointmentStatusAction,
    idleAgendaAction,
  );
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pending}>
        {label}
      </Button>
      <AgendaNotice state={state} />
    </form>
  );
}

function ConfirmAction({
  appointmentId,
  patientId,
  action,
  confirmLabel,
  buttonLabel,
  destructive,
  children,
}: {
  appointmentId: string;
  patientId: string;
  action: (state: AgendaActionState, formData: FormData) => Promise<AgendaActionState>;
  confirmLabel: string;
  buttonLabel: string;
  destructive: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, idleAgendaAction);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <AgendaNotice state={state} />
        <Button
          type="button"
          variant={destructive ? "destructive" : "outline"}
          className="h-11 w-full"
          onClick={() => setConfirming(true)}
        >
          {buttonLabel}
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="confirm" value="sim" />
      <p className="text-sm">{confirmLabel}</p>
      {children}
      <AgendaNotice state={state} />
      <Button
        type="submit"
        variant={destructive ? "destructive" : "default"}
        className="h-11 w-full"
        disabled={pending}
      >
        Confirmar
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

export function AppointmentDetailActions({
  appointmentId,
  patientId,
  scheduled,
  showUndo,
  cancelReason,
}: {
  appointmentId: string;
  patientId: string;
  scheduled: boolean;
  showUndo: boolean;
  cancelReason: string;
}) {
  const [reason, setReason] = useState(cancelReason);

  return (
    <div className="flex flex-col gap-3">
      {scheduled ? (
        <>
          <StatusForm
            appointmentId={appointmentId}
            patientId={patientId}
            status="completed"
            label="Realizada"
          />
          <StatusForm
            appointmentId={appointmentId}
            patientId={patientId}
            status="missed_notified"
            label="Faltou (avisou)"
          />
          <StatusForm
            appointmentId={appointmentId}
            patientId={patientId}
            status="missed_unnotified"
            label="Faltou (sem aviso)"
          />
          <ConfirmAction
            appointmentId={appointmentId}
            patientId={patientId}
            action={cancelAppointmentAction}
            buttonLabel="Cancelar"
            confirmLabel="Cancelar esta sessão? O horário fica livre."
            destructive
          >
            <Field label="Motivo (opcional)">
              <Input
                name="cancelReason"
                value={reason}
                maxLength={200}
                className={controlClass}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <p className="text-sm text-muted">
              Ex.: feriado, viagem. Não escreva dados clínicos.
            </p>
          </ConfirmAction>
        </>
      ) : null}
      {showUndo ? (
        <ConfirmAction
          appointmentId={appointmentId}
          patientId={patientId}
          action={undoAppointmentAction}
          buttonLabel="Desfazer"
          confirmLabel="Desfazer a última alteração e voltar a sessão para marcada?"
          destructive
        />
      ) : null}
    </div>
  );
}
