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
  reminderSendHour: z
    .number()
    .int("Informe uma hora entre 0 e 23.")
    .min(0, "Informe uma hora entre 0 e 23.")
    .max(23, "Informe uma hora entre 0 e 23."),
});

export const statusChangeSchema = z.enum(STATUS_CHANGES_FROM_SCHEDULED);

export const cancelReasonSchema = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  })
  .refine(
    (value) => value === null || value.length <= 200,
    "Use no máximo 200 caracteres.",
  );

export function parseCreatePackage(input: unknown): CreatePackageInput {
  return createPackageSchema.parse(input);
}

const optionalPriceSchema = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => value === "" || /^(\d+)(?:[,.](\d{1,2}))?$/.test(value),
    "Informe um valor válido.",
  )
  .transform((value) => {
    if (value === "") return null;
    const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value);
    if (!match) return null;
    const reais = Number(match[1]);
    const fraction = (match[2] ?? "").padEnd(2, "0");
    return reais * 100 + Number(fraction);
  });

export function parseOptionalPriceCents(raw: string): number | null {
  return optionalPriceSchema.parse(raw);
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

export function parseCancelReason(input: unknown): string | null {
  return cancelReasonSchema.parse(input);
}

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Informe um horário válido.");

export const appointmentFormSchema = z.object({
  patientId: uuid,
  date: z.string().refine(isRealDate, "Data inválida."),
  time: timeSchema,
  durationMinutes: z.number().int().positive("Informe uma duração maior que zero."),
  packageId: uuid.nullable(),
  modality: z.enum(APPOINTMENT_MODALITIES),
  notes: optionalNotes,
  weeks: z
    .number()
    .int("Informe o número de semanas.")
    .min(1, "Informe o número de semanas.")
    .max(26, "Use no máximo 26 semanas."),
});

export type AppointmentFormInput = z.infer<typeof appointmentFormSchema>;

export function parseAppointmentForm(input: unknown): AppointmentFormInput {
  return appointmentFormSchema.parse(input);
}

export const rescheduleFormSchema = z.object({
  date: z.string().refine(isRealDate, "Data inválida."),
  time: timeSchema,
  durationMinutes: z.number().int().positive("Informe uma duração maior que zero."),
  notes: optionalNotes,
});

export function parseRescheduleForm(
  input: unknown,
): z.infer<typeof rescheduleFormSchema> {
  return rescheduleFormSchema.parse(input);
}

export const makeupFormSchema = z.object({
  date: z.string().refine(isRealDate, "Data inválida."),
  time: timeSchema,
  durationMinutes: z.number().int().positive("Informe uma duração maior que zero."),
  modality: z.enum(APPOINTMENT_MODALITIES),
  notes: optionalNotes,
});

export function parseMakeupForm(input: unknown): z.infer<typeof makeupFormSchema> {
  return makeupFormSchema.parse(input);
}
