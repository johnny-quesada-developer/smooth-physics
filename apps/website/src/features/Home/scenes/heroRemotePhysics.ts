import { createWorker, unwrap } from 'easy-web-worker/createWorker';
import type { RemotePhysics } from '@/features/Stage/runtime/remotePhysics';
import type { HeroPhysicsWorker } from './heroPhysics.worker';
import heroPhysicsWorkerUrl from './heroPhysics.worker?worker&url';

// A worker that never answers is treated like one that failed, so the page takes the physics back.
const START_TIMEOUT_MS = 10_000;

export function connectHeroPhysics(): RemotePhysics {
  // A script that fails to load only fires an error event on the Worker; the method calls would wait forever.
  let fail: (error: Error) => void = () => undefined;
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  failed.catch(() => undefined);
  const worker = createWorker<HeroPhysicsWorker>(heroPhysicsWorkerUrl, {
    workerOptions: { type: 'module' },
    onWorkerError: () => fail(new Error('The physics worker could not start.')),
  });
  return {
    start: () =>
      Promise.race([
        worker.start(),
        failed,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The physics worker did not answer.')), START_TIMEOUT_MS)),
      ]),
    step: (input) => Promise.race([worker.step(input), failed]),
    dispose: () => void unwrap(worker).dispose(),
  };
}
