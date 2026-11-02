import { fround } from './float32/scalar.ts';
import type { ClothScene, ClothRecord, ColliderRecord } from './scene-format/types.ts';
import { Axes, SOLVER_COORDINATES, type PoseReader } from './coordinates.ts';
import { parseInput, systemOptionsSchema } from './spec-schemas.ts';
import { buildClothMesh } from './cloth-mesh/build.ts';
import { clothParameters } from './parameters.ts';
import { SimulatedCloth } from './simulated-cloth.ts';
import type { ForceInput, PoseSource, Precision, PrecisionInput, FrequencyScale } from './cloth-state.ts';

export type QualityLevel = 'full' | 'reduced' | 'minimum';
export type QualityReason = 'start' | 'motion' | 'slow-steps' | 'over-budget' | 'recovered';
export type Quality = {
  readonly level: QualityLevel;
  readonly frequency: number;
  readonly precision: Precision;
  readonly maxSteps: number;
  readonly physicsMs: number;
  readonly frameCap30: boolean;
};
export type QualityChange = Quality & { readonly previous: QualityLevel; readonly reason: QualityReason };
export type QualityListener = (change: QualityChange) => void;
export type MotionBoostMode = 'off' | 'free' | 'always';
export type AutoRate = {
  enabled: boolean;
  precision: boolean;
  budgetMs: number;
  slowStepMs: number;
  maxFrequency: number;
  maxSteps: number;
  rates: number[];
  average: number;
  perStep: number;
  changedAt: number;
  startedAt: number;
  reported: boolean;
  motionBoost: { mode: MotionBoostMode; frequency: number; speed: number; holdMs: number };
};
export type SystemStatistics = { frameMs: number; steps: number; particles: number; contacts: number; resets: number };
export type SystemOptions = {
  readonly frequency?: number;
  readonly maxStepsPerFrame?: number;
  readonly debug?: boolean;
  readonly include?: (cloth: ClothRecord) => boolean;
};

const NATIVE_AXES = new Axes(SOLVER_COORDINATES);

const LEVELS: Readonly<Record<QualityLevel, number>> = { full: 0, reduced: 1, minimum: 2 };

export class ClothSystem {
  readonly simulations: SimulatedCloth[] = [];
  // The scene's coordinates and their conversion to the solver's.
  axes: Axes = NATIVE_AXES;
  readonly debug: boolean;
  readonly stats: SystemStatistics = { frameMs: 0, steps: 0, particles: 0, contacts: 0, resets: 0 };
  readonly frameInterval = { mean: 0, spread: 0, last: 0 };
  readonly motion = { speed: 0, until: 0, applied: false };
  readonly autoRate: AutoRate;
  frequency = 90;
  simulationDeltaTime = fround(1 / 90);
  frequencyScale: FrequencyScale = [1, 1, 1, 1];
  maxStepsPerFrame: number;
  timeScale = 1;
  precision: Precision = 'default';
  // Set while the quality controller has switched 'rounded' to 'default', so it knows to switch back.
  private precisionLowered = false;
  private qualityLevel: QualityLevel = 'full';
  private readonly qualityListeners = new Set<QualityListener>();
  // Converts the caller's poses when the scene is not in the solver's coordinates.
  private poseReader: PoseReader | null = null;

  // Optional quality control, all off by default. While physics exceeds budgetMs per frame it lowers the
  // simulation frequency, then the steps per frame (1 to 5); it raises them again when there is room. With
  // precision on, a 'rounded' step slower than slowStepMs (no optimizing JIT) switches to 'default' until there is room.
  // motionBoost: while colliders move faster than speed (m/s), and for holdMs after, keep at least `frequency`
  // and cut steps per frame instead. 'free' boosts only when the frame already runs its maximum steps.
  constructor({ frequency = 90, maxStepsPerFrame = 3, debug = false }: Omit<SystemOptions, 'include'> = {}) {
    this.debug = debug;
    this.setFrequency(frequency);
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.autoRate = {
      enabled: false,
      precision: false,
      budgetMs: 6,
      slowStepMs: 4,
      maxFrequency: this.frequency,
      maxSteps: maxStepsPerFrame,
      rates: [150, 120, 90, 60, 45, 30],
      average: 0,
      perStep: 0,
      changedAt: 0,
      startedAt: 0,
      reported: false,
      motionBoost: { mode: 'off', frequency: 60, speed: 0.35, holdMs: 1000 },
    };
  }

