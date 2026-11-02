import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';
import type { DocHeading } from '../../types';
import DocsTocTestIds from './DocsToc.testIds';

type DocsTocProps = ComponentProps<'nav'> & { readonly headings: readonly DocHeading[] };

// docsPage.client.ts marks the heading being read with aria-current.
const DocsToc: FC<DocsTocProps> = ({ className, headings, ...props }) => {
  if (headings.length === 0) return null;
  return (
    <nav
      aria-labelledby="docs-toc-title"
      className={twMerge(classNames('DocsToc', 'flex flex-col gap-1', className))}
      data-docs-toc
      data-testid={DocsTocTestIds.root}
      {...props}
    >
      <p className="text-xs font-semibold tracking-wide text-muted uppercase" id="docs-toc-title">
        On this page
      </p>
      <ul className="flex flex-col border-l border-line">
        {headings.map((heading) => (
          <li key={heading.slug}>
            <a
              className="-ml-px flex min-h-touch items-center border-l-2 border-transparent pl-3 text-sm text-muted transition-colors hover:text-ink aria-[current=true]:border-lime aria-[current=true]:text-ink"
              data-testid={DocsTocTestIds.link(heading.slug)}
              href={`#${heading.slug}`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default DocsToc;
