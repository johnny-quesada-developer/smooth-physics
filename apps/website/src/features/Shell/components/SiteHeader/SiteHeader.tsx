import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import ButtonLink from '@/components/ButtonLink';
import twMerge from '@/tailwind/twMerge';
import MenuButton from '../MenuButton';
import ThemeToggle from '../ThemeToggle';
import SiteHeaderTestIds from './SiteHeader.testIds';
import { sitePath } from '@/site/paths';

export type SiteSection = 'examples' | 'docs';

type SiteHeaderProps = ComponentProps<'header'> & { readonly current?: SiteSection };

const SECTIONS: readonly { readonly section: SiteSection; readonly label: string; readonly href: string }[] = [
  { section: 'examples', label: 'Examples', href: sitePath('/examples/') },
  { section: 'docs', label: 'Docs', href: sitePath('/docs/getting-started/') },
];

const SiteHeader: FC<SiteHeaderProps> = ({ className, current, ...props }) => {
  return (
    <header
      className={twMerge(classNames('SiteHeader', 'sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md', className))}
      data-testid={SiteHeaderTestIds.root}
      {...props}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <a
          className="flex min-h-touch items-center gap-2 rounded-control pr-2 text-base font-semibold tracking-tight"
          data-testid={SiteHeaderTestIds.home}
          href={sitePath('/')}
        >
          <Wordmark />
          smooth-physics
        </a>
        <div className="ml-auto flex items-center gap-1 md:order-last">
          <ThemeToggle />
          <ButtonLink className="hidden md:inline-flex" href={sitePath('/docs/getting-started/')} tone="primary">
            Get started <span aria-hidden="true">→</span>
          </ButtonLink>
          <MenuButton className="md:hidden" />
        </div>
        <nav
          aria-label="Main"
          className="hidden w-full flex-col gap-1 pb-2 data-open:flex md:flex md:w-auto md:flex-row md:pb-0"
          data-menu
          data-testid={SiteHeaderTestIds.menu}
          id="site-menu"
        >
          {SECTIONS.map(({ section, label, href }) => (
            <a
              aria-current={section === current ? 'page' : undefined}
              className="flex min-h-touch items-center rounded-control px-3 text-sm font-medium text-muted transition-colors hover:bg-soft hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-lime aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8"
              data-testid={SiteHeaderTestIds.link(section)}
              href={href}
              key={section}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default SiteHeader;

const Wordmark: FC = () => {
  return (
    <svg aria-hidden="true" className="size-7" viewBox="0 0 28 28">
      <rect className="fill-ink" height="2.5" rx="1.25" width="22" x="3" y="4" />
      <path className="fill-none stroke-honey" d="M8 6.5c0 6 -2 10 0 16" strokeLinecap="round" strokeWidth="2.5" />
      <path className="fill-none stroke-lime" d="M14 6.5c0 5 2 8 0 12" strokeLinecap="round" strokeWidth="2.5" />
      <path className="fill-none stroke-sage" d="M20 6.5c0 7 -1.5 11 1 15" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
};
