# Habit Master — prihlásenie a história behov: implementačný plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habit Master dostane prihlásenie a serverové úložisko, takže výzva prežije zariadenie a uzavreté behy sa zachovajú ako história.

**Architecture:** `index.html` a `app.js` zostávajú vanilla. Pribudne adresár `api/` s Vercel Functions nad Neon Postgresom a dva nové browser moduly: `auth.js` (Clerk) a `store.js` (komunikácia so serverom). `app.js` sa mení len v štyroch funkciách — `load`, `save`, `toggle`, `reset` — všetko ostatné, vrátane celého renderu a animácií, sa nedotýka.

**Tech Stack:** Vanilla JS (ES5 štýl v `app.js`, ESM v nových moduloch), Vercel Functions (Node 24), Neon Postgres cez `@neondatabase/serverless`, Clerk (`@clerk/clerk-js` v prehliadači, `@clerk/backend` na serveri).

## Global Constraints

- **Repo:** `~/home-tools/websites/habit-master`. Vercel projekt `habit-master`, produkcia https://habit-master-gilt.vercel.app
- **Špecifikácia:** `docs/2026-08-11-login-a-historia-design.md` — pri rozpore rozhoduje ona.
- **`app.js` interne pracuje s indexmi dní 1..66, nie s dátumami.** Konverzia index ↔ dátum patrí výhradne do `store.js`. Renderovacia logika sa nesmie prepisovať na dátumy.
- **`run_day.date` je kalendárny dátum** (`date` typ), nikdy nie index. Toto je podmienka neskoršieho prepojenia so Stewardom.
- **Beh sa končí kalendárom, nie počtom splnených dní.** `finished` = uplynulo okno `start_date .. start_date + goal_days - 1`. `abandoned` = používateľ založil nový beh predčasne.
- **Jeden aktívny beh na používateľa**, vynútené parciálnym unique indexom v DB, nie len v kóde.
- **Každý endpoint v `api/` vyžaduje platný Clerk token.** Bez neho 401, vrátane `GET /api/state`.
- **`goal_days` je 66** pre všetky nové behy (`CONFIG.goalDays` v `app.js:14`), ale stĺpec v DB existuje.
- **Nové súbory v `api/` a browser moduly píš v ESM.** `app.js` nechaj v jeho súčasnom ES5 štýle — nemiešaj štýly v jednom súbore.
- **Commituj po každej úlohe**, správa v štýle repa: `feat: …`, `fix: …`, `docs: …`, bez tela, bez podpisu.

---

## Štruktúra súborov

**Nové — server:**
- `package.json` — závislosti a `"type": "module"`. Repo dnes žiadny nemá.
- `schema.sql` — DDL, aplikuje sa raz ručne.
- `api/_lib/db.js` — Neon klient. Súbory s prefixom `_` Vercel nepublikuje ako endpointy.
- `api/_lib/auth.js` — overenie Clerk tokenu → `userId`.
- `api/_lib/runs.js` — všetky SQL dotazy nad `run` a `run_day`. Jediné miesto, kde sa píše SQL.
- `api/state.js` — `GET /api/state`
- `api/runs.js` — `GET /api/runs` (história) + `POST /api/runs` (nový beh)
- `api/runs/[id]/days.js` — `POST /api/runs/:id/days`

**Nové — prehliadač:**
- `auth.js` — inicializácia Clerku, prihlasovacia brána, `getToken()`
- `store.js` — volania API, konverzia index ↔ dátum, `localStorage` cache
- `history.js` — vykreslenie histórie

**Nové — overovanie:**
- `scripts/smoke.sh` — smoke test proti nasadenej URL

**Menené:**
- `index.html` — Clerk skript, prihlasovacia brána, sekcia histórie
- `app.js` — `load` (`:85`), `save` (`:105`), `toggle` (`:204`), `reset` (`:258`)

---

### Task 1: Provizionovanie Clerku, Neonu a schémy

**Files:**
- Create: `package.json`
- Create: `schema.sql`
- Modify: `.gitignore`

**Interfaces:**
- Produces: env premenné `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `DATABASE_URL` v `.env.local`; tabuľky `run` a `run_day` v Neone.

> **Táto úloha vyžaduje účet používateľa.** `vercel integration add` otvára potvrdenie v prehliadači a Clerk pozvánky sa nastavujú v Clerk dashboarde. Keď CLI čaká na akciu v prehliadači, zastav sa a požiadaj používateľa, aby ju dokončil.

- [ ] **Step 1: Prepoj repo s Vercel projektom**

```bash
cd ~/home-tools/websites/habit-master
vercel link --yes
```

Očakávané: vznikne `.vercel/project.json` s `"projectName":"habit-master"`. `.vercel` je už v `.gitignore`.

- [ ] **Step 2: Nainštaluj Clerk**

```bash
vercel integration add clerk --yes --no-claim
```

Ak CLI odovzdá riadenie do prehliadača, **zastav sa a požiadaj používateľa**, nech inštaláciu dokončí, a potom pokračuj.

- [ ] **Step 3: Nainštaluj Neon**

```bash
vercel integration add neon --yes --no-claim
```

Rovnaké pravidlo pri odovzdaní do prehliadača.

- [ ] **Step 4: Stiahni env premenné a over, že tam sú**

```bash
vercel env pull .env.local --yes
grep -c 'CLERK_SECRET_KEY\|DATABASE_URL' .env.local
```

Očakávané: `2` alebo viac. Ak chýba `DATABASE_URL`, Neon integrácia sa nedokončila — vráť sa na krok 3.

- [ ] **Step 5: Vytvor `package.json`**

```json
{
  "name": "habit-master",
  "private": true,
  "type": "module",
  "dependencies": {
    "@clerk/backend": "^2.0.0",
    "@neondatabase/serverless": "^1.0.2"
  }
}
```

- [ ] **Step 6: Nainštaluj závislosti**

```bash
npm install
```

Očakávané: vznikne `package-lock.json` a `node_modules/`.

- [ ] **Step 7: Pridaj `node_modules` a `.env.local` do `.gitignore`**

Do `.gitignore` doplň na koniec:

```
node_modules/
.env.local
```

- [ ] **Step 8: Napíš `schema.sql`**

```sql
create table if not exists run (
  id         text primary key,
  user_id    text not null,
  habit_name text not null,
  goal_days  int  not null default 66,
  start_date date not null,
  status     text not null check (status in ('active','finished','abandoned')),
  ended_at   date,
  created_at timestamptz not null default now()
);

