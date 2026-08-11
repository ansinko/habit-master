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

export async function getRunOwnedBy(sql, runId, userId) {
  const rows = await sql`
    select * from run where id = ${runId} and user_id = ${userId} limit 1
  `;
  return rows.length ? serializeRun(rows[0]) : null;
}

export async function closeRun(sql, runId, status, endedAt) {
  await sql`
    update run set status = ${status}, ended_at = ${endedAt} where id = ${runId}
  `;
}

export async function createRun(sql, userId, habitName, startDate) {
  const id = crypto.randomUUID();
  const rows = await sql`
    insert into run (id, user_id, habit_name, start_date, status)
    values (${id}, ${userId}, ${habitName}, ${startDate}, 'active')
    returning *
  `;
  return serializeRun(rows[0]);
}

/** Idempotentné: opakované označenie toho istého dňa nič nezmení a nespadne. */
export async function markDay(sql, runId, date) {
  await sql`
    insert into run_day (id, run_id, date)
    values (${crypto.randomUUID()}, ${runId}, ${date})
    on conflict (run_id, date) do nothing
  `;
}

export async function unmarkDay(sql, runId, date) {
  await sql`delete from run_day where run_id = ${runId} and date = ${date}`;
}

/** Posledný deň kalendárneho okna behu, vrátane. */
export function runEndDate(run) {
  const start = new Date(run.start_date + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() + run.goal_days - 1);
  return start.toISOString().slice(0, 10);
}

export async function listClosedRuns(sql, userId) {
  const rows = await sql`
    select r.*, count(d.id)::int as days_done
    from run r
    left join run_day d on d.run_id = r.id
    where r.user_id = ${userId} and r.status <> 'active'
    group by r.id
    order by r.start_date desc
  `;
  return rows.map((row) => ({ ...serializeRun(row), days_done: row.days_done }));
}

/**
 * Beh je ukotvený v kalendári: keď mu uplynie okno, je hotový bez ohľadu na
 * počet splnených dní. Vyhodnocuje sa lenivo pri čítaní, cron na to nie je.
 */
export async function closeIfExpired(sql, run) {
  const end = runEndDate(run);
  const today = new Date().toISOString().slice(0, 10);
  if (today <= end) return run;
  await closeRun(sql, run.id, 'finished', end);
  return null;
}
