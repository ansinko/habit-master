import { getSql } from '../../_lib/db.js';
import { requireUser } from '../../_lib/auth.js';
import {
  getRunOwnedBy, getRunDays, markDay, unmarkDay, runEndDate,
} from '../../_lib/runs.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const userId = await requireUser(req, res);
  if (!userId) return;

  const { date, done } = req.body || {};
  if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'bad date' });

  const sql = getSql();
  // 404 aj pri cudzom behu — neprezrádzame, že existuje.
  const run = await getRunOwnedBy(sql, req.query.id, userId);
  if (!run) return res.status(404).json({ error: 'not found' });

  const today = new Date().toISOString().slice(0, 10);
  if (date > today) return res.status(400).json({ error: 'future date' });
  if (date < run.start_date || date > runEndDate(run)) {
    return res.status(400).json({ error: 'date outside run window' });
  }

  if (done) await markDay(sql, run.id, date);
  else await unmarkDay(sql, run.id, date);

  return res.status(200).json({ days: await getRunDays(sql, run.id) });
}
