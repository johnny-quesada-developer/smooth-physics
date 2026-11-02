import type { ExampleSlug } from '@/features/Examples/catalogue/types';

export type DocSection = 'start' | 'concepts' | 'reference' | 'guides';

export type DocKind = 'guide' | 'concept' | 'reference';

export type DocSummary = {
  readonly slug: string;
  readonly title: string;
  readonly navTitle: string;
  readonly lead: string;
  readonly section: DocSection;
  readonly order: number;
  readonly kind: DocKind;
  // The import path the page documents, shown as a tag.
  readonly module?: string;
  readonly example?: ExampleSlug;
  readonly install: boolean;
  readonly tags: readonly string[];
  readonly features: readonly string[];
};

export type DocLink = { readonly slug: string; readonly title: string };

export type DocGroup = { readonly section: DocSection; readonly label: string; readonly pages: readonly DocLink[] };

export type DocHeading = { readonly slug: string; readonly text: string };
