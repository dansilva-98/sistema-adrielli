import { todayInClinic } from "./format";

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "completed",
  "missed_notified",
  "missed_unnotified",
  "cancelled",
  "rescheduled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_MODALITIES = ["in_person", "online"] as const;

export type AppointmentModality = (typeof APPOINTMENT_MODALITIES)[number];

export const PACKAGE_OCCUPIED_STATUSES = [
  "scheduled",
  "completed",
  "missed_unnotified",
] as const;

export type PackageOccupiedStatus = (typeof PACKAGE_OCCUPIED_STATUSES)[number];

export const PACKAGE_CONSUMED_STATUSES = ["completed", "missed_unnotified"] as const;

export const STATUS_CHANGES_FROM_SCHEDULED = [
  "completed",
  "missed_notified",
  "missed_unnotified",
  "cancelled",
] as const;

export type StatusChangeFromScheduled = (typeof STATUS_CHANGES_FROM_SCHEDULED)[number];

export const UNDOABLE_STATUSES = [
  "completed",
  "missed_notified",
  "missed_unnotified",
  "cancelled",
] as const;

export type UndoableStatus = (typeof UNDOABLE_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Marcada",
  completed: "Realizada",
  missed_notified: "Faltou (avisou)",
  missed_unnotified: "Faltou (sem aviso)",
  cancelled: "Cancelada",
  rescheduled: "Remarcada",
};

export const APPOINTMENT_MODALITY_LABELS: Record<AppointmentModality, string> = {
  in_person: "Presencial",
  online: "Online",
};

const fromScheduled = new Set<string>(STATUS_CHANGES_FROM_SCHEDULED);
const occupied = new Set<string>(PACKAGE_OCCUPIED_STATUSES);
const consumed = new Set<string>(PACKAGE_CONSUMED_STATUSES);

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function canChangeAppointmentStatus(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return from === "scheduled" && fromScheduled.has(to);
}

export function occupiesPackageSlot(status: AppointmentStatus): boolean {
  return occupied.has(status);
}

export function consumesPackageSession(status: AppointmentStatus): boolean {
  return consumed.has(status);
}

const undoable = new Set<string>(UNDOABLE_STATUSES);

export function canUndoAppointmentStatus(from: AppointmentStatus): boolean {
  return undoable.has(from);
}

export function sameClinicDay(left: Date, right: Date): boolean {
  return todayInClinic(left) === todayInClinic(right);
}

export function canShowUndo(
  status: AppointmentStatus,
  statusChangedAt: Date | string | null,
  now = new Date(),
  hasActiveMakeup = false,
): boolean {
  if (hasActiveMakeup && status === "missed_notified") return false;
  if (!canUndoAppointmentStatus(status) || !statusChangedAt) return false;
  const changed =
    statusChangedAt instanceof Date ? statusChangedAt : new Date(statusChangedAt);
  if (Number.isNaN(changed.getTime())) return false;
  return sameClinicDay(changed, now);
}

export function canOfferMakeup(
  status: AppointmentStatus,
  hasActiveMakeup: boolean,
): boolean {
  return status === "missed_notified" && !hasActiveMakeup;
}
