const WorkerWallPlaygroundTestIds = {
  root: 'worker-wall',
  canvas: 'worker-wall-canvas',
  chains: 'worker-wall-chains',
  thread: (thread: string): string => `worker-wall-thread-${thread}`,
  value: (name: string): string => `worker-wall-${name}`,
  problem: 'worker-wall-problem',
} as const;

export default WorkerWallPlaygroundTestIds;
