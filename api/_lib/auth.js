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
