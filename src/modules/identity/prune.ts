import type postgres from "postgres";

type Database = postgres.Sql | postgres.TransactionSql;

export async function pruneLoginAttempts(db: Database): Promise<number> {
  const rows = await db<{ total: number }[]>`
    with deleted as (
      delete from identity.login_attempts
      where attempted_at < now() - interval '30 days'
      returning 1
    )
    select count(*)::int as total from deleted
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function pruneEmailMfaChallenges(db: Database): Promise<number> {
  const rows = await db<{ total: number }[]>`
    with deleted as (
      delete from identity.staff_email_mfa_challenges
      where created_at < now() - interval '1 day'
        and (consumed_at is not null or expires_at < now())
      returning 1
    )
    select count(*)::int as total from deleted
  `;
  return Number(rows[0]?.total ?? 0);
}
