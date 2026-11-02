import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';
import buttonStyles, { type ButtonSize, type ButtonTone } from './buttonStyles';

type ButtonProps = ComponentProps<'button'> & { readonly tone?: ButtonTone; readonly size?: ButtonSize };

const Button: FC<ButtonProps> = ({ className, tone, size, type = 'button', children, ...props }) => {
  return (
    <button className={twMerge(classNames('Button', buttonStyles({ tone, size }), className))} type={type} {...props}>
      {children}
    </button>
  );
};

export default Button;
