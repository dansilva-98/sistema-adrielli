import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  attachmentCategoryLabel,
  displayName,
  formatClinicTimestamp,
  todayInClinic,
} from "@/modules/clinic/format";
import { readGuardianSearch, readPatient } from "@/modules/clinic/server/read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { ArchiveControl } from "../archive-control";
import { GuardianPanel } from "../guardian-panel";
import { PatientEditForm } from "../patient-edit-form";

export const instant = false;

const sections = ["dados", "responsaveis", "anexos"] as const;
type Section = (typeof sections)[number];

function sectionHref(patientId: string, section: Section, search = ""): string {
  const params = new URLSearchParams();
  if (section !== "dados") params.set("secao", section);
  if (section === "responsaveis" && search) params.set("busca", search);
  const text = params.toString();
  const path = `/consultorio/pacientes/${patientId}`;
  return text ? `${path}?${text}` : path;
}

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ secao?: string; busca?: string }>;
}) {
  await requireStaff({ roles: CONSULTORIO_ROLES });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const patient = await readPatient(id);
  if (!patient) notFound();
  const query = await searchParams;
  const section: Section = sections.includes(query.secao as Section)
    ? (query.secao as Section)
    : "dados";
  const search = query.busca ?? "";
  const matches =
    section === "responsaveis" ? await readGuardianSearch(patient.id, search) : [];
  const tabs: { id: Section; label: string }[] = [
    { id: "dados", label: "Dados" },
    { id: "responsaveis", label: "Responsáveis" },
    { id: "anexos", label: "Anexos" },
  ];

  return (
    <section className="flex flex-col gap-4">
      <Link
        href="/consultorio/pacientes"
        className="min-h-11 text-sm underline-offset-4 hover:underline"
      >
        Voltar para pacientes
      </Link>
      <div>
        <h2 className="font-serif text-2xl break-words">
          {displayName(patient.fullName, patient.preferredName)}
        </h2>
        {patient.archivedAt ? <p className="text-sm text-muted">Arquivado</p> : null}
      </div>
      <nav aria-label="Ficha" className="grid grid-cols-3 gap-1">
        {tabs.map((tab) => {
          const current = tab.id === section;
          return (
            <Link
              key={tab.id}
              href={sectionHref(patient.id, tab.id, search)}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "inline-flex h-11 items-center justify-center rounded-md bg-support px-1 text-center text-sm font-medium text-support-foreground"
                  : "inline-flex h-11 items-center justify-center rounded-md border border-border px-1 text-center text-sm"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {section === "dados" ? (
        <div className="flex flex-col gap-6">
          <PatientEditForm
            patientId={patient.id}
            today={todayInClinic()}
            patient={{
              fullName: patient.fullName,
              preferredName: patient.preferredName,
              birthDate: patient.birthDate,
              cpf: patient.cpf,
              school: patient.school,
              schoolGrade: patient.schoolGrade,
              referralSource: patient.referralSource,
              notes: patient.notes,
              addressText: patient.addressText,
            }}
          />
          <ArchiveControl patientId={patient.id} archived={patient.archivedAt !== null} />
        </div>
      ) : null}
      {section === "responsaveis" ? (
        <div className="flex flex-col gap-6">
          <form method="get" className="flex flex-col gap-3">
            <input type="hidden" name="secao" value="responsaveis" />
            <label className="flex flex-col gap-2 text-sm font-medium">
              Buscar responsável já cadastrado
              <input
                name="busca"
                defaultValue={search}
                className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border text-sm font-medium"
            >
              Buscar
            </button>
          </form>
          <GuardianPanel
            patientId={patient.id}
            guardians={patient.guardians}
            matches={matches}
          />
        </div>
      ) : null}
      {section === "anexos" ? (
        patient.attachments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            Nenhum anexo.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {patient.attachments.map((attachment) => (
              <li key={attachment.id} className="rounded-xl border border-border p-4">
                <p className="font-medium break-words">{attachment.originalName}</p>
                <p className="text-sm text-muted">
                  {attachmentCategoryLabel(attachment.category)} ·{" "}
                  {formatClinicTimestamp(attachment.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