  // Poses, forces and outputs are in the scene's coordinates. Throws SmoothPhysicsError ('INVALID_OPTIONS').
  static create({ scene, options = {} }: { scene: ClothScene; options?: SystemOptions }): ClothSystem {
    const checkedOptions: SystemOptions = parseInput({ schema: systemOptionsSchema, input: options, code: 'INVALID_OPTIONS' });
    const system = new ClothSystem(checkedOptions);
    const axes = new Axes(scene.coordinates);
    system.axes = axes;
    if (!axes.native) system.poseReader = axes.poseReader();

    for (const cloth of scene.cloths) {
      if (!cloth.enabled || (checkedOptions.include && !checkedOptions.include(cloth))) continue;
      system.simulations.push(createSimulation({ scene, cloth, axes }));
    }
    system.stats.particles = system.simulations.reduce((sum, simulation) => sum + simulation.particleCount, 0);
    return system;
  }

  onQualityChange(listener: QualityListener): () => void {
    this.qualityListeners.add(listener);
    return () => {
      this.qualityListeners.delete(listener);
    };
  }

  requestMotionBoost(holdMs = this.autoRate.motionBoost.holdMs): void {
    this.motion.until = Math.max(this.motion.until, performance.now() + holdMs);
  }

  get motionBoosted(): boolean {
    return this.motion.applied;
  }

  // Quality relative to the configured maximum. frameCap30 is true when frames arrive at a steady 30 fps,
  // which iOS Low Power Mode and the Limit Frame Rate setting both cause.
  get quality(): Quality {
    const autoRate = this.autoRate;
    const interval = this.frameInterval;
    const isFull = !this.precisionLowered && this.frequency >= autoRate.maxFrequency && this.maxStepsPerFrame >= autoRate.maxSteps;
    const isMinimum = this.frequency <= Math.min(...autoRate.rates) && this.maxStepsPerFrame <= 1;
    return {
      level: isFull ? 'full' : isMinimum ? 'minimum' : 'reduced',
      frequency: this.frequency,
      precision: this.precision,
      maxSteps: this.maxStepsPerFrame,
      physicsMs: Number(autoRate.average.toFixed(2)),
      frameCap30: interval.mean > 31.5 && interval.mean < 35.5 && interval.spread < 2.5,
    };
  }

  setPrecision(precision: PrecisionInput): void {
    this.precisionLowered = false;
    this.applyPrecision(precision === 'f32' || precision === 'rounded' ? 'rounded' : 'default');
  }

  private applyPrecision(precision: Precision): void {
    this.precision = precision;
    for (const simulation of this.simulations) simulation.precision = precision;
  }

  // Keeps a cloth behaving alike at every simulation rate. The solver terms are tuned at 90 Hz and scale with the
  // ratio 90 / frequency: [0] is the ratio itself, [1] scales distance and bending stiffness, [2] damping and [3] angle
  // restoration stiffness. Below 90 Hz stiffness and damping grow more slowly than the ratio.
  setFrequency(frequency: number): void {
    this.frequency = Math.min(Math.max(frequency, 30), 150);
    this.simulationDeltaTime = fround(1 / this.frequency);
    const rateRatio = fround(90 / this.frequency);
    this.frequencyScale = [
      rateRatio,
      rateRatio > 1 ? fround(Math.pow(rateRatio, 0.5)) : rateRatio,
      rateRatio > 1 ? fround(Math.pow(rateRatio, 0.3)) : rateRatio,
      fround(Math.pow(rateRatio, 1.8)),
    ];
  }

  reset(): void {
    for (const simulation of this.simulations) simulation.reset();
  }

  addForce(input: ForceInput): void {
    for (const simulation of this.simulations) simulation.addForce(input);
  }

  // Poses in the scene's coordinates.
  update({ frameDeltaTime, pose }: { frameDeltaTime: number; pose: PoseSource }): void {
    this.updateInSolverSpace({ frameDeltaTime, pose: this.poseReader ? this.poseReader.begin(pose) : pose });
  }

