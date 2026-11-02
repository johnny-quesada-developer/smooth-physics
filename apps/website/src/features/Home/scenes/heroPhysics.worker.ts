import { defineWorker } from 'easy-web-worker/defineWorker';
import { createScenePhysics } from '@/features/Stage/runtime/scenePhysics';
import { createHeroScene } from './heroScene';

const physics = createScenePhysics(createHeroScene);

export const worker = defineWorker(() => ({ start: physics.start, step: physics.step }));

export type HeroPhysicsWorker = typeof worker;
