import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';

type PanelProps = ComponentProps<'section'>;

const Panel: FC<PanelProps> = ({ className, children, ...props }) => {
  return (
    <section className={twMerge(classNames('Panel', 'rounded-panel border border-line bg-surface p-5 shadow-raised', className))} {...props}>
      {children}
    </section>
  );
};

export default Panel;
