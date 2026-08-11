/** Dátum ako YYYY-MM-DD. Neon vracia `date` stĺpce ako Date alebo string. */
export function isoDate(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function serializeRun(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    habit_name: row.habit_name,
    goal_days: row.goal_days,
    start_date: isoDate(row.start_date),
    status: row.status,
    ended_at: row.ended_at ? isoDate(row.ended_at) : null,
  };
}

export async function getActiveRun(sql, userId) {
  const rows = await sql`
    select * from run where user_id = ${userId} and status = 'active' limit 1
  `;
  return rows.length ? serializeRun(rows[0]) : null;
}

export async function getRunDays(sql, runId) {
  const rows = await sql`
    select date from run_day where run_id = ${runId} order by date asc
  `;
  return rows.map((r) => isoDate(r.date));
}
