import classNames from 'classnames';
import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type FC, type KeyboardEvent } from 'react';

import Badge from '@/components/Badge';
import { rankDocuments } from '@/features/Search/vectors/rank';
import type { SearchIndex } from '@/features/Search/vectors/types';
import twMerge from '@/tailwind/twMerge';
import DocsSearchTestIds from './DocsSearch.testIds';

type DocsSearchProps = ComponentProps<'div'> & { readonly indexUrl: string };

type IndexState = { readonly status: 'idle' | 'loading' } | { readonly status: 'ready'; readonly index: SearchIndex } | { readonly status: 'failed' };

const MAXIMUM_RESULTS = 8;
const NO_FACETS = {};

// The index of every docs page and example is fetched on first use, so pages that are only read never download it.
const DocsSearch: FC<DocsSearchProps> = ({ className, indexUrl, ...props }) => {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<IndexState>({ status: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const resultsId = useId();

  const requested = useRef(false);

  const load = (): void => {
    if (requested.current) return;
    requested.current = true;
    setState({ status: 'loading' });
    fetch(indexUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`The search index answered ${response.status}.`);
        const index: SearchIndex = await response.json();
        setState({ status: 'ready', index });
      })
      .catch((error: unknown) => {
        setState({ status: 'failed' });
        throw error;
      });
  };

  // Text typed before the island hydrated is adopted, not discarded.
  useEffect(() => {
    const typed = inputRef.current?.value ?? '';
    if (typed !== '') setQuery(typed);
  }, []);

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed !== '') load();
  });

  const results = useMemo(
    () =>
      state.status === 'ready' && trimmed !== '' ? rankDocuments({ index: state.index, query: trimmed, facets: NO_FACETS }).slice(0, MAXIMUM_RESULTS) : [],
    [state, trimmed],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') setQuery('');
  };

  const status =
    trimmed === ''
      ? null
      : state.status === 'failed'
        ? 'The search is not available right now.'
        : state.status !== 'ready'
          ? 'Loading the search…'
          : results.length === 0
            ? 'No page matches.'
            : null;

  return (
    <div className={twMerge(classNames('DocsSearch', 'flex flex-col gap-2', className))} data-testid={DocsSearchTestIds.root} role="search" {...props}>
      <label className="sr-only" htmlFor={inputId}>
        Search the docs and examples
      </label>
      <input
        aria-controls={resultsId}
        autoComplete="off"
        className="min-h-touch w-full min-w-0 rounded-control border border-line bg-paper px-3 text-base placeholder:text-muted lg:text-sm"
        data-testid={DocsSearchTestIds.query}
        id={inputId}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onFocus={load}
        onKeyDown={onKeyDown}
        placeholder="Search the docs"
        ref={inputRef}
        type="search"
        value={query}
      />
      <p aria-live="polite" className={classNames('px-1 text-sm text-muted', status ? null : 'sr-only')} data-testid={DocsSearchTestIds.status}>
        {status ?? (results.length ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}` : '')}
      </p>
      <ul className={classNames('flex flex-col', results.length ? null : 'hidden')} data-testid={DocsSearchTestIds.results} id={resultsId}>
        {results.map((result) => (
          <li key={result.id}>
            <a
              className="flex min-h-touch items-center gap-2 rounded-control px-3 text-sm hover:bg-soft"
              data-testid={DocsSearchTestIds.result(result.id)}
              href={result.href}
            >
              <span className="min-w-0 flex-1 truncate">{result.title}</span>
              <Badge tone={result.kind === 'example' ? 'lime' : 'honey'}>{result.kind === 'example' ? 'Example' : 'Docs'}</Badge>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DocsSearch;
