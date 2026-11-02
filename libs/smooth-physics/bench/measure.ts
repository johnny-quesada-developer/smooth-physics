// Runs benchmark cases in any JavaScript engine. Solver cases time ClothSystem.update, the solver's per-frame cost.
// three.js cases time ThreeClothAdapter.update, and report separately the part spent outside ClothSystem.update.
import { ClothSystem } from '../src/cloth-system.ts';
import { buildScene, createDriver } from '../test/scenes.ts';
import { buildThreeScene } from '../test/three-scenes.ts';
import { CASES, THREE_CASES, caseName, threeCaseName, type BenchCase, type ThreeCase } from './cases.ts';
import type { BenchResult } from './result-format.ts';

// Counts the bytes allocated between start and stop. Only engines that expose their heap can provide one.
export type AllocationProbe = { start(): void; stop(): number };
export type MeasureOptions = { readonly warmupFrames?: number; readonly frames?: number; readonly allocations?: AllocationProbe };
type FrameSample = { readonly ms: number; readonly steps: number; readonly contacts: number };

export function measureCase({ benchCase, warmupFrames = 300, frames = 1200, allocations }: { benchCase: BenchCase } & MeasureOptions): BenchResult {
  const synthetic = buildScene({ kind: benchCase.scene, size: benchCase.size });
  const driver = createDriver(synthetic);
  const setupStart = performance.now();
  const system = ClothSystem.create({ scene: synthetic.scene });
  const setupMs = performance.now() - setupStart;
  system.setPrecision(benchCase.precision);

  const { samples, allocated } = sampleFrames({
    warmupFrames,
    frames,
    allocations,
    frame: (frameIndex) => {
      driver.advance(frameIndex / 60);
      const start = performance.now();
      system.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
      return { ms: performance.now() - start, steps: system.stats.steps, contacts: system.stats.contacts };
    },
  });

  requireFinite({ system, name: caseName(benchCase) });
  return summarize({ name: caseName(benchCase), particles: system.stats.particles, setupMs, samples, allocated });
}

// Two results: the whole adapter update, and the part of it spent outside ClothSystem.update.
export function measureThreeCase({
  threeCase,
  warmupFrames = 300,
  frames = 1200,
  allocations,
}: { threeCase: ThreeCase } & MeasureOptions): readonly [BenchResult, BenchResult] {
  const setupStart = performance.now();
  const scene = buildThreeScene({ kind: threeCase.scene, size: threeCase.size });
  const setupMs = performance.now() - setupStart;
  const system = scene.adapter.system;
  system.setPrecision(threeCase.precision);

  const outsideSamples: FrameSample[] = [];
  const { samples, allocated } = sampleFrames({
    warmupFrames,
    frames,
    allocations,
    frame: (frameIndex) => {
      scene.adapter.restore();
      scene.animate(frameIndex / 60);
      const start = performance.now();
      scene.adapter.update({ deltaTime: 1 / 60, root: scene.root });
      const updateMs = performance.now() - start;
      // stats.frameMs is the time the solver took inside this adapter update.
      if (frameIndex >= warmupFrames) outsideSamples.push({ ms: updateMs - system.stats.frameMs, steps: system.stats.steps, contacts: system.stats.contacts });
      return { ms: updateMs, steps: system.stats.steps, contacts: system.stats.contacts };
    },
  });

  const name = threeCaseName(threeCase);
  requireFinite({ system, name });
  return [
    summarize({ name, particles: system.stats.particles, setupMs, samples, allocated }),
    summarize({ name: `${name}-outside-solver`, particles: system.stats.particles, setupMs, samples: outsideSamples }),
  ];
}

