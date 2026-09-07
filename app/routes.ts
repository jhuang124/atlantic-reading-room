// Hash routes so issues and reading places are shareable and the browser's
// Back button walks archive → splash → reader. GitHub Pages serves one HTML
// file, so the fragment is the only path segment we own.
export type Route =
  | { surface: 'archive' }
  | { surface: 'issue'; id: string }
  | { surface: 'reader'; id: string; page?: number };

const ISSUE_ID = /^\d{6}$/;
const PAGE = /^p(\d{1,3})$/;

export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean);
  const id = parts[0] || '';
  if (!ISSUE_ID.test(id)) return { surface: 'archive' };
  if (parts[1] === 'read') {
    const match = PAGE.exec(parts[2] || '');
    const page = match ? Number(match[1]) : undefined;
    return { surface: 'reader', id, ...(page && page > 0 ? { page } : {}) };
  }
  return { surface: 'issue', id };
}

export function routeHash(route: Route): string {
  if (route.surface === 'archive') return '#/';
  if (route.surface === 'issue') return `#/${route.id}`;
  const page = route.page && route.page > 1 ? `/p${route.page}` : '';
  return `#/${route.id}/read${page}`;
}
