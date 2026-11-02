import { FLIP } from './flip';
import { SPARRING } from './sparring';
import { SPRINT } from './sprint';
import type { Clip } from './types';
import { WIND } from './wind';

// The order the reel plays in; each clip starts and ends in the standing pose, so the loop closes on itself.
export const CLIPS: readonly Clip[] = [SPRINT, FLIP, SPARRING, WIND];
