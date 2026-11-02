import classNames from 'classnames';
import type { ComponentProps, FC, ReactNode } from 'react';

import twMerge from '@/tailwind/twMerge';

type SectionHeadingProps = ComponentProps<'div'> & { readonly eyebrow?: string; readonly title: ReactNode; readonly level?: 'h1' | 'h2' };

const SectionHeading: FC<SectionHeadingProps> = ({ className, eyebrow, title, level = 'h2', children, ...props }) => {
  const Heading = level;
  return (
    <div className={twMerge(classNames('SectionHeading', 'flex max-w-3xl flex-col gap-3', className))} {...props}>
      {eyebrow ? <p className="text-sm font-semibold tracking-wide text-lime uppercase">{eyebrow}</p> : null}
      <Heading className="text-title font-semibold text-balance">{title}</Heading>
      {children ? <div className="text-lg text-pretty text-muted">{children}</div> : null}
    </div>
  );
};

export default SectionHeading;
