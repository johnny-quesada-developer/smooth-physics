import classNames from 'classnames';
import type { ComponentProps, FC, ReactNode } from 'react';

import Badge from '@/components/Badge';
import ButtonLink from '@/components/ButtonLink';
import Container from '@/components/Container';
import twMerge from '@/tailwind/twMerge';
import { INSTALL_HEADING, KIND_LABELS, SECTION_LABELS } from '../../sections';
import type { DocGroup, DocHeading, DocKind, DocLink, DocSummary } from '../../types';
import DocsPager from '../DocsPager';
import DocsSidebar from '../DocsSidebar';
import DocsToc from '../DocsToc';
import styles from './DocsPage.module.css';
import DocsPageTestIds from './DocsPage.testIds';
import { sitePath } from '@/site/paths';

type DocsPageProps = ComponentProps<'main'> & {
  readonly doc: DocSummary;
  readonly groups: readonly DocGroup[];
  readonly headings: readonly DocHeading[];
  readonly previous: DocLink | null;
  readonly next: DocLink | null;
  readonly exampleTitle: string | null;
  // Islands rendered by the Astro page: the search box, and the install tabs for pages with install: true.
  readonly search?: ReactNode;
  readonly install?: ReactNode;
  readonly children: ReactNode;
};

const KIND_TONES: Readonly<Record<DocKind, 'lime' | 'honey' | 'sage'>> = { guide: 'lime', concept: 'sage', reference: 'honey' };

const DocsPage: FC<DocsPageProps> = ({ className, doc, groups, headings, previous, next, exampleTitle, search, install, children, ...props }) => {
  return (
    <main className={twMerge(classNames('DocsPage', 'py-6 lg:py-10', className))} data-testid={DocsPageTestIds.root} id="content" {...props}>
      <Container className="grid gap-x-8 gap-y-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_11rem]">
        <DocsSidebar
          className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-6"
          current={doc.slug}
          currentTitle={doc.navTitle}
          groups={groups}
          search={search}
        />
        <article className="flex min-w-0 flex-col gap-8">
          <header className="flex flex-col gap-3">
            <p className="text-sm font-semibold tracking-wide text-lime uppercase" data-testid={DocsPageTestIds.section}>
              {SECTION_LABELS[doc.section]}
            </p>
            <h1 className="text-title font-semibold text-balance break-words" data-testid={DocsPageTestIds.title}>
              {doc.title}
            </h1>
            <p className="text-lg text-pretty text-muted" data-testid={DocsPageTestIds.lead}>
              {doc.lead}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={KIND_TONES[doc.kind]}>{KIND_LABELS[doc.kind]}</Badge>
              {doc.module ? <Badge className="font-mono">{doc.module}</Badge> : null}
              {doc.example && exampleTitle ? (
                <ButtonLink className="ml-auto" data-testid={DocsPageTestIds.example} href={sitePath(`/examples/${doc.example}/`)} tone="quiet">
                  Try an example: {exampleTitle} <span aria-hidden="true">→</span>
                </ButtonLink>
              ) : null}
            </div>
          </header>
          {doc.install ? (
            <section aria-labelledby={INSTALL_HEADING.slug} className="flex flex-col gap-4" data-testid={DocsPageTestIds.install}>
              <h2 className="scroll-mt-20 text-2xl font-semibold tracking-tight" id={INSTALL_HEADING.slug}>
                {INSTALL_HEADING.text}
              </h2>
              {install}
            </section>
          ) : null}
          <div className={styles['article']} data-testid={DocsPageTestIds.article}>
            {children}
          </div>
          <DocsPager next={next} previous={previous} />
        </article>
        <DocsToc className="hidden xl:sticky xl:top-20 xl:flex xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto" headings={headings} />
      </Container>
    </main>
  );
};

export default DocsPage;