-- Jeden aktívny beh na používateľa. Parciálny index, nie aplikačná kontrola.
create unique index if not exists run_one_active_per_user
  on run (user_id) where status = 'active';

create index if not exists run_user_status on run (user_id, status);

create table if not exists run_day (
  id     text primary key,
  run_id text not null references run(id) on delete cascade,
  date   date not null,
  unique (run_id, date)
);

create index if not exists run_day_run on run_day (run_id);
```

- [ ] **Step 9: Aplikuj schému na Neon**

```bash
source <(grep -v '^#' .env.local | sed 's/^/export /') && psql "$DATABASE_URL" -f schema.sql
```

Ak `psql` nie je nainštalované, použi Neon SQL editor vo Vercel dashboarde a vlož obsah `schema.sql`.

- [ ] **Step 10: Over, že tabuľky existujú**

```bash
source <(grep -v '^#' .env.local | sed 's/^/export /') && psql "$DATABASE_URL" -c "\dt"
```

Očakávané: v zozname sú `run` a `run_day`.

- [ ] **Step 11: Nastav Clerk na pozvánky**

Požiadaj používateľa, aby v Clerk dashboarde prepol **Restrictions → Sign-up mode** na **Restricted** a pridal svoju e-mailovú adresu medzi *Allowlist*. Bez toho sa vie zaregistrovať ktokoľvek.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json schema.sql .gitignore
git commit -m "feat: clerk a neon provizionovanie, schema behov"
```

---

### Task 2: Autentifikácia a `GET /api/state` pre prázdny stav

**Files:**
- Create: `api/_lib/db.js`
- Create: `api/_lib/auth.js`
- Create: `api/_lib/runs.js`
- Create: `api/state.js`
- Create: `scripts/smoke.sh`

**Interfaces:**
- Consumes: `DATABASE_URL`, `CLERK_SECRET_KEY` z Tasku 1.
- Produces:
  - `getSql(): NeonQueryFunction` — z `api/_lib/db.js`
  - `requireUser(req, res): Promise<string | null>` — z `api/_lib/auth.js`; vráti `userId`, alebo pošle 401 a vráti `null`
  - `getActiveRun(sql, userId): Promise<Run | null>` a `getRunDays(sql, runId): Promise<string[]>` — z `api/_lib/runs.js`
  - Tvar `Run`: `{ id, user_id, habit_name, goal_days, start_date, status, ended_at }`, kde `start_date` a `ended_at` sú reťazce `YYYY-MM-DD`
  - `GET /api/state` → `{ run: null }` alebo `{ run: {...}, days: ["2026-08-11", ...] }`

- [ ] **Step 1: Napíš smoke test, ktorý zlyhá**

Vytvor `scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
# Smoke test proti nasadenej URL.
#   BASE=https://... TOKEN=<clerk session token> ./scripts/smoke.sh
# TOKEN sa získa v prehliadači: await window.Clerk.session.getToken()
set -uo pipefail

BASE="${BASE:?nastav BASE}"
TOKEN="${TOKEN:-}"
fails=0

check() { # check <popis> <ocakavany kod> <skutocny kod>
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1 — cakal $2, dostal $3"
    fails=$((fails + 1))
  fi
}

code() { # code <metoda> <cesta> [tokenom?] [telo]
  local method="$1" path="$2" auth="$3" body="${4:-}"
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "$BASE$path")
  [ "$auth" = "auth" ] && args+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  curl "${args[@]}"
}

echo "== auth =="
check "GET /api/state bez tokenu → 401" 401 "$(code GET /api/state noauth)"

echo
if [ "$fails" -gt 0 ]; then echo "$fails zlyhani"; exit 1; fi
echo "vsetko ok"
```

```bash
chmod +x scripts/smoke.sh
```

- [ ] **Step 2: Spusti smoke test a over, že zlyhá**

```bash
BASE=https://habit-master-gilt.vercel.app ./scripts/smoke.sh
```

Očakávané: `FAIL GET /api/state bez tokenu → 401 — cakal 401, dostal 404` (endpoint zatiaľ neexistuje).

- [ ] **Step 3: Napíš `api/_lib/db.js`**

```js
import { neon } from '@neondatabase/serverless';

let cached = null;

/** Neon klient. Lenivo, nech import súboru nespadne, keď DATABASE_URL chýba. */
export function getSql() {
  if (!cached) cached = neon(process.env.DATABASE_URL);
  return cached;
}
```

- [ ] **Step 4: Napíš `api/_lib/auth.js`**

```js
import { verifyToken } from '@clerk/backend';

/**
 * Overí Clerk session token z hlavičky Authorization.
 * Vráti userId, alebo pošle 401 a vráti null — volajúci sa vtedy hneď vracia.
 */
export async function requireUser(req, res) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  try {
    const claims = await verifyToken(match[1], {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    return claims.sub;
  } catch {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
}
```

