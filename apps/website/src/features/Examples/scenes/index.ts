import type { SceneDefinition } from '@/features/Stage/runtime/types';
import type { ExampleSlug } from '../catalogue/types';
import { createBannerFieldScene } from './bannerField';
import { createCurtainScene } from './curtain';
import { createDressFormScene } from './dressForm';
import { createFringeLampScene } from './fringeLamp';
import { createHangingChainsScene } from './hangingChains';
import { createRibbonBatonScene } from './ribbonBaton';

export type StageExampleSlug = Exclude<ExampleSlug, 'worker-wall' | 'fabric-lab'>;

export const SCENES: Readonly<Record<StageExampleSlug, () => SceneDefinition>> = {
  'hanging-chains': createHangingChainsScene,
  curtain: createCurtainScene,
  'dress-form': createDressFormScene,
  'fringe-lamp': createFringeLampScene,
  'ribbon-baton': createRibbonBatonScene,
  'banner-field': createBannerFieldScene,
};

export function isStageExample(slug: ExampleSlug): slug is StageExampleSlug {
  return slug !== 'worker-wall' && slug !== 'fabric-lab';
}
