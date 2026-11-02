// Facets narrow the set first; an empty query keeps the authored order.
import { extractTerms } from './terms';
import type { RankedDocument, SearchDocument, SearchIndex, SparseVector } from './types';
import { weigh } from './weigh';

const MINIMUM_SCORE = 0.08;

export function rankDocuments({
  index,
  query,
  facets,
}: {
  index: SearchIndex;
  query: string;
  facets: Readonly<Record<string, readonly string[]>>;
}): RankedDocument[] {
  const vector = weigh({ terms: extractTerms(query), vocabulary: index.vocabulary, inverseDocumentFrequency: index.inverseDocumentFrequency });
  const hasQuery = Object.keys(vector).length > 0;
  const ranked: RankedDocument[] = [];
  for (const { vector: documentVector, ...document } of index.documents) {
    if (!matchesFacets({ document, facets })) continue;
    const score = hasQuery ? cosineSimilarity({ left: vector, right: documentVector }) : 1;
    if (score >= MINIMUM_SCORE) ranked.push({ ...document, score });
  }
  return hasQuery ? ranked.toSorted((first, second) => second.score - first.score) : ranked;
}

function cosineSimilarity({ left, right }: { left: SparseVector; right: SparseVector }): number {
  let total = 0;
  for (const [key, weight] of Object.entries(left)) total += weight * (right[Number(key)] ?? 0);
  return total;
}

function matchesFacets({ document, facets }: { document: SearchDocument; facets: Readonly<Record<string, readonly string[]>> }): boolean {
  return Object.entries(facets).every(([facet, wanted]) => wanted.length === 0 || wanted.some((value) => document.facets[facet]?.includes(value)));
}
