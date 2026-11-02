import type { DocHeading, DocKind, DocSection } from './types';
import { sitePath } from '@/site/paths';

// The sidebar order: each page sorts by its section, then by its order inside it.
export const SECTION_ORDER: readonly DocSection[] = ['start', 'concepts', 'reference', 'guides'];

export const SECTION_LABELS: Readonly<Record<DocSection, string>> = {
  start: 'Start here',
  concepts: 'Core concepts',
  reference: 'API reference',
  guides: 'Guides',
};

export const KIND_LABELS: Readonly<Record<DocKind, string>> = { guide: 'Guide', concept: 'Concept', reference: 'API reference' };

export const docHref = (slug: string): string => sitePath(`/docs/${slug}/`);

// Pages with install: true get this section before their Markdown, so it also leads the table of contents.
export const INSTALL_HEADING: DocHeading = { slug: 'install', text: 'Install' };
