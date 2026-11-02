import { PACKAGE_NAME } from '@/site/package';
import type { ControlDefinition, Example } from './types';

const GRAVITY: ControlDefinition = {
  kind: 'range',
  key: 'gravity',
  label: 'Gravity',
  minimum: 0,
  maximum: 15,
  step: 0.5,
  initial: 5,
  unit: 'm/s²',
  timing: 'tuning',
};
const STIFFNESS: ControlDefinition = {
  kind: 'range',
  key: 'stiffness',
  label: 'Tip stiffness',
  minimum: 0.1,
  maximum: 1,
  step: 0.05,
  initial: 0.5,
  timing: 'tuning',
};
const CONTACT: ControlDefinition = {
  kind: 'choice',
  key: 'contact',
  label: 'Contact',
  options: [
    { value: 'edge', label: 'Edge' },
    { value: 'point', label: 'Point' },
    { value: 'off', label: 'Off' },
  ],
  initial: 'edge',
  timing: 'tuning',
};

export const EXAMPLES: readonly Example[] = [
  {
    slug: 'hanging-chains',
    hasColliders: true,
    grabbable: 'ball',
    title: 'Hanging chains',
    summary: 'The minimal setup: independent bone chains on a swinging bar, swept by a sphere collider.',
    description: [
      'Each chain is a line of bones whose first bone is fixed to the bar. The solver keeps the links at their rest length, bends them back toward their rest angles and lets gravity pull them down.',
      'A sphere collider sweeps through the chains; drag it to push them yourself. Change the gravity, the damping and the stiffness of the tips while it runs: the cloth is retuned in place, so the chains keep swinging.',
    ],
    tags: ['chains', 'chain', 'pendulum', 'gravity', 'damping', 'sphere collider', 'live tuning', 'beginner'],
    facets: { connection: ['chains'], feature: ['gravity', 'colliders', 'tuning'], level: ['beginner'], runtime: ['main thread'] },
    controls: [
      GRAVITY,
      { kind: 'range', key: 'damping', label: 'Damping', minimum: 0, maximum: 0.4, step: 0.01, initial: 0.05, timing: 'tuning' },
      STIFFNESS,
      { kind: 'switch', key: 'ball', label: 'Moving ball', initial: true, timing: 'live' },
      { kind: 'action', key: 'push', label: 'Push' },
    ],
    code: `import * as THREE from 'three';
import { tuneCloth } from '${PACKAGE_NAME}';
import { createThreeCloth } from '${PACKAGE_NAME}/three';

const cloth = createThreeCloth({
  three: THREE,
  root: rig,
  spec: {
    colliders: [{ object: ball, shape: 'sphere', radius: 0.12 }],
    cloths: [
      {
        name: 'chains',
        bones: chainRoots,
        anchor: bar,
        connection: 'chains',
        colliders: [0],
        settings: { gravity: 5, damping: 0.05, stiffness: [1, 0.5] },
      },
    ],
  },
});

// A slider retunes the running cloth without a reset. Settings left out keep their current values.
const [chains] = cloth.simulations;
if (chains) tuneCloth({ simulation: chains, settings: { gravity: 9.8 } });`,
  },
  {
    slug: 'curtain',
    hasColliders: true,
    grabbable: 'pusher',
    title: 'Curtain in the wind',
    summary: 'Neighbouring chains joined into one surface, with bending stiffness, gusts of wind and a sliding pusher.',
    description: [
      'The nearest connection joins chain roots by distance and builds triangles between neighbouring chains, so the curtain bends as one surface instead of as separate strings.',
      'Wind is a force added to every particle each frame. The capsule pusher uses edge contact, which also stops the surface between particles. Drag the pusher through the curtain, then switch the contact to point and compare.',
    ],
    tags: ['nearest', 'surface', 'curtain', 'flag', 'wind', 'force', 'bending', 'capsule collider', 'edge contact'],
    facets: { connection: ['nearest'], feature: ['wind', 'colliders', 'bending'], level: ['intermediate'], runtime: ['main thread'] },
    controls: [
      { kind: 'range', key: 'wind', label: 'Wind', minimum: 0, maximum: 20, step: 1, initial: 6, unit: 'm/s²', timing: 'live' },
      { kind: 'range', key: 'bending', label: 'Bending stiffness', minimum: 0.05, maximum: 1, step: 0.05, initial: 0.8, timing: 'tuning' },
      STIFFNESS,
      GRAVITY,
      CONTACT,
    ],
    code: `colliders: [{ object: pusher, shape: 'capsule', radius: 0.08, length: 0.66, axis: 'x' }],
cloths: [
  {
    name: 'curtain',
    bones: chainRoots,
    anchor: rail,
    connection: 'nearest',
    colliders: [0],
    settings: { bendingStiffness: 0.8, collision: { mode: 'edge', friction: 0.2 } },
  },
],

// Every frame, after restore() and the animation:
cloth.addForce({ force: [wind * 0.25, 0, -wind] });`,
  },
  {
    slug: 'dress-form',
    hasColliders: true,
    title: 'Robe on a mannequin',
    summary: 'A loop of chains around the hips that walks and twirls, kept out of the legs by capsule colliders.',
    description: [
      'The ring connection closes the ring of chains, so the first and the last chain are neighbours. Tapered capsules follow each thigh and shin.',
      'Change the simulation rate to see the trade between cost and stability, and switch between edge and point contact to compare how the robe slides over the legs.',
    ],
    tags: ['ring', 'robe', 'capsule collider', 'tapered capsule', 'walk', 'twirl', 'frequency', 'rate'],
    facets: { connection: ['ring'], feature: ['colliders', 'animation', 'rate'], level: ['intermediate'], runtime: ['main thread'] },
    controls: [
      {
        kind: 'choice',
        key: 'motion',
        label: 'Motion',
        options: [
          { value: 'walk', label: 'Walk' },
          { value: 'twirl', label: 'Twirl' },
          { value: 'still', label: 'Still' },
        ],
        initial: 'walk',
        timing: 'live',
      },
      {
        kind: 'choice',
        key: 'rate',
        label: 'Simulation rate',
        options: [
          { value: '60', label: '60 Hz' },
          { value: '90', label: '90 Hz' },
          { value: '120', label: '120 Hz' },
        ],
        initial: '90',
        timing: 'live',
      },
      CONTACT,
    ],
    code: `colliders: [
  { object: hips, shape: 'capsule', radius: 0.14, length: 0.3, axis: 'x' },
  // A tapered capsule for every thigh and shin, centred on the bone.
  { object: leftThigh, shape: 'capsule', radius: 0.075, endRadius: 0.06, length: 0.42, center: [0, -0.21, 0] },
  { object: leftShin, shape: 'capsule', radius: 0.06, endRadius: 0.045, length: 0.42, center: [0, -0.21, 0] },
  // ...the right leg
],
cloths: [{ name: 'robe', bones: robeRoots, anchor: hips, connection: 'ring', colliders: [0, 1, 2, 3, 4] }],

// The rate can change while the robe moves.
cloth.system.setFrequency(120);`,
  },
  {
    slug: 'fringe-lamp',
    hasColliders: false,
    title: 'Fringe lamp',
    summary: 'Strands on a swinging, spinning lampshade: world and local inertia decide how much motion they keep.',
    description: [
      'World inertia scales how much of the lamp’s movement through the room reaches the strands; local inertia does the same for the spin. At 0 the fringe follows the lamp rigidly, at 1 it lags with its full weight.',
      'The angle limit stops strands from bending past 50 degrees at the tip. Teleport moves the lamp 90 cm at once: with teleport set to reset, the fringe restarts in place instead of flying across the room.',
    ],
    tags: ['chains', 'fringe', 'tassel', 'inertia', 'world inertia', 'local inertia', 'angle limit', 'teleport', 'spin'],
    facets: { connection: ['chains'], feature: ['inertia', 'limits', 'teleport', 'tuning'], level: ['intermediate'], runtime: ['main thread'] },
    controls: [
      { kind: 'range', key: 'worldInertia', label: 'World inertia', minimum: 0, maximum: 1, step: 0.05, initial: 1, timing: 'tuning' },
      { kind: 'range', key: 'localInertia', label: 'Local inertia', minimum: 0, maximum: 1, step: 0.05, initial: 1, timing: 'tuning' },
      { kind: 'range', key: 'spin', label: 'Spin', minimum: 0, maximum: 8, step: 0.5, initial: 2, unit: 'rad/s', timing: 'live' },
      { kind: 'switch', key: 'angleLimit', label: 'Angle limit', initial: true, timing: 'tuning' },
      { kind: 'action', key: 'teleport', label: 'Teleport' },
    ],
    code: `settings: {
  // 0 follows the lamp rigidly, 1 keeps all of its motion.
  inertia: { world: 1, local: 1, teleport: { mode: 'reset', distance: 0.5 } },
  angleLimit: { enabled: true, degrees: [0, 50] },
},`,
  },
  {
    slug: 'ribbon-baton',
    hasColliders: false,
    title: 'Ribbon baton',
    summary: 'Long ribbons on a twirling baton, pulled toward their rest shape by restoration and kept close by a maximum distance.',
    description: [
      'Restoration bends each ribbon back toward the shape it has in the animation. With none, the ribbons trail freely; with more, they keep their curl.',
      'A maximum distance keeps every particle within a set distance of its animated position, which is how a long ribbon is stopped from wrapping around the baton.',
    ],
    tags: ['chains', 'ribbon', 'streamer', 'restoration', 'max distance', 'motion constraint', 'twirl'],
    facets: { connection: ['chains'], feature: ['restoration', 'limits', 'tuning'], level: ['beginner'], runtime: ['main thread'] },
    controls: [
      { kind: 'range', key: 'restoration', label: 'Restoration', minimum: 0, maximum: 0.5, step: 0.02, initial: 0.2, timing: 'tuning' },
      { kind: 'range', key: 'maxDistance', label: 'Max distance (0 is off)', minimum: 0, maximum: 0.6, step: 0.02, initial: 0, unit: 'm', timing: 'tuning' },
      { kind: 'range', key: 'twirl', label: 'Twirl', minimum: 0, maximum: 10, step: 0.5, initial: 4, unit: 'rad/s', timing: 'live' },
      { ...GRAVITY, initial: 4 },
    ],
    code: `settings: {
  restoration: { enabled: true, stiffness: [0.2, 0.04] },
  maxDistance: { enabled: true, distance: 0.3 }, // { enabled: false } turns it off
},`,
  },
  {
    slug: 'banner-field',
    hasColliders: false,
    title: 'Field of banners',
    summary: 'Up to 48 small flags for scaling: compare precisions and let the quality controller hold a frame budget.',
    description: [
      'Every flag is its own cloth. Add flags until the physics cost passes the budget, and the quality controller lowers the simulation rate, then the steps per frame, and raises them again when there is room.',
      'Default precision runs 64-bit math without rounding, the fastest choice. Rounded precision rounds every operation to 32 bits, so a run repeats recorded results bit for bit, at a higher cost.',
    ],
    tags: ['nearest', 'flag', 'banner', 'performance', 'scaling', 'precision', 'rounding', 'auto rate', 'budget', 'quality'],
    facets: { connection: ['nearest'], feature: ['performance', 'wind'], level: ['advanced'], runtime: ['main thread'] },
    controls: [
      { kind: 'range', key: 'count', label: 'Flags', minimum: 1, maximum: 48, step: 1, initial: 12, timing: 'setup' },
      {
        kind: 'choice',
        key: 'precision',
        label: 'Precision',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'rounded', label: 'Rounded' },
        ],
        initial: 'default',
        timing: 'live',
      },
      { kind: 'switch', key: 'autoRate', label: 'Automatic rate', initial: true, timing: 'live' },
      { kind: 'range', key: 'budget', label: 'Physics budget', minimum: 1, maximum: 12, step: 0.5, initial: 6, unit: 'ms', timing: 'live' },
      { kind: 'range', key: 'wind', label: 'Wind', minimum: 0, maximum: 20, step: 1, initial: 8, unit: 'm/s²', timing: 'live' },
    ],
    code: `const system = cloth.system;

system.setPrecision('rounded');

// Keep physics within 6 ms a frame; the controller lowers the rate, then the steps, and restores them.
system.autoRate.enabled = true;
system.autoRate.budgetMs = 6;

const stop = system.onQualityChange((change) => console.info(change.level, change.reason));`,
  },
  {
    slug: 'fabric-lab',
    hasColliders: false,
    grabbable: 'ball',
    title: 'Fabric lab',
    summary: 'Silk, linen and felt side by side: one recipe, and every swatch with its own independent state.',
    description: [
      'Each swatch is the same component inside its own createContext provider from react-global-state-hooks. The provider gives it a private store, so its sliders, pause and reset touch only that swatch.',
      'Add a swatch and you get another independent store from the same recipe, even for the same fabric. Every slider retunes the running cloth with tuneCloth, so you can compare damping, stiffness and bending while they move.',
    ],
    tags: [
      'nearest',
      'fabric',
      'silk',
      'linen',
      'felt',
      'side by side',
      'compare',
      'createContext',
      'react-global-state-hooks',
      'independent state',
      'live tuning',
    ],
    facets: { connection: ['nearest'], feature: ['tuning', 'state', 'bending'], level: ['intermediate'], runtime: ['main thread'] },
    controls: [],
    code: `const FabricSwatchContext = createContext(swatchStateOf(SILK), {
  actions: {
    setValue({ key, value }) {
      return ({ setState }) => {
        setState((state) => ({ ...state, values: { ...state.values, [key]: value } }));
      };
    },
    reset() {
      return ({ setState }) => {
        setState((state) => ({ ...state, values: state.preset.values }));
      };
    },
  },
});

// One recipe, one store per provider.
{panels.map((panel) => (
  <FabricSwatchContext.Provider key={panel.id} value={swatchStateOf(panel.preset)}>
    <FabricSwatchPanel />
  </FabricSwatchContext.Provider>
))}`,
  },
  {
    slug: 'worker-wall',
    hasColliders: false,
    title: 'Cloth in a worker',
    summary: 'A wall of chains simulated in a Web Worker with easy-web-worker, drawn on the main thread.',
    description: [
      'The worker builds the scene with createClothScene and steps ClothSystem; it never loads three.js. Each frame it returns the particle positions as one Float32Array.',
      'Switch the simulation between the worker and the main thread and watch the main-thread time: in the worker, the page stays free for input and drawing.',
    ],
    tags: ['worker', 'web worker', 'easy-web-worker', 'thread', 'typed worker', 'createClothScene', 'without three.js', 'performance'],
    facets: { connection: ['chains'], feature: ['performance', 'workers'], level: ['advanced'], runtime: ['web worker'] },
    controls: [
      { kind: 'range', key: 'chains', label: 'Chains', minimum: 8, maximum: 160, step: 8, initial: 64, timing: 'setup' },
      {
        kind: 'choice',
        key: 'thread',
        label: 'Simulate in',
        options: [
          { value: 'worker', label: 'Worker' },
          { value: 'main', label: 'Main thread' },
        ],
        initial: 'worker',
        timing: 'setup',
      },
    ],
    code: `// wall.worker.ts
export const worker = defineWorker(() => ({
  start: (spec: WallSpec) => start(spec),
  step: (input: WallStep) => step(input), // the returned frame resolves the call
}));

export type WallWorker = typeof worker;

// main thread
const wall = createWorker<WallWorker>(wallWorkerUrl, { workerOptions: { type: 'module' } });

await wall.start({ chains: 64, links: 14 });
const positions = await wall.step({ deltaTime, time });`,
  },
];

export function findExample(slug: string): Example | undefined {
  return EXAMPLES.find((example) => example.slug === slug);
}