- [ ] **Step 5: Napíš `api/_lib/runs.js`**

```js
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
```

- [ ] **Step 6: Napíš `api/state.js`**

```js
import { getSql } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { getActiveRun, getRunDays } from './_lib/runs.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const userId = await requireUser(req, res);
  if (!userId) return;

  const sql = getSql();
  const run = await getActiveRun(sql, userId);
  if (!run) return res.status(200).json({ run: null });

  const days = await getRunDays(sql, run.id);
  return res.status(200).json({ run, days });
}
```

- [ ] **Step 7: Nasaď preview a spusti smoke test**

```bash
vercel deploy
BASE=<preview URL z výstupu> ./scripts/smoke.sh
```

Očakávané: `ok GET /api/state bez tokenu → 401`, skript skončí s `vsetko ok`.

- [ ] **Step 8: Commit**

```bash
git add api scripts/smoke.sh
git commit -m "feat: clerk auth a GET /api/state"
```

---

### Task 3: `POST /api/runs` — založenie behu

**Files:**
- Create: `api/runs.js`
- Modify: `api/_lib/runs.js`
- Modify: `scripts/smoke.sh`

**Interfaces:**
- Consumes: `requireUser`, `getSql`, `getActiveRun`, `isoDate` z Tasku 2.
- Produces:
  - `closeRun(sql, runId, status, endedAt): Promise<void>` — z `api/_lib/runs.js`, `status` je `'finished'` alebo `'abandoned'`
  - `createRun(sql, userId, habitName, startDate): Promise<Run>` — z `api/_lib/runs.js`
  - `POST /api/runs` s telom `{ habitName }` → 201 `{ run, days: [] }`

- [ ] **Step 1: Pridaj do smoke testu prípad, ktorý zlyhá**

Do `scripts/smoke.sh` pred záverečný `if [ "$fails" -gt 0 ]` vlož:

```bash
echo "== zalozenie behu =="
check "POST /api/runs bez tokenu → 401" 401 "$(code POST /api/runs noauth '{"habitName":"beh"}')"
if [ -n "$TOKEN" ]; then
  check "POST /api/runs s tokenom → 201" 201 "$(code POST /api/runs auth '{"habitName":"smoke habit"}')"
  check "POST /api/runs bez habitName → 400" 400 "$(code POST /api/runs auth '{}')"
fi
```

- [ ] **Step 2: Spusti a over, že zlyhá**

```bash
BASE=<preview URL> TOKEN=<token> ./scripts/smoke.sh
```

Očakávané: prípady pre `/api/runs` hlásia `dostal 404`.

- [ ] **Step 3: Doplň `api/_lib/runs.js`**

Na koniec súboru pridaj:

```js
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
```

`serializeRun` je v tom istom súbore z Tasku 2 — nechaj ju neexportovanú.

- [ ] **Step 4: Napíš `api/runs.js`**

```js
import { getSql } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { getActiveRun, createRun, closeRun } from './_lib/runs.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const userId = await requireUser(req, res);
  if (!userId) return;

  const sql = getSql();

  if (req.method === 'POST') {
    const habitName = (req.body?.habitName || '').trim();
    if (!habitName) return res.status(400).json({ error: 'habitName required' });
    if (habitName.length > 120) return res.status(400).json({ error: 'habitName too long' });

    // Nový beh uzavrie ten predchádzajúci — to je celý mechanizmus histórie.
    const active = await getActiveRun(sql, userId);
    if (active) await closeRun(sql, active.id, 'abandoned', today());

    const run = await createRun(sql, userId, habitName, today());
    return res.status(201).json({ run, days: [] });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
```

- [ ] **Step 5: Napíš `api/runs/[id]/index.js` — premenovanie behu**

`app.js` má flow „Change your habit" (`composerLabel` na `:555`), ktorý mení názov **bežiacej** výzvy. Bez tohto endpointu by premenovanie muselo prejsť cez `POST /api/runs`, čo by bežiaci beh uzavrelo ako `abandoned` a zahodilo by jeho dni. Premenovanie nie je nový beh.

```js
import { getSql } from '../../_lib/db.js';
import { requireUser } from '../../_lib/auth.js';
import { getRunOwnedBy } from '../../_lib/runs.js';

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
```

`getRunOwnedBy` pochádza z Tasku 4 — ak sa úlohy robia v poradí, v tomto bode ešte neexistuje. Presuň jej definíciu z Tasku 4, kroku 3 sem, do `api/_lib/runs.js`:

```js
export async function getRunOwnedBy(sql, runId, userId) {
  const rows = await sql`
    select * from run where id = ${runId} and user_id = ${userId} limit 1
  `;
  return rows.length ? serializeRun(rows[0]) : null;
}
```

- [ ] **Step 6: Nasaď a spusti smoke test**

```bash
vercel deploy
BASE=<preview URL> TOKEN=<token> ./scripts/smoke.sh
```

Očakávané: všetky tri nové prípady `ok`.

- [ ] **Step 7: Over v databáze, že druhý beh uzavrel prvý**

```bash
source <(grep -v '^#' .env.local | sed 's/^/export /') && \
  psql "$DATABASE_URL" -c "select habit_name, status, start_date, ended_at from run order by created_at"
```

Očakávané: skoršie behy majú `status = abandoned` a vyplnený `ended_at`, presne jeden má `active`.

- [ ] **Step 8: Commit**

```bash
git add api/runs.js api/runs/ api/_lib/runs.js scripts/smoke.sh
git commit -m "feat: POST /api/runs zaklada beh, PATCH ho premenuje"
```

---

### Task 4: `POST /api/runs/:id/days` — označenie a odznačenie dňa

