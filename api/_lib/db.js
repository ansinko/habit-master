import { neon } from '@neondatabase/serverless';

let cached = null;

/** Neon klient. Lenivo, nech import súboru nespadne, keď DATABASE_URL chýba. */
export function getSql() {
  if (!cached) cached = neon(process.env.DATABASE_URL);
  return cached;
}
