/* Clerk v prehliadači. Appka sa nevykreslí, kým nevieme, kto je prihlásený. */
const PUBLISHABLE_KEY = 'pk_test_c3VwZXItbWF5Zmx5LTM1LmNsZXJrLmFjY291bnRzLmRldiQ';

let clerk = null;

export async function initAuth() {
  clerk = window.Clerk;
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
