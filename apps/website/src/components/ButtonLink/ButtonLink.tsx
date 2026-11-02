import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import { buttonStyles, type ButtonSize, type ButtonTone } from '@/components/Button';
import twMerge from '@/tailwind/twMerge';

type ButtonLinkProps = ComponentProps<'a'> & { readonly tone?: ButtonTone; readonly size?: ButtonSize };

const ButtonLink: FC<ButtonLinkProps> = ({ className, tone, size, children, ...props }) => {
  return (
    <a className={twMerge(classNames('ButtonLink', buttonStyles({ tone, size }), className))} {...props}>
      {children}
    </a>
  );
};

export default ButtonLink;