**Files:**
- Create: `api/runs/[id]/days.js`
- Modify: `api/_lib/runs.js`
- Modify: `scripts/smoke.sh`

**Interfaces:**
- Consumes: `requireUser`, `getSql`, `isoDate`, `getRunDays` z Tasku 2; `getRunOwnedBy` z Tasku 3.
- Produces:
  - `markDay(sql, runId, date): Promise<void>` a `unmarkDay(sql, runId, date): Promise<void>`
  - `runEndDate(run): string` — posledný deň kalendárneho okna behu
  - `POST /api/runs/:id/days` s telom `{ date, done }` → 200 `{ days: [...] }`

- [ ] **Step 1: Pridaj do smoke testu prípady, ktoré zlyhajú**

Do `scripts/smoke.sh` pred záverečný `if` vlož:

```bash
echo "== oznacovanie dni =="
if [ -n "$TOKEN" ]; then
  RUN_ID=$(curl -s -X POST "$BASE/api/runs" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d '{"habitName":"smoke dni"}' \
    | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  TODAY=$(date +%F)
  check "oznacenie dna → 200" 200 \
    "$(code POST "/api/runs/$RUN_ID/days" auth "{\"date\":\"$TODAY\",\"done\":true}")"
  check "opakovane oznacenie → 200 (idempotencia)" 200 \
    "$(code POST "/api/runs/$RUN_ID/days" auth "{\"date\":\"$TODAY\",\"done\":true}")"
  check "odznacenie → 200" 200 \
    "$(code POST "/api/runs/$RUN_ID/days" auth "{\"date\":\"$TODAY\",\"done\":false}")"
  check "datum v buducnosti → 400" 400 \
    "$(code POST "/api/runs/$RUN_ID/days" auth '{"date":"2099-01-01","done":true}')"
  check "cudzi run_id → 404" 404 \
    "$(code POST "/api/runs/00000000-0000-0000-0000-000000000000/days" auth "{\"date\":\"$TODAY\",\"done\":true}")"
fi
```

- [ ] **Step 2: Spusti a over, že zlyhá**

```bash
BASE=<preview URL> TOKEN=<token> ./scripts/smoke.sh
```

Očakávané: nové prípady hlásia `dostal 404`.

- [ ] **Step 3: Doplň `api/_lib/runs.js`**

Na koniec súboru pridaj:

`getRunOwnedBy` už v súbore je — pridal ju Task 3, krok 5. Nepridávaj ju druhýkrát.

```js
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
```

- [ ] **Step 4: Napíš `api/runs/[id]/days.js`**

```js
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
```

- [ ] **Step 5: Nasaď a spusti smoke test**

```bash
vercel deploy
BASE=<preview URL> TOKEN=<token> ./scripts/smoke.sh
```

Očakávané: všetkých päť nových prípadov `ok`.

- [ ] **Step 6: Commit**

```bash
git add api scripts/smoke.sh
git commit -m "feat: oznacovanie dni behu, idempotentne"
```

---

### Task 5: `GET /api/runs` — história a lenivé uzavretie behu

**Files:**
- Modify: `api/runs.js`
- Modify: `api/state.js`
- Modify: `api/_lib/runs.js`
- Modify: `scripts/smoke.sh`

**Interfaces:**
- Consumes: `runEndDate`, `closeRun`, `getActiveRun` z Taskov 3–4.
- Produces:
  - `listClosedRuns(sql, userId): Promise<Array<Run & { days_done: number }>>`
  - `GET /api/runs` → `{ runs: [...] }`, najnovší prvý
  - `GET /api/state` uzavrie beh, ktorému uplynulo okno, a vráti `{ run: null }`

- [ ] **Step 1: Pridaj do smoke testu prípad, ktorý zlyhá**

Do `scripts/smoke.sh` pred záverečný `if` vlož:

```bash
echo "== historia =="
check "GET /api/runs bez tokenu → 401" 401 "$(code GET /api/runs noauth)"
if [ -n "$TOKEN" ]; then
  check "GET /api/runs s tokenom → 200" 200 "$(code GET /api/runs auth)"
  body=$(curl -s "$BASE/api/runs" -H "Authorization: Bearer $TOKEN")
  case "$body" in
    *'"days_done"'*) echo "  ok   historia obsahuje days_done" ;;
    *) echo "  FAIL historia neobsahuje days_done: $body"; fails=$((fails + 1)) ;;
  esac
fi
```

- [ ] **Step 2: Spusti a over, že zlyhá**

```bash
BASE=<preview URL> TOKEN=<token> ./scripts/smoke.sh
```

Očakávané: `GET /api/runs s tokenom → 200` hlási `dostal 405` (súbor existuje, metóda nie).

- [ ] **Step 3: Doplň `api/_lib/runs.js`**

Na koniec súboru pridaj:

```js
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
```

- [ ] **Step 4: Doplň `GET` do `api/runs.js`**

V `api/runs.js` uprav import a pridaj vetvu pre `GET` pred vetvu `POST`:

```js
import { getActiveRun, createRun, closeRun, listClosedRuns } from './_lib/runs.js';
```

```js
  if (req.method === 'GET') {
    return res.status(200).json({ runs: await listClosedRuns(sql, userId) });
  }
```

- [ ] **Step 5: Zapoj lenivé uzavretie do `api/state.js`**

Uprav `api/state.js`:

```js
import { getSql } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';
import { getActiveRun, getRunDays, closeIfExpired } from './_lib/runs.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const userId = await requireUser(req, res);
  if (!userId) return;

  const sql = getSql();
  let run = await getActiveRun(sql, userId);
  if (run) run = await closeIfExpired(sql, run);
  if (!run) return res.status(200).json({ run: null });

  const days = await getRunDays(sql, run.id);
  return res.status(200).json({ run, days });
}
```

