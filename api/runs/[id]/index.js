import { getSql } from '../../_lib/db.js';
import { requireUser } from '../../_lib/auth.js';
import { getRunOwnedBy } from '../../_lib/runs.js';

/**
 * Premenovanie bežiacej výzvy. Appka má flow „Change your habit" nad aktívnym
 * behom — keby prechádzal cez POST /api/runs, beh by sa uzavrel ako abandoned
 * a prišiel by o svoje dni. Premenovanie nie je nový beh.
 */
export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'method not allowed' });

  const userId = await requireUser(req, res);
  if (!userId) return;

  const habitName = (req.body?.habitName || '').trim();
  if (!habitName) return res.status(400).json({ error: 'habitName required' });
  if (habitName.length > 120) return res.status(400).json({ error: 'habitName too long' });

  const sql = getSql();
  const run = await getRunOwnedBy(sql, req.query.id, userId);
  if (!run) return res.status(404).json({ error: 'not found' });

  await sql`update run set habit_name = ${habitName} where id = ${run.id}`;
  return res.status(200).json({ run: { ...run, habit_name: habitName } });
}
