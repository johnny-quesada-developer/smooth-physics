// Validating reader for the recorded golden traces.
import { readFileSync } from 'node:fs';
import type { Precision } from '../src/cloth-state.ts';

export type GoldenTrace = { readonly scene: string; readonly precision: Precision; readonly frames: number; readonly hashes: readonly string[] };

export function readGoldenTraces(url: URL): GoldenTrace[] {
  const parsed: unknown = JSON.parse(readFileSync(url, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('traces' in parsed) || !Array.isArray(parsed.traces))
    throw new Error(`${url.pathname}: expected { traces: [] }.`);
  return parsed.traces.map((trace: unknown, index) => readTrace({ trace, label: `${url.pathname} trace ${index}` }));
}

function readTrace({ trace, label }: { trace: unknown; label: string }): GoldenTrace {
  if (typeof trace !== 'object' || trace === null) throw new Error(`${label}: expected an object.`);
  const scene = 'scene' in trace ? trace.scene : undefined;
  const precision = 'precision' in trace ? trace.precision : undefined;
  const frames = 'frames' in trace ? trace.frames : undefined;
  const hashes = 'hashes' in trace ? trace.hashes : undefined;
  if (typeof scene !== 'string' || (precision !== 'rounded' && precision !== 'default') || typeof frames !== 'number' || !Array.isArray(hashes)) {
    throw new Error(`${label}: expected scene, precision, frames and hashes.`);
  }

  const strings = hashes.filter((hash: unknown): hash is string => typeof hash === 'string');
  if (strings.length !== hashes.length) throw new Error(`${label}: every hash must be a string.`);
  return { scene, precision, frames, hashes: strings };
}
