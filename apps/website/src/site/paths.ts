// A path on this site under the deployment's base path: '/' locally, '/<repository>/' on a GitHub Pages project site.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const sitePath = (path: string): string => `${BASE}${path}`;
