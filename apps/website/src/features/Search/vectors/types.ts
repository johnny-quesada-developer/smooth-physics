export type SparseVector = Readonly<Record<number, number>>;

export type SearchDocument = {
  readonly id: string;
  readonly kind: 'example' | 'doc';
  readonly title: string;
  readonly summary: string;
  readonly href: string;
  readonly tags: readonly string[];
  readonly facets: Readonly<Record<string, readonly string[]>>;
};

export type SearchIndex = {
  readonly vocabulary: Readonly<Record<string, number>>;
  readonly inverseDocumentFrequency: readonly number[];
  readonly documents: readonly (SearchDocument & { readonly vector: SparseVector })[];
};

export type RankedDocument = SearchDocument & { readonly score: number };