  // Poses already in the solver's coordinates, for adapters that convert them with axes.kernels as they read them.
  updateInSolverSpace({ frameDeltaTime, pose }: { frameDeltaTime: number; pose: PoseSource }): void {
    const startTime = performance.now();
    const interval = this.frameInterval;
    // Wall clock, so slow motion does not change the measured frame interval.
    const elapsedMs = interval.last ? startTime - interval.last : 0;
    interval.last = startTime;
    // Running averages of the interval and of its deviation; gaps of 200 ms or more (pauses) are left out.
    if (elapsedMs > 0 && elapsedMs < 200) {
      interval.mean = interval.mean ? interval.mean + (elapsedMs - interval.mean) * 0.05 : elapsedMs;
      interval.spread += (Math.abs(elapsedMs - interval.mean) - interval.spread) * 0.05;
    }

    const tracksMotion = this.autoRate.enabled && this.autoRate.motionBoost.mode !== 'off';
    let steps = 0;
    let contacts = 0;
    let resets = 0;
    for (const simulation of this.simulations) {
      simulation.precision = this.precision;
      resets += simulation.stats.resets;
      if (!simulation.enabled) continue;
      simulation.updateTime({
        frameDeltaTime,
        simulationDeltaTime: this.simulationDeltaTime,
        maximumSteps: this.maxStepsPerFrame,
        globalTimeScale: this.timeScale,
      });
      simulation.simulate({ pose, simulationDeltaTime: this.simulationDeltaTime, frequencyScale: this.frequencyScale });
      steps = Math.max(steps, simulation.stats.steps);
      contacts += simulation.stats.contacts;
    }
    this.stats.frameMs = performance.now() - startTime;
    this.stats.steps = steps;
    this.stats.contacts = contacts;
    this.stats.resets = resets;

    if (tracksMotion) this.trackMotion({ intervalMs: elapsedMs < 200 ? elapsedMs : 0, now: startTime });
    if (this.autoRate.enabled) this.adaptRate(performance.now());
  }

  private trackMotion({ intervalMs, now }: { intervalMs: number; now: number }): void {
    let fastestSpeed = 0;
    for (const simulation of this.simulations) {
      if (!simulation.enabled) continue;
      for (const collider of simulation.colliders) {
        const currentPosition = collider.framePosition;
        const previousPosition = collider.lastSeenPosition;
        // A copy: the collider writes each frame's position into the same array.
        if (!previousPosition) {
          collider.lastSeenPosition = [currentPosition[0], currentPosition[1], currentPosition[2]];
          continue;
        }
        const deltaX = currentPosition[0] - previousPosition[0];
        const deltaY = currentPosition[1] - previousPosition[1];
        const deltaZ = currentPosition[2] - previousPosition[2];
        previousPosition[0] = currentPosition[0];
        previousPosition[1] = currentPosition[1];
        previousPosition[2] = currentPosition[2];
        if (intervalMs <= 0) continue;
        const speed = Math.hypot(deltaX, deltaY, deltaZ) / (intervalMs / 1000);
        if (speed > fastestSpeed) fastestSpeed = speed;
      }
    }

    this.motion.speed = fastestSpeed;
    const boost = this.autoRate.motionBoost;
    if (fastestSpeed > boost.speed) this.motion.until = Math.max(this.motion.until, now + boost.holdMs);
  }

  private emitQuality(reason: QualityReason): void {
    const quality = this.quality;
    const previous = this.qualityLevel;
    if (quality.level === previous) return;
    this.qualityLevel = quality.level;
    const change: QualityChange = { ...quality, previous, reason: LEVELS[quality.level] < LEVELS[previous] ? 'recovered' : reason };
    if (this.debug) console.info('smooth-physics quality', change);
    for (const listener of this.qualityListeners) listener(change);
  }

  // The first 2 s include JIT warm-up and asset upload, so they never trigger a change.
  adaptRate(now: number): void {
    const autoRate = this.autoRate;
    if (!autoRate.startedAt) autoRate.startedAt = now;
    if (now - autoRate.startedAt < 2000) return;
    // The starting setting may already be reduced (for example a lower rate chosen by the app).
    if (!autoRate.reported) {
      autoRate.reported = true;
      this.emitQuality('start');
    }

    const boostOutcome = this.applyMotionBoost(now);
    if (boostOutcome.changed) return;

    // Running averages of the physics time per frame and per step.
    autoRate.average = autoRate.average ? autoRate.average * 0.8 + this.stats.frameMs * 0.2 : this.stats.frameMs;
    if (this.stats.steps > 0)
      autoRate.perStep = autoRate.perStep ? autoRate.perStep * 0.8 + (this.stats.frameMs / this.stats.steps) * 0.2 : this.stats.frameMs / this.stats.steps;

    // Going down reacts within 0.4 s; going up waits 2 s so the rate does not oscillate.
    const since = now - autoRate.changedAt;
    if (since < 400) return;
    if (autoRate.precision && this.precision === 'rounded' && autoRate.perStep > autoRate.slowStepMs) {
      this.applyPrecision('default');
      this.precisionLowered = true;
      autoRate.changedAt = now;
      autoRate.average *= 0.6;
      autoRate.perStep *= 0.6;
      this.emitQuality('slow-steps');
      return;
    }
    this.adjustRateAndSteps({ now, since, floor: boostOutcome.floor });
  }

