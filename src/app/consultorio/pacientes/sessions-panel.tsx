import Link from "next/link";

import {
  APPOINTMENT_MODALITY_LABELS,
  APPOINTMENT_STATUS_LABELS,
} from "@/modules/clinic/appointment-status";
import {
  packageUsageLabel,
  pendingMakeupsLabel,
  remainingSessionWarning,
} from "@/modules/clinic/agenda-view";
import type { AppointmentRecord } from "@/modules/clinic/appointments";
import { expiredPackageLabel, formatClinicSlotLabel } from "@/modules/clinic/format";
import type { PackageBalance } from "@/modules/clinic/packages";

import { ClosePackageButton, CreatePackageForm } from "./package-forms";

function priceLabel(cents: number | null): string | null {
  if (cents === null) return null;
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export function SessionsPanel({
  patientId,
  appointments,
  packages,
  today,
}: {
  patientId: string;
  appointments: AppointmentRecord[];
  packages: PackageBalance[];
  today: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-xl">Pacotes</h3>
        {packages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm">
            Nenhum pacote neste paciente.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {packages.map((item) => {
              const expired = expiredPackageLabel(item.expiresOn, today);
              const remaining = item.closedAt
                ? null
                : remainingSessionWarning(item.remaining);
              const pending = pendingMakeupsLabel(item.pendingMakeups);
              const price = priceLabel(item.priceCents);
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-border p-4"
                >
                  <p className="font-medium">
                    Pacote de {item.totalSessions} ·{" "}
                    {packageUsageLabel(item.consumed, item.totalSessions)}
                  </p>
                  {item.closedAt ? <p className="text-sm text-muted">Encerrado</p> : null}
                  {expired ? <p className="text-sm text-danger">{expired}</p> : null}
                  {remaining ? <p className="text-sm text-danger">{remaining}</p> : null}
                  {pending ? <p className="text-sm">{pending}</p> : null}
                  {price ? <p className="text-sm text-muted">{price}</p> : null}
                  {item.notes ? (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {item.notes}
                    </p>
                  ) : null}
                  {item.closedAt ? null : (
                    <ClosePackageButton
                      packageId={item.id}
                      patientId={patientId}
                      scheduledCount={item.scheduled}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <CreatePackageForm patientId={patientId} today={today} />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-xl">Histórico</h3>
        {appointments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm">
            Nenhuma sessão neste paciente.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {appointments.map((appointment) => (
              <li key={appointment.id}>
                <Link
                  href={`/consultorio/agenda/${appointment.id}`}
                  className="flex min-h-11 min-w-0 flex-col gap-1 rounded-xl border border-border p-4"
                >
                  <p className="text-sm text-muted">
                    {formatClinicSlotLabel(appointment.startsAt)} ·{" "}
                    {APPOINTMENT_STATUS_LABELS[appointment.status]} ·{" "}
                    {APPOINTMENT_MODALITY_LABELS[appointment.modality]}
                  </p>
                  {appointment.makeupOfId ? <p className="text-sm">Reposição</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
