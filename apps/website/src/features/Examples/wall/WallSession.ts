// With the worker, one step is in flight at a time and the stage draws the newest frame it has.
import { createWorker, unwrap, type WorkerProxy } from 'easy-web-worker/createWorker';
import type { WallWorker } from './wall.worker';
import wallWorkerUrl from './wall.worker?worker&url';
import WallSimulation, { type WallFrame, type WallSpec } from './wallSimulation';
import WallStage from './WallStage';

export type WallThread = 'worker' | 'main';
export type WallStatistics = {
  readonly framesPerSecond: number;
  readonly physicsMilliseconds: number;
  readonly mainThreadMilliseconds: number;
  readonly particles: number;
};

const REPORT_INTERVAL_MS = 250;

export default class WallSession {
  private readonly stage: WallStage;
  private readonly thread: WallThread;
  private readonly spec: WallSpec;
  private readonly onStatistics: (statistics: WallStatistics) => void;
  private readonly onProblem: (message: string) => void;
  private readonly worker: WorkerProxy<WallWorker> | null;
  private local: WallSimulation | null = null;
  private frame = 0;
  private time = 0;
  private last = 0;
  private inFlight = false;
  private disposed = false;
  private particles = 0;
  private report = { since: 0, frames: 0, physicsMilliseconds: 0, mainThreadMilliseconds: 0 };

  constructor({
    canvas,
    host,
    spec,
    thread,
    onStatistics,
    onProblem,
  }: {
    canvas: HTMLCanvasElement;
    host: HTMLElement;
    spec: WallSpec;
    thread: WallThread;
    onStatistics: (statistics: WallStatistics) => void;
    onProblem: (message: string) => void;
  }) {
    this.stage = new WallStage({ canvas, host, spec });
    this.thread = thread;
    this.spec = spec;
    this.onStatistics = onStatistics;
    this.onProblem = onProblem;
    this.worker = thread === 'worker' ? createWorker<WallWorker>(wallWorkerUrl, { workerOptions: { type: 'module' } }) : null;
    void this.start();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    if (this.worker) void unwrap(this.worker).dispose();
    this.stage.dispose();
  }

  private async start(): Promise<void> {
    try {
      if (this.worker) this.particles = (await this.worker.start(this.spec)).particles;
      else {
        this.local = WallSimulation.create(this.spec);
        this.particles = this.local.particleCount;
      }
    } catch (error) {
      return this.onProblem(error instanceof Error ? error.message : 'The wall could not start.');
    }
    if (!this.disposed) this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    const deltaTime = this.last ? Math.min((now - this.last) / 1000, 1 / 20) : 1 / 60;
    this.last = now;
    this.time += deltaTime;
    const mainStart = performance.now();
    if (this.local) this.show(this.local.step({ deltaTime, time: this.time }));
    else this.requestStep(deltaTime);
    this.report.mainThreadMilliseconds += performance.now() - mainStart;
    this.report.frames++;
    this.publish(now);
    if (!this.disposed) this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  private requestStep(deltaTime: number): void {
    if (!this.worker || this.inFlight) return;
    this.inFlight = true;
    this.worker
      .step({ deltaTime, time: this.time })
      .then((frame) => {
        this.inFlight = false;
        if (!this.disposed) this.show(frame);
      })
      .catch((error: unknown) => {
        this.inFlight = false;
        if (!this.disposed) this.onProblem(error instanceof Error ? error.message : 'The worker stopped.');
      });
  }

  private show(frame: WallFrame): void {
    const drawStart = performance.now();
    this.stage.draw(frame.positions);
    this.report.physicsMilliseconds += frame.physicsMilliseconds;
    // Drawing a worker frame happens outside tick(), so its main-thread time is counted here.
    if (this.thread === 'worker') this.report.mainThreadMilliseconds += performance.now() - drawStart;
  }

  private publish(now: number): void {
    const report = this.report;
    if (!report.since) report.since = now;
    const elapsed = now - report.since;
    if (elapsed < REPORT_INTERVAL_MS) return;
    this.onStatistics({
      framesPerSecond: (report.frames * 1000) / elapsed,
      physicsMilliseconds: report.physicsMilliseconds / report.frames,
      mainThreadMilliseconds: report.mainThreadMilliseconds / report.frames,
      particles: this.particles,
    });
    this.report = { since: now, frames: 0, physicsMilliseconds: 0, mainThreadMilliseconds: 0 };
  }
}
