import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';

type ContainerProps = ComponentProps<'div'>;

const Container: FC<ContainerProps> = ({ className, children, ...props }) => {
  return (
    <div className={twMerge(classNames('Container', 'mx-auto w-full max-w-6xl px-4 sm:px-6', className))} {...props}>
      {children}
    </div>
  );
};

export default Container;