  // Fast motion raises the rate at once. 'free' requires that the frame already needs its maximum steps at the
  // current rate, so a higher rate adds no steps per frame. The floor is the lowest rate the boost allows.
  private applyMotionBoost(now: number): { changed: boolean; floor: number } {
    const autoRate = this.autoRate;
    const boost = autoRate.motionBoost;
    const moving = boost.mode !== 'off' && now < this.motion.until;
    const capped = (this.frameInterval.mean * this.frequency) / 1000 >= this.maxStepsPerFrame * 0.9;
    const boosted = moving && (boost.mode === 'always' || (boost.mode === 'free' && (capped || this.motion.applied)));
    const floor = boosted ? Math.min(boost.frequency, autoRate.maxFrequency) : 0;
    this.motion.applied = boosted && this.frequency <= floor;

    if (!(boosted && this.frequency < floor && now - autoRate.changedAt > 100)) return { changed: false, floor };
    autoRate.average *= floor / this.frequency;
    autoRate.changedAt = now;
    this.setFrequency(floor);
    this.motion.applied = true;
    this.emitQuality('motion');
    return { changed: true, floor };
  }

  private adjustRateAndSteps({ now, since, floor }: { now: number; since: number; floor: number }): void {
    const autoRate = this.autoRate;
    // The rates are listed from highest to lowest, so a higher index is a lower rate.
    const rates = autoRate.rates.filter((rate) => rate <= autoRate.maxFrequency);
    const rateIndex = rates.indexOf(this.frequency);
    let frequency = this.frequency;
    let maxSteps = this.maxStepsPerFrame;

    // Off the list: take the highest listed rate at or below the current one, else the lowest. Over budget: lower the
    // rate (not below the boost floor), then the steps. With room (under 70% of the budget after the change): raise
    // the steps, then the rate.
    if (rateIndex < 0) frequency = rates.find((rate) => rate <= this.frequency) ?? rates[rates.length - 1];
    else if (autoRate.average > autoRate.budgetMs) {
      if (rateIndex < rates.length - 1 && rates[rateIndex + 1] >= floor) frequency = rates[rateIndex + 1];
      else if (maxSteps > 1) maxSteps--;
    } else if (since < 2000) return;
    else if (maxSteps < autoRate.maxSteps) {
      if ((autoRate.average * (maxSteps + 1)) / maxSteps < autoRate.budgetMs * 0.7) maxSteps++;
    } else if (rateIndex > 0 && (autoRate.average * rates[rateIndex - 1]) / this.frequency < autoRate.budgetMs * 0.7) frequency = rates[rateIndex - 1];
    else if (
      autoRate.precision &&
      this.precisionLowered &&
      rateIndex === 0 &&
      autoRate.perStep * 1.5 < autoRate.slowStepMs &&
      autoRate.average * 1.5 < autoRate.budgetMs * 0.7
    ) {
      // Full rate with room to spare (for example after Low Power Mode ends): return to 'rounded'.
      this.applyPrecision('rounded');
      this.precisionLowered = false;
      autoRate.changedAt = now;
      this.emitQuality('recovered');
      return;
    }

    if (frequency === this.frequency && maxSteps === this.maxStepsPerFrame) return;
    // Physics time is about proportional to the steps run, so the average is rescaled for the new setting.
    autoRate.average *= (frequency / this.frequency) * (maxSteps / this.maxStepsPerFrame);
    autoRate.changedAt = now;
    const lowered = frequency < this.frequency || maxSteps < this.maxStepsPerFrame;
    this.maxStepsPerFrame = maxSteps;
    if (frequency !== this.frequency) this.setFrequency(frequency);
    this.emitQuality(lowered ? 'over-budget' : 'recovered');
  }
}

function createSimulation({ scene, cloth, axes }: { scene: ClothScene; cloth: ClothRecord; axes: Axes }): SimulatedCloth {
  const mesh = buildClothMesh({ scene, cloth });
  const parameters = clothParameters(cloth.configuration);
  const colliders: ColliderRecord[] = [];
  for (const reference of cloth.configuration.colliderContact.colliders) {
    const collider = scene.colliders.get(reference.referenceId);
    if (collider) colliders.push(collider);
  }
  return new SimulatedCloth({ mesh, parameters, colliders, axes, settings: cloth.settings });
}
