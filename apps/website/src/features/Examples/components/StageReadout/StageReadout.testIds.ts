const StageReadoutTestIds = {
  root: 'stage-readout',
  value: (name: string): string => `stage-readout-${name}`,
} as const;

export default StageReadoutTestIds;
