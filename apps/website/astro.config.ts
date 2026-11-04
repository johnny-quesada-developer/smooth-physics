import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// On a GitHub Pages project site the pages live under /<repository>/; the deploy workflow passes the origin and base
// path, and local builds keep '/'.
const BASE_PATH = process.env.BASE_PATH ?? '/';
// Redirect targets are written out as they are, so they carry the base path themselves.
const BASE = BASE_PATH.replace(/\/$/, '');
export default defineConfig({
  output: 'static',
  base: BASE_PATH,
  // Canonical links, link cards and the sitemap need absolute URLs; local builds use the production origin too.
  site: process.env.SITE_URL ?? 'https://johnny-quesada-developer.github.io',
  trailingSlash: 'always',
  // The tutorials and the reference page became the docs; the benchmark pages became the showreel, which now opens the
  // landing page.
  redirects: {
    '/tutorials/': `${BASE}/docs/getting-started/`,
    '/tutorials/getting-started/': `${BASE}/docs/getting-started/`,
    '/tutorials/settings/': `${BASE}/docs/settings/`,
    '/tutorials/connections/': `${BASE}/docs/connections/`,
    '/tutorials/colliders/': `${BASE}/docs/colliders/`,
    '/tutorials/animation/': `${BASE}/docs/motion-and-animation/`,
    '/tutorials/performance/': `${BASE}/docs/performance/`,
    '/tutorials/without-three/': `${BASE}/docs/engines-and-workers/`,
    '/reference/': `${BASE}/docs/api/`,
    '/showreel/': `${BASE}/`,
    '/benchmark/': `${BASE}/`,
    '/benchmark/details/': `${BASE}/`,
  },
  integrations: [
    react(),
    // Old addresses and /docs/ only redirect, and the 404 page is not content: none belongs in the sitemap.
    sitemap({ filter: (page) => !/\/(tutorials|reference|benchmark|showreel)\/|\/404\/?$|\/docs\/$/.test(new URL(page).pathname) }),
  ],
  markdown: {
    // The VS Code themes of the react-global-state-hooks site, emitted as CSS variables; styles/global.css picks one
    // from the page theme.
    shikiConfig: { themes: { light: 'light-plus', dark: 'dark-plus' }, defaultColor: false },
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    worker: { format: 'es' },
    // Dependencies live in the workspace root, so Astro does not find the React renderer among this app's own
    // dependencies. Its server entry imports a virtual module and must be bundled, not loaded from disk.
    environments: { prerender: { resolve: { noExternal: ['@astrojs/react'] } }, ssr: { resolve: { noExternal: ['@astrojs/react'] } } },
  },
});
