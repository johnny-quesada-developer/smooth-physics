import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';
import { docHref } from '../../sections';
import type { DocLink } from '../../types';
import DocsPagerTestIds from './DocsPager.testIds';

type DocsPagerProps = ComponentProps<'nav'> & { readonly previous: DocLink | null; readonly next: DocLink | null };

const LINK = 'flex min-h-touch flex-col gap-0.5 rounded-panel border border-line bg-paper px-4 py-3 transition-colors hover:border-muted hover:bg-soft';

const DocsPager: FC<DocsPagerProps> = ({ className, previous, next, ...props }) => {
  return (
    <nav
      aria-label="Previous and next page"
      className={twMerge(classNames('DocsPager', 'grid gap-3 border-t border-line pt-6 sm:grid-cols-2', className))}
      data-testid={DocsPagerTestIds.root}
      {...props}
    >
      {previous ? (
        <a className={LINK} data-testid={DocsPagerTestIds.previous} href={docHref(previous.slug)} rel="prev">
          <span className="text-xs text-muted">← Previous</span>
          <span className="font-medium">{previous.title}</span>
        </a>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next ? (
        <a className={classNames(LINK, 'sm:items-end sm:text-right')} data-testid={DocsPagerTestIds.next} href={docHref(next.slug)} rel="next">
          <span className="text-xs text-muted">Next →</span>
          <span className="font-medium">{next.title}</span>
        </a>
      ) : null}
    </nav>
  );
};

export default DocsPager;
