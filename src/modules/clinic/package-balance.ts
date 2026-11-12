import type { AppointmentStatus } from "./appointment-status";
import { consumesPackageSession, occupiesPackageSlot } from "./appointment-status";

export function occupiedSessionCount(statuses: readonly AppointmentStatus[]): number {
  return statuses.filter(occupiesPackageSlot).length;
}

export function consumedSessionCount(statuses: readonly AppointmentStatus[]): number {
  return statuses.filter(consumesPackageSession).length;
}

export function remainingSessions(totalSessions: number, occupied: number): number {
  return totalSessions - occupied;
}

export function packageHasSlot(totalSessions: number, occupied: number): boolean {
  return occupied < totalSessions;
}

export function pendingMakeupCount(
  missedNotified: number,
  linkedMakeups: number,
): number {
  return Math.max(0, missedNotified - linkedMakeups);
}
