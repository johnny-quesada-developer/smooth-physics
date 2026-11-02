import * as THREE from 'three';
import type { SimulatedCloth } from 'smooth-physics';
import type { ThreeClothAdapter } from 'smooth-physics/three';
import type { SceneDefinition } from '@/features/Stage/runtime/types';
import { CLIPS } from '../clips';
import type { Vector } from '../clips/types';
import { ease } from '../motion/curves';
import { blendPose, copyPose, standingPose, type Pose } from '../motion/pose';
import { createNinja, tailName, type Ninja } from '../rig/ninja';
import { SIDES } from '../motion/pose';
import type { ClothStyle } from '@/features/Stage/runtime/types';

export type ShowreelState = { readonly clip: number; readonly percent: number };

// The stage value that turns the bandana physics on and off. Off, the tails keep their rest pose and follow the head
// rigidly, as they would without the library.
export const PHYSICS = 'physics';

// Clips meet in the standing pose, so the change between them is short; a jump starts from anywhere and takes longer.
const HANDOVER_SECONDS = 0.45;
const JUMP_SECONDS = 0.8;
// A fighter further than this from the start of the next clip moves there at once; the tails keep their shape
// (the cloth's teleport setting) instead of being dragged across the stage.
const SNAP_DISTANCE = 0.6;
// The library's highest rate: the smaller each step, the less a fast limb or a whipping tail moves through the other
// before the collision catches it.
const SIMULATION_RATE = 150;
// Enough steps to keep up at 150 Hz on a screen held at 30 frames a second.
const MAXIMUM_STEPS = 5;

type Fighter = { readonly ninja: Ninja; readonly shown: Pose; readonly target: Pose; readonly from: Pose };

