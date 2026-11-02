// Solver paths the other scenes leave alone, recorded before the solver's memory refactor: every trace must stay
// bit for bit.
import { describe, expect, test } from 'vite-plus/test';
import { coverageTrace } from './coverage-trace.ts';
import { readGoldenTraces } from './golden-file.ts';

const traces = readGoldenTraces(new URL('./golden/coverage.json', import.meta.url));

describe('coverage golden traces', () => {
  for (const trace of traces) {
    test(`${trace.scene} ${trace.precision}`, () => {
      expect(coverageTrace({ name: trace.scene, precision: trace.precision, frames: trace.frames })).toEqual(trace.hashes);
    });
  }
});