// Runs every case `repeats` times and keeps, per case, the repeat with the median mean frame time.
export function measureAll({
  repeats = 3,
  cases = CASES,
  threeCases = THREE_CASES,
  onResult,
  ...options
}: MeasureOptions & {
  repeats?: number;
  cases?: readonly BenchCase[];
  threeCases?: readonly ThreeCase[];
  onResult?: (result: BenchResult) => void;
}): BenchResult[] {
  const median = (runs: readonly BenchResult[]): BenchResult => {
    const sorted = runs.toSorted((first, second) => first.meanMs - second.meanMs);
    const middle = sorted[Math.floor(sorted.length / 2)];
    const fastest = sorted[0];
    const slowest = sorted.at(-1);
    if (!middle || !fastest || !slowest) throw new Error('repeats must be at least 1.');
    const result = { ...middle, spreadMs: round({ value: slowest.meanMs - fastest.meanMs }) };
    onResult?.(result);
    return result;
  };
  const solverResults = cases.map((benchCase) => median(Array.from({ length: repeats }, () => measureCase({ benchCase, ...options }))));

  // A three.js run yields two results; runs are ranked by the first, the whole adapter update.
  const threeResults = threeCases.flatMap((threeCase) => {
    const runs = Array.from({ length: repeats }, () => measureThreeCase({ threeCase, ...options })).toSorted(
      ([first], [second]) => first.meanMs - second.meanMs,
    );
    const middle = runs[Math.floor(runs.length / 2)];
    if (!middle) throw new Error('repeats must be at least 1.');
    const spreadMs = round({ value: (runs.at(-1)?.[0].meanMs ?? 0) - (runs[0]?.[0].meanMs ?? 0) });
    return middle.map((result) => {
      const withSpread = { ...result, spreadMs };
      onResult?.(withSpread);
      return withSpread;
    });
  });
  return [...solverResults, ...threeResults];
}

function sampleFrames({
  warmupFrames,
  frames,
  allocations,
  frame,
}: {
  warmupFrames: number;
  frames: number;
  allocations: AllocationProbe | undefined;
  frame: (index: number) => FrameSample;
}): { samples: FrameSample[]; allocated: number | null } {
  const samples: FrameSample[] = [];
  for (let frameIndex = 0; frameIndex < warmupFrames; frameIndex++) frame(frameIndex);
  allocations?.start();
  for (let frameIndex = warmupFrames; frameIndex < warmupFrames + frames; frameIndex++) samples.push(frame(frameIndex));
  return { samples, allocated: allocations ? allocations.stop() : null };
}

function summarize({
  name,
  particles,
  setupMs,
  samples,
  allocated = null,
}: {
  name: string;
  particles: number;
  setupMs: number;
  samples: readonly FrameSample[];
  allocated?: number | null;
}): BenchResult {
  const sorted = samples.map((sample) => sample.ms).toSorted((first, second) => first - second);
  const total = sorted.reduce((sum, time) => sum + time, 0);
  const steps = samples.reduce((sum, sample) => sum + sample.steps, 0);
  const contacts = samples.reduce((sum, sample) => sum + sample.contacts, 0);
  const frames = samples.length;
  const percentile = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
  return {
    case: name,
    particles,
    setupMs: round({ value: setupMs }),
    meanMs: round({ value: total / frames }),
    p50Ms: round({ value: percentile(0.5) }),
    p95Ms: round({ value: percentile(0.95) }),
    p99Ms: round({ value: percentile(0.99) }),
    maxMs: round({ value: sorted.at(-1) ?? 0 }),
    msPerStep: round({ value: total / steps }),
    stepsPerFrame: round({ value: steps / frames, digits: 2 }),
    contactsPerFrame: round({ value: contacts / frames, digits: 1 }),
    spreadMs: 0,
    ...(allocated === null ? {} : { allocatedKbPerFrame: round({ value: allocated / 1024 / frames, digits: 2 }) }),
  };
}

function requireFinite({ system, name }: { system: ClothSystem; name: string }): void {
  const finite = system.simulations.every((simulation) => simulation.positions.every(Number.isFinite));
  if (!finite || system.stats.resets) throw new Error(`${name} became non-finite.`);
}

const round = ({ value, digits = 3 }: { value: number; digits?: number }): number => Number(value.toFixed(digits));