- [ ] **Step 6: Nasaď a spusti smoke test**

```bash
vercel deploy
BASE=<preview URL> TOKEN=<token> ./scripts/smoke.sh
```

Očakávané: všetko `ok`.

- [ ] **Step 7: Over lenivé uzavretie na starom behu**

```bash
source <(grep -v '^#' .env.local | sed 's/^/export /') && \
  psql "$DATABASE_URL" -c "update run set start_date = current_date - 200 where status = 'active'"
curl -s "$BASE/api/state" -H "Authorization: Bearer $TOKEN"
```

Očakávané: odpoveď `{"run":null}`, a v DB má ten beh `status = finished` s `ended_at` na konci okna:

```bash
psql "$DATABASE_URL" -c "select status, start_date, ended_at from run order by created_at desc limit 1"
```

- [ ] **Step 8: Commit**

```bash
git add api scripts/smoke.sh
git commit -m "feat: historia behov a lenive uzavretie po uplynuti okna"
```

---

### Task 6: Prihlásenie v prehliadači

**Files:**
- Create: `auth.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` z Tasku 1.
- Produces:
  - `initAuth(): Promise<boolean>` — z `auth.js`; vráti `true`, keď je používateľ prihlásený
  - `getToken(): Promise<string | null>` — session token pre volania API
  - `signOut(): Promise<void>`

- [ ] **Step 1: Zisti publishable key**

```bash
grep CLERK_PUBLISHABLE .env.local
```

Hodnota začína `pk_test_` alebo `pk_live_`. Je to verejný kľúč, patrí do klientskeho kódu.

- [ ] **Step 2: Napíš `auth.js`**

```js
/* Clerk v prehliadači. Appka sa nevykreslí, kým nevieme, kto je prihlásený. */
const PUBLISHABLE_KEY = 'pk_test_NAHRAD_HODNOTOU_Z_ENV';

let clerk = null;

export async function initAuth() {
  const Clerk = window.Clerk;
  clerk = new Clerk(PUBLISHABLE_KEY);
  await clerk.load();
  return Boolean(clerk.user);
}

export function mountSignIn(node) {
  clerk.mountSignIn(node);
}

export async function getToken() {
  if (!clerk?.session) return null;
  return clerk.session.getToken();
}

export async function signOut() {
  await clerk.signOut();
  location.reload();
}
```

Nahraď `PUBLISHABLE_KEY` skutočnou hodnotou z kroku 1.

- [ ] **Step 3: Pridaj Clerk skript a bránu do `index.html`**

Do `<head>`, za `<link>` s fontmi:

```html
<script
  async
  crossorigin="anonymous"
  data-clerk-publishable-key="pk_test_NAHRAD_HODNOTOU_Z_ENV"
  src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
  type="text/javascript"
></script>
```

Na začiatok `<body>`, pred existujúci obsah:

```html
<div id="authGate" style="position:fixed;inset:0;z-index:200;background:#0A0A0A;display:flex;align-items:center;justify-content:center">
  <div id="signIn"></div>
</div>
```

- [ ] **Step 4: Over prihlasovaciu bránu v prehliadači**

Nasaď a otvor preview URL:

```bash
vercel deploy
```

Očakávané: zobrazí sa Clerk prihlasovací formulár cez celú obrazovku. Po prihlásení zostane brána (odstráni ju až Task 7) — dôležité je, že sa formulár vykreslí a prihlásenie prejde.

- [ ] **Step 5: Over, že sign-up je obmedzený**

V anonymnom okne skús registráciu s e-mailom, ktorý nie je v allowliste.

Očakávané: Clerk registráciu odmietne. Ak prejde, vráť sa na Task 1, krok 11.

- [ ] **Step 6: Commit**

```bash
git add auth.js index.html
git commit -m "feat: prihlasenie cez clerk"
```

---

### Task 7: `store.js` — server ako zdroj pravdy

**Files:**
- Create: `store.js`

**Interfaces:**
- Consumes: `getToken` z Tasku 6; endpointy z Taskov 2–5.
- Produces (všetko z `store.js`):
  - `loadState(): Promise<{ habit, startDay, logged, runId } | null>` — `logged` sú **indexy dní**, konvertované z dátumov
  - `startRun(habitName): Promise<{ habit, startDay, logged, runId }>` (Task 9 jej pridá druhý parameter `startDate`)
  - `renameRun(runId, habitName): Promise<void>`
  - `setDay(runId, startDay, index, done): Promise<number[]>` — vráti nové `logged` ako indexy
  - `loadHistory(): Promise<Array<{ habitName, startDate, endedAt, goalDays, daysDone, status }>>`
  - `readCache(): object | null` a `writeCache(state): void`
  - `indexToDate(startDay, index): string` a `dateToIndex(startDay, date): number`

- [ ] **Step 1: Napíš `store.js`**

```js
/* Komunikácia so serverom a jediné miesto, kde sa index dňa mení na dátum.
   app.js pracuje s indexmi 1..N; databáza drží kalendárne dátumy. */
import { getToken } from './auth.js';

const CACHE_KEY = 'sixty:cache:v1';

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

export async function startRun(habitName) {
  const { run } = await api('/api/runs', {
    method: 'POST',
    body: JSON.stringify({ habitName }),
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
```

- [ ] **Step 2: Over konverziu dátumov v konzole prehliadača**

Nasaď a v konzole preview URL spusti:

```js
const s = await import('./store.js');
s.indexToDate('2026-08-11', 1);   // '2026-08-11'
s.indexToDate('2026-08-11', 66);  // '2026-10-15'
s.dateToIndex('2026-08-11', '2026-10-15'); // 66
```

