import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';
import MenuButtonTestIds from './MenuButton.testIds';

type MenuButtonProps = ComponentProps<'button'>;

const MenuButton: FC<MenuButtonProps> = ({ className, ...props }) => {
  return (
    <button
      aria-controls="site-menu"
      aria-expanded="false"
      aria-label="Menu"
      className={twMerge(
        classNames(
          'MenuButton',
          'inline-flex size-touch items-center justify-center rounded-control text-muted transition-colors hover:bg-soft hover:text-ink',
          className,
        ),
      )}
      data-menu-toggle
      data-testid={MenuButtonTestIds.root}
      type="button"
      {...props}
    >
      <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    </button>
  );
};

export default MenuButton;
