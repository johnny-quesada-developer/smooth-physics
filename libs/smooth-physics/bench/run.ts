// Node benchmark. Writes JSON; with --compare, also reports the change against an earlier result and fails when a
// case's mean frame time grows past --tolerance (a fraction).
// Usage: vpx bench/run.ts [--repeats 3] [--frames 1200] [--cases all|solver|three] [--out result.json]
//        [--compare baseline.json --tolerance 0.15] [--parameter-style]
// Results also carry allocatedKbPerFrame: the heap the timed frames allocated, from V8's garbage collection records.
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { GCProfiler } from 'node:v8';
import { parseArgs } from 'node:util';
import { compareResults, formatComparison } from './compare.ts';
import { CASES, THREE_CASES } from './cases.ts';
import { measureAll, type AllocationProbe } from './measure.ts';
import { measureParameterStyle } from './parameter-style.ts';
import { readResultSets } from './result-format.ts';

const { values } = parseArgs({
  options: {
    repeats: { type: 'string', default: '3' },
    frames: { type: 'string', default: '1200' },
    out: { type: 'string' },
    compare: { type: 'string' },
    tolerance: { type: 'string', default: '0.15' },
    cases: { type: 'string', default: 'all' },
    'parameter-style': { type: 'boolean', default: false },
  },
});

if (values['parameter-style']) {
  console.info(JSON.stringify(measureParameterStyle()));
  process.exit(0);
}

const results = measureAll({
  repeats: Number(values.repeats),
  frames: Number(values.frames),
  cases: values.cases === 'three' ? [] : CASES,
  threeCases: values.cases === 'solver' ? [] : THREE_CASES,
  allocations: heapAllocations(),
  onResult: (result) => console.info(JSON.stringify(result)),
});
const report = {
  engine: `node ${process.version} (V8 ${process.versions.v8})`,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  platform: `${os.platform()} ${os.release()}`,
  loadAverage: os.loadavg().map((load) => Number(load.toFixed(2))),
  date: new Date().toISOString(),
  parameterStyle: measureParameterStyle(),
  results,
};

if (values.out) writeFileSync(values.out, `${JSON.stringify(report, null, 1)}\n`);
if (values.compare) {
  const baseline = readResultSets(JSON.parse(readFileSync(values.compare, 'utf8')));
  const comparisons = compareResults({ baseline: baseline.get('node') ?? [], current: results, tolerance: Number(values.tolerance) });
  for (const comparison of comparisons) console.info(formatComparison(comparison));
  process.exit(comparisons.some((comparison) => comparison.slower) ? 1 : 0);
}

// Allocated bytes = what the collections in the window freed + how much the heap grew over it.
function heapAllocations(): AllocationProbe {
  let profiler: GCProfiler | null = null;
  let usedAtStart = 0;
  return {
    start(): void {
      profiler = new GCProfiler();
      profiler.start();
      usedAtStart = process.memoryUsage().heapUsed;
    },
    stop(): number {
      const usedAtEnd = process.memoryUsage().heapUsed;
      const statistics = profiler?.stop()?.statistics ?? [];
      const freed = statistics.reduce(
        (sum, collection) => sum + collection.beforeGC.heapStatistics.usedHeapSize - collection.afterGC.heapStatistics.usedHeapSize,
        0,
      );
      return Math.max(0, freed + usedAtEnd - usedAtStart);
    },
  };
}
