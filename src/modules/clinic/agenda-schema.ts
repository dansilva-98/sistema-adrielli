import { z } from "zod";

import {
  APPOINTMENT_MODALITIES,
  type AppointmentModality,
  STATUS_CHANGES_FROM_SCHEDULED,
  type StatusChangeFromScheduled,
} from "./appointment-status";
import { isRealDate } from "./format";

const optionalNotes = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  })
  .refine(
    (value) => value === null || value.length <= 2000,
    "Use no máximo 2000 caracteres.",
  );

export type CreatePackageInput = {
  patientId: string;
  totalSessions: number;
  startsOn: string;
  expiresOn: string | null;
  priceCents: number | null;
  notes: string | null;
};

export type CreateAppointmentInput = {
  patientId: string;
  packageId: string | null;
  startsAt: Date;
  endsAt: Date;
  modality: AppointmentModality;
  seriesId: string | null;
  notes: string | null;
};

export type RescheduleAppointmentInput = {
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
};

export type MakeupAppointmentInput = {
  startsAt: Date;
  endsAt: Date;
  modality: AppointmentModality;
  notes: string | null;
};

export type AgendaSettingsInput = {
  defaultDurationMinutes: number;
  locationName: string;
  locationAddress: string;
  reminderSendHour: number;
};

const uuid = z.uuid("Identificador inválido.");

export const createPackageSchema = z.object({
  patientId: uuid,
  totalSessions: z.number().int().positive("Informe um total de sessões maior que zero."),
  startsOn: z.string().refine(isRealDate, "Data de início inválida."),
  expiresOn: z
    .string()
    .nullable()
    .refine((value) => value === null || isRealDate(value), "Data de validade inválida."),
  priceCents: z.number().int().nonnegative("O valor não pode ser negativo.").nullable(),
  notes: optionalNotes,
});

export const createAppointmentSchema = z
  .object({
    patientId: uuid,
    packageId: uuid.nullable(),
    startsAt: z.date(),
    endsAt: z.date(),
    modality: z.enum(APPOINTMENT_MODALITIES),
    seriesId: uuid.nullable(),
    notes: optionalNotes,
  })
  .refine(
    (value) => value.endsAt > value.startsAt,
    "O término deve ser depois do início.",
  );

export const rescheduleAppointmentSchema = z
  .object({
    startsAt: z.date(),
    endsAt: z.date(),
    notes: optionalNotes,
  })
  .refine(
    (value) => value.endsAt > value.startsAt,
    "O término deve ser depois do início.",
  );

export const makeupAppointmentSchema = z
  .object({
    startsAt: z.date(),
    endsAt: z.date(),
    modality: z.enum(APPOINTMENT_MODALITIES),
    notes: optionalNotes,
  })
  .refine(
    (value) => value.endsAt > value.startsAt,
    "O término deve ser depois do início.",
  );

export const agendaSettingsSchema = z.object({
  defaultDurationMinutes: z
    .number()
    .int()
    .positive("Informe uma duração maior que zero."),
  locationName: z.string().trim().max(200),
  locationAddress: z.string().trim().max(2000),
  reminderSendHour: z.number().int().min(0).max(23, "Informe uma hora entre 0 e 23."),
});

export const statusChangeSchema = z.enum(STATUS_CHANGES_FROM_SCHEDULED);

export function parseCreatePackage(input: unknown): CreatePackageInput {
  return createPackageSchema.parse(input);
}

export function parseCreateAppointment(input: unknown): CreateAppointmentInput {
  return createAppointmentSchema.parse(input);
}

export function parseRescheduleAppointment(input: unknown): RescheduleAppointmentInput {
  return rescheduleAppointmentSchema.parse(input);
}

export function parseMakeupAppointment(input: unknown): MakeupAppointmentInput {
  return makeupAppointmentSchema.parse(input);
}

export function parseAgendaSettings(input: unknown): AgendaSettingsInput {
  return agendaSettingsSchema.parse(input);
}

export function parseStatusChange(input: unknown): StatusChangeFromScheduled {
  return statusChangeSchema.parse(input);
}
