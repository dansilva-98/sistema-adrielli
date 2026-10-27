import { z } from "zod";

import {
  cpfIsValid,
  isRealDate,
  onlyDigits,
  RELATIONSHIPS,
  type GuardianRelationship,
} from "./format";

const relationships = RELATIONSHIPS.map(([value]) => value) as [
  GuardianRelationship,
  ...GuardianRelationship[],
];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((value) => (value === "" ? null : value));

const cpfField = z
  .string()
  .trim()
  .transform((value) => {
    const digits = onlyDigits(value);
    return digits === "" ? null : digits;
  })
  .refine((value) => value === null || cpfIsValid(value), "CPF inválido.");

const phoneField = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((value) => /^[0-9]{10,13}$/.test(value), "Informe o telefone com DDD.");

const optionalEmail = optionalText(200).refine(
  (value) => value === null || z.email().safeParse(value).success,
  "Informe um e-mail válido.",
);

export type GuardianInput = {
  fullName: string;
  relationship: GuardianRelationship;
  phone: string;
  email: string | null;
  cpf: string | null;
  receivesReminders: boolean;
};

export type PatientInput = {
  fullName: string;
  preferredName: string | null;
  birthDate: string;
  cpf: string | null;
  school: string | null;
  schoolGrade: string | null;
  referralSource: string | null;
  notes: string | null;
  addressText: string | null;
};

export type CreatePatientInput = PatientInput & {
  confirmDuplicate: boolean;
  guardian: GuardianInput;
};

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function patientShape(today: string) {
  return {
    fullName: z.string().trim().min(1, "Informe o nome.").max(200),
    preferredName: optionalText(200),
    birthDate: z
      .string()
      .trim()
      .refine(isRealDate, "Data de nascimento inválida.")
      .refine((value) => value <= today, "A data de nascimento não pode ser futura."),
    cpf: cpfField,
    school: optionalText(200),
    schoolGrade: optionalText(200),
    referralSource: optionalText(200),
    notes: optionalText(2000),
    addressText: optionalText(2000),
  };
}

function guardianShape() {
  return {
    fullName: z.string().trim().min(1, "Informe o nome do responsável.").max(200),
    relationship: z.enum(relationships, "Escolha o parentesco."),
    phone: phoneField,
    email: optionalEmail,
    cpf: cpfField,
    receivesReminders: z.boolean(),
  };
}

function readPatient(formData: FormData) {
  return {
    fullName: text(formData, "fullName"),
    preferredName: text(formData, "preferredName"),
    birthDate: text(formData, "birthDate"),
    cpf: text(formData, "cpf"),
    school: text(formData, "school"),
    schoolGrade: text(formData, "schoolGrade"),
    referralSource: text(formData, "referralSource"),
    notes: text(formData, "notes"),
    addressText: text(formData, "addressText"),
  };
}

function readGuardian(formData: FormData, prefix: string): GuardianInput {
  const parsed = z.object(guardianShape()).parse({
    fullName: text(formData, `${prefix}fullName`),
    relationship: text(formData, `${prefix}relationship`),
    phone: text(formData, `${prefix}phone`),
    email: text(formData, `${prefix}email`),
    cpf: text(formData, `${prefix}cpf`),
    receivesReminders: formData.get(`${prefix}receivesReminders`) === "sim",
  });
  return parsed;
}

export function parseCreatePatient(
  formData: FormData,
  today: string,
): CreatePatientInput {
  const patient = z.object(patientShape(today)).parse(readPatient(formData));
  return {
    ...patient,
    confirmDuplicate: formData.get("confirmDuplicate") === "sim",
    guardian: readGuardian(formData, "guardian"),
  };
}

export function parsePatientUpdate(formData: FormData, today: string): PatientInput {
  return z.object(patientShape(today)).parse(readPatient(formData));
}

export function parseGuardianInput(formData: FormData): GuardianInput {
  return readGuardian(formData, "guardian");
}

export function parseRecordId(formData: FormData, name = "patientId"): string {
  return z.uuid("Identificador inválido.").parse(text(formData, name));
}
