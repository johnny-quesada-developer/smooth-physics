import { createGlobalState } from 'react-global-state-hooks';

export type FinderState = { readonly query: string; readonly facets: Readonly<Record<string, readonly string[]>> };

const INITIAL_STATE: FinderState = { query: '', facets: {} };

const useFinder = createGlobalState(INITIAL_STATE, {
  name: 'finder',
  actions: {
    setQuery(query: string) {
      return ({ setState }) => {
        setState((state) => ({ ...state, query }));
      };
    },
    toggleFacet({ facet, value }: { facet: string; value: string }) {
      return ({ setState }) => {
        setState((state) => {
          const selected = state.facets[facet] ?? [];
          const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
          return { ...state, facets: { ...state.facets, [facet]: next } };
        });
      };
    },
    clear() {
      return ({ setState }) => {
        setState(INITIAL_STATE);
      };
    },
  },
});

export default useFinder;
