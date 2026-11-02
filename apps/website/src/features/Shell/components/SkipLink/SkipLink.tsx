import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';

type SkipLinkProps = ComponentProps<'a'>;

const SkipLink: FC<SkipLinkProps> = ({ className, children = 'Skip to content', ...props }) => {
  return (
    <a
      className={twMerge(
        classNames(
          'SkipLink',
          'sr-only z-40 rounded-control bg-ink text-sm font-semibold text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:inline-flex focus:min-h-touch focus:items-center focus:px-4',
          className,
        ),
      )}
      href="#content"
      {...props}
    >
      {children}
    </a>
  );
};

export default SkipLink;
