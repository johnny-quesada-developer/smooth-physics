// Where the solver allocates: V8's sampling heap profiler, counting objects the collector already freed, over the
// timed frames of one synthetic scene. Prints kilobytes per frame for each function, largest first. --three runs the
// scene on three.js bones through ThreeClothAdapter, as an app does, instead of through the benchmark's pose driver.
// Usage: vpx bench/allocations.ts [--scene mannequin] [--size medium] [--precision rounded] [--three] [--frames 600] [--top 25]
import { Session } from 'node:inspector/promises';
import { parseArgs } from 'node:util';
import { ClothSystem } from '../src/cloth-system.ts';
import { buildScene, createDriver, type SceneKind, type SceneSize } from '../test/scenes.ts';
import { buildThreeScene } from '../test/three-scenes.ts';

type ProfileNode = {
  readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number };
  readonly selfSize: number;
  readonly children: readonly ProfileNode[];
};

const { values } = parseArgs({
  options: {
    scene: { type: 'string', default: 'mannequin' },
    size: { type: 'string', default: 'medium' },
    precision: { type: 'string', default: 'rounded' },
    three: { type: 'boolean', default: false },
    frames: { type: 'string', default: '600' },
    top: { type: 'string', default: '25' },
  },
});
const kinds: readonly SceneKind[] = ['mannequin', 'robe', 'chains', 'curtain'];
const sizes: readonly SceneSize[] = ['small', 'medium', 'large', 'xlarge'];
const kind = kinds.find((candidate) => candidate === values.scene);
const size = sizes.find((candidate) => candidate === values.size);
if (!kind || !size || (values.precision !== 'rounded' && values.precision !== 'default')) throw new Error('Unknown scene, size or precision.');

const precision = values.precision;
const frames = Number(values.frames);
const step = values.three ? threeStep({ kind, size }) : syntheticStep({ kind, size });
// The same 300 warm-up frames the benchmark runs before it starts timing.
for (let frame = 0; frame < 300; frame++) step(frame);

const session = new Session();
session.connect();
await session.post('HeapProfiler.startSampling', { samplingInterval: 1024, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
for (let frame = 300; frame < 300 + frames; frame++) step(frame);
const { profile } = await session.post('HeapProfiler.stopSampling');
session.disconnect();

const bytesBySite = new Map<string, number>();
const visit = (node: ProfileNode): void => {
  const { functionName, url, lineNumber } = node.callFrame;
  const site = `${functionName || '(anonymous)'} ${url.split('/').at(-1) ?? ''}:${lineNumber + 1}`;
  bytesBySite.set(site, (bytesBySite.get(site) ?? 0) + node.selfSize);
  for (const child of node.children) visit(child);
};
visit(profile.head);

const perFrame = (bytes: number): string => (bytes / 1024 / frames).toFixed(1).padStart(8);
console.info(
  `${perFrame([...bytesBySite.values()].reduce((sum, bytes) => sum + bytes, 0))} KB/frame in total (${values.three ? 'three.js ' : ''}${kind} ${size} ${precision})`,
);
for (const [site, bytes] of [...bytesBySite].sort((first, second) => second[1] - first[1]).slice(0, Number(values.top)))
  console.info(`${perFrame(bytes)} KB/frame ${site}`);

function syntheticStep({ kind, size }: { kind: SceneKind; size: SceneSize }): (frame: number) => void {
  const synthetic = buildScene({ kind, size });
  const driver = createDriver(synthetic);
  const system = ClothSystem.create({ scene: synthetic.scene });
  system.setPrecision(precision);
  return (frame) => {
    driver.advance(frame / 60);
    system.update({ frameDeltaTime: 1 / 60, pose: driver.pose });
  };
}

// The same frame as the benchmark's three.js cases: restore, animate, update.
function threeStep({ kind, size }: { kind: SceneKind; size: SceneSize }): (frame: number) => void {
  const scene = buildThreeScene({ kind, size });
  scene.adapter.system.setPrecision(precision);
  return (frame) => {
    scene.adapter.restore();
    scene.animate(frame / 60);
    scene.adapter.update({ deltaTime: 1 / 60, root: scene.root });
  };
}
