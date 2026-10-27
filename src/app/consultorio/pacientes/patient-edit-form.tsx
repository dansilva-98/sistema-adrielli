"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleClinicAction } from "@/modules/clinic/form-state";
import { maskCpf } from "@/modules/clinic/format";
import type { PatientInput } from "@/modules/clinic/schema";
import { updatePatientAction } from "@/modules/clinic/server/actions";

import { Field, NotesField, TextControl, controlClass } from "./fields";

export function PatientEditForm({
  patientId,
  patient,
  today,
}: {
  patientId: string;
  patient: PatientInput;
  today: string;
}) {
  const [state, action, pending] = useActionState(updatePatientAction, idleClinicAction);
  const [fullName, setFullName] = useState(patient.fullName);
  const [preferredName, setPreferredName] = useState(patient.preferredName ?? "");
  const [birthDate, setBirthDate] = useState(patient.birthDate);
  const [cpf, setCpf] = useState(patient.cpf ? maskCpf(patient.cpf) : "");
  const [school, setSchool] = useState(patient.school ?? "");
  const [schoolGrade, setSchoolGrade] = useState(patient.schoolGrade ?? "");
  const [referralSource, setReferralSource] = useState(patient.referralSource ?? "");
  const [addressText, setAddressText] = useState(patient.addressText ?? "");
  const [notes, setNotes] = useState(patient.notes ?? "");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="patientId" value={patientId} />
      <TextControl
        label="Nome completo"
        name="fullName"
        value={fullName}
        onChange={setFullName}
      />
      <TextControl
        label="Como gosta de ser chamado"
        name="preferredName"
        value={preferredName}
        onChange={setPreferredName}
      />
      <Field label="Data de nascimento">
        <Input
          type="date"
          name="birthDate"
          value={birthDate}
          max={today}
          required
          className={controlClass}
          onChange={(event) => setBirthDate(event.target.value)}
        />
      </Field>
      <Field label="CPF">
        <Input
          name="cpf"
          inputMode="numeric"
          autoComplete="off"
          value={cpf}
          placeholder="000.000.000-00"
          className={controlClass}
          onChange={(event) => setCpf(maskCpf(event.target.value))}
        />
      </Field>
      <TextControl label="Escola" name="school" value={school} onChange={setSchool} />
      <TextControl
        label="Ano ou série"
        name="schoolGrade"
        value={schoolGrade}
        onChange={setSchoolGrade}
      />
      <TextControl
        label="Quem encaminhou"
        name="referralSource"
        value={referralSource}
        onChange={setReferralSource}
      />
      <TextControl
        label="Endereço"
        name="addressText"
        value={addressText}
        onChange={setAddressText}
      />
      <NotesField value={notes} onChange={setNotes} />
      {state.message ? (
        <p
          className={state.ok ? "text-sm text-support" : "text-sm text-danger"}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        Salvar
      </Button>
    </form>
  );
}
