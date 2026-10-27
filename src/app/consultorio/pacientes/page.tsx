import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ageLabel,
  displayName,
  maskPhone,
  phoneLinks,
  todayInClinic,
} from "@/modules/clinic/format";
import { readPatientList } from "@/modules/clinic/server/read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

export const instant = false;

function listHref(archived: boolean, query: string): string {
  const params = new URLSearchParams();
  if (archived) params.set("situacao", "arquivados");
  if (query) params.set("q", query);
  const text = params.toString();
  return text ? `/consultorio/pacientes?${text}` : "/consultorio/pacientes";
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string }>;
}) {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const params = await searchParams;
  const query = params.q ?? "";
  const archived = params.situacao === "arquivados";
  const patients = await readPatientList({ query, archived });
  const today = todayInClinic();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-serif text-2xl">Pacientes</h2>
      <Link
        href="/consultorio/pacientes/novo"
        className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Novo paciente
      </Link>
      <form method="get" action="/consultorio/pacientes" className="flex flex-col gap-3">
        {archived ? <input type="hidden" name="situacao" value="arquivados" /> : null}
        <label className="flex flex-col gap-2 text-sm font-medium">
          Buscar por nome ou telefone
          <Input name="q" defaultValue={query} className="h-11 text-base" />
        </label>
        <Button type="submit" variant="outline" className="h-11 w-full">
          Buscar
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
        <Link
          href={listHref(false, query)}
          aria-current={archived ? undefined : "page"}
          className={
            archived
              ? "inline-flex h-11 items-center justify-center rounded-md text-sm"
              : "inline-flex h-11 items-center justify-center rounded-md bg-support text-sm font-medium text-support-foreground"
          }
        >
          Ativos
        </Link>
        <Link
          href={listHref(true, query)}
          aria-current={archived ? "page" : undefined}
          className={
            archived
              ? "inline-flex h-11 items-center justify-center rounded-md bg-support text-sm font-medium text-support-foreground"
              : "inline-flex h-11 items-center justify-center rounded-md text-sm"
          }
        >
          Arquivados
        </Link>
      </div>
      {patients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p>
            {query
              ? "Nenhum paciente encontrado."
              : archived
                ? "Nenhum paciente arquivado."
                : "Nenhum paciente por aqui."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {patients.map((patient) => {
            const links = patient.guardianPhone
              ? phoneLinks(patient.guardianPhone)
              : null;
            return (
              <li key={patient.id} className="rounded-xl border border-border p-4">
                <Link
                  href={`/consultorio/pacientes/${patient.id}`}
                  className="block min-h-11 break-words text-lg font-medium"
                >
                  {displayName(patient.fullName, patient.preferredName)}
                </Link>
                <p className="text-sm text-muted">{ageLabel(patient.birthDate, today)}</p>
                <p className="mt-2 text-sm">
                  {patient.guardianName
                    ? `${patient.guardianName} · ${maskPhone(patient.guardianPhone ?? "")}`
                    : "Sem responsável principal"}
                </p>
                {links ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      href={links.call}
                      className="inline-flex h-11 items-center justify-center rounded-lg border border-border text-sm font-medium"
                    >
                      Ligar
                    </a>
                    <a
                      href={links.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-support text-sm font-medium text-support-foreground"
                    >
                      WhatsApp
                    </a>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
