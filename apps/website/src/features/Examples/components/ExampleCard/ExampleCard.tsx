import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import Badge from '@/components/Badge';
import twMerge from '@/tailwind/twMerge';
import type { Example } from '../../catalogue/types';
import ExampleCardTestIds from './ExampleCard.testIds';
import { sitePath } from '@/site/paths';

type ExampleCardProps = ComponentProps<'a'> & { readonly example: Example };

const ExampleCard: FC<ExampleCardProps> = ({ className, example, ...props }) => {
  return (
    <a
      className={twMerge(
        classNames(
          'ExampleCard',
          'flex flex-col gap-3 rounded-panel border border-line bg-surface p-5 shadow-raised transition-colors hover:border-muted',
          className,
        ),
      )}
      data-testid={ExampleCardTestIds.root(example.slug)}
      href={sitePath(`/examples/${example.slug}/`)}
      {...props}
    >
      <span className="flex flex-wrap gap-2">
        {example.facets.level.map((level) => (
          <Badge key={level} tone="lime">
            {level}
          </Badge>
        ))}
        {example.facets.connection.map((connection) => (
          <Badge key={connection}>{connection}</Badge>
        ))}
      </span>
      <span className="text-lg font-semibold">{example.title}</span>
      <span className="text-sm text-pretty text-muted">{example.summary}</span>
    </a>
  );
};

export default ExampleCard;
