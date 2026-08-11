/* Clerk v prehliadači. Appka sa nevykreslí, kým nevieme, kto je prihlásený.
   Publishable key sa aplikuje cez data-clerk-publishable-key v index.html —
   `window.Clerk` je vtedy hotová inštanca, nie konštruktor. */

let clerk = null;

const CLERK_WAIT_TIMEOUT_MS = 15000;
const CLERK_POLL_INTERVAL_MS = 50;

/* Async CDN skript v index.html nemá voči tomuto ES modulu garantované poradie
   vykonania — window.Clerk nemusí ešte existovať, keď initAuth() nabehne.
   Krátky poll s rozumným stropom namiesto predpokladu, že už je hotový. */
function waitForClerkGlobal(timeoutMs = CLERK_WAIT_TIMEOUT_MS) {
  if (window.Clerk) return Promise.resolve(window.Clerk);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      if (window.Clerk) return resolve(window.Clerk);
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('Clerk sa nenačítal včas (CDN skript neodpovedal).'));
        return;
      }
      setTimeout(poll, CLERK_POLL_INTERVAL_MS);
    })();
  });
}

export async function initAuth() {
  clerk = await waitForClerkGlobal();
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
