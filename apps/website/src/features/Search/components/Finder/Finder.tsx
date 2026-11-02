import classNames from 'classnames';
import { useEffect, useId, useMemo, useRef, type ComponentProps, type FC } from 'react';

import Button from '@/components/Button';
import twMerge from '@/tailwind/twMerge';
import useFinder from '../../stores/finderStore';
import { rankDocuments } from '../../vectors/rank';
import type { SearchIndex } from '../../vectors/types';
import FinderResult from '../FinderResult';
import FinderTestIds from './Finder.testIds';

export type FacetGroup = { readonly facet: string; readonly label: string; readonly values: readonly string[] };

type FinderProps = ComponentProps<'section'> & { readonly index: SearchIndex; readonly facetGroups: readonly FacetGroup[]; readonly heading: string };

const Finder: FC<FinderProps> = ({ className, index, facetGroups, heading, ...props }) => {
  const [{ query, facets }, { setQuery, toggleFacet, clear }] = useFinder();
  const results = useMemo(() => rankDocuments({ index, query, facets }), [index, query, facets]);
  const queryId = useId();
  const queryRef = useRef<HTMLInputElement>(null);
  const filtered = query.trim() !== '' || Object.values(facets).some((values) => values.length > 0);

  // Text typed before the island hydrated is adopted, not discarded.
  useEffect(() => {
    const typed = queryRef.current?.value ?? '';
    if (typed !== '') setQuery(typed);
  }, [setQuery]);
  return (
    <section className={twMerge(classNames('Finder', 'flex flex-col gap-6', className))} data-testid={FinderTestIds.root} {...props}>
      <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 shadow-raised sm:p-5">
        <label className="text-sm font-semibold" htmlFor={queryId}>
          {heading}
        </label>
        <div className="flex gap-2">
          <input
            autoComplete="off"
            className="min-h-touch w-full min-w-0 rounded-control border border-line bg-paper px-4 text-base placeholder:text-muted"
            data-testid={FinderTestIds.query}
            id={queryId}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="For example: cape in the wind, collider friction"
            ref={queryRef}
            type="search"
            value={query}
          />
          <Button data-testid={FinderTestIds.clear} disabled={!filtered} onClick={() => clear()} tone="quiet">
            Clear
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {facetGroups.map((group) => (
            <div className="flex flex-wrap items-center gap-2" key={group.facet} role="group" aria-label={group.label}>
              <span className="w-full text-xs font-semibold tracking-wide text-muted uppercase sm:w-24">{group.label}</span>
              {group.values.map((value) => {
                const pressed = facets[group.facet]?.includes(value) ?? false;
                return (
                  <button
                    aria-pressed={pressed}
                    className="min-h-touch rounded-full border border-line px-3 text-sm text-muted transition-colors hover:border-muted hover:text-ink aria-pressed:border-lime aria-pressed:bg-lime-soft aria-pressed:text-lime"
                    data-testid={FinderTestIds.facet({ facet: group.facet, value })}
                    key={value}
                    onClick={() => toggleFacet({ facet: group.facet, value })}
                    type="button"
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="text-sm text-muted" data-testid={FinderTestIds.count}>
        {results.length === 1 ? '1 match' : `${results.length} matches`}
        {query.trim() ? ', most similar first' : ''}
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid={FinderTestIds.results}>
        {results.map((result) => (
          <li className="flex" key={result.id}>
            <FinderResult className="w-full" ranked={query.trim() !== ''} result={result} />
          </li>
        ))}
      </ul>
    </section>
  );
};

export default Finder;
