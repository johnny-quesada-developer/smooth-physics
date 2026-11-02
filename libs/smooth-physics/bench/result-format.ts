// The JSON shape of benchmark results and a validating reader for result files written earlier.

export type BenchResult = {
  readonly case: string;
  readonly particles: number;
  readonly setupMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly msPerStep: number;
  readonly stepsPerFrame: number;
  readonly contactsPerFrame: number;
  readonly spreadMs: number;
  // Node only: bytes the timed frames allocated, in kilobytes per frame.
  readonly allocatedKbPerFrame?: number;
};

const NUMBER_FIELDS = [
  'particles',
  'setupMs',
  'meanMs',
  'p50Ms',
  'p95Ms',
  'p99Ms',
  'maxMs',
  'msPerStep',
  'stepsPerFrame',
  'contactsPerFrame',
  'spreadMs',
] as const;

// Reads { results: [...] } (Node) or { engines: { name: { results: [...] } } } (browsers).
// Throws an Error naming the first problem.
export function readResultSets(input: unknown): ReadonlyMap<string, readonly BenchResult[]> {
  if (!isRecord(input)) fail('expected an object');
  const resultsByEngine = new Map<string, readonly BenchResult[]>();
  const engineResults: [string, unknown][] =
    'engines' in input && isRecord(input['engines'])
      ? Object.entries(input['engines']).map(([engine, report]) => [engine, isRecord(report) ? report['results'] : undefined])
      : [['node', input['results']]];
  for (const [engine, results] of engineResults) resultsByEngine.set(engine, readResults(results, `${engine}: `));
  return resultsByEngine;
}

export function readResults(input: unknown, label = ''): readonly BenchResult[] {
  const problem = (message: string): never => fail(`${label}${message}`);
  if (!Array.isArray(input)) return problem('expected a results array');
  const results: BenchResult[] = [];
  for (const [index, item] of input.entries()) {
    if (!isRecord(item) || typeof item['case'] !== 'string') problem(`result ${index} has no case name`);

    const numbers = new Map<string, number>();
    for (const field of NUMBER_FIELDS) {
      // spreadMs may be missing from a result file; it then counts as no spread.
      const value = item[field] ?? (field === 'spreadMs' ? 0 : undefined);
      if (typeof value !== 'number' || !Number.isFinite(value)) problem(`result ${index} field ${field} is not a finite number`);
      numbers.set(field, value);
    }

    const read = (field: (typeof NUMBER_FIELDS)[number]): number => numbers.get(field) ?? 0;
    results.push({
      case: item['case'],
      particles: read('particles'),
      setupMs: read('setupMs'),
      meanMs: read('meanMs'),
      p50Ms: read('p50Ms'),
      p95Ms: read('p95Ms'),
      p99Ms: read('p99Ms'),
      maxMs: read('maxMs'),
      msPerStep: read('msPerStep'),
      stepsPerFrame: read('stepsPerFrame'),
      contactsPerFrame: read('contactsPerFrame'),
      spreadMs: read('spreadMs'),
      ...(typeof item['allocatedKbPerFrame'] === 'number' ? { allocatedKbPerFrame: item['allocatedKbPerFrame'] } : {}),
    });
  }
  return results;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);
function fail(message: string): never {
  throw new Error(`Invalid benchmark results: ${message}.`);
}
