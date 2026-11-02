const ShowreelPlayerTestIds = {
  root: 'showreel-player',
  readout: 'showreel-player-readout',
  scenes: 'showreel-player-scenes',
  toggle: 'showreel-player-toggle',
  current: 'showreel-player-current',
  clip: (id: string): string => `showreel-player-clip-${id}`,
  progress: 'showreel-player-progress',
  framesPerSecond: 'showreel-player-fps',
  physics: 'showreel-player-physics',
  options: 'showreel-player-options',
  colliders: 'showreel-player-colliders',
  bandanaPhysics: 'showreel-player-bandana-physics',
  // The copies laid over the stage while it fills the screen.
  stageControls: 'showreel-player-stage-controls',
  stageClip: (id: string): string => `showreel-player-stage-clip-${id}`,
  stageColliders: 'showreel-player-stage-colliders',
  stageBandanaPhysics: 'showreel-player-stage-bandana-physics',
} as const;

export default ShowreelPlayerTestIds;
