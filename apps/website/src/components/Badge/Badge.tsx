import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import tv from '@/tailwind/tv';
import twMerge from '@/tailwind/twMerge';

const badgeStyles = tv({
  base: 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  variants: {
    tone: {
      neutral: 'bg-soft text-muted',
      lime: 'bg-lime-soft text-lime',
      honey: 'bg-honey-soft text-honey',
      sage: 'bg-sage-soft text-sage',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

type BadgeProps = ComponentProps<'span'> & { readonly tone?: 'neutral' | 'lime' | 'honey' | 'sage' };

const Badge: FC<BadgeProps> = ({ className, tone, children, ...props }) => {
  return (
    <span className={twMerge(classNames('Badge', badgeStyles({ tone }), className))} {...props}>
      {children}
    </span>
  );
};

export default Badge;
