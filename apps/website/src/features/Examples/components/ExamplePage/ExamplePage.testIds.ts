const ExamplePageTestIds = {
  root: 'example-page',
  title: 'example-page-title',
  code: 'example-page-code',
  guide: (slug: string): string => `example-page-guide-${slug}`,
} as const;

export default ExamplePageTestIds;
