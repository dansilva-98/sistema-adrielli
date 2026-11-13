"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { idleAgendaAction } from "@/modules/clinic/form-state";
import { expiredPackageLabel } from "@/modules/clinic/format";
import { packageUsageLabel } from "@/modules/clinic/agenda-view";
import type { PackageBalance } from "@/modules/clinic/packages";
import { createAppointmentAction } from "@/modules/clinic/server/agenda-actions";

import { AgendaNotice } from "../agenda-notice";
import { Field, controlClass, selectClass } from "../../pacientes/fields";

export function AppointmentForm({
  patientId,
  date,
  durationMinutes,
  packages,
  today,
}: {
  patientId: string;
  date: string;
  durationMinutes: number;
  packages: PackageBalance[];
  today: string;
}) {
  const [state, action, pending] = useActionState(
    createAppointmentAction,
    idleAgendaAction,
  );
  const [selectedDate, setSelectedDate] = useState(date);
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(String(durationMinutes));
  const [packageId, setPackageId] = useState("");
  const [weeks, setWeeks] = useState("");
  const [notes, setNotes] = useState("");
  const selectedPackage = packages.find((item) => item.id === packageId);
  const expired = selectedPackage
    ? expiredPackageLabel(selectedPackage.expiresOn, today)
    : null;
  const currentKey = `${selectedDate}|${time}|${duration}|${weeks || "1"}`;
  const weekCount = Number(weeks || "1");
  const canSkipConflicts =
    state.code === "series-conflict" &&
    state.slotKey === currentKey &&
    state.conflicts.length > 0 &&
    state.conflicts.length < weekCount;

  return (
    <form action={action} className="flex flex-col gap-4">
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
          value={time}
          required
          className={controlClass}
          onChange={(event) => setTime(event.target.value)}
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
      <Field label="Pacote (opcional)">
        <select
          name="packageId"
          value={packageId}
          className={selectClass}
          onChange={(event) => setPackageId(event.target.value)}
        >
          <option value="">Sem pacote</option>
          {packages.map((item) => {
            const warning = expiredPackageLabel(item.expiresOn, today);
            return (
              <option key={item.id} value={item.id}>
                Pacote de {item.totalSessions} ·{" "}
                {packageUsageLabel(item.consumed, item.totalSessions)}
                {warning ? ` · ${warning}` : ""}
              </option>
            );
          })}
        </select>
      </Field>
      {expired ? <p className="text-sm text-danger">{expired}</p> : null}
      <Field label="Repetir semanalmente por N semanas">
        <Input
          type="number"
          name="weeks"
          value={weeks}
          min={2}
          max={26}
          className={controlClass}
          onChange={(event) => setWeeks(event.target.value)}
        />
      </Field>
      <p className="text-sm text-muted">
        Deixe em branco para agendar só esta sessão. De 2 a 26 semanas.
      </p>
      <Field label="Observações">
        <Textarea
          name="notes"
          value={notes}
          maxLength={2000}
          className="min-h-28 text-base"
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <AgendaNotice state={state} />
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        Agendar
      </Button>
      {canSkipConflicts ? (
        <Button
          type="submit"
          name="confirm"
          value="livres"
          variant="outline"
          className="h-11 w-full"
          disabled={pending}
        >
          Criar só as livres
        </Button>
      ) : null}
    </form>
  );
}
