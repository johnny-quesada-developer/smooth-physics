import classNames from 'classnames';
import type { ComponentProps, FC, ReactNode } from 'react';

import twMerge from '@/tailwind/twMerge';
import { docHref } from '../../sections';
import type { DocGroup } from '../../types';
import DocsSidebarTestIds from './DocsSidebar.testIds';

type DocsSidebarProps = ComponentProps<'aside'> & {
  readonly groups: readonly DocGroup[];
  readonly current: string;
  readonly currentTitle: string;
  readonly search?: ReactNode;
};

// On phones the page list is closed behind a button; docsPage.client.ts opens it.
const DocsSidebar: FC<DocsSidebarProps> = ({ className, groups, current, currentTitle, search, ...props }) => {
  return (
    <aside className={twMerge(classNames('DocsSidebar', 'flex min-w-0 flex-col gap-3', className))} data-testid={DocsSidebarTestIds.root} {...props}>
      {search}
      <button
        aria-controls="docs-menu"
        aria-expanded="false"
        className="group flex min-h-touch w-full items-center justify-between gap-3 rounded-control border border-line bg-paper px-4 text-left text-sm font-medium lg:hidden"
        data-docs-menu-toggle
        data-testid={DocsSidebarTestIds.toggle}
        type="button"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-xs text-muted">Docs menu</span>
          <span className="truncate">{currentTitle}</span>
        </span>
        <span aria-hidden="true" className="text-muted transition-transform group-aria-expanded:rotate-180">
          ▾
        </span>
      </button>
      <nav
        aria-label="Docs"
        className="hidden flex-col gap-5 rounded-panel border border-line bg-surface p-3 data-open:flex lg:flex lg:border-0 lg:bg-transparent lg:p-0"
        data-docs-menu
        data-testid={DocsSidebarTestIds.menu}
        id="docs-menu"
      >
        {groups.map((group) => (
          <div className="flex flex-col gap-1" key={group.section}>
            <p className="px-3 text-xs font-semibold tracking-wide text-muted uppercase" id={`docs-group-${group.section}`}>
              {group.label}
            </p>
            <ul aria-labelledby={`docs-group-${group.section}`} className="flex flex-col">
              {group.pages.map((page) => (
                <li key={page.slug}>
                  <a
                    aria-current={page.slug === current ? 'page' : undefined}
                    className="flex min-h-touch items-center rounded-control px-3 text-sm text-muted transition-colors hover:bg-soft hover:text-ink aria-[current=page]:bg-lime-soft aria-[current=page]:font-medium aria-[current=page]:text-ink"
                    data-testid={DocsSidebarTestIds.link(page.slug)}
                    href={docHref(page.slug)}
                  >
                    {page.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default DocsSidebar;
