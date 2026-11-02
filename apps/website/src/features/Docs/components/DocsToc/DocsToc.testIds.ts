const DocsTocTestIds = {
  root: 'docs-toc',
  link: (slug: string): string => `docs-toc-link-${slug}`,
} as const;

export default DocsTocTestIds;
