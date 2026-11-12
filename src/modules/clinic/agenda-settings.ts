import type postgres from "postgres";

import { recordAudit } from "@/modules/audit/record";
import { CONSULTORIO_ROLES } from "@/modules/identity/access";
import { assertRole } from "@/modules/identity/server/guard";

import type { AgendaSettingsInput } from "./agenda-schema";
import { ClinicRuleError, type Actor } from "./patients";
import { runClinicTransaction } from "./run-transaction";

type Database = postgres.Sql | postgres.TransactionSql;

export type AgendaSettings = {
  defaultDurationMinutes: number;
  locationName: string;
  locationAddress: string;
  reminderSendHour: number;
  updatedAt: Date | string;
  updatedBy: string | null;
};

function mapSettings(row: {
  default_duration_minutes: number;
  location_name: string;
  location_address: string;
  reminder_send_hour: number;
  updated_at: Date | string;
  updated_by: string | null;
}): AgendaSettings {
  return {
    defaultDurationMinutes: row.default_duration_minutes,
    locationName: row.location_name,
    locationAddress: row.location_address,
    reminderSendHour: row.reminder_send_hour,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function getAgendaSettings(db: Database): Promise<AgendaSettings> {
  await assertRole(CONSULTORIO_ROLES);
  const rows = await db<Parameters<typeof mapSettings>[0][]>`
    select
      default_duration_minutes,
      location_name,
      location_address,
      reminder_send_hour,
      updated_at,
      updated_by
    from clinic.settings
    where id = 1
  `;
  if (!rows[0]) throw new ClinicRuleError("not-found");
  return mapSettings(rows[0]);
}

export async function updateAgendaSettings(
  db: postgres.Sql,
  actor: Actor,
  input: AgendaSettingsInput,
): Promise<AgendaSettings> {
  await assertRole(CONSULTORIO_ROLES);
  return runClinicTransaction(db, async (tx) => {
    const rows = await tx<Parameters<typeof mapSettings>[0][]>`
      update clinic.settings
      set
        default_duration_minutes = ${input.defaultDurationMinutes},
        location_name = ${input.locationName},
        location_address = ${input.locationAddress},
        reminder_send_hour = ${input.reminderSendHour},
        updated_by = ${actor.userId}::uuid
      where id = 1
      returning
        default_duration_minutes,
        location_name,
        location_address,
        reminder_send_hour,
        updated_at,
        updated_by
    `;
    if (!rows[0]) throw new ClinicRuleError("not-found");
    await recordAudit(
      {
        action: "clinic.settings.updated",
        actorUserId: actor.userId,
        entityType: "settings",
        entityId: null,
        ip: actor.ip,
        metadata: {},
      },
      tx,
    );
    return mapSettings(rows[0]);
  });
}
