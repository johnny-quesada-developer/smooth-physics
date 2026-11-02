import { getCollection, type CollectionEntry } from 'astro:content';
import { findExample } from '@/features/Examples/catalogue/examples';
import { SECTION_LABELS, SECTION_ORDER } from './sections';
import type { DocGroup, DocSummary } from './types';

export type LoadedDoc = { readonly summary: DocSummary; readonly body: string; readonly entry: CollectionEntry<'docs'> };

// Every docs page in sidebar order. Throws when a page names an example that does not exist.
export async function loadDocs(): Promise<LoadedDoc[]> {
  const entries = await getCollection('docs');
  return entries
    .map((entry) => {
      const { example, module, nav, ...data } = entry.data;
      if (example && !findExample(example)) throw new Error(`Docs page ${entry.id} names the unknown example ${example}.`);
      const summary: DocSummary = {
        ...data,
        slug: entry.id,
        navTitle: nav ?? data.title,
        ...(example ? { example } : {}),
        ...(module ? { module } : {}),
      };
      return { entry, body: entry.body ?? '', summary };
    })
    .toSorted(
      (first, second) =>
        SECTION_ORDER.indexOf(first.summary.section) - SECTION_ORDER.indexOf(second.summary.section) || first.summary.order - second.summary.order,
    );
}

export function groupDocs(docs: readonly DocSummary[]): DocGroup[] {
  return SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABELS[section],
    pages: docs.filter((doc) => doc.section === section).map((doc) => ({ slug: doc.slug, title: doc.navTitle })),
  })).filter((group) => group.pages.length > 0);
}
