import type { SubjectBounds } from '@/features/Stage/runtime/types';
import type { Pose } from '../motion/pose';

export type ClipId = 'sprint' | 'flip' | 'sparring' | 'wind';
export type Vector = [number, number, number];

export type Clip = {
  readonly id: ClipId;
  readonly title: string;
  // One line for the stage label and the clip list.
  readonly summary: string;
  readonly duration: number;
  // Where both fighters and their cloth stay through the clip, so the camera can keep them in frame. Measured by playing
  // the clip with its cloth, rounded out.
  readonly bounds: SubjectBounds;
  // Writes both fighters' poses at a time in the clip. The lead starts and ends in the standing pose at the centre.
  evaluate(input: { readonly time: number; readonly lead: Pose; readonly partner: Pose }): void;
  // Whether the partner is on the stage at a time in the clip.
  partnerOnStage(time: number): boolean;
  // Wind as an acceleration in m/s², written into out; false when still.
  wind?(input: { readonly time: number; readonly out: Vector }): boolean;
};
