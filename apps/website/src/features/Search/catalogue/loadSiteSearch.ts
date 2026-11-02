// Build time only: it reads the docs collection.
import { loadDocs } from '@/features/Docs/loadDocs';
import { createSiteSearch, type SiteSearch } from './siteSearch';

export async function loadSiteSearch(): Promise<SiteSearch> {
  const docs = await loadDocs();
  return createSiteSearch({ docs: docs.map(({ summary, body }) => ({ ...summary, body })) });
}
