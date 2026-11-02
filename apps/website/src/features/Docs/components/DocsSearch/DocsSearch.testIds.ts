const DocsSearchTestIds = {
  root: 'docs-search',
  query: 'docs-search-query',
  results: 'docs-search-results',
  result: (id: string): string => `docs-search-result-${id}`,
  status: 'docs-search-status',
} as const;

export default DocsSearchTestIds;
