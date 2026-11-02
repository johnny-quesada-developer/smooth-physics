// Compares mean frame times against a baseline; a case fails when it grows past the tolerance (a fraction) and by more
// than MINIMUM_SLOWDOWN_MS. The three.js "outside solver" results are reported but never fail: they are the difference
// of two timings, a few hundredths of a millisecond, and in WebKit the timer counts whole milliseconds.
import type { BenchResult } from './result-format.ts';

const MINIMUM_SLOWDOWN_MS = 0.01;
const INFORMATIONAL_SUFFIX = '-outside-solver';

export type Comparison = { readonly case: string; readonly baselineMs: number; readonly currentMs: number; readonly change: number; readonly slower: boolean };

export function compareResults({
  baseline,
  current,
  tolerance,
}: {
  baseline: readonly BenchResult[];
  current: readonly BenchResult[];
  tolerance: number;
}): Comparison[] {
  const baselineByCase = new Map(baseline.map((result) => [result.case, result]));
  return current.flatMap((result) => {
    const baselineResult = baselineByCase.get(result.case);
    if (!baselineResult) return [];
    const change = result.meanMs / baselineResult.meanMs - 1;
    const slower = !result.case.endsWith(INFORMATIONAL_SUFFIX) && change > tolerance && result.meanMs - baselineResult.meanMs > MINIMUM_SLOWDOWN_MS;
    return [{ case: result.case, baselineMs: baselineResult.meanMs, currentMs: result.meanMs, change, slower }];
  });
}

export const formatComparison = (comparison: Comparison): string =>
  `${comparison.case.padEnd(32)} ${comparison.baselineMs.toFixed(3)} -> ${comparison.currentMs.toFixed(3)} ms/frame (${(comparison.change * 100).toFixed(1)}%)${comparison.slower ? '  SLOWER' : ''}`;
