"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PatientSearchState } from "@/modules/clinic/form-state";
import { displayName } from "@/modules/clinic/format";
import { searchPatientsFormAction } from "@/modules/clinic/server/actions";

export function AgendaPatientPicker({
  date,
  patients,
}: {
  date: string;
  patients: PatientSearchState["patients"];
}) {
  const [query, setQuery] = useState("");
  const [state, formAction, pending] = useActionState(searchPatientsFormAction, {
    patients,
    hasQuery: false,
    message: "",
  });

  return (
    <div className="flex flex-col gap-3">
      <form method="post" action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="archived" value="ativos" />
        <label className="flex flex-col gap-2 text-sm font-medium">
          Buscar paciente
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
      <div aria-live="polite">
        {state.message ? (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        ) : state.patients.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm">
            {state.hasQuery
              ? "Nenhum paciente encontrado."
              : "Busque o paciente para agendar."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {state.patients.map((patient) => (
              <li key={patient.id}>
                <Link
                  href={`/consultorio/agenda/nova?paciente=${patient.id}&data=${date}`}
                  className="flex min-h-11 items-center rounded-xl border border-border px-4 py-3 break-words text-base font-medium"
                >
                  {displayName(patient.fullName, patient.preferredName)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
