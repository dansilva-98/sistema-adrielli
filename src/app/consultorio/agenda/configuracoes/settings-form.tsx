"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AgendaSettings } from "@/modules/clinic/agenda-settings";
import { idleAgendaAction } from "@/modules/clinic/form-state";
import { updateAgendaSettingsAction } from "@/modules/clinic/server/agenda-actions";

import { AgendaNotice } from "../agenda-notice";
import { Field, controlClass } from "../../pacientes/fields";

export function AgendaSettingsForm({ settings }: { settings: AgendaSettings }) {
  const [state, action, pending] = useActionState(
    updateAgendaSettingsAction,
    idleAgendaAction,
  );
  const [duration, setDuration] = useState(String(settings.defaultDurationMinutes));
  const [locationName, setLocationName] = useState(settings.locationName);
  const [locationAddress, setLocationAddress] = useState(settings.locationAddress);
  const [hour, setHour] = useState(String(settings.reminderSendHour));

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Duração padrão (minutos)">
        <Input
          type="number"
          name="defaultDurationMinutes"
          value={duration}
          min={1}
          required
          className={controlClass}
          onChange={(event) => setDuration(event.target.value)}
        />
      </Field>
      <Field label="Local">
        <Input
          name="locationName"
          value={locationName}
          maxLength={200}
          className={controlClass}
          onChange={(event) => setLocationName(event.target.value)}
        />
      </Field>
      <Field label="Endereço">
        <Textarea
          name="locationAddress"
          value={locationAddress}
          maxLength={2000}
          className="min-h-28 text-base"
          onChange={(event) => setLocationAddress(event.target.value)}
        />
      </Field>
      <Field label="Hora do lembrete">
        <Input
          type="number"
          name="reminderSendHour"
          value={hour}
          min={0}
          max={23}
          required
          className={controlClass}
          onChange={(event) => setHour(event.target.value)}
        />
      </Field>
      <p className="text-sm text-muted">
        Informe uma hora entre 0 e 23, no fuso de Brasília.
      </p>
      <AgendaNotice state={state} />
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        Salvar
      </Button>
    </form>
  );
}
