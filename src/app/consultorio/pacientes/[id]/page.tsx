import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { displayName, todayInClinic } from "@/modules/clinic/format";
import { readPatient } from "@/modules/clinic/server/read";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { requireStaff } from "@/modules/identity/server/guard";

import { ArchiveControl } from "../archive-control";
import { AttachmentPanel } from "../attachment-panel";
import { GuardianPanel } from "../guardian-panel";
import { PatientEditForm } from "../patient-edit-form";
import { SectionNav } from "../section-nav";

export const instant = false;

const sections = ["dados", "responsaveis", "anexos"] as const;
type Section = (typeof sections)[number];

function sectionHref(patientId: string, section: Section): string {
  const params = new URLSearchParams();
  if (section !== "dados") params.set("secao", section);
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
  const query = await searchParams;
  const section: Section = sections.includes(query.secao as Section)
    ? (query.secao as Section)
    : "dados";
  if (query.busca !== undefined) redirect(sectionHref(id, section));
  const patient = await readPatient(id);
  if (!patient) notFound();
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
      <SectionNav patientId={patient.id} section={section} />
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
        <GuardianPanel patientId={patient.id} guardians={patient.guardians} />
      ) : null}
      {section === "anexos" ? (
        <AttachmentPanel patientId={patient.id} attachments={patient.attachments} />
      ) : null}
    </section>
  );
}
