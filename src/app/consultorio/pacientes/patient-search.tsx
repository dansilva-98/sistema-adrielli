"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PatientSearchState } from "@/modules/clinic/form-state";
import { ageLabel, displayName, maskPhone, phoneLinks } from "@/modules/clinic/format";
import { searchPatientsFormAction } from "@/modules/clinic/server/actions";

function filterHref(archived: boolean): string {
  return archived
    ? "/consultorio/pacientes?situacao=arquivados"
    : "/consultorio/pacientes";
}

export function PatientSearch({
  archived,
  today,
  patients,
}: {
  archived: boolean;
  today: string;
  patients: PatientSearchState["patients"];
}) {
  const [query, setQuery] = useState("");
  const [state, formAction, pending] = useActionState(searchPatientsFormAction, {
    patients,
    hasQuery: false,
    message: "",
  });

  return (
    <>
      <form method="post" action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="archived" value={archived ? "arquivados" : "ativos"} />
        <label className="flex flex-col gap-2 text-sm font-medium">
          Buscar por nome ou telefone
          <Input
            name="query"
            value={query}
            autoComplete="off"
            className="h-11 text-base"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full"
          disabled={pending}
        >
          Buscar
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
        <Link
          href={filterHref(false)}
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
          href={filterHref(true)}
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
      <div aria-live="polite">
        {state.message ? (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        ) : state.patients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p>
              {state.hasQuery
                ? "Nenhum paciente encontrado."
                : archived
                  ? "Nenhum paciente arquivado."
                  : "Nenhum paciente por aqui."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {state.patients.map((patient) => {
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
                  <p className="text-sm text-muted">
                    {ageLabel(patient.birthDate, today)}
                  </p>
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
      </div>
    </>
  );
}
