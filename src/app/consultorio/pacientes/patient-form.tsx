"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleClinicAction } from "@/modules/clinic/form-state";
import { maskCpf, maskPhone } from "@/modules/clinic/format";
import { createPatientAction } from "@/modules/clinic/server/actions";

import {
  Field,
  NotesField,
  RelationshipSelect,
  TextControl,
  controlClass,
} from "./fields";

export function PatientForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(createPatientAction, idleClinicAction);
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [school, setSchool] = useState("");
  const [schoolGrade, setSchoolGrade] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [addressText, setAddressText] = useState("");
  const [notes, setNotes] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [guardianCpf, setGuardianCpf] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextControl
        label="Nome completo"
        name="fullName"
        value={fullName}
        onChange={setFullName}
        autoComplete="name"
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

      <fieldset className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <legend className="px-1 text-base font-medium">Responsável</legend>
        <TextControl
          label="Nome do responsável"
          name="guardianfullName"
          value={guardianName}
          onChange={setGuardianName}
        />
        <RelationshipSelect
          name="guardianrelationship"
          value={relationship}
          onChange={setRelationship}
        />
        <Field label="Telefone">
          <Input
            name="guardianphone"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            placeholder="(11) 90000-0000"
            required
            className={controlClass}
            onChange={(event) => setPhone(maskPhone(event.target.value))}
          />
        </Field>
        <TextControl
          label="E-mail"
          name="guardianemail"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <Field label="CPF do responsável">
          <Input
            name="guardiancpf"
            inputMode="numeric"
            autoComplete="off"
            value={guardianCpf}
            placeholder="000.000.000-00"
            className={controlClass}
            onChange={(event) => setGuardianCpf(maskCpf(event.target.value))}
          />
        </Field>
        <LabelCheck />
      </fieldset>

      {state.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        name="confirmDuplicate"
        value=""
        className="h-11 w-full"
        disabled={pending}
      >
        Cadastrar paciente
      </Button>
      {state.code === "duplicate" ? (
        <Button
          type="submit"
          name="confirmDuplicate"
          value="sim"
          variant="outline"
          className="h-11 w-full"
          disabled={pending}
        >
          Cadastrar mesmo assim
        </Button>
      ) : null}
    </form>
  );
}

function LabelCheck() {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        name="guardianreceivesReminders"
        value="sim"
        className="size-5"
      />
      Recebe lembretes por e-mail
    </label>
  );
}
