import { docHref } from '@/features/Docs/sections';
import type { DocSummary } from '@/features/Docs/types';
import { EXAMPLES } from '@/features/Examples/catalogue/examples';
import type { FacetGroup } from '../components/Finder';
import { buildIndex } from '../vectors/buildIndex';
import type { SearchDocument, SearchIndex } from '../vectors/types';
import { sitePath } from '@/site/paths';

export type SiteSearch = { readonly index: SearchIndex; readonly facetGroups: readonly FacetGroup[] };

export type SearchableDoc = DocSummary & { readonly body: string };

// Titles and tags are repeated so they weigh more than body text.
export function createSiteSearch({ docs }: { docs: readonly SearchableDoc[] }): SiteSearch {
  const examples = EXAMPLES.map((example) => ({
    id: `example-${example.slug}`,
    kind: 'example' as const,
    title: example.title,
    summary: example.summary,
    href: sitePath(`/examples/${example.slug}/`),
    tags: example.tags,
    facets: { ...example.facets, kind: ['example'] },
    text: [example.title, example.title, example.summary, ...example.description, example.tags.join(' '), example.tags.join(' ')].join(' '),
  }));
  const pages = docs.map((doc) => ({
    id: `doc-${doc.slug}`,
    kind: 'doc' as const,
    title: doc.title,
    summary: doc.lead,
    href: docHref(doc.slug),
    tags: doc.tags,
    facets: { feature: doc.features, kind: ['doc'] },
    text: [doc.title, doc.title, doc.lead, doc.tags.join(' '), doc.tags.join(' '), doc.body].join(' '),
  }));
  const documents: readonly (SearchDocument & { readonly text: string })[] = [...examples, ...pages];
  const valuesOf = (facet: string): string[] => [...new Set(documents.flatMap((document) => document.facets[facet] ?? []))].toSorted();
  return {
    index: buildIndex(documents),
    facetGroups: [
      { facet: 'kind', label: 'Kind', values: ['example', 'doc'] },
      { facet: 'level', label: 'Level', values: ['beginner', 'intermediate', 'advanced'] },
      { facet: 'feature', label: 'Feature', values: valuesOf('feature') },
      { facet: 'connection', label: 'Connection', values: valuesOf('connection') },
    ],
  };
}