Očakávané: presne uvedené hodnoty. Ak sedia, konverzia je symetrická a prežije prechod na letný/zimný čas (počíta sa v UTC).

- [ ] **Step 3: Commit**

```bash
git add store.js
git commit -m "feat: store.js ako vrstva medzi app.js a serverom"
```

---

### Task 8: Zapojenie `app.js` na server

**Files:**
- Modify: `app.js:85-111` (`load`, `save`), `app.js:204-242` (`toggle`), `app.js:258-268` (`reset`), `app.js:176-189` (`begin`)
- Modify: `index.html`

**Interfaces:**
- Consumes: `store.js` a `auth.js` z Taskov 6–7.
- Produces: `app.js`, ktorý číta stav zo servera a zapisuje doň, s `state.runId` ako novým poľom.

> `app.js` je v ES5 štýle a beží ako IIFE. Aby mohol používať ESM moduly, `index.html` ho načíta ako `type="module"` a moduly sa mu odovzdajú cez `window.HM`. Nemeň štýl kódu vnútri `app.js`.

- [ ] **Step 1: Sprístupni moduly a spusti appku až po prihlásení**

V `index.html` nahraď existujúci `<script src="app.js"></script>` týmto:

```html
<script type="module">
  import { initAuth, mountSignIn, getToken, signOut } from './auth.js';
  import * as store from './store.js';

  const signedIn = await initAuth();
  const gate = document.getElementById('authGate');
  if (!signedIn) {
    mountSignIn(document.getElementById('signIn'));
  } else {
    gate.remove();
    window.HM = { store, getToken, signOut };
    await import('./app.js');
  }
</script>
```

- [ ] **Step 2: Pridaj `runId` do stavu**

V `app.js` v objekte `state` (`:30`) pridaj za `startDay`:

```js
    runId: null,
```

- [ ] **Step 3: Prepíš `load()` a `save()`**

Nahraď celé telá `load()` (`:85`) a `save()` (`:105`):

```js
  function applyState(s) {
    state.runId = s ? s.runId : null;
    state.habit = s ? s.habit : '';
    state.startDay = s ? s.startDay : null;
    state.logged = s ? s.logged.slice() : [];
  }

  // Cache len na okamžité vykreslenie; server prepíše, len čo odpovie.
  function load() {
    applyState(window.HM.store.readCache());
  }

  function save() {
    window.HM.store.writeCache({
      runId: state.runId, habit: state.habit,
      startDay: state.startDay, logged: state.logged
    });
  }

  function refreshFromServer() {
    return window.HM.store.loadState().then(function (s) {
      applyState(s);
      save();
      render();
    }).catch(function () {
      toast('Offline — zobrazujem poslednú známu verziu.');
    });
  }
```

- [ ] **Step 4: Prepíš `toggle()` tak, aby zapisovala na server**

V `toggle(n)` (`:204`) nechaj celú optimistickú časť, ktorá mení `state.logged` a volá `render()`, a **za** ňu, pred koniec funkcie, pridaj:

> `toggle` už má na `:206` premennú `var wasDone = set.has(n);`, zachytenú **pred** tým, než sa `set` zmutuje. Použi ju. **Nedeklaruj ju znova** — druhé `var wasDone` v tej istej funkcii by tichý prepísalo správnu hodnotu.

```js
    window.HM.store.setDay(state.runId, state.startDay, n, !wasDone)
      .then(function (logged) {
        state.logged = logged;
        save();
      })
      .catch(function () {
        // Deň sa nesmie stratiť ticho — vráť políčko a povedz to.
        state.logged = wasDone
          ? state.logged.concat([n])
          : state.logged.filter(function (x) { return x !== n; });
        save();
        render();
        toast('Nepodarilo sa uložiť. Skús znova.');
      });
```

- [ ] **Step 5: Prepíš `begin()` — rozlíš premenovanie od nového behu**

`begin()` (`:176`) obsluhuje **dva** rôzne úmysly a rozlišuje ich premennou `wasEditing` (`:182`): buď zakladáš prvú výzvu, alebo meníš názov tej bežiacej cez „Change your habit". Keby oba prípady volali `startRun`, premenovanie by bežiaci beh uzavrelo ako `abandoned` a zahodilo jeho dni.

Nahraď riadky `state.habit = v;` až `toast(...)` týmto:

```js
    state.editing = false;

    // Premenovanie bežiacej výzvy — beh pokračuje, mení sa len názov.
    if (wasEditing && state.runId) {
      var previous = state.habit;
      state.habit = v;
      render();
      window.HM.store.renameRun(state.runId, v).then(function () {
        save();
        toast('Saved.');
      }).catch(function () {
        state.habit = previous;
        render();
        toast('Nepodarilo sa premenovať. Skús znova.');
      });
      return;
    }

    // Nová výzva — server prípadný predchádzajúci beh uzavrie.
    window.HM.store.startRun(v).then(function (s) {
      applyState(s);
      save();
      render();
      toast('Sixty begins.');
    }).catch(function () {
      toast('Nepodarilo sa začať. Skús znova.');
    });
    return;
```

- [ ] **Step 6: Prepíš `reset()` — už nemaže, len uvoľní obrazovku**

Nahraď telo `reset()` (`:258`):

```js
  // Beh sa neruší mazaním — uzavrie ho až založenie nového (POST /api/runs).
  // Tu len uvoľníme obrazovku na zadanie nového habitu.
  function reset() {
    state.editing = true;
    state.justN = 0;
    state.milestone = 0;
    render();
  }
```

- [ ] **Step 7: Spusti načítanie zo servera po štarte**

