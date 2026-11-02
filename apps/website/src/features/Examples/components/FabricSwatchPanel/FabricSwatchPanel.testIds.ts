const FabricSwatchPanelTestIds = {
  root: (id: number): string => `fabric-panel-${id}`,
  name: 'fabric-panel-name',
  control: (key: string): string => `fabric-panel-${key}`,
  pause: 'fabric-panel-pause',
  reset: 'fabric-panel-reset',
  remove: 'fabric-panel-remove',
  physics: 'fabric-panel-physics',
  fps: 'fabric-panel-fps',
} as const;

export default FabricSwatchPanelTestIds;
