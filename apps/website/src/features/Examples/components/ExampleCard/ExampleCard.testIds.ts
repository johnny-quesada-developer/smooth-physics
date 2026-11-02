const ExampleCardTestIds = {
  root: (slug: string): string => `example-card-${slug}`,
} as const;

export default ExampleCardTestIds;
