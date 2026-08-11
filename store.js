/* Komunikácia so serverom a jediné miesto, kde sa index dňa mení na dátum.
   app.js pracuje s indexmi 1..N; databáza drží kalendárne dátumy. */
import { getToken } from './auth.js';

const CACHE_KEY = 'sixty:cache:v1';
const LEGACY_KEY = 'sixty:v2';

export function indexToDate(startDay, index) {
  const d = new Date(startDay + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + index - 1);
  return d.toISOString().slice(0, 10);
}

export function dateToIndex(startDay, date) {
  const a = new Date(startDay + 'T00:00:00Z');
  const b = new Date(date + 'T00:00:00Z');
  return Math.round((b - a) / 86400000) + 1;
}

async function api(path, options = {}) {
  const token = await getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} → ${res.status}`);
  return res.json();
}

function toClientState(run, days) {
  return {
    runId: run.id,
    habit: run.habit_name,
    startDay: run.start_date,
    logged: days.map((d) => dateToIndex(run.start_date, d)),
  };
}

export async function loadState() {
  const { run, days } = await api('/api/state');
  return run ? toClientState(run, days || []) : null;
}

export async function startRun(habitName, startDate) {
  const { run } = await api('/api/runs', {
    method: 'POST',
    body: JSON.stringify(startDate ? { habitName, startDate } : { habitName }),
  });
  return toClientState(run, []);
}

/** Premenovanie bežiacej výzvy. Nie je to nový beh — dni zostávajú. */
export async function renameRun(runId, habitName) {
  await api(`/api/runs/${runId}`, {
    method: 'PATCH',
    body: JSON.stringify({ habitName }),
  });
}

export async function setDay(runId, startDay, index, done) {
  const { days } = await api(`/api/runs/${runId}/days`, {
    method: 'POST',
    body: JSON.stringify({ date: indexToDate(startDay, index), done }),
  });
  return days.map((d) => dateToIndex(startDay, d));
}

export async function loadHistory() {
  const { runs } = await api('/api/runs');
  return runs.map((r) => ({
    habitName: r.habit_name,
    startDate: r.start_date,
    endedAt: r.ended_at,
    goalDays: r.goal_days,
    daysDone: r.days_done,
    status: r.status,
  }));
}

/* Cache existuje len preto, aby appka na mobile nabehla okamžite.
   Zdrojom pravdy je server; cache sa prepíše hneď, ako odpovie. */
export function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function writeCache(state) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    /* storage blokovaný — appka beží ďalej z pamäte */
  }
}

export function hasLegacy() {
  return Boolean(localStorage.getItem(LEGACY_KEY));
}

export function dropLegacy() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* nič — import sa proste ponúkne znova */
  }
}

/**
 * Jednorazový prenos behu z čias, keď appka žila len v localStorage.
 * Vráti nový serverový stav, alebo null, keď niet čo preniesť.
 */
export async function importLegacy() {
  let legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
  } catch {
    return null;
  }
  if (!legacy?.habit || !legacy?.startDay) return null;

  const state = await startRun(legacy.habit, legacy.startDay);
  const days = Array.isArray(legacy.logged) ? legacy.logged : [];
  let logged = state.logged;
  for (const index of days) {
    logged = await setDay(state.runId, state.startDay, index, true);
  }
  dropLegacy();
  return { ...state, logged };
}
