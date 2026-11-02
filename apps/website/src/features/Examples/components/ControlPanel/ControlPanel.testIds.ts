const ControlPanelTestIds = {
  root: 'control-panel',
  control: (key: string): string => `control-${key}`,
  option: ({ key, value }: { key: string; value: string }): string => `control-${key}-${value}`,
} as const;

export default ControlPanelTestIds;
