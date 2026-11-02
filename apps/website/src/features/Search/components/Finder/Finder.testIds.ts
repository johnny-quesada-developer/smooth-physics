const FinderTestIds = {
  root: 'finder',
  query: 'finder-query',
  clear: 'finder-clear',
  count: 'finder-count',
  results: 'finder-results',
  facet: ({ facet, value }: { facet: string; value: string }): string => `finder-facet-${facet}-${value.replaceAll(' ', '-')}`,
} as const;

export default FinderTestIds;
