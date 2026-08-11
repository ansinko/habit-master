import { getSql } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { getActiveRun, createRun, closeRun, listClosedRuns } from './_lib/runs.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const sql = getSql();

  if (req.method === 'GET') {
    return res.status(200).json({ runs: await listClosedRuns(sql, userId) });
  }

  if (req.method === 'POST') {
    const habitName = (req.body?.habitName || '').trim();
    if (!habitName) return res.status(400).json({ error: 'habitName required' });
    if (habitName.length > 120) return res.status(400).json({ error: 'habitName too long' });

    // startDate posiela len import starého localStorage behu; bežný štart je dnes.
    const startDate = req.body?.startDate;
    if (startDate && !DATE_RE.test(startDate)) {
      return res.status(400).json({ error: 'bad startDate' });
    }
    if (startDate && startDate > today()) {
      return res.status(400).json({ error: 'startDate in future' });
    }

    // Nový beh uzavrie ten predchádzajúci — to je celý mechanizmus histórie.
    // Musí sa to stať pred insertom, inak padne parciálny unique index.
    const active = await getActiveRun(sql, userId);
    if (active) await closeRun(sql, active.id, 'abandoned', today());

    const run = await createRun(sql, userId, habitName, startDate || today());
    return res.status(201).json({ run, days: [] });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