Na konci `app.js` je štartovacia sekvencia `load(); buildPaths(); buildGrid(); render(); startIntro();`. Za `startIntro();` pridaj:

```js
  refreshFromServer();
```

Poradie je podstatné: `load()` vykreslí cache okamžite, `refreshFromServer()` dobehne až potom a prepíše stav serverovým.

- [ ] **Step 8: Over celý tok v prehliadači**

Nasaď a na preview URL prejdi:

```bash
vercel deploy
```

1. Prihlás sa → appka sa zobrazí.
2. Zadaj habit → „Sixty begins."
3. Označ dnešný deň → políčko sa rozsvieti, ukáže sa citát.
4. Tvrdý reload (Cmd+Shift+R) → habit aj označený deň sú tam.
5. V DevTools vymaž `localStorage` a reloadni → stav je stále tam (prišiel zo servera).
6. V DevTools → Network zapni offline a klikni na iný deň → políčko sa vráti a ukáže sa „Nepodarilo sa uložiť."

Očakávané: všetkých šesť bodov prejde. Bod 5 je ten podstatný — dokazuje, že zdrojom pravdy je server.

- [ ] **Step 9: Commit**

```bash
git add app.js index.html
git commit -m "feat: app.js cita a zapisuje stav na server"
```

---

### Task 9: Import existujúceho localStorage behu

**Files:**
- Modify: `store.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `startRun`, `setDay` z Tasku 7.
- Produces: `importLegacy(): Promise<object | null>` — z `store.js`

- [ ] **Step 1: Doplň `store.js`**

Na koniec `store.js` pridaj:

```js
const LEGACY_KEY = 'sixty:v2';

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

  const state = await startRun(legacy.habit);
  // startRun začína dnešným dňom; pôvodný beh má vlastný začiatok.
  const days = Array.isArray(legacy.logged) ? legacy.logged : [];
  for (const index of days) {
    await setDay(state.runId, legacy.startDay, index, true);
  }
  localStorage.removeItem(LEGACY_KEY);
  return { ...state, startDay: legacy.startDay };
}
```

> **Pozor:** `startRun` založí beh s dnešným `start_date`. Aby sedeli dátumy pôvodných dní, musí endpoint prijať aj `startDate`. Krok 2 to dopĺňa.

- [ ] **Step 2: Nechaj `POST /api/runs` prijať `startDate`**

V `api/runs.js` uprav vetvu `POST`:

```js
    const startDate = req.body?.startDate;
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return res.status(400).json({ error: 'bad startDate' });
    }
    if (startDate && startDate > today()) {
      return res.status(400).json({ error: 'startDate in future' });
    }

    const active = await getActiveRun(sql, userId);
    if (active) await closeRun(sql, active.id, 'abandoned', today());

    const run = await createRun(sql, userId, habitName, startDate || today());
```

A v `store.js` v `startRun` pošli `startDate`, keď ho voláme z importu:

```js
export async function startRun(habitName, startDate) {
  const { run } = await api('/api/runs', {
    method: 'POST',
    body: JSON.stringify(startDate ? { habitName, startDate } : { habitName }),
  });
  return toClientState(run, []);
}
```

V `importLegacy` zmeň volanie na `await startRun(legacy.habit, legacy.startDay)` a odstráň `{ ...state, startDay: legacy.startDay }` — vráť rovno `state`, lebo server už vráti správny `start_date`.

- [ ] **Step 3: Ponúkni import pri prvom prihlásení**

V `index.html` v module skripte, medzi `gate.remove()` a `await import('./app.js')`:

```js
    const current = await store.loadState();
    if (!current && localStorage.getItem('sixty:v2')) {
      if (confirm('Našiel sa rozbehnutý habit z tohto zariadenia. Preniesť ho do účtu?')) {
        await store.importLegacy();
      } else {
        localStorage.removeItem('sixty:v2');
      }
    }
```

- [ ] **Step 4: Otestuj import**

V DevTools na preview URL nastav starý stav a reloadni:

```js
localStorage.setItem('sixty:v2', JSON.stringify({
  habit: 'test import', startDay: '2026-07-01', logged: [1, 2, 3, 10]
}));
location.reload();
```

Očakávané: appka sa spýta, po potvrdení sa zobrazí habit „test import" so štyrmi rozsvietenými políčkami na dňoch 1, 2, 3 a 10. Over v DB:

```bash
source <(grep -v '^#' .env.local | sed 's/^/export /') && \
  psql "$DATABASE_URL" -c "select date from run_day where run_id = (select id from run where habit_name = 'test import') order by date"
```

Očakávané: `2026-07-01`, `2026-07-02`, `2026-07-03`, `2026-07-10`.

- [ ] **Step 5: Commit**

```bash
git add store.js api/runs.js index.html
git commit -m "feat: import behu z localStorage pri prvom prihlaseni"
```

---

### Task 10: Obrazovka histórie

**Files:**
- Create: `history.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `loadHistory` z Tasku 7.
- Produces: `renderHistory(node): Promise<void>` — z `history.js`

- [ ] **Step 1: Napíš `history.js`**

