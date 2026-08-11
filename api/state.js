import { getSql } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { getActiveRun, getRunDays, closeIfExpired } from './_lib/runs.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const userId = await requireUser(req, res);
  if (!userId) return;

  const sql = getSql();
  let run = await getActiveRun(sql, userId);
  // Behu mohlo medzitým uplynúť kalendárne okno — uzavrie sa lenivo tu.
  if (run) run = await closeIfExpired(sql, run);
  if (!run) return res.status(200).json({ run: null });

  const days = await getRunDays(sql, run.id);
  return res.status(200).json({ run, days });
}
