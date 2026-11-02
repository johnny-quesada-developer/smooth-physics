const FinderResultTestIds = {
  root: (id: string): string => `finder-result-${id}`,
  score: 'finder-result-score',
} as const;

export default FinderResultTestIds;