```js
/* Zoznam uzavretých behov. Všetky čísla sú odvodené — nič sa neukladá. */
import { loadHistory } from './store.js';

function formatRange(startDate, endedAt) {
  const fmt = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('sk-SK', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return endedAt ? `${fmt(startDate)} – ${fmt(endedAt)}` : fmt(startDate);
}

export async function renderHistory(node) {
  let runs;
  try {
    runs = await loadHistory();
  } catch {
    node.innerHTML = '<p class="hist-empty">Históriu sa nepodarilo načítať.</p>';
    return;
  }

  if (!runs.length) {
    node.innerHTML = '<p class="hist-empty">Zatiaľ žiadny uzavretý beh. Prvý pribudne, keď začneš ďalšiu výzvu.</p>';
    return;
  }

  node.innerHTML = runs.map((r) => {
    const pct = Math.round((r.daysDone / r.goalDays) * 100);
    const label = r.status === 'finished' ? 'dokončený' : 'ukončený predčasne';
    return `
      <article class="hist-row">
        <div class="hist-main">
          <h3 class="hist-name">${r.habitName}</h3>
          <p class="hist-meta">${formatRange(r.startDate, r.endedAt)} · ${label}</p>
        </div>
        <div class="hist-score">
          <span class="hist-count">${r.daysDone}/${r.goalDays}</span>
          <span class="hist-pct">${pct}%</span>
        </div>
      </article>`;
  }).join('');
}
```

- [ ] **Step 2: Pridaj sekciu histórie do `index.html`**

Pred uzatvárajúci `</body>`, za existujúci obsah stránky:

```html
<section id="history" style="max-width:46rem;margin:0 auto;padding:4rem 1.5rem 6rem">
  <h2 style="font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(243,241,237,.45);margin-bottom:1.5rem">Predošlé behy</h2>
  <div id="historyList"></div>
</section>
```

A do `<style>` v `<head>` doplň:

```css
.hist-row{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding:1rem 0;border-bottom:1px solid rgba(243,241,237,.08)}
.hist-name{font-size:1rem;font-weight:500}
.hist-meta{font-size:.8125rem;color:rgba(243,241,237,.45);margin-top:.125rem}
.hist-score{text-align:right;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
.hist-count{display:block;font-size:.9375rem}
.hist-pct{display:block;font-size:.75rem;color:rgba(243,241,237,.45)}
.hist-empty{font-size:.875rem;color:rgba(243,241,237,.45)}
```

- [ ] **Step 3: Vykresli históriu po štarte**

V `index.html` v module skripte, za `await import('./app.js')`:

```js
    const { renderHistory } = await import('./history.js');
    await renderHistory(document.getElementById('historyList'));
```

- [ ] **Step 4: Over v prehliadači**

```bash
vercel deploy
```

Na preview URL: zaloz nový habit (tým sa predchádzajúci uzavrie), reloadni a zroluj dole.

Očakávané: sekcia „Predošlé behy" obsahuje uzavretý beh s rozsahom dátumov, textom „ukončený predčasne" a skóre v tvare `3/66` a `5%`.

- [ ] **Step 5: Commit**

```bash
git add history.js index.html
git commit -m "feat: obrazovka historie behov"
```

---

### Task 11: Záverečné overenie a upratanie

**Files:**
- Modify: `scripts/smoke.sh`
- Create: `docs/2026-08-11-manualny-checklist.md`

**Interfaces:**
- Consumes: všetko z Taskov 1–10.

- [ ] **Step 1: Vyčisti testovacie dáta z databázy**

```bash
source <(grep -v '^#' .env.local | sed 's/^/export /') && \
  psql "$DATABASE_URL" -c "delete from run where habit_name in ('smoke habit','smoke dni','test import')"
```

- [ ] **Step 2: Spusti celý smoke test proti produkcii**

```bash
vercel deploy --prod
BASE=https://habit-master-gilt.vercel.app TOKEN=<token> ./scripts/smoke.sh
```

Očakávané: `vsetko ok`, nula zlyhaní.

- [ ] **Step 3: Zapíš manuálny checklist**

Vytvor `docs/2026-08-11-manualny-checklist.md`:

```markdown
# Manuálny checklist — Habit Master

Prejsť na mobile po každom zásahu do prihlásenia alebo ukladania.

- [ ] Odhlásený návštevník vidí prihlásenie, nie appku.
- [ ] Registrácia e-mailom mimo allowlistu je odmietnutá.
- [ ] Po prihlásení sa zobrazí aktívny beh so správnymi rozsvietenými dňami.
- [ ] Označenie dnešného dňa rozsvieti políčko a ukáže citát.
- [ ] Tvrdý reload stav zachová.
- [ ] Vymazanie localStorage a reload stav zachová (prišiel zo servera).
- [ ] V letovom režime označenie dňa vráti políčko späť a ukáže hlášku.
- [ ] Založenie nového habitu presunie ten predošlý do histórie.
- [ ] História ukazuje rozsah dátumov, skóre a percento.
- [ ] Odhlásenie a opätovné prihlásenie na inom zariadení ukáže ten istý stav.
```

- [ ] **Step 4: Prejdi checklist na telefóne**

Otvor produkčnú URL na mobile a prejdi všetkých desať bodov. Čokoľvek zlyhá, oprav pred commitom.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke.sh docs/2026-08-11-manualny-checklist.md
git commit -m "docs: manualny checklist a finalny smoke test"
```

---

## Čo tento plán vedome nerobí

- **Neprepája Habit Master so Stewardom.** Steward nie je nasadený; prepojenie si vyžiada vlastný návrh. `run_day.date` je zámerne v tvare, ktorý sa na `HabitEntry` mapuje priamo.
- **Nestavia sync engine.** Zlyhaný zápis sa vráti a ohlási; nezaraďuje sa do fronty. Pri jednom aktívnom behu je fronta mašinéria bez úžitku.
- **Nezavádza testovací framework.** Overovanie stojí na smoke skripte proti nasadenej URL a na manuálnom checkliste. Unit testy nad ručne písaným DOM-om by nedali pomer cena/úžitok.
- **Nerobí voliteľnú dĺžku výzvy.** `goal_days` je v schéme, takže sa to neskôr otvorí bez migrácie.
