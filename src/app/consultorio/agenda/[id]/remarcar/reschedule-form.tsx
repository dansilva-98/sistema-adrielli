"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { idleAgendaAction } from "@/modules/clinic/form-state";
import { rescheduleAppointmentAction } from "@/modules/clinic/server/agenda-actions";

import { AgendaNotice } from "../../agenda-notice";
import { Field, controlClass } from "../../../pacientes/fields";

export function RescheduleForm({
  appointmentId,
  patientId,
  date,
  time,
  durationMinutes,
  notes,
}: {
  appointmentId: string;
  patientId: string;
  date: string;
  time: string;
  durationMinutes: number;
  notes: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(
    rescheduleAppointmentAction,
    idleAgendaAction,
  );
  const [selectedDate, setSelectedDate] = useState(date);
  const [selectedTime, setSelectedTime] = useState(time);
  const [duration, setDuration] = useState(String(durationMinutes));
  const [note, setNote] = useState(notes);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="patientId" value={patientId} />
      <Field label="Data">
        <Input
          type="date"
          name="date"
          value={selectedDate}
          required
          className={controlClass}
          onChange={(event) => setSelectedDate(event.target.value)}
        />
      </Field>
      <Field label="Hora">
        <Input
          type="time"
          name="time"
          value={selectedTime}
          required
          className={controlClass}
          onChange={(event) => setSelectedTime(event.target.value)}
        />
      </Field>
      <Field label="Duração (minutos)">
        <Input
          type="number"
          name="durationMinutes"
          value={duration}
          min={1}
          required
          className={controlClass}
          onChange={(event) => setDuration(event.target.value)}
        />
      </Field>
      <Field label="Observações">
        <Textarea
          name="notes"
          value={note}
          maxLength={2000}
          className="min-h-28 text-base"
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <AgendaNotice state={state} />
      {confirming ? <input type="hidden" name="confirm" value="sim" /> : null}
      {confirming ? (
        <>
          <p className="text-sm">Remarcar esta sessão para o novo horário?</p>
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            Confirmar remarcação
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => setConfirming(false)}
          >
            Voltar
          </Button>
        </>
      ) : (
        <Button type="button" className="h-11 w-full" onClick={() => setConfirming(true)}>
          Remarcar
        </Button>
      )}
    </form>
  );
}
