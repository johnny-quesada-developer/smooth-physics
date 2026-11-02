import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import twMerge from '@/tailwind/twMerge';
import ThemeToggleTestIds from './ThemeToggle.testIds';

type ThemeToggleProps = ComponentProps<'button'>;

const ThemeToggle: FC<ThemeToggleProps> = ({ className, ...props }) => {
  return (
    <button
      aria-label="Dark theme"
      aria-pressed="false"
      className={twMerge(
        classNames(
          'ThemeToggle',
          'inline-flex size-touch items-center justify-center rounded-control text-muted transition-colors hover:bg-soft hover:text-ink',
          className,
        ),
      )}
      data-testid={ThemeToggleTestIds.root}
      data-theme-toggle
      type="button"
      {...props}
    >
      <svg aria-hidden="true" className="size-5 dark:hidden" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
      <svg
        aria-hidden="true"
        className="hidden size-5 dark:block"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
};

export default ThemeToggle;
