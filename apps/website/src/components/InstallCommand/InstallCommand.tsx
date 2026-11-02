import classNames from 'classnames';
import { useEffect, useState, type ComponentProps, type FC, type KeyboardEvent } from 'react';

import twMerge from '@/tailwind/twMerge';
import InstallCommandTestIds from './InstallCommand.testIds';

type PackageManager = 'npm' | 'yarn' | 'pnpm';

type InstallCommandProps = ComponentProps<'div'> & { readonly packageName: string };

const MANAGERS: readonly PackageManager[] = ['npm', 'yarn', 'pnpm'];
const COMMANDS: Readonly<Record<PackageManager, string>> = { npm: 'npm install', yarn: 'yarn add', pnpm: 'pnpm add' };

const InstallCommand: FC<InstallCommandProps> = ({ className, packageName, ...props }) => {
  const [manager, setManager] = useState<PackageManager>('npm');
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const command = `${COMMANDS[manager]} ${packageName}`;

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (!copied) return undefined;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  // Arrow keys move between the tabs, as in any tab list.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = MANAGERS[(MANAGERS.indexOf(manager) + step + MANAGERS.length) % MANAGERS.length] ?? 'npm';
    setManager(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-manager="${next}"]`)?.focus();
  };

  const copy = (): void => {
    void navigator.clipboard.writeText(command).then(() => setCopied(true));
  };

  return (
    <div
      className={twMerge(classNames('InstallCommand', 'flex flex-col overflow-hidden rounded-panel border border-line bg-soft text-left', className))}
      data-testid={InstallCommandTestIds.root}
      {...props}
    >
      <div aria-label="Package manager" className="flex border-b border-line px-2" onKeyDown={onKeyDown} role="tablist">
        {MANAGERS.map((name) => (
          <button
            aria-selected={name === manager}
            className={classNames(
              'min-h-touch border-b-2 px-3 font-mono text-sm transition-colors',
              name === manager ? 'border-lime text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
            data-manager={name}
            data-testid={InstallCommandTestIds.tab(name)}
            disabled={!hydrated}
            key={name}
            onClick={() => setManager(name)}
            role="tab"
            tabIndex={name === manager ? 0 : -1}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 pl-4" role="tabpanel">
        <code className="min-w-0 flex-1 overflow-x-auto py-3 font-mono text-sm whitespace-nowrap" data-testid={InstallCommandTestIds.command}>
          <span aria-hidden="true" className="text-muted select-none">
            ${' '}
          </span>
          {command}
        </code>
        <button
          aria-label={copied ? 'Copied' : 'Copy the install command'}
          className="min-h-touch px-4 text-sm text-muted transition-colors hover:text-ink disabled:opacity-50"
          data-testid={InstallCommandTestIds.copy}
          disabled={!hydrated}
          onClick={copy}
          type="button"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

export default InstallCommand;
