import { extractTerms } from './terms';
import type { SearchDocument, SearchIndex } from './types';
import { roundWeight, weigh } from './weigh';

export function buildIndex(documents: readonly (SearchDocument & { readonly text: string })[]): SearchIndex {
  const termsPerDocument = documents.map((document) => extractTerms(document.text));
  const vocabulary: Record<string, number> = {};
  const documentFrequency: number[] = [];
  for (const terms of termsPerDocument) {
    for (const term of terms.keys()) {
      const index = vocabulary[term] ?? documentFrequency.push(0) - 1;
      vocabulary[term] = index;
      documentFrequency[index] = (documentFrequency[index] ?? 0) + 1;
    }
  }
  const inverseDocumentFrequency = documentFrequency.map((count) => roundWeight(Math.log((1 + documents.length) / (1 + count)) + 1));
  return {
    vocabulary,
    inverseDocumentFrequency,
    documents: documents.map(({ text: _text, ...document }, position) => ({
      ...document,
      vector: weigh({ terms: termsPerDocument[position] ?? new Map(), vocabulary, inverseDocumentFrequency }),
    })),
  };
}
