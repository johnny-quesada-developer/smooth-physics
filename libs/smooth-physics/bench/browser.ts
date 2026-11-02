// Browser benchmark: bundles bench/browser.html with Vite+, serves it on loopback and runs it in Playwright engines.
// Usage: [WEBKIT_EXECUTABLE=…] [CHROMIUM_EXECUTABLE=…] vpx bench/browser.ts [--out result.json] [--engines webkit,chromium]
//        [--repeats 3] [--frames 1200] [--cases all|solver|three] [--only case,case] [--compare baseline.json --tolerance 0.15]
// The executable variables select already installed browser builds when they differ from the ones Playwright expects.
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, webkit, type BrowserType } from 'playwright';
import { build } from 'vite-plus';
import { compareResults, formatComparison } from './compare.ts';
import { readResults, readResultSets, type BenchResult } from './result-format.ts';

type EngineReport = { readonly version: string; readonly userAgent: string; readonly parameterStyle: unknown; readonly results: readonly BenchResult[] };

const ENGINES: Readonly<Record<string, BrowserType>> = { webkit, chromium };
const CONTENT_TYPES: Readonly<Record<string, string>> = { '.html': 'text/html', '.js': 'text/javascript' };

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    engines: { type: 'string', default: 'webkit,chromium' },
    repeats: { type: 'string', default: '3' },
    frames: { type: 'string', default: '1200' },
    cases: { type: 'string', default: 'all' },
    only: { type: 'string' },
    compare: { type: 'string' },
    tolerance: { type: 'string', default: '0.15' },
  },
});
if (!values.out && !values.compare) throw new Error('--out or --compare is required.');

const outDirectory = mkdtempSync(join(tmpdir(), 'smooth-physics-bench-'));
try {
  await build({
    root: fileURLToPath(new URL('.', import.meta.url)),
    base: './',
    logLevel: 'warn',
    build: { outDir: outDirectory, emptyOutDir: true, rollupOptions: { input: 'browser.html' } },
  });

  const server = await serve(outDirectory);
  const report: { date: string; engines: Record<string, EngineReport> } = { date: new Date().toISOString(), engines: {} };
  try {
    const { port } = addressOf(server);
    for (const name of values.engines.split(',')) {
      const engine = ENGINES[name];
      if (!engine) throw new Error(`Unknown engine ${name}.`);
      const executablePath = process.env[`${name.toUpperCase()}_EXECUTABLE`];
      const url = `http://127.0.0.1:${port}/browser.html?repeats=${values.repeats}&frames=${values.frames}&cases=${values.cases}${values.only ? `&only=${values.only}` : ''}`;
      report.engines[name] = await runEngine({ engine, url, ...(executablePath ? { executablePath } : {}) });
      for (const result of report.engines[name]?.results ?? []) console.info(name, JSON.stringify(result));
    }
  } finally {
    server.close();
  }

  if (values.out) writeFileSync(values.out, `${JSON.stringify(report, null, 1)}\n`);
  if (values.compare) process.exitCode = compareEngines({ report, baselineFile: values.compare, tolerance: Number(values.tolerance) });
} finally {
  rmSync(outDirectory, { recursive: true, force: true });
}

async function runEngine({ engine, url, executablePath }: { engine: BrowserType; url: string; executablePath?: string }): Promise<EngineReport> {
  const browser = await engine.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForSelector('#benchmark[data-state="done"]', { state: 'attached', timeout: 900_000 });
    if (errors.length) throw new Error(errors.join('\n'));

    const parsed: unknown = JSON.parse((await page.textContent('#benchmark')) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null || !('results' in parsed)) throw new Error('The page wrote no results.');
    const results = readResults(parsed.results);
    return {
      version: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      parameterStyle: 'parameterStyle' in parsed ? parsed.parameterStyle : null,
      results,
    };
  } finally {
    await browser.close();
  }
}

function compareEngines({
  report,
  baselineFile,
  tolerance,
}: {
  report: { engines: Record<string, EngineReport> };
  baselineFile: string;
  tolerance: number;
}): number {
  const baseline = readResultSets(JSON.parse(readFileSync(baselineFile, 'utf8')));
  let slower = false;
  for (const [name, engine] of Object.entries(report.engines)) {
    for (const comparison of compareResults({ baseline: baseline.get(name) ?? [], current: engine.results, tolerance })) {
      console.info(`${name.padEnd(9)} ${formatComparison(comparison)}`);
      slower ||= comparison.slower;
    }
  }
  return slower ? 1 : 0;
}

function serve(root: string): Promise<Server> {
  const server = createServer((request, response) => {
    const filePath = join(root, decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname));
    // Serves only files inside root: a path that climbs out of it with .. is refused like a missing one.
    if (!filePath.startsWith(root + sep) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function addressOf(server: Server): AddressInfo {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The server has no TCP address.');
  return address;
}
