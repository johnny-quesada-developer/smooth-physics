// Synthetic scenes that turn on the options the skeleton scenes leave off: the animation blend, a behind limit on
// another bone axis, step and multi-key curves, and outward normals on a triangle cloth.
import type { ClothOverride, SceneKind } from './scenes.ts';

export type OptionScene = { readonly name: string; readonly kind: SceneKind; readonly override: ClothOverride };

export const OPTION_SCENES: readonly OptionScene[] = [
  {
    name: 'chains-blend-behind-steps',
    kind: 'chains',
    override: {
      settings: {
        animationBlend: 0.35,
        behindLimit: { radius: 0.3, distance: [0, 0.05], axis: '-z' },
        radius: {
          scale: 0.02,
          keys: [
            { time: 0, value: 1, inSlope: 0, outSlope: 'step' },
            { time: 0.5, value: 0.5, inSlope: 0, outSlope: 0 },
            { time: 1, value: 0.8, inSlope: 0.6, outSlope: 0 },
          ],
        },
      },
    },
  },
  {
    name: 'curtain-outward-curves',
    kind: 'curtain',
    override: {
      normals: 'outward',
      settings: {
        animationBlend: 0.6,
        stiffness: {
          keys: [
            { time: 0, value: 1, inSlope: 0, outSlope: -1.2 },
            { time: 0.4, value: 0.6, inSlope: -0.5, outSlope: -0.5 },
            { time: 0.7, value: 0.5, inSlope: 'step', outSlope: 0 },
            { time: 1, value: 0.3, inSlope: 0, outSlope: 0 },
          ],
        },
      },
    },
  },
  { name: 'mannequin-outward-animated', kind: 'mannequin', override: { normals: 'outward', settings: { animationBlend: 1 } } },
];