// Plays the clips in a loop on one stage and tells the page which clip is on and how far it is.
export default class ShowreelDirector {
  private state: ShowreelState = { clip: 0, percent: 0 };
  private readonly listeners = new Set<() => void>();
  private clip = 0;
  private time = 0;
  private blend = { elapsed: Infinity, seconds: HANDOVER_SECONDS };
  private pending: number | null = null;
  // The partner's tails, found again whenever the stage builds a new cloth.
  private bound: { readonly cloth: ThreeClothAdapter; readonly partnerTails: readonly SimulatedCloth[] } | null = null;
  private partnerShown: boolean | null = null;
  private readonly wind: Vector = [0, 0, 0];

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): ShowreelState => this.state;

  jumpTo(clip: number): void {
    this.pending = clip;
  }

  // Builds the stage: called on the client when the canvas starts.
  createDefinition(): SceneDefinition {
    const root = new THREE.Group();
    const lead = fighterOf(createNinja({ name: 'lead' })),
      partner = fighterOf(createNinja({ name: 'partner', sash: 'honey', tone: 'graphite' }));
    const fighters = [lead, partner];
    for (const fighter of fighters) root.add(fighter.ninja.root);
    // Before the first frame: the lead stands ready and the partner waits off the stage, so a paused stage
    // still shows the pose the reel starts from.
    CLIPS[0]?.evaluate({ time: 0, lead: lead.shown, partner: partner.shown });
    for (const fighter of fighters) fighter.ninja.apply(fighter.shown);
    partner.ninja.root.visible = false;

    const leadColliders = lead.ninja.colliders.map((_, index) => index);
    const partnerColliders = partner.ninja.colliders.map((_, index) => index + lead.ninja.colliders.length);
    const styles: Record<string, ClothStyle> = {};
    // The partner's tails take a thread colour of their own, which the showreel paints darker than the lead's on a
    // dark page.
    for (const fighter of fighters) {
      const color = fighter === partner ? 'stone' : 'lime';
      for (const cloth of fighter.ninja.cloths) if (cloth.name) styles[cloth.name] = { color };
    }
    return {
      root,
      // The phone stage, at 4:3, sees less of the floor across, so it steps back to see the sprint as far across as
      // the wide stage at 16:10; a stage narrower still widens its view from there.
      camera: matchMedia('(min-width: 640px)').matches
        ? { target: [0, 1.05, 0], distance: 4.3, height: 1.6, azimuth: 0.12 }
        : { target: [0, 1.08, 0], distance: 5.3, height: 1.7, azimuth: 0.12, aspect: 4 / 3 },
      styles,
      subject: () => CLIPS[this.clip]?.bounds ?? null,
      setup: () => ({
        colliders: [...lead.ninja.colliders, ...partner.ninja.colliders],
        cloths: [
          ...lead.ninja.cloths.map((cloth) => ({ ...cloth, colliders: leadColliders })),
          ...partner.ninja.cloths.map((cloth) => ({ ...cloth, colliders: partnerColliders })),
        ],
      }),
      // Set here rather than as setup options: the stage passes the whole setup to the adapter as its spec, which
      // has no options key.
      configure: ({ values, cloth }) => {
        cloth.system.setFrequency(SIMULATION_RATE);
        cloth.system.maxStepsPerFrame = MAXIMUM_STEPS;
        // Turned on again, the cloth resets, so the tails start from the animated pose instead of where they stopped.
        cloth.setEnabled(values[PHYSICS] !== false);
      },
      animate: ({ deltaTime, cloth }) => this.step({ deltaTime, cloth, lead, partner }),
    };
  }

  private step({ deltaTime, cloth, lead, partner }: { deltaTime: number; cloth: ThreeClothAdapter; lead: Fighter; partner: Fighter }): void {
    if (this.bound?.cloth !== cloth) {
      const names = new Set(SIDES.map((side) => tailName({ ninja: partner.ninja.name, side })));
      this.bound = { cloth, partnerTails: cloth.simulations.filter((simulation) => names.has(simulation.name)) };
      this.partnerShown = null;
    }
    this.time += deltaTime;
    this.blend.elapsed += deltaTime;
    if (this.pending !== null) this.start({ clip: this.pending, jump: true, lead, partner });
    else if (this.time >= (CLIPS[this.clip]?.duration ?? 0)) this.start({ clip: (this.clip + 1) % CLIPS.length, jump: false, lead, partner });
    const clip = CLIPS[this.clip];
    if (!clip) return;

    clip.evaluate({ time: this.time, lead: lead.target, partner: partner.target });
    const amount = ease(this.blend.elapsed, 0, this.blend.seconds);
    for (const fighter of [lead, partner]) {
      blendPose({ from: fighter.from, to: fighter.target, amount, out: fighter.shown });
      fighter.ninja.apply(fighter.shown);
    }
    this.showPartner({ shown: clip.partnerOnStage(this.time), cloth, partner });
    if (clip.wind?.({ time: this.time, out: this.wind })) cloth.addForce({ force: this.wind });
    this.publish(Math.min(99, Math.floor((this.time / clip.duration) * 100)));
  }

  // A handover keeps the time past the end of the last clip; a jump starts the chosen clip from its beginning.
  private start({ clip, jump, lead, partner }: { clip: number; jump: boolean; lead: Fighter; partner: Fighter }): void {
    const next = CLIPS[clip];
    this.pending = null;
    if (!next) return;
    this.time = jump ? 0 : Math.max(0, this.time - (CLIPS[this.clip]?.duration ?? 0));
    this.clip = clip;
    this.blend = { elapsed: 0, seconds: jump ? JUMP_SECONDS : HANDOVER_SECONDS };
    next.evaluate({ time: this.time, lead: lead.target, partner: partner.target });
    for (const fighter of [lead, partner]) {
      copyPose({ from: fighter.shown, to: fighter.from });
      if (Math.hypot(fighter.target.x - fighter.from.x, fighter.target.z - fighter.from.z) > SNAP_DISTANCE) {
        fighter.from.x = fighter.target.x;
        fighter.from.z = fighter.target.z;
        fighter.from.yaw = fighter.target.yaw;
      }
    }
    // The partner enters and leaves in its clip; a jump to another clip takes it off at once.
    copyPose({ from: partner.target, to: partner.from });
  }

  private showPartner({ shown, cloth, partner }: { shown: boolean; cloth: ThreeClothAdapter; partner: Fighter }): void {
    if (shown === this.partnerShown) return;
    this.partnerShown = shown;
    partner.ninja.root.visible = shown;
    for (const simulation of this.bound?.partnerTails ?? []) cloth.setSimulationEnabled({ simulation, enabled: shown });
  }

  private publish(percent: number): void {
    if (percent === this.state.percent && this.clip === this.state.clip) return;
    this.state = { clip: this.clip, percent };
    for (const listener of this.listeners) listener();
  }
}

function fighterOf(ninja: Ninja): Fighter {
  return { ninja, shown: standingPose(), target: standingPose(), from: standingPose() };
}
