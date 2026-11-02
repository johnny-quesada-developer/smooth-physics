import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import Badge from '@/components/Badge';
import twMerge from '@/tailwind/twMerge';
import type { RankedDocument } from '../../vectors/types';
import FinderResultTestIds from './FinderResult.testIds';

type FinderResultProps = ComponentProps<'a'> & { readonly result: RankedDocument; readonly ranked: boolean };

const FinderResult: FC<FinderResultProps> = ({ className, result, ranked, ...props }) => {
  const percentage = Math.round(Math.min(1, result.score) * 100);
  return (
    <a
      className={twMerge(
        classNames(
          'FinderResult',
          'flex flex-col gap-3 rounded-panel border border-line bg-surface p-5 shadow-raised transition-colors hover:border-muted',
          className,
        ),
      )}
      data-testid={FinderResultTestIds.root(result.id)}
      href={result.href}
      {...props}
    >
      <span className="flex items-center gap-2">
        <Badge tone={result.kind === 'example' ? 'lime' : 'honey'}>{result.kind === 'example' ? 'Example' : 'Docs'}</Badge>
        {ranked ? (
          <span className="ml-auto flex items-center gap-2 text-xs text-muted" data-testid={FinderResultTestIds.score}>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-soft">
              <span className="block h-full rounded-full bg-lime" style={{ width: `${percentage}%` }} />
            </span>
            {percentage}% match
          </span>
        ) : null}
      </span>
      <span className="text-lg font-semibold">{result.title}</span>
      <span className="text-sm text-pretty text-muted">{result.summary}</span>
    </a>
  );
};

export default FinderResult;
