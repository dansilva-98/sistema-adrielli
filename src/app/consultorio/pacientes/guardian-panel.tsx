"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleClinicAction } from "@/modules/clinic/form-state";
import {
  maskCpf,
  maskPhone,
  phoneLinks,
  relationshipLabel,
  type GuardianRelationship,
} from "@/modules/clinic/format";
import {
  addGuardianAction,
  linkGuardianAction,
  setPrimaryGuardianAction,
  unlinkGuardianAction,
} from "@/modules/clinic/server/actions";

import { Field, RelationshipSelect, TextControl, controlClass } from "./fields";

export type GuardianCard = {
  id: string;
  fullName: string;
  relationship: GuardianRelationship;
  phone: string;
  email: string | null;
  isPrimary: boolean;
};

export type GuardianSearchHit = {
  id: string;
  fullName: string;
  relationship: GuardianRelationship;
  phone: string;
};

export function GuardianPanel({
  patientId,
  guardians,
  matches,
}: {
  patientId: string;
  guardians: GuardianCard[];
  matches: GuardianSearchHit[];
}) {
  const last = guardians.length <= 1;

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3">
        {guardians.map((guardian) => (
          <li key={guardian.id} className="rounded-xl border border-border p-4">
            <GuardianCardView guardian={guardian} patientId={patientId} last={last} />
          </li>
        ))}
      </ul>
      {matches.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-medium">Encontrados</h3>
          <ul className="flex flex-col gap-3">
            {matches.map((match) => (
              <li key={match.id}>
                <LinkMatch patientId={patientId} match={match} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <AddGuardianForm patientId={patientId} guardianCount={guardians.length} />
    </div>
  );
}

function GuardianCardView({
  guardian,
  patientId,
  last,
}: {
  guardian: GuardianCard;
  patientId: string;
  last: boolean;
}) {
  const links = phoneLinks(guardian.phone);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-base font-medium break-words">{guardian.fullName}</p>
        <p className="text-sm text-muted">
          {relationshipLabel(guardian.relationship)}
          {guardian.isPrimary ? " · Principal" : ""}
        </p>
        <p className="text-sm">{maskPhone(guardian.phone)}</p>
      </div>
      {links ? (
        <div className="grid grid-cols-2 gap-2">
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
      {guardian.isPrimary ? null : (
        <RecordButton
          action={setPrimaryGuardianAction}
          patientId={patientId}
          guardianId={guardian.id}
          label="Tornar principal"
        />
      )}
      <UnlinkControl patientId={patientId} guardianId={guardian.id} blocked={last} />
    </div>
  );
}

function LinkMatch({
  patientId,
  match,
}: {
  patientId: string;
  match: GuardianSearchHit;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div>
        <p className="font-medium break-words">{match.fullName}</p>
        <p className="text-sm text-muted">
          {relationshipLabel(match.relationship)} · {maskPhone(match.phone)}
        </p>
      </div>
      <RecordButton
        action={linkGuardianAction}
        patientId={patientId}
        guardianId={match.id}
        label="Vincular"
      />
    </div>
  );
}

function RecordButton({
  action,
  patientId,
  guardianId,
  label,
}: {
  action: typeof linkGuardianAction;
  patientId: string;
  guardianId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleClinicAction);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="guardianId" value={guardianId} />
      {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}

function UnlinkControl({
  patientId,
  guardianId,
  blocked,
}: {
  patientId: string;
  guardianId: string;
  blocked: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(unlinkGuardianAction, idleClinicAction);
  if (blocked) {
    return <p className="text-sm text-muted">O paciente precisa de um responsável.</p>;
  }
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="destructive"
        className="h-11 w-full"
        onClick={() => setConfirming(true)}
      >
        Desligar
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="guardianId" value={guardianId} />
      <input type="hidden" name="confirm" value="sim" />
      <p className="text-sm">Desligar este responsável do paciente?</p>
      {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
      <Button
        type="submit"
        variant="destructive"
        className="h-11 w-full"
        disabled={pending}
      >
        Confirmar desligamento
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        onClick={() => setConfirming(false)}
      >
        Cancelar
      </Button>
    </form>
  );
}

function AddGuardianForm({
  patientId,
  guardianCount,
}: {
  patientId: string;
  guardianCount: number;
}) {
  const [state, action, pending] = useActionState(addGuardianAction, idleClinicAction);
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");

  return (
    <form key={guardianCount} action={action} className="flex flex-col gap-4">
      <h3 className="text-base font-medium">Novo responsável</h3>
      <input type="hidden" name="patientId" value={patientId} />
      <TextControl
        label="Nome do responsável"
        name="guardianfullName"
        value={fullName}
        onChange={setFullName}
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
          value={phone}
          required
          placeholder="(11) 90000-0000"
          className={controlClass}
          onChange={(event) => setPhone(maskPhone(event.target.value))}
        />
      </Field>
      <TextControl
        label="E-mail"
        name="guardianemail"
        value={email}
        onChange={setEmail}
      />
      <Field label="CPF do responsável">
        <Input
          name="guardiancpf"
          inputMode="numeric"
          value={cpf}
          placeholder="000.000.000-00"
          className={controlClass}
          onChange={(event) => setCpf(maskCpf(event.target.value))}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="guardianreceivesReminders"
          value="sim"
          className="size-5"
        />
        Recebe lembretes por e-mail
      </label>
      {state.message ? (
        <p
          className={state.ok ? "text-sm text-support" : "text-sm text-danger"}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        Adicionar responsável
      </Button>
    </form>
  );
}
