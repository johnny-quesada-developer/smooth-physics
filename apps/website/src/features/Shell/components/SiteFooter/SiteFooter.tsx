import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';

type SiteFooterProps = ComponentProps<'footer'>;

const SiteFooter: FC<SiteFooterProps> = ({ className, ...props }) => {
  return (
    <footer className={twMerge(classNames('SiteFooter', 'border-t border-line', className))} {...props}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
        <p>smooth-physics: real-time secondary motion for character rigs on the web.</p>
        <p>MIT licensed.</p>
        <p>
          Built by{' '}
          <a
            className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
            href="https://johnny-quesada-developer.github.io/react-global-state-hooks/about/"
            rel="noreferrer"
            target="_blank"
          >
            Johnny Quesada
          </a>
          .
        </p>
      </div>
    </footer>
  );
};

export default SiteFooter;
