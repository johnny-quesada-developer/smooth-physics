import { defineWorker } from 'easy-web-worker/defineWorker';
import WallSimulation, { type WallFrame, type WallSpec, type WallStep } from './wallSimulation';

export type WallStart = { readonly particles: number };

let simulation: WallSimulation | null = null;

export const worker = defineWorker(() => ({
  start: (spec: WallSpec): WallStart => {
    simulation = WallSimulation.create(spec);
    return { particles: simulation.particleCount };
  },
  // The positions are copied back: about 11 KB a frame for 64 chains, 27 KB for 160. For much larger buffers,
  // onMessage().handle can transfer them instead of copying.
  step: (input: WallStep): WallFrame => {
    if (!simulation) throw new Error('The wall has not started.');
    return simulation.step(input);
  },
}));

export type WallWorker = typeof worker;
