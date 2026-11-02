import type { RemoteFrame, RemoteStart, RemoteStep } from './scenePhysics';

// The page's side of a scene whose physics runs in a Web Worker.
export type RemotePhysics = {
  start(): Promise<RemoteStart>;
  step(input: RemoteStep): Promise<RemoteFrame>;
  dispose(): void;
};
