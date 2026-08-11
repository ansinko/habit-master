#!/usr/bin/env node
// Vyrobí platný Clerk session token pre smoke test bez účasti človeka.
//
// Použitie:
//   TOKEN=$(node scripts/dev-token.mjs)
//   BASE=http://localhost:3000 TOKEN="$TOKEN" ./scripts/smoke.sh
//
// Na stdout ide VÝLUČNE token (JWT) — žiadne logy, nech sa dá priamo
// pipnúť do premennej. Diagnostika a chyby idú na stderr.
//
// Ako to funguje:
//   1. CLERK_SECRET_KEY sa načíta z env (alebo z .env.local, ak beží mimo
//      `vercel dev`). Ak kľúč nezačína na `sk_test_`, skript odmietne
//      pokračovať — nechceme, aby niekto omylom vyrobil testovacieho
//      používateľa v produkčnej Clerk inštancii.
//   2. Cez Clerk Backend API (@clerk/backend) sa nájde alebo vytvorí
//      testovací používateľ s rozpoznateľným e-mailom (obsahuje `smoke`).
//      Backend API obchádza "Restricted" sign-up + allowlist — to je
//      overené reálnym volaním, nie predpoklad.
//   3. Backend API rovno vytvorí session pre toho používateľa
//      (`sessions.createSession`) a vypýta si k nej krátkodobý JWT
//      (`sessions.getToken`) — presne to, čo API očakáva v
//      `Authorization: Bearer <token>`.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClerkClient } from '@clerk/backend';

const SMOKE_TEST_EMAIL = 'smoke-test@example.com';

function fail(message) {
  console.error(`dev-token: ${message}`);
  process.exit(1);
}

/** Načíta .env.local do process.env, ak tam ešte tie premenné nie sú
 * (napr. keď skript beží samostatne cez `node`, mimo `vercel dev`). */
function loadDotEnvLocalIfNeeded() {
  if (process.env.CLERK_SECRET_KEY) return;

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(scriptDir, '..', '.env.local');
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

async function findOrCreateSmokeUser(clerk) {
  const existing = await clerk.users.getUserList({ emailAddress: [SMOKE_TEST_EMAIL] });
  if (existing.data.length > 0) return existing.data[0];

  return clerk.users.createUser({
    emailAddress: [SMOKE_TEST_EMAIL],
    password: `smoke-test-${Math.random().toString(36).slice(2)}-Aa1!`,
    skipPasswordChecks: true,
    skipLegalChecks: true,
    firstName: 'Smoke',
    lastName: 'Test',
  });
}

async function main() {
  loadDotEnvLocalIfNeeded();

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) fail('CLERK_SECRET_KEY nie je nastavený (ani v env, ani v .env.local).');

  if (secretKey.startsWith('sk_live_')) {
    fail(
      'CLERK_SECRET_KEY patrí produkčnej Clerk inštancii (sk_live_). ' +
        'Tento skript smie bežať len proti development inštancii — nič nevytváram.',
    );
  }
  if (!secretKey.startsWith('sk_test_')) {
    fail(
      `CLERK_SECRET_KEY má neočakávaný formát (${secretKey.slice(0, 8)}…). ` +
        'Očakávam development kľúč sk_test_ — nič nevytváram.',
    );
  }

  const clerk = createClerkClient({ secretKey });

  let user;
  try {
    user = await findOrCreateSmokeUser(clerk);
  } catch (err) {
    fail(`nepodarilo sa nájsť/vytvoriť testovacieho používateľa: ${describeClerkError(err)}`);
  }

  let session;
  try {
    session = await clerk.sessions.createSession({ userId: user.id });
  } catch (err) {
    fail(`nepodarilo sa vytvoriť session: ${describeClerkError(err)}`);
  }

  let token;
  try {
    token = await clerk.sessions.getToken(session.id);
  } catch (err) {
    fail(`nepodarilo sa získať token pre session: ${describeClerkError(err)}`);
  }

  process.stdout.write(token.jwt);
}

function describeClerkError(err) {
  if (err?.errors) return JSON.stringify(err.errors);
  return err?.message ?? String(err);
}

main().catch((err) => fail(describeClerkError(err)));
