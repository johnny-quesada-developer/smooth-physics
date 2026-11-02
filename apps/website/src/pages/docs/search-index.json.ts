// The search index of every docs page and example, fetched by the docs search box on first use.
import type { APIRoute } from 'astro';
import { loadSiteSearch } from '@/features/Search/catalogue/loadSiteSearch';

export const GET: APIRoute = async () => {
  const { index } = await loadSiteSearch();
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } });
};
