// What the three.js adapter writes into the bones must not change: these hashes were recorded with the adapter that
// mirrored poses itself, before the library took over the coordinate conversion.
import { describe, expect, test } from 'vite-plus/test';
import { readGoldenTraces } from './golden-file.ts';
import { threeTrace } from './three-trace.ts';

const traces = readGoldenTraces(new URL('./golden/three.json', import.meta.url));

describe('three.js adapter golden traces', () => {
  for (const trace of traces) {
    test(`${trace.scene} ${trace.precision}`, () => {
      expect(threeTrace({ precision: trace.precision, frames: trace.frames })).toEqual(trace.hashes);
    });
  }
});
