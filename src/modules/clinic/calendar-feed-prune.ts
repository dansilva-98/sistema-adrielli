import type postgres from "postgres";

type Database = postgres.Sql | postgres.TransactionSql;

export async function pruneCalendarFeedRequests(db: Database): Promise<number> {
  const rows = await db<{ total: number }[]>`
    with deleted as (
      delete from clinic.calendar_feed_requests
      where attempted_at < now() - interval '1 day'
      returning 1
    )
    select count(*)::int as total from deleted
  `;
  return Number(rows[0]?.total ?? 0);
}
