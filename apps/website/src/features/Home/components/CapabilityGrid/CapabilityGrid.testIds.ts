const CapabilityGridTestIds = {
  root: 'capability-grid',
  item: (name: string): string => `capability-grid-item-${name}`,
} as const;

export default CapabilityGridTestIds;
