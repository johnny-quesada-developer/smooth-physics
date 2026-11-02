// Benchmark cases: synthetic scenes at a 60 Hz display rate (1.5 solver steps per frame at 90 Hz).
import type { Precision } from '../src/cloth-state.ts';
import type { SceneKind, SceneSize } from '../test/scenes.ts';

export type BenchCase = { readonly scene: SceneKind; readonly size: SceneSize; readonly precision: Precision };

export const CASES: readonly BenchCase[] = [
  { scene: 'robe', size: 'small', precision: 'rounded' },
  { scene: 'robe', size: 'medium', precision: 'rounded' },
  { scene: 'robe', size: 'large', precision: 'rounded' },
  { scene: 'robe', size: 'xlarge', precision: 'rounded' },
  { scene: 'robe', size: 'medium', precision: 'default' },
  { scene: 'robe', size: 'xlarge', precision: 'default' },
  { scene: 'chains', size: 'large', precision: 'rounded' },
  { scene: 'curtain', size: 'large', precision: 'rounded' },
];

export const caseName = ({ scene, size, precision }: BenchCase): string => `${scene}-${size}-${precision}`;

// The three.js adapter around the solver: reading the bones, the step, writing them back and the matrix updates.
export type ThreeCase = { readonly scene: SceneKind; readonly size: SceneSize; readonly precision: Precision };

export const THREE_CASES: readonly ThreeCase[] = [
  { scene: 'mannequin', size: 'medium', precision: 'rounded' },
  { scene: 'mannequin', size: 'xlarge', precision: 'rounded' },
  { scene: 'mannequin', size: 'medium', precision: 'default' },
];

export const threeCaseName = ({ scene, size, precision }: ThreeCase): string => `three-${scene}-${size}-${precision}`;
