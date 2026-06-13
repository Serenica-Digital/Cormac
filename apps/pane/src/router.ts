/**
 * Hash routing only. office.js nullifies history.pushState inside the task pane,
 * so the History API is unavailable; the hash is the one navigation channel that
 * survives the sandbox.
 */
export type Route = 'auth' | 'probes';

export function currentRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h === 'probes' ? 'probes' : 'auth';
}

export function navigate(route: Route): void {
  window.location.hash = `#/${route}`;
}

export function onRouteChange(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
