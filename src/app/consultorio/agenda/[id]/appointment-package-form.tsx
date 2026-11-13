"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { packageUsageLabel } from "@/modules/clinic/agenda-view";
import { idleAgendaAction } from "@/modules/clinic/form-state";
import { expiredPackageLabel } from "@/modules/clinic/format";
import type { PackageBalance } from "@/modules/clinic/packages";
import { setAppointmentPackageAction } from "@/modules/clinic/server/agenda-actions";

import { AgendaNotice } from "../agenda-notice";
import { Field, selectClass } from "../../pacientes/fields";

export function AppointmentPackageForm({
  appointmentId,
  patientId,
  packageId,
  packages,
  today,
}: {
  appointmentId: string;
  patientId: string;
  packageId: string | null;
  packages: PackageBalance[];
  today: string;
}) {
  const current = packages.find((item) => item.id === packageId) ?? null;
  const expired = current ? expiredPackageLabel(current.expiresOn, today) : null;
  const openPackages = packages.filter(
    (item) => item.closedAt === null && item.remaining > 0 && item.id !== packageId,
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <h3 className="font-medium">Pacote</h3>
      {current ? (
        <p className="text-sm">
          Ligada ao pacote de {current.totalSessions} ·{" "}
          {packageUsageLabel(current.consumed, current.totalSessions)}
          {expired ? ` · ${expired}` : ""}
        </p>
      ) : (
        <p className="text-sm text-muted">Esta sessão não está ligada a um pacote.</p>
      )}
      {current ? (
        <UnlinkPackageForm appointmentId={appointmentId} patientId={patientId} />
      ) : null}
      {openPackages.length > 0 ? (
        <LinkPackageForm
          appointmentId={appointmentId}
          patientId={patientId}
          packages={openPackages}
          replacing={current !== null}
        />
      ) : null}
    </div>
  );
}

function LinkPackageForm({
  appointmentId,
  patientId,
  packages,
  replacing,
}: {
  appointmentId: string;
  patientId: string;
  packages: PackageBalance[];
  replacing: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    setAppointmentPackageAction,
    idleAgendaAction,
  );
  const [selected, setSelected] = useState(packages[0]?.id ?? "");

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="patientId" value={patientId} />
      <Field label={replacing ? "Trocar para outro pacote" : "Ligar a um pacote"}>
        <select
          name="packageId"
          value={selected}
          className={selectClass}
          onChange={(event) => setSelected(event.target.value)}
        >
          {packages.map((item) => (
            <option key={item.id} value={item.id}>
              Pacote de {item.totalSessions} ·{" "}
              {packageUsageLabel(item.consumed, item.totalSessions)}
            </option>
          ))}
        </select>
      </Field>
      <AgendaNotice state={state} />
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pending}>
        {replacing ? "Trocar pacote" : "Ligar ao pacote"}
      </Button>
    </form>
  );
}

function UnlinkPackageForm({
  appointmentId,
  patientId,
}: {
  appointmentId: string;
  patientId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(
    setAppointmentPackageAction,
    idleAgendaAction,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <AgendaNotice state={state} />
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          onClick={() => setConfirming(true)}
        >
          Desligar do pacote
        </Button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="packageId" value="" />
      <p className="text-sm">Tirar esta sessão do pacote? A vaga volta a ficar livre.</p>
      <AgendaNotice state={state} />
      <Button type="submit" className="h-11 w-full" disabled={pending}>
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
